import { getPool } from '@crowd-mgmt/shared/db.js'

export default async function publicHistoryRoutes(fastify) {
  fastify.get('/public/events/:slug/history', {
    schema: {
      params: { type: 'object', required: ['slug'],
                properties: { slug: { type: 'string' } } },
      querystring: {
        type: 'object',
        properties: {
          minutes: { type: 'integer', minimum: 1 },
          bucket:  { type: 'integer', minimum: 1 },   // seconds; omit = raw rows
        },
      },
    },
  }, async (request) => {
    const { slug } = request.params
    const { minutes, bucket } = request.query

    const params = [slug]
    let where = 'event_slug = $1'
    if (minutes != null) {
      params.push(minutes)
      where += ` AND ts > now() - make_interval(mins => $${params.length})`
    }

    // bucketed: snap each ts to its bucket start, average density per zone per bucket
    if (bucket != null) {
      params.push(bucket)
      const b = `$${params.length}`
      const { rows } = await getPool().query(
        `SELECT
            to_timestamp(floor(extract(epoch from ts) / ${b}) * ${b}) AS ts,
            zone_slug,
            round(avg(density))::int AS density
           FROM density_history
          WHERE ${where}
          GROUP BY 1, zone_slug
          ORDER BY 1`,
        params
      )
      return { event_slug: slug, points: rows }
    }

    // raw
    const { rows } = await getPool().query(
      `SELECT zone_slug, density, ts
         FROM density_history
        WHERE ${where}
        ORDER BY ts ASC`,
      params
    )
    return { event_slug: slug, points: rows }
  })
}