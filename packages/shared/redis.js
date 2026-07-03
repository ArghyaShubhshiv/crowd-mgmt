import 'dotenv/config'
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
})

redis.on('connect', () => console.log('[Redis] Connected'))
redis.on('error', (err) => console.error('[Redis] Error:', err.message))
redis.on('reconnecting', () => console.log('[Redis] Reconnecting...'))

export default redis