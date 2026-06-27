import { getPool } from '@crowd-mgmt/shared/db.js'

export default async function publicZoneRoutes(app) {
  // Public read for the live map: zone centers + thresholds. No auth —
  // mirrors the unauthenticated dashboard. Scope per-tenant in production.
  app.get('/public/events/:slug/zones', {
    schema: {
      params: {
        type: 'object',
        required: ['slug'],
        properties: { slug: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    const { slug } = request.params
    const { rows } = await getPool().query(
      `SELECT z.slug, z.name, z.center_lat, z.center_lng,
              z.warning_threshold, z.critical_threshold, z.capacity
         FROM zones z
         JOIN events e ON e.id = z.event_id
        WHERE e.slug = $1 AND e.status = 'active'
        ORDER BY z.slug`,
      [slug]
    )

    if (rows.length == 0){
      return reply.code(404).send({error: 'not found'});
    }

    return { event_slug: slug, zones: rows }
  })
}