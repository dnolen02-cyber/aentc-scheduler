import { useState, useCallback } from 'react';
import HomeScreen from './components/HomeScreen.jsx';
import StudySession from './components/StudySession.jsx';
import { loadProgress, loadStreak } from './lib/srs.js';

export default function App() {
  const [progress, setProgress] = useState(() => loadProgress());
  const [streak, setStreak] = useState(() => loadStreak().streak);
  const [session, setSession] = useState(null); // { cards, direction }

  const handleStart = useCallback((deckKey, direction, cards) => {
    // Shuffle the cards for this session
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setSession({ deckKey, direction, cards: shuffled });
  }, []);

  const handleProgress = useCallback((updated) => {
    setProgress(updated);
  }, []);

  const handleFinish = useCallback(() => {
    setStreak(loadStreak().streak);
    setSession(null);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center">
      <div className="w-full max-w-lg px-4 py-6">
        {session ? (
          <StudySession
            cards={session.cards}
            direction={session.direction}
            progress={progress}
            onProgress={handleProgress}
            onFinish={handleFinish}
          />
        ) : (
          <HomeScreen progress={progress} streak={streak} onStart={handleStart} />
        )}
      </div>
    </div>
  );
}
