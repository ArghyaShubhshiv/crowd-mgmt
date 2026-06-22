import Fastify from 'fastify'
import healthRoutes from '../src/routes/health.js'
import { closePool } from '@crowd-mgmt/shared/db.js'
import registerRoutes from './routes/register.js'
import orgRoutes from './routes/orgs.js'
import eventRoutes from './routes/events.js'
import addFormats from 'ajv-formats'
import zoneRoutes from './routes/zones.js'

const fastify = Fastify({
  logger: true,
  ajv: {
    plugins: [addFormats],
  }
})

fastify.register(healthRoutes)
fastify.register(registerRoutes)
fastify.register(orgRoutes)
fastify.register(eventRoutes)
fastify.register(zoneRoutes)

const start = async () => {
  try {
    const port = Number(process.env.API_PORT) || 3001
    await fastify.listen({ port, host: '0.0.0.0' })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()

const shutdown = async () => {
  await fastify.close()
  await closePool()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)