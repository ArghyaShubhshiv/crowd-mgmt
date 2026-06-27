import { getPool } from '@crowd-mgmt/shared/db.js'

export default async function orgRoutes(fastify) {
  fastify.post('/orgs', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 1 } },
      },
    },
  }, async (request, reply) => {
    // TEMP until auth exists: real value will come from request.user.id (the verified token)
    const userId = request.user.id
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' })

    const { name } = request.body
    const client = await getPool().connect()
    try {
      await client.query('BEGIN')

      const orgResult = await client.query(
        `INSERT INTO orgs (name) VALUES ($1) RETURNING id, name, created_at`,
        [name]
      )
      const org = orgResult.rows[0]

      await client.query(
        `INSERT INTO memberships (user_id, org_id, role)
         VALUES ($1, $2, 'owner')`,
        [userId, org.id]
      )

      await client.query('COMMIT')
      return reply.code(201).send({ org, role: 'owner' })
    } catch (err) {
      await client.query('ROLLBACK')
      request.log.error(err)
      throw err
    } finally {
      client.release()
    }
  })
}