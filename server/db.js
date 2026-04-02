const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../aentc.db');
const db = new Database(DB_PATH);

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

  CREATE TABLE IF NOT EXISTS query_log (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    logged_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    scheduler_username   TEXT,
    complaint            TEXT,
    location_preference  TEXT,
    patient_type         TEXT,
    patient_age          TEXT,
    insurance            TEXT,
    ai_response_summary  TEXT,
    recommended_provider TEXT
  );

  -- Global/audiogram reference rules (admin-editable context used by symptom bot)
  CREATE TABLE IF NOT EXISTS scheduling_rules (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_key   TEXT    UNIQUE NOT NULL,
    rule_text  TEXT    NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  -- Master conditions list
  CREATE TABLE IF NOT EXISTS conditions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT    UNIQUE NOT NULL,
    category           TEXT    NOT NULL
                         CHECK(category IN ('general_ent','sleep','head_neck',
                                            'neurotology','laryngology',
                                            'facial_plastics','pediatric','allergy')),
    audiogram_required TEXT    NOT NULL DEFAULT 'never'
                         CHECK(audiogram_required IN ('always','sometimes','never')),
    reasoning          TEXT,
    is_active          INTEGER DEFAULT 1,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by         TEXT
  );

  -- Provider registry (MDs, PAs, NPs, SLPs)
  CREATE TABLE IF NOT EXISTS providers (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    name                    TEXT    NOT NULL,
    title                   TEXT    NOT NULL CHECK(title IN ('MD','DO','PA','NP','SLP')),
    specialty               TEXT,
    supervising_provider_id INTEGER REFERENCES providers(id),
    locations               TEXT    NOT NULL DEFAULT '[]',
    is_active               INTEGER DEFAULT 1,
    show_in_recs            INTEGER DEFAULT 1,
    general_notes           TEXT,
    created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Per-provider, per-condition preferences (no row = neutral)
  CREATE TABLE IF NOT EXISTS provider_preferences (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id     INTEGER NOT NULL REFERENCES providers(id),
    condition_id    INTEGER NOT NULL REFERENCES conditions(id),
    preference      TEXT    NOT NULL CHECK(preference IN ('want','avoid')),
    scheduling_note TEXT,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by      TEXT,
    UNIQUE(provider_id, condition_id)
  );

  -- Every scheduling assignment (drives rotation queue)
  CREATE TABLE IF NOT EXISTS assignments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id  INTEGER NOT NULL REFERENCES providers(id),
    condition_id INTEGER NOT NULL REFERENCES conditions(id),
    location     TEXT,
    scheduled_by INTEGER REFERENCES users(id),
    scheduled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes        TEXT
  );
`);

// ─── Seed: global / audiogram reference rules ─────────────────────────────────

const seedGlobalRules = db.transaction(() => {
  const existing = db.prepare("SELECT id FROM scheduling_rules WHERE rule_key = 'global_rules'").get();
  if (existing) return;

  const insert = db.prepare('INSERT INTO scheduling_rules (rule_key, rule_text) VALUES (?, ?)');

  insert.run('global_rules', `GLOBAL RULES (ALL LOCATIONS):
- Schedule new patients under an MD if a doctor has availability.
- If a patient is established with a particular doctor and that doctor is out, schedule under their mid-level PA/NP.
- Emergent appointments (sudden hearing loss, airway issues, otitis externa, peritonsillar abscess, tumors/masses) get priority at all locations.
- No new patient telehealth visits without MD authorization.
- No asthma patients unless accompanied by ENT-related symptoms (allergies).
- No TMJ treatment (can diagnose, refer out for treatment).
- Patients with multiple issues: give end-of-morning or end-of-afternoon slot. Inform patient they may need multiple appointments.
- Allergy scheduling (ALL locations): Schedule 7-10 days ahead. Enter Scheduled Date in patient Orders tab. Send task to location-specific Allergy team with order attached. Benefits Team verifies insurance. Allergy Team contacts patient.
- Keep a log of all sinus and allergy patient allocations.`);

  insert.run('audiogram_rules', `AUDIOGRAM RULES (ALL LOCATIONS):
- ALWAYS schedule audiogram FIRST for: hearing loss, tinnitus, dizziness/vertigo, speech delay, ruptured ear drum, Bell's palsy, ear fullness/infections.
- Schedule audiogram SECOND (after provider) for: active ear drainage only.
- Patients CANNOT decline audiogram when it is required.
- No audiogram needed for: routine ear cleaning only, itchy ears only, wax removal history only.
- Audiogram duration: Central/South/North = 30 min. Village = 20 min (30 min for age 5 and under). Kyle = 20 min. Neurotology: established AENT patient = 15 min, new AENT patient = 30 min.
- VNG = 90 minutes, must reserve ABR room, only on Deepa or Cassie dedicated VNG blocks.
- ABR = 60 minutes, must reserve ABR room.
- Audios performed elsewhere must have been within previous 3-6 months.
- Patients presenting for abnormal or failed hearing test must have audio done at AENTC.`);

  console.log('[DB] Seeded global/audiogram rules.');
});

seedGlobalRules();

// ─── Seed: conditions ─────────────────────────────────────────────────────────

const CONDITIONS = [
  // ── General ENT ──────────────────────────────────────────────────────────────
  {
    name: 'Hearing Loss',
    category: 'general_ent',
    audiogram: 'always',
    reasoning: 'One of the most common ENT complaints, manageable by all general ENT providers. Audiogram required first per global protocol to quantify the degree and type of loss before the physician appointment.',
  },
  {
    name: 'Tinnitus',
    category: 'general_ent',
    audiogram: 'always',
    reasoning: 'Ringing or noise in the ears. General ENT complaint. Audiogram required first per global protocol — tinnitus frequently has an underlying hearing loss component that must be evaluated before treatment decisions are made.',
  },
  {
    name: 'Ear Pain',
    category: 'general_ent',
    audiogram: 'sometimes',
    reasoning: 'Otalgia is a common general ENT complaint. Audiogram is recommended if hearing change, fullness, or drainage accompanies the pain. Not required for isolated ear pain without other ear symptoms.',
  },
  {
    name: 'Ear Fullness',
    category: 'general_ent',
    audiogram: 'always',
    reasoning: 'Sensation of pressure or fullness typically indicates Eustachian tube dysfunction or middle ear pathology. Audiogram required to assess for a conductive hearing component.',
  },
  {
    name: 'Ear Drainage',
    category: 'general_ent',
    audiogram: 'sometimes',
    reasoning: 'Active otorrhea. Per global protocol, schedule audiogram AFTER the provider visit when active drainage is present — drainage can invalidate audiogram results. For resolved drainage with other ear symptoms, schedule audio first.',
  },
  {
    name: 'Itchy Ears',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Pruritus of the ear canal is typically superficial canal irritation or dermatitis. No audiogram required unless hearing loss, fullness, or other symptoms are also present.',
  },
  {
    name: 'Cerumen Impaction (Ear Wax)',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Routine ear cleaning visit. No audiogram required unless the patient also reports hearing loss. Patients with a history of wax removal only do not need an audiogram per global protocol.',
  },
  {
    name: 'Eustachian Tube Dysfunction',
    category: 'general_ent',
    audiogram: 'always',
    reasoning: 'ETD involves impaired pressure regulation of the middle ear. Audiogram required to assess whether a conductive hearing component exists resulting from middle ear pressure changes.',
  },
  {
    name: 'Ruptured Eardrum / TM Perforation',
    category: 'general_ent',
    audiogram: 'always',
    reasoning: 'Structural defect of the tympanic membrane. Audiogram required to quantify the hearing impact of the perforation and establish a baseline before surgical or medical treatment planning.',
  },
  {
    name: 'Chronic Ear Disease',
    category: 'general_ent',
    audiogram: 'always',
    reasoning: 'Ongoing middle ear pathology (chronic otitis media, etc.). Audiogram required to track hearing changes over time and guide surgical or medical management decisions.',
  },
  {
    name: 'Foreign Body Removal',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Procedural visit for removal of foreign objects from the ear, nose, or throat. No audiogram needed unless a concurrent hearing complaint is reported. Same-day priority scheduling applies. Some PAs require manager approval for foreign body removal.',
  },
  {
    name: 'Nasal Congestion / Obstruction',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Blockage of the nasal passages is one of the most common general ENT complaints. Can be caused by structural issues (deviated septum, polyps) or inflammatory conditions (allergies, sinusitis). No audiogram required.',
  },
  {
    name: 'Sinusitis (Acute)',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Acute bacterial or viral sinusitis with symptoms present less than 4 weeks. Routine general ENT complaint managed by most providers. No audiogram required.',
  },
  {
    name: 'Sinusitis (Chronic)',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Sinusitis persisting more than 12 weeks despite treatment. May warrant surgical evaluation (FESS). General ENT complaint, though rhinologists (Ackall) have subspecialty expertise and may be preferred for complex or recurrent cases. No audiogram required.',
  },
  {
    name: 'Allergic Rhinitis',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Inflammation of the nasal passages due to allergens. Very common general ENT and allergy complaint. Often managed long-term with immunotherapy. No audiogram required.',
  },
  {
    name: 'Post-Nasal Drip',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Mucus drainage down the back of the throat. Commonly associated with allergies, sinusitis, or reflux. General ENT complaint manageable by most providers. No audiogram required.',
  },
  {
    name: 'Nasal Polyps',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Benign growths in the nasal passages or sinuses. Often associated with chronic sinusitis or allergies. May require surgical management (FESS). Rhinologists (Ackall) have subspecialty expertise for complex cases. No audiogram required.',
  },
  {
    name: 'Epistaxis (Nosebleeds)',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Nasal bleeding is manageable by most general ENT providers. Complex cases requiring RhinoRockets should have the supervising MD notified or double-booked (per Dao and Shepard rules). Patients with ER nasal packing must wait 48 hours before the appointment.',
  },
  {
    name: 'Deviated Septum',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Structural deviation of the nasal septum causing obstruction. Surgical correction (septoplasty) is common. General ENT complaint with rhinology overlap for combined sinus/septum cases. No audiogram required.',
  },
  {
    name: 'Tonsil / Adenoid Issues',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Grouped category covering tonsillitis, recurrent sore throat, tonsil stones, tonsillectomy, and adenoid hypertrophy or removal. Extremely common general ENT complaint handled by most providers. Pediatric cases are subject to provider age restrictions.',
  },
  {
    name: 'Reflux / LPR',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Laryngopharyngeal reflux causing throat symptoms such as globus sensation, chronic throat-clearing, or hoarseness. General ENT complaint with laryngology overlap for complex cases. No audiogram required.',
  },
  {
    name: 'Snoring',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Upper airway turbulence during sleep. Often evaluated alongside sleep apnea but can be an isolated complaint. General ENT complaint. Inspire-certified providers are preferred when surgical management may be considered.',
  },
  {
    name: 'Chronic Cough',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Persistent cough is a general ENT complaint with significant laryngology overlap (laryngeal hypersensitivity, reflux, post-nasal drip). Laryngologists (Lackey, Whited) are subspecialty-preferred for complex cases but general ENT providers can manage most presentations. No audiogram required.',
  },
  {
    name: 'Swallowing / Dysphagia',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Difficulty swallowing is a general ENT complaint handled by most providers. Complex cases involving aspiration or motility disorders have significant laryngology overlap. SLP involvement (Ashley Rothwell) may also be appropriate. No audiogram required.',
  },
  {
    name: 'Tongue Tie',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Ankyloglossia affecting feeding or speech. General ENT complaint. Patient should be instructed not to eat 1 hour before appointment. Note: Lizzie Yarotsky PA does not see tongue ties.',
  },
  {
    name: 'Salivary Gland Issues',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'Inflammation, stones, or infection of salivary glands. General ENT complaint with head/neck surgery overlap for neoplasms. Parotid tumors specifically should be categorized as a head/neck surgical condition. No audiogram required.',
  },
  {
    name: 'Neck Mass',
    category: 'general_ent',
    audiogram: 'never',
    reasoning: 'New neck mass requires evaluation by an MD. Some providers do not accept new neck mass referrals (Feras Ackall does not schedule new neck masses). Cancer diagnosis cases require MD involvement and notification. No audiogram required.',
  },

  // ── Sleep ─────────────────────────────────────────────────────────────────────
  {
    name: 'Sleep Apnea / OSA',
    category: 'sleep',
    audiogram: 'never',
    reasoning: 'Obstructive sleep apnea managed by general ENT and sleep medicine providers. Inspire-certified providers (Dao, Raman, Boerner, Tomkies, Shepard) are preferred when surgical management may be considered. Note: Anna Tomkies does not prescribe CPAP — refer to sleep medicine for PAP initiation.',
  },
  {
    name: 'CPAP Management / PAP Compliance',
    category: 'sleep',
    audiogram: 'never',
    reasoning: 'Follow-up management of PAP therapy for existing sleep apnea patients. Note: Anna Tomkies does not manage CPAP or supply CPAP equipment — refer those patients to sleep medicine. All other general ENT providers can manage PAP compliance visits.',
  },
  {
    name: 'Inspire Therapy',
    category: 'sleep',
    audiogram: 'never',
    reasoning: 'Upper airway stimulation implantable device for sleep apnea. Requires Inspire certification. Certified providers only: Ashley Dao (Central), Anish Raman (Central/North), Ryan Boerner (North), Anna Tomkies (South/Village), Taylor Shepard (Village). Do not schedule non-certified providers for Inspire referrals.',
  },

  // ── Head & Neck ───────────────────────────────────────────────────────────────
  {
    name: 'Thyroid Disease / Nodules',
    category: 'head_neck',
    audiogram: 'never',
    reasoning: 'Thyroid pathology including nodules, goiter, and benign thyroid disease. Head and neck surgery subspecialty. Not all providers accept thyroid referrals — Feras Ackall (rhinology) does not schedule thyroid cases, and Lauren Upton PA does not see thyroid patients.',
  },
  {
    name: 'Thyroid Surgery',
    category: 'head_neck',
    audiogram: 'never',
    reasoning: 'Surgical management of thyroid conditions requiring thyroidectomy. Head and neck surgery subspecialty requiring MD involvement. Providers with documented thyroid surgery experience: Yium, Schwab, Shepard, Butler, Boerner, Kahn.',
  },
  {
    name: 'Parathyroid',
    category: 'head_neck',
    audiogram: 'never',
    reasoning: 'Parathyroid disease (hyperparathyroidism) requiring surgical evaluation. Head and neck subspecialty. Brian Schwab at South has parathyroid listed as a specific area of practice in scheduling rules.',
  },
  {
    name: 'Parotid Tumor / Surgery',
    category: 'head_neck',
    audiogram: 'never',
    reasoning: 'Parotid gland neoplasms requiring surgical evaluation or parotidectomy. Head and neck surgery subspecialty. Robert Butler specializes in neoplasms of salivary glands. Note: Feras Ackall does not schedule parotid cases.',
  },
  {
    name: 'Head and Neck Cancer',
    category: 'head_neck',
    audiogram: 'never',
    reasoning: 'Malignant or suspected malignant head and neck tumors. MD involvement is required — PAs with cancer restrictions (Lauren Upton, Stefany Delascurain) should not be scheduled. Ryan Boerner and Jeff Kahn explicitly see cancer diagnosis. David Nolen urgent cancer referrals should go through Olivia/Mitzi first.',
  },
  {
    name: 'Thyroid Cancer',
    category: 'head_neck',
    audiogram: 'never',
    reasoning: 'Thyroid malignancy requiring surgical management. Head and neck surgery subspecialty. Brian Schwab at South has thyroid cancer listed as a specific area of practice. MD involvement required.',
  },
  {
    name: 'FNA (Fine Needle Aspiration)',
    category: 'head_neck',
    audiogram: 'never',
    reasoning: 'Ultrasound-guided fine needle aspiration biopsy of thyroid, salivary glands, or neck masses. Robert Butler specializes in ultrasound-guided FNAs. Note: Lizzie Yarotsky PA and Michelle Grimes PA cannot perform FNAs. Requires MD for most providers.',
  },
  {
    name: 'Nasal Fracture',
    category: 'head_neck',
    audiogram: 'never',
    reasoning: 'Broken nose requiring evaluation and possible closed reduction. Schedule 5 days out from the date of injury to allow swelling to subside (Village and Kyle rules specify 5-7 days). Note: several PAs cannot see nasal fractures (Lauren Upton, Lizzie Yarotsky, Stefany Delascurain).',
  },

  // ── Neurotology ───────────────────────────────────────────────────────────────
  {
    name: 'Vertigo / Dizziness',
    category: 'neurotology',
    audiogram: 'always',
    reasoning: 'Balance and vestibular disorders are a neurotology subspecialty but can be seen by general ENT providers with session volume limits. Audiogram required first per global protocol. Per-session limits apply: Shepard (1 per session), Kahn (2 per session), Kemper/Choi (1 new per day). Brian Schwab does not accept new dizzy/vertigo patients.',
  },
  {
    name: 'BPPV',
    category: 'neurotology',
    audiogram: 'always',
    reasoning: 'Benign paroxysmal positional vertigo is the most common cause of vertigo. Treated with Epley maneuver — Chad Whited performs Epley maneuvers in-office. Audiogram required per protocol. Neurotology providers and select general ENT providers manage this well.',
  },
  {
    name: "Meniere's Disease",
    category: 'neurotology',
    audiogram: 'always',
    reasoning: "Inner ear disorder causing episodic vertigo, fluctuating hearing loss, tinnitus, and aural fullness. Neurotology subspecialty. Audiogram required to track fluctuating hearing loss over time, which is characteristic of Meniere's.",
  },
  {
    name: 'Sudden Hearing Loss',
    category: 'neurotology',
    audiogram: 'always',
    reasoning: 'Sudden sensorineural hearing loss is a medical emergency. Must be seen within 3 days of symptom onset at all locations. Audiogram required. All locations treat as priority scheduling. Neurotology subspecialty is preferred for full workup.',
  },
  {
    name: 'Cochlear Implant Evaluation',
    category: 'neurotology',
    audiogram: 'always',
    reasoning: 'Candidacy evaluation for cochlear implantation. Requires audiology team involvement (Kailey/Lauren/Deepa). New to AENTC: 30-min audio plus 30-min new patient visit required before candidacy testing can proceed. Neurotology subspecialty only (Kemper, Choi).',
  },
  {
    name: 'Cochlear Implant Management',
    category: 'neurotology',
    audiogram: 'sometimes',
    reasoning: 'Follow-up management of existing cochlear implant patients including activations, mapping, and post-op visits. Managed by Kemper and Choi with the audiology team at the Neurotology location. Audiogram depends on visit type.',
  },
  {
    name: 'Cholesteatoma',
    category: 'neurotology',
    audiogram: 'always',
    reasoning: 'Destructive keratinizing cyst of the middle ear requiring surgical management. Neurotology subspecialty. Audiogram required to document hearing status before and after surgical intervention. Kemper and Choi at the Neurotology location are the preferred providers.',
  },
  {
    name: "Bell's Palsy",
    category: 'neurotology',
    audiogram: 'always',
    reasoning: "Idiopathic facial nerve palsy. Audiogram is required per global protocol and is specifically called out in Village and Kyle location rules (Mark Dammert: schedule audiogram for Bell's palsy). Neurotology subspecialty but initial evaluation can be done by general ENT providers.",
  },
  {
    name: 'Skull Base Surgery',
    category: 'neurotology',
    audiogram: 'sometimes',
    reasoning: 'Complex skull base surgery is both a neurotology and rhinology subspecialty. Kemper and Choi (neurotology) and Ackall (rhinology/skull base/pituitary) are the preferred providers. Audiogram needed if hearing involvement is part of the presentation.',
  },

  // ── Laryngology ───────────────────────────────────────────────────────────────
  {
    name: 'Voice Disorders / Hoarseness',
    category: 'laryngology',
    audiogram: 'never',
    reasoning: 'Dysphonia and voice disorders are a laryngology subspecialty. Taylor Lackey and Chad Whited are the AENTC laryngologists. Lackey accepts patients under age 15 for voice complaints only (unlike other conditions). No audiogram required.',
  },
  {
    name: 'Vocal Cord Issues',
    category: 'laryngology',
    audiogram: 'never',
    reasoning: 'Vocal cord pathology including nodules, polyps, granulomas, and paralysis. Laryngology subspecialty. Whited has dedicated strobe/voice rooms on Monday PM for these cases. No audiogram required.',
  },
  {
    name: 'Laryngoscopy',
    category: 'laryngology',
    audiogram: 'never',
    reasoning: 'Endoscopic evaluation of the larynx and airway. Laryngology subspecialty procedure performed by Whited and Lackey. No audiogram required.',
  },
  {
    name: 'Complex Swallowing / Dysphagia',
    category: 'laryngology',
    audiogram: 'never',
    reasoning: 'Complex dysphagia including aspiration, esophageal motility disorders, and cases unresponsive to initial management. Laryngology subspecialty. Whited performs esophageal dilations in-office. Ashley Rothwell SLP is appropriate for swallowing therapy. No audiogram required.',
  },
  {
    name: 'Airway Concerns',
    category: 'laryngology',
    audiogram: 'never',
    reasoning: 'Airway compromise, subglottic stenosis, or tracheal pathology. Laryngology subspecialty. Emergent airway issues receive top priority scheduling at all locations per global rules. No audiogram required.',
  },

  // ── Facial Plastics ───────────────────────────────────────────────────────────
  {
    name: 'Rhinoplasty',
    category: 'facial_plastics',
    audiogram: 'never',
    reasoning: 'Surgical reshaping of the nose. Facial plastics subspecialty managed primarily by David Nolen MD. No audiogram required.',
  },
  {
    name: 'Facial Cosmetic Consult',
    category: 'facial_plastics',
    audiogram: 'never',
    reasoning: 'Consultation for cosmetic procedures including Juvederm, Botox, and Kenalog injections. David Nolen: cosmetic consults are Wednesdays only, 30-min slots. Chad Whited also performs Juvederm, Botox, Kenalog, and Superior Laryngeal Nerve Blocks (15-min). No audiogram required.',
  },
  {
    name: 'Facial Plastic Surgery',
    category: 'facial_plastics',
    audiogram: 'never',
    reasoning: 'General facial plastic surgery evaluation and surgical management (excluding rhinoplasty). David Nolen MD is the primary facial plastics provider. No patients under age 4. No audiogram required.',
  },

  // ── Pediatric ─────────────────────────────────────────────────────────────────
  {
    name: 'Pediatric Ear Tubes',
    category: 'pediatric',
    audiogram: 'always',
    reasoning: 'Tympanostomy tube placement in children. One of the most common pediatric ENT procedures. Audiogram required. Providers with pediatric age restrictions must not be scheduled: Lackey (no under 15), Collin Dorner NP (no pediatric).',
  },
  {
    name: 'Pediatric Tonsils / Adenoids',
    category: 'pediatric',
    audiogram: 'never',
    reasoning: 'Tonsillectomy and adenoidectomy in children. Very common pediatric ENT procedure. Providers with pediatric restrictions apply: Lackey (no under 15), Collin Dorner NP (no pediatric), Sonam Khanjae PA (no pediatric without supervising MD in office). No audiogram required.',
  },
  {
    name: 'Pediatric Hearing Loss',
    category: 'pediatric',
    audiogram: 'always',
    reasoning: 'Hearing loss evaluation in children. Audiogram required. Children age 5 and under need longer audiogram slots (30 min at most locations vs standard 20 min). Providers with pediatric age restrictions apply.',
  },
  {
    name: 'Speech Delay',
    category: 'pediatric',
    audiogram: 'always',
    reasoning: 'Delayed speech development in children. Audiogram required per global protocol to rule out hearing loss as a contributing factor. Ashley Rothwell SLP may also be appropriate for speech evaluation and therapy.',
  },
  {
    name: 'Pediatric General ENT',
    category: 'pediatric',
    audiogram: 'never',
    reasoning: 'General ENT complaints in pediatric patients not covered by more specific categories. Providers with age restrictions must not be scheduled: Nolen (no under 4), Lackey (no under 15), Collin Dorner NP (no pediatric), Sonam Khanjae PA (no pediatric without MD). Dammert and Shepard: no pediatric cough without accompanying ENT concerns.',
  },

  // ── Allergy ───────────────────────────────────────────────────────────────────
  {
    name: 'Allergy Testing',
    category: 'allergy',
    audiogram: 'never',
    reasoning: 'Skin testing or blood testing for allergen identification. Per global allergy protocol: schedule 7-10 days ahead, enter the Scheduled Date in the patient Orders tab, send a task to the location-specific Allergy team with the order attached. Benefits Team verifies insurance; Allergy Team contacts the patient. No audiogram required.',
  },
  {
    name: 'Allergy Immunotherapy',
    category: 'allergy',
    audiogram: 'never',
    reasoning: 'Allergy shot administration or sublingual immunotherapy. Managed by the Allergy team per location. Benefits Team verifies insurance; Allergy Team contacts the patient. All allergy patient allocations must be logged per global rules. No audiogram required.',
  },
  {
    name: 'Chronic Allergies',
    category: 'allergy',
    audiogram: 'never',
    reasoning: 'Long-term management of allergic conditions. Robert Butler MD specializes in chronic/recurrent allergies at South. Global allergy scheduling protocol applies: 7-10 days advance scheduling, insurance verification by Benefits Team. No audiogram required.',
  },
];

const seedConditions = db.transaction(() => {
  const count = db.prepare('SELECT COUNT(*) as n FROM conditions').get().n;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO conditions (name, category, audiogram_required, reasoning, updated_by)
    VALUES (?, ?, ?, ?, 'system')
  `);

  for (const c of CONDITIONS) {
    insert.run(c.name, c.category, c.audiogram, c.reasoning);
  }

  console.log(`[DB] Seeded ${CONDITIONS.length} conditions.`);
});

seedConditions();

// ─── Seed: providers ──────────────────────────────────────────────────────────

const seedProviders = db.transaction(() => {
  const count = db.prepare('SELECT COUNT(*) as n FROM providers').get().n;
  if (count > 0) return;

  const insertMD = db.prepare(`
    INSERT INTO providers (name, title, specialty, locations, general_notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  const MDS = [
    {
      name: 'Ashley Dao',
      title: 'MD',
      specialty: 'general_ent',
      locations: ['Central'],
      notes: 'Inspire certified. No scheduling restrictions. OK to double book if emergent same day.',
    },
    {
      name: 'Anish Raman',
      title: 'MD',
      specialty: 'general_ent',
      locations: ['Central', 'North'],
      notes: 'Inspire certified. No restrictions. TTI appointments = 30 min.',
    },
    {
      name: 'Feras Ackall',
      title: 'MD',
      specialty: 'rhinology',
      locations: ['Central', 'South'],
      notes: 'Rhinology specialty: nasal cavity, sinuses, skull base, pituitary. No double booking. Approval needed for same-day add-ons. Do NOT schedule: new neck mass, thyroid, parotid, cancer (other than nasal/sinus). All ear appointments must have audiogram scheduled first.',
    },
    {
      name: 'David Nolen',
      title: 'MD',
      specialty: 'facial_plastics',
      locations: ['Central', 'Village'],
      notes: 'Facial plastics. No patients under age 4. Urgent cancer/nasal fracture referrals: send to Olivia and/or Mitzi first; if unavailable, schedule soonest and send task. Must request records. New patients: 20 min; do NOT schedule back-to-back. Established: 15 min. Cosmetic consults: 30 min, Wednesdays only.',
    },
    {
      name: 'Taylor Lackey',
      title: 'MD',
      specialty: 'laryngology',
      locations: ['Central', 'South'],
      notes: 'Laryngology. No patients under age 15 (voice complaints only for under 15). OK to double book urgent/same-day. Will see Whited patients for urgent concerns when Whited is out.',
    },
    {
      name: 'Chad Whited',
      title: 'MD',
      specialty: 'laryngology',
      locations: ['Central'],
      notes: 'Laryngology. Do NOT schedule in-office procedures without confirmation from Alex or Kelly. MWF double booking allowed on right side of schedule at 8:30a and 9a. Monday PM strobe rooms: Right = normal 15 min; Left = voice/swallowing/airway new patients 20 min only. Performs Epley maneuvers, esophageal dilations, Juvederm, Botox, Kenalog, Superior Laryngeal Nerve Blocks, epistaxis control.',
    },
    {
      name: 'Mike Yium',
      title: 'MD',
      specialty: 'general_ent',
      locations: ['South'],
      notes: 'General ENT. No scheduling restrictions. Lockhart location: Wednesday PM.',
    },
    {
      name: 'Brian Schwab',
      title: 'MD',
      specialty: 'general_ent',
      locations: ['South', 'Kyle'],
      notes: 'General ENT. RESTRICTION: No new dizzy/vertigo patients. At Kyle, schedule dizzy/vertigo patients with Alex Baker instead.',
    },
    {
      name: 'Anna Tomkies',
      title: 'MD',
      specialty: 'general_ent',
      locations: ['South', 'Village'],
      notes: 'General ENT. Inspire certified, Airlift. Limit dizzy patients on schedule. Does NOT prescribe CPAP or CPAP supplies — refer to sleep medicine.',
    },
    {
      name: 'Robert Butler',
      title: 'MD',
      specialty: 'general_ent',
      locations: ['South'],
      notes: 'General ENT. Double book on the hour. Specialty: chronic allergies, chronic/recurrent sinusitis, TM perforations, neoplasms of salivary glands/thyroid/neck, ultrasound-guided FNAs. Bastrop location: Mondays.',
    },
    {
      name: 'Taylor Shepard',
      title: 'MD',
      specialty: 'general_ent',
      locations: ['Village'],
      notes: 'General ENT. Inspire certified. Speaks Spanish. Vertigo/dizziness: limit to 1 patient per am/pm session. CT/MRI checks and 1-month sinus surgery follow-ups MUST see Dr. Shepard. Avoid back-to-back: epistaxis, hoarseness, thyroid/FNAs, wax removals (anything requiring scope). No pediatric cough without other ENT concerns. Burning tongue: refer to PCP.',
    },
    {
      name: 'Mark Dammert',
      title: 'MD',
      specialty: 'general_ent',
      locations: ['Village', 'Kyle'],
      notes: 'General ENT. Speaks Spanish. No patients with acute symptoms (cold/fever). No pediatric cough without other ENT concerns. Burning tongue: refer to PCP. Nasal fractures: schedule 5-7 days after initial break. Bell\'s palsy: schedule audiogram.',
    },
    {
      name: 'Ryan Boerner',
      title: 'MD',
      specialty: 'general_ent',
      locations: ['North'],
      notes: 'General ENT. Inspire certified. No restrictions. Sees cancer diagnosis.',
    },
    {
      name: 'Jeff Kahn',
      title: 'MD',
      specialty: 'general_ent',
      locations: ['North'],
      notes: 'General ENT. Limit dizzy patients to 2 per am/pm session. Same-day true emergency new patients (airway, bleeding, abscess, direct ER referral): notify MD for review. New patient cancer diagnosis: notify/check with MD.',
    },
    {
      name: 'Jim Kemper',
      title: 'MD',
      specialty: 'neurotology',
      locations: ['Central'],
      notes: 'Neurotology. One new vertigo patient per day maximum. No new patients on Thursdays or Fridays without prior approval.',
    },
    {
      name: 'Jonathan Choi',
      title: 'MD',
      specialty: 'neurotology',
      locations: ['Central'],
      notes: 'Neurotology. No patients under age 12. New and established: 15 min (tumor patients: 30 min). Limit one new vertigo patient per session.',
    },
  ];

  for (const p of MDS) {
    insertMD.run(p.name, p.title, p.specialty, JSON.stringify(p.locations), p.notes);
  }

  // ── PAs / NPs / SLP (inserted after MDs so supervising IDs resolve) ──────────
  const getId = db.prepare('SELECT id FROM providers WHERE name = ?');
  const insertSupervised = db.prepare(`
    INSERT INTO providers (name, title, specialty, supervising_provider_id, locations, general_notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const SUPERVISED = [
    {
      name: 'Liz Guzy',
      title: 'PA',
      specialty: 'general_ent',
      supervising: 'Ashley Dao',
      locations: ['Central'],
      notes: 'Dao PA. When Dao is in office: ear wax = 15 min, all else = 30 min. When Dao is out: all appointments = 15 min.',
    },
    {
      name: 'Collin Dorner',
      title: 'NP',
      specialty: 'general_ent',
      supervising: 'Feras Ackall',
      locations: ['Central', 'South'],
      notes: 'Ackall/Whited NP. NO pediatric patients. No Cigna, Humana Medicare Advantage, or Medicare (at South location). Central: 15-min appointments. South: 30-min appointments.',
    },
    {
      name: 'Sonam Khanjae',
      title: 'PA',
      specialty: 'general_ent',
      supervising: 'Chad Whited',
      locations: ['Central'],
      notes: 'Whited PA. No pediatrics without supervising MD in office. When Whited is in office: all 30 min. When out: new = 30 min, established simple = 15 min, established complex = 30 min.',
    },
    {
      name: 'Alex Baker',
      title: 'PA',
      specialty: 'general_ent',
      supervising: 'Chad Whited',
      locations: ['Central', 'Kyle'],
      notes: 'Whited PA. At Central: assists Whited per Whited rules. At Kyle: Tuesday = established patients only (no new visits). Wednesday = new and established patients.',
    },
    {
      name: 'Lizzie Yarotsky',
      title: 'PA',
      specialty: 'general_ent',
      supervising: 'Mike Yium',
      locations: ['South'],
      notes: 'Yium PA. No age restrictions. NO Cigna or Humana Medicare Advantage. NO tongue ties. NO nasal fractures.',
    },
    {
      name: 'Michelle Grimes',
      title: 'PA',
      specialty: 'general_ent',
      supervising: 'Robert Butler',
      locations: ['South'],
      notes: 'Butler PA. No age restrictions. NO Cigna or Humana Medicare Advantage. No FNAs/ultrasound. No nasal fracture reductions. Bastrop: Mondays.',
    },
    {
      name: 'Lauren Upton',
      title: 'PA',
      specialty: 'general_ent',
      supervising: 'Taylor Shepard',
      locations: ['Village'],
      notes: 'Shepard PA. Vertigo/dizziness: 30-min appointment, audiogram required. Needs manager/MA/provider approval for foreign body removal. RESTRICTIONS: no cancer, biopsy, thyroid, lesions, broken noses. DO NOT schedule with Cigna, Multiplan, PHCS, or WellMed.',
    },
    {
      name: 'Stefany Delascurain',
      title: 'PA',
      specialty: 'general_ent',
      supervising: 'Ryan Boerner',
      locations: ['North'],
      notes: 'Boerner PA. Sees vertigo/dizziness patients. Needs approval for foreign body removal. RESTRICTIONS: no cancer, biopsy, thyroid, lesions, broken noses. DO NOT schedule with Cigna, Multiplan, PHCS, or WellMed.',
    },
    {
      name: 'Meg Burger',
      title: 'PA',
      specialty: 'neurotology',
      supervising: 'Jim Kemper',
      locations: ['Central'],
      notes: 'Kemper PA. No Cigna or Medicaid. No patients under age 5 UNLESS Dr. Kemper is in the office. Established patients with new onset or exacerbation of dizziness/vertigo: 30-min appointments.',
    },
    {
      name: 'Ashley Rothwell',
      title: 'SLP',
      specialty: 'laryngology',
      supervising: null,
      locations: ['Village', 'Central'],
      notes: 'Speech Language Pathologist. Village: Thursdays only. Central: Mon/Tue/Wed/Fri. No age restrictions. Does not need to be an established AENTC patient. In-network: Aetna, BCBS, traditional Medicaid, traditional Medicare, TriWest, UHC. Do NOT deviate from ModMed blocks.',
    },
  ];

  for (const p of SUPERVISED) {
    const supervisingId = p.supervising ? (getId.get(p.supervising)?.id ?? null) : null;
    insertSupervised.run(
      p.name,
      p.title,
      p.specialty,
      supervisingId,
      JSON.stringify(p.locations),
      p.notes,
    );
  }

  console.log('[DB] Seeded 26 providers.');
});

seedProviders();

// ─── Migrations (idempotent — safe on every boot) ─────────────────────────────

// Add updated_at trigger-friendly columns if missing from older installs
for (const col of [
  ['conditions', 'updated_at',   'DATETIME DEFAULT CURRENT_TIMESTAMP'],
  ['providers',  'updated_at',   'DATETIME DEFAULT CURRENT_TIMESTAMP'],
  ['providers',  'show_in_recs', 'INTEGER DEFAULT 1'],
]) {
  try {
    db.prepare(`ALTER TABLE ${col[0]} ADD COLUMN ${col[1]} ${col[2]}`).run();
  } catch { /* already exists */ }
}

// Exclude SLP from general scheduling recommendations (they take direct referrals)
db.prepare("UPDATE providers SET show_in_recs = 0 WHERE title = 'SLP' AND (show_in_recs IS NULL OR show_in_recs = 1)").run();

// Neurotology clinic closed — Kemper, Choi, and Burger all moved to Central
for (const name of ['Jim Kemper', 'Jonathan Choi', 'Meg Burger']) {
  db.prepare(`
    UPDATE providers SET locations = '["Central"]'
    WHERE name = ? AND (locations LIKE '%Neurotology%' OR locations = '["Neurotology","Central"]')
  `).run(name);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasUsers() {
  return db.prepare('SELECT COUNT(*) as n FROM users').get().n > 0;
}

module.exports = { db, hasUsers };
