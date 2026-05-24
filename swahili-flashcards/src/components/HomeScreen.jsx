import { DECKS } from '../data/index.js';
import { getStats, getDueCards } from '../lib/srs.js';

export default function HomeScreen({ progress, streak, onStart }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="text-center pt-2">
        <h1 className="text-3xl font-bold text-slate-800">Swahili Flashcards</h1>
        <p className="text-slate-500 mt-1">Kenyan Swahili · Spaced Repetition</p>
      </div>

      {/* Streak */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4">
        <span className="text-4xl">🔥</span>
        <div>
          <p className="text-2xl font-bold text-amber-700">{streak}-day streak</p>
          <p className="text-sm text-amber-600">Keep it going — study every day</p>
        </div>
      </div>

      {/* Deck cards */}
      <div className="flex flex-col gap-4">
        {Object.entries(DECKS).map(([key, deck]) => {
          const stats = getStats(deck.cards, progress);
          const dueCards = getDueCards(deck.cards, progress);

          return (
            <div
              key={key}
              className="bg-white rounded-2xl shadow border border-slate-200 overflow-hidden"
            >
              <div className={`${deck.color} px-6 py-4`}>
                <h2 className="text-white font-bold text-lg">{deck.label}</h2>
                {deck.description && (
                  <p className="text-white/80 text-sm mt-0.5">{deck.description}</p>
                )}
              </div>

              <div className="px-6 py-4">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <StatChip label="Due today" value={stats.dueToday} highlight />
                  <StatChip label="Learning" value={stats.learning} />
                  <StatChip label="Mastered" value={stats.mastered} color="text-emerald-600" />
                </div>

                <div className="flex gap-2">
                  <DirectionButton
                    disabled={dueCards.length === 0}
                    label={`Study ${dueCards.length > 0 ? dueCards.length : 'all'} due`}
                    onClick={() => onStart(key, 'en_sw', dueCards.length > 0 ? dueCards : deck.cards)}
                  />
                  <button
                    onClick={() => onStart(key, 'sw_en', deck.cards)}
                    className="text-sm text-slate-500 hover:text-slate-800 border border-slate-200 rounded-xl px-3 py-2 transition-colors"
                    title="Swahili → English"
                  >
                    SW→EN
                  </button>
                  <button
                    onClick={() => onStart(key, 'en_sw', deck.cards)}
                    className="text-sm text-slate-500 hover:text-slate-800 border border-slate-200 rounded-xl px-3 py-2 transition-colors"
                    title="English → Swahili"
                  >
                    EN→SW
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-slate-400 pb-4">
        Progress saved automatically in your browser
      </p>
    </div>
  );
}

function StatChip({ label, value, color = 'text-slate-700', highlight }) {
  return (
    <div className={`rounded-xl p-3 text-center ${highlight ? 'bg-amber-50' : 'bg-slate-50'}`}>
      <p className={`text-xl font-bold ${highlight ? 'text-amber-600' : color}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function DirectionButton({ label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl py-2 px-4 text-sm font-semibold transition-colors ${
        disabled
          ? 'bg-slate-100 text-slate-400 cursor-default'
          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
      }`}
    >
      {disabled ? 'All caught up!' : label}
    </button>
  );
}
