import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { clearToken } from '../auth'

export default function UserDashboard() {
  const nav = useNavigate()
  const [orgs, setOrgs]   = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/orgs')
      .then(d => setOrgs(d.orgs))
      .catch(e => setError(e.message))
  }, [])

  function logout() { clearToken(); nav('/') }

  return (
    <div className="dash-wrap">
      <div className="dash-head">
        <h1>My organizations</h1>
        <div className="dash-actions">
          <Link className="btn-primary" to="/app/orgs/new">＋ New org</Link>
          <button className="btn-ghost" onClick={logout}>Log out</button>
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}
      {orgs === null && !error && <div className="dash-muted">Loading…</div>}
      {orgs && orgs.length === 0 && (
        <div className="dash-empty">No organizations yet. Create one to get started.</div>
      )}

      <div className="card-grid">
        {orgs?.map(o => (
          <Link key={o.id} className="list-card" to={`/app/orgs/${o.id}`}>
            <div className="list-card-title">{o.name}</div>
            <div className="list-card-meta">
              <span className={`role-pill ${o.role}`}>{o.role}</span>
              <span>{o.event_count} event{o.event_count === 1 ? '' : 's'}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}