import { getPool } from '@crowd-mgmt/shared/db.js'

export default async function memberRoutes(fastify) {
  // ---- list members of an org (any member of the org can view) ----
  fastify.get('/orgs/:orgId/members', {
    preHandler: [fastify.authenticate],
    schema: {
      params: { type: 'object', required: ['orgId'],
                properties: { orgId: { type: 'string', format: 'uuid' } } },
    },
  }, async (request, reply) => {
    const userId = request.user.id
    const { orgId } = request.params

    // caller must belong to this org
    const me = await getPool().query(
      'SELECT 1 FROM memberships WHERE user_id = $1 AND org_id = $2',
      [userId, orgId]
    )
    if (me.rowCount === 0) return reply.code(404).send({ error: 'not found' })

    const { rows } = await getPool().query(
      `SELECT u.id, u.email, u.username, m.role
         FROM memberships m
         JOIN users u ON u.id = m.user_id
        WHERE m.org_id = $1
        ORDER BY m.role, u.username`,
      [orgId]
    )
    return { members: rows }
  })

  // ---- add an existing user to an org by email (owner-only) ----
  fastify.post('/orgs/:orgId/members', {
    preHandler: [fastify.authenticate],
    schema: {
      params: { type: 'object', required: ['orgId'],
                properties: { orgId: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['email', 'role'],
        properties: {
          email: { type: 'string', format: 'email' },
          role:  { type: 'string', enum: ['owner', 'member'] },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.id
    const { orgId } = request.params
    const { email, role } = request.body

    // authz: caller must be an OWNER of this org
    const owner = await getPool().query(
      `SELECT 1 FROM memberships WHERE user_id = $1 AND org_id = $2 AND role = 'owner'`,
      [userId, orgId]
    )
    if (owner.rowCount === 0) {
      return reply.code(403).send({ error: 'only owners can add members' })
    }

    // find the user being added
    const target = await getPool().query(
      'SELECT id, email, username FROM users WHERE email = $1',
      [email.toLowerCase()]
    )
    if (target.rowCount === 0) {
      return reply.code(404).send({ error: 'no user with that email — they must sign up first' })
    }
    const targetUser = target.rows[0]

    try {
      await getPool().query(
        'INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, $3)',
        [targetUser.id, orgId, role]
      )
    } catch (err) {
      if (err.code === '23505') {   // UNIQUE(user_id, org_id) — already a member
        return reply.code(409).send({ error: 'that user is already a member of this org' })
      }
      throw err
    }

    return reply.code(201).send({
      member: { id: targetUser.id, email: targetUser.email, username: targetUser.username, role },
    })
  })
}