/**
 * scripts/agents/referrals.mjs — Sub-agent: generate a warm-path referrals kit.
 *
 * NEW artifact for apply-pack-polish (Mitchell · ALPHA · 2026-05-19).
 *
 * Output:
 *   data/apply-packs/<padded-rowid>-<companySlug>-<roleSlug>/referrals.md
 *
 * Surfaces 2nd-degree warm paths to the target company from
 * data/linkedin/2nd-degree/<company>.json (when present) and the
 * `_warm-intros.json` mutual-aggregator, plus drafts a single template
 * "ask" message Mitchell can personalize and send.
 *
 * NEVER sends. NEVER stages contacts as decisions. Output is a READING
 * DOC plus a TEMPLATE — Mitchell picks who to reach out to.
 *
 * Anti-hallucination rule: warm paths only fire when there's a real path
 * trace in 2nd-degree JSON. If no paths exist, the doc surfaces a cold-
 * outreach template instead, clearly labeled.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { callCouncil } from '../../lib/council.mjs';
import { createReadonlyFS } from '../../lib/readonly-fs.mjs';
import { dryRunSkipped } from './types.mjs';

try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });
} catch { /* dotenv optional */ }

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const rfs = createReadonlyFS([
  join(ROOT, 'cv.md'),
  join(ROOT, 'modes', '_profile.md'),
  join(ROOT, 'data', 'voice-reference-brief.md'),
]);

const STAGE = 'referrals';
const DEFAULT_MODEL = 'anthropic:claude-sonnet-4-6';

const SYSTEM_PROMPT = `Today is 2026-05-19 PT. You are drafting a warm-path referrals kit for Mitchell Williams. Output is for Mitchell to read — he picks who to message and personalizes the template before sending.

HARD RULES:
- Never invent warm paths. Only use the warm-paths provided in the user prompt (which come from data/linkedin/2nd-degree/<company>.json).
- Use connection names verbatim when provided. Do not anonymize unless the input is missing names.
- If no warm paths exist, generate a cold-outreach template instead, explicitly labeled "Cold outreach (no warm path found)".

Voice constraints: assertive, em-dash linking, no declared closers, no exclamation marks, no "delve / tapestry / passionate". Canonical metrics only.

The draft message MUST:
- Be ≤120 words
- Open with the relationship anchor (e.g., "We worked together at AJ+ in 2018-2020 — ...")
- State the specific role + company + URL Mitchell is targeting
- Cite ONE proof point from cv.md (e.g., the comms triage agent, 99% RAG fidelity, AJ+ viral campaign)
- Make a specific, low-friction ask ("a 15-min coffee" / "intro to {{HM_NAME}}" / "your read on whether I'd be a fit")
- End without a declared closer ("excited" / "looking forward" / "would love")

Output STRICT JSON only:
{
  "intro": "1-2 sentences on the warm-path landscape for this target",
  "warm_paths": [
    {
      "contact_name": "exact name from warm-paths data",
      "contact_role_at_company": "role they hold at the target company",
      "connection_anchor": "the shared history with Mitchell — what JD lib gave you",
      "evidence_strength": "high | medium | low",
      "draft_message": "the personalized ask, ≤120 words",
      "send_channel": "linkedin | email"
    }
  ],
  "cold_outreach_fallback": "draft if no warm paths exist — labeled clearly, ≤140 words, anchored in cv.md proof point and HM intel",
  "notes_for_mitchell": ["specific advice — who to message first, what tone to take, etc."],
  "warnings": ["any concerns the model spots"]
}
- 1-5 warm paths (use as many as the warm-paths data supports).
- cold_outreach_fallback only renders in the markdown when warm_paths is empty.`;

const WarmPathSchema = z.object({
  contact_name: z.string().min(2),
  contact_role_at_company: z.string().min(3),
  connection_anchor: z.string().min(10),
  evidence_strength: z.enum(['high', 'medium', 'low']).default('medium'),
  draft_message: z.string().min(40),
  send_channel: z.enum(['linkedin', 'email']).default('linkedin'),
});

export const ReferralsResponseSchema = z.object({
  intro: z.string().min(10),
  warm_paths: z.array(WarmPathSchema).max(5).default([]),
  cold_outreach_fallback: z.string().default(''),
  notes_for_mitchell: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function extractJson(c) {
  const t = String(c || '').trim();
  if (t.startsWith('{')) { try { return JSON.parse(t); } catch { /* */ } }
  const f = c.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (f) { try { return JSON.parse(f[1].trim()); } catch { /* */ } }
  const s = c.indexOf('{'); const e = c.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(c.slice(s, e + 1)); } catch { /* */ } }
  return null;
}

function readJsonSafe(p) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null; } catch { return null; }
}

function loadWarmPaths(companySlug) {
  // data/linkedin/2nd-degree/<companySlug>.json
  const path = join(ROOT, 'data', 'linkedin', '2nd-degree', `${companySlug}.json`);
  const doc = readJsonSafe(path);
  if (!doc) return [];
  // Shape varies — try common keys
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc.paths)) return doc.paths;
  if (Array.isArray(doc.connections)) return doc.connections;
  if (Array.isArray(doc.people)) return doc.people;
  return [];
}

function buildMarkdown(d, company, role) {
  const lines = [
    `# Referrals & warm-path outreach — ${role} at ${company}`,
    '',
    d.intro,
    '',
    `> Mitchell — verify each name before messaging. Personalize the draft before sending. Templates only; never auto-send.`,
    '',
  ];
  if (d.warm_paths.length) {
    lines.push('## Warm paths');
    lines.push('');
    for (const w of d.warm_paths) {
      lines.push(`### ${w.contact_name} — ${w.contact_role_at_company}`);
      lines.push('');
      lines.push(`**Anchor:** ${w.connection_anchor}`);
      lines.push(`**Evidence strength:** ${w.evidence_strength}`);
      lines.push(`**Send channel:** ${w.send_channel}`);
      lines.push('');
      lines.push(`**Draft message:**`);
      lines.push('');
      lines.push('```');
      lines.push(w.draft_message);
      lines.push('```');
      lines.push('');
    }
  } else {
    lines.push('## Cold outreach (no warm path found)');
    lines.push('');
    lines.push('```');
    lines.push(d.cold_outreach_fallback || '(no fallback drafted)');
    lines.push('```');
    lines.push('');
  }
  if (d.notes_for_mitchell.length) {
    lines.push('## Notes');
    for (const n of d.notes_for_mitchell) lines.push(`- ${n}`);
    lines.push('');
  }
  if (d.warnings.length) {
    lines.push('## Warnings');
    for (const w of d.warnings) lines.push(`- ${w}`);
  }
  return lines.join('\n') + '\n';
}

export async function runReferrals(input) {
  const dryRun = input?.config?.dryRun ?? true;
  if (dryRun) return dryRunSkipped(STAGE);

  const t0 = Date.now();
  const cvText = rfs.existsSync(join(ROOT, 'cv.md')) ? rfs.readFileSync(join(ROOT, 'cv.md'), 'utf-8').slice(0, 5500) : '';
  const voiceBrief = rfs.existsSync(join(ROOT, 'data', 'voice-reference-brief.md')) ? rfs.readFileSync(join(ROOT, 'data', 'voice-reference-brief.md'), 'utf-8').slice(0, 2500) : '';
  const company = input?.pack?.jd?.company || 'Unknown';
  const role = input?.pack?.jd?.role || 'Unknown';
  const url = input?.pack?.jd?.url || '';
  const rowId = input?.pack?.meta?.row_id || 0;
  const hmIntel = input?.context?.hmIntel || {};
  const warmPaths = loadWarmPaths(slugify(company));

  const userPrompt = [
    `## Target`,
    `${company} — ${role}`,
    url ? `URL: ${url}` : '',
    '',
    `## Warm paths (from data/linkedin/2nd-degree/${slugify(company)}.json — use these names verbatim)`,
    JSON.stringify(warmPaths, null, 2).slice(0, 4500),
    '',
    `## cv.md`,
    cvText,
    '',
    `## HM intel (priorities + key recruiters)`,
    JSON.stringify(hmIntel).slice(0, 2500),
    '',
    `## Voice brief`,
    voiceBrief,
    '',
    `Output referrals doc per schema. Strict JSON only.`,
    `If warm_paths array above is empty, return empty warm_paths and a non-empty cold_outreach_fallback.`,
  ].join('\n');

  const modelKey = input?.config?.model || DEFAULT_MODEL;
  let llm = null;
  let tokens = 0;
  let modelUsed = modelKey;
  try {
    const cr = await callCouncil({ prompt: userPrompt, models: [modelKey], opts: { systemPrompt: SYSTEM_PROMPT, maxTokens: 3000 } });
    const r = cr.results?.[0];
    if (!r || r.error) throw new Error(r?.error || 'no result');
    llm = r; tokens = r.tokens || 0; modelUsed = r.modelUsed || modelKey;
  } catch (e) {
    return { stage: STAGE, status: 'error', output: null, diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: 0 }, error: String(e.message || e) };
  }

  let parsed = null;
  let parseError = null;
  for (let i = 0; i < 2; i++) {
    try {
      const obj = extractJson(llm.content);
      if (!obj) throw new Error('no JSON');
      parsed = ReferralsResponseSchema.parse(obj);
      parseError = null; break;
    } catch (e) {
      parseError = String(e.message || e);
      if (i === 0) {
        try {
          const retry = await callCouncil({ prompt: userPrompt + '\n\nPREVIOUS RESPONSE FAILED SCHEMA. Re-emit STRICT JSON only matching the spec.', models: [modelKey], opts: { systemPrompt: SYSTEM_PROMPT, maxTokens: 3000 } });
          const rr = retry.results?.[0];
          if (rr && !rr.error) { llm = rr; tokens += rr.tokens || 0; }
        } catch { /* */ }
      }
    }
  }
  if (!parsed) return { stage: STAGE, status: 'error', output: null, diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: estimateCostUsd(tokens), model_used: modelUsed }, error: `Zod: ${parseError}` };

  const padded = String(rowId).padStart(3, '0');
  const outDir = join(ROOT, 'data', 'apply-packs', `${padded}-${slugify(company)}-${slugify(role)}`);
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, 'referrals.md');
  writeFileSync(path, buildMarkdown(parsed, company, role), 'utf-8');

  return {
    stage: STAGE, status: 'ok',
    output: { path: path.replace(ROOT + '/', ''), warm_paths: parsed.warm_paths.length, warnings: parsed.warnings },
    diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: estimateCostUsd(tokens), tokens_used: tokens, model_used: modelUsed, warm_paths_input: warmPaths.length },
    error: null,
  };
}

function estimateCostUsd(t) { return Math.round((((t * 0.85) / 1e6) * 3 + ((t * 0.15) / 1e6) * 15) * 10000) / 10000; }

async function cliMain() {
  const args = process.argv.slice(2);
  function arg(f, fb) { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : fb; }
  const rowId = Number(arg('--row', 0));
  const company = arg('--company', '');
  const role = arg('--role', '');
  const url = arg('--url', '');
  const model = arg('--model', DEFAULT_MODEL);
  const out = await runReferrals({ pack: { jd: { company, role, url }, meta: { row_id: rowId } }, config: { dryRun: false, model }, context: {} });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.status === 'ok' ? 0 : 1);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) cliMain().catch(err => { console.error(err); process.exit(2); });
