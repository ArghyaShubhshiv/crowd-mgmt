import { getPool } from '@crowd-mgmt/shared/db.js'

export default async function publicHistoryRoutes(app) {
  app.get('/public/events/:slug/history', {
    schema: {
      params: { type: 'object', required: ['slug'],
                properties: { slug: { type: 'string' } } },
      querystring: {
        type: 'object',
        properties: { minutes: { type: 'integer', minimum: 1, maximum: 1440, default: 30 } },
      },
    },
  }, async (request) => {
    const { slug } = request.params
    const { minutes } = request.query
    const { rows } = await getPool().query(
      `SELECT zone_slug, density, ts
         FROM density_history
        WHERE event_slug = $1
          AND ts > now() - make_interval(mins => $2)
        ORDER BY ts ASC`,
      [slug, minutes]
    )
    return { event_slug: slug, points: rows }
  })
}