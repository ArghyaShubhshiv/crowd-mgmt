import Redis from 'ioredis'
const EVENT_SLUG = process.argv[2] || 'summer-fest-2026'
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

async function sample() {
  const [sent, received] = await Promise.all([
    redis.hgetall(`sent:${EVENT_SLUG}`),
    redis.hgetall(`received:${EVENT_SLUG}`),
  ])
  const zones = Object.keys(sent)
  if (!zones.length) { console.log('waiting for data…'); return }

  console.clear()
  console.log(`\n=== Sent vs Received per zone (cumulative) — ${EVENT_SLUG} ===\n`)
  console.log('ZONE'.padEnd(14) + 'SENT'.padStart(10) + 'RECEIVED'.padStart(12) + 'ACCEPT%'.padStart(10))
  console.log('─'.repeat(46))

  const rates = []
  for (const z of zones) {
    const s = Number(sent[z] || 0)
    const r = Number(received[z] || 0)
    const rate = s > 0 ? r / s : 0
    rates.push(rate)
    console.log(z.padEnd(14) + String(s).padStart(10) + String(r).padStart(12) + (rate * 100).toFixed(1).padStart(9) + '%')
  }
  console.log('─'.repeat(46))

  const min = Math.min(...rates), max = Math.max(...rates)
  const spread = max - min
  console.log('')
  if (spread < 0.05) {
    console.log(`✅ FAIR: acceptance rates within ${(spread*100).toFixed(1)} pts across zones.`)
    console.log(`   → shedding drops all zones equally; no zone starved.`)
  } else {
    console.log(`❌ UNFAIR: acceptance rates differ by ${(spread*100).toFixed(1)} pts.`)
    console.log(`   → one zone's pings are dropped more than others.`)
  }
}
setInterval(sample, 1000)
sample()