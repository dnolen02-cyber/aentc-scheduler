import { useState } from 'react'

export default function FollowUpChat({ onFollowUp, disabled }) {
  const [question, setQuestion] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!question.trim()) return
    onFollowUp(question.trim())
    setQuestion('')
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-aentc-pale p-4">
      <p className="text-xs font-semibold text-aentc-light uppercase tracking-wider mb-3">
        Follow-up Question
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          disabled={disabled}
          placeholder="e.g. What if the patient has Cigna insurance?"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          type="submit"
          disabled={disabled || !question.trim()}
          className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
        >
          Ask
        </button>
      </form>
    </div>
  )
}
