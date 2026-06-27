import { kafka, redis } from '@crowd-mgmt/shared'
import { getPool } from '@crowd-mgmt/shared/db.js'

const WINDOW_MS     = 10_000
const FLUSH_MS      = 1_000
const ZONE_TTL_MS   = 60_000
const HISTORY_EVERY = 10        // persist a snapshot every 10th flush (~10s)

const consumer = kafka.consumer({ groupId: 'aggregator' })

const zones = new Map()                                       // zoneKey -> { eventSlug, zone }
const zoneKey    = (eventSlug, zone) => `zone:${eventSlug}:${zone}`
const visitorKey = (eventSlug)       => `visitor_zone:${eventSlug}`

const zoneGeoCache = new Map()  // eventSlug -> { zones, loadedAt }

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

// Batched, fault-isolated history write. Never let a DB error kill the pipeline.
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
    console.error('[Aggregator] history write failed (live pipeline unaffected):', e.message)
  }
}

const run = async () => {
  await consumer.connect()
  console.log('[Aggregator] connected')
  await consumer.subscribe({ topic: 'locations', fromBeginning: false })

  await consumer.run({
    eachMessage: async ({ message }) => {
      const { visitor_token, event_slug, lat, lng, server_ts } = JSON.parse(message.value.toString())

      if (lat == null || lng == null) return

      const eventZones = await getZonesForEvent(event_slug)
      if (eventZones.length === 0) return
      const nearest = nearestZone(lat, lng, eventZones)
      if (!nearest) return
      const zone_id = nearest.slug

      const raw = await redis.hget(visitorKey(event_slug), visitor_token)
      let prevZone = null, prevTs = 0
      if (raw) {
        const [z, t] = raw.split('|')
        prevZone = z
        prevTs = Number(t)
      }

      if (server_ts <= prevTs) return

      if (prevZone && prevZone !== zone_id) {
        await redis.zrem(zoneKey(event_slug, prevZone), visitor_token)
      }

      await redis.zadd(zoneKey(event_slug, zone_id), server_ts, visitor_token)
      await redis.hset(visitorKey(event_slug), visitor_token, `${zone_id}|${server_ts}`)

      zones.set(zoneKey(event_slug, zone_id), { eventSlug: event_slug, zone: zone_id })
    }
  })

  let flushTick = 0
  setInterval(async () => {
    const cutoff  = Date.now() - WINDOW_MS
    const persist = (++flushTick % HISTORY_EVERY === 0)
    const snapshot = []

    for (const [key, { eventSlug, zone }] of zones) {
      await redis.zremrangebyscore(key, '-inf', `(${cutoff}`)
      const density = await redis.zcard(key)
      await redis.hset(`density:${eventSlug}`, zone, density)
      if (persist) snapshot.push({ eventSlug, zone, density })
      console.log(`[Aggregator] ${eventSlug} / ${zone} → ${density}`)
    }

    if (persist && snapshot.length) await persistHistory(snapshot)
  }, FLUSH_MS)
}

run().catch((e) => { console.error('[Aggregator] fatal', e); process.exit(1) })