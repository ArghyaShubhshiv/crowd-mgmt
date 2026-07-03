import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api'
import { setToken } from '../auth'

export default function Login() {
  const nav = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy]   = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError(null); setBusy(true)
    try {
      const { token } = await api.post('/login', form, { auth: false })
      setToken(token)                     // persist → all future calls authed
      nav('/app')                // into the organizer flow
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="auth-title">Log in</h1>

        <label className="auth-field">
          <span>Email</span>
          <input type="email" value={form.email} onChange={set('email')} required />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <input type="password" value={form.password} onChange={set('password')} required />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="auth-btn" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        <div className="auth-alt">
          No account? <Link to="/signup">Sign up</Link>
        </div>
      </form>
    </div>
  )
}