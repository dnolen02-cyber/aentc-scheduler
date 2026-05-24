import { conversationalCards } from './conversational.js';
import { medicalCards } from './medical.js';

export const allCards = [...conversationalCards, ...medicalCards];

export { conversationalCards, medicalCards };

export const DECKS = {
  all: { label: 'All Cards', cards: allCards, color: 'bg-slate-700' },
  conversational: {
    label: 'Conversational',
    cards: conversationalCards,
    color: 'bg-emerald-700',
    description: 'Life, family, news, politics, business',
  },
  medical: {
    label: 'Medical / ENT',
    cards: medicalCards,
    color: 'bg-blue-700',
    description: 'Anatomy, symptoms, allergy intake, clinical',
  },
};

export const SUBCATEGORY_LABELS = {
  greetings: 'Greetings',
  life_updates: 'Life Updates',
  family: 'Family',
  current_events: 'Current Events',
  politics: 'Politics',
  business: 'Business',
  opinions: 'Opinions',
  proverbs: 'Proverbs & Expressions',
  anatomy: 'Anatomy',
  symptoms: 'Symptoms',
  allergy_intake: 'Allergy Intake',
  instructions: 'Clinical Instructions',
  scheduling: 'Scheduling & Insurance',
};
