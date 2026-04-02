import { useState, useRef, useEffect } from 'react'

export default function SymptomBot({ token, conditionName, onClose, onUseCondition }) {
  const [messages, setMessages]     = useState([])
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [refined, setRefined]       = useState(null)   // { condition, reasoning }
  const bottomRef                   = useRef(null)
  const inputRef                    = useRef(null)
  const started                     = useRef(false)

  // Auto-start: send the initial context message as soon as the bot opens
  useEffect(() => {
    if (started.current) return
    started.current = true
    sendToBot(`The patient is calling about: ${conditionName}`, [])
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendToBot(userText, history) {
    const newHistory = [...history, { role: 'user', content: userText }]
    setMessages(newHistory)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/schedule/symptom-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: newHistory, condition_name: conditionName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')

      // Detect refined condition JSON block
      const jsonMatch = data.response.match(/\{"_refined":\{[\s\S]*?\}\}/)
      let displayText = data.response
      let parsedRefined = null

      if (jsonMatch) {
        try {
          parsedRefined = JSON.parse(jsonMatch[0])._refined
          displayText = data.response.replace(jsonMatch[0], '').trim()
          if (parsedRefined?.done) setRefined(parsedRefined)
        } catch { /* ignore parse errors */ }
      }

      const updated = [...newHistory, { role: 'assistant', content: displayText }]
      setMessages(updated)

      // Focus input after response
      if (!parsedRefined?.done) {
        setTimeout(() => inputRef.current?.focus(), 100)
      }
    } catch (e) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!input.trim() || loading) return
    sendToBot(input.trim(), messages)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="bg-aentc-dark text-white px-5 py-4 rounded-t-xl flex items-center justify-between shrink-0">
          <div>
            <p className="text-xs text-aentc-pale uppercase tracking-wider mb-0.5">Symptom Bot</p>
            <h3 className="font-bold text-base leading-tight">{conditionName}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-aentc-pale hover:text-white text-2xl leading-none transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Instructions */}
        <div className="bg-aentc-bg border-b border-aentc-pale px-4 py-2 shrink-0">
          <p className="text-xs text-gray-600">
            Relay the patient's answers to each question. The bot will help identify the most accurate condition.
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            m.role === 'assistant' ? (
              <div key={i} className="bg-aentc-pale rounded-xl rounded-tl-sm px-4 py-3 text-sm text-gray-800 leading-relaxed max-w-[90%]">
                {m.content}
              </div>
            ) : (
              <div key={i} className="flex justify-end">
                <div className="bg-aentc-dark text-white rounded-xl rounded-tr-sm px-4 py-3 text-sm max-w-[85%] leading-relaxed">
                  {m.content}
                </div>
              </div>
            )
          ))}

          {loading && (
            <div className="bg-aentc-pale rounded-xl rounded-tl-sm px-4 py-3 text-sm text-gray-400 max-w-[90%]">
              <span className="inline-flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>•</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>•</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>•</span>
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Refined condition result */}
        {refined && (
          <div className="border-t border-emerald-200 bg-emerald-50 px-4 py-3 shrink-0">
            <p className="text-xs font-semibold text-emerald-700 mb-1">Refined condition identified</p>
            <p className="text-sm font-bold text-emerald-900 mb-0.5">{refined.condition}</p>
            {refined.reasoning && (
              <p className="text-xs text-emerald-700 mb-2 leading-relaxed">{refined.reasoning}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => onUseCondition(refined.condition)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
              >
                Use this condition
              </button>
              <button
                onClick={onClose}
                className="text-emerald-700 hover:text-emerald-900 text-sm font-medium px-3 py-1.5"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        {!refined && (
          <form onSubmit={handleSubmit} className="border-t border-gray-200 p-3 flex gap-2 shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
              placeholder="Patient says…"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light disabled:bg-gray-50 disabled:text-gray-400"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              Send
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
