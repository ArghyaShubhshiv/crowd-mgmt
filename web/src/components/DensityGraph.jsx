import { useEffect, useState, useRef } from 'react'
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { API, SLUG } from '../config'

const ZONE_COLORS = ['#60a5fa', '#f472b6', '#fbbf24', '#34d399', '#a78bfa', '#fb7185']
const MAX_POINTS = 1000

// label → minutes (null = "Max", fetch everything)
const RANGES = [
    { label: '15m', minutes: 15 },
    { label: '1h',  minutes: 60 },
    { label: '12h', minutes: 720 },
]

const fmtTime = (t) =>
    new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export default function DensityGraph({ zones, densities }) {
    const [points, setPoints] = useState([])
    const [range, setRange]   = useState(RANGES[0])   // default 15m
    const seededRef = useRef(false)

    const zoneSlugs = zones ? [...zones.keys()] : []

  // (re)seed from history whenever zones load OR the selected range changes
    useEffect(() => {
        if (!zones) return
        let cancelled = false
        seededRef.current = false                       // pause live-append during refetch

        const qs = range.minutes == null ? '' : `?minutes=${range.minutes}`
        fetch(`${API}/public/events/${SLUG}/history${qs}`)
            .then(r => r.json())
            .then(data => {
                if (cancelled) return
                const byTs = new Map()
                for (const row of data.points) {
                    if (!byTs.has(row.ts)) 
                        byTs.set(row.ts, { t: new Date(row.ts).getTime() })

                    byTs.get(row.ts)[row.zone_slug] = row.density
                }
                setPoints([...byTs.values()].sort((a, b) => a.t - b.t))
                seededRef.current = true
            })
            .catch(err => console.error('history fetch failed:', err))
        return () => { cancelled = true }
    }, [zones, range])

  // append live points (only after a seed, and trimmed to the window)
    useEffect(() => {
    if (!zones || !seededRef.current) return
    if (Object.keys(densities).length === 0) return

    setPoints(prev => {
        const point = { t: Date.now() }

        for (const slug of zones.keys()) 
            point[slug] = Number(densities[slug] ?? 0)

        let next = [...prev, point]
        // drop points older than the window so the live view doesn't grow past the range
        if (range.minutes != null) {
            const cutoff = Date.now() - range.minutes * 60_000
            next = next.filter(p => p.t >= cutoff)
        }
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
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={points} margin={{ top: 8, right: 20, bottom: 4, left: -10 }}>
          <CartesianGrid stroke="#272b33" strokeDasharray="3 3" />
          <XAxis
            dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
            tickFormatter={fmtTime} stroke="#8a8f98" fontSize={11} minTickGap={50}
          />
          <YAxis stroke="#8a8f98" fontSize={11} allowDecimals={false} />
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
  )
}