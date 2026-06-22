import { redis, getChannel, closeConnection } from '@crowd-mgmt/shared'
import { getPool, closePool } from '@crowd-mgmt/shared/db.js'

const EXCHANGE    = 'alerts'
const QUEUE       = 'alerts.dashboard'
const CHECK_MS    = 1_000
const ZONE_TTL_MS = 60_000

const PRIORITY = { critical: 10, warning: 5, ok: 1 }

// --- per-event zone thresholds, cached from the DB ---
const thresholdCache = new Map()  // eventSlug -> { byZone: Map<slug,{warning,critical}>, loadedAt }

async function getZoneThresholds(eventSlug) {
  const cached = thresholdCache.get(eventSlug)
  if (cached && Date.now() - cached.loadedAt < ZONE_TTL_MS) return cached.byZone

  const { rows } = await getPool().query(
    `SELECT z.slug, z.warning_threshold, z.critical_threshold
       FROM zones z
       JOIN events e ON e.id = z.event_id
      WHERE e.slug = $1`,
    [eventSlug]
  )
  const byZone = new Map(
    rows.map((r) => [r.slug, { warning: r.warning_threshold, critical: r.critical_threshold }])
  )
  thresholdCache.set(eventSlug, { byZone, loadedAt: Date.now() })
  return byZone
}

function severityFor(count, zone) {
  if (!zone) return 'ok'                       // zone not in DB → don't alert
  if (count >= zone.critical) return 'critical'
  if (count >= zone.warning)  return 'warning'
  return 'ok'
}

const lastSeverity = new Map()   // `${eventSlug}:${zone}` -> last severity we published

const run = async () => {
  const channel = await getChannel()

  await channel.assertExchange(EXCHANGE, 'topic', { durable: true })
  await channel.assertQueue(QUEUE, { durable: true, arguments: { 'x-max-priority': 10 } })
  await channel.bindQueue(QUEUE, EXCHANGE, 'alert.#')
  console.log('[Alert] watching densities…')

  setInterval(async () => {
    const keys = await redis.keys('density:*')   // one hash per event

    for (const key of keys) {
      const eventSlug  = key.slice('density:'.length)
      const densities  = await redis.hgetall(key)
      const thresholds = await getZoneThresholds(eventSlug)

      for (const [zone, countStr] of Object.entries(densities)) {
        const count = Number(countStr)
        const sev   = severityFor(count, thresholds.get(zone))
        const id    = `${eventSlug}:${zone}`
        const prev  = lastSeverity.get(id) ?? 'ok'

        if (sev === prev) continue           // only fire on a CHANGE, not every tick
        lastSeverity.set(id, sev)

        const alert = {
          event_slug: eventSlug, zone, severity: sev, density: count, ts: Date.now(),
          message: sev === 'ok'
            ? `${zone} back to normal (${count})`
            : `${zone} is ${sev.toUpperCase()} — ${count} people`
        }
        const routingKey = `alert.${eventSlug}.${zone}.${sev}`

        channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(alert)), {
          priority: PRIORITY[sev], persistent: true, contentType: 'application/json'
        })
        console.log(`[Alert] ${routingKey}  (prio ${PRIORITY[sev]})  ${alert.message}`)
      }
    }
  }, CHECK_MS)
}

process.on('SIGINT', async () => {
  await closeConnection()
  await closePool()
  process.exit(0)
})
run().catch((e) => { console.error('[Alert] fatal', e); process.exit(1) })