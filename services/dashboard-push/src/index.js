import Fastify from 'fastify'
import websocketPlugin from '@fastify/websocket'
import { redis, getChannel } from '@crowd-mgmt/shared'

const app = Fastify({ logger: false })
await app.register(websocketPlugin)

const subscribers = new Map()   // eventSlug -> Set of sockets

function broadcast(eventSlug, message) {
  const sockets = subscribers.get(eventSlug)
  if (!sockets) return
  const payload = JSON.stringify(message)
  for (const socket of sockets) {
    if (socket.readyState === 1) socket.send(payload)
  }
}

app.get('/live', { websocket: true }, (socket, request) => {
  const eventSlug = request.query.event_slug
  if (!eventSlug) { socket.close(1008, 'event_slug is required'); return }
  if (!subscribers.has(eventSlug)) subscribers.set(eventSlug, new Set())
  subscribers.get(eventSlug).add(socket)
  console.log(`[Push] browser subscribed → ${eventSlug} (${subscribers.get(eventSlug).size} live)`)
  socket.on('close', () => subscribers.get(eventSlug)?.delete(socket))
})

// density: poll Redis every second, push to each event's browsers
setInterval(async () => {
  for (const [eventSlug, sockets] of subscribers) {
    if (sockets.size === 0) continue
    const densities = await redis.hgetall(`density:${eventSlug}`)
    broadcast(eventSlug, { type: 'density', event_slug: eventSlug, densities, ts: Date.now() })
  }
}, 1000)

// alerts: consume the priority queue, push each to that event's browsers
const channel = await getChannel()
await channel.assertExchange('alerts', 'topic', { durable: true })
await channel.assertQueue('alerts.dashboard', { durable: true, arguments: { 'x-max-priority': 10 } })
await channel.bindQueue('alerts.dashboard', 'alerts', 'alert.#')
await channel.prefetch(1)   // one at a time, so priority order is honoured
channel.consume('alerts.dashboard', (msg) => {
  if (!msg) return
  const alert = JSON.parse(msg.content.toString())
  broadcast(alert.event_slug, { type: 'alert', ...alert })
  console.log(`[Push] alert → ${alert.zone} ${alert.severity}`)
  channel.ack(msg)
})

await app.listen({ port: parseInt(process.env.DASHBOARD_PUSH_PORT ?? 4001), host: '0.0.0.0' })
console.log('[Push] listening on 4001')