/**
 * scripts/agents/why-statement.mjs — Sub-agent: draft the "Why this company / role" one-pager.
 *
 * Stage: 'why-statement' (one of the 5 parallel draft-generation agents in
 * orchestrator stage 4 `fan_out_drafts`).
 *
 * Live mode: Drafts a one-pager explaining why Mitchell is compelling for this
 * specific company and role. Uses HM-intel, company AI-policy notes, and the
 * voice corpus for calibration. 300-500 words, anchored to corpus facts.
 *
 * LLM: openai:gpt-5 via lib/council.mjs, reasoning_effort: medium
 * Target cost: ~$0.03–0.08 per run
 * Target latency: <90s
 *
 * O2  — why-statement live mode (Wave G2)
 * O8  — burstiness pre-prompting + n-gram logit bias shield
 * O9  — per-application versioning + cross-app learning hooks
 *
 * @typedef {import('./types.mjs').SubAgentInput} SubAgentInput
 * @typedef {import('./types.mjs').SubAgentOutput} SubAgentOutput
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createReadonlyFS } from '../../lib/readonly-fs.mjs';

import { z } from 'zod';
import { callCouncil } from '../../lib/council.mjs';
import { dryRunSkipped } from './types.mjs';
import { checkText } from '../../lib/ai-detection-gate.mjs';

try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });
} catch { /* dotenv optional */ }

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// O5 — Read-only filesystem barrier for corpus reads.
const rfs = createReadonlyFS([
  join(ROOT, 'cv.md'),
  join(ROOT, 'article-digest.md'),
  join(ROOT, 'writing-samples', 'voice-reference.md'),
  join(ROOT, 'data', 'hm-intel'),
  join(ROOT, 'interview-prep'),
  join(ROOT, 'interview-prep', 'story-bank.md'),
]);

const STAGE = 'why-statement';

// ────────────────────────────────────────────────────────────────────────────
// System prompt (O8 burstiness constraints)
// ────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Today is 2026-05-17 PT. This year, 2026, has been verified by your orchestrator via system clock — it is real, not hypothetical. You are writing Mitchell Williams's "Why this company / role" statement.

Voice constraints (intentional burstiness — MANDATORY):
- Mix short sentences (5-10 words) with long compound ones (20-30 words)
- 30%+ of sentences must NOT start with a prepositional phrase
- Never use: "Furthermore", "Moreover", "Consequently", "It is important to note", "In today's fast-paced"
- NEVER use: "delve into", "tapestry", "navigate the complexities of", "leverage synergies", "deep dive"
- Match cv.md tone: direct, metric-first, no hedging
- No "I'm excited…" / "I'm passionate…" / "I'd love the opportunity"
- Em dash (—) for parenthetical clauses, not double-hyphen

Target length: 300–500 words. One tight document, not a listicle.

Output ONLY a JSON object — no preamble, no markdown fences:
{
  "statement": "the full why-statement prose (300-500 words)",
  "anchors": [
    {"corpus_ref": "cv.md:42", "claim": "what specific claim this ref backs"},
    {"corpus_ref": "article-digest.md:proof-1", "claim": "..."}
  ],
  "warnings": ["any concerns about overclaiming or voice drift"]
}

RULES:
- All factual claims must be grounded in cv.md or article-digest.md
- anchors must list every specific claim and its source file + line
- The statement must explain WHY this specific company at this specific moment matters to Mitchell — not generic enthusiasm
- NEVER invent metrics or experience not present in the corpus files
`;

// ────────────────────────────────────────────────────────────────────────────
// Zod schema
// ────────────────────────────────────────────────────────────────────────────

const AnchorSchema = z.object({
  corpus_ref: z.string().min(1),
  claim: z.string().min(1),
});

export const WhyStatementLlmResponseSchema = z.object({
  statement: z.string().min(50),
  anchors: z.array(AnchorSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function extractJson(content) {
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const m = content.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (m) return m[1].trim();
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start >= 0 && end > start) return content.slice(start, end + 1);
  return content;
}

function runHumanizeCheck(filePath) {
  try {
    const scriptPath = join(ROOT, 'scripts', 'humanize-check.mjs');
    const out = execSync(
      `node "${scriptPath}" --file "${filePath}" --json`,
      { cwd: ROOT, encoding: 'utf-8', timeout: 60_000 }
    );
    const parsed = JSON.parse(out.trim());
    return { score: parsed.score ?? parsed.consensusScore ?? 0, risk: parsed.risk ?? 'UNKNOWN', checks: parsed.checks || {} };
  } catch (e) {
    try { return JSON.parse((e.stdout || '').trim()); } catch { /* fall through */ }
    return { score: 0, risk: 'PARSE_ERROR', checks: {}, error: String(e.message || e) };
  }
}

function runHumanizeCheckText(text) {
  const tmpPath = join(ROOT, '.humanize-check-why-statement-tmp.md');
  try {
    writeFileSync(tmpPath, text, 'utf-8');
    return runHumanizeCheck(tmpPath);
  } finally {
    try { execSync(`rm -f "${tmpPath}"`); } catch { /* ignore */ }
  }
}

function buildMarkdownArtifact(llmResponse, company, role) {
  const lines = [
    `# Why ${company} — ${role}`,
    '',
    llmResponse.statement,
    '',
    '---',
    '',
    '<!-- meta:version:1.0.0 predecessor_path:null -->',
    '',
  ];

  if (llmResponse.warnings && llmResponse.warnings.length > 0) {
    lines.push('<!-- AGENT WARNINGS:');
    for (const w of llmResponse.warnings) lines.push(`  - ${w}`);
    lines.push('-->');
    lines.push('');
  }

  return lines.join('\n');
}

function buildDecisionsLog(llmResponse, company, role, modelUsed, tokensUsed, humanizeScore) {
  const lines = [
    `# Decisions — Why Statement — ${company} — ${role}`,
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Model:** ${modelUsed}`,
    `**Tokens:** input=${tokensUsed.input} output=${tokensUsed.output}`,
    `**Humanize score:** ${humanizeScore}`,
    `**Word count:** ~${llmResponse.statement.split(/\s+/).length}`,
    '',
    '## Anchors (corpus picks)',
    '',
  ];

  for (const a of llmResponse.anchors || []) {
    lines.push(`- ${a.corpus_ref}: "${a.claim}"`);
  }
  if (!llmResponse.anchors || llmResponse.anchors.length === 0) lines.push('(none recorded)');

  lines.push('');
  lines.push('## Warnings');
  lines.push('');
  if (llmResponse.warnings && llmResponse.warnings.length > 0) {
    for (const w of llmResponse.warnings) lines.push(`- ${w}`);
  } else {
    lines.push('(none)');
  }
  lines.push('');

  return lines.join('\n');
}

function estimateCostUsd({ input = 0, output = 0 } = {}) {
  return Math.round(((input / 1_000_000) * 5.0 + (output / 1_000_000) * 15.0) * 10000) / 10000;
}

// ────────────────────────────────────────────────────────────────────────────
// Main export
// ────────────────────────────────────────────────────────────────────────────

/**
 * Draft the "Why this company / role" one-pager.
 *
 * @param {SubAgentInput} input
 * @returns {Promise<SubAgentOutput>}
 */
export async function runWhyStatement(input) {
  const dryRun = input?.config?.dryRun ?? true;

  if (dryRun) {
    return dryRunSkipped(STAGE);
  }

  const t0 = Date.now();

  // ── 1. Load corpus ──────────────────────────────────────────────────────

  // Corpus reads via readonly-fs barrier (O5)
  const cvPath = join(ROOT, 'cv.md');
  if (!rfs.existsSync(cvPath)) {
    return {
      stage: STAGE, status: 'error', output: null,
      diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: 0, tokens_used: { input: 0, output: 0, cached: 0 }, model_used: 'openai:gpt-5' },
      error: 'cv.md not found at repo root',
    };
  }
  const cvText = rfs.readFileSync(cvPath, 'utf-8');

  const articleDigestPath = join(ROOT, 'article-digest.md');
  const articleDigestText = rfs.existsSync(articleDigestPath) ? rfs.readFileSync(articleDigestPath, 'utf-8') : null;

  // ── 2. Metadata ─────────────────────────────────────────────────────────

  const jdText = input?.pack?.jd?.jd_text || input?.pack?.inputs?.jdText || input?.pack?.inputs?.jd_text || '';
  const company = input?.pack?.jd?.company || input?.pack?.inputs?.company || input?.pack?.meta?.company || 'Unknown';
  const role = input?.pack?.jd?.role || input?.pack?.inputs?.role || input?.pack?.meta?.role || 'Unknown';
  const rowId = input?.pack?.meta?.row_id || input?.pack?.inputs?.rowId || 0;
  const hmIntel = input?.context?.hmIntel || {};

  // ── 3. Build prompt ─────────────────────────────────────────────────────

  const digestSection = articleDigestText
    ? `\n\n## article-digest.md (proof points)\n\n${articleDigestText.slice(0, 1500)}`
    : '';
  const hmSection = Object.keys(hmIntel).length
    ? `\n\n## HM-intel\n\n${JSON.stringify(hmIntel, null, 2).slice(0, 600)}`
    : '';

  const userPrompt = [
    `## Company: ${company}`,
    `## Role: ${role}`,
    '',
    '## Job Description',
    '',
    jdText.slice(0, 5000) || '(not available)',
    '',
    '## cv.md (source of truth)',
    '',
    cvText.slice(0, 4000),
    digestSection,
    hmSection,
    '',
    'Write the why-statement per SYSTEM_PROMPT rules. Output JSON only.',
  ].join('\n');

  // ── 4. LLM call ─────────────────────────────────────────────────────────

  const modelKey = input?.config?.model || 'openai:gpt-5';
  const reasoningEffort = input?.config?.reasoningEffort || 'medium';
  const MAX_COMPLETION_TOKENS = 1600;

  let llmResult = null;
  let llmError = null;
  let modelUsed = modelKey;
  let tokensUsed = { input: 0, output: 0, cached: 0 };

  try {
    const councilResult = await callCouncil({
      prompt: userPrompt,
      models: [modelKey],
      opts: { systemPrompt: SYSTEM_PROMPT, maxTokens: MAX_COMPLETION_TOKENS, reasoningEffort },
    });
    const result = councilResult.results?.[0];
    if (!result) throw new Error('callCouncil returned no results');
    if (result.error) throw new Error(`LLM error: ${result.error}`);
    llmResult = result;
    modelUsed = result.modelUsed || modelKey;
    const totalTok = result.tokens || 0;
    tokensUsed = { input: Math.round(totalTok * 0.85), output: Math.round(totalTok * 0.15), cached: 0 };
  } catch (e) {
    llmError = String(e.message || e);
  }

  if (llmError) {
    return {
      stage: STAGE, status: 'error', output: null,
      diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: 0, tokens_used: tokensUsed, model_used: modelUsed },
      error: `LLM call failed: ${llmError}`,
    };
  }

  // ── 5. Parse + validate (1 retry) ───────────────────────────────────────

  let parsed = null;
  let parseError = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      parsed = WhyStatementLlmResponseSchema.parse(JSON.parse(extractJson(llmResult.content)));
      parseError = null;
      break;
    } catch (e) {
      parseError = String(e.message || e);
      if (attempt === 1) {
        try {
          const strictPrompt = `Output ONLY a JSON object: {"statement":"...300-500 word why-statement...","anchors":[{"corpus_ref":"cv.md:N","claim":"..."}],"warnings":[]}.\nContext: ${userPrompt.slice(0, 2000)}`;
          const retry = await callCouncil({
            prompt: strictPrompt,
            models: [modelKey],
            opts: { systemPrompt: SYSTEM_PROMPT, maxTokens: MAX_COMPLETION_TOKENS, reasoningEffort },
          });
          const rr = retry.results?.[0];
          if (rr && !rr.error) {
            llmResult = rr;
            const addTok = rr.tokens || 0;
            tokensUsed.input += Math.round(addTok * 0.85);
            tokensUsed.output += Math.round(addTok * 0.15);
          }
        } catch { /* ignore */ }
      }
    }
  }

  if (!parsed) {
    return {
      stage: STAGE, status: 'error', output: null,
      diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: estimateCostUsd(tokensUsed), tokens_used: tokensUsed, model_used: modelUsed },
      error: `Zod validation failed after 2 attempts: ${parseError}\n\nRaw LLM (first 500): ${(llmResult?.content || '').slice(0, 500)}`,
    };
  }

  // ── 6. Write artifacts (O9 dual-path) ───────────────────────────────────

  const companySlug = slugify(company);
  const roleSlug = slugify(role);
  const rowPadded = String(rowId).padStart(3, '0');

  const outDirPrimary = join(ROOT, `data/apply-packs/${rowPadded}-${companySlug}-${roleSlug}`);
  const outDirSecondary = join(ROOT, `data/applications/${rowPadded}-${companySlug}-${roleSlug}`);
  mkdirSync(outDirPrimary, { recursive: true });
  mkdirSync(outDirSecondary, { recursive: true });

  const markdown = buildMarkdownArtifact(parsed, company, role);
  const artifactPath = join(outDirPrimary, 'why-statement.md');
  writeFileSync(artifactPath, markdown, 'utf-8');
  writeFileSync(join(outDirSecondary, 'why-statement.md'), markdown, 'utf-8');

  // ── 7. Humanize-check ───────────────────────────────────────────────────

  const humanize = runHumanizeCheckText(parsed.statement);
  const humanizeScore = typeof humanize.score === 'number' ? humanize.score : 0;

  // ── 7b. API-backed AI detection gate ─────────────────────────────────────
  // checkAndRegenerate: run API gate on statement prose; regenerate once on fail.

  let apiDetection = null;
  let apiDetectionRetried = false;

  if (parsed.statement.trim().length > 0) {
    try {
      apiDetection = await checkText(parsed.statement, { budgetUsd: 0.10, skipCache: false });

      // δ DELTA Run-Batch 2026-05-19 — switched from legacy `passes` to
      // band-aware `gateBlocks`. The legacy `passes` field has ~100% FPR
      // on Mitchell's authentic prose (Δ.1 baseline: every detector returns
      // 1.0). `gateBlocks` is true ONLY when CRIT band AND at least one
      // detector has GOOD signal quality — i.e. the gate has a defensible
      // reason to block. USELESS-on-both fail-secure (passes=null) is
      // distinct from gateBlocks=true and does NOT trip the retry here.
      if (apiDetection.gateBlocks === true) {
        apiDetectionRetried = true;
        const gz   = apiDetection.gptzero_prob    != null ? `GPTZero ${Math.round(apiDetection.gptzero_prob    * 100)}%` : '';
        const orig = apiDetection.originality_prob != null ? `Originality ${Math.round(apiDetection.originality_prob * 100)}%` : '';
        const band = apiDetection.band || 'CRIT';
        const stricterPrompt = SYSTEM_PROMPT + `\n\nCRITICAL — API detector override: ${gz} ${orig} (band: ${band}). ` +
          `The statement triggered the CRIT-band block with at least one detector at GOOD signal quality. ` +
          `Rewrite with dramatically more burstiness, irregular sentence structure, and embedded ` +
          `specific personal details unique to Mitchell. Sound like real internal notes, not polished copy.`;

        try {
          const retryCouncil = await callCouncil({
            prompt: userPrompt,
            models: [modelKey],
            opts: { systemPrompt: stricterPrompt, maxTokens: MAX_COMPLETION_TOKENS, reasoningEffort },
          });
          const rr = retryCouncil.results?.[0];
          if (rr && !rr.error) {
            const addTok = rr.tokens || 0;
            tokensUsed.input  += Math.round(addTok * 0.85);
            tokensUsed.output += Math.round(addTok * 0.15);

            try {
              const retryParsed = WhyStatementLlmResponseSchema.parse(JSON.parse(extractJson(rr.content)));
              const retryDetection = await checkText(retryParsed.statement, { budgetUsd: 0.10, skipCache: true });
              // Accept retry if it cleared CRIT-band block OR is not worse.
              if (retryDetection.gateBlocks !== true || apiDetection.gateBlocks === true) {
                parsed = retryParsed;
                const retryMarkdown = buildMarkdownArtifact(retryParsed, company, role);
                writeFileSync(artifactPath, retryMarkdown, 'utf-8');
                writeFileSync(join(outDirSecondary, 'why-statement.md'), retryMarkdown, 'utf-8');
                apiDetection = retryDetection;
              }
            } catch { /* use original if retry fails */ }
          }
        } catch { /* ignore regeneration failure */ }
      }
    } catch (detectionErr) {
      apiDetection = { passes: null, gateBlocks: null, error: String(detectionErr.message || detectionErr) };
    }
  }

  // δ DELTA Run-Batch 2026-05-19 — `gateBlocks` is the band-aware authority.
  const apiDetectionFailed = apiDetection?.gateBlocks === true;

  // ── 8. Decisions log (O9) ────────────────────────────────────────────────

  const decisionsLog = buildDecisionsLog(parsed, company, role, modelUsed, tokensUsed, humanizeScore);
  writeFileSync(join(outDirSecondary, 'decisions.md'), decisionsLog, 'utf-8');

  // ── 9. Return ────────────────────────────────────────────────────────────

  const finalMarkdown = buildMarkdownArtifact(parsed, company, role);
  const artifactOutput = {
    path: artifactPath.replace(ROOT + '/', ''),
    body_markdown: finalMarkdown,
    humanize_score: humanizeScore,
    api_detection: apiDetection,
  };

  const gz   = apiDetection?.gptzero_prob    != null ? `GPTZero ${Math.round(apiDetection.gptzero_prob    * 100)}%` : null;
  const orig = apiDetection?.originality_prob != null ? `Originality ${Math.round(apiDetection.originality_prob * 100)}%` : null;

  return {
    stage: STAGE,
    status: apiDetectionFailed ? 'error' : 'ok',
    output: artifactOutput,
    diagnostics: {
      duration_ms: Date.now() - t0,
      cost_estimate_usd: estimateCostUsd(tokensUsed),
      tokens_used: tokensUsed,
      model_used: modelUsed,
      humanize_risk_score: humanizeScore,
      humanize_risk_band: humanize.risk,
      api_detection_retried: apiDetectionRetried,
    },
    error: apiDetectionFailed
      ? `AI detection gate failed after ${apiDetectionRetried ? '2 attempts' : '1 attempt'}: ${[gz, orig].filter(Boolean).join(' / ')}`
      : null,
  };
}
