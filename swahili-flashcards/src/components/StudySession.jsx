import { useState, useCallback } from 'react';
import FlipCard from './FlipCard.jsx';
import RatingBar from './RatingBar.jsx';
import QuestionBox from './QuestionBox.jsx';
import { processRating, getCardState, saveProgress, recordStudySession } from '../lib/srs.js';
import { SUBCATEGORY_LABELS } from '../data/index.js';

export default function StudySession({ cards, direction, progress, onProgress, onFinish }) {
  const [queue, setQueue] = useState(() => [...cards]);
  const [current, setCurrent] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionStats, setSessionStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [done, setDone] = useState(false);

  const card = queue[current];

  const handleRate = useCallback(
    (rating) => {
      const cardState = getCardState(progress, card.id);
      const newState = processRating(cardState, rating);
      const updatedProgress = { ...progress, [card.id]: newState };

      onProgress(updatedProgress);
      saveProgress(updatedProgress);
      recordStudySession();

      const labels = ['again', 'hard', 'good', 'easy'];
      setSessionStats((s) => ({ ...s, [labels[rating]]: s[labels[rating]] + 1 }));

      const nextIdx = current + 1;
      if (nextIdx >= queue.length) {
        setDone(true);
      } else {
        setCurrent(nextIdx);
        setRevealed(false);
      }
    },
    [card, current, queue, progress, onProgress]
  );

  if (done) {
    const total = queue.length;
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="text-5xl">🎉</div>
        <h2 className="text-2xl font-bold text-slate-800">Session complete!</h2>
        <div className="bg-white rounded-2xl shadow border border-slate-200 p-6 w-full max-w-sm grid grid-cols-2 gap-4">
          <Stat label="Cards reviewed" value={total} />
          <Stat label="Again" value={sessionStats.again} color="text-red-500" />
          <Stat label="Hard" value={sessionStats.hard} color="text-orange-500" />
          <Stat label="Good" value={sessionStats.good} color="text-blue-500" />
          <Stat label="Easy" value={sessionStats.easy} color="text-emerald-500" />
        </div>
        <button
          onClick={onFinish}
          className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-slate-200 rounded-full h-2">
          <div
            className="bg-emerald-500 h-2 rounded-full transition-all"
            style={{ width: `${(current / queue.length) * 100}%` }}
          />
        </div>
        <span className="text-sm text-slate-500 whitespace-nowrap">
          {current + 1} / {queue.length}
        </span>
      </div>

      {/* Subcategory badge */}
      <div className="flex justify-between items-center">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {SUBCATEGORY_LABELS[card.subcategory] || card.subcategory}
        </span>
        <button
          onClick={onFinish}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          Exit
        </button>
      </div>

      <FlipCard
        key={card.id}
        card={card}
        direction={direction}
        onFlipped={() => setRevealed(true)}
      />

      {revealed ? (
        <>
          <RatingBar onRate={handleRate} />
          <QuestionBox card={card} />
        </>
      ) : (
        <p className="text-center text-sm text-slate-400">
          Tap the card to reveal the answer
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, color = 'text-slate-800' }) {
  return (
    <div className="flex flex-col items-center bg-slate-50 rounded-xl p-3">
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      <span className="text-xs text-slate-500 mt-1">{label}</span>
    </div>
  );
}
