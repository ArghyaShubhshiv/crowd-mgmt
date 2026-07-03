import Fastify from 'fastify'
import healthRoutes from '../src/routes/health.js'
import { closePool } from '@crowd-mgmt/shared/db.js'
import registerRoutes from './routes/register.js'
import orgRoutes from './routes/orgs.js'
import eventRoutes from './routes/events.js'
import addFormats from 'ajv-formats'
import zoneRoutes from './routes/zones.js'
import cors from '@fastify/cors'
import publicZoneRoutes from './routes/publicZones.js'
import authPlugin from './routes/auth.js'
import publicHistoryRoutes from './routes/publicHistory.js'
import myOrgRoutes from './routes/myOrgs.js'
import orgEventRoutes from './routes/orgEvents.js'
import loginRoutes from './routes/login.js'
import eventStatusRoutes from './routes/eventStatus.js'
import memberRoutes from './routes/members.js'

const fastify = Fastify({
  logger: true,
  ajv: {
    plugins: [addFormats],
  }
})

await fastify.register(publicHistoryRoutes)
await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
})
await fastify.register(authPlugin) 
await fastify.register(eventStatusRoutes)
await fastify.register(myOrgRoutes)
await fastify.register(orgEventRoutes)
await fastify.register(healthRoutes)
await fastify.register(memberRoutes)
await fastify.register(registerRoutes)
await fastify.register(loginRoutes)
await fastify.register(orgRoutes)
await fastify.register(eventRoutes)
await fastify.register(zoneRoutes)
await fastify.register(publicZoneRoutes)         // public — no authenticate

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