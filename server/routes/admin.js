const express = require('express');
const router = express.Router();
const { stringify } = require('csv-stringify/sync');
const authenticate = require('../middleware/authenticate');
const { hashPassword } = require('../auth');
const { db } = require('../db');

// ── Admin guard ───────────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  authenticate(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// ══ Scheduling Rules (global / audiogram reference — admin-editable) ══════════

router.get('/rules', requireAdmin, (req, res) => {
  const rows = db
    .prepare('SELECT id, rule_key, rule_text, updated_at, updated_by FROM scheduling_rules ORDER BY id ASC')
    .all();
  res.json(rows);
});

router.put('/rules/:key', requireAdmin, (req, res) => {
  const { rule_text } = req.body;
  if (rule_text === undefined) return res.status(400).json({ error: 'rule_text is required' });

  const existing = db.prepare('SELECT id FROM scheduling_rules WHERE rule_key = ?').get(req.params.key);
  if (!existing) return res.status(404).json({ error: 'Rule section not found' });

  db.prepare(`
    UPDATE scheduling_rules
    SET rule_text = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
    WHERE rule_key = ?
  `).run(rule_text, req.user.username, req.params.key);

  const updated = db
    .prepare('SELECT id, rule_key, rule_text, updated_at, updated_by FROM scheduling_rules WHERE rule_key = ?')
    .get(req.params.key);
  res.json(updated);
});

// ══ Conditions ════════════════════════════════════════════════════════════════

// Readable by all authenticated users — scheduler needs this to populate dropdowns
router.get('/conditions', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, category, audiogram_required, reasoning, is_active, updated_at, updated_by
    FROM conditions
    ORDER BY category ASC, name ASC
  `).all();
  res.json(rows);
});

router.post('/conditions', requireAdmin, (req, res) => {
  const { name, category, audiogram_required = 'never', reasoning } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  const validCategories = [
    'general_ent', 'sleep', 'head_neck', 'neurotology',
    'laryngology', 'facial_plastics', 'pediatric', 'allergy',
  ];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${validCategories.join(', ')}` });
  }
  if (!['always', 'sometimes', 'never'].includes(audiogram_required)) {
    return res.status(400).json({ error: 'audiogram_required must be always, sometimes, or never' });
  }

  const conflict = db.prepare('SELECT id FROM conditions WHERE name = ?').get(name.trim());
  if (conflict) return res.status(409).json({ error: 'A condition with this name already exists' });

  const result = db.prepare(`
    INSERT INTO conditions (name, category, audiogram_required, reasoning, updated_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(name.trim(), category, audiogram_required, reasoning?.trim() || null, req.user.username);

  res.status(201).json(db.prepare('SELECT * FROM conditions WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/conditions/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM conditions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Condition not found' });

  const {
    name              = existing.name,
    category          = existing.category,
    audiogram_required = existing.audiogram_required,
    reasoning         = existing.reasoning,
    is_active         = existing.is_active,
  } = req.body;

  db.prepare(`
    UPDATE conditions
    SET name = ?, category = ?, audiogram_required = ?, reasoning = ?,
        is_active = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
    WHERE id = ?
  `).run(
    String(name).trim(),
    category,
    audiogram_required,
    reasoning ? String(reasoning).trim() : null,
    is_active ? 1 : 0,
    req.user.username,
    req.params.id,
  );

  res.json(db.prepare('SELECT * FROM conditions WHERE id = ?').get(req.params.id));
});

// ══ Providers ═════════════════════════════════════════════════════════════════

// Readable by all authenticated users
router.get('/providers', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, s.name AS supervising_name
    FROM providers p
    LEFT JOIN providers s ON p.supervising_provider_id = s.id
    ORDER BY
      CASE p.title WHEN 'MD' THEN 0 WHEN 'DO' THEN 1 ELSE 2 END ASC,
      p.name ASC
  `).all();

  res.json(rows.map(p => ({ ...p, locations: JSON.parse(p.locations || '[]') })));
});

router.post('/providers', requireAdmin, (req, res) => {
  const { name, title, specialty, supervising_provider_id, locations = [], general_notes } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!['MD', 'DO', 'PA', 'NP', 'SLP'].includes(title)) {
    return res.status(400).json({ error: 'title must be MD, DO, PA, NP, or SLP' });
  }

  const result = db.prepare(`
    INSERT INTO providers (name, title, specialty, supervising_provider_id, locations, general_notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    title,
    specialty?.trim() || null,
    supervising_provider_id || null,
    JSON.stringify(Array.isArray(locations) ? locations : []),
    general_notes?.trim() || null,
  );

  const created = db.prepare('SELECT * FROM providers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...created, locations: JSON.parse(created.locations || '[]') });
});

router.put('/providers/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Provider not found' });

  const { name, title, specialty, supervising_provider_id, locations, general_notes, is_active, show_in_recs } = req.body;

  db.prepare(`
    UPDATE providers
    SET name = ?, title = ?, specialty = ?, supervising_provider_id = ?,
        locations = ?, general_notes = ?, is_active = ?, show_in_recs = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name?.trim()      ?? existing.name,
    title             ?? existing.title,
    specialty?.trim() ?? existing.specialty,
    supervising_provider_id !== undefined
      ? (supervising_provider_id || null)
      : existing.supervising_provider_id,
    Array.isArray(locations) ? JSON.stringify(locations) : existing.locations,
    general_notes !== undefined ? (general_notes?.trim() || null) : existing.general_notes,
    is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
    show_in_recs !== undefined ? (show_in_recs ? 1 : 0) : existing.show_in_recs,
    req.params.id,
  );

  const updated = db.prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id);
  res.json({ ...updated, locations: JSON.parse(updated.locations || '[]') });
});

// ══ Provider Preferences ══════════════════════════════════════════════════════

// GET /api/admin/providers/:id/preferences
router.get('/providers/:id/preferences', requireAdmin, (req, res) => {
  const provider = db.prepare('SELECT id, name FROM providers WHERE id = ?').get(req.params.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });

  const prefs = db.prepare(`
    SELECT pp.condition_id, pp.preference, pp.scheduling_note,
           c.name AS condition_name, c.category
    FROM provider_preferences pp
    JOIN conditions c ON c.id = pp.condition_id
    WHERE pp.provider_id = ?
    ORDER BY c.category ASC, c.name ASC
  `).all(req.params.id);

  res.json({ provider_id: provider.id, provider_name: provider.name, preferences: prefs });
});

// PUT /api/admin/providers/:id/preferences
// Replaces the entire preference set for a provider.
// Body: { want: [condition_id, ...], avoid: [condition_id, ...], notes: { condition_id: "note" } }
router.put('/providers/:id/preferences', requireAdmin, (req, res) => {
  const provider = db.prepare('SELECT id FROM providers WHERE id = ?').get(req.params.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });

  const { want = [], avoid = [], notes = {} } = req.body;

  db.transaction(() => {
    db.prepare('DELETE FROM provider_preferences WHERE provider_id = ?').run(req.params.id);

    const insert = db.prepare(`
      INSERT INTO provider_preferences (provider_id, condition_id, preference, scheduling_note, updated_by)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const condId of want) {
      insert.run(req.params.id, condId, 'want', notes[condId] || null, req.user.username);
    }
    for (const condId of avoid) {
      insert.run(req.params.id, condId, 'avoid', notes[condId] || null, req.user.username);
    }
  })();

  const updated = db.prepare(`
    SELECT pp.condition_id, pp.preference, pp.scheduling_note,
           c.name AS condition_name, c.category
    FROM provider_preferences pp
    JOIN conditions c ON c.id = pp.condition_id
    WHERE pp.provider_id = ?
    ORDER BY c.category ASC, c.name ASC
  `).all(req.params.id);

  res.json({ provider_id: Number(req.params.id), preferences: updated });
});

// PATCH /api/admin/providers/:providerId/preferences/:conditionId
// Update a single condition preference. preference='neutral' removes the row.
router.patch('/providers/:providerId/preferences/:conditionId', requireAdmin, (req, res) => {
  const { preference, scheduling_note } = req.body;

  if (preference && !['want', 'avoid', 'neutral'].includes(preference)) {
    return res.status(400).json({ error: 'preference must be want, avoid, or neutral' });
  }

  if (!preference || preference === 'neutral') {
    db.prepare('DELETE FROM provider_preferences WHERE provider_id = ? AND condition_id = ?')
      .run(req.params.providerId, req.params.conditionId);
  } else {
    db.prepare(`
      INSERT INTO provider_preferences (provider_id, condition_id, preference, scheduling_note, updated_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, condition_id) DO UPDATE SET
        preference      = excluded.preference,
        scheduling_note = excluded.scheduling_note,
        updated_at      = CURRENT_TIMESTAMP,
        updated_by      = excluded.updated_by
    `).run(
      req.params.providerId,
      req.params.conditionId,
      preference,
      scheduling_note ?? null,
      req.user.username,
    );
  }

  res.json({ message: 'Preference updated' });
});

// ══ Assignments Log ═══════════════════════════════════════════════════════════

const PAGE_SIZE = 25;

function buildAssignmentWhere(query) {
  const clauses = [];
  const params = [];

  if (query.provider_id)  { clauses.push('a.provider_id = ?');        params.push(query.provider_id); }
  if (query.condition_id) { clauses.push('a.condition_id = ?');        params.push(query.condition_id); }
  if (query.location)     { clauses.push('a.location = ?');            params.push(query.location); }
  if (query.scheduled_by) { clauses.push('u.username LIKE ?');         params.push(`%${query.scheduled_by}%`); }
  if (query.startDate)    { clauses.push('DATE(a.scheduled_at) >= ?'); params.push(query.startDate); }
  if (query.endDate)      { clauses.push('DATE(a.scheduled_at) <= ?'); params.push(query.endDate); }

  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', params };
}

// GET /api/admin/assignments
router.get('/assignments', requireAdmin, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const { where, params } = buildAssignmentWhere(req.query);

  const rows = db.prepare(`
    SELECT a.id, a.scheduled_at, a.location, a.notes,
           p.name  AS provider_name, p.title AS provider_title,
           c.name  AS condition_name,
           u.username AS scheduled_by_username
    FROM assignments a
    JOIN  providers p  ON p.id = a.provider_id
    JOIN  conditions c ON c.id = a.condition_id
    LEFT JOIN users u  ON u.id = a.scheduled_by
    ${where}
    ORDER BY a.scheduled_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE);

  const total = db.prepare(`
    SELECT COUNT(*) AS n
    FROM assignments a
    JOIN providers p ON p.id = a.provider_id
    LEFT JOIN users u ON u.id = a.scheduled_by
    ${where}
  `).get(...params).n;

  res.json({ rows, total, page, pageSize: PAGE_SIZE, totalPages: Math.ceil(total / PAGE_SIZE) });
});

// GET /api/admin/assignments/export
router.get('/assignments/export', requireAdmin, (req, res) => {
  const { where, params } = buildAssignmentWhere(req.query);

  const rows = db.prepare(`
    SELECT a.scheduled_at, p.name AS provider_name, p.title AS provider_title,
           c.name AS condition_name, c.category,
           a.location, u.username AS scheduled_by, a.notes
    FROM assignments a
    JOIN  providers p  ON p.id = a.provider_id
    JOIN  conditions c ON c.id = a.condition_id
    LEFT JOIN users u  ON u.id = a.scheduled_by
    ${where}
    ORDER BY a.scheduled_at DESC
  `).all(...params);

  const csv = stringify(rows, {
    header: true,
    columns: [
      { key: 'scheduled_at',   header: 'Date/Time' },
      { key: 'provider_name',  header: 'Provider' },
      { key: 'provider_title', header: 'Title' },
      { key: 'condition_name', header: 'Condition' },
      { key: 'category',       header: 'Category' },
      { key: 'location',       header: 'Location' },
      { key: 'scheduled_by',   header: 'Scheduled By' },
      { key: 'notes',          header: 'Notes' },
    ],
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="assignments.csv"');
  res.send(csv);
});

// ══ User Management ═══════════════════════════════════════════════════════════

router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare(
    'SELECT id, username, email, role, is_active, created_at FROM users ORDER BY created_at ASC',
  ).all();
  res.json(users);
});

router.post('/users', requireAdmin, async (req, res) => {
  const { username, email, role, password } = req.body;

  if (!username?.trim() || !email?.trim() || !role || !password) {
    return res.status(400).json({ error: 'username, email, role, and password are required' });
  }
  if (!['admin', 'scheduler'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin or scheduler' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .get(username.trim(), email.trim().toLowerCase());
  if (existing) return res.status(409).json({ error: 'Username or email already exists' });

  const hash = await hashPassword(password);
  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)',
  ).run(username.trim(), email.trim().toLowerCase(), hash, role);

  const created = db.prepare(
    'SELECT id, username, email, role, is_active, created_at FROM users WHERE id = ?',
  ).get(result.lastInsertRowid);
  res.status(201).json(created);
});

router.put('/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const hash = await hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')
    .run(hash, req.params.id);

  res.json({ message: 'Password reset. User will be prompted to change it on next login.' });
});

router.put('/users/:id/deactivate', requireAdmin, (req, res) => {
  if (String(req.params.id) === String(req.user.id)) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'User deactivated' });
});

router.put('/users/:id/reactivate', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(req.params.id);
  res.json({ message: 'User reactivated' });
});

// ══ Legacy: Allergy / Sinus Log (kept for backward compatibility) ═════════════

router.get('/allergy-log', requireAdmin, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const clauses = [];
  const params = [];

  if (req.query.startDate) { clauses.push('DATE(logged_at) >= ?'); params.push(req.query.startDate); }
  if (req.query.endDate)   { clauses.push('DATE(logged_at) <= ?'); params.push(req.query.endDate); }
  if (req.query.location)  { clauses.push('location_preference = ?'); params.push(req.query.location); }
  if (req.query.provider)  { clauses.push('recommended_provider LIKE ?'); params.push(`%${req.query.provider}%`); }

  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

  try {
    const rows  = db.prepare(`SELECT * FROM allergy_sinus_log ${where} ORDER BY logged_at DESC LIMIT ? OFFSET ?`).all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE);
    const total = db.prepare(`SELECT COUNT(*) AS total FROM allergy_sinus_log ${where}`).get(...params).total;
    res.json({ rows, total, page, pageSize: PAGE_SIZE, totalPages: Math.ceil(total / PAGE_SIZE) });
  } catch {
    res.json({ rows: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 0 });
  }
});

module.exports = router;
