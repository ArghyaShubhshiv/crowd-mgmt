import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import Landing from './pages/Landing.jsx'
import App from './App.jsx'
import Signup from './pages/Signup.jsx'
import Login from './pages/Login.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import UserDashboard from './pages/UserDashboard.jsx'
import OrgDashboard from './pages/OrgDashboard.jsx'
import CreateOrg from './pages/CreateOrg.jsx'
import CreateEvent from './pages/CreateEvent.jsx'
import CreateZones from './pages/CreateZones.jsx'

import './App.css'
import './auth.css'
import './landing.css'

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/live" element={<App />} />

      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />

      <Route path="/app" element={<RequireAuth><UserDashboard /></RequireAuth>} />
      <Route path="/app/orgs/new"    element={<RequireAuth><CreateOrg /></RequireAuth>} />
      <Route path="/app/orgs/:orgId" element={<RequireAuth><OrgDashboard /></RequireAuth>} />
      <Route path="/app/events/new" element={<RequireAuth><CreateEvent /></RequireAuth>} />
      <Route path="/app/events/:slug/zones/new" element={<RequireAuth><CreateZones /></RequireAuth>} />
    </Routes>
  </BrowserRouter>
)