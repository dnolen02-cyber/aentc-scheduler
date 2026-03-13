const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../aentc.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    username             TEXT    UNIQUE NOT NULL,
    email                TEXT    UNIQUE NOT NULL,
    password_hash        TEXT    NOT NULL,
    role                 TEXT    NOT NULL CHECK(role IN ('admin', 'scheduler')),
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active            INTEGER DEFAULT 1,
    must_change_password INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    token      TEXT    UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    used       INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS scheduling_rules (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_key   TEXT    UNIQUE NOT NULL,
    rule_text  TEXT    NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS allergy_sinus_log (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    logged_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    complaint            TEXT NOT NULL,
    location_preference  TEXT,
    patient_type         TEXT,
    patient_age          TEXT,
    insurance            TEXT,
    recommended_provider TEXT,
    recommended_location TEXT,
    scheduler_username   TEXT
  );

  CREATE TABLE IF NOT EXISTS query_log (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    logged_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    scheduler_username  TEXT,
    complaint           TEXT,
    location_preference TEXT,
    patient_type        TEXT,
    patient_age         TEXT,
    insurance           TEXT,
    ai_response_summary TEXT
  );
`);

// ─── Seed scheduling rules ────────────────────────────────────────────────────

const SEED_RULES = [
  {
    rule_key: 'global_rules',
    rule_text: `GLOBAL RULES (ALL LOCATIONS):
- Schedule new patients under an MD if a doctor has availability.
- If a patient is established with a particular doctor and that doctor is out, schedule under their mid-level PA/NP.
- Emergent appointments (sudden hearing loss, airway issues, otitis externa, peritonsillar abscess, tumors/masses) get priority at all locations.
- No new patient telehealth visits without MD authorization.
- No asthma patients unless accompanied by ENT-related symptoms (allergies).
- No TMJ treatment (can diagnose, refer out for treatment).
- Patients with multiple issues: give end-of-morning or end-of-afternoon slot. Inform patient they may need multiple appointments.
- Allergy scheduling (ALL locations): Schedule 7-10 days ahead. Enter Scheduled Date in patient Orders tab. Send task to location-specific Allergy team with order attached. Benefits Team verifies insurance. Allergy Team contacts patient.
- Keep a log of all sinus and allergy patient allocations.`,
  },
  {
    rule_key: 'audiogram_rules',
    rule_text: `AUDIOGRAM RULES (ALL LOCATIONS):
- ALWAYS schedule audiogram FIRST for: hearing loss, tinnitus, dizziness/vertigo, speech delay, ruptured ear drum, Bell's palsy, ear fullness/infections.
- Schedule audiogram SECOND (after provider) for: active ear drainage only.
- Patients CANNOT decline audiogram when it is required.
- No audiogram needed for: routine ear cleaning only, itchy ears only, wax removal history only.
- Audiogram duration: Central/South/North = 30 min. Village = 20 min (30 min for age 5 and under). Kyle = 20 min. Neurotology: established AENT patient = 15 min, new AENT patient = 30 min.
- VNG = 90 minutes, must reserve ABR room, only on Deepa or Cassie dedicated VNG blocks.
- ABR = 60 minutes, must reserve ABR room.
- Audios performed elsewhere must have been within previous 3-6 months.
- Patients presenting for abnormal or failed hearing test must have audio done at AENTC.`,
  },
  {
    rule_key: 'central_rules',
    rule_text: `CENTRAL LOCATION PROVIDERS:

Ashley Dao, MD — General ENT — 15-min appointments. PA: Liz Guzy.
- Will see all general ENT: sinus, allergy, nasal congestion, nosebleeds, hearing loss, snoring/sleep apnea (Inspire certified), head/neck cancer, swallowing, ear infections, parotid tumors, reflux, tonsils, neck masses.
- No scheduling restrictions. OK to double book if emergent same day.

Liz Guzy, PA (Dao):
- When Dao in office: ear wax = 15 min, all else = 30 min. When Dao out: all = 15 min.
- Sees: ears (dizziness/vertigo, ear cleaning, itchy ears, tinnitus, ear drainage, adult ear infections, TM perforation, ear pain, foreign body removal, hearing loss, annual audio, dizziness), nose/throat (allergies, acute sinusitis, OSA/PAP compliance, epistaxis — if RhinoRockets double book Dao, tonsil stones, Dao post-ops, reflux).

Anish Raman, MD — General ENT — 15-min appointments. No restrictions. Inspire certified. TTI = 30-min.

Feras Ackall, MD — Rhinology — 15-min appointments. NP: Collin Dorner.
- Will see all general ENT. Specialty: nasal cavity, sinuses, skull base, pituitary.
- No double booking. Approval needed for same-day add-ons.
- DO NOT schedule: new neck mass, thyroid, parotid, cancer (other than nasal/sinus).
- ALL ear appointments must have audiogram scheduled.

Collin Dorner, NP (Ackall/Whited) — 15-min appointments (Central); 30-min appointments (South).
- NO pediatric patients. No Cigna, Humana Medicare Advantage, or Medicare (at South location).
- Sees: ears (annual audio, ear cleaning), nose/throat (acute sinusitis, nasal obstruction, allergies, allergy test review, cough, reflux, swallowing, dysphagia).

David Nolen, MD — Facial Plastics.
- No patients under age 4. Will see all general ENT.
- Urgent referrals (cancer, nasal fractures): send to Olivia and/or Mitzi first. If unavailable, schedule soonest and send task. Must request records.
- New patients (even if seen by another AENTC provider): 20-min. Do NOT schedule back-to-back.
- Established patients: 15-min.
- Cosmetic consults: 30-min, WEDNESDAY ONLY.

Taylor Lackey, MD — Laryngology — 15-min appointments.
- Will see all general ENT. OK to double book urgent/same-day.
- No patients under age 15 (voice complaints only for under 15).
- Will see Whited patients for urgent concerns if Whited is out.

Chad Whited, MD — Laryngology — 15-min appointments. PAs: Alex Baker, Sonam Khanjae.
- Will see all general ENT.
- If PA available, schedule these with PA: ears, hearing, salivary glands, nose, sinus, allergies, post-nasal drip, sleep apnea, vertigo/dizziness.
- DO NOT schedule in-office procedures without confirmation from Alex or Kelly.
- OK to schedule: Juvederm, Botox, Kenalog injections, Superior Laryngeal Nerve Blocks, epistaxis control, Epley maneuvers, esophageal dilations (all 15-min).
- MWF double booking allowed on right side of schedule at 8:30a and 9a.
- Monday PM strobe rooms: Right = normal 15-min. Left = voice/swallowing/airway new patients 20-min only.

Sonam Khanjae, PA (Whited):
- No pediatrics without supervising MD.
- When Whited in office: all 30-min. When out: new = 30 min, established simple = 15 min, established complex = 30 min.
- Sees: ears (tube check, ear cleaning, itchy ears, tinnitus, adult ear infections, TM perforation, ear pain, foreign body, hearing loss, annual audio, dizziness, vertigo), nose/throat (allergies, allergy test review, acute sinusitis, PAP compliance, simple epistaxis no RhinoRockets, tonsil stones, post-ops).

Alex Baker, PA (Whited at Central, also Kyle):
- At Central: assists Whited per Whited rules.
- At Kyle: Tuesday established patients only. Wednesday new and established.`,
  },
  {
    rule_key: 'south_rules',
    rule_text: `SOUTH LOCATION PROVIDERS:

Mike Yium, MD — General ENT — 15-min appointments. PA: Lizzie Yarotsky.
- No scheduling restrictions. Sees: sleep apnea, sinus, allergies, nasal fractures, postnasal drip, thyroid, salivary glands, neck mass, hearing loss, FNAs, sinusitis, nasal obstruction, snoring, thyroid nodules, chronic ear disease, dizziness, voice disorders, head/neck cancer.
- Lockhart location: Wednesday PM.

Lizzie Yarotsky, PA (Yium) — 15-min, no age restrictions.
- General ENT: sleep apnea, sinus, allergies, postnasal drip, salivary glands, hearing loss, sinusitis, nasal obstruction, chronic ear disease, dizziness.
- NO Cigna or Humana Medicare Advantage. NO tongue ties. NO nasal fractures.

Brian Schwab, MD — 15-min appointments (South and Kyle).
- General ENT: sleep apnea, sinus, allergies, nasal fractures, postnasal drip, thyroid, salivary glands, neck mass, hearing loss, FNAs, sinusitis, nasal obstruction, snoring, thyroid nodules, chronic ear disease, thyroid cancer, parathyroid.
- RESTRICTION: NO new dizzy/vertigo patients (at Kyle: schedule with Alex Baker instead).

Anna Tomkies, MD — 15-min (South and Village). Inspire certified, Airlift.
- General ENT including dizziness, voice disorders, sleep apnea.
- RESTRICTIONS: Limit dizzy patients on schedule. Does NOT prescribe CPAP or CPAP supplies (refer to sleep medicine).

Robert Butler, MD — 15-min appointments. PA: Michelle Grimes.
- Double book on the hour. Specialty: chronic allergies, chronic/recurrent sinusitis, TM perforations, neoplasms of salivary glands/thyroid/neck, ultrasound-guided FNAs.
- Bastrop location: Monday all day.

Michelle Grimes, PA (Butler) — 15-min, no age restrictions.
- General ENT: sinus, allergies, postnasal drip, snoring/sleep apnea, salivary glands, hearing loss, sinusitis, nasal obstruction, chronic ear disease, dizziness, epistaxis, tongue tie evaluation.
- NO Cigna or Humana Medicare Advantage. No FNAs/ultrasound. No nasal fracture reductions.
- Bastrop: Monday.

Feras Ackall, MD at South — same rules as Central.
Collin Dorner, NP at South — 30-min appointments, same restrictions as Central plus NO Medicare.
Taylor Lackey, MD at South — same rules as Central.`,
  },
  {
    rule_key: 'village_rules',
    rule_text: `VILLAGE LOCATION PROVIDERS:

Taylor Shepard, MD — 15-min appointments. PA: Lauren Upton. Speaks Spanish. Inspire certified.
- Vertigo/dizziness: 1 patient per am/pm session.
- CT/MRI checks and 1-month sinus surgery follow-ups MUST see Dr. Shepard.
- Avoid back-to-back: epistaxis, hoarseness, thyroid/FNAs, wax removals (anything requiring scope).
- No pediatric cough without other ENT concerns. Refer to pediatrician or Dell Children's.
- Burning tongue: refer to PCP. If already seen PCP, schedule 6 weeks out with referral.
- General ENT: sleep apnea, sinus, allergies, nasal fractures, thyroid, salivary glands, neck mass, hearing loss, FNAs, head/neck cancer, dizziness, voice disorders.
- Fill regular schedule before double booking slots.

Lauren Upton, PA (Shepard) — 15-min appointments.
- Vertigo/dizziness: 30-min with audio required.
- Needs approval for foreign body removal.
- RESTRICTIONS: no cancer, biopsy, thyroid, lesions, broken noses.
- DO NOT schedule with Cigna, Multiplan, PHCS, or WellMed.

Mark Dammert, MD — 15-min appointments. Speaks Spanish. Now primarily doing GENERAL ENT at Village and Kyle.
- No patients with acute symptoms (cold/fever).
- No pediatric cough without other ENT concerns. Refer to pediatrician or Dell Children's.
- Burning tongue: refer to PCP. If already seen PCP, schedule 6 weeks out with referral.
- Nasal fractures: schedule 5-7 days after initial break (Kyle) or 5 days out (Village).
- Bell's palsy patients: schedule audiogram.
- Kyle: No audio required for patients with history of wax removal only.

Anna Tomkies, MD at Village — same as South rules.
David Nolen, MD at Village — same as Central rules.

Village Audiology:
- All audios 20 min. Patients age 5 and under: 30 min.
- HA (hearing aid) patients primarily scheduled with Anna on MTW.
- Kelli Shinault sees AUDIOS ONLY.
- Always schedule audio for: hearing loss, dizziness/vertigo, tinnitus, speech delay, ruptured ear drum, Bell's palsy, ear fullness/infections.
- No audio needed for: routine ear cleaning, itchy ears, active ear drainage (schedule audio second).
- No double booking without prior approval from Manager, MA, or Provider.
- Sudden hearing loss: seen within 3 days of symptom onset.
- Nasal fractures/broken nose: schedule 5 days out from date of break.
- Nosebleeds: must wait 48 hours from ER treatment for packing removal.
- Foreign objects: speak with manager/MA/providers first.
- Tongue tie: instruct patient not to eat 1 hour before appointment.

Ashley Rothwell, SLP — Village: Thursday only. Central: Mon/Tue/Wed/Fri.
- No age restrictions. Does not need to be established AENTC patient.
- In-network: Aetna, BCBS, traditional Medicaid, traditional Medicare, TriWest, UHC.
- Do NOT deviate from ModMed blocks.`,
  },
  {
    rule_key: 'north_rules',
    rule_text: `NORTH LOCATION PROVIDERS:

Ryan Boerner, MD — 15-min appointments. PA: Stefany Delascurain. Inspire certified. No restrictions. Sees cancer diagnosis.

Stefany Delascurain, PA (Boerner):
- Sees vertigo/dizziness patients.
- Needs approval for foreign body removal.
- RESTRICTIONS: no cancer, biopsy, thyroid, lesions, broken noses.
- DO NOT schedule with Cigna, Multiplan, PHCS, or WellMed.

Jeff Kahn, MD — 15-min appointments.
- Sees all general ENT: sinus, allergy, nasal congestion, nosebleeds, hearing loss, snoring/sleep apnea, swallowing, ear infections, thyroid disease, parotid tumors, reflux, tonsils, neck masses.
- For same-day true emergency new patients (airway, bleeding, abscess, direct ER referral): notify MD for review.
- Routine same-day add-ons (ear infection, sinusitis, established patients): OK.
- New patient cancer diagnosis: notify/check with MD.
- Limit dizzy patients to 2 per am/pm session.

Anish Raman, MD at North — 15-min. Inspire certified. No restrictions.

North Audiology:
- All audios 20 min EXCEPT: patients under age 5, new patients over 85, patients scheduled by caregiver/assisted living/anyone besides self (these need 30 min or special handling).
- Always schedule audio for: hearing loss, dizziness/vertigo, tinnitus, ear fullness.
- No audio for: routine ear cleaning, ear drainage.`,
  },
  {
    rule_key: 'neurotology_rules',
    rule_text: `NEUROTOLOGY LOCATION PROVIDERS:

General Neurotology Rules:
- Emergent: sudden hearing loss, tumors/masses, otitis media.
- Established patients with new onset draining ear, severe vertigo, or hearing loss: staff/task with MA, PA, or manager if no opening within 3 days.
- ALL audio testing must be scheduled PRIOR to MD or PA appointment.
- New patients: 30-min appointments. Established patients: 15-min appointments.
- No double booking without prior approval.
- Neurotology audiology: established AENT patient = 15-min audio; new AENT patient = 30-min audio.

Jim Kemper, MD — Neurotology. PA: Meg Burger.
- One new vertigo patient per day maximum.
- No new patients on Thursdays or Fridays without prior approval.

Meg Burger, PA (Kemper):
- No Cigna or Medicaid.
- No patients under age 5 UNLESS Dr. Kemper is in the office.
- Established patients with new onset or exacerbation of dizziness/vertigo: 30-min appointments.

Jonathan Choi, MD — Neurotology.
- No patients under age 12.
- New and established: 15-min (exception: tumor patients = 30-min).
- Limit one new vertigo patient per session.
- No limit for new patients except new vertigo.

Cochlear Implants:
- New to AENTC: 30-min audio + 30-min new patient visit. No candidacy testing without this first.
- Re-establish care (upgrade/broken implant): No audio. 30-min new patient + 60-min EP with Kailey/Lauren/Deepa.
- Internal referrals: No audio. 30-min new patient + 90-min NPCI with Kailey/Lauren/Deepa.
- Established patients: 60-min EP visit with Kailey or Lauren.
- Activations/Post-op: No audio. 90-min EP with Kailey/Lauren/Deepa + 15-min PO15 with Meg.`,
  },
  {
    rule_key: 'kyle_rules',
    rule_text: `KYLE LOCATION PROVIDERS:

General Kyle Rules:
- Emergent: sudden hearing loss (within 3 days), peritonsillar abscess (same day), foreign body removal nose/ear/throat (same day).
- No asthma. No TMJ.
- Nosebleeds with packing from ER: must wait 48 hours.
- Tongue tie: instruct patient not to eat 1 hour before appointment.
- Self-pay patients: quote Level 4 New/Established rate, due at check-in. Note amount on appointment. Inform patient additional charges (scopes/audios) collected at checkout.

Kyle Audiology:
- All audios 20 min, scheduled PRIOR to MD appointment.
- Required for: sudden hearing loss, muffled hearing, crackling in ear, ringing in ear, vertigo/dizziness, speech delay, ear infections, ear drainage.
- Patients CANNOT decline audio.
- Active drainage: OK to schedule audio second.
- No audio required for patients with history of wax removal only.

Mark Dammert, MD at Kyle — 15-min. Speaks Spanish. General ENT.
- No patients with acute symptoms (cold/fever).
- Bell's palsy: schedule audiogram.
- No pediatric cough without other ENT concerns.
- Nasal fractures: 5-7 days after initial break.

Brian Schwab, MD at Kyle — 15-min. Same as South rules.
- RESTRICTION: NO new dizzy/vertigo patients — schedule with Alex Baker instead.

Alex Baker, PA at Kyle:
- Tuesday: established patients ONLY (no new patient visits).
- Wednesday: new and established patients.`,
  },
];

// Seed rules only if the table is empty
const seedRules = db.transaction(() => {
  const count = db.prepare('SELECT COUNT(*) as n FROM scheduling_rules').get().n;
  if (count === 0) {
    const insert = db.prepare(
      'INSERT INTO scheduling_rules (rule_key, rule_text) VALUES (?, ?)'
    );
    for (const rule of SEED_RULES) {
      insert.run(rule.rule_key, rule.rule_text);
    }
    console.log(`[DB] Seeded ${SEED_RULES.length} scheduling rule sections.`);
  }
});

seedRules();

// ─── New tables (idempotent — safe to run on every boot) ─────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS condition_mappings (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    condition_name       TEXT    NOT NULL,
    general_ent          INTEGER NOT NULL DEFAULT 1,
    subspecialty         TEXT,
    subspecialty_preferred INTEGER NOT NULL DEFAULT 0,
    notes                TEXT,
    created_by           TEXT,
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Seed condition_mappings ──────────────────────────────────────────────────

const seedConditions = db.transaction(() => {
  const count = db.prepare('SELECT COUNT(*) as n FROM condition_mappings').get().n;
  if (count === 0) {
    db.prepare(`
      INSERT INTO condition_mappings
        (condition_name, general_ent, subspecialty, subspecialty_preferred, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'chronic cough',
      1,
      'laryngology',
      1,
      'Chronic cough has a recognized laryngology component in addition to being a general ENT complaint. Highlight laryngologists as subspecialty-preferred while still listing all valid general ENT providers.',
      'system',
    );
    console.log('[DB] Seeded condition_mappings.');
  }
});

seedConditions();

// ─── Migrations ───────────────────────────────────────────────────────────────
// ALTER TABLE is idempotent via try/catch — safe to run on every boot.

try {
  db.prepare('ALTER TABLE query_log ADD COLUMN recommended_provider TEXT').run();
  console.log('[DB] Migrated: added recommended_provider to query_log');
} catch {
  // Column already exists — no-op
}

// ─── Helper: check if any users exist (used by /setup route) ─────────────────
function hasUsers() {
  return db.prepare('SELECT COUNT(*) as n FROM users').get().n > 0;
}

module.exports = { db, hasUsers };
