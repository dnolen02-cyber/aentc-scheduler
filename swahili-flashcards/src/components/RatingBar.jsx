const RATINGS = [
  { value: 0, label: 'Again', description: 'Didn\'t know it', color: 'bg-red-500 hover:bg-red-600' },
  { value: 1, label: 'Hard', description: 'Struggled', color: 'bg-orange-400 hover:bg-orange-500' },
  { value: 2, label: 'Good', description: 'Got it', color: 'bg-blue-500 hover:bg-blue-600' },
  { value: 3, label: 'Easy', description: 'Knew it well', color: 'bg-emerald-500 hover:bg-emerald-600' },
];

export default function RatingBar({ onRate }) {
  return (
    <div className="flex gap-3 w-full">
      {RATINGS.map((r) => (
        <button
          key={r.value}
          onClick={() => onRate(r.value)}
          className={`flex-1 ${r.color} text-white rounded-xl py-3 flex flex-col items-center transition-colors`}
        >
          <span className="font-semibold text-sm">{r.label}</span>
          <span className="text-xs opacity-80 mt-0.5">{r.description}</span>
        </button>
      ))}
    </div>
  );
}
