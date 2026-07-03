import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api'
import LocationPicker from '../components/LocationPicker'

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
}
const blankZone = () => ({
  name: '', slug: '', centerLat: '', centerLng: '',
  warningThreshold: 50, criticalThreshold: 120, slugEdited: false,
})

export default function CreateZones() {
  const { slug: eventSlug } = useParams()
  const nav = useNavigate()
  const [zones, setZones] = useState([blankZone()])
  const [picking, setPicking] = useState(null)   // index of the zone being placed, or null
  const [error, setError] = useState(null)
  const [busy, setBusy]   = useState(false)

  function update(i, key, value) {
    setZones(zs => zs.map((z, idx) => {
      if (idx !== i) return z
      const next = { ...z, [key]: value }
      if (key === 'name' && !z.slugEdited) next.slug = slugify(value)
      if (key === 'slug') next.slugEdited = true
      return next
    }))
  }
  function setCoords(i, lat, lng) {
    setZones(zs => zs.map((z, idx) => idx === i ? { ...z, centerLat: lat, centerLng: lng } : z))
  }
  const addZone = () => setZones(zs => [...zs, blankZone()])
  const removeZone = (i) => setZones(zs => zs.filter((_, idx) => idx !== i))

  async function submit(e) {
    e.preventDefault()
    setError(null); setBusy(true)
    try {
      for (const z of zones) {
        if (z.centerLat === '' || z.centerLng === '') throw new Error(`Zone "${z.name}": pick a location on the map`)
        if (Number(z.warningThreshold) > Number(z.criticalThreshold)) throw new Error(`Zone "${z.name}": warning must be ≤ critical`)
        await api.post(`/events/${eventSlug}/zones`, {
          name: z.name, slug: z.slug,
          centerLat: Number(z.centerLat), centerLng: Number(z.centerLng),
          warningThreshold: Number(z.warningThreshold),
          criticalThreshold: Number(z.criticalThreshold),
        })
      }
      nav(-1)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const current = picking != null ? zones[picking] : null

  return (
    <div className="auth-wrap">
      <form className="auth-card" style={{ maxWidth: 620 }} onSubmit={submit}>
        <Link className="back-link" to="/app">← Back</Link>
        <h1 className="auth-title">Add zones — {eventSlug}</h1>

        {zones.map((z, i) => (
          <div key={i} className="zone-block">
            <div className="zone-block-head">
              <span>Zone {i + 1}</span>
              {zones.length > 1 && (
                <button type="button" className="btn-sm ghost" onClick={() => removeZone(i)}>Remove</button>
              )}
            </div>
            <div className="zone-grid">
              <label className="auth-field"><span>Name</span>
                <input value={z.name} onChange={e => update(i, 'name', e.target.value)} required /></label>
              <label className="auth-field"><span>Slug</span>
                <input value={z.slug} onChange={e => update(i, 'slug', e.target.value)} required pattern="[a-z0-9\-]+" /></label>
              <label className="auth-field"><span>Warning threshold</span>
                <input type="number" min="0" value={z.warningThreshold} onChange={e => update(i, 'warningThreshold', e.target.value)} required /></label>
              <label className="auth-field"><span>Critical threshold</span>
                <input type="number" min="0" value={z.criticalThreshold} onChange={e => update(i, 'criticalThreshold', e.target.value)} required /></label>
            </div>

            <div className="zone-loc">
              <span className="zone-loc-text">
                {z.centerLat !== '' ? `📍 ${z.centerLat}, ${z.centerLng}` : 'No location set'}
              </span>
              <button type="button" className="btn-sm" onClick={() => setPicking(i)}>
                {z.centerLat !== '' ? 'Change on map' : '📍 Set on map'}
              </button>
            </div>
          </div>
        ))}

        <button type="button" className="btn-ghost" onClick={addZone}>＋ Add another zone</button>
        {error && <div className="auth-error">{error}</div>}
        <button className="auth-btn" disabled={busy}>{busy ? 'Saving…' : 'Save zones'}</button>
      </form>

      {/* map picker modal — only one map ever mounted at a time */}
      {picking != null && (
        <div className="picker-overlay" onClick={() => setPicking(null)}>
          <div className="picker-modal" onClick={e => e.stopPropagation()}>
            <div className="picker-head">
              <span>Click the map to place “{current.name || `Zone ${picking + 1}`}”</span>
              <button type="button" className="btn-sm ghost" onClick={() => setPicking(null)}>Done</button>
            </div>
            <LocationPicker
              lat={current.centerLat !== '' ? Number(current.centerLat) : null}
              lng={current.centerLng !== '' ? Number(current.centerLng) : null}
              onPick={(lat, lng) => setCoords(picking, lat, lng)}
            />
          </div>
        </div>
      )}
    </div>
  )
}