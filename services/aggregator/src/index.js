import { kafka, redis } from '@crowd-mgmt/shared'
import { getPool } from '@crowd-mgmt/shared/db.js'

const WINDOW_MS     = 15_000    // Sliding window duration
const HEARTBEAT_MS  = 3_000     // force a Redis refresh at least this often for a stationary visitor, so they don't age out
const FLUSH_MS      = 1_000
const ZONE_TTL_MS   = 60_000    // re-fetch zone definitions from Postgres at most this often
const HISTORY_EVERY = 10        // persist a density snapshot to Postgres every Nth flush

const consumer = kafka.consumer({ groupId: 'aggregator' })

const localVisitorState = new Map()
const zones = new Map()
let samples = []

// write-reduction measurement: how many pings would have written vs. actually did
let pingsProcessed = 0   // pings that passed geofencing (a naive impl would write every one)
let redisWrites = 0      // pings that actually triggered a Redis write (with the L1 cache)

const zoneKey    = (eventSlug, zone) => `zone:${eventSlug}:${zone}`
const visitorKey = (eventSlug)       => `visitor_zone:${eventSlug}`
const zoneGeoCache = new Map()   // latest zone coordinates

async function getZonesForEvent(eventSlug) {
  const cached = zoneGeoCache.get(eventSlug)
  if (cached && Date.now() - cached.loadedAt < ZONE_TTL_MS) return cached.zones

  const { rows } = await getPool().query(
    `SELECT z.slug, z.center_lat, z.center_lng
       FROM zones z
       JOIN events e ON e.id = z.event_id
      WHERE e.slug = $1 AND z.center_lat IS NOT NULL`,
    [eventSlug]
  )
  zoneGeoCache.set(eventSlug, { zones: rows, loadedAt: Date.now() })
  return rows
}

function nearestZone(lat, lng, zoneList) {
  const cosLat = Math.cos((lat * Math.PI) / 180)
  let best = null, bestSq = Infinity
  for (const z of zoneList) {
    const dx = (z.center_lng - lng) * cosLat
    const dy = z.center_lat - lat
    const sq = dx * dx + dy * dy
    if (sq < bestSq) { bestSq = sq; best = z }
  }
  return best
}

async function persistHistory(rows) {
  const values = []
  const params = []
  rows.forEach((r, i) => {
    const b = i * 3
    values.push(`($${b + 1}, $${b + 2}, $${b + 3})`)
    params.push(r.eventSlug, r.zone, r.density)
  })
  try {
    await getPool().query(
      `INSERT INTO density_history (event_slug, zone_slug, density) VALUES ${values.join(', ')}`,
      params
    )
  } catch (e) {
    console.error('[Aggregator] history write failed:', e.message)
  }
}

const run = async () => {
  await consumer.connect()
  console.log('[Aggregator] Pipeline Connected')
  await consumer.subscribe({ topic: 'locations', fromBeginning: false })

  await consumer.run({
    maxWaitTimeInMs: 250,
    eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
      const pipeline = redis.pipeline()
      let queued = 0     // count ANY command queued into the pipeline, not just writes

      for (const message of batch.messages) {
        const { visitor_token, event_slug, lat, lng, server_ts } = JSON.parse(message.value.toString())
        if (lat == null || lng == null) continue

        samples.push(Date.now() - server_ts)

        const eventZones = await getZonesForEvent(event_slug)
        if (eventZones.length === 0) continue

        const nearest = nearestZone(lat, lng, eventZones)
        if (!nearest) continue
        const zone_id = nearest.slug

        pingsProcessed++   // reached the write-decision point; a naive impl would write here

        // count EVERY processed ping (mirrors the feeder's "sent"), before the write gate
        pipeline.hincrby(`received:${event_slug}`, zone_id, 1)
        queued++

        // ordering guard: ignore out-of-order pings
        const prevState = localVisitorState.get(visitor_token)
        if (prevState && server_ts <= prevState.ts) {
          resolveOffset(message.offset)
          continue
        }

        let requiresRedisWrite = false
        if (!prevState) {
          requiresRedisWrite = true
        } else if (prevState.zone !== zone_id) {
          pipeline.zrem(zoneKey(event_slug, prevState.zone), visitor_token)
          queued++
          requiresRedisWrite = true
        } else if (server_ts - prevState.last_redis_update > HEARTBEAT_MS) {
          requiresRedisWrite = true
        }

        if (requiresRedisWrite) {
          redisWrites++   // the L1 cache let this write through; everything else was skipped
          const now = Date.now()
          pipeline.zadd(zoneKey(event_slug, zone_id), now, visitor_token)
          pipeline.hset(visitorKey(event_slug), visitor_token, `${zone_id}|${now}`)
          queued += 2
          localVisitorState.set(visitor_token, {
            event_slug, zone: zone_id, ts: server_ts, last_redis_update: now,
          })
        } else {
          localVisitorState.set(visitor_token, {
            event_slug, zone: zone_id, ts: server_ts, last_redis_update: prevState.last_redis_update,
          })
        }

        zones.set(zoneKey(event_slug, zone_id), { eventSlug: event_slug, zone: zone_id })
        resolveOffset(message.offset)
      }

      // exec whenever ANYTHING was queued (received-counts included), not only on writes
      if (queued > 0) {
        await pipeline.exec()
      }
      await heartbeat()
    }
  })

  let flushTick = 0
  setInterval(async () => {
    const persist = (++flushTick % HISTORY_EVERY === 0)
    const snapshot = []

    for (const [key, { eventSlug, zone }] of zones) {
      const cutoff = Date.now() - WINDOW_MS
      await redis.zremrangebyscore(key, '-inf', `(${cutoff}`)
      const density = await redis.zcard(key)
      await redis.hset(`density:${eventSlug}`, zone, density)
      await redis.expire(key, 60)
      await redis.expire(`density:${eventSlug}`, 60)

      if (persist) snapshot.push({ eventSlug, zone, density })
    }

    for (const [token, state] of localVisitorState) {
      if (Date.now() - state.ts > WINDOW_MS * 2) {
        localVisitorState.delete(token)
      }
    }

    if (persist && snapshot.length) await persistHistory(snapshot)

    if (persist && samples.length) {
      samples.sort((a, b) => a - b)
      const p = (q) => samples[Math.floor(samples.length * q)]
      console.log(`[latency] n=${samples.length} p50=${p(0.5)}ms p95=${p(0.95)}ms p99=${p(0.99)}ms max=${samples[samples.length - 1]}ms`)
      samples = []
    }

    // write-reduction: how much the L1 cache cut Redis writes vs. writing every ping
    if (persist && pingsProcessed > 0) {
      const reduction  = (pingsProcessed / Math.max(redisWrites, 1)).toFixed(2)
      const skippedPct = (100 * (1 - redisWrites / pingsProcessed)).toFixed(1)
      console.log(`[write-reduction] processed=${pingsProcessed} writes=${redisWrites} -> ${reduction}x fewer writes (${skippedPct}% skipped)`)
      pingsProcessed = 0
      redisWrites = 0
    }
  }, FLUSH_MS)
}

run().catch((e) => { console.error('[Aggregator] fatal', e); process.exit(1) })