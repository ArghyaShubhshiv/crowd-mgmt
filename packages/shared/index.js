import 'dotenv/config'
export { default as kafka } from './kafka.js'
export { default as redis } from './redis.js'
export { getChannel, closeConnection } from './rabbit.js'