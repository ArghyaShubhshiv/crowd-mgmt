import 'dotenv/config'
import amqp from 'amqplib'

let connection = null
let channel = null   

// RabbitMQ connections are expensive to create — one per process is the pattern.
// Channels are cheap — you can create multiple per connection.
// We export a getChannel() function so callers don't manage the connection lifecycle.
export async function getChannel() {
  if (channel) return channel
  // Already connected — return the cached channel.

  connection = await amqp.connect(process.env.RABBITMQ_URL)
  channel = await connection.createChannel()

  connection.on('error', (err) => {
    console.error('[RabbitMQ] Connection error:', err.message)
    channel = null
    connection = null
    // Null them out so the next getChannel() call reconnects.
    // In production you'd add exponential backoff here.
  })

  connection.on('close', () => {
    console.warn('[RabbitMQ] Connection closed')
    channel = null
    connection = null
  })

  console.log('[RabbitMQ] Connected')
  return channel
}

export async function closeConnection() {
  try { await channel?.close() } catch {}
  try { await connection?.close() } catch {}
  channel = null
  connection = null
}