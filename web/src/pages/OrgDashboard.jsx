import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'

export default function OrgDashboard() {
  const { orgId } = useParams()
  const [data, setData]       = useState(null)
  const [members, setMembers] = useState(null)
  const [error, setError]     = useState(null)

  // member-add form state
  const [email, setEmail] = useState('')
  const [role, setRole]   = useState('member')
  const [addMsg, setAddMsg] = useState(null)
  const [adding, setAdding] = useState(false)

  const loadEvents = useCallback(() => {
    api.get(`/orgs/${orgId}/events`).then(setData).catch(e => setError(e.message))
  }, [orgId])

  const loadMembers = useCallback(() => {
    api.get(`/orgs/${orgId}/members`).then(d => setMembers(d.members)).catch(e => setError(e.message))
  }, [orgId])

  useEffect(() => { loadEvents(); loadMembers() }, [loadEvents, loadMembers])

  async function activate(slug) {
    try {
      await api.patch(`/events/${slug}/status`, { status: 'active' })
      loadEvents()
    } catch (e) { setError(e.message) }
  }

  async function addMember(e) {
    e.preventDefault()
    setAddMsg(null); setAdding(true)
    try {
      const { member } = await api.post(`/orgs/${orgId}/members`, { email, role })
      setAddMsg({ ok: true, text: `Added ${member.username} as ${member.role}` })
      setEmail('')
      loadMembers()
    } catch (err) {
      setAddMsg({ ok: false, text: err.message })
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="dash-wrap">
      <div className="dash-head">
        <div>
          <Link className="back-link" to="/app">← All orgs</Link>
          <h1>{data?.org?.name ?? 'Events'}</h1>
        </div>
        <Link className="btn-primary" to={`/app/events/new?org=${orgId}`}>＋ New event</Link>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {/* ---- events ---- */}
      <h2 className="section-title">Events</h2>
      {!data && !error && <div className="dash-muted">Loading…</div>}
      {data && data.events.length === 0 && (
        <div className="dash-empty">No events yet. Create your first one.</div>
      )}
      <div className="card-grid">
        {data?.events.map(ev => (
          <div key={ev.id} className="list-card">
            <div className="list-card-title">{ev.name}</div>
            <div className="list-card-meta">
              <span className={`status-pill ${ev.status}`}>{ev.status}</span>
              <span>{ev.zone_count} zone{ev.zone_count === 1 ? '' : 's'}</span>
            </div>
            <div className="list-card-actions">
              <a className="btn-sm" href={`/live?event=${ev.slug}`}>Live view →</a>
              <Link className="btn-sm ghost" to={`/app/events/${ev.slug}/zones/new`}>Add zones</Link>
              {ev.status === 'draft' && (
                <button className="btn-sm" onClick={() => activate(ev.slug)}>Activate</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ---- members ---- */}
      <h2 className="section-title">Members</h2>
      <div className="members-panel">
        <div className="member-list">
          {members?.map(m => (
            <div key={m.id} className="member-row">
              <div>
                <div className="member-name">{m.username}</div>
                <div className="member-email">{m.email}</div>
              </div>
              <span className={`role-pill ${m.role}`}>{m.role}</span>
            </div>
          ))}
          {members && members.length === 0 && <div className="dash-muted">No members.</div>}
        </div>

        <form className="add-member" onSubmit={addMember}>
          <input
            type="email" placeholder="user@email.com" value={email}
            onChange={e => setEmail(e.target.value)} required
          />
          <select value={role} onChange={e => setRole(e.target.value)}>
            <option value="member">member</option>
            <option value="owner">owner</option>
          </select>
          <button className="btn-primary" disabled={adding}>
            {adding ? 'Adding…' : 'Add'}
          </button>
        </form>
        {addMsg && (
          <div className={addMsg.ok ? 'add-ok' : 'auth-error'}>{addMsg.text}</div>
        )}
      </div>
    </div>
  )
}