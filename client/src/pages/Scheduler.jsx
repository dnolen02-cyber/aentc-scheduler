import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ProviderResult from '../components/ProviderResult.jsx'
import FollowUpChat from '../components/FollowUpChat.jsx'

const LOCATIONS = ['No Preference', 'Central', 'South', 'Village', 'North', 'Neurotology', 'Kyle']

const INSURANCES = [
  'Unknown',
  'Aetna',
  'BCBS',
  'Cigna',
  'Humana Medicare Advantage',
  'Medicaid',
  'Medicare',
  'Multiplan/PHCS',
  'TriWest',
  'UHC',
  'WellMed',
  'Other/Self-Pay',
]

const EMPTY_FORM = {
  complaint: '',
  location: 'No Preference',
  patientType: 'new',
  age: '',
  insurance: 'Unknown',
  establishedWith: '',
}

// Builds the initial user message text for the AI conversation
function buildUserMessage(form) {
  return [
    `Chief complaint: ${form.complaint}`,
    `Location preference: ${form.location}`,
    `Patient type: ${form.patientType}`,
    form.age ? `Age: ${form.age}` : null,
    `Insurance: ${form.insurance}`,
    form.patientType === 'established' && form.establishedWith
      ? `Established with: ${form.establishedWith}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export default function Scheduler({ token, user, onLogout }) {
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY_FORM)
  const [messages, setMessages] = useState([])   // full conversation history
  const [response, setResponse] = useState(null)  // latest AI response
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  function handlePatientType(type) {
    setForm(f => ({
      ...f,
      patientType: type,
      establishedWith: type === 'new' ? '' : f.establishedWith,
    }))
  }

  async function postQuery(updatedMessages) {
    const res = await fetch('/api/schedule/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: updatedMessages,
        complaint: form.complaint,
        location: form.location,
        patientType: form.patientType,
        age: form.age,
        insurance: form.insurance,
        establishedWith: form.establishedWith,
      }),
    })
    if (res.status === 401) { onLogout(); navigate('/login', { state: { warning: 'Your session has expired. Please sign in again.' } }); throw new Error('Unauthorized') }
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Query failed.')
    return data.response
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    setResponse(null)
    setMessages([])
    try {
      const userMsg = { role: 'user', content: buildUserMessage(form) }
      const reply = await postQuery([userMsg])
      const newMessages = [userMsg, { role: 'assistant', content: reply }]
      setMessages(newMessages)
      setResponse(reply)
    } catch (err) {
      if (err.message !== 'Unauthorized') setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleFollowUp(question) {
    setError('')
    setLoading(true)
    try {
      const updated = [...messages, { role: 'user', content: question }]
      const reply = await postQuery(updated)
      const final = [...updated, { role: 'assistant', content: reply }]
      setMessages(final)
      setResponse(reply)
    } catch (err) {
      if (err.message !== 'Unauthorized') setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleNewPatient() {
    setForm(EMPTY_FORM)
    setMessages([])
    setResponse(null)
    setError('')
  }

  return (
    <div className="min-h-screen bg-aentc-bg flex flex-col">
      {/* ── Navigation ───────────────────────────────────────────────────────── */}
      <header className="bg-aentc-dark text-white px-6 py-3 flex items-center justify-between shadow-md shrink-0">
        <span className="font-bold text-lg tracking-tight">AENTC Scheduling Assistant</span>
        <div className="flex items-center gap-4 text-sm">
          {user?.role === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="hover:text-aentc-pale transition-colors"
            >
              Admin Panel
            </button>
          )}
          <button
            onClick={() => navigate('/change-password')}
            className="hover:text-aentc-pale transition-colors"
          >
            {user?.username}
          </button>
          <button
            onClick={onLogout}
            className="bg-aentc-medium hover:bg-aentc-light px-3 py-1 rounded-md transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Main layout ───────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col lg:flex-row gap-6 p-6 max-w-7xl mx-auto w-full">

        {/* ── Left panel: Input form ─────────────────────────────────────────── */}
        <section className="lg:w-96 shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-aentc-pale p-6">
            <h2 className="text-base font-semibold text-aentc-dark mb-5">Patient Information</h2>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Chief Complaint */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chief Complaint / Reason for Visit{' '}
                  <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="complaint"
                  value={form.complaint}
                  onChange={handleChange}
                  required
                  rows={4}
                  placeholder="e.g. Hearing loss in left ear for 3 weeks, also has tinnitus…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent resize-none"
                />
              </div>

              {/* Preferred Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preferred Location
                </label>
                <select
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent"
                >
                  {LOCATIONS.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>

              {/* Patient Type toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Patient Type
                </label>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                  <button
                    type="button"
                    onClick={() => handlePatientType('new')}
                    className={`flex-1 py-2 font-medium transition-colors ${
                      form.patientType === 'new'
                        ? 'bg-aentc-dark text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    New
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePatientType('established')}
                    className={`flex-1 py-2 font-medium transition-colors border-l border-gray-300 ${
                      form.patientType === 'established'
                        ? 'bg-aentc-dark text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Established
                  </button>
                </div>
              </div>

              {/* Established With (conditional) */}
              {form.patientType === 'established' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Established With <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    name="establishedWith"
                    value={form.establishedWith}
                    onChange={handleChange}
                    placeholder="Provider name"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent"
                  />
                </div>
              )}

              {/* Patient Age */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Patient Age
                </label>
                <input
                  type="text"
                  name="age"
                  value={form.age}
                  onChange={handleChange}
                  placeholder="e.g. 45 or 6 months"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent"
                />
              </div>

              {/* Insurance */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Insurance
                </label>
                <select
                  name="insurance"
                  value={form.insurance}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent"
                >
                  {INSURANCES.map(i => <option key={i}>{i}</option>)}
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-aentc-dark hover:bg-aentc-medium text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {loading && messages.length === 0 ? 'Searching…' : 'Find Best Provider'}
              </button>
            </form>
          </div>
        </section>

        {/* ── Right panel: Results ───────────────────────────────────────────── */}
        <section className="flex-1 flex flex-col gap-4 min-w-0">

          {/* Empty state */}
          {!response && !loading && !error && (
            <div className="flex-1 flex items-center justify-center text-center px-6">
              <p className="text-gray-400 text-sm leading-relaxed">
                Fill in patient details and click{' '}
                <span className="font-semibold text-aentc-light">Find Best Provider</span>{' '}
                to get a scheduling recommendation.
              </p>
            </div>
          )}

          {/* Loading spinner */}
          {loading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-9 h-9 border-4 border-aentc-pale border-t-aentc-dark rounded-full animate-spin" />
                <p className="text-sm text-aentc-medium">
                  {messages.length > 0 ? 'Getting follow-up…' : 'Finding best provider…'}
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Result + follow-up */}
          {response && !loading && (
            <>
              <ProviderResult response={response} />
              <FollowUpChat onFollowUp={handleFollowUp} disabled={loading} />
              <div className="text-right">
                <button
                  onClick={handleNewPatient}
                  className="text-sm text-aentc-light hover:text-aentc-medium hover:underline transition-colors"
                >
                  ← New Patient
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
