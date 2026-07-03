import { getPool } from '@crowd-mgmt/shared/db.js'

export default async function myOrgRoutes(app) {
  // every org the logged-in user is a member of, + their role + event count
  app.get('/orgs', {
    preHandler: [app.authenticate],
  }, async (request) => {
    const userId = request.user.id
    const { rows } = await getPool().query(
      `SELECT o.id, o.name, m.role,
              COUNT(e.id)::int AS event_count
         FROM memberships m
         JOIN orgs o   ON o.id = m.org_id
         LEFT JOIN events e ON e.org_id = o.id
        WHERE m.user_id = $1
        GROUP BY o.id, o.name, m.role
        ORDER BY o.name`,
      [userId]
    )
    return { orgs: rows }
  })
}