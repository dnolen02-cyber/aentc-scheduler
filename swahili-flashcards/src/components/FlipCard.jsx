import { useState } from 'react';

export default function FlipCard({ card, direction, onFlipped }) {
  const [flipped, setFlipped] = useState(false);

  const front = direction === 'en_sw' ? card.english : card.swahili;
  const back = direction === 'en_sw' ? card.swahili : card.english;
  const frontLang = direction === 'en_sw' ? 'English' : 'Swahili';
  const backLang = direction === 'en_sw' ? 'Swahili' : 'English';

  function handleFlip() {
    if (!flipped) {
      setFlipped(true);
      onFlipped();
    }
  }

  return (
    <div
      className="w-full cursor-pointer select-none"
      style={{ perspective: '1000px', height: '260px' }}
      onClick={handleFlip}
    >
      <div className={`flip-card-inner${flipped ? ' flipped' : ''}`}>
        {/* Front */}
        <div className="flip-card-face flip-card-front bg-white rounded-2xl shadow-lg border border-slate-200 flex flex-col items-center justify-center p-8">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
            {frontLang}
          </span>
          <p className="text-2xl font-semibold text-slate-800 text-center leading-snug">
            {front}
          </p>
          {!flipped && (
            <p className="mt-6 text-sm text-slate-400">tap to reveal</p>
          )}
        </div>

        {/* Back */}
        <div className="flip-card-face flip-card-back bg-emerald-50 rounded-2xl shadow-lg border border-emerald-200 flex flex-col items-center justify-center p-8">
          <span className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-4">
            {backLang}
          </span>
          <p className="text-2xl font-bold text-emerald-900 text-center leading-snug">
            {back}
          </p>
          {card.notes && (
            <p className="mt-4 text-sm text-emerald-700 text-center italic max-w-xs">
              {card.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
