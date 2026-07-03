import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api'

export default function CreateOrg() {
  const nav = useNavigate()
  const [name, setName]   = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy]   = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(null); setBusy(true)
    try {
      await api.post('/orgs', { name })   // your existing authed create-org route
      nav('/app')                          // back to the org list
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Link className="back-link" to="/app">← Back</Link>
        <h1 className="auth-title">New organization</h1>

        <label className="auth-field">
          <span>Organization name</span>
          <input value={name} onChange={e => setName(e.target.value)} required autoFocus />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="auth-btn" disabled={busy}>
          {busy ? 'Creating…' : 'Create organization'}
        </button>
      </form>
    </div>
  )
}