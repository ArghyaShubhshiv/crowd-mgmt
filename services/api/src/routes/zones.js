import { getPool } from '@crowd-mgmt/shared/db.js'

export default async function zoneRoutes(fastify) {
  fastify.post('/events/:eventId/zones', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['eventId'],
        properties: { eventId: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['name', 'slug', 'centerLat', 'centerLng'],
        properties: {
          name:              { type: 'string', minLength: 1 },
          slug:              { type: 'string', minLength: 1 },
          capacity:          { type: 'integer', minimum: 0 },
          warningThreshold:  { type: 'integer', minimum: 0, default: 5 },
          criticalThreshold: { type: 'integer', minimum: 0, default: 15 },
          centerLat:         { type: 'number', minimum: -90,  maximum: 90 },
          centerLng:         { type: 'number', minimum: -180, maximum: 180 },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.id
    if (!userId) return reply.code(401).send({ error: 'Unauthorized' })

    const { eventId } = request.params
    const { name, slug, capacity, warningThreshold, criticalThreshold, centerLat, centerLng } = request.body

    if (warningThreshold > criticalThreshold) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'warningThreshold must be ≤ criticalThreshold.',
      })
    }

    try {
      // hop 1: find the event's org
      const event = await getPool().query(`SELECT org_id FROM events WHERE id = $1`, [eventId])
      if (event.rowCount === 0) {
        return reply.code(404).send({ error: 'Not Found', message: 'Event not found.' })
      }
      const { org_id: orgId } = event.rows[0]

      // hop 2: authorize — owner of that org?
      const membership = await getPool().query(
        `SELECT role FROM memberships WHERE user_id = $1 AND org_id = $2`,
        [userId, orgId]
      )
      if (membership.rowCount === 0 || membership.rows[0].role !== 'owner') {
        return reply.code(403).send({ error: 'Forbidden', message: "You must be an owner of this event's org." })
      }

      // insert
      const result = await getPool().query(
        `INSERT INTO zones (event_id, name, slug, capacity, warning_threshold, critical_threshold, center_lat, center_lng)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, event_id, name, slug, capacity, warning_threshold, critical_threshold, center_lat, center_lng, created_at`,
        [eventId, name, slug, capacity ?? null, warningThreshold, criticalThreshold, centerLat, centerLng]
      )
      return reply.code(201).send({ zone: result.rows[0] })
    } catch (err) {
      if (err.code === '22P02') return reply.code(400).send({ error: 'Bad Request', message: 'Invalid id format.' })
      if (err.code === '23505') return reply.code(409).send({ error: 'Conflict', message: 'A zone with that slug already exists in this event.' })
      request.log.error(err)
      throw err
    }
  })
}