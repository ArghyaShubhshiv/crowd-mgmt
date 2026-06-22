import bcrypt from 'bcrypt'
import { getPool } from '@crowd-mgmt/shared/db.js'

const SALT_ROUNDS = 12

export default async function registerRoutes(fastify) {
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', minLength: 3 },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    try {
      const result = await getPool().query(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email, created_at`,
        [email.toLowerCase(), passwordHash]
      )
      return reply.code(201).send({ user: result.rows[0] })
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'An account with that email already exists.',
        })
      }
      request.log.error(err)
      throw err
    }
  })
}