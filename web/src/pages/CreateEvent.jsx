import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { api } from '../api'

// turn "Summer Fest 2026" → "summer-fest-2026"
function slugify(s) {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')   // drop punctuation
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/-+/g, '-')            // collapse repeats
}

export default function CreateEvent() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const orgId = params.get('org')            // ?org=<uuid> from the OrgDashboard link

  const [form, setForm] = useState({ name: '', slug: '', startsAt: '', endsAt: '' })
  const [slugEdited, setSlugEdited] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy]   = useState(false)

  // auto-fill slug from name until the user types their own
  function onName(e) {
    const name = e.target.value
    setForm(f => ({ ...f, name, slug: slugEdited ? f.slug : slugify(name) }))
  }
  function onSlug(e) {
    setSlugEdited(true)
    setForm(f => ({ ...f, slug: e.target.value }))
  }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError(null)

    if (!orgId) { setError('No organization selected.'); return }
    if (form.endsAt && form.startsAt && form.endsAt <= form.startsAt) {
      setError('End time must be after start time.'); return
    }

    setBusy(true)
    try {
      const body = {
        name: form.name,
        slug: form.slug,
        // datetime-local gives "2026-07-01T18:00" → add seconds+Z for a valid ISO timestamp
        ...(form.startsAt && { startsAt: new Date(form.startsAt).toISOString() }),
        ...(form.endsAt   && { endsAt:   new Date(form.endsAt).toISOString() }),
      }
      await api.post(`/orgs/${orgId}/events`, body)
      nav(`/app/orgs/${orgId}`)              // back to that org's event list
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Link className="back-link" to={orgId ? `/app/orgs/${orgId}` : '/app'}>← Back</Link>
        <h1 className="auth-title">New event</h1>

        <label className="auth-field">
          <span>Event name</span>
          <input value={form.name} onChange={onName} required autoFocus />
        </label>

        <label className="auth-field">
          <span>Slug (streaming key)</span>
          <input value={form.slug} onChange={onSlug} required
                 pattern="[a-z0-9-]+" title="lowercase letters, numbers, hyphens" />
        </label>

        <label className="auth-field">
          <span>Starts at</span>
          <input type="datetime-local" value={form.startsAt} onChange={set('startsAt')} />
        </label>

        <label className="auth-field">
          <span>Ends at</span>
          <input type="datetime-local" value={form.endsAt} onChange={set('endsAt')} />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="auth-btn" disabled={busy}>
          {busy ? 'Creating…' : 'Create event'}
        </button>

        {ev.status === 'draft' && (
        <button className="btn-sm" onClick={async () => {
            await api.post(`/events/${ev.slug}/status`, { status: 'active' })  // use api.patch if you add it
            window.location.reload()
        }}>Activate</button>
        )}
      </form>
    </div>
  )
}