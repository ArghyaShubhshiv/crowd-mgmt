import bcrypt from 'bcrypt'
import { getPool } from '@crowd-mgmt/shared/db.js'

export default async function loginRoutes(fastify) {
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body

    const { rows } = await getPool().query(             // ← destructure .rows
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()]
    )
    const user = rows[0]

    // reject if no user OR the password does NOT match
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {  // ← !(…) and user.password_hash
      return reply.code(401).send({ error: 'invalid credentials' })
    }

    const token = await reply.jwtSign({ id: user.id, email: user.email })
    return { token }
  })
}