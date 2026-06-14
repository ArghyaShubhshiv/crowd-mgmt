import Fastify from 'fastify'
import websocketPlugin from '@fastify/websocket'
import { kafka, redis } from '@crowd-mgmt/shared'

const producer = kafka.producer({ allowAutoTopicCreation: true })

const app = Fastify({ logger: true })
await app.register(websocketPlugin)

app.get('/locations', { websocket: true }, (socket, request) => {
  const orgId = request.query.org_id
  if (!orgId) { socket.close(1008, 'org_id is required'); return }

  const topic = `location.${orgId}`
  console.log(`[WS] Client connected → topic: ${topic}`)

  socket.on('message', async (rawMessage) => {
    let payload
    try {
      payload = JSON.parse(rawMessage.toString())
    } catch {
      console.warn('[WS] Malformed JSON — dropping frame')
      return
    }

    const { visitor_token, zone_id, lat, lng, timestamp } = payload
    if (!visitor_token || !zone_id || lat == null || lng == null) {
      console.warn('[WS] Missing required fields — dropping frame')
      return
    }

    await redis.setex(`presence:${orgId}:${visitor_token}`, 30, zone_id)

    await producer.send({
      topic,
      messages: [
        {
          // No key → Kafka distributes messages uniformly across partitions.
          // Density is aggregated statelessly in Redis (ZADD GT), so we don't
          // rely on per-partition ordering.
          value: JSON.stringify({
            visitor_token,
            org_id: orgId,
            zone_id,
            lat,
            lng,
            timestamp,
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