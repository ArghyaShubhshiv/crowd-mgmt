import { kafka, redis } from '@crowd-mgmt/shared'

const WINDOW_MS = 10_000   // counts as "present" if seen within 10s (catches people who leave)
const FLUSH_MS  = 1_000

const consumer = kafka.consumer({ groupId: 'aggregator' })

const zones = new Map()                         // zoneKey -> { org, zone }, so flush knows what to recompute
const zoneKey    = (org, zone) => `zone:${org}:${zone}`
const visitorKey = (org)       => `visitor_zone:${org}`

const run = async () => {
  await consumer.connect()
  console.log('[Aggregator] connected')
  await consumer.subscribe({ topic: /^location\./, fromBeginning: false })

  await consumer.run({
    eachMessage: async ({ message }) => {
      const { visitor_token, org_id, zone_id, server_ts } =
        JSON.parse(message.value.toString())

      // Where was this visitor last seen, and when? Stored as "zone|timestamp".
      const raw = await redis.hget(visitorKey(org_id), visitor_token)
      let prevZone = null, prevTs = 0
      if (raw) { const [z, t] = raw.split('|'); prevZone = z; prevTs = Number(t) }

      // Out-of-order guard: only the newest ping per visitor counts.
      if (server_ts <= prevTs) return

      // Changed zones → remove from the old one immediately, so a visitor
      // lives in exactly ONE zone's set (their latest).
      if (prevZone && prevZone !== zone_id) {
        await redis.zrem(zoneKey(org_id, prevZone), visitor_token)
      }

      // Mark present in current zone; remember zone+time for next ping.
      await redis.zadd(zoneKey(org_id, zone_id), server_ts, visitor_token)
      await redis.hset(visitorKey(org_id), visitor_token, `${zone_id}|${server_ts}`)

      zones.set(zoneKey(org_id, zone_id), { org: org_id, zone: zone_id })
    }
  })

  // Every second: evict people who left entirely (stopped pinging), count, publish.
  setInterval(async () => {
    const cutoff = Date.now() - WINDOW_MS
    for (const [key, { org, zone }] of zones) {
      await redis.zremrangebyscore(key, '-inf', `(${cutoff}`)
      const density = await redis.zcard(key)
      await redis.hset(`density:${org}`, zone, density)
      console.log(`[Aggregator] ${org} / ${zone} → ${density}`)
    }
  }, FLUSH_MS)
}

run().catch((e) => { console.error('[Aggregator] fatal', e); process.exit(1) })