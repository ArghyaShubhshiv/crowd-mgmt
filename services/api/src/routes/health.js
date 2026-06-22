import { getPool } from '@crowd-mgmt/shared/db.js'

export default async function healthRoutes(fastify) {
  fastify.get('/health', async (request, reply) => {
    await getPool().query('SELECT 1')
    return { status: 'ok' }
  })
}