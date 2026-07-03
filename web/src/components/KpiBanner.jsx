import { COLORS, severityFor } from '../lib/severity'

export default function KpiBanner({ zones, densities }) {
  if (!zones) return null

  let total = 0, active = 0, busiest = null
  for (const [slug, zone] of zones) {
    const count = Number(densities[slug] ?? 0)
    total += count
    if (count > 0) active++
    if (!busiest || count > busiest.count) {
      busiest = { name: zone.name ?? slug, count, severity: severityFor(count, zone) }
    }
  }

  return (
    <div className="kpis">
      <Kpi label="Total People: " value={total} />
      <Kpi label="Active Zones: " value={<>{active}<span className="kpi-sub"> / {zones.size}</span></>} />
      <Kpi
        label="Busiest Zone: "
        value={busiest && busiest.count > 0 ? `${busiest.name} (${busiest.count})` : '—'}
        color={busiest && busiest.count > 0 ? COLORS[busiest.severity] : undefined}
      />
    </div>
  )
}

function Kpi({ label, value, color }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value" style={color ? { color } : undefined}>{value}</span>
    </div>
  )
}