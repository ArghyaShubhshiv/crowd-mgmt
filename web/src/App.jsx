import { useZones } from './hooks/useZones'
import { useLiveDensity } from './hooks/useLiveDensity'
import TopBar from './components/TopBar'
import KpiBanner from './components/KpiBanner'
import DensityMap from './components/DensityMap'
import AlertFeed from './components/AlertFeed'
import NavBar from './components/Navbar'
import DensityGraph from './components/DensityGraph'
import {SLUG} from "./config"

import './App.css'

export default function App() {
  const { zones } = useZones()
  const { densities, alert, connected } = useLiveDensity()

return (
  <div className="app">
    <div className="r-top"><NavBar slugName={SLUG} /></div>
    <div className="r-kpi"><KpiBanner zones={zones} densities={densities} /></div>
    <div className="r-graph"><DensityGraph zones={zones} densities={densities} /></div>
    <div className="r-map"><DensityMap zones={zones} densities={densities} /></div>
    <div className="r-feed"><AlertFeed alert={alert} /></div>
  </div>
)
}