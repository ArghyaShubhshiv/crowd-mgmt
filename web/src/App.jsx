import { useZones } from './hooks/useZones'
import { useLiveDensity } from './hooks/useLiveDensity'
import TopBar from './components/TopBar'
import KpiBanner from './components/KpiBanner'
import DensityMap from './components/DensityMap'
import AlertToast from './components/AlertToast'
import DensityGraph from './components/DensityGraph'

import './App.css'

export default function App() {
  const { zones } = useZones()
  const { densities, alert, connected } = useLiveDensity()

  return (
    <div className="app">
      <AlertToast alert={alert} />
      <TopBar connected={connected} />
      <KpiBanner zones={zones} densities={densities} />
      <DensityMap zones={zones} densities={densities} />
      <DensityGraph zones={zones} densities={densities} />

    </div>
  )
}