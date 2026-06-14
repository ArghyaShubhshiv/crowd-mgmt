const ORG = 'org_festival_a'
const URL = `ws://localhost:3002/locations?org_id=${ORG}`
const VISITORS = Number(process.argv[2]) || 50   // node feed.js 100  → 100 visitors

function spawnVisitor(i) {
  const token = `user_${Math.random().toString(36).slice(2, 10)}`
  // scatter starting points a little so they don't all begin in one zone
  let lat = 40.7128 + (Math.random() - 0.5) * 0.002
  let lng = -74.0060 + (Math.random() - 0.5) * 0.002

  const ws = new WebSocket(URL)
  ws.addEventListener('open', () => {
    setInterval(() => {
      lat += (Math.random() - 0.5) * 0.001
      lng += (Math.random() - 0.5) * 0.001
      let zone = 'zone_main_floor'
      if (lat > 40.713) zone = 'zone_vip_lounge'
      else if (lng < -74.007) zone = 'zone_entrance_lobby'
      ws.send(JSON.stringify({
        visitor_token: token,
        zone_id: zone,
        lat: +lat.toFixed(6),
        lng: +lng.toFixed(6),
        timestamp: Date.now()
      }))
    }, 1000)
  })
  ws.addEventListener('error', e => console.error(`visitor ${i}:`, e.message ?? e))
}

console.log(`Spawning ${VISITORS} visitors → ${URL}`)
for (let i = 0; i < VISITORS; i++) {
  setTimeout(() => spawnVisitor(i), i * 20)  // stagger connects so we don't open them all at once
}