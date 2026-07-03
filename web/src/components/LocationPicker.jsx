import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// fix Leaflet's default marker icons (they break under bundlers like Vite)
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
const icon = L.icon({
  iconUrl: markerIcon, shadowUrl: markerShadow,
  iconSize: [25, 41], iconAnchor: [12, 41],
})

export default function LocationPicker({ lat, lng, onPick, center = [28.6139, 77.2090] }) {
  const mapRef    = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    const map = L.map('picker-map').setView(
      lat != null && lng != null ? [lat, lng] : center, 14
    )
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map)
    mapRef.current = map

    // if a coordinate already exists, show its marker
    if (lat != null && lng != null) {
      markerRef.current = L.marker([lat, lng], { icon }).addTo(map)
    }

    // click → move/create the marker and report the coords up
    map.on('click', (e) => {
      const { lat, lng } = e.latlng
      if (markerRef.current) markerRef.current.setLatLng([lat, lng])
      else markerRef.current = L.marker([lat, lng], { icon }).addTo(map)
      onPick(Number(lat.toFixed(6)), Number(lng.toFixed(6)))
    })

    return () => { map.remove(); mapRef.current = null; markerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div id="picker-map" style={{ height: 280, borderRadius: 10, overflow: 'hidden' }} />
}