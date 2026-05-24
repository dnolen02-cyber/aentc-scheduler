const API_KEY_STORAGE = 'swahili_anthropic_key';

export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

export function saveApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE, key.trim());
}

export async function askAboutCard(question, card) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('NO_KEY');

  const systemPrompt = `You are a Kenyan Swahili language tutor. The student is reviewing a flashcard and has a question about it.

Current card:
- English: ${card.english}
- Swahili: ${card.swahili}${card.notes ? `\n- Context note: ${card.notes}` : ''}

Answer the student's question concisely. Focus on:
- Word-by-word breakdowns when asked
- Grammar structure (noun classes, verb tenses, prefixes)
- How words are used in real Kenyan conversation
- Related words, synonyms, or common variations
- Cultural context when it adds meaning

Keep answers to 3–5 sentences unless a longer explanation is genuinely needed. Use English to explain.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: question }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('BAD_KEY');
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}
