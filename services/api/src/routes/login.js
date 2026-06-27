import { getPool } from '@crowd-mgmt/shared/db.js'

export default async function loginRoutes(fastify){
    fastify.post('/login', {
        schema: {
            body: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: {
                        type: 'string',
                        format: 'email'
                    },
                    password: {
                        type: 'string'
                    }
                }
            }
        }
    }, async (request, reply) => {
        const {email, password} = request.body

        const rows = await getPool().query(
            'SELECT id, email, password_hash FROM users WHERE email = $1',
            [email.toLowerCase()]
        )

        const user = rows[0]

        if (!user || (await bcrypt.compare(password, password_hash))){
            await bcrypt.compare(password, process.env.DUMMY_HASH)
            return reply.code(401).send({error: 'invalid credentials'})
        }

        const token = await reply.jwtSign({id: user.id, email: user.email})
        return {token}
    })
}