import { getPool } from '@crowd-mgmt/shared/db.js'

export default async function eventStatusRoutes(fastify) {
  fastify.patch('/events/:slug/status', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['slug'],
        properties: { slug: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: ['draft', 'active', 'ended'] } },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.id
    const { slug } = request.params
    const { status } = request.body

    // owner-only: update succeeds only if this user is an owner of the event's org
    const { rows } = await getPool().query(
      `UPDATE events e
          SET status = $1, updated_at = now()
         FROM memberships m
        WHERE e.slug = $2
          AND m.org_id = e.org_id
          AND m.user_id = $3
          AND m.role = 'owner'
        RETURNING e.id, e.slug, e.status`,
      [status, slug, userId]
    )

    if (rows.length === 0) {
      return reply.code(404).send({ error: 'not found' })
    }
    return rows[0]
  })
}