import { getAzureOpenAiClient } from './evaluator.mjs';
import { config } from './config.mjs';
import { entryFromAtsSlug, entryFromUrl, countOpenings, detectAts } from './scanner.mjs';

const VALIDATION_CONCURRENCY = 6;
const MAX_SUGGESTIONS = 30;
const ATS_PROVIDERS = ['greenhouse', 'ashby', 'lever'];

// Ask the model for organizations in the candidate's field that plausibly use
// Greenhouse / Ashby / Lever, with their best guess at the ATS board slug.
async function suggestRaw({ cv, targetRoles }) {
  const client = getAzureOpenAiClient();
  const system = [
    'You help a job seeker discover employers to track.',
    'Given a resume and target roles, list real organizations that (a) plausibly hire for these roles and',
    '(b) are likely to use the Greenhouse, Ashby, or Lever applicant tracking systems.',
    'For each, provide the ATS board slug — the token in the careers URL',
    '(e.g. "anthropic" for job-boards.greenhouse.io/anthropic, "ramp" for jobs.ashbyhq.com/ramp).',
    'Prefer organizations that actually match the candidate field, even niche ones.',
    `Return ONLY a JSON array (no prose, no code fences) of up to ${MAX_SUGGESTIONS} objects:`,
    '[{"name": string, "ats": "greenhouse"|"ashby"|"lever", "slug": string}]',
  ].join('\n');

  const user = [
    '=== Target roles ===',
    (targetRoles || []).join('\n') || '(none provided)',
    '',
    '=== Resume ===',
    cv || '(no resume provided)',
  ].join('\n');

  const completion = await client.chat.completions.create({
    model: config.azure.openAiDeployment,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.3,
  });

  const content = completion.choices?.[0]?.message?.content?.trim() || '';
  return parseSuggestions(content);
}

function parseSuggestions(content) {
  let text = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end > start) text = text.slice(start, end + 1);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(s => s && typeof s.slug === 'string' && typeof s.name === 'string')
    .slice(0, MAX_SUGGESTIONS)
    .map(s => ({
      name: String(s.name).trim(),
      ats: ATS_PROVIDERS.includes(s.ats) ? s.ats : null,
      slug: String(s.slug).trim().toLowerCase().replace(/^\/+|\/+$/g, ''),
    }))
    .filter(s => s.slug);
}

// Validate a single suggestion: try the guessed ATS first, then the others with
// the same slug. Keep it only if the board returns at least one live posting.
async function validateSuggestion(suggestion) {
  const order = suggestion.ats
    ? [suggestion.ats, ...ATS_PROVIDERS.filter(a => a !== suggestion.ats)]
    : ATS_PROVIDERS;
  for (const ats of order) {
    const entry = entryFromAtsSlug(ats, suggestion.slug, suggestion.name);
    if (!entry) continue;
    const result = await countOpenings(entry);
    if (result.ok && result.count > 0) {
      return { ...entry, ats, openings: result.count };
    }
  }
  return null;
}

async function runLimited(items, limit, worker) {
  const results = [];
  let i = 0;
  async function next() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

// Suggest + validate companies for the candidate. Returns only boards that are
// live right now, so the UI never shows a dead suggestion.
export async function suggestCompanies({ cv, targetRoles }) {
  const raw = await suggestRaw({ cv, targetRoles });
  if (raw.length === 0) return { suggested: 0, validated: [] };
  const validated = (await runLimited(raw, VALIDATION_CONCURRENCY, validateSuggestion))
    .filter(Boolean);
  // De-duplicate by careers_url.
  const seen = new Set();
  const unique = [];
  for (const entry of validated) {
    if (seen.has(entry.careers_url)) continue;
    seen.add(entry.careers_url);
    unique.push(entry);
  }
  unique.sort((a, b) => b.openings - a.openings);
  return { suggested: raw.length, validated: unique };
}

// Validate a list of pasted careers URLs (manual add). Returns added + failed.
export async function validateUrls(urls) {
  const cleaned = (Array.isArray(urls) ? urls : [urls])
    .map(u => String(u || '').trim())
    .filter(Boolean);
  const checked = await runLimited(cleaned, VALIDATION_CONCURRENCY, async (url) => {
    const entry = entryFromUrl(url);
    if (!entry) return { url, ok: false, error: 'Not a Greenhouse, Ashby, or Lever careers URL' };
    const result = await countOpenings(entry);
    if (!result.ok) return { url, ok: false, error: result.error };
    if (result.count === 0) return { url, ok: false, error: 'Board reachable but lists no open roles' };
    const detected = detectAts(entry);
    return { url, ok: true, entry: { ...entry, ats: detected?.ats, openings: result.count } };
  });
  return {
    added: checked.filter(c => c.ok).map(c => c.entry),
    failed: checked.filter(c => !c.ok).map(c => ({ url: c.url, error: c.error })),
  };
}
