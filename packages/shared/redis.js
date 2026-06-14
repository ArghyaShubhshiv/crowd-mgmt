import 'dotenv/config'
import Redis from 'ioredis'

// ioredis automatically reconnects on failure — you don't need to handle that.
// But you DO need to handle the 'error' event, otherwise Node throws
// an unhandled exception and crashes your process.
const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  // If a single command fails 3 times, reject its promise.
  // Without this, a command waits forever if Redis is down.
  enableReadyCheck: true,
  // ioredis waits for Redis to finish loading (e.g. after restart)
  // before sending commands. Prevents "LOADING Redis is loading" errors.
  lazyConnect: false,
  // Connect immediately when this module is imported,
  // not on the first command. Fail fast if Redis is unreachable.
})

redis.on('connect',   () => console.log('[Redis] Connected'))
redis.on('error',     (err) => console.error('[Redis] Error:', err.message))
redis.on('reconnecting', () => console.log('[Redis] Reconnecting...'))

export default redis