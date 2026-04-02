const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { runSymptomBot } = require('../services/ai');
const { db } = require('../db');

// ── Preference sort order ─────────────────────────────────────────────────────

const PREF_ORDER = { want: 0, neutral: 1, avoid: 2 };

// Which condition categories a subspecialty is preferred for
const SUBSPECIALTY_CATEGORIES = {
  neurotology:     ['neurotology'],
  laryngology:     ['laryngology'],
  facial_plastics: ['facial_plastics'],
  rhinology:       ['general_ent', 'head_neck'],
  sleep:           ['sleep'],
};

// ── GET /api/schedule/recommend ───────────────────────────────────────────────
// Query params: condition_id (required), location (optional)
//
// Returns providers ranked by:
//   1. Preference tier  (want → neutral → avoid)
//   2. Rotation score   (how many OTHER providers have been assigned this
//                        condition since this provider's last assignment;
//                        higher = been waiting longer = higher priority)
//
// Response:
//   { condition, location_specific: [...], overall: [...] }
//   Each provider row includes: preference, scheduling_note, rotation_score

router.get('/recommend', authenticate, (req, res) => {
  const { condition_id, location } = req.query;

  if (!condition_id) return res.status(400).json({ error: 'condition_id is required' });

  const condition = db.prepare('SELECT * FROM conditions WHERE id = ? AND is_active = 1').get(condition_id);
  if (!condition) return res.status(404).json({ error: 'Condition not found' });

  // All active providers that appear in general scheduling
  const allProviders = db.prepare('SELECT * FROM providers WHERE is_active = 1 AND show_in_recs = 1').all();

  // Preferences for this condition (only want/avoid rows — no row = neutral)
  const prefRows = db.prepare(`
    SELECT provider_id, preference, scheduling_note
    FROM provider_preferences
    WHERE condition_id = ?
  `).all(condition_id);
  const prefMap = {};
  for (const p of prefRows) prefMap[p.provider_id] = p;

  // Last assignment timestamp per provider for this condition
  const lastRows = db.prepare(`
    SELECT provider_id, MAX(scheduled_at) AS last_at
    FROM assignments
    WHERE condition_id = ?
    GROUP BY provider_id
  `).all(condition_id);
  const lastMap = {};
  for (const r of lastRows) lastMap[r.provider_id] = r.last_at;

  // Total assignments ever for this condition (used for never-assigned baseline)
  const totalAssigned = db.prepare(
    'SELECT COUNT(*) AS n FROM assignments WHERE condition_id = ?',
  ).get(condition_id).n;

  // Rotation score helper — count assignments to OTHER providers after this
  // provider's last assignment for this condition
  const countAfter = db.prepare(`
    SELECT COUNT(*) AS n
    FROM assignments
    WHERE condition_id = ? AND provider_id != ? AND scheduled_at > ?
  `);

  // Build scored list
  const scored = allProviders.map(p => {
    const pref = prefMap[p.id];
    const preference    = pref?.preference    ?? 'neutral';
    const scheduling_note = pref?.scheduling_note ?? null;
    const lastAt        = lastMap[p.id] ?? null;

    const rotation_score = lastAt === null
      ? totalAssigned          // never assigned → maximum priority
      : countAfter.get(condition_id, p.id, lastAt).n;

    // Does this provider's subspecialty match this condition's category?
    const matchedCategories = SUBSPECIALTY_CATEGORIES[p.specialty] ?? [];
    const subspecialty_match = matchedCategories.includes(condition.category) ? 1 : 0;

    return {
      ...p,
      locations: JSON.parse(p.locations || '[]'),
      preference,
      scheduling_note,
      rotation_score,
      last_assigned_at: lastAt,
      subspecialty_match,
    };
  });

  // Sort: 1) preference tier  2) subspecialty match  3) rotation score  4) random tiebreaker
  const sorted = [...scored].sort((a, b) => {
    const pd = PREF_ORDER[a.preference] - PREF_ORDER[b.preference];
    if (pd !== 0) return pd;
    const sd = b.subspecialty_match - a.subspecialty_match;
    if (sd !== 0) return sd;
    const rd = b.rotation_score - a.rotation_score;
    if (rd !== 0) return rd;
    return Math.random() - 0.5; // random tiebreaker to prevent alphabetical bias
  });

  // Location-specific view (providers whose typical locations include requested)
  const locationSpecific = location
    ? sorted.filter(p => p.locations.includes(location))
    : sorted;

  res.json({
    condition,
    location_specific: locationSpecific,
    overall: sorted,
  });
});

// ── POST /api/schedule/assign ─────────────────────────────────────────────────
// Log a confirmed assignment. This is what drives the rotation queue.
// Body: { provider_id, condition_id, location, notes }

router.post('/assign', authenticate, (req, res) => {
  const { provider_id, condition_id, location, notes } = req.body;

  if (!provider_id || !condition_id) {
    return res.status(400).json({ error: 'provider_id and condition_id are required' });
  }

  const provider  = db.prepare('SELECT id, name FROM providers WHERE id = ? AND is_active = 1').get(provider_id);
  const condition = db.prepare('SELECT id, name FROM conditions WHERE id = ? AND is_active = 1').get(condition_id);

  if (!provider)  return res.status(404).json({ error: 'Provider not found' });
  if (!condition) return res.status(404).json({ error: 'Condition not found' });

  const result = db.prepare(`
    INSERT INTO assignments (provider_id, condition_id, location, scheduled_by, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(provider_id, condition_id, location || null, req.user.id, notes || null);

  res.status(201).json({
    id:           result.lastInsertRowid,
    provider_id,
    provider_name: provider.name,
    condition_id,
    condition_name: condition.name,
    location:     location || null,
    scheduled_by: req.user.username,
    scheduled_at: new Date().toISOString(),
  });
});

// ── POST /api/schedule/symptom-bot ────────────────────────────────────────────
// AI-powered triage conversation to help clarify the patient's chief complaint.
// Body: { messages: [{role, content}], condition_name }
//
// The frontend sends the full conversation history on each turn.
// When the bot has gathered enough info it returns a JSON block:
//   {"_refined":{"condition":"...", "reasoning":"...", "done":true}}

router.post('/symptom-bot', authenticate, async (req, res) => {
  const { messages, condition_name } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }
  if (!condition_name?.trim()) {
    return res.status(400).json({ error: 'condition_name is required' });
  }

  try {
    const reply = await runSymptomBot(messages, condition_name.trim());
    res.json({ response: reply });
  } catch (err) {
    console.error('[SymptomBot] Error:', err.message);
    res.status(502).json({ error: 'AI service unavailable. Please try again.' });
  }
});

module.exports = router;
