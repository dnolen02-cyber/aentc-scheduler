import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
      } else {
        setSubmitted(true)
      }
    } catch {
      setError('Network error. Is the server running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-aentc-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-aentc-dark">AENTC Scheduler</h1>
          <p className="text-aentc-medium font-medium mt-1">Austin ENT &amp; Allergy</p>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-aentc-pale p-8">
          {submitted ? (
            <div className="text-center">
              <div className="text-3xl mb-3">✉️</div>
              <h2 className="text-lg font-semibold text-aentc-dark mb-2">Check your email</h2>
              <p className="text-sm text-gray-500 mb-6">
                If that address is registered, a password reset link has been sent. The link expires in 1 hour.
              </p>
              <Link to="/login" className="text-sm text-aentc-light hover:underline">
                ← Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-aentc-dark">Reset Password</h2>
                <Link to="/login" className="text-xs text-aentc-light hover:underline">
                  ← Back
                </Link>
              </div>

              <p className="text-sm text-gray-500 mb-5">
                Enter your account email address and we'll send you a reset link.
              </p>

              {error && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="you@austinent.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-aentc-dark hover:bg-aentc-medium text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
