import { Link, useNavigate } from 'react-router-dom'
import { isLoggedIn, clearToken } from '../auth'

export default function NavBar({slugName}) {
  const nav = useNavigate()
  const authed = isLoggedIn()

  function logout() {
    clearToken()
    nav('/login')
  }

  return (
    <nav className="navbar">
      {slugName ?  <div><Link to="/" className="nav-brand">ConPulse   -   </Link>{slugName}</div> : <Link to="/" className="nav-brand">ConPulse</Link>} 
      <div className="nav-links">
        {authed ? (
          <>
            <Link to="/app" className="nav-link">Dashboard</Link>
            <button className="nav-btn" onClick={logout}>Log out</button>
          </>
        ) : (
          <>
            <Link to="/login" className="nav-link">Log in</Link>
            <Link to="/signup" className="nav-btn">Sign up</Link>
          </>
        )}
      </div>
    </nav>
  )
}