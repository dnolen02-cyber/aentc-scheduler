// Parses and displays an AI scheduling response.
// - Strips the trailing {"_meta":{...}} JSON block (backend logging data)
// - Displays the first line (PROVIDER — LOCATION) as a prominent header
// - Renders remaining lines as formatted text
export default function ProviderResult({ response }) {
  // Remove the _meta JSON block before displaying
  const cleaned = response
    .replace(/\{"_meta":\{[\s\S]*?\}\}\s*$/, '')
    .trim()

  const lines = cleaned.split('\n')
  const header = lines[0]?.trim() || ''
  const body = lines.slice(1).filter(l => l.trim() !== '')

  return (
    <div className="bg-white rounded-xl shadow-sm border border-aentc-pale p-6">
      <div className="mb-2 text-xs font-semibold text-aentc-light uppercase tracking-wider">
        Recommendation
      </div>

      {/* Provider — Location (large bold green) */}
      <h2 className="text-xl font-bold text-aentc-dark mb-4 leading-snug">
        {header}
      </h2>

      {/* Instructions / bullet points */}
      {body.length > 0 && (
        <div className="text-sm text-gray-700 space-y-1.5 leading-relaxed">
          {body.map((line, i) => (
            <p key={i} className={(line.startsWith('•') || line.startsWith('-')) ? 'pl-1' : ''}>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
