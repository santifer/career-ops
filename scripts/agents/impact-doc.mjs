/**
 * scripts/agents/impact-doc.mjs — Sub-agent: generate a tailored impact / first-90-days doc.
 *
 * NEW artifact for the apply-pack-polish pipeline (Mitchell · ALPHA · 2026-05-19).
 *
 * Output:
 *   data/apply-packs/<padded-rowid>-<companySlug>-<roleSlug>/impact-doc.md
 *
 * Produces a 1–2 page "Impact / first-90-days" narrative tying Mitchell's
 * canonical cv.md proof points to a specific bet for the target role.
 * Sections:
 *   - Opening positioning paragraph
 *   - 3 wedges (specific problems Mitchell would attack) — each cited cv.md:N
 *   - First-30, first-60, first-90 commitments — concrete, JD-anchored
 *   - Risk register — 2 risks Mitchell would actively manage
 *
 * LLM: anthropic:claude-sonnet-4-6 (canonical author for prose narrative)
 * Target cost: ~$0.05–0.15 per run
 * Target latency: <90s
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
  join(ROOT, 'modes', '_profile.md'),
  join(ROOT, 'data', 'hm-intel'),
  join(ROOT, 'data', 'voice-reference-brief.md'),
]);

const STAGE = 'impact-doc';
const DEFAULT_MODEL = 'anthropic:claude-sonnet-4-6';

const SYSTEM_PROMPT = `Today is 2026-05-19 PT (verified by orchestrator system clock). You are drafting an impact / first-90-days doc for Mitchell Williams.

Voice constraints (MANDATORY — read voice brief carefully):
- Em-dash linking on 40-50% of long sentences
- Assertive, declarative, no hedging ("I believe / I think / perhaps / it seems" forbidden)
- Core verbs: Architected, Engineered, Built, Shipped, Drove, Designed, Translated. NEVER: Leveraged, Utilized, Spearheaded, Championed.
- Kill list: delve, tapestry, leverage (verb), passionate, exclamation marks, "I'm thrilled / I'm excited / I'd love"
- Canonical metrics only — pull from voice brief. Do NOT invent new numbers.
- Every claim about Mitchell's experience MUST be grounded in cv.md or article-digest.md with a [cv.md:NN] inline citation.

Output STRICT JSON only — no prose, no fences:
{
  "title": "Impact and first-90-days — <Role> at <Company>",
  "opening_paragraph": "3-5 sentences. Frames the bet. Em-dash linking. Cites cv.md.",
  "wedges": [
    { "wedge_title": "...", "problem": "...", "what_mitchell_does": "...", "citation": "cv.md:NN" }
  ],
  "first_30": ["concrete commitment 1 (with metric anchor cited)", "..."],
  "first_60": ["..."],
  "first_90": ["..."],
  "risks": [{ "risk": "...", "mitigation": "..." }],
  "closing_paragraph": "1-2 sentences. No declared closer (no 'excited / ready / looking forward').",
  "warnings": ["any overclaim risks or voice drift the model spots"]
}
- 3 wedges, exactly.
- 3 commitments at each 30/60/90 horizon (9 total).
- 2 risks, exactly.
- Total prose length: 800-1400 words across all sections.
`;

const WedgeSchema = z.object({
  wedge_title: z.string().min(3),
  problem: z.string().min(10),
  what_mitchell_does: z.string().min(10),
  citation: z.string().default(''),
});

const RiskSchema = z.object({
  risk: z.string().min(5),
  mitigation: z.string().min(5),
});

export const ImpactDocResponseSchema = z.object({
  title: z.string().min(5),
  opening_paragraph: z.string().min(50),
  wedges: z.array(WedgeSchema).length(3),
  first_30: z.array(z.string().min(5)).min(2).max(5),
  first_60: z.array(z.string().min(5)).min(2).max(5),
  first_90: z.array(z.string().min(5)).min(2).max(5),
  risks: z.array(RiskSchema).length(2),
  closing_paragraph: z.string().min(20),
  warnings: z.array(z.string()).default([]),
});

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function extractJson(content) {
  const t = String(content || '').trim();
  if (t.startsWith('{')) {
    try { return JSON.parse(t); } catch { /* fall */ }
  }
  const fenced = content.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* fall */ }
  }
  const s = content.indexOf('{');
  const e = content.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(content.slice(s, e + 1)); } catch { /* fall */ } }
  return null;
}

function buildMarkdown(d) {
  const lines = [
    `# ${d.title}`,
    '',
    d.opening_paragraph,
    '',
    '## Three wedges',
    '',
  ];
  for (const w of d.wedges) {
    lines.push(`### ${w.wedge_title}`);
    lines.push('');
    lines.push(`**Problem:** ${w.problem}`);
    lines.push('');
    lines.push(`**What Mitchell does:** ${w.what_mitchell_does}${w.citation ? `  [${w.citation}]` : ''}`);
    lines.push('');
  }
  lines.push('## First-30 / 60 / 90');
  lines.push('');
  lines.push('### First 30');
  for (const c of d.first_30) lines.push(`- ${c}`);
  lines.push('');
  lines.push('### First 60');
  for (const c of d.first_60) lines.push(`- ${c}`);
  lines.push('');
  lines.push('### First 90');
  for (const c of d.first_90) lines.push(`- ${c}`);
  lines.push('');
  lines.push('## Risks & mitigations');
  lines.push('');
  for (const r of d.risks) {
    lines.push(`- **${r.risk}** — ${r.mitigation}`);
  }
  lines.push('');
  lines.push(d.closing_paragraph);
  if (d.warnings && d.warnings.length) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Warnings (author self-flagged)');
    for (const w of d.warnings) lines.push(`- ${w}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * @param {object} input
 * @param {object} input.pack — { jd:{jd_text,company,role,url}, meta:{row_id} }
 * @param {object} [input.config] — { dryRun, model, costCap }
 * @param {object} [input.context] — { hmIntel }
 * @returns {Promise<object>}
 */
export async function runImpactDoc(input) {
  const dryRun = input?.config?.dryRun ?? true;
  if (dryRun) return dryRunSkipped(STAGE);

  const t0 = Date.now();
  const cvPath = join(ROOT, 'cv.md');
  if (!rfs.existsSync(cvPath)) {
    return { stage: STAGE, status: 'error', output: null, diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: 0 }, error: 'cv.md not found' };
  }
  const cvText = rfs.readFileSync(cvPath, 'utf-8').slice(0, 6000);
  const articleDigest = rfs.existsSync(join(ROOT, 'article-digest.md')) ? rfs.readFileSync(join(ROOT, 'article-digest.md'), 'utf-8').slice(0, 2500) : '';
  const voiceBrief = rfs.existsSync(join(ROOT, 'data', 'voice-reference-brief.md')) ? rfs.readFileSync(join(ROOT, 'data', 'voice-reference-brief.md'), 'utf-8').slice(0, 3000) : '';
  const jdText = input?.pack?.jd?.jd_text || input?.pack?.inputs?.jdText || '';
  const company = input?.pack?.jd?.company || input?.pack?.meta?.company || 'Unknown';
  const role = input?.pack?.jd?.role || input?.pack?.meta?.role || 'Unknown';
  const rowId = input?.pack?.meta?.row_id || 0;
  const hmIntel = input?.context?.hmIntel || {};

  const userPrompt = [
    `## Job description`,
    (jdText || '').slice(0, 5000),
    '',
    `## cv.md`,
    cvText,
    '',
    `## article-digest.md (proof points)`,
    articleDigest,
    '',
    `## Voice brief (kill list + canonical metrics)`,
    voiceBrief,
    '',
    `## HM intel`,
    JSON.stringify(hmIntel).slice(0, 3000),
    '',
    `Target: ${company} — ${role}`,
    'Output the impact doc per the schema. Strict JSON only.',
  ].join('\n');

  const modelKey = input?.config?.model || DEFAULT_MODEL;
  let llm = null;
  let tokensUsed = 0;
  let modelUsed = modelKey;
  try {
    const cr = await callCouncil({
      prompt: userPrompt,
      models: [modelKey],
      opts: { systemPrompt: SYSTEM_PROMPT, maxTokens: 3500, timeoutMs: 300_000 },
    });
    const r = cr.results?.[0];
    if (!r || r.error) throw new Error(r?.error || 'no result');
    llm = r;
    tokensUsed = r.tokens || 0;
    modelUsed = r.modelUsed || modelKey;
  } catch (e) {
    return { stage: STAGE, status: 'error', output: null, diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: 0 }, error: `LLM call failed: ${String(e.message || e)}` };
  }

  let parsed = null;
  let parseError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const obj = extractJson(llm.content);
      if (!obj) throw new Error('no JSON found in response');
      parsed = ImpactDocResponseSchema.parse(obj);
      parseError = null;
      break;
    } catch (e) {
      parseError = String(e.message || e);
      if (attempt === 1) {
        // Retry with stricter prompt
        try {
          const strict = userPrompt + '\n\nPREVIOUS RESPONSE DID NOT MATCH SCHEMA. Re-emit STRICT JSON only — no fences, no prose. Exactly 3 wedges, 2 risks, 2-5 commitments per 30/60/90.';
          const retry = await callCouncil({ prompt: strict, models: [modelKey], opts: { systemPrompt: SYSTEM_PROMPT, maxTokens: 3500, timeoutMs: 300_000 } });
          const rr = retry.results?.[0];
          if (rr && !rr.error) { llm = rr; tokensUsed += rr.tokens || 0; }
        } catch { /* fall */ }
      }
    }
  }
  if (!parsed) {
    return { stage: STAGE, status: 'error', output: null, diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: estimateCostUsd(tokensUsed), model_used: modelUsed }, error: `Zod failed: ${parseError}` };
  }

  const padded = String(rowId).padStart(3, '0');
  const outDir = join(ROOT, 'data', 'apply-packs', `${padded}-${slugify(company)}-${slugify(role)}`);
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, 'impact-doc.md');
  writeFileSync(path, buildMarkdown(parsed), 'utf-8');

  return {
    stage: STAGE,
    status: 'ok',
    output: { path: path.replace(ROOT + '/', ''), wedges: parsed.wedges.length, warnings: parsed.warnings || [] },
    diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: estimateCostUsd(tokensUsed), tokens_used: tokensUsed, model_used: modelUsed },
    error: null,
  };
}

function estimateCostUsd(totalTokens) {
  // Rough Sonnet 4.6 pricing — input $3/MTok output $15/MTok with 85/15 split assumed
  return Math.round(((totalTokens * 0.85 / 1_000_000) * 3.0 + (totalTokens * 0.15 / 1_000_000) * 15.0) * 10000) / 10000;
}

/* CLI: node scripts/agents/impact-doc.mjs --row 044 --company Anthropic --role "Communications Lead, Claude Code" --jd-file path/to/jd.md */
async function cliMain() {
  const args = process.argv.slice(2);
  function arg(flag, fallback) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : fallback; }
  const rowId = Number(arg('--row', 0));
  const company = arg('--company', '');
  const role = arg('--role', '');
  const jdFile = arg('--jd-file', '');
  const model = arg('--model', DEFAULT_MODEL);
  let jdText = '';
  if (jdFile) {
    try {
      const { readFileSync } = await import('node:fs');
      jdText = readFileSync(jdFile, 'utf-8');
    } catch (e) {
      console.error(`could not read jd-file: ${e.message}`);
      process.exit(2);
    }
  }
  const out = await runImpactDoc({
    pack: { jd: { jd_text: jdText, company, role }, meta: { row_id: rowId } },
    config: { dryRun: false, model },
    context: {},
  });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.status === 'ok' ? 0 : 1);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  cliMain().catch(err => { console.error(err); process.exit(2); });
}
