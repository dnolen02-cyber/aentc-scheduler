const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { queryScheduler } = require('../services/ai');
const { db } = require('../db');

// ── Load balancing: count today's recommendations per provider ────────────────
// Returns a prompt-ready string the AI uses to sort its output list.

function getTodayRankingContext() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const rows = db.prepare(`
    SELECT recommended_provider, COUNT(*) as count
    FROM query_log
    WHERE recommended_provider IS NOT NULL
      AND DATE(logged_at) = ?
    GROUP BY recommended_provider
    ORDER BY count ASC
  `).all(today);

  if (rows.length === 0) {
    return 'No recommendations have been made today yet. All providers are at 0 — order qualifying providers however the rules suggest is fairest.';
  }

  const lines = rows.map(r => `  ${r.recommended_provider}: ${r.count} recommendation(s) today`);
  return [
    'Sort qualifying providers with the FEWEST recommendations today at the top (most available):',
    ...lines,
    '(Any provider not listed here has 0 recommendations today and should appear before those listed above.)',
  ].join('\n');
}

// ── Parse _meta block from AI response ────────────────────────────────────────

function parseMeta(aiResponse) {
  const match = aiResponse.match(/\{"_meta":\{[\s\S]*?\}\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0])._meta;
  } catch {
    return null;
  }
}

// ── POST /api/schedule/query ──────────────────────────────────────────────────
// Body: { messages, complaint, location, patientType, age, insurance, establishedWith }

router.post('/query', authenticate, async (req, res) => {
  const { messages, complaint, location, patientType, age, insurance, establishedWith } = req.body;

  if (!complaint || !complaint.trim()) {
    return res.status(400).json({ error: 'complaint is required' });
  }
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages must be an array' });
  }

  try {
    const rankingContext = getTodayRankingContext();
    const aiResponse = await queryScheduler(messages, rankingContext);
    const meta = parseMeta(aiResponse);

    // ── Log to query_log ───────────────────────────────────────────────────
    try {
      db.prepare(`
        INSERT INTO query_log
          (scheduler_username, complaint, location_preference, patient_type,
           patient_age, insurance, ai_response_summary, recommended_provider)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.user.username,
        complaint,
        location || null,
        patientType || null,
        age || null,
        insurance || null,
        aiResponse.slice(0, 500),
        meta?.recommended_provider || null,
      );
    } catch (logErr) {
      console.error('[Schedule] query_log write failed:', logErr.message);
    }

    // ── Auto-log sinus/allergy cases ───────────────────────────────────────
    if (meta?.is_sinus_allergy === true) {
      try {
        db.prepare(`
          INSERT INTO allergy_sinus_log
            (complaint, location_preference, patient_type, patient_age,
             insurance, recommended_provider, recommended_location, scheduler_username)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          complaint,
          location || null,
          patientType || null,
          age || null,
          insurance || null,
          meta.recommended_provider || null,
          meta.recommended_location || null,
          req.user.username,
        );
        console.log(`[Schedule] Allergy/sinus case logged for ${req.user.username}`);
      } catch (logErr) {
        console.error('[Schedule] allergy_sinus_log write failed:', logErr.message);
      }
    }

    return res.json({ response: aiResponse });
  } catch (err) {
    console.error('[Schedule] AI query failed:', err.message);
    return res.status(502).json({ error: 'AI service unavailable. Please try again.' });
  }
});

module.exports = router;
