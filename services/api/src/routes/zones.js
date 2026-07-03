import { getPool } from '@crowd-mgmt/shared/db.js'

export default async function zoneRoutes(fastify) {
  fastify.post('/events/:slug/zones', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['slug'],
        properties: { slug: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['name', 'slug', 'centerLat', 'centerLng'],
        properties: {
          name:              { type: 'string', minLength: 1 },
          slug:              { type: 'string', pattern: '^[a-z0-9-]+$' },
          centerLat:         { type: 'number', minimum: -90,  maximum: 90 },
          centerLng:         { type: 'number', minimum: -180, maximum: 180 },
          warningThreshold:  { type: 'integer', minimum: 0, default: 50 },
          criticalThreshold: { type: 'integer', minimum: 0, default: 120 },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.id
    const { slug: eventSlug } = request.params
    const {
      name, slug,
      centerLat, centerLng,
      warningThreshold, criticalThreshold,
    } = request.body

    if (warningThreshold > criticalThreshold) {
      return reply.code(400).send({ error: 'warning threshold must be ≤ critical threshold' })
    }

    // find the event by slug AND verify the caller owns its org, in one query
    const evt = await getPool().query(
      `SELECT e.id
         FROM events e
         JOIN memberships m ON m.org_id = e.org_id
        WHERE e.slug = $1 AND m.user_id = $2 AND m.role = 'owner'`,
      [eventSlug, userId]
    )
    if (evt.rows.length === 0) {
      return reply.code(404).send({ error: 'not found' })   // unknown event or not owner
    }
    const eventId = evt.rows[0].id

    try {
      const { rows } = await getPool().query(
        `INSERT INTO zones
           (event_id, name, slug, center_lat, center_lng, warning_threshold, critical_threshold)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, slug, center_lat, center_lng, warning_threshold, critical_threshold`,
        [eventId, name, slug, centerLat, centerLng, warningThreshold, criticalThreshold]
      )
      return reply.code(201).send({ zone: rows[0] })
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'a zone with that slug already exists for this event' })
      }
      if (err.code === '22P02') {
        return reply.code(400).send({ error: 'invalid value' })
      }
      throw err
    }
  })
}