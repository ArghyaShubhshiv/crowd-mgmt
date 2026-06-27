import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { COLORS, severityFor } from '../lib/severity'

export default function DensityMap({ zones, densities }) {
  const mapRef     = useRef(null)
  const circlesRef = useRef(new Map())

  // build map + circles once, when zone metadata first arrives
  useEffect(() => {
    if (!zones || mapRef.current) return

    const list = [...zones.values()]
    const lat = list.reduce((s, z) => s + z.center_lat, 0) / list.length
    const lng = list.reduce((s, z) => s + z.center_lng, 0) / list.length

    const map = L.map('map').setView([lat, lng], 16)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map)
    mapRef.current = map

    for (const z of list) {
      const circle = L.circle([z.center_lat, z.center_lng], {
        radius: 50, color: COLORS.ok, fillColor: COLORS.ok, fillOpacity: 0.35, weight: 2,
      }).addTo(map)
      circle.bindTooltip(`${z.name}: 0`, { permanent: true, direction: 'top' })
      circlesRef.current.set(z.slug, circle)
    }

    return () => { map.remove(); mapRef.current = null; circlesRef.current.clear() }
  }, [zones])

  // restyle circles whenever live density changes
  useEffect(() => {
    if (!zones) return
    for (const [slug, circle] of circlesRef.current) {
      const count = Number(densities[slug] ?? 0)
      const zone  = zones.get(slug)
      const sev   = severityFor(count, zone)
      const color = COLORS[sev]
      circle.setStyle({ color, fillColor: color })
      circle.setRadius(45 + count)
      circle.setTooltipContent(`${zone?.name ?? slug}: ${count}`)
      circle.getElement()?.classList.toggle('pulse', sev === 'critical')
    }
  }, [densities, zones])

  return <div id="map" />
}