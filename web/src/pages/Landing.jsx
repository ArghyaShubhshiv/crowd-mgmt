import { Link } from 'react-router-dom'
import NavBar from '../components/NavBar'

export default function Landing() {
  return (
    <div className="landing">
      <NavBar />

      <section className="hero">
        <div className="hero-badge">Real-time crowd intelligence</div>
        <h1 className="hero-title">
          See your crowd<br />before it becomes a problem.
        </h1>
        <p className="hero-sub">
          ConPulse ingests live location signals, geofences them into zones, and surfaces
          density, trends, and threshold alerts in real time — so organizers act early,
          not after the crush.
        </p>
        <div className="hero-actions">
          <Link to="/signup" className="hero-btn primary">Get started</Link>
          <Link to="/live?event=summer-fest-2026" className="hero-btn ghost">View live demo →</Link>
        </div>
      </section>

      <section className="features">
        <Feature title="Geofenced density"
          body="Raw GPS pings are assigned to zones server-side and aggregated into live per-zone counts." />
        <Feature title="Threshold alerts"
          body="Per-zone warning and critical limits fire the moment a zone crosses them — over a priority queue." />
        <Feature title="Live map & trends"
          body="A real-time map, KPI cards, and a density-over-time graph give organizers the full picture at a glance." />
      </section>

      <footer className="landing-foot">
        Built with Node, Kafka, Redis, Postgres &amp; React.
      </footer>
    </div>
  )
}

function Feature({ title, body }) {
  return (
    <div className="feature-card">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  )
}