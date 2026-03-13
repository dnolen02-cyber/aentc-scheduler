import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// ── Shared helpers ────────────────────────────────────────────────────────────

function authHeaders(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

// ── Condition Mappings tab ────────────────────────────────────────────────────

const EMPTY_FORM = {
  condition_name: '',
  general_ent: true,
  subspecialty: '',
  subspecialty_preferred: false,
  notes: '',
}

function ConditionMappings({ token }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)   // row being edited, or null for new
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/conditions', { headers: authHeaders(token) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRows(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowModal(true)
  }

  function openEdit(row) {
    setEditing(row)
    setForm({
      condition_name: row.condition_name,
      general_ent: !!row.general_ent,
      subspecialty: row.subspecialty || '',
      subspecialty_preferred: !!row.subspecialty_preferred,
      notes: row.notes || '',
    })
    setFormError('')
    setShowModal(true)
  }

  function handleFormChange(e) {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setFormError('')
    if (!form.condition_name.trim()) {
      return setFormError('Condition name is required.')
    }
    setSaving(true)
    try {
      const url = editing ? `/api/admin/conditions/${editing.id}` : '/api/admin/conditions'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: authHeaders(token),
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowModal(false)
      load()
    } catch (e) {
      setFormError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(row) {
    if (!confirm(`Delete mapping for "${row.condition_name}"?`)) return
    try {
      const res = await fetch(`/api/admin/conditions/${row.id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-7 h-7 border-4 border-aentc-pale border-t-aentc-dark rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-aentc-dark">Condition Mappings</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Maps complaints to subspecialties so the AI can highlight the best-fit providers.
            Changes take effect on the next query — no restart needed.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + Add Condition
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          No condition mappings yet. Click <strong>+ Add Condition</strong> to create one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-aentc-bg text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-600">Condition</th>
                <th className="px-4 py-3 font-semibold text-gray-600">General ENT</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Subspecialty</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Preferred</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Notes</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800 capitalize">{row.condition_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${row.general_ent ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {row.general_ent ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{row.subspecialty || '—'}</td>
                  <td className="px-4 py-3">
                    {row.subspecialty ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${row.subspecialty_preferred ? 'bg-aentc-pale text-aentc-dark' : 'bg-gray-100 text-gray-500'}`}>
                        {row.subspecialty_preferred ? 'Yes ★' : 'No'}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{row.notes || '—'}</td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => openEdit(row)}
                      className="text-aentc-light hover:text-aentc-dark text-xs font-medium hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(row)}
                      className="text-red-400 hover:text-red-600 text-xs font-medium hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add / Edit modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="font-semibold text-aentc-dark">
                {editing ? 'Edit Condition' : 'Add Condition'}
              </h4>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Condition Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="condition_name"
                  value={form.condition_name}
                  onChange={handleFormChange}
                  placeholder="e.g. chronic cough"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="general_ent"
                  name="general_ent"
                  checked={form.general_ent}
                  onChange={handleFormChange}
                  className="w-4 h-4 accent-aentc-dark"
                />
                <label htmlFor="general_ent" className="text-sm font-medium text-gray-700">
                  General ENT providers can see this condition
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subspecialty
                </label>
                <input
                  type="text"
                  name="subspecialty"
                  value={form.subspecialty}
                  onChange={handleFormChange}
                  placeholder="e.g. laryngology, rhinology, otology, facial plastics"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="subspecialty_preferred"
                  name="subspecialty_preferred"
                  checked={form.subspecialty_preferred}
                  onChange={handleFormChange}
                  className="w-4 h-4 accent-aentc-dark"
                />
                <label htmlFor="subspecialty_preferred" className="text-sm font-medium text-gray-700">
                  Subspecialty is the preferred option for this condition
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes <span className="text-gray-400 font-normal">(shown to AI)</span>
                </label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleFormChange}
                  rows={3}
                  placeholder="Additional scheduling guidance for the AI..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-60"
                >
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

// ── Rules Editor tab ──────────────────────────────────────────────────────────

const RULE_LABELS = {
  global_rules:      'Global Rules',
  audiogram_rules:   'Audiogram Rules',
  central_rules:     'Central Location',
  south_rules:       'South Location',
  village_rules:     'Village Location',
  north_rules:       'North Location',
  neurotology_rules: 'Neurotology',
  kyle_rules:        'Kyle Location',
}

function formatDate(iso) {
  if (!iso) return 'never'
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function RulesEditor({ token }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState(null)
  const [draftText, setDraftText] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')  // 'saved' | 'error' | ''
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/rules', { headers: authHeaders(token) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRules(data)
      // Auto-select first section on initial load
      if (!selectedKey && data.length > 0) {
        setSelectedKey(data[0].rule_key)
        setDraftText(data[0].rule_text)
        setDirty(false)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function selectRule(rule) {
    if (dirty && !confirm('You have unsaved changes. Discard them?')) return
    setSelectedKey(rule.rule_key)
    setDraftText(rule.rule_text)
    setDirty(false)
    setSaveStatus('')
  }

  function handleTextChange(e) {
    setDraftText(e.target.value)
    setDirty(true)
    setSaveStatus('')
  }

  async function handleSave() {
    setSaving(true)
    setSaveStatus('')
    try {
      const res = await fetch(`/api/admin/rules/${selectedKey}`, {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({ rule_text: draftText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Update local rules list with saved values
      setRules(prev => prev.map(r => r.rule_key === selectedKey ? data : r))
      setDirty(false)
      setSaveStatus('saved')
    } catch (e) {
      setSaveStatus('error:' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const selectedRule = rules.find(r => r.rule_key === selectedKey)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-7 h-7 border-4 border-aentc-pale border-t-aentc-dark rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return <div className="text-sm text-red-600 py-4">{error}</div>
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-aentc-dark">Rules Editor</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Edits take effect on the next query — no restart needed.
        </p>
      </div>

      <div className="flex gap-5 min-h-[520px]">
        {/* ── Section list ── */}
        <div className="w-48 shrink-0 space-y-1">
          {rules.map(rule => (
            <button
              key={rule.rule_key}
              onClick={() => selectRule(rule)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                selectedKey === rule.rule_key
                  ? 'bg-aentc-dark text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {RULE_LABELS[rule.rule_key] || rule.rule_key}
              {selectedKey === rule.rule_key && dirty && (
                <span className="ml-1 text-aentc-pale text-xs">●</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Editor panel ── */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {selectedRule && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  {selectedRule.updated_by
                    ? <>Last saved by <span className="font-medium text-gray-600">{selectedRule.updated_by}</span> on {formatDate(selectedRule.updated_at)}</>
                    : 'Not yet edited — showing seed data'
                  }
                </div>
                <div className="flex items-center gap-3">
                  {saveStatus === 'saved' && (
                    <span className="text-xs text-green-600 font-medium">Saved</span>
                  )}
                  {saveStatus.startsWith('error:') && (
                    <span className="text-xs text-red-600">{saveStatus.slice(6)}</span>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={!dirty || saving}
                    className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>

              <textarea
                value={draftText}
                onChange={handleTextChange}
                spellCheck={false}
                className="flex-1 w-full border border-gray-300 rounded-lg px-4 py-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent resize-none"
                style={{ minHeight: '460px' }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── User Management tab ───────────────────────────────────────────────────────

const EMPTY_USER_FORM = { username: '', email: '', role: 'scheduler', password: '' }

function UserManagement({ token, currentUser }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState(EMPTY_USER_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  // Reset password state: { userId, username } or null
  const [resetTarget, setResetTarget] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetSaving, setResetSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users', { headers: authHeaders(token) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsers(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function handleFormChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleAddUser(e) {
    e.preventDefault()
    setFormError('')
    if (form.password.length < 8) return setFormError('Password must be at least 8 characters.')
    setSaving(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST', headers: authHeaders(token), body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowAddModal(false)
      setForm(EMPTY_USER_FORM)
      load()
    } catch (e) { setFormError(e.message) }
    finally { setSaving(false) }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setResetError('')
    if (resetPassword.length < 8) return setResetError('Password must be at least 8 characters.')
    setResetSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${resetTarget.userId}/reset-password`, {
        method: 'PUT', headers: authHeaders(token), body: JSON.stringify({ password: resetPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResetTarget(null)
      setResetPassword('')
    } catch (e) { setResetError(e.message) }
    finally { setResetSaving(false) }
  }

  async function handleToggleActive(user) {
    const action = user.is_active ? 'deactivate' : 'reactivate'
    if (user.is_active && !confirm(`Deactivate ${user.username}? They will not be able to log in.`)) return
    try {
      const res = await fetch(`/api/admin/users/${user.id}/${action}`, {
        method: 'PUT', headers: authHeaders(token),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      load()
    } catch (e) { setError(e.message) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-7 h-7 border-4 border-aentc-pale border-t-aentc-dark rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-aentc-dark">User Management</h3>
          <p className="text-xs text-gray-500 mt-0.5">New users are prompted to change their password on first login.</p>
        </div>
        <button onClick={() => { setForm(EMPTY_USER_FORM); setFormError(''); setShowAddModal(true) }}
          className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          + Add User
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-aentc-bg text-left">
            <tr>
              {['Username','Email','Role','Status','Created','Actions'].map(h => (
                <th key={h} className="px-4 py-3 font-semibold text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-gray-800">{u.username}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${u.role === 'admin' ? 'bg-aentc-pale text-aentc-dark' : 'bg-gray-100 text-gray-600'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 space-x-3 whitespace-nowrap">
                  <button onClick={() => { setResetTarget({ userId: u.id, username: u.username }); setResetPassword(''); setResetError('') }}
                    className="text-aentc-light hover:text-aentc-dark text-xs font-medium hover:underline">
                    Reset Password
                  </button>
                  {u.id !== currentUser?.id && (
                    <button onClick={() => handleToggleActive(u)}
                      className={`text-xs font-medium hover:underline ${u.is_active ? 'text-red-400 hover:text-red-600' : 'text-green-500 hover:text-green-700'}`}>
                      {u.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add User modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="font-semibold text-aentc-dark">Add User</h4>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleAddUser} className="px-6 py-5 space-y-4">
              {formError && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{formError}</div>}
              {[
                { label: 'Username', name: 'username', type: 'text', placeholder: 'jsmith' },
                { label: 'Email', name: 'email', type: 'email', placeholder: 'jsmith@austinent.com' },
                { label: 'Temporary Password', name: 'password', type: 'password', placeholder: 'Min 8 characters' },
              ].map(f => (
                <div key={f.name}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input type={f.type} name={f.name} value={form[f.name]} onChange={handleFormChange} required placeholder={f.placeholder}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select name="role" value={form.role} onChange={handleFormChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent">
                  <option value="scheduler">Scheduler</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
                <button type="submit" disabled={saving} className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-60">
                  {saving ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="font-semibold text-aentc-dark">Reset Password — {resetTarget.username}</h4>
              <button onClick={() => setResetTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleResetPassword} className="px-6 py-5 space-y-4">
              {resetError && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{resetError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Temporary Password</label>
                <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} required placeholder="Min 8 characters"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-aentc-light focus:border-transparent" />
                <p className="text-xs text-gray-400 mt-1">User will be prompted to change this on next login.</p>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setResetTarget(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancel</button>
                <button type="submit" disabled={resetSaving} className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-60">
                  {resetSaving ? 'Saving…' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Allergy / Sinus Log tab (Step 8 + 9) ─────────────────────────────────────

const LOG_LOCATIONS = ['', 'Central', 'South', 'Village', 'North', 'Neurotology', 'Kyle']

function AllergyLog({ token }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [filters, setFilters] = useState({ startDate: '', endDate: '', location: '', provider: '', page: 1 })

  async function load(f = filters) {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([,v]) => v !== '')))
      const res = await fetch(`/api/admin/allergy-log?${params}`, { headers: authHeaders(token) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRows(data.rows)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function handleFilterChange(e) {
    setFilters(f => ({ ...f, [e.target.name]: e.target.value, page: 1 }))
  }

  function handleSearch(e) {
    e.preventDefault()
    load({ ...filters, page: 1 })
  }

  function handleClear() {
    const cleared = { startDate: '', endDate: '', location: '', provider: '', page: 1 }
    setFilters(cleared)
    load(cleared)
  }

  function handlePage(p) {
    const updated = { ...filters, page: p }
    setFilters(updated)
    load(updated)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams(Object.fromEntries(
        Object.entries(filters).filter(([k, v]) => v !== '' && k !== 'page')
      ))
      const res = await fetch(`/api/admin/allergy-log/export?${params}`, { headers: authHeaders(token) })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'allergy-sinus-log.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e.message) }
    finally { setExporting(false) }
  }

  function formatDt(iso) {
    if (!iso) return '—'
    return new Date(iso.endsWith('Z') ? iso : iso + 'Z').toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-aentc-dark">Allergy / Sinus Log</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Auto-logged when AI identifies a sinus or allergy case. Total: <strong>{total}</strong> record{total !== 1 ? 's' : ''}.
          </p>
        </div>
        <button onClick={handleExport} disabled={exporting || total === 0}
          className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {exporting ? 'Exporting…' : '↓ Export CSV'}
        </button>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-3 mb-4 p-4 bg-aentc-bg rounded-lg">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">From</label>
          <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">To</label>
          <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Location</label>
          <select name="location" value={filters.location} onChange={handleFilterChange}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light">
            {LOG_LOCATIONS.map(l => <option key={l} value={l}>{l || 'All Locations'}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Provider</label>
          <input type="text" name="provider" value={filters.provider} onChange={handleFilterChange} placeholder="Search provider…"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-aentc-light" />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="bg-aentc-dark hover:bg-aentc-medium text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors">
            Filter
          </button>
          <button type="button" onClick={handleClear} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5">
            Clear
          </button>
        </div>
      </form>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-7 h-7 border-4 border-aentc-pale border-t-aentc-dark rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No records found.</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-aentc-bg text-left">
                <tr>
                  {['Date/Time','Complaint','Location','Type','Age','Insurance','Provider','Scheduler'].map(h => (
                    <th key={h} className="px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{formatDt(row.logged_at)}</td>
                    <td className="px-3 py-2.5 text-gray-700 max-w-[180px] truncate" title={row.complaint}>{row.complaint}</td>
                    <td className="px-3 py-2.5 text-gray-600">{row.location_preference || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600 capitalize">{row.patient_type || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600">{row.patient_age || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600">{row.insurance || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-700 font-medium whitespace-nowrap">{row.recommended_provider || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500">{row.scheduler_username || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>Page {filters.page} of {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => handlePage(filters.page - 1)} disabled={filters.page <= 1}
                  className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  ← Prev
                </button>
                <button onClick={() => handlePage(filters.page + 1)} disabled={filters.page >= totalPages}
                  className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Admin page shell ──────────────────────────────────────────────────────────

const TABS = [
  { key: 'conditions', label: 'Condition Mappings' },
  { key: 'rules', label: 'Rules Editor' },
  { key: 'users', label: 'User Management' },
  { key: 'log', label: 'Allergy Log' },
]

export default function Admin({ token, user, onLogout }) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('conditions')

  return (
    <div className="min-h-screen bg-aentc-bg flex flex-col">
      {/* Nav */}
      <header className="bg-aentc-dark text-white px-6 py-3 flex items-center justify-between shadow-md shrink-0">
        <span className="font-bold text-lg tracking-tight">AENTC — Admin Panel</span>
        <div className="flex items-center gap-4 text-sm">
          <button
            onClick={() => navigate('/scheduler')}
            className="hover:text-aentc-pale transition-colors"
          >
            ← Scheduler
          </button>
          <button
            onClick={() => navigate('/change-password')}
            className="hover:text-aentc-pale transition-colors"
          >
            {user?.username}
          </button>
          <button
            onClick={onLogout}
            className="bg-aentc-medium hover:bg-aentc-light px-3 py-1 rounded-md transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        {/* Tab bar */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px border-b-2 ${
                activeTab === tab.key
                  ? 'border-aentc-dark text-aentc-dark bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-white rounded-xl shadow-sm border border-aentc-pale p-6">
          {activeTab === 'conditions' && <ConditionMappings token={token} />}
          {activeTab === 'rules'      && <RulesEditor token={token} />}
          {activeTab === 'users'      && <UserManagement token={token} currentUser={user} />}
          {activeTab === 'log'        && <AllergyLog token={token} />}
        </div>
      </main>
    </div>
  )
}
