import Fastify from 'fastify'
import websocketPlugin from '@fastify/websocket'
import { kafka, redis } from '@crowd-mgmt/shared'

const producer = kafka.producer({ allowAutoTopicCreation: true })

const app = Fastify({ logger: true })
await app.register(websocketPlugin)

app.get('/locations', { websocket: true }, (socket, request) => {
  const eventSlug = request.query.event_slug
  if (!eventSlug) { socket.close(1008, 'event_slug is required'); return }

  const topic = `locations`
  console.log(`[WS] Client connected → topic: ${topic}`)

  socket.on('message', async (rawMessage) => {
    let payload
    try {
      payload = JSON.parse(rawMessage.toString())
    } catch {
      console.warn('[WS] Malformed JSON — dropping frame')
      return
    }

    const { visitor_token, lat, lng, timestamp } = payload
    if (!visitor_token || lat == null || lng == null) {
      console.warn('[WS] Missing required fields — dropping frame')
      return
    }

    await redis.setex(`presence:${eventSlug}:${visitor_token}`, 30, '1')

    await producer.send({
      topic: 'locations',
      messages: [
        {
          key: eventSlug,                 // all of one event's pings → same partition (per-event order)
          value: JSON.stringify({
            visitor_token,
            event_slug: eventSlug,
            lat, lng, timestamp,
            server_ts: Date.now()
          })
        }
      ]
    })
  })

  socket.on('close', () => console.log(`[WS] Client disconnected from topic: ${topic}`))
  socket.on('error', (err) => console.error('[WS] Socket error:', err.message))
})

const shutdown = async (signal) => {
  console.log(`\n[WS] ${signal} received — shutting down gracefully`)
  await producer.disconnect()
  await app.close()
  process.exit(0)
}
process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

try {
  await producer.connect()
  console.log('[Kafka] Producer connected')
  await app.listen({ port: parseInt(process.env.WS_PORT ?? 3002), host: '0.0.0.0' })
} catch (err) {
  console.error('[WS] Failed to start:', err)
  process.exit(1)
}