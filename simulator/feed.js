const EVENT_SLUG = 'summer-fest-2026'
const URL = `ws://localhost:3002/locations?event_slug=${EVENT_SLUG}`
const VISITORS = Number(process.argv[2]) || 60

const CENTERS = [
  { name: 'main-stage', lat: 28.6139, lng: 77.2090 },
  { name: 'food-court', lat: 28.6155, lng: 77.2120 },
  { name: 'north-gate', lat: 28.6170, lng: 77.2095 },
]
const JITTER = 0.0003

// each zone's pull oscillates on its own period/phase so the peaks stagger
const WAVES = [
  { base: 0.3, amp: 0.7, periodSec: 40, phase: 0 },           // main-stage: big swings
  { base: 0.4, amp: 0.4, periodSec: 55, phase: Math.PI / 2 }, // food-court: steadier
  { base: 0.3, amp: 0.5, periodSec: 30, phase: Math.PI },     // north-gate: quick swings
]

const assignment = new Array(VISITORS).fill(0)   // visitor index -> zone index

function targets(tSec) {
  const w = WAVES.map(x => Math.max(0, x.base + x.amp * Math.sin((2 * Math.PI * tSec) / x.periodSec + x.phase)))
  const sum = w.reduce((a, b) => a + b, 0) || 1
  const raw = w.map(x => (x / sum) * VISITORS)
  const t = raw.map(Math.floor)
  let rem = VISITORS - t.reduce((a, b) => a + b, 0)
  const order = raw.map((v, j) => [v - Math.floor(v), j]).sort((a, b) => b[0] - a[0])
  for (let k = 0; k < rem; k++) t[order[k][1]]++   // hand out rounding remainder
  return t
}

function rebalance(tSec) {
  const target = targets(tSec)
  const counts = [0, 0, 0]
  for (const z of assignment) counts[z]++
  let moves = Math.max(1, Math.round(VISITORS * 0.08))   // ~8% migrate per tick → smooth
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

function spawnVisitor(i) {
  const token = `user_${Math.random().toString(36).slice(2, 10)}`
  const ws = new WebSocket(URL)
  ws.addEventListener('open', () => {
    setInterval(() => {
      const home = CENTERS[assignment[i]]
      const lat = home.lat + (Math.random() - 0.5) * 2 * JITTER
      const lng = home.lng + (Math.random() - 0.5) * 2 * JITTER
      ws.send(JSON.stringify({
        visitor_token: token,
        lat: +lat.toFixed(6),
        lng: +lng.toFixed(6),
        timestamp: Date.now(),
      }))
    }, 1000)
  })
  ws.addEventListener('error', e => console.error(`visitor ${i}:`, e.message ?? e))
}

console.log(`Spawning ${VISITORS} dynamic visitors → ${URL}`)
for (let i = 0; i < VISITORS; i++) setTimeout(() => spawnVisitor(i), i * 20)

// director: every 2s nudge the crowd toward the time-varying targets
const t0 = Date.now()
setInterval(() => {
  const tSec = (Date.now() - t0) / 1000
  rebalance(tSec)
  const counts = [0, 0, 0]
  for (const z of assignment) counts[z]++
  console.log(`[feed] t=${tSec.toFixed(0)}s  ` + CENTERS.map((c, j) => `${c.name}:${counts[j]}`).join('   '))
}, 2000)