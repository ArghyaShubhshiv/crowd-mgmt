import { useEffect, useState, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { API, SLUG } from '../config'

const ZONE_COLORS = ['#60a5fa', '#f472b6', '#fbbf24', '#34d399', '#a78bfa', '#fb7185']
const MAX_POINTS = 1000

// minutes = window, bucket = downsample size in seconds (keeps ~60-100 points per range)
const RANGES = [
  { label: '15m', minutes: 15,   bucket: 15 },
  { label: '1h',  minutes: 60,   bucket: 60 },
  { label: '6h',  minutes: 360,  bucket: 300 },
  { label: '12h', minutes: 720,  bucket: 600 },
  { label: '1d',  minutes: 1440, bucket: 900 },
  { label: '1w', minutes: 7*1440, bucket: 900}
]

// label granularity scales with the window: seconds → minutes → date+time
function makeFmt(range) {
  if (range.minutes <= 15) {
    return (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }
  if (range.minutes <= 360) {
    return (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function DensityGraph({ zones, densities }) {
  const [points, setPoints] = useState([])
  const [range, setRange]   = useState(RANGES[0])
  const seededRef = useRef(false)

  const zoneSlugs = zones ? [...zones.keys()] : []
  const fmtTime = makeFmt(range)

  // (re)seed from history whenever zones load OR the selected range changes
  useEffect(() => {
    if (!zones) return
    let cancelled = false
    seededRef.current = false

    const qs = `?minutes=${range.minutes}&bucket=${range.bucket}`
    fetch(`${API}/public/events/${SLUG}/history${qs}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const byTs = new Map()
        for (const row of data.points) {
          if (!byTs.has(row.ts)) byTs.set(row.ts, { t: new Date(row.ts).getTime() })
          byTs.get(row.ts)[row.zone_slug] = row.density
        }
        setPoints([...byTs.values()].sort((a, b) => a.t - b.t))
        seededRef.current = true
      })
      .catch(err => console.error('history fetch failed:', err))
    return () => { cancelled = true }
  }, [zones, range])

  // append live points (only on short ranges where 1s granularity reads cleanly)
  useEffect(() => {
    if (!zones || !seededRef.current) return
    if (Object.keys(densities).length === 0) return
    if (range.minutes > 60) return   // long views are bucketed history; don't append raw live points

    setPoints(prev => {
      const point = { t: Date.now() }
      for (const slug of zones.keys()) point[slug] = Number(densities[slug] ?? 0)
      let next = [...prev, point]
      const cutoff = Date.now() - range.minutes * 60_000
      next = next.filter(p => p.t >= cutoff)
      return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next
    })
  }, [densities, zones, range])

  if (!zones) return null

  return (
    <div className="graph">
      <div className="graph-head">
        <div className="graph-title">Density over time</div>
        <div className="range-buttons">
          {RANGES.map(r => (
            <button
              key={r.label}
              className={`range-btn ${r.label === range.label ? 'active' : ''}`}
              onClick={() => setRange(r)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="graph-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 10, right: 24, bottom: 6, left: -10 }}>
            <CartesianGrid stroke="#1f2329" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
              tickFormatter={fmtTime} stroke="#8a8f98" fontSize={11} minTickGap={70}
            />
            <YAxis stroke="#8a8f98" fontSize={11} allowDecimals={false} width={40} />
            <Tooltip
              labelFormatter={fmtTime}
              contentStyle={{ background: '#1a1d23', border: '1px solid #272b33', borderRadius: 8 }}
              labelStyle={{ color: '#8a8f98' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {zoneSlugs.map((slug, i) => (
              <Line
                key={slug} type="monotone" dataKey={slug}
                name={zones.get(slug)?.name ?? slug}
                stroke={ZONE_COLORS[i % ZONE_COLORS.length]}
                dot={false} isAnimationActive={false} strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}