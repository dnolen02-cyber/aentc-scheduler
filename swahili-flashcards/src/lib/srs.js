// SM-2 spaced repetition algorithm
// Ratings: 0=Again, 1=Hard, 2=Good, 3=Easy

const STORAGE_KEY = 'swahili_srs_v1';
const STREAK_KEY = 'swahili_streak_v1';

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function getCardState(progress, cardId) {
  return (
    progress[cardId] || {
      interval: 0,
      repetitions: 0,
      easeFactor: DEFAULT_EASE,
      nextReview: todayStr(),
      lastReview: null,
    }
  );
}

export function processRating(cardState, rating) {
  let { interval, repetitions, easeFactor } = cardState;

  if (rating === 0) {
    // Again — reset
    interval = 1;
    repetitions = 0;
    easeFactor = Math.max(MIN_EASE, easeFactor - 0.2);
  } else {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }

    if (rating === 1) {
      // Hard
      easeFactor = Math.max(MIN_EASE, easeFactor - 0.15);
      interval = Math.max(1, Math.round(interval * 1.2));
    } else if (rating === 3) {
      // Easy
      easeFactor = easeFactor + 0.15;
      interval = Math.round(interval * 1.3);
    }
    // Good (rating === 2): no ease change

    repetitions += 1;
  }

  return {
    interval,
    repetitions,
    easeFactor,
    nextReview: addDays(interval),
    lastReview: todayStr(),
  };
}

export function isDue(cardState) {
  return cardState.nextReview <= todayStr();
}

export function getDueCards(cards, progress) {
  return cards.filter((card) => isDue(getCardState(progress, card.id)));
}

export function getStats(cards, progress) {
  const today = todayStr();
  let mastered = 0;
  let learning = 0;
  let dueToday = 0;
  let newCards = 0;

  for (const card of cards) {
    const state = getCardState(progress, card.id);
    if (!state.lastReview) {
      newCards += 1;
      dueToday += 1;
    } else if (state.interval >= 21) {
      mastered += 1;
      if (state.nextReview <= today) dueToday += 1;
    } else {
      learning += 1;
      if (state.nextReview <= today) dueToday += 1;
    }
  }

  return { mastered, learning, newCards, dueToday, total: cards.length };
}

// ── Streak tracking ──────────────────────────────────────────────────────────

export function loadStreak() {
  try {
    return JSON.parse(localStorage.getItem(STREAK_KEY)) || { streak: 0, lastStudied: null };
  } catch {
    return { streak: 0, lastStudied: null };
  }
}

export function recordStudySession() {
  const today = todayStr();
  const streakData = loadStreak();

  if (streakData.lastStudied === today) return streakData;

  const yesterday = addDays(-1);
  const newStreak =
    streakData.lastStudied === yesterday ? streakData.streak + 1 : 1;

  const updated = { streak: newStreak, lastStudied: today };
  localStorage.setItem(STREAK_KEY, JSON.stringify(updated));
  return updated;
}
