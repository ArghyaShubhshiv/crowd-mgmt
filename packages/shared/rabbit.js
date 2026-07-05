import 'dotenv/config'
import amqp from 'amqplib'

// cached
let connection = null;
let channel = null;

// exporting getChannel() function so callers don't manage the connection lifecycle.
export async function getChannel() {
  if (channel) return channel

  connection = await amqp.connect(process.env.RABBITMQ_URL)
  channel = await connection.createChannel()

  connection.on('error', (err) => {
    console.error('[RabbitMQ] Connection error:', err.message)
    channel = null
    connection = null
    // ideally should add exponential backoff
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