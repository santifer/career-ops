/**
 * lib/eval-council.mjs — Multi-LLM full A-G evaluation with consensus reducer.
 *
 * Replaces single-model batch-runner.sh + claude -p path. For each survivor:
 *   1. Fans out the SAME prompt + intel pack to N providers in parallel
 *   2. Each emits a structured eval (score, archetype, A-F blocks, decision)
 *   3. Consensus reducer computes mean/median + flags dissent
 *   4. Returns final report ready for tracker write
 *
 * Default council = Sonnet (primary) + Opus (high-stakes) + Gemini (blind).
 * Override with --providers flag. Cost ~$0.10–0.20/survivor depending on
 * intel pack size and reasoning depth.
 *
 * The consensus reducer:
 *   - If ALL 3 scores within 0.4 of mean: HIGH confidence, use mean
 *   - If 2 of 3 within 0.4: MEDIUM confidence, use mean of agreeing pair
 *   - Else: LOW confidence (LOW_CONSENSUS flag), human review required
 *
 * Usage:
 *   import { runCouncil } from './lib/eval-council.mjs';
 *   const result = await runCouncil({ intelPack });
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { withRetryBackoff, isCircuitOpen } from './provider-client.mjs';

// dotenv loaded by parent (gatherIntel already does it); also load defensively.
try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env'), override: true });
} catch { /* dotenv optional */ }

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Provider configs ──────────────────────────────────────────────────────
const SONNET_MODEL = process.env.SONNET_MODEL || 'claude-sonnet-4-6';
const OPUS_MODEL   = process.env.OPUS_MODEL   || 'claude-opus-4-7';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Rough cost estimates (per call) — used to log spend.
const COST_ESTIMATE = {
  sonnet:    0.06,   // Sonnet w/ ~5K input + 1.5K output
  opus:      0.18,   // Opus 4.7 max-effort w/ same shape (3x sonnet)
  gemini:    0.02,   // Gemini 2.5 Flash
};

// ── Prompt builder ────────────────────────────────────────────────────────
// Reads the shared system context (modes/_shared.md + modes/_profile.md +
// cv.md) and assembles the prompt with the intel pack injected.
function buildEvalPrompt(intelPack) {
  const cv = existsSync(join(ROOT, 'cv.md')) ? readFileSync(join(ROOT, 'cv.md'), 'utf-8') : '';
  const sharedMode = existsSync(join(ROOT, 'modes/_shared.md')) ? readFileSync(join(ROOT, 'modes/_shared.md'), 'utf-8') : '';
  const profileMode = existsSync(join(ROOT, 'modes/_profile.md')) ? readFileSync(join(ROOT, 'modes/_profile.md'), 'utf-8') : '';
  const ofertaMode = existsSync(join(ROOT, 'modes/oferta.md')) ? readFileSync(join(ROOT, 'modes/oferta.md'), 'utf-8') : '';

  // Compress intel pack into a focused brief for the prompt.
  const intelBrief = `## CURRENT INTEL (gathered ${intelPack.fetched_at})

**Company:** ${intelPack.company}
**Role:** ${intelPack.role}
**URL:** ${intelPack.url}

### JD (verified live=${intelPack.jd.alive}, ${intelPack.jd.text.length} chars)
\`\`\`
${intelPack.jd.text.slice(0, 8000)}
\`\`\`

### Grok current intel (90-day window)
${intelPack.grok.text || '(no Grok intel available)'}

### Comp signal
${intelPack.comp.reconciled_estimate}

### Outcome priors at ${intelPack.company}
- Prior evals in tracker: ${intelPack.priors.count}
- By status: ${JSON.stringify(intelPack.priors.by_status)}
- Recent 3 outcomes:
${intelPack.priors.recent_outcomes.slice(0, 3).map(r => `  - #${r.num} (${r.date}) ${r.role.slice(0,40)} → ${r.status} (${r.score})`).join('\n')}

### Proof points found in cv.md
${intelPack.proof_points.cv_md_lines.slice(0, 8).map(p => `  cv.md:${p.line} [${p.keywords.slice(0,3).join(', ')}] — ${p.text.slice(0,160)}`).join('\n')}

### Proof points found in article-digest.md
${intelPack.proof_points.article_digest_lines.slice(0, 5).map(p => `  article-digest.md:${p.line} [${p.keywords.slice(0,3).join(', ')}] — ${p.text.slice(0,160)}`).join('\n')}

### LinkedIn network at ${intelPack.company}
- 1st-degree: ${intelPack.network.first_degree}
- 2nd-degree: ${intelPack.network.second_degree}
${(intelPack.network.warm_intro_paths || []).slice(0, 3).map(p => `  - ${p.target_name} (${p.position}) — ${p.mutual_count} mutuals`).join('\n')}

### Issues flagged
${intelPack.issues.length ? intelPack.issues.map(i => `  - ${i}`).join('\n') : '  (none)'}

---

## Mitchell's CV (canonical)
${cv.slice(0, 6000)}

---

## Evaluation framework

${(ofertaMode || sharedMode).slice(0, 14000)}

---

## OUTPUT FORMAT (strict — machine parsed)

**CRITICAL — Mandatory two-stage evaluation:**

**STAGE 1 — Block H Hard-Skip Gates (run FIRST, BEFORE any scoring).** The framework above contains Block H with 12 explicit hard-skip rules (H1–H12) derived from the 2026-05-16 false-positive audit. Evaluate every gate against this role's JD + Mitchell's CV. If ANY gate fires, the composite score is capped per the override rules at the bottom of Block H — do NOT let strong North Star Alignment or Company Reputation compensate.

**STAGE 2 — Scoring (1.0–5.0 scale only).** The score scale is 1.0–5.0. NO HIGHER. Scores above 5.0 are INVALID and will be rejected by the parser.
- 5.0 = perfect-fit, apply immediately, target match on every dimension AND zero hard gates fired
- 4.0 = strong fit, worth applying, minor gaps that are addressable, zero hard gates
- 3.5 = borderline (DEFER), one hard gate fired with mitigation path
- 3.0 = weak fit (SKIP), one hard gate fired without mitigation
- 2.0–2.5 = wrong-shape role (SKIP), 2+ hard gates
- 1.0 = entirely wrong archetype

If your honest assessment is "this is amazing," cap at 5.0. If you find yourself wanting to write 7+ or 8+, the parser will REJECT your response and you will be re-prompted. Do not produce out-of-range scores.

**Output structure — the FIRST 4 lines MUST be exactly:**

\`\`\`
SCORE: X.X
ARCHETYPE: A1 | A2 | B | NO
DECISION: APPLY | DEFER | SKIP
GATES: [H1, H3, ...] fired | none fired
\`\`\`

Where:
- X.X is a decimal between 1.0 and 5.0 (e.g., 4.3, not 7.8)
- GATES line lists every hard-skip gate triggered with one-line reason, OR "none fired" if all pass

**Decision rules:**
- APPLY → score ≥ 4.0 AND zero hard gates fired
- DEFER → score 3.5–3.9 OR one gate fired with mitigation path
- SKIP → score < 3.5 OR 2+ gates fired OR any single uncurable gate (H2 classical ML, H5 location anchor, H11 policy vertical)

Then the structured report. **Required sections (audit-enforced 2026-05-17 — missing sections produce 'minor gaps' verdict in scripts/audit-all-evaluations.mjs):**

**## Bloque A — Resumen del Rol**
Compact role summary table with ALL of:
- Arquetipo detectado, Domain, Function, Seniority, Remote, Team size, TL;DR
- **MANDATORY: \`Listed comp\` row** — exact value if JD discloses (\`$185K–$230K\`), or \`Undisclosed — estimated $X-$Y (basis: Levels.fyi / Blind / Series-stage typical)\` if not. Never omit this row. Even "Undisclosed — no estimate possible" is acceptable, but the row must exist.
- Gate rationale (H1–H12 explicit per-gate verdicts even if all pass).

**## Bloque B — Match con CV**
- Requirements → CV Mapping (table with file:line citations)
- Gaps Analysis
- **MANDATORY: \`Compensation reconciliation\` sub-section** — if Bloque A's \`Listed comp\` was \`Undisclosed\`, this sub-section must produce a numeric range with explicit basis. The audit script (scripts/audit-all-evaluations.mjs) checks BOTH Bloque A AND Bloque B for a \$NNK pattern; one of them must satisfy.
- Prior outcomes adjustment (citing \`[priors:#NNNN]\` references).

**## Block H — Citation audit**
- **MANDATORY.** List every citation used in the report as \`[source:line]\` with the claim it supports. End with a \`Citations cited: N\` line. Mark any unsupported claims as \`[UNSUPPORTED]\` so the parser can flag for retry.

**## Block I — Council dissent**
- **MANDATORY.** When run in a single-model context (this evaluation), state \`(single-model run — no dissent applicable)\`. When the consensus reducer detects disagreement with sibling models, this is where the dissent notes land.

**## Block J — Intel pack summary**
- **MANDATORY.** 3–5 line bullet recap of what the intel pack contributed to the score (Grok signals, prior outcomes, network density). Lets a reader audit what the model leaned on.

**Citation requirement:** Every factual claim about Mitchell's experience MUST cite a source span like \`[cv.md:L42]\` or \`[article-digest.md:L8]\` or \`[priors:#1509]\`. Do NOT make claims you can't cite. The framework's H8 rule explicitly bans the unverified "RAG pipeline" framing — call it "context-engineering pipeline" instead.

Use the intel above. The Grok block and outcome priors should materially affect your score — a company with 10 prior Discarded evals at this archetype should be scored down vs. one with 0 prior evals.`;

  return intelBrief;
}

// ── Parser: extract + VALIDATE SCORE/ARCHETYPE/DECISION ──────────────────
// Permissive on format variants, STRICT on score range. The 2026-05-16 batch
// revealed that Sonnet sometimes emits scores like 7.8 or 7.2 — out-of-scale
// values that previously got accepted and clamped, hiding the underlying
// prompt-interpretation bug. Parser now REJECTS scores outside [1.0, 5.0]
// (returns parseError) so the caller can retry with explicit feedback.
//
// Returns:
//   { score, archetype, decision }  on success
//   { parseError: '...', rawScore? } on failure (caller may retry)
//   null                              on totally unparseable text
function parseEvalHead(text) {
  if (!text) return null;

  // Score: capture any 1-or-2 digit "score" float anywhere in the text
  const scoreMatch =
    text.match(/(?:^|[\s\*\n])score[\s:*]+(\d{1,2}\.\d)\b/im) ||
    text.match(/(\d{1,2}\.\d)\s*\/\s*5(?!\d)/);
  const archMatch =
    text.match(/(?:archetype|arquetipo)[\s:*]+(?:`)?(A1|A2[abc]?|B|NO|NONE)/i);
  const decMatch =
    text.match(/(?:decision|decisión|recomendaci[óo]n)[\s:*]+(?:`)?(APPLY|DEFER|SKIP|HOLD)/i) ||
    text.match(/\b(APPLY HIGH|APPLY|DEFER|SKIP)\b/i);

  if (!scoreMatch || !archMatch || !decMatch) return null;

  const rawScore = parseFloat(scoreMatch[1]);

  // VALIDATION GATE — out-of-range scores are a model bug, NOT a clamp target.
  // Caller (runCouncil) treats parseError as a retry trigger with explicit
  // feedback in the retry prompt: "Your last response had SCORE: X.X. Scores
  // above 5.0 are invalid. Re-answer with SCORE between 1.0 and 5.0."
  if (isNaN(rawScore) || rawScore < 1.0 || rawScore > 5.0) {
    return { parseError: `score ${rawScore} out of range [1.0, 5.0]`, rawScore };
  }

  let arch = archMatch[1].toUpperCase();
  arch = /^A1/.test(arch) ? 'A1' : /^A2/.test(arch) ? 'A2' : /^B/.test(arch) ? 'B' : 'NO';
  let dec = decMatch[1].toUpperCase().replace(/\s+/g, ' ');
  if (/APPLY/i.test(dec)) dec = 'APPLY';
  else if (/HOLD|DEFER/i.test(dec)) dec = 'DEFER';
  else dec = 'SKIP';
  return { score: rawScore, archetype: arch, decision: dec };
}

// Save unparseable text to disk for later inspection — autonomous-friendly
// debug aid. Each failing response gets a unique filename keyed by provider
// and timestamp.
function dumpUnparseable(provider, text) {
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = '/tmp/council-debug';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const fname = path.join(dir, `${provider}-${Date.now()}.txt`);
    fs.writeFileSync(fname, text);
    return fname;
  } catch { return null; }
}

// ── Provider callers ──────────────────────────────────────────────────────

async function callAnthropic({ model, prompt, maxTokens = 2000, prefill = null, retryNote = null }) {
  if (!process.env.ANTHROPIC_API_KEY) return { skipped: 'ANTHROPIC_API_KEY not set' };
  if (isCircuitOpen('anthropic')) return { skipped: 'anthropic circuit open' };
  return withRetryBackoff(async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 120_000);
    try {
      // temperature is deprecated for Opus 4.7 — only include it for Sonnet/Haiku.
      const messages = [{ role: 'user', content: retryNote ? `${retryNote}\n\n${prompt}` : prompt }];
      // Prefill: forces continuation from a fixed scaffold. Used for retry to
      // force the model to start its response with "SCORE: " — eliminates
      // the "model wrote a preamble" failure mode.
      if (prefill) messages.push({ role: 'assistant', content: prefill });
      const body = { model, max_tokens: maxTokens, messages };
      if (!/opus-4-7/.test(model)) body.temperature = 0;
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'x-api-key':         process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`anthropic ${model} HTTP ${res.status}: ${errBody.slice(0, 120)}`);
      }
      const data = await res.json();
      let text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
      // When prefill is used, the model's response continues FROM the prefill;
      // prepend so downstream parsing finds the SCORE: line.
      if (prefill) text = prefill + text;
      return { text, usage: data.usage };
    } finally { clearTimeout(t); }
  }, 'anthropic');
}

async function callGemini({ prompt, maxTokens = 4000 }) {
  if (!process.env.GEMINI_API_KEY) return { skipped: 'GEMINI_API_KEY not set' };
  if (isCircuitOpen('gemini')) return { skipped: 'gemini circuit open' };
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = client.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: 0,
      maxOutputTokens: maxTokens,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  return withRetryBackoff(async () => {
    const res = await model.generateContent([{ text: prompt }]);
    return { text: res.response.text(), usage: res.response.usageMetadata };
  }, 'gemini');
}

// ── Consensus reducer ─────────────────────────────────────────────────────
// Inputs: array of provider results, each with { provider, head: {score, archetype, decision}, text, usage }
// Output: { final_score, confidence, agreement, dissent_flag, primary_text }
function computeConsensus(results) {
  const valid = results.filter(r => r.head && typeof r.head.score === 'number');
  if (valid.length === 0) {
    return { final_score: null, confidence: 0, agreement: '0/0', dissent_flag: true, error: 'no valid provider results' };
  }

  const scores = valid.map(r => r.head.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

  // How many providers are within 0.4 of mean?
  const within = valid.filter(r => Math.abs(r.head.score - mean) <= 0.4);
  const agreement = `${within.length}/${valid.length}`;
  let confidence;
  if (valid.length >= 3 && within.length === valid.length) confidence = 'HIGH';
  else if (valid.length >= 2 && within.length >= 2)        confidence = 'MEDIUM';
  else                                                      confidence = 'LOW';

  // Decision: majority vote across providers
  const decisionCounts = {};
  for (const r of valid) decisionCounts[r.head.decision] = (decisionCounts[r.head.decision] || 0) + 1;
  const finalDecision = Object.entries(decisionCounts).sort((a, b) => b[1] - a[1])[0][0];

  // Archetype: majority vote
  const archCounts = {};
  for (const r of valid) archCounts[r.head.archetype] = (archCounts[r.head.archetype] || 0) + 1;
  const finalArchetype = Object.entries(archCounts).sort((a, b) => b[1] - a[1])[0][0];

  // Score: use within-tolerance mean if MEDIUM/HIGH; full mean if LOW
  const finalScore = confidence === 'LOW'
    ? Number(mean.toFixed(2))
    : Number((within.reduce((a, b) => a + b.head.score, 0) / within.length).toFixed(2));

  // Primary text: prefer Sonnet, then Opus, then Gemini (in that order of trust for narrative quality)
  const primary = valid.find(r => r.provider === 'sonnet')
                || valid.find(r => r.provider === 'opus')
                || valid.find(r => r.provider === 'gemini')
                || valid[0];

  return {
    final_score:     finalScore,
    final_archetype: finalArchetype,
    final_decision:  finalDecision,
    confidence,
    agreement,
    dissent_flag:    confidence === 'LOW',
    score_spread:    Math.max(...scores) - Math.min(...scores),
    per_provider:    valid.map(r => ({ provider: r.provider, score: r.head.score, archetype: r.head.archetype, decision: r.head.decision })),
    primary_text:    primary.text,
    primary_source:  primary.provider,
  };
}

// ── Orchestrator ──────────────────────────────────────────────────────────
/**
 * runCouncil — fan out to all 3 providers, compute consensus, return result.
 * @param {object} opts
 * @param {object} opts.intelPack         — output of gatherIntel()
 * @param {string[]} [opts.providers]     — subset of ['sonnet','opus','gemini']
 * @returns {Promise<object>}              — consensus + per-provider details
 */
export async function runCouncil({ intelPack, providers = ['sonnet', 'opus', 'gemini'] }) {
  const prompt = buildEvalPrompt(intelPack);
  const startedAt = Date.now();

  const calls = providers.map(p => {
    if (p === 'sonnet')   return callAnthropic({ model: SONNET_MODEL, prompt }).then(r => ({ provider: 'sonnet', ...r }));
    if (p === 'opus')     return callAnthropic({ model: OPUS_MODEL, prompt }).then(r => ({ provider: 'opus', ...r }));
    if (p === 'gemini')   return callGemini({ prompt }).then(r => ({ provider: 'gemini', ...r }));
    return Promise.resolve({ provider: p, skipped: 'unknown provider' });
  });

  const settled = await Promise.allSettled(calls);
  const results = settled.map(s => s.status === 'fulfilled' ? s.value : { error: s.reason?.message || 'rejected' });

  // Parse the head of each text response. If a provider returned an
  // out-of-range score (rawScore > 5.0 or < 1.0), retry up to 2x with an
  // explicit error message + prefill — same retry pattern as the triage
  // parser, but applied to score-validation specifically.
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.text) continue;
    let parsed = parseEvalHead(r.text);

    // Retry path: out-of-range score → re-call with explicit feedback.
    // Only retry Anthropic providers (Gemini's bug surface is different).
    if (parsed && parsed.parseError && parsed.rawScore !== undefined && (r.provider === 'sonnet' || r.provider === 'opus')) {
      const model = r.provider === 'sonnet' ? SONNET_MODEL : OPUS_MODEL;
      let attempt = 0;
      while (parsed.parseError && attempt < 2) {
        attempt++;
        const retryNote = `⚠ Your previous response had SCORE: ${parsed.rawScore}. Scores ABOVE 5.0 are INVALID — the scale is 1.0–5.0 only. Re-evaluate and emit a corrected SCORE between 1.0 and 5.0. If your true assessment is "exceeds all dimensions," cap at 5.0. Do not exceed 5.0.`;
        try {
          const retry = await callAnthropic({ model, prompt: buildEvalPrompt(intelPack), maxTokens: 2000, retryNote, prefill: 'SCORE: ' });
          if (retry.text) {
            r.text = retry.text;  // overwrite with corrected response
            r.usage = retry.usage;
            parsed = parseEvalHead(retry.text);
          } else if (retry.skipped) {
            break;
          }
        } catch (err) {
          r.error = `retry failed: ${err.message}`;
          break;
        }
      }
    }

    if (parsed && parsed.parseError) {
      r.parse_error = parsed.parseError + ` (after ${(r.text || '').length} chars)`;
      r.head = null;
    } else if (parsed && parsed.score) {
      r.head = parsed;
    } else {
      r.parse_error = 'could not extract SCORE/ARCHETYPE/DECISION from response';
      r.head = null;
    }
  }

  const consensus = computeConsensus(results);

  return {
    company:    intelPack.company,
    role:       intelPack.role,
    url:        intelPack.url,
    elapsed_ms: Date.now() - startedAt,
    consensus,
    per_provider_full: results.map(r => ({
      provider:    r.provider,
      skipped:     r.skipped,
      error:       r.error || r.parse_error,
      head:        r.head,
      text_length: r.text?.length || 0,
      usage:       r.usage,
      cost_est:    r.provider ? COST_ESTIMATE[r.provider] : 0,
    })),
    total_cost_est: results.reduce((sum, r) => sum + (r.provider && !r.skipped && !r.error ? COST_ESTIMATE[r.provider] : 0), 0),
  };
}

// CLI smoke: requires a pre-built intel pack JSON
// node lib/eval-council.mjs path/to/intel.json
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , intelPath] = process.argv;
  if (!intelPath) {
    console.error('Usage: node lib/eval-council.mjs <intel-pack.json>');
    process.exit(1);
  }
  const intelPack = JSON.parse(readFileSync(intelPath, 'utf-8'));
  const result = await runCouncil({ intelPack });
  console.log(JSON.stringify(result, null, 2));
}
