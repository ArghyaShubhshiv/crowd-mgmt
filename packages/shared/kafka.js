import 'dotenv/config'
import { Kafka, logLevel } from 'kafkajs'

// We create the Kafka instance once and export it.
// Every service that imports this gets the same configured client —
// they just call .producer() or .consumer() on it themselves.
const kafka = new Kafka({
  clientId: 'crowd-mgmt',
  brokers: process.env.KAFKA_BROKERS.split(','),
  // KAFKA_BROKERS=localhost:9092 in .env
  // .split(',') future-proofs it for multiple brokers: "broker1:9092,broker2:9092"
  logLevel: logLevel.WARN,
  // KafkaJS logs a lot of INFO noise by default. WARN keeps your terminal clean.
  // Switch to logLevel.DEBUG when something breaks and you need to trace it.
  retry: {
    initialRetryTime: 300,  // ms before first retry
    retries: 10             // total attempts before giving up
    // This handles the race condition where your Node process starts
    // before Kafka is fully ready — it'll keep retrying instead of crashing.
  }
})

export default kafka