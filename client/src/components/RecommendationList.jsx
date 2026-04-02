import { useState } from 'react'

const PREF = {
  want:    { label: '★ Prefers',            bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  neutral: { label: '✓ Available',          bg: 'bg-blue-50  text-blue-700  border-blue-200' },
  avoid:   { label: '↓ Prefers not to see', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
}

const SUBSPECIALTY_LABELS = {
  neurotology:     'Neurotology',
  laryngology:     'Laryngology',
  facial_plastics: 'Facial Plastics',
  rhinology:       'Rhinology',
  sleep:           'Sleep Medicine',
}

function ProviderCard({ provider, rank, onAssignClick }) {
  const [expanded, setExpanded] = useState(false)
  const pref = PREF[provider.preference] ?? PREF.neutral
  const hasLongNotes = provider.general_notes && provider.general_notes.length > 120
  const subspecialtyLabel = SUBSPECIALTY_LABELS[provider.specialty]

  return (
    <div className={`rounded-lg border p-4 transition-opacity ${
      provider.preference === 'avoid' ? 'opacity-70' : ''
    } ${subspecialtyLabel ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-start gap-3">
        {/* Rank bubble */}
        <div className={`shrink-0 w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold mt-0.5 ${
          subspecialtyLabel
            ? 'bg-indigo-100 border-indigo-300 text-indigo-800'
            : 'bg-aentc-bg border-aentc-pale text-aentc-dark'
        }`}>
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-bold text-aentc-dark text-sm">
              {provider.name},&nbsp;{provider.title}
            </span>
            {subspecialtyLabel && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-indigo-100 text-indigo-800 border-indigo-300">
                ✦ {subspecialtyLabel}
              </span>
            )}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${pref.bg}`}>
              {pref.label}
            </span>
          </div>

          {/* Locations */}
          {provider.locations?.length > 0 && (
            <p className="text-xs text-gray-500 mb-1">
              {provider.locations.join(' · ')}
              {provider.supervising_name && (
                <span className="ml-2 text-gray-400">— supervises under {provider.supervising_name}</span>
              )}
            </p>
          )}

          {/* Scheduling note (preference-specific) */}
          {provider.scheduling_note && (
            <div className="mt-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
              → {provider.scheduling_note}
            </div>
          )}

          {/* General provider notes */}
          {provider.general_notes && (
            <div className="mt-1.5 text-xs text-gray-500 leading-relaxed">
              {hasLongNotes && !expanded
                ? <>{provider.general_notes.slice(0, 120)}…{' '}
                    <button onClick={() => setExpanded(true)} className="text-aentc-light hover:underline">more</button>
                  </>
                : <>{provider.general_notes}{' '}
                    {hasLongNotes && <button onClick={() => setExpanded(false)} className="text-aentc-light hover:underline">less</button>}
                  </>
              }
            </div>
          )}
        </div>

        {/* Assign button */}
        <button
          onClick={() => onAssignClick(provider)}
          className="shrink-0 bg-aentc-dark hover:bg-aentc-medium text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
        >
          Assign
        </button>
      </div>
    </div>
  )
}

const CATEGORY_LABELS = {
  general_ent:    'General ENT',
  sleep:          'Sleep',
  head_neck:      'Head & Neck',
  neurotology:    'Neurotology',
  laryngology:    'Laryngology',
  facial_plastics:'Facial Plastics',
  pediatric:      'Pediatric',
  allergy:        'Allergy',
}

// selectedLocations: string[] — the location pills the scheduler selected (may be empty)
// overall: all providers ranked — used as the authoritative sorted list
export default function RecommendationList({ recommendation, selectedLocations = [], onAssignClick }) {
  const { condition, overall } = recommendation

  // Filter overall list to providers available at any of the selected locations
  const locationFiltered = selectedLocations.length > 0
    ? overall.filter(p => p.locations?.some(l => selectedLocations.includes(l)))
    : []

  const locationLabel = selectedLocations.length > 0
    ? selectedLocations.join(' / ')
    : null

  return (
    <div className="space-y-5">

      {/* Condition header */}
      <div className="bg-aentc-dark text-white rounded-xl px-5 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs text-aentc-pale uppercase tracking-wider font-medium mb-0.5">
              {CATEGORY_LABELS[condition.category] || condition.category}
            </p>
            <h2 className="text-xl font-bold leading-tight">{condition.name}</h2>
          </div>
          <div className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg ${
            condition.audiogram_required === 'always'
              ? 'bg-amber-400 text-amber-900'
              : condition.audiogram_required === 'sometimes'
              ? 'bg-yellow-200 text-yellow-900'
              : 'bg-aentc-medium text-white'
          }`}>
            {condition.audiogram_required === 'always'
              ? '🔊 Audiogram required first'
              : condition.audiogram_required === 'sometimes'
              ? '🔊 Audiogram may be needed'
              : '✓ No audiogram needed'}
          </div>
        </div>
      </div>

      {/* Location-specific results */}
      {locationLabel && (
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            At {locationLabel} — {locationFiltered.length} provider{locationFiltered.length !== 1 ? 's' : ''}
          </h3>
          {locationFiltered.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white rounded-lg border border-gray-200 p-4">
              No active providers at {locationLabel} for this condition.
            </p>
          ) : (
            <div className="space-y-2">
              {locationFiltered.map((p, i) => (
                <ProviderCard key={p.id} provider={p} rank={i + 1} onAssignClick={onAssignClick} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Overall results */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          {locationLabel ? 'All Locations' : 'All Providers'} — {overall.length}
        </h3>
        <div className="space-y-2">
          {overall.map((p, i) => (
            <ProviderCard key={p.id} provider={p} rank={i + 1} onAssignClick={onAssignClick} />
          ))}
        </div>
      </section>
    </div>
  )
}
