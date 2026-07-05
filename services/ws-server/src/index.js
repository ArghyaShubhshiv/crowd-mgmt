import cluster from 'node:cluster'
import os from 'node:os'
import Fastify from 'fastify'
import websocketPlugin from '@fastify/websocket'
import { kafka } from '@crowd-mgmt/shared'

// -- Tuning parameters --
const BATCH_FLUSH_INTERVAL_MS = 1000   // flush the batch to Kafka once per second (fewer, larger sends)
const MAX_BATCH_SIZE = 15000           // load-shed cap: drop pings rather than let the buffer grow unbounded

// PRIMARY PROCESS: ensures the Kafka topic exists, forks workers
if (cluster.isPrimary) {
  console.log(`[Primary] ${process.pid} starting...`)

  // Create the topic exactly once, before any worker produces, so workers
  // don't race to create it (which would risk a 1-partition auto-created topic).
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

  // One worker per core (capped) — uses all cores instead of a single event loop.
  const numWorkers = Math.min(os.cpus().length, 4)
  for (let i = 0; i < numWorkers; i++) cluster.fork()

  // Restart a worker if it dies, so the tier self-heals.
  cluster.on('exit', (worker) => {
    console.warn(`[Primary] Worker ${worker.process.pid} died — restarting`)
    cluster.fork()
  })
}

// WORKER PROCESS: WebSocket ingest → Kafka (no Redis dependency)
else {
  const producer = kafka.producer()
  const app = Fastify()
  await app.register(websocketPlugin)

  // -- Worker state --
  let kafkaBatch = []
  let dropped = 0
  let activeFlushPromise = null   // in-flight Kafka send, tracked for graceful shutdown

  // -- Background flusher: send the whole batch to Kafka on an interval --
  const flushInterval = setInterval(() => {
    // skip if nothing to send, or if the previous flush is still in flight
    if (kafkaBatch.length === 0 || activeFlushPromise) return

    // swap the array out immediately so incoming pings accumulate into a fresh one
    const messagesToSend = kafkaBatch
    kafkaBatch = []

    activeFlushPromise = producer.send({ topic: 'locations', messages: messagesToSend })
      .catch((err) => console.error(`[Worker ${process.pid}] Kafka batch send failed:`, err.message))
      .finally(() => { activeFlushPromise = null })
  }, BATCH_FLUSH_INTERVAL_MS)

  // WebSocket route: the hot path does NO awaited work 
  app.get('/locations', { websocket: true }, (socket, request) => {
    const eventSlug = request.query.event_slug
    if (!eventSlug) { socket.close(1008, 'event_slug is required'); return }

    socket.on('message', (rawMessage) => {
      // load-shed first: if the buffer is at the cap, drop before doing any work
      if (kafkaBatch.length >= MAX_BATCH_SIZE) {
        dropped++
        return
      }

      let payload
      try {
        payload = JSON.parse(rawMessage.toString())
      } catch {
        return   // ignore malformed frames quietly under load
      }

      const { visitor_token, lat, lng, timestamp } = payload
      if (!visitor_token || lat == null || lng == null) return

      // synchronous push — no await, so handler invocations can't pile up in the heap
      kafkaBatch.push({
        key: visitor_token,   // high-cardinality: spreads across partitions, keeps a visitor's pings ordered
        value: JSON.stringify({
          visitor_token,
          event_slug: eventSlug,
          lat,
          lng,
          timestamp,
          server_ts: Date.now(),
        }),
      })
    })

    socket.on('error', (err) => console.error(`[Worker ${process.pid}] Socket error:`, err.message))
  })

  // Report shed load (stays 0 under normal operation)
  setInterval(() => {
    if (dropped > 0) {
      console.log(`[Worker ${process.pid}] load-shed: dropped ${dropped} pings in last 5s`)
      dropped = 0
    }
  }, 5000)

  // Graceful shutdown: finish the in-flight flush, then flush the remainder 
  const shutdown = async (signal) => {
    console.log(`\n[Worker ${process.pid}] ${signal} received — shutting down`)
    clearInterval(flushInterval)

    if (activeFlushPromise) await activeFlushPromise
    if (kafkaBatch.length > 0) {
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

  // -- Startup --
  try {
    await producer.connect()
    console.log(`[Worker ${process.pid}] Kafka producer connected`)

    // cluster shares this port across all workers; the OS distributes connections.
    const port = parseInt(process.env.WS_PORT ?? 3002)
    await app.listen({ port, host: '0.0.0.0' })
    console.log(`[Worker ${process.pid}] Listening on ${port}`)
  } catch (err) {
    console.error(`[Worker ${process.pid}] Failed to start:`, err)
    process.exit(1)
  }
}