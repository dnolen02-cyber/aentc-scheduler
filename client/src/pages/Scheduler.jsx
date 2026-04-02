import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import RecommendationList from '../components/RecommendationList.jsx'

const LOCATIONS = ['Central', 'South', 'Village', 'North', 'Kyle']

const INSURANCE_OPTIONS = [
  'Aetna', 'Blue Cross Blue Shield', 'Cigna', 'Humana', 'Medicare',
  'Medicaid', 'Tricare', 'United Healthcare', 'Self-Pay', 'Other',
]

// Extract the trailing _q or _done JSON block from a bot response
function parseResponse(text) {
  const idx = text.lastIndexOf('{"_')
  if (idx === -1) return { display: text, block: null }
  try {
    const block = JSON.parse(text.slice(idx).trim())
    return { display: text.slice(0, idx).trim(), block }
  } catch {
    return { display: text, block: null }
  }
}

export default function Scheduler({ token, user, onLogout }) {
  const navigate = useNavigate()

  // ── Form state ────────────────────────────────────────────────────────────
  const [description, setDescription]         = useState('')
  const [selectedLocations, setSelectedLocations] = useState([])
  const [age, setAge]                         = useState('')
  const [insurance, setInsurance]             = useState('')

  // ── Phase: 'form' | 'chat' | 'results' ───────────────────────────────────
  const [phase, setPhase] = useState('form')

  // ── Chat state ────────────────────────────────────────────────────────────
  const [messages, setMessages]           = useState([])       // raw API history
  const [chatDisplay, setChatDisplay]     = useState([])       // {role, text}
  const [currentQ, setCurrentQ]           = useState(null)     // parsed _q block
  const [conclusion, setConclusion]       = useState(null)     // parsed _done block
  const [multiselectPicks, setMultiselectPicks] = useState([])
  const [textAnswer, setTextAnswer]       = useState('')
  const [botLoading, setBotLoading]       = useState(false)

  // ── Conditions list (for matching concluded condition name → id) ──────────
  const [conditions, setConditions] = useState([])

  // ── Results state ─────────────────────────────────────────────────────────
  const [matchedCondition, setMatchedCondition] = useState(null)
  const [recommendation, setRecommendation]     = useState(null)
  const [recLoading, setRecLoading]             = useState(false)
  const [error, setError]                       = useState('')

  // ── Assignment state ──────────────────────────────────────────────────────
  const [assigning, setAssigning]         = useState(false)
  const [assignTarget, setAssignTarget]   = useState(null)
  const [assignLocation, setAssignLocation] = useState('')
  const [assignSuccess, setAssignSuccess] = useState('')

  const bottomRef  = useRef(null)
  // Snapshot of form values when triage starts (stable for the whole session)
  const intakeSnap = useRef({})

  // ── Load conditions ───────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/admin/conditions', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setConditions(Array.isArray(data) ? data.filter(c => c.is_active) : []))
      .catch(() => {})
  }, [token])

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatDisplay, botLoading, currentQ, conclusion])

  // ── Form submit → start triage ────────────────────────────────────────────
  function handleFormSubmit(e) {
    e.preventDefault()
    if (!description.trim()) return

    const intake = {
      description:  description.trim(),
      locations:    selectedLocations,
      age:          age.trim(),
      insurance,
    }
    intakeSnap.current = intake

    setPhase('chat')
    setMessages([])
    setChatDisplay([])
    setCurrentQ(null)
    setConclusion(null)
    setMultiselectPicks([])
    setTextAnswer('')
    setError('')
    setRecommendation(null)
    setMatchedCondition(null)
    setAssignSuccess('')

    // Build initial bot prompt from intake fields
    const parts = [`Patient description: ${intake.description}`]
    if (intake.locations.length > 0) parts.push(`Preferred location(s): ${intake.locations.join(', ')}`)
    if (intake.age)      parts.push(`Age: ${intake.age}`)
    if (intake.insurance) parts.push(`Insurance: ${intake.insurance}`)

    sendToBot(parts.join('\n'), [], true)
  }

  // ── Send message to bot ───────────────────────────────────────────────────
  async function sendToBot(userText, history, isInitial = false) {
    const newHistory = [...history, { role: 'user', content: userText }]
    setMessages(newHistory)

    // Don't show the raw intake as a scheduler bubble — only show follow-up answers
    const newDisplay = isInitial
      ? [...chatDisplay]
      : [...chatDisplay, { role: 'user', text: userText }]
    setChatDisplay(newDisplay)

    setCurrentQ(null)
    setMultiselectPicks([])
    setTextAnswer('')
    setBotLoading(true)

    try {
      const res = await fetch('/api/schedule/symptom-bot', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          messages:       newHistory,
          condition_name: intakeSnap.current.description,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')

      const { display, block } = parseResponse(data.response)
      const updatedHistory = [...newHistory, { role: 'assistant', content: data.response }]
      setMessages(updatedHistory)

      // Only add a chat bubble if there is actual conversational text (not just the JSON block)
      const updatedDisplay = display
        ? [...newDisplay, { role: 'assistant', text: display }]
        : newDisplay
      setChatDisplay(updatedDisplay)

      if (block?._q)    setCurrentQ(block._q)
      if (block?._done) setConclusion(block._done)
    } catch {
      setChatDisplay(prev => [
        ...prev,
        { role: 'assistant', text: 'Something went wrong. Please try again.' },
      ])
    } finally {
      setBotLoading(false)
    }
  }

  // ── Structured answer handlers ────────────────────────────────────────────
  function handleYesNo(answer) {
    sendToBot(answer, messages)
  }

  function handleMultiselect() {
    if (multiselectPicks.length === 0) return
    sendToBot(multiselectPicks.join(', '), messages)
  }

  function handleTextSubmit(e) {
    e.preventDefault()
    if (!textAnswer.trim()) return
    sendToBot(textAnswer.trim(), messages)
  }

  // ── Find providers after conclusion ──────────────────────────────────────
  async function findProviders() {
    if (!conclusion) return
    setRecLoading(true)
    setError('')

    const match = conditions.find(
      c => c.name.toLowerCase() === conclusion.condition.toLowerCase()
    )
    if (!match) {
      setError(`Could not find "${conclusion.condition}" in the conditions list. Contact an admin.`)
      setRecLoading(false)
      return
    }
    setMatchedCondition(match)

    try {
      // Fetch all providers (no location param) — RecommendationList filters by location
      const params = new URLSearchParams({ condition_id: match.id })
      const res  = await fetch(`/api/schedule/recommend?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Recommendation failed')
      setRecommendation(data)
      setPhase('results')
    } catch (e) {
      setError(e.message)
    } finally {
      setRecLoading(false)
    }
  }

  // ── Confirm assignment ────────────────────────────────────────────────────
  async function confirmAssign() {
    if (!assignTarget || !matchedCondition) return
    setAssigning(true)

    const loc = intakeSnap.current.locations.length === 1
      ? intakeSnap.current.locations[0]
      : assignLocation || null

    try {
      const res  = await fetch('/api/schedule/assign', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          provider_id:  assignTarget.id,
          condition_id: matchedCondition.id,
          location:     loc,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Assignment failed')

      setAssignSuccess(`${assignTarget.name}, ${assignTarget.title} assigned for ${matchedCondition.name}`)
      setAssignTarget(null)
      setAssignLocation('')
      await findProviders()   // refresh rotation
    } catch (e) {
      setError(e.message)
    } finally {
      setAssigning(false)
    }
  }

  // ── Start over ────────────────────────────────────────────────────────────
  function startOver() {
    setPhase('form')
    setDescription('')
    setSelectedLocations([])
    setAge('')
    setInsurance('')
    setMessages([])
    setChatDisplay([])
    setCurrentQ(null)
    setConclusion(null)
    setRecommendation(null)
    setMatchedCondition(null)
    setError('')
    setAssignSuccess('')
  }

  // ── New complaint (same patient, fresh triage) ────────────────────────────
  function newComplaint() {
    // Keep locations, age, insurance from original intake but reset the description
    const prev = intakeSnap.current
    setDescription('')
    setMessages([])
    setChatDisplay([])
    setCurrentQ(null)
    setConclusion(null)
    setRecommendation(null)
    setMatchedCondition(null)
    setError('')
    setAssignSuccess('')
    setPhase('form')
    // Pre-populate location/age/insurance so scheduler doesn't have to re-enter
    setSelectedLocations(prev.locations ?? [])
    setAge(prev.age ?? '')
    setInsurance(prev.insurance ?? '')
  }

  // ── Location pill toggle ──────────────────────────────────────────────────
  function toggleLocation(loc) {
    setSelectedLocations(prev =>
      prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc]
    )
  }

  const intake = intakeSnap.current

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-aentc-bg">

      {/* Header */}
      <header className="bg-aentc-dark text-white px-6 py-4 flex items-center justify-between shadow-md">
        <div>
          <h1 className="text-lg font-bold tracking-tight">AENTC Scheduling Assistant</h1>
          <p className="text-aentc-pale text-xs mt-0.5">Logged in as {user?.username}</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {user?.role === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="text-aentc-pale hover:text-white transition-colors"
            >
              Admin
            </button>
          )}
          <button
            onClick={() => navigate('/change-password')}
            className="text-aentc-pale hover:text-white transition-colors"
          >
            Change Password
          </button>
          <button
            onClick={onLogout}
            className="text-aentc-pale hover:text-white transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">

        {/* ══════════════════════ FORM PHASE ══════════════════════ */}
        {phase === 'form' && (
          <div className="bg-white rounded-xl shadow-sm border border-aentc-pale p-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-5">
              New Patient Intake
            </h2>

            <form onSubmit={handleFormSubmit} className="space-y-5">

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What is the patient calling about? <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe the patient's symptoms or reason for calling…"
                  rows={3}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light resize-none"
                />
              </div>

              {/* Location pills */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preferred Location(s)
                </label>
                <div className="flex flex-wrap gap-2">
                  {LOCATIONS.map(loc => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => toggleLocation(loc)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                        selectedLocations.includes(loc)
                          ? 'bg-aentc-dark text-white border-aentc-dark'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-aentc-medium hover:text-aentc-dark'
                      }`}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </div>

              {/* Age + Insurance */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
                  <input
                    type="number"
                    value={age}
                    onChange={e => setAge(e.target.value)}
                    placeholder="e.g. 45"
                    min="0"
                    max="120"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Insurance</label>
                  <select
                    value={insurance}
                    onChange={e => setInsurance(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light"
                  >
                    <option value="">Select insurance…</option>
                    {INSURANCE_OPTIONS.map(opt => <option key={opt}>{opt}</option>)}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={!description.trim()}
                className="w-full bg-aentc-dark hover:bg-aentc-medium text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Triage
              </button>
            </form>
          </div>
        )}

        {/* ══════════════════════ CHAT / RESULTS PHASE ══════════════════════ */}
        {(phase === 'chat' || phase === 'results') && (
          <>
            {/* Patient summary bar */}
            <div className="bg-aentc-dark text-white rounded-xl px-5 py-3 mb-4 flex items-start justify-between gap-4">
              <div className="text-sm min-w-0">
                <p className="font-semibold leading-snug truncate">{intake.description}</p>
                <p className="text-aentc-pale text-xs mt-0.5">
                  {[
                    intake.locations?.length > 0 && intake.locations.join(', '),
                    intake.age && `Age ${intake.age}`,
                    intake.insurance,
                  ].filter(Boolean).join(' · ') || 'No location / age / insurance specified'}
                </p>
              </div>
              <button
                onClick={startOver}
                className="shrink-0 text-xs text-aentc-pale hover:text-white border border-aentc-medium hover:border-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Start Over
              </button>
            </div>

            {/* Chat window */}
            <div className="bg-white rounded-xl shadow-sm border border-aentc-pale mb-4 overflow-hidden">
              <div className="px-4 py-2 bg-aentc-bg border-b border-aentc-pale">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Symptom Triage
                </p>
              </div>

              {/* Messages */}
              <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                {chatDisplay.map((m, i) => (
                  m.role === 'assistant' ? (
                    <div key={i} className="bg-aentc-pale rounded-xl rounded-tl-sm px-4 py-3 text-sm text-gray-800 leading-relaxed max-w-[88%]">
                      {m.text}
                    </div>
                  ) : (
                    <div key={i} className="flex justify-end">
                      <div className="bg-aentc-dark text-white rounded-xl rounded-tr-sm px-4 py-3 text-sm max-w-[85%] leading-relaxed">
                        {m.text}
                      </div>
                    </div>
                  )
                ))}

                {/* Loading dots */}
                {botLoading && (
                  <div className="bg-aentc-pale rounded-xl rounded-tl-sm px-4 py-3 text-sm text-gray-400 max-w-[88%]">
                    <span className="inline-flex gap-1">
                      <span className="animate-bounce" style={{ animationDelay: '0ms' }}>•</span>
                      <span className="animate-bounce" style={{ animationDelay: '150ms' }}>•</span>
                      <span className="animate-bounce" style={{ animationDelay: '300ms' }}>•</span>
                    </span>
                  </div>
                )}

                {/* Conclusion card */}
                {conclusion && (
                  <div className="space-y-2">
                    {/* Urgency alert — shown prominently before everything else */}
                    {conclusion.urgent && conclusion.urgent_note && (
                      <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3">
                        <p className="text-xs font-bold text-red-700 uppercase tracking-wider mb-1">
                          ⚠ Urgent — Action Required
                        </p>
                        <p className="text-sm text-red-800 leading-snug">{conclusion.urgent_note}</p>
                      </div>
                    )}

                    <div className={`rounded-xl p-4 border ${
                      conclusion.confident
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-amber-50 border-amber-200'
                    }`}>
                      <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${
                        conclusion.confident ? 'text-emerald-600' : 'text-amber-600'
                      }`}>
                        {conclusion.confident ? 'Likely condition' : 'Best estimate'}
                      </p>
                      <p className={`font-bold text-sm mb-1 ${
                        conclusion.confident ? 'text-emerald-900' : 'text-amber-900'
                      }`}>
                        {conclusion.condition}
                      </p>
                      <p className={`text-xs leading-relaxed mb-2 ${
                        conclusion.confident ? 'text-emerald-700' : 'text-amber-700'
                      }`}>
                        {conclusion.reasoning}
                      </p>

                      {/* Also consider */}
                      {conclusion.also_consider?.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs text-gray-500 mb-1">Also consider:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {conclusion.also_consider.map(c => (
                              <span key={c} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Visit label */}
                      {conclusion.visit_label && (
                        <div className={`flex items-start gap-1.5 text-xs font-medium px-2.5 py-2 rounded-md mb-3 ${
                          conclusion.urgent
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}>
                          <span className="font-semibold shrink-0">Visit label:</span>
                          <span>{conclusion.visit_label}</span>
                        </div>
                      )}

                      {!conclusion.confident && conclusion.ask_patient && (
                        <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 mb-3">
                          <span className="font-semibold">Ask the patient: </span>
                          {conclusion.ask_patient.replace(/^Ask the patient:\s*/i, '')}
                        </div>
                      )}
                      {phase !== 'results' && (
                        <button
                          onClick={findProviders}
                          disabled={recLoading}
                          className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors text-white disabled:opacity-60 ${
                            conclusion.confident
                              ? 'bg-emerald-700 hover:bg-emerald-800'
                              : 'bg-amber-600 hover:bg-amber-700'
                          }`}
                        >
                          {recLoading ? 'Loading…' : 'Find Providers'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Structured answer input — only shown during chat phase */}
              {currentQ && !botLoading && phase === 'chat' && (
                <div className="border-t border-gray-200 p-4">
                  {/* Question text */}
                  <p className="text-sm font-medium text-gray-800 mb-3 leading-snug">
                    {currentQ.text}
                  </p>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                    Patient's answer
                  </p>

                  {/* Yes / No */}
                  {currentQ.type === 'yesno' && (
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleYesNo('Yes')}
                        className="flex-1 bg-aentc-dark hover:bg-aentc-medium text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => handleYesNo('No')}
                        className="flex-1 border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 rounded-lg text-sm transition-colors"
                      >
                        No
                      </button>
                    </div>
                  )}

                  {/* Multi-select */}
                  {currentQ.type === 'multiselect' && (
                    <div>
                      <div className="space-y-2 mb-3">
                        {currentQ.options?.map(opt => (
                          <label key={opt} className="flex items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={multiselectPicks.includes(opt)}
                              onChange={() =>
                                setMultiselectPicks(prev =>
                                  prev.includes(opt)
                                    ? prev.filter(o => o !== opt)
                                    : [...prev, opt]
                                )
                              }
                              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-aentc-dark focus:ring-aentc-light"
                            />
                            <span className="text-sm text-gray-700">{opt}</span>
                          </label>
                        ))}
                      </div>
                      <button
                        onClick={handleMultiselect}
                        disabled={multiselectPicks.length === 0}
                        className="bg-aentc-dark hover:bg-aentc-medium text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                      >
                        Continue
                      </button>
                    </div>
                  )}

                  {/* Free text */}
                  {currentQ.type === 'text' && (
                    <form onSubmit={handleTextSubmit} className="flex gap-2">
                      <input
                        type="text"
                        value={textAnswer}
                        onChange={e => setTextAnswer(e.target.value)}
                        placeholder={currentQ.placeholder || 'Type answer…'}
                        autoFocus
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light"
                      />
                      <button
                        type="submit"
                        disabled={!textAnswer.trim()}
                        className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Send
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
                {error}
              </div>
            )}

            {/* Assignment success + new complaint */}
            {assignSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 mb-4 text-sm font-medium flex items-center justify-between gap-4">
                <span>✓ {assignSuccess}</span>
                <button
                  onClick={newComplaint}
                  className="shrink-0 text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition-colors"
                >
                  + New Complaint
                </button>
              </div>
            )}

            {/* Recommendation results */}
            {phase === 'results' && recommendation && (
              <RecommendationList
                recommendation={recommendation}
                selectedLocations={intake.locations ?? []}
                onAssignClick={p => {
                  setAssignTarget(p)
                  setAssignLocation(intake.locations?.length === 1 ? intake.locations[0] : '')
                }}
              />
            )}
          </>
        )}
      </main>

      {/* ── Assign confirm modal ── */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-aentc-dark mb-1">Confirm Assignment</h3>
            <p className="text-sm text-gray-600 mb-4">
              Assign{' '}
              <span className="font-semibold text-aentc-dark">
                {assignTarget.name}, {assignTarget.title}
              </span>{' '}
              for <span className="font-semibold">{matchedCondition?.name}</span>?
            </p>

            {/* Location selector when multiple locations were chosen */}
            {intake.locations?.length > 1 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Which location? <span className="text-red-400">*</span>
                </label>
                <select
                  value={assignLocation}
                  onChange={e => setAssignLocation(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light"
                >
                  <option value="">Select location…</option>
                  {intake.locations.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={confirmAssign}
                disabled={assigning || (intake.locations?.length > 1 && !assignLocation)}
                className="flex-1 bg-aentc-dark hover:bg-aentc-medium text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
              >
                {assigning ? 'Saving…' : 'Confirm'}
              </button>
              <button
                onClick={() => setAssignTarget(null)}
                className="flex-1 border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-2.5 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
