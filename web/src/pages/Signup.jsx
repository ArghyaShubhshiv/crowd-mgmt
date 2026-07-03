import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api'

export default function Signup() {
  const nav = useNavigate()
  const [form, setForm] = useState({ email: '', username: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy]   = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError(null); setBusy(true)
    try {
      await api.post('/register', form, { auth: false })
      nav('/login')                       // registered → go log in
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="auth-title">Create account</h1>

        <label className="auth-field">
          <span>Email</span>
          <input type="email" value={form.email} onChange={set('email')} required />
        </label>
        <label className="auth-field">
          <span>Username</span>
          <input type="text" value={form.username} onChange={set('username')} required minLength={3} />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <input type="password" value={form.password} onChange={set('password')} required minLength={8} />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="auth-btn" disabled={busy}>
          {busy ? 'Creating…' : 'Sign up'}
        </button>
        <div className="auth-alt">
          Already have an account? <Link to="/login">Log in</Link>
        </div>
      </form>
    </div>
  )
}