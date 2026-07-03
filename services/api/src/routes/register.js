import bcrypt from 'bcrypt'
import { getPool } from '@crowd-mgmt/shared/db.js'

const SALT_ROUNDS = 12

export default async function registerRoutes(fastify) {
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'username', 'password'],
        properties: {
          email:    { type: 'string', minLength: 3 },
          username: {type: 'string', minLength: 8},
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (request, reply) => {
    const {username, email, password } = request.body
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    try {
      const result = await getPool().query(
        `INSERT INTO users (email, username, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, email, created_at`,
        [email.toLowerCase(), username, passwordHash]
      )
      return reply.code(201).send({ user: result.rows[0] })
    } catch (err) {
      if (err.code === '23505') {
        const field = err.constraint === 'users_username_key' ? 'username' : 'email'
        return reply.code(409).send({
          error: 'Conflict',
          message: `An account with that ${field} already exists.`,
        })
      }
      request.log.error(err)
      throw err
    }
  })
}