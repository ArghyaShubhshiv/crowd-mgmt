import { getPool } from '@crowd-mgmt/shared/db.js'

export default async function orgEventRoutes(app) {
  // events for one org — but only if the caller belongs to that org
  app.get('/orgs/:orgId/events', {
    preHandler: [app.authenticate],
    schema: {
      params: { type: 'object', required: ['orgId'],
                properties: { orgId: { type: 'string', format: 'uuid' } } },
    },
  }, async (request, reply) => {
    const userId = request.user.id
    const { orgId } = request.params

    // authz: is this user a member of this org?
    const member = await getPool().query(
      'SELECT 1 FROM memberships WHERE user_id = $1 AND org_id = $2',
      [userId, orgId]
    )
    if (member.rowCount === 0) {
      return reply.code(404).send({ error: 'not found' })   // uniform 404, no enumeration
    }

    const org = await getPool().query('SELECT id, name FROM orgs WHERE id = $1', [orgId])
    const { rows } = await getPool().query(
      `SELECT e.id, e.name, e.slug, e.status, e.starts_at, e.ends_at,
              COUNT(z.id)::int AS zone_count
         FROM events e
         LEFT JOIN zones z ON z.event_id = e.id
        WHERE e.org_id = $1
        GROUP BY e.id
        ORDER BY e.created_at DESC`,
      [orgId]
    )
    return { org: org.rows[0], events: rows }
  })
}