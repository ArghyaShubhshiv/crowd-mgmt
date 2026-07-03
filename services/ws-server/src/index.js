import cluster from 'node:cluster'
import os from 'node:os'
import Fastify from 'fastify'
import websocketPlugin from '@fastify/websocket'
import { kafka, redis } from '@crowd-mgmt/shared'

// ── Tuning Parameters ──
const BATCH_FLUSH_INTERVAL_MS = 1000  // Flush to Kafka once per second (allows larger batches, less CPU overhead)
const MAX_BATCH_SIZE = 15000          // Safety cap to prevent OOM if Kafka goes down completely
const PRESENCE_TTL_MS = 15000         // How often to hit Redis per unique visitor

// ==========================================
// PRIMARY PROCESS: Handles Topic Creation & Forking
// ==========================================
if (cluster.isPrimary) {
  console.log(`[Primary] Master ${process.pid} is starting...`)

  // 1. Ensure Kafka Topic Exists EXACTLY ONCE
  const admin = kafka.admin()
  await admin.connect()
  const existing = await admin.listTopics()
  if (!existing.includes('locations')) {
    await admin.createTopics({
      topics: [{ topic: 'locations', numPartitions: 6, replicationFactor: 1 }],
    })
    console.log('[Primary] Created Kafka topic "locations" with 6 partitions')
  } else {
    console.log('[Primary] Kafka topic "locations" already exists')
  }
  await admin.disconnect()

  // 2. Fork Workers (Scale across CPU cores to handle 8000+ per second)
  const numWorkers = Math.min(os.cpus().length, 4) // Adjust based on your server
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork()
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[Primary] Worker ${worker.process.pid} died. Restarting...`)
    cluster.fork()
  })

} 
// ==========================================
// WORKER PROCESS: Handles WebSockets & Ingestion
// ==========================================
else {
  const producer = kafka.producer()
  const app = Fastify()
  await app.register(websocketPlugin)

  // ── Worker State ──
  let kafkaBatch = []
  let dropped = 0
  let activeFlushPromise = null     // Tracks in-flight Kafka sends for graceful shutdown
  const presenceCache = new Map()   // Tracks last Redis update per visitor_token

  // ── Background Kafka Flusher ──
  const flushInterval = setInterval(() => {
    if (kafkaBatch.length === 0 || activeFlushPromise) return

    // Swap the array immediately to free up the ingestion path
    const messagesToSend = kafkaBatch
    kafkaBatch = []

    activeFlushPromise = producer.send({
      topic: 'locations',
      messages: messagesToSend,
    }).catch((err) => {
      console.error(`[Worker ${process.pid}] Kafka batch send failed:`, err.message)
    }).finally(() => {
      activeFlushPromise = null // Clear tracker when done
    })
  }, BATCH_FLUSH_INTERVAL_MS)

  // ── Memory Cleanup Interval ──
  // Prevents the presenceCache Map from growing infinitely if visitors leave
  setInterval(() => {
    const now = Date.now()
    for (const [token, lastSeen] of presenceCache.entries()) {
      if (now - lastSeen > PRESENCE_TTL_MS * 2) {
        presenceCache.delete(token)
      }
    }
  }, 60000)

  // ── WebSocket Route ──
  app.get('/locations', { websocket: true }, (socket, request) => {
    const eventSlug = request.query.event_slug
    if (!eventSlug) { socket.close(1008, 'event_slug is required'); return }

    socket.on('message', (rawMessage) => {
      // 1. Extreme Safety Cap: Only drops if Kafka dies and the array hits 15,000
      if (kafkaBatch.length >= MAX_BATCH_SIZE) {
        dropped++
        return
      }

      // 2. Synchronous Parsing
      let payload
      try {
        payload = JSON.parse(rawMessage.toString())
      } catch {
        return // Ignore malformed frames quietly under high load
      }

      const { visitor_token, lat, lng, timestamp } = payload
      if (!visitor_token || lat == null || lng == null) return

      const now = Date.now()

      // 3. Debounced Redis Presence (Fire-and-Forget, NO AWAIT)
      const lastPresence = presenceCache.get(visitor_token) || 0
      if (now - lastPresence > PRESENCE_TTL_MS) {
        presenceCache.set(visitor_token, now)
        
        redis.setex(`presence:${eventSlug}:${visitor_token}`, 30, '1').catch(err => {
          // Log softly to prevent console I/O blocking
          console.error(`[Worker ${process.pid}] Redis error:`, err.message)
        })
      }

      // 4. Synchronous Batching (NO AWAIT)
      kafkaBatch.push({
        key: visitor_token, 
        value: JSON.stringify({
          visitor_token,
          event_slug: eventSlug,
          lat, 
          lng, 
          timestamp,
          server_ts: now,
        }),
      })
    })
    
    socket.on('error', (err) => console.error(`[Worker ${process.pid}] Socket error:`, err.message))
  })

  // Periodically report shed load (should remain 0 during normal operation)
  setInterval(() => {
    if (dropped > 0) {
      console.log(`[Worker ${process.pid}] load-shedding triggered: dropped ${dropped} pings in last 5s`)
      dropped = 0
    }
  }, 5000)

  // ── Graceful Shutdown (Race-Condition Free) ──
  const shutdown = async (signal) => {
    console.log(`\n[Worker ${process.pid}] ${signal} received — shutting down gracefully`)
    clearInterval(flushInterval)
    
    // 1. Wait for any currently executing background flush to finish
    if (activeFlushPromise) {
      console.log(`[Worker ${process.pid}] Waiting for in-flight Kafka flush to complete...`)
      await activeFlushPromise
    }

    // 2. Flush whatever accumulated in the array AFTER the last interval fired
    if (kafkaBatch.length > 0) {
      console.log(`[Worker ${process.pid}] Flushing ${kafkaBatch.length} remaining messages...`)
      try {
        await producer.send({ topic: 'locations', messages: kafkaBatch })
      } catch (err) {
        console.error(`[Worker ${process.pid}] Final flush failed:`, err.message)
      }
    }

    await producer.disconnect()
    await app.close()
    process.exit(0)
  }
  
  process.on('SIGINT',  () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  // ── Startup ──
  try {
    await producer.connect()
    console.log(`[Worker ${process.pid}] Kafka Producer connected`)
    
    // Node.js cluster natively shares this port across all worker forks.
    // Incoming WS connections are automatically load-balanced across the cores.
    await app.listen({ port: parseInt(process.env.WS_PORT ?? 3002), host: '0.0.0.0' })
    console.log(`[Worker ${process.pid}] Listening on port ${process.env.WS_PORT ?? 3002}`)
  } catch (err) {
    console.error(`[Worker ${process.pid}] Failed to start:`, err)
    process.exit(1)
  }
}