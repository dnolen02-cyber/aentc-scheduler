import { useState } from 'react';
import { askAboutCard, getApiKey, saveApiKey } from '../lib/ai.js';

export default function QuestionBox({ card }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');

  const hasKey = !!getApiKey();

  async function handleAsk() {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer('');
    setError('');
    try {
      const result = await askAboutCard(question.trim(), card);
      setAnswer(result);
    } catch (e) {
      if (e.message === 'NO_KEY' || e.message === 'BAD_KEY') {
        setShowKeyInput(true);
        setError(e.message === 'BAD_KEY' ? 'Invalid API key — please check and re-enter.' : '');
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSaveKey() {
    if (!keyDraft.trim()) return;
    saveApiKey(keyDraft);
    setShowKeyInput(false);
    setKeyDraft('');
    setError('');
  }

  if (showKeyInput || !hasKey) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-slate-700">Enter your Anthropic API key to ask questions</p>
        <p className="text-xs text-slate-500">
          Get a key at console.anthropic.com. It's saved only on this device.
        </p>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <input
          type="password"
          placeholder="sk-ant-..."
          value={keyDraft}
          onChange={(e) => setKeyDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
          className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        <button
          onClick={handleSaveKey}
          disabled={!keyDraft.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm rounded-xl py-2 transition-colors"
        >
          Save key
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Ask about a word or phrase…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && handleAsk()}
          className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        <button
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm rounded-xl px-4 py-2 transition-colors whitespace-nowrap"
        >
          {loading ? '…' : 'Ask'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-500 px-1">{error}</p>
      )}

      {answer && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-500 mb-2">Tutor</p>
          <p className="text-sm text-slate-700 leading-relaxed">{answer}</p>
        </div>
      )}

      <button
        onClick={() => { saveApiKey(''); setShowKeyInput(true); setAnswer(''); setError(''); }}
        className="text-xs text-slate-400 hover:text-slate-600 text-right self-end transition-colors"
      >
        Change API key
      </button>
    </div>
  );
}
