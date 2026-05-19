/**
 * scripts/agents/references.mjs — Sub-agent: curate references doc for the apply pack.
 *
 * NEW artifact for apply-pack-polish (Mitchell · ALPHA · 2026-05-19).
 *
 * Output:
 *   data/apply-packs/<padded-rowid>-<companySlug>-<roleSlug>/references.md
 *
 * Curates 3–5 references from Mitchell's cv.md / interview-prep / story-bank.
 * Each reference includes:
 *   - Name (anonymized as "[NAME]" with role + relationship — Mitchell fills in real name on send)
 *   - Why they speak to THIS role specifically (cited cv.md:N)
 *   - 1-sentence sample testimonial they'd plausibly give (anchored in actual work)
 *   - Suggested contact channel (email / LinkedIn / phone)
 *
 * NEVER fabricates real names — uses [NAME-FROM-EX-ROLE] placeholders so Mitchell can fill in.
 *
 * LLM: anthropic:claude-sonnet-4-6
 * Target cost: ~$0.05–0.10 per run
 */

import { mkdirSync, writeFileSync } from 'node:fs';
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
  join(ROOT, 'article-digest.md'),
  join(ROOT, 'interview-prep'),
  join(ROOT, 'data', 'voice-reference-brief.md'),
]);

const STAGE = 'references';
const DEFAULT_MODEL = 'anthropic:claude-sonnet-4-6';

const SYSTEM_PROMPT = `Today is 2026-05-19 PT (orchestrator-verified). You are drafting a references doc for Mitchell Williams's apply pack.

HARD RULE — never fabricate real names. Use placeholders that Mitchell fills in:
  - [NAME] — placeholder for the reference's real name
  - [DIRECT-MANAGER-AT-COMPANY-2023] — descriptive placeholder
  - [TEAM-LEAD-AT-AL-JAZEERA] — descriptive placeholder

Each reference must:
- Be sourced from a real Mitchell work relationship cited in cv.md (point to the role / period in cv.md).
- Speak DIRECTLY to the target role's must-haves.
- Have a plausible testimonial grounded in the actual work shipped (cite cv.md:N).
- Include a suggested contact channel (email / LinkedIn / phone — generic placeholder).

Voice constraints: assertive, em-dash linking, NO declared closers, NO exclamation marks, NO "delve / tapestry / passionate", canonical metrics only (see voice brief).

Output STRICT JSON only — no fences, no prose:
{
  "intro": "1-2 sentences positioning the reference set",
  "references": [
    {
      "name_placeholder": "[NAME]",
      "descriptive_placeholder": "[DIRECT-MANAGER-XGE-CORP-ENG-2023-2025]",
      "relationship": "Direct manager, Cross-Google Eng, 2023-2025",
      "why_this_reference": "1-2 sentences on why this reference matters for THIS role",
      "sample_testimonial": "1-2 sentences they would plausibly give, anchored in cited work",
      "citation": "cv.md:NN",
      "suggested_channel": "email | linkedin | phone"
    }
  ],
  "notes_for_mitchell": ["specific advice on when/how to deploy this set"],
  "warnings": ["any fabrication risks the model spots"]
}
- 3-5 references total.
- Each reference cites a different cv.md line range (covers Mitchell's career breadth).
- Suggested_channel should match how Mitchell typically reaches that person.`;

const ReferenceSchema = z.object({
  name_placeholder: z.string().min(3),
  descriptive_placeholder: z.string().min(3),
  relationship: z.string().min(5),
  why_this_reference: z.string().min(20),
  sample_testimonial: z.string().min(20),
  citation: z.string().default(''),
  suggested_channel: z.enum(['email', 'linkedin', 'phone']).default('email'),
});

export const ReferencesResponseSchema = z.object({
  intro: z.string().min(20),
  references: z.array(ReferenceSchema).min(3).max(5),
  notes_for_mitchell: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function extractJson(content) {
  const t = String(content || '').trim();
  if (t.startsWith('{')) { try { return JSON.parse(t); } catch { /* */ } }
  const f = content.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (f) { try { return JSON.parse(f[1].trim()); } catch { /* */ } }
  const s = content.indexOf('{'); const e = content.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(content.slice(s, e + 1)); } catch { /* */ } }
  return null;
}

function buildMarkdown(d, company, role) {
  const lines = [
    `# References — ${role} at ${company}`,
    '',
    d.intro,
    '',
    `> All names use placeholders. Replace before sending. Mitchell maintains the real-name mapping in his personal records — NEVER write real names into a tracked artifact.`,
    '',
  ];
  for (const r of d.references) {
    lines.push(`## ${r.name_placeholder} — ${r.descriptive_placeholder}`);
    lines.push('');
    lines.push(`**Relationship:** ${r.relationship}`);
    lines.push(`**Channel:** ${r.suggested_channel}`);
    lines.push(`**Citation:** \`${r.citation}\``);
    lines.push('');
    lines.push(`**Why this reference:** ${r.why_this_reference}`);
    lines.push('');
    lines.push(`**Sample testimonial they'd plausibly give:**`);
    lines.push(`> ${r.sample_testimonial}`);
    lines.push('');
  }
  if (d.notes_for_mitchell.length) {
    lines.push('## Notes for Mitchell');
    for (const n of d.notes_for_mitchell) lines.push(`- ${n}`);
    lines.push('');
  }
  if (d.warnings.length) {
    lines.push('## Warnings (author self-flagged)');
    for (const w of d.warnings) lines.push(`- ${w}`);
  }
  return lines.join('\n') + '\n';
}

export async function runReferences(input) {
  const dryRun = input?.config?.dryRun ?? true;
  if (dryRun) return dryRunSkipped(STAGE);

  const t0 = Date.now();
  const cvPath = join(ROOT, 'cv.md');
  if (!rfs.existsSync(cvPath)) return { stage: STAGE, status: 'error', output: null, diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: 0 }, error: 'cv.md not found' };
  const cvText = rfs.readFileSync(cvPath, 'utf-8').slice(0, 6500);
  const voiceBrief = rfs.existsSync(join(ROOT, 'data', 'voice-reference-brief.md')) ? rfs.readFileSync(join(ROOT, 'data', 'voice-reference-brief.md'), 'utf-8').slice(0, 2500) : '';
  const storyBankPath = join(ROOT, 'interview-prep', 'story-bank.md');
  const storyBank = rfs.existsSync(storyBankPath) ? rfs.readFileSync(storyBankPath, 'utf-8').slice(0, 3500) : '';
  const jdText = input?.pack?.jd?.jd_text || '';
  const company = input?.pack?.jd?.company || 'Unknown';
  const role = input?.pack?.jd?.role || 'Unknown';
  const rowId = input?.pack?.meta?.row_id || 0;
  const hmIntel = input?.context?.hmIntel || {};

  const userPrompt = [
    `## Target`,
    `${company} — ${role}`,
    '',
    `## Job description`,
    jdText.slice(0, 4500),
    '',
    `## cv.md`,
    cvText,
    '',
    `## interview-prep/story-bank.md`,
    storyBank,
    '',
    `## HM intel (priorities)`,
    JSON.stringify(hmIntel).slice(0, 2500),
    '',
    `## Voice brief`,
    voiceBrief,
    '',
    'Output the references doc per schema. Strict JSON only.',
  ].join('\n');

  const modelKey = input?.config?.model || DEFAULT_MODEL;
  let llm = null;
  let tokensUsed = 0;
  let modelUsed = modelKey;
  try {
    const cr = await callCouncil({ prompt: userPrompt, models: [modelKey], opts: { systemPrompt: SYSTEM_PROMPT, maxTokens: 3000 } });
    const r = cr.results?.[0];
    if (!r || r.error) throw new Error(r?.error || 'no result');
    llm = r; tokensUsed = r.tokens || 0; modelUsed = r.modelUsed || modelKey;
  } catch (e) {
    return { stage: STAGE, status: 'error', output: null, diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: 0 }, error: String(e.message || e) };
  }

  let parsed = null;
  let parseError = null;
  for (let i = 0; i < 2; i++) {
    try {
      const obj = extractJson(llm.content);
      if (!obj) throw new Error('no JSON');
      parsed = ReferencesResponseSchema.parse(obj);
      parseError = null; break;
    } catch (e) {
      parseError = String(e.message || e);
      if (i === 0) {
        try {
          const retry = await callCouncil({ prompt: userPrompt + '\n\nPREVIOUS RESPONSE FAILED SCHEMA. Re-emit STRICT JSON only, 3-5 references with all required fields.', models: [modelKey], opts: { systemPrompt: SYSTEM_PROMPT, maxTokens: 3000 } });
          const rr = retry.results?.[0];
          if (rr && !rr.error) { llm = rr; tokensUsed += rr.tokens || 0; }
        } catch { /* */ }
      }
    }
  }
  if (!parsed) return { stage: STAGE, status: 'error', output: null, diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: estimateCostUsd(tokensUsed), model_used: modelUsed }, error: `Zod: ${parseError}` };

  const padded = String(rowId).padStart(3, '0');
  const outDir = join(ROOT, 'data', 'apply-packs', `${padded}-${slugify(company)}-${slugify(role)}`);
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, 'references.md');
  writeFileSync(path, buildMarkdown(parsed, company, role), 'utf-8');

  return {
    stage: STAGE, status: 'ok',
    output: { path: path.replace(ROOT + '/', ''), references: parsed.references.length, warnings: parsed.warnings },
    diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: estimateCostUsd(tokensUsed), tokens_used: tokensUsed, model_used: modelUsed },
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
  const jdFile = arg('--jd-file', '');
  const model = arg('--model', DEFAULT_MODEL);
  let jdText = '';
  if (jdFile) {
    try { const { readFileSync } = await import('node:fs'); jdText = readFileSync(jdFile, 'utf-8'); } catch (e) { console.error(`jd-file: ${e.message}`); process.exit(2); }
  }
  const out = await runReferences({ pack: { jd: { jd_text: jdText, company, role }, meta: { row_id: rowId } }, config: { dryRun: false, model }, context: {} });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.status === 'ok' ? 0 : 1);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) cliMain().catch(err => { console.error(err); process.exit(2); });
