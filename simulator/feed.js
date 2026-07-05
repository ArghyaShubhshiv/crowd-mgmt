import Redis from 'ioredis'

const EVENT_SLUG = 'summer-fest-2026'
const URL = `ws://localhost:3002/locations?event_slug=${EVENT_SLUG}`
const VISITORS = Number(process.argv[2]) || 60

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

// centers MUST match the DB zone centers the aggregator geofences against
const CENTERS = [
  { name: 'main-stage', center_lat: 28.6139, center_lng: 77.2090 },
  { name: 'food-court', center_lat: 28.6155, center_lng: 77.2120 },
  { name: 'north-gate', center_lat: 28.6170, center_lng: 77.2095 },
]
const JITTER = 0.0003
const PING_MS = 1000

// each zone's pull oscillates on its own period/phase so peaks stagger
const WAVES = [
  { base: 0.3, amp: 0.7, periodSec: 40, phase: 0 },
  { base: 0.4, amp: 0.4, periodSec: 55, phase: Math.PI / 2 },
  { base: 0.3, amp: 0.5, periodSec: 30, phase: Math.PI },
]

// SAME nearest-zone rule the aggregator uses — so "sent" and "received"
// classify zones identically, and any difference is purely drops, not attribution.
function nearestZone(lat, lng, zoneList) {
  const cosLat = Math.cos((lat * Math.PI) / 180)
  let best = null, bestSq = Infinity
  for (const z of zoneList) {
    const dx = (z.center_lng - lng) * cosLat
    const dy = z.center_lat - lat
    const sq = dx * dx + dy * dy
    if (sq < bestSq) { bestSq = sq; best = z }
  }
  return best
}

const assignment = new Array(VISITORS).fill(0)      // visitor idx -> zone idx
const sockets   = new Array(VISITORS).fill(null)    // visitor idx -> ws (or null if down)
const tokens    = Array.from({ length: VISITORS }, () =>
  `user_${Math.random().toString(36).slice(2, 10)}`)

// local running tally of pings SENT per zone; flushed to Redis each tick
const sentCounts = {}
for (const c of CENTERS) sentCounts[c.name] = 0

function targets(tSec) {
  const w = WAVES.map(x => Math.max(0, x.base + x.amp * Math.sin((2 * Math.PI * tSec) / x.periodSec + x.phase)))
  const sum = w.reduce((a, b) => a + b, 0) || 1
  const raw = w.map(x => (x / sum) * VISITORS)
  const t = raw.map(Math.floor)
  let rem = VISITORS - t.reduce((a, b) => a + b, 0)
  const order = raw.map((v, j) => [v - Math.floor(v), j]).sort((a, b) => b[0] - a[0])
  for (let k = 0; k < rem; k++) t[order[k][1]]++
  return t
}

function rebalance(tSec) {
  const target = targets(tSec)
  const counts = [0, 0, 0]
  for (const z of assignment) counts[z]++
  let moves = Math.max(1, Math.round(VISITORS * 0.08))
  for (let z = 0; z < CENTERS.length && moves > 0; z++) {
    while (counts[z] > target[z] && moves > 0) {
      const to = counts.findIndex((c, j) => c < target[j])
      if (to === -1) break
      const i = assignment.findIndex(a => a === z)
      assignment[i] = to
      counts[z]--; counts[to]++; moves--
    }
  }
}

function connect(i) {
  const ws = new WebSocket(URL)
  ws.addEventListener('open',  () => { sockets[i] = ws })
  ws.addEventListener('close', () => {
    sockets[i] = null
    setTimeout(() => connect(i), 1000 + Math.random() * 2000)   // auto-reconnect
  })
  ws.addEventListener('error', () => { try { ws.close() } catch {} })
}

// ── ONE shared ping loop for ALL visitors (not N timers) ──
let sent = 0
setInterval(() => {
  for (let i = 0; i < VISITORS; i++) {
    const ws = sockets[i]
    if (!ws || ws.readyState !== 1) continue   // skip if not open
    const home = CENTERS[assignment[i]]
    const lat = home.center_lat + (Math.random() - 0.5) * 2 * JITTER
    const lng = home.center_lng + (Math.random() - 0.5) * 2 * JITTER
    try {
      ws.send(JSON.stringify({
        visitor_token: tokens[i],
        lat: +lat.toFixed(6),
        lng: +lng.toFixed(6),
        timestamp: Date.now(),
      }))
      sent++
      // count SENT by the SAME geofencing rule the pipeline uses
      const zone = nearestZone(lat, lng, CENTERS)
      sentCounts[zone.name]++
    } catch { /* socket hiccup; skip this tick */ }
  }
}, PING_MS)

// ── connect visitors gradually so we don't open N sockets at once ──
console.log(`Spawning ${VISITORS} visitors → ${URL}`)
for (let i = 0; i < VISITORS; i++) setTimeout(() => connect(i), i * 5)

// ── director + throughput report + flush sent-counters to Redis every 2s ──
const t0 = Date.now()
setInterval(() => {
  const tSec = (Date.now() - t0) / 1000
  rebalance(tSec)

  const counts = [0, 0, 0]
  for (const z of assignment) counts[z]++

  // flush cumulative sent-per-zone to Redis (running totals via hincrby),
  // then reset the local tally for the next interval
  const pipe = redis.pipeline()
  for (const name of Object.keys(sentCounts)) {
    if (sentCounts[name] > 0) {
      pipe.hincrby(`sent:${EVENT_SLUG}`, name, sentCounts[name])
      sentCounts[name] = 0
    }
  }
  pipe.exec().catch(e => console.error('[sent] flush failed:', e.message))

  const live = sockets.filter(s => s && s.readyState === 1).length
  console.log(
    `[feed] t=${tSec.toFixed(0)}s  live=${live}/${VISITORS}  sent≈${(sent / 2).toFixed(0)}/s  ` +
    CENTERS.map((c, j) => `${c.name}:${counts[j]}`).join('  ')
  )
  sent = 0
}, 2000)