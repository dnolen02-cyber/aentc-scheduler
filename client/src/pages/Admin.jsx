import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function authH(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-7 h-7 border-4 border-aentc-pale border-t-aentc-dark rounded-full animate-spin" />
    </div>
  )
}

function formatDt(iso) {
  if (!iso) return '—'
  return new Date(iso.endsWith('Z') ? iso : iso + 'Z').toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// ── Shared constants ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'general_ent',    label: 'General ENT' },
  { value: 'sleep',          label: 'Sleep' },
  { value: 'head_neck',      label: 'Head & Neck' },
  { value: 'neurotology',    label: 'Neurotology' },
  { value: 'laryngology',    label: 'Laryngology' },
  { value: 'facial_plastics',label: 'Facial Plastics' },
  { value: 'pediatric',      label: 'Pediatric' },
  { value: 'allergy',        label: 'Allergy' },
]

const CAT_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))

const LOCATIONS_LIST = ['Central', 'South', 'Village', 'North', 'Neurotology', 'Kyle']

const TITLES = ['MD', 'DO', 'PA', 'NP', 'SLP']

// ══ Conditions tab ════════════════════════════════════════════════════════════

const COND_EMPTY = { name: '', category: 'general_ent', audiogram_required: 'never', reasoning: '', is_active: true }

function ConditionsTab({ token }) {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(COND_EMPTY)
  const [saving, setSaving]     = useState(false)
  const [formErr, setFormErr]   = useState('')
  const [showInactive, setShowInactive] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/conditions', { headers: authH(token) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRows(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setEditing(null)
    setForm(COND_EMPTY)
    setFormErr('')
    setModal(true)
  }

  function openEdit(row) {
    setEditing(row)
    setForm({ name: row.name, category: row.category, audiogram_required: row.audiogram_required, reasoning: row.reasoning || '', is_active: !!row.is_active })
    setFormErr('')
    setModal(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setFormErr('')
    if (!form.name.trim()) return setFormErr('Name is required.')
    setSaving(true)
    try {
      const url = editing ? `/api/admin/conditions/${editing.id}` : '/api/admin/conditions'
      const res = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: authH(token), body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setModal(false)
      load()
    } catch (e) { setFormErr(e.message) }
    finally { setSaving(false) }
  }

  const visible = showInactive ? rows : rows.filter(r => r.is_active)

  if (loading) return <Spinner />

  return (
    <div>
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="text-base font-semibold text-aentc-dark">Conditions</h3>
          <p className="text-xs text-gray-500 mt-0.5">{rows.filter(r => r.is_active).length} active conditions across 8 categories.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="w-3.5 h-3.5 accent-aentc-dark" />
            Show inactive
          </label>
          <button onClick={openAdd} className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">+ Add Condition</button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-aentc-bg text-left">
            <tr>
              {['Condition','Category','Audiogram','Logic / Reasoning','Status',''].map(h => (
                <th key={h} className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map(r => (
              <tr key={r.id} className={`hover:bg-gray-50 ${!r.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-gray-800">{r.name}</td>
                <td className="px-4 py-3 text-gray-600">{CAT_LABEL[r.category] || r.category}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    r.audiogram_required === 'always'    ? 'bg-amber-100 text-amber-700' :
                    r.audiogram_required === 'sometimes' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>{r.audiogram_required}</span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs max-w-xs">
                  {r.reasoning ? (
                    <span title={r.reasoning}>{r.reasoning.slice(0, 80)}{r.reasoning.length > 80 ? '…' : ''}</span>
                  ) : <span className="italic text-gray-400">No reasoning set</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {r.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(r)} className="text-aentc-light hover:text-aentc-dark text-xs font-medium hover:underline">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h4 className="font-semibold text-aentc-dark">{editing ? 'Edit Condition' : 'Add Condition'}</h4>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              {formErr && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{formErr}</div>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-400">*</span></label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Sinusitis (Chronic)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light">
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Audiogram Required</label>
                  <select value={form.audiogram_required} onChange={e => setForm(f => ({...f, audiogram_required: e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light">
                    <option value="never">Never</option>
                    <option value="sometimes">Sometimes</option>
                    <option value="always">Always</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Logic / Reasoning <span className="text-gray-400 font-normal text-xs">(visible to admin — explains categorization decisions)</span>
                </label>
                <textarea value={form.reasoning} onChange={e => setForm(f => ({...f, reasoning: e.target.value}))} rows={5} placeholder="Explain why this condition is categorized here, which providers are best suited, and any scheduling considerations…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light resize-none" />
              </div>

              {editing && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="cond_active" checked={form.is_active} onChange={e => setForm(f => ({...f, is_active: e.target.checked}))} className="w-4 h-4 accent-aentc-dark" />
                  <label htmlFor="cond_active" className="text-sm text-gray-700">Active (visible to schedulers)</label>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
                <button type="submit" disabled={saving} className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-60">
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Condition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ══ Providers tab ══════════════════════════════════════════════════════════════

const PROV_EMPTY = { name: '', title: 'MD', specialty: '', supervising_provider_id: '', locations: [], general_notes: '', is_active: true }

function ProvidersTab({ token }) {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState(PROV_EMPTY)
  const [saving, setSaving]     = useState(false)
  const [formErr, setFormErr]   = useState('')

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/providers', { headers: authH(token) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRows(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setEditing(null)
    setForm(PROV_EMPTY)
    setFormErr('')
    setModal(true)
  }

  function openEdit(row) {
    setEditing(row)
    setForm({
      name: row.name, title: row.title, specialty: row.specialty || '',
      supervising_provider_id: row.supervising_provider_id ? String(row.supervising_provider_id) : '',
      locations: row.locations || [],
      general_notes: row.general_notes || '',
      is_active: !!row.is_active,
    })
    setFormErr('')
    setModal(true)
  }

  function toggleLocation(loc) {
    setForm(f => ({
      ...f,
      locations: f.locations.includes(loc) ? f.locations.filter(l => l !== loc) : [...f.locations, loc],
    }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setFormErr('')
    if (!form.name.trim()) return setFormErr('Name is required.')
    setSaving(true)
    try {
      const body = { ...form, supervising_provider_id: form.supervising_provider_id ? Number(form.supervising_provider_id) : null }
      const url  = editing ? `/api/admin/providers/${editing.id}` : '/api/admin/providers'
      const res  = await fetch(url, { method: editing ? 'PUT' : 'POST', headers: authH(token), body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setModal(false)
      load()
    } catch (e) { setFormErr(e.message) }
    finally { setSaving(false) }
  }

  const mds = rows.filter(r => r.title === 'MD' || r.title === 'DO')

  if (loading) return <Spinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-aentc-dark">Providers</h3>
          <p className="text-xs text-gray-500 mt-0.5">{rows.filter(r => r.is_active).length} active providers.</p>
        </div>
        <button onClick={openAdd} className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">+ Add Provider</button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-aentc-bg text-left">
            <tr>
              {['Name','Title','Specialty','Locations','Supervising','Status',''].map(h => (
                <th key={h} className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => (
              <tr key={r.id} className={`hover:bg-gray-50 ${!r.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-gray-800">{r.name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${r.title === 'MD' || r.title === 'DO' ? 'bg-aentc-pale text-aentc-dark' : 'bg-gray-100 text-gray-600'}`}>{r.title}</span>
                </td>
                <td className="px-4 py-3 text-gray-600 capitalize">{r.specialty?.replace(/_/g, ' ') || '—'}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{r.locations?.join(', ') || '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{r.supervising_name || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {r.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(r)} className="text-aentc-light hover:text-aentc-dark text-xs font-medium hover:underline">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h4 className="font-semibold text-aentc-dark">{editing ? 'Edit Provider' : 'Add Provider'}</h4>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              {formErr && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{formErr}</div>}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-400">*</span></label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Ashley Dao" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <select value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light">
                    {TITLES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specialty</label>
                  <input type="text" value={form.specialty} onChange={e => setForm(f => ({...f, specialty: e.target.value}))} placeholder="e.g. rhinology" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supervising MD (PAs/NPs only)</label>
                <select value={form.supervising_provider_id} onChange={e => setForm(f => ({...f, supervising_provider_id: e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light">
                  <option value="">None</option>
                  {mds.map(m => <option key={m.id} value={String(m.id)}>{m.name}, {m.title}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Locations</label>
                <div className="flex flex-wrap gap-2">
                  {LOCATIONS_LIST.map(loc => (
                    <button key={loc} type="button" onClick={() => toggleLocation(loc)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${form.locations.includes(loc) ? 'bg-aentc-dark text-white border-aentc-dark' : 'bg-white text-gray-600 border-gray-300 hover:border-aentc-medium'}`}>
                      {loc}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scheduling Notes</label>
                <textarea value={form.general_notes} onChange={e => setForm(f => ({...f, general_notes: e.target.value}))} rows={4} placeholder="Restrictions, special instructions, insurance limitations…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light resize-none" />
              </div>

              {editing && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="prov_active" checked={form.is_active} onChange={e => setForm(f => ({...f, is_active: e.target.checked}))} className="w-4 h-4 accent-aentc-dark" />
                  <label htmlFor="prov_active" className="text-sm text-gray-700">Active</label>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
                <button type="submit" disabled={saving} className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-60">
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Provider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ══ Preferences tab ═══════════════════════════════════════════════════════════

function PreferencesTab({ token }) {
  const [conditions, setConditions]   = useState([])
  const [providers, setProviders]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [selectedCondId, setSelectedCondId] = useState('')
  const [wantIds, setWantIds]         = useState([])   // provider ids
  const [avoidIds, setAvoidIds]       = useState([])
  const [notes, setNotes]             = useState({})   // { [providerId]: noteText }
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/conditions', { headers: authH(token) }).then(r => r.json()),
      fetch('/api/admin/providers', { headers: authH(token) }).then(r => r.json()),
    ]).then(([conds, provs]) => {
      setConditions(Array.isArray(conds) ? conds.filter(c => c.is_active) : [])
      setProviders(Array.isArray(provs) ? provs.filter(p => p.is_active) : [])
    }).catch(e => setError(e.message))
    .finally(() => setLoading(false))
  }, [token])

  async function loadPrefs(condId) {
    setSelectedCondId(condId)
    setWantIds([])
    setAvoidIds([])
    setNotes({})
    setSaved(false)
    if (!condId) return

    // Fetch ALL provider preferences for all providers, filter by condition
    // We use the providers list and fetch each provider's preferences — but it's more
    // efficient to fetch preferences per condition. We'll iterate provider preferences
    // by loading each provider's prefs... actually the API is per-provider.
    // Let's load all providers' preferences for this condition using a parallel fetch.
    try {
      const results = await Promise.all(
        providers.map(p =>
          fetch(`/api/admin/providers/${p.id}/preferences`, { headers: authH(token) })
            .then(r => r.json())
        )
      )
      const wantList  = []
      const avoidList = []
      const notesMap  = {}

      results.forEach((res, i) => {
        const pid = providers[i].id
        const match = res.preferences?.find(pr => pr.condition_id === Number(condId))
        if (match?.preference === 'want')  { wantList.push(pid);  if (match.scheduling_note) notesMap[pid] = match.scheduling_note }
        if (match?.preference === 'avoid') { avoidList.push(pid); if (match.scheduling_note) notesMap[pid] = match.scheduling_note }
      })

      setWantIds(wantList)
      setAvoidIds(avoidList)
      setNotes(notesMap)
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleSave() {
    if (!selectedCondId) return
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      // Save via PATCH for each provider to avoid clobbering other condition prefs
      const all = providers.map(p => {
        const pref = wantIds.includes(p.id) ? 'want' : avoidIds.includes(p.id) ? 'avoid' : 'neutral'
        return fetch(`/api/admin/providers/${p.id}/preferences/${selectedCondId}`, {
          method: 'PATCH',
          headers: authH(token),
          body: JSON.stringify({ preference: pref, scheduling_note: notes[p.id] || null }),
        })
      })
      await Promise.all(all)
      setSaved(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function toggleProvider(pid, list, setList, otherList, setOtherList) {
    if (list.includes(pid)) {
      setList(list.filter(id => id !== pid))
    } else {
      setList([...list, pid])
      setOtherList(otherList.filter(id => id !== pid))
    }
    setSaved(false)
  }

  const selectedCond = conditions.find(c => c.id === Number(selectedCondId))

  const grouped = conditions.reduce((acc, c) => {
    if (!acc[c.category]) acc[c.category] = []
    acc[c.category].push(c)
    return acc
  }, {})

  if (loading) return <Spinner />

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-aentc-dark">Provider Preferences</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Select a condition to manage which providers prefer or prefer not to see it. Everyone else is neutral.
        </p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Condition picker */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Select a Condition</label>
        <select
          value={selectedCondId}
          onChange={e => loadPrefs(e.target.value)}
          className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light"
        >
          <option value="">— Choose condition —</option>
          {Object.entries(grouped).map(([cat, items]) => (
            <optgroup key={cat} label={CAT_LABEL[cat] || cat}>
              {items.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {selectedCondId && (
        <>
          {/* Condition reasoning reminder */}
          {selectedCond?.reasoning && (
            <div className="mb-5 bg-aentc-bg border border-aentc-pale rounded-lg px-4 py-3 text-xs text-gray-600 leading-relaxed">
              <span className="font-semibold text-aentc-dark">Logic: </span>{selectedCond.reasoning}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            {/* Want list */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-emerald-800 mb-3">
                ★ Providers who prefer to see this
                <span className="ml-2 text-xs font-normal text-emerald-600">({wantIds.length} selected)</span>
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {providers.map(p => (
                  <label key={p.id} className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={wantIds.includes(p.id)}
                      onChange={() => toggleProvider(p.id, wantIds, setWantIds, avoidIds, setAvoidIds)}
                      className="w-4 h-4 accent-emerald-700 mt-0.5 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-sm text-gray-800 group-hover:text-emerald-800 transition-colors">
                        {p.name}, {p.title}
                      </span>
                      {wantIds.includes(p.id) && (
                        <input
                          type="text"
                          value={notes[p.id] || ''}
                          onChange={e => { setNotes(n => ({...n, [p.id]: e.target.value})); setSaved(false) }}
                          placeholder="Scheduling note (optional)…"
                          onClick={e => e.stopPropagation()}
                          className="mt-1 w-full border border-emerald-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Avoid list */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-amber-800 mb-3">
                ↓ Providers who prefer NOT to see this
                <span className="ml-2 text-xs font-normal text-amber-600">({avoidIds.length} selected)</span>
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {providers.map(p => (
                  <label key={p.id} className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={avoidIds.includes(p.id)}
                      onChange={() => toggleProvider(p.id, avoidIds, setAvoidIds, wantIds, setWantIds)}
                      className="w-4 h-4 accent-amber-600 mt-0.5 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-sm text-gray-800 group-hover:text-amber-800 transition-colors">
                        {p.name}, {p.title}
                      </span>
                      {avoidIds.includes(p.id) && (
                        <input
                          type="text"
                          value={notes[p.id] || ''}
                          onChange={e => { setNotes(n => ({...n, [p.id]: e.target.value})); setSaved(false) }}
                          placeholder="Scheduling note (optional)…"
                          onClick={e => e.stopPropagation()}
                          className="mt-1 w-full border border-amber-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-aentc-dark hover:bg-aentc-medium text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Preferences'}
            </button>
            {saved && <span className="text-sm text-emerald-600 font-medium">✓ Saved</span>}
          </div>
        </>
      )}
    </div>
  )
}

// ══ Assignments Log tab ═══════════════════════════════════════════════════════

const LOC_OPTS = ['', ...['Central', 'South', 'Village', 'North', 'Neurotology', 'Kyle']]

function AssignmentsTab({ token }) {
  const [rows, setRows]           = useState([])
  const [total, setTotal]         = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading]     = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError]         = useState('')
  const [filters, setFilters]     = useState({ startDate: '', endDate: '', location: '', scheduled_by: '', page: 1 })

  async function load(f = filters) {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([,v]) => v !== '')))
      const res = await fetch(`/api/admin/assignments?${params}`, { headers: authH(token) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRows(data.rows)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function handleChange(e) { setFilters(f => ({...f, [e.target.name]: e.target.value, page: 1})) }

  function handleSearch(e) { e.preventDefault(); load({...filters, page: 1}) }

  function handleClear() { const c = { startDate:'',endDate:'',location:'',scheduled_by:'',page:1 }; setFilters(c); load(c) }

  function handlePage(p) { const f = {...filters, page: p}; setFilters(f); load(f) }

  async function handleExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([k,v]) => v !== '' && k !== 'page')))
      const res = await fetch(`/api/admin/assignments/export?${params}`, { headers: authH(token) })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'assignments.csv'; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e.message) }
    finally { setExporting(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-aentc-dark">Assignment Log</h3>
          <p className="text-xs text-gray-500 mt-0.5">Every scheduling assignment made by schedulers. Total: <strong>{total}</strong></p>
        </div>
        <button onClick={handleExport} disabled={exporting || total === 0} className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
          {exporting ? 'Exporting…' : '↓ Export CSV'}
        </button>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-3 mb-4 p-4 bg-aentc-bg rounded-lg">
        {[
          { label: 'From', name: 'startDate', type: 'date' },
          { label: 'To',   name: 'endDate',   type: 'date' },
          { label: 'Scheduler', name: 'scheduled_by', type: 'text', placeholder: 'Username…' },
        ].map(f => (
          <div key={f.name} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">{f.label}</label>
            <input type={f.type} name={f.name} value={filters[f.name]} onChange={handleChange} placeholder={f.placeholder}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light" />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Location</label>
          <select name="location" value={filters.location} onChange={handleChange} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light">
            {LOC_OPTS.map(l => <option key={l} value={l}>{l || 'All Locations'}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors">Filter</button>
          <button type="button" onClick={handleClear} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5">Clear</button>
        </div>
      </form>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? <Spinner /> : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No assignments found.</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-aentc-bg text-left">
                <tr>
                  {['Date/Time','Provider','Condition','Location','Scheduled By','Notes'].map(h => (
                    <th key={h} className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{formatDt(row.scheduled_at)}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">{row.provider_name}, {row.provider_title}</td>
                    <td className="px-4 py-2.5 text-gray-700">{row.condition_name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{row.location || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500">{row.scheduled_by_username || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs max-w-xs truncate">{row.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>Page {filters.page} of {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => handlePage(filters.page - 1)} disabled={filters.page <= 1} className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">← Prev</button>
                <button onClick={() => handlePage(filters.page + 1)} disabled={filters.page >= totalPages} className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Next →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ══ Rules Editor tab (kept from original) ════════════════════════════════════

const RULE_LABELS = { global_rules: 'Global Rules', audiogram_rules: 'Audiogram Rules' }

function RulesTab({ token }) {
  const [rules, setRules]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [selectedKey, setSelectedKey] = useState(null)
  const [draft, setDraft]         = useState('')
  const [dirty, setDirty]         = useState(false)
  const [saving, setSaving]       = useState(false)
  const [status, setStatus]       = useState('')
  const [error, setError]         = useState('')

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/rules', { headers: authH(token) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Only show global/audiogram rules (others are now replaced by structured data)
      const filtered = data.filter(r => ['global_rules','audiogram_rules'].includes(r.rule_key))
      setRules(filtered)
      if (!selectedKey && filtered.length > 0) { setSelectedKey(filtered[0].rule_key); setDraft(filtered[0].rule_text) }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function selectRule(rule) {
    if (dirty && !confirm('Discard unsaved changes?')) return
    setSelectedKey(rule.rule_key); setDraft(rule.rule_text); setDirty(false); setStatus('')
  }

  async function handleSave() {
    setSaving(true); setStatus('')
    try {
      const res  = await fetch(`/api/admin/rules/${selectedKey}`, { method: 'PUT', headers: authH(token), body: JSON.stringify({ rule_text: draft }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRules(prev => prev.map(r => r.rule_key === selectedKey ? data : r))
      setDirty(false); setStatus('saved')
    } catch (e) { setStatus('error:' + e.message) }
    finally { setSaving(false) }
  }

  const selectedRule = rules.find(r => r.rule_key === selectedKey)
  if (loading) return <Spinner />
  if (error) return <div className="text-sm text-red-600 py-4">{error}</div>

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-aentc-dark">Rules Editor</h3>
        <p className="text-xs text-gray-500 mt-0.5">Global and audiogram rules used by the Symptom Bot and scheduling system.</p>
      </div>
      <div className="flex gap-5 min-h-[480px]">
        <div className="w-44 shrink-0 space-y-1">
          {rules.map(rule => (
            <button key={rule.rule_key} onClick={() => selectRule(rule)} className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${selectedKey === rule.rule_key ? 'bg-aentc-dark text-white font-medium' : 'text-gray-600 hover:bg-gray-100'}`}>
              {RULE_LABELS[rule.rule_key] || rule.rule_key}
              {selectedKey === rule.rule_key && dirty && <span className="ml-1 text-aentc-pale text-xs">●</span>}
            </button>
          ))}
        </div>
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {selectedRule && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  {selectedRule.updated_by
                    ? <>Last saved by <span className="font-medium text-gray-600">{selectedRule.updated_by}</span> on {formatDt(selectedRule.updated_at)}</>
                    : 'Not yet edited — showing seed data'}
                </div>
                <div className="flex items-center gap-3">
                  {status === 'saved' && <span className="text-xs text-green-600 font-medium">Saved</span>}
                  {status.startsWith('error:') && <span className="text-xs text-red-600">{status.slice(6)}</span>}
                  <button onClick={handleSave} disabled={!dirty || saving} className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-40">
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
              <textarea value={draft} onChange={e => { setDraft(e.target.value); setDirty(true); setStatus('') }} spellCheck={false} className="flex-1 w-full border border-gray-300 rounded-lg px-4 py-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-aentc-light resize-none" style={{ minHeight: '420px' }} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ══ User Management tab (kept from original) ══════════════════════════════════

const EMPTY_USER = { username: '', email: '', role: 'scheduler', password: '' }

function UsersTab({ token, currentUser }) {
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [showAdd, setShowAdd]     = useState(false)
  const [form, setForm]           = useState(EMPTY_USER)
  const [formErr, setFormErr]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetPw, setResetPw]     = useState('')
  const [resetErr, setResetErr]   = useState('')
  const [resetSaving, setResetSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/users', { headers: authH(token) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsers(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e) {
    e.preventDefault(); setFormErr('')
    if (form.password.length < 8) return setFormErr('Password must be at least 8 characters.')
    setSaving(true)
    try {
      const res  = await fetch('/api/admin/users', { method: 'POST', headers: authH(token), body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowAdd(false); setForm(EMPTY_USER); load()
    } catch (e) { setFormErr(e.message) }
    finally { setSaving(false) }
  }

  async function handleReset(e) {
    e.preventDefault(); setResetErr('')
    if (resetPw.length < 8) return setResetErr('Password must be at least 8 characters.')
    setResetSaving(true)
    try {
      const res  = await fetch(`/api/admin/users/${resetTarget.id}/reset-password`, { method: 'PUT', headers: authH(token), body: JSON.stringify({ password: resetPw }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResetTarget(null); setResetPw('')
    } catch (e) { setResetErr(e.message) }
    finally { setResetSaving(false) }
  }

  async function toggleActive(user) {
    const action = user.is_active ? 'deactivate' : 'reactivate'
    if (user.is_active && !confirm(`Deactivate ${user.username}?`)) return
    try {
      const res  = await fetch(`/api/admin/users/${user.id}/${action}`, { method: 'PUT', headers: authH(token) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      load()
    } catch (e) { setError(e.message) }
  }

  if (loading) return <Spinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-aentc-dark">User Management</h3>
          <p className="text-xs text-gray-500 mt-0.5">New users must change their password on first login.</p>
        </div>
        <button onClick={() => { setForm(EMPTY_USER); setFormErr(''); setShowAdd(true) }} className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">+ Add User</button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-aentc-bg text-left">
            <tr>{['Username','Email','Role','Status','Created','Actions'].map(h => <th key={h} className="px-4 py-3 font-semibold text-gray-600">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-gray-800">{u.username}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${u.role === 'admin' ? 'bg-aentc-pale text-aentc-dark' : 'bg-gray-100 text-gray-600'}`}>{u.role}</span></td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 space-x-3 whitespace-nowrap">
                  <button onClick={() => { setResetTarget(u); setResetPw(''); setResetErr('') }} className="text-aentc-light hover:text-aentc-dark text-xs font-medium hover:underline">Reset Password</button>
                  {u.id !== currentUser?.id && (
                    <button onClick={() => toggleActive(u)} className={`text-xs font-medium hover:underline ${u.is_active ? 'text-red-400 hover:text-red-600' : 'text-green-500 hover:text-green-700'}`}>
                      {u.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="font-semibold text-aentc-dark">Add User</h4>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleAdd} className="px-6 py-5 space-y-4">
              {formErr && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{formErr}</div>}
              {[{ l:'Username',n:'username',t:'text',p:'jsmith'},{l:'Email',n:'email',t:'email',p:'jsmith@austinent.com'},{l:'Temp Password',n:'password',t:'password',p:'Min 8 characters'}].map(f => (
                <div key={f.n}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.l}</label>
                  <input type={f.t} name={f.n} value={form[f.n]} onChange={e => setForm(fm => ({...fm, [e.target.name]: e.target.value}))} required placeholder={f.p} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select name="role" value={form.role} onChange={e => setForm(fm => ({...fm, role: e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light">
                  <option value="scheduler">Scheduler</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 font-medium">Cancel</button>
                <button type="submit" disabled={saving} className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-60">{saving ? 'Creating…' : 'Create User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="font-semibold text-aentc-dark">Reset — {resetTarget.username}</h4>
              <button onClick={() => setResetTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleReset} className="px-6 py-5 space-y-4">
              {resetErr && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{resetErr}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Temporary Password</label>
                <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)} required placeholder="Min 8 characters" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light" />
                <p className="text-xs text-gray-400 mt-1">User will be prompted to change this on next login.</p>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setResetTarget(null)} className="px-4 py-2 text-sm text-gray-600 font-medium">Cancel</button>
                <button type="submit" disabled={resetSaving} className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-60">{resetSaving ? 'Saving…' : 'Set Password'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ══ Admin page shell ══════════════════════════════════════════════════════════

const TABS = [
  { key: 'conditions',  label: 'Conditions' },
  { key: 'providers',   label: 'Providers' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'users',       label: 'Users' },
  { key: 'rules',       label: 'Rules' },
]

export default function Admin({ token, user, onLogout }) {
  const navigate   = useNavigate()
  const [tab, setTab] = useState('conditions')

  return (
    <div className="min-h-screen bg-aentc-bg flex flex-col">
      <header className="bg-aentc-dark text-white px-6 py-3 flex items-center justify-between shadow-md shrink-0">
        <span className="font-bold text-lg tracking-tight">AENTC — Admin Panel</span>
        <div className="flex items-center gap-4 text-sm">
          <button onClick={() => navigate('/scheduler')} className="hover:text-aentc-pale transition-colors">← Scheduler</button>
          <button onClick={() => navigate('/change-password')} className="hover:text-aentc-pale transition-colors">{user?.username}</button>
          <button onClick={onLogout} className="bg-aentc-medium hover:bg-aentc-light px-3 py-1 rounded-md transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        {/* Tab bar */}
        <div className="flex gap-0.5 mb-6 border-b border-gray-200 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px border-b-2 whitespace-nowrap ${
                tab === t.key
                  ? 'border-aentc-dark text-aentc-dark bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-aentc-pale p-6">
          {tab === 'conditions'  && <ConditionsTab  token={token} />}
          {tab === 'providers'   && <ProvidersTab   token={token} />}
          {tab === 'preferences' && <PreferencesTab token={token} />}
          {tab === 'assignments' && <AssignmentsTab token={token} />}
          {tab === 'users'       && <UsersTab       token={token} currentUser={user} />}
          {tab === 'rules'       && <RulesTab       token={token} />}
        </div>
      </main>
    </div>
  )
}
