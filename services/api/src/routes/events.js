import {getPool} from "@crowd-mgmt/shared/db.js"
import { format } from "mysql2"

export default async function eventRoutes(fastify){
    fastify.post('/orgs/:orgId/events', {
        preHandler: [fastify.authenticate],
        schema: {
            params: {
                type: 'object',
                required: ['orgId'],
                properties: {
                    'orgId': {
                        type: 'string'
                    }
                }
            },
            body: {
                type: 'object',
                required: ['name', 'slug'],
                properties: {
                    name:     { type: 'string', minLength: 1 },
                    slug:     { type: 'string', minLength: 1 },
                    startsAt: { type: 'string', format: 'date-time'},
                    endsAt:   { type: 'string', format: 'date-time'},
                }
            }
        }
    }, async (request, reply) => {
        const userId = request.user.id
        if (!userId){
            return reply.code(401).send({message: "No user object sent."});
        }

        const {orgId} = request.params;
        const {name, slug, startsAt, endsAt} = request.body;

        if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)){
            return reply.code(400).send({
                error: "Bad request.",
                message: "End date must be after start date!"
            });
        }

        try {
            const membership = await getPool().query(
                'SELECT role FROM memberships WHERE user_id=$1 AND org_id=$2',
                [userId, orgId]
            )

            if (membership.rowCount === 0 || membership.rows[0].role !== 'owner') {
                return reply.code(403).send(
                    { 
                        error: 'Forbidden', 
                        message: 'You must be an owner of this org.' 
                    }
                )
            }

            const result = await getPool().query(
                'INSERT INTO events(org_id, name, slug, starts_at, ends_at) VALUES($1, $2, $3, $4, $5) RETURNING org_id, name, slug, starts_at, ends_at',
                [orgId, name, slug, startsAt ?? null, endsAt ?? null]
            )

            return reply.code(201).send(result.rows[0]);
        }
        catch (err){
            if (err.code === '22P02') return reply.code(400).send({ error: 'Bad Request', message: 'Invalid id format.' })
            if (err.code === '23505') return reply.code(409).send({ error: 'Conflict', message: 'That event slug is already taken.' })
            request.log.error(err)
            throw err
        }
    })
}