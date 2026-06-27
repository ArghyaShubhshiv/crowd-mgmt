import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'

export default fp(async function authPlugin(fastify){
    fastify.register(fastifyJwt ,{
        secret: process.env.JWT_SECRET,
        sign: {expiresIn: '7d'}
    })

    fastify.decorate('authenticate', async function (request, reply){
        try {
            await request.jwtVerify()
        } catch {
            return reply.code(401).send({error: 'unauthorized'})
        }
    })
})