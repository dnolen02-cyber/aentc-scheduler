const express = require('express');
const router = express.Router();
const { stringify } = require('csv-stringify/sync');
const authenticate = require('../middleware/authenticate');
const { hashPassword } = require('../auth');
const { db } = require('../db');

// ── Admin guard middleware ─────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  authenticate(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// ══ Scheduling Rules ══════════════════════════════════════════════════════════

// GET /api/admin/rules  — all sections ordered by id
router.get('/rules', requireAdmin, (req, res) => {
  const rows = db
    .prepare('SELECT id, rule_key, rule_text, updated_at, updated_by FROM scheduling_rules ORDER BY id ASC')
    .all();
  res.json(rows);
});

// PUT /api/admin/rules/:key  — update one section's text
router.put('/rules/:key', requireAdmin, (req, res) => {
  const { rule_text } = req.body;
  if (rule_text === undefined) {
    return res.status(400).json({ error: 'rule_text is required' });
  }

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

// ══ Condition Mappings ════════════════════════════════════════════════════════

// GET /api/admin/conditions
router.get('/conditions', requireAdmin, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM condition_mappings ORDER BY condition_name ASC')
    .all();
  res.json(rows);
});

// POST /api/admin/conditions
router.post('/conditions', requireAdmin, (req, res) => {
  const { condition_name, general_ent, subspecialty, subspecialty_preferred, notes } = req.body;

  if (!condition_name || !condition_name.trim()) {
    return res.status(400).json({ error: 'condition_name is required' });
  }

  const result = db.prepare(`
    INSERT INTO condition_mappings
      (condition_name, general_ent, subspecialty, subspecialty_preferred, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    condition_name.trim().toLowerCase(),
    general_ent ? 1 : 0,
    subspecialty?.trim() || null,
    subspecialty_preferred ? 1 : 0,
    notes?.trim() || null,
    req.user.username,
  );

  const created = db.prepare('SELECT * FROM condition_mappings WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT /api/admin/conditions/:id
router.put('/conditions/:id', requireAdmin, (req, res) => {
  const { condition_name, general_ent, subspecialty, subspecialty_preferred, notes } = req.body;

  if (!condition_name || !condition_name.trim()) {
    return res.status(400).json({ error: 'condition_name is required' });
  }

  const existing = db.prepare('SELECT id FROM condition_mappings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Condition not found' });

  db.prepare(`
    UPDATE condition_mappings
    SET condition_name = ?, general_ent = ?, subspecialty = ?,
        subspecialty_preferred = ?, notes = ?
    WHERE id = ?
  `).run(
    condition_name.trim().toLowerCase(),
    general_ent ? 1 : 0,
    subspecialty?.trim() || null,
    subspecialty_preferred ? 1 : 0,
    notes?.trim() || null,
    req.params.id,
  );

  const updated = db.prepare('SELECT * FROM condition_mappings WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/admin/conditions/:id
router.delete('/conditions/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT id FROM condition_mappings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Condition not found' });

  db.prepare('DELETE FROM condition_mappings WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted successfully' });
});

// ══ User Management ═══════════════════════════════════════════════════════════

// GET /api/admin/users
router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare(
    'SELECT id, username, email, role, is_active, created_at FROM users ORDER BY created_at ASC'
  ).all();
  res.json(users);
});

// POST /api/admin/users  — create user with temp password
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
    'INSERT INTO users (username, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)'
  ).run(username.trim(), email.trim().toLowerCase(), hash, role);

  const created = db.prepare(
    'SELECT id, username, email, role, is_active, created_at FROM users WHERE id = ?'
  ).get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT /api/admin/users/:id/reset-password  — admin sets a new temp password
router.put('/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const hash = await hashPassword(password);
  db.prepare(
    'UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?'
  ).run(hash, req.params.id);

  res.json({ message: 'Password reset. User will be prompted to change it on next login.' });
});

// PUT /api/admin/users/:id/deactivate
router.put('/users/:id/deactivate', requireAdmin, (req, res) => {
  if (String(req.params.id) === String(req.user.id)) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'User deactivated' });
});

// PUT /api/admin/users/:id/reactivate
router.put('/users/:id/reactivate', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(req.params.id);
  res.json({ message: 'User reactivated' });
});

// ══ Allergy / Sinus Log ═══════════════════════════════════════════════════════

const PAGE_SIZE = 25;

function buildLogQuery(filters, forExport = false) {
  const conditions = [];
  const params = [];

  if (filters.startDate) {
    conditions.push('DATE(logged_at) >= ?');
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push('DATE(logged_at) <= ?');
    params.push(filters.endDate);
  }
  if (filters.location) {
    conditions.push('location_preference = ?');
    params.push(filters.location);
  }
  if (filters.provider) {
    conditions.push('recommended_provider LIKE ?');
    params.push(`%${filters.provider}%`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const order = 'ORDER BY logged_at DESC';
  const limit = forExport ? '' : `LIMIT ${PAGE_SIZE} OFFSET ${(Math.max(1, filters.page || 1) - 1) * PAGE_SIZE}`;

  return {
    sql: `SELECT * FROM allergy_sinus_log ${where} ${order} ${limit}`.trim(),
    countSql: `SELECT COUNT(*) as total FROM allergy_sinus_log ${where}`.trim(),
    params,
  };
}

// GET /api/admin/allergy-log?startDate=&endDate=&location=&provider=&page=
router.get('/allergy-log', requireAdmin, (req, res) => {
  const filters = {
    startDate: req.query.startDate || '',
    endDate:   req.query.endDate   || '',
    location:  req.query.location  || '',
    provider:  req.query.provider  || '',
    page:      parseInt(req.query.page) || 1,
  };

  const { sql, countSql, params } = buildLogQuery(filters);
  const rows  = db.prepare(sql).all(...params);
  const total = db.prepare(countSql).get(...params).total;

  res.json({
    rows,
    total,
    page: filters.page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
  });
});

// GET /api/admin/allergy-log/export  — CSV download (all matching rows, no pagination)
router.get('/allergy-log/export', requireAdmin, (req, res) => {
  const filters = {
    startDate: req.query.startDate || '',
    endDate:   req.query.endDate   || '',
    location:  req.query.location  || '',
    provider:  req.query.provider  || '',
  };

  const { sql, params } = buildLogQuery(filters, true);
  const rows = db.prepare(sql).all(...params);

  const csv = stringify(rows, {
    header: true,
    columns: [
      { key: 'logged_at',           header: 'Date/Time' },
      { key: 'complaint',           header: 'Complaint' },
      { key: 'location_preference', header: 'Location Preference' },
      { key: 'patient_type',        header: 'Patient Type' },
      { key: 'patient_age',         header: 'Age' },
      { key: 'insurance',           header: 'Insurance' },
      { key: 'recommended_provider',header: 'Recommended Provider' },
      { key: 'recommended_location',header: 'Recommended Location' },
      { key: 'scheduler_username',  header: 'Scheduler' },
    ],
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="allergy-sinus-log.csv"');
  res.send(csv);
});

module.exports = router;
