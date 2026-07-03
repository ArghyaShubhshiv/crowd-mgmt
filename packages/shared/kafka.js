import 'dotenv/config'
import { Kafka, logLevel } from 'kafkajs'

const kafka = new Kafka({
  clientId: 'crowd-mgmt',
  brokers: process.env.KAFKA_BROKERS.split(','),
  logLevel: logLevel.WARN,
  retry: {
    initialRetryTime: 300, 
    retries: 10        
  }
})

export default kafka