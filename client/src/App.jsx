import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Setup from './pages/Setup.jsx'
import Login from './pages/Login.jsx'
import Scheduler from './pages/Scheduler.jsx'
import ChangePassword from './pages/ChangePassword.jsx'
import Admin from './pages/Admin.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'

// ── Route guard: redirects to /login if not authenticated ─────────────────────
function Protected({ auth, adminOnly, children }) {
  if (!auth.token) return <Navigate to="/login" replace />
  if (adminOnly && auth.user?.role !== 'admin') return <Navigate to="/scheduler" replace />
  return children
}

// ── Root redirect: checks setup-status, then auth ─────────────────────────────
function RootRedirect({ auth }) {
  const [checking, setChecking] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    fetch('/api/auth/setup-status')
      .then(r => r.json())
      .then(data => {
        setNeedsSetup(data.needs_setup)
        setChecking(false)
      })
      .catch(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <div className="min-h-screen bg-aentc-bg flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-aentc-pale border-t-aentc-dark rounded-full animate-spin" />
      </div>
    )
  }
  if (needsSetup) return <Navigate to="/setup" replace />
  if (!auth.token) return <Navigate to="/login" replace />
  return <Navigate to="/scheduler" replace />
}

// ── Main app ──────────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState({ token: null, user: null })

  function handleLogin(token, user) {
    setAuth({ token, user })
  }

  function handleLogout() {
    setAuth({ token: null, user: null })
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect auth={auth} />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/login" element={<Login onLogin={handleLogin} />} />

        <Route
          path="/scheduler"
          element={
            <Protected auth={auth}>
              <Scheduler token={auth.token} user={auth.user} onLogout={handleLogout} />
            </Protected>
          }
        />

        <Route
          path="/change-password"
          element={
            <Protected auth={auth}>
              <ChangePassword token={auth.token} onLogout={handleLogout} />
            </Protected>
          }
        />

        <Route
          path="/admin"
          element={
            <Protected auth={auth} adminOnly>
              <Admin token={auth.token} user={auth.user} onLogout={handleLogout} />
            </Protected>
          }
        />

        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
