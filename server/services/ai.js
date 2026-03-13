const Anthropic = require('@anthropic-ai/sdk');
const { db } = require('../db');

const client = new Anthropic();

// ── Hardcoded prompt sections ─────────────────────────────────────────────────

const ROLE_INSTRUCTION = `You are a scheduling assistant for Austin ENT & Allergy (AENTC). Your job is to identify ALL providers who are qualified to see a patient based on their complaint, age, insurance, and patient type (new vs established). Always follow the scheduling rules exactly. Be specific and actionable. If something is unclear, ask a clarifying question.`;

const PROVIDER_ORDERING_RULES = `PROVIDER ORDERING RULES (apply these when sorting the numbered list):

1. MDs always appear before mid-level providers (PAs/NPs) UNLESS the patient is an established patient who has explicitly named a specific mid-level as their provider — in that case, place that mid-level first.

2. Among MDs, subspecialists should be included for general complaints and HIGHLIGHTED when the patient's condition falls within their subspecialty area, even if it also has a general ENT component.
   Example: Chronic cough is a general ENT complaint, but it is also a recognized laryngology complaint. When a patient presents with chronic cough, laryngologists should be highlighted as SUBSPECIALTY-PREFERRED providers (marked clearly) while general ENT providers are still listed as valid options below them.

3. After applying rules 1 and 2, sort remaining providers within each tier by today's recommendation count (fewest first) per the LOAD BALANCING CONTEXT.

Marking convention for subspecialty-preferred providers:
   Add "★ SUBSPECIALTY MATCH" on the same line as the provider name, e.g.:
   1. Taylor Lackey, MD (Laryngology) — Central  ★ SUBSPECIALTY MATCH`;

const OUTPUT_FORMAT_INSTRUCTION = `List ALL providers who are qualified to see this patient based on the scheduling rules. Do not pick just one — the scheduler needs to see every available option.

Format your visible response as:

Line 1: "[N] provider(s) can see this patient" (replace N with the actual count)

Then a numbered list of ALL qualifying providers, sorted by the PROVIDER ORDERING RULES above. For each provider:

  [Number]. PROVIDER NAME (Specialty if relevant) — LOCATION  [★ SUBSPECIALTY MATCH if applicable]
  • Appointment length
  • Audiogram required? (yes/no and duration, or N/A)
  • Any special instructions or scheduling flags for this patient
  • Any insurance warnings specific to this patient's insurance

After the numbered list, add:

EXCLUDED PROVIDERS:
• [Provider Name] — [brief reason: insurance restriction, age restriction, complaint outside scope, etc.]
(Only list providers who would normally be relevant to this complaint but cannot see this specific patient.)

ALWAYS end your response with this exact JSON block on its own line (the frontend strips it before display):
{"_meta":{"recommended_provider":"[Full name of the #1 provider on the list]","recommended_location":"[Their location]","is_sinus_allergy":[true or false],"all_qualifying_providers":["Full Name 1","Full Name 2"]}}`;

// ── Build condition mappings section from DB ──────────────────────────────────

function buildConditionMappingsSection() {
  const mappings = db
    .prepare('SELECT * FROM condition_mappings ORDER BY condition_name ASC')
    .all();

  if (mappings.length === 0) return null;

  const lines = mappings.map(m => {
    const parts = [
      `• ${m.condition_name}:`,
      `General ENT = ${m.general_ent ? 'YES' : 'NO'}`,
    ];
    if (m.subspecialty) {
      parts.push(`Subspecialty = ${m.subspecialty}`);
      parts.push(`Subspecialty Preferred = ${m.subspecialty_preferred ? 'YES' : 'NO'}`);
    }
    if (m.notes) parts.push(`Notes: ${m.notes}`);
    return parts.join(' | ');
  });

  return [
    'The following condition-to-subspecialty mappings have been configured by administrators.',
    'Use these to identify when a complaint warrants subspecialty highlighting:',
    '',
    ...lines,
  ].join('\n');
}

// ── Assemble system prompt from DB rules + condition mappings + ranking ────────
// Called fresh on every query — all DB-sourced sections update immediately.

function buildSystemPrompt(rankingContext) {
  const rules = db
    .prepare('SELECT rule_key, rule_text FROM scheduling_rules ORDER BY id ASC')
    .all();

  const ruleSections = rules
    .map(r => r.rule_text.trim())
    .join('\n\n---\n\n');

  const conditionMappings = buildConditionMappingsSection();

  const sections = [
    ROLE_INSTRUCTION,
    '',
    '--- PROVIDER ORDERING RULES ---',
    '',
    PROVIDER_ORDERING_RULES,
    '',
    '--- SCHEDULING RULES ---',
    '',
    ruleSections,
  ];

  if (conditionMappings) {
    sections.push('', '--- CONDITION-TO-SUBSPECIALTY MAPPINGS ---', '', conditionMappings);
  }

  sections.push(
    '',
    '--- LOAD BALANCING CONTEXT ---',
    '',
    rankingContext,
    '',
    '--- OUTPUT INSTRUCTIONS ---',
    '',
    OUTPUT_FORMAT_INSTRUCTION,
  );

  return sections.join('\n');
}

// ── Main query function ───────────────────────────────────────────────────────

async function queryScheduler(messages, rankingContext) {
  const systemPrompt = buildSystemPrompt(rankingContext);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  return response.content[0].text;
}

module.exports = { queryScheduler };
