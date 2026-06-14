import { redis, getChannel, closeConnection } from '@crowd-mgmt/shared'

const EXCHANGE = 'alerts'
const QUEUE    = 'alerts.dashboard'
const CHECK_MS = 1_000

function severityOf(count) {
  if (count >= 15) return 'critical'
  if (count >= 5)  return 'warning'
  return 'ok'
}
const PRIORITY = { critical: 10, warning: 5, ok: 1 }

const lastSeverity = new Map()   // `${org}:${zone}` -> last severity we published

const run = async () => {
  const channel = await getChannel()

  // Topic exchange for all alerts; a priority queue so critical jumps the line.
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true })
  await channel.assertQueue(QUEUE, { durable: true, arguments: { 'x-max-priority': 10 } })
  await channel.bindQueue(QUEUE, EXCHANGE, 'alert.#')   // catch every alert
  console.log('[Alert] watching densities…')

  setInterval(async () => {
    const keys = await redis.keys('density:*')   // one hash per org

    for (const key of keys) {
      const org = key.slice('density:'.length)
      const densities = await redis.hgetall(key)

      for (const [zone, countStr] of Object.entries(densities)) {
        const count = Number(countStr)
        const sev   = severityOf(count)
        const id    = `${org}:${zone}`
        const prev  = lastSeverity.get(id) ?? 'ok'

        if (sev === prev) continue           // only fire on a CHANGE, not every tick
        lastSeverity.set(id, sev)

        const alert = {
          org_id: org, zone, severity: sev, density: count, ts: Date.now(),
          message: sev === 'ok'
            ? `${zone} back to normal (${count})`
            : `${zone} is ${sev.toUpperCase()} — ${count} people`
        }
        const routingKey = `alert.${org}.${zone}.${sev}`

        channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(alert)), {
          priority: PRIORITY[sev], persistent: true, contentType: 'application/json'
        })
        console.log(`[Alert] ${routingKey}  (prio ${PRIORITY[sev]})  ${alert.message}`)
      }
    }
  }, CHECK_MS)
}

process.on('SIGINT', async () => { await closeConnection(); process.exit(0) })
run().catch((e) => { console.error('[Alert] fatal', e); process.exit(1) })