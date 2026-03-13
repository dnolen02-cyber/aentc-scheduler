import { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [form, setForm] = useState({ new_password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (form.new_password !== form.confirm) return setError('Passwords do not match.')
    if (form.new_password.length < 8) return setError('Password must be at least 8 characters.')

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: form.new_password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Reset failed.')
      } else {
        navigate('/login', { state: { message: 'Password reset successfully. Please sign in.' } })
      }
    } catch {
      setError('Network error. Is the server running?')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-aentc-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-md border border-aentc-pale p-8 text-center max-w-sm w-full">
          <p className="text-sm text-red-600 mb-4">Invalid or missing reset token.</p>
          <Link to="/forgot-password" className="text-sm text-aentc-light hover:underline">
            Request a new reset link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-aentc-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-aentc-dark">AENTC Scheduler</h1>
          <p className="text-aentc-medium font-medium mt-1">Austin ENT &amp; Allergy</p>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-aentc-pale p-8">
          <h2 className="text-xl font-semibold text-aentc-dark mb-6">Set New Password</h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                name="new_password"
                value={form.new_password}
                onChange={handleChange}
                required
                autoFocus
                placeholder="Minimum 8 characters"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                type="password"
                name="confirm"
                value={form.confirm}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-aentc-dark hover:bg-aentc-medium text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving…' : 'Set New Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
