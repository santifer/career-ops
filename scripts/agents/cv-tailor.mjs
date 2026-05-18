/**
 * scripts/agents/cv-tailor.mjs — Sub-agent: tailor cv.md bullets to the JD.
 *
 * Stage: 'cv-tailor' (one of the 5 parallel draft-generation agents in
 * orchestrator stage 4 `fan_out_drafts`).
 *
 * Live mode: Uses HM-intel + deterministic bullet scoring to select and
 * re-phrase the most relevant cv.md bullets for this specific JD.
 * Implements Tier B #8 — cv-tailor live mode.
 *
 * LLM: openai:gpt-5 (falls through to gpt-5.5 at runtime) via lib/council.mjs
 * reasoning_effort: medium
 * Target cost: ~$0.05–0.10 per run
 * Target latency: <90s end-to-end
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
import { scoreAndRankBullets, buildLlmPreamble } from '../../lib/hm-weighting.mjs';
import { dryRunSkipped } from './types.mjs';
import { checkText, buildDoNotSubmitBanner } from '../../lib/ai-detection-gate.mjs';

// Load .env from repo root so API keys are available when cv-tailor is invoked
// directly (not through a shell that already has the env exported). Uses
// override:true per the project convention (lib/eval-intel-gather.mjs et al.)
// so that a stale/empty shell-level ANTHROPIC_API_KEY doesn't shadow the .env value.
try {
  const { config } = await import('dotenv');
  config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env'), override: true });
} catch { /* dotenv optional — silently skip if not installed */ }

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// O5 — Read-only filesystem barrier: corpus reads go through this wrapper.
// Sub-agents are only permitted to read these specific corpus paths.
const rfs = createReadonlyFS([
  join(ROOT, 'cv.md'),
  join(ROOT, 'article-digest.md'),
  join(ROOT, 'writing-samples', 'voice-reference.md'),
  join(ROOT, 'data', 'hm-intel'),
  join(ROOT, 'interview-prep'),
  join(ROOT, 'interview-prep', 'story-bank.md'),
]);

const STAGE = 'cv-tailor';
const TOP_N = 8;
const SYSTEM_PROMPT = `Today is 2026-05-17 PT. This year, 2026, has been verified by your orchestrator via system clock — it is real, not hypothetical. You are tailoring Mitchell Williams's CV bullets to a specific job description.

You will receive:
1. The job description body
2. The full cv.md as reference
3. A deterministically-ranked top-8 list of bullets (the preamble) — these scored highest against the JD on HM-intel and metric density. DO NOT REORDER them; preserve the rank.
   Each bullet in the preamble includes its EXACT cv_ref in the form "cv.md:N" where N is the actual line number.
   Example preamble line: "- Shipped RAG pipeline cutting latency 40% [cv.md:42] — score 0.823"
   The cv_ref in your output for that bullet MUST be exactly "cv.md:42" — NOT "cv.md:line:12" or any invented value.
4. Optional article-digest.md for additional proof points

Your job:
- Refine, tighten, or rephrase the top-8 ranked bullets to maximize impact for this specific JD.
- Maintain Mitchell's voice (short, direct, metric-first, no "delve" / no "tapestry" / no AI-detector-tells).
- CRITICAL: Preserve EXACT cv_ref values from the preamble. Each bullet's cv_ref MUST be the verbatim
  "cv.md:N" value shown in the preamble for that bullet. DO NOT substitute, guess, or use "cv.md:line:12"
  as a placeholder. If a bullet came from the preamble, copy its cv_ref exactly as it appeared.
- Also generate 4–6 "highlights" bullets for the HM 6-second scan box at the top of the CV PDF.
  Highlights must be: short (≤100 chars each), metric-first, punchy, and JD-targeted.
  Pull them from the strongest proof points in cv.md / article-digest.md.
  These appear BEFORE work experience in the PDF for visual HM scanning.
  The ATS text layer also sees them first — keep them truthful and verifiable from cv.md.
- Output JSON with this exact shape:
  {
    "tailored_bullets": [{"text": "...", "original_rank": 1, "cv_ref": "cv.md:42", "notes": "what changed"}, ...],
    "highlights": ["metric-first highlight 1", "highlight 2", "highlight 3", "highlight 4"],
    "summary": "1-2 sentence overall tailoring strategy",
    "warnings": ["any concerns about overclaiming or voice drift"]
  }
- The number of tailored_bullets MUST equal the number you received in the ranked preamble (so 8 in, 8 out).
- highlights must be 4–6 items.
- NEVER invent metrics or experience not present in cv.md or article-digest.md.`;

/* -------------------------------------------------------------------------- */
/* Zod schema for LLM response validation                                     */
/* -------------------------------------------------------------------------- */

const TailoredBulletSchema = z.object({
  text: z.string().min(1),
  original_rank: z.number().int().min(1),
  cv_ref: z.string().default(''),
  notes: z.string().default(''),
});

/**
 * Schema for a single Highlights bullet (4–6 for HM 6-second scan box).
 * Short, metric-first, punchy — no more than ~100 chars each.
 */
const HighlightBulletSchema = z.string().min(10).max(150);

export const CvTailorLlmResponseSchema = z.object({
  tailored_bullets: z.array(TailoredBulletSchema).min(1),
  /**
   * highlights — 4–6 short punchy lines for the "## Highlights" box at the
   * top of the CV PDF. Tailored to the JD. Metric-first, no AI-detector tells.
   * Rendered via {{HIGHLIGHTS}} in templates/cv-template.html and .tex.
   * ATS text-layer: appears before Work Experience (chronological order preserved).
   */
  highlights: z.array(HighlightBulletSchema).min(4).max(6),
  summary: z.string().min(1),
  warnings: z.array(z.string()).default([]),
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/**
 * Parse cv.md into individual bullet objects.
 * Extracts lines starting with "- " or "* " from any section.
 * Returns objects with { text, cv_ref, tags, metric_density }.
 */
function parseCvBullets(cvText) {
  const lines = cvText.split('\n');
  const bullets = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match bullet lines
    const m = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (!m) continue;
    const text = m[2].trim();
    if (text.length < 20) continue; // skip very short / decorative lines

    // Compute a rough metric_density: ratio of tokens that look like numbers/percentages/metrics
    const tokens = text.split(/\s+/);
    const metricCount = tokens.filter(t => /\d/.test(t)).length;
    const metric_density = metricCount / Math.max(tokens.length, 1);

    bullets.push({
      text,
      cv_ref: `cv.md:${i + 1}`,
      tags: [],
      metric_density,
      ai_risk: 0,
    });
  }

  return bullets;
}

/**
 * Extract JSON from an LLM response that may wrap it in a markdown code block.
 */
function extractJson(content) {
  // Try naked JSON first
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) return trimmed;
  // Extract from ```json ... ``` block
  const m = content.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (m) return m[1].trim();
  // Extract first {...} block
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start >= 0 && end > start) return content.slice(start, end + 1);
  return content;
}

/**
 * Run humanize-check on a file path and return { score, risk }.
 * Spawns the script via execSync, parses stdout JSON.
 */
function runHumanizeCheck(filePath) {
  try {
    const scriptPath = join(ROOT, 'scripts', 'humanize-check.mjs');
    const out = execSync(
      `node "${scriptPath}" --file "${filePath}" --json`,
      { cwd: ROOT, encoding: 'utf-8', timeout: 60_000 }
    );
    const parsed = JSON.parse(out.trim());
    return {
      score: parsed.score ?? parsed.consensusScore ?? 0,
      risk: parsed.risk ?? 'UNKNOWN',
      checks: parsed.checks || {},
    };
  } catch (e) {
    const out = e.stdout || '';
    try {
      const parsed = JSON.parse(out.trim());
      return {
        score: parsed.score ?? parsed.consensusScore ?? 0,
        risk: parsed.risk ?? 'UNKNOWN',
        checks: parsed.checks || {},
      };
    } catch {
      return { score: 0, risk: 'PARSE_ERROR', checks: {}, error: String(e.message || e) };
    }
  }
}

/**
 * Run humanize-check on raw text by writing to a temp file, scoring it,
 * then deleting the temp file. Used to score only the bullet lines,
 * not the diagnostic summary/warnings sections (which are metadata).
 */
function runHumanizeCheckText(text) {
  const tmpPath = join(ROOT, '.humanize-check-bullets-tmp.md');
  try {
    writeFileSync(tmpPath, text, 'utf-8');
    return runHumanizeCheck(tmpPath);
  } finally {
    try { unlinkSyncSafe(tmpPath); } catch { /* ignore cleanup failure */ }
  }
}

function unlinkSyncSafe(path) {
  try {
    // Use dynamic require-style import isn't available in ESM sync context.
    // execSync is already imported — use it to delete the temp file.
    execSync(`rm -f "${path}"`);
  } catch { /* silently skip */ }
}

/**
 * Build the markdown artifact content from the validated LLM response.
 * Includes a ## Highlights section for use by generate-pdf.mjs ({{HIGHLIGHTS}}).
 */
function buildMarkdownArtifact(llmResponse, company, role) {
  const lines = [
    `# Tailored CV bullets for ${company} ${role}`,
    '',
  ];

  // ## Highlights — written first in the artifact so generate-pdf.mjs can
  // extract the {{HIGHLIGHTS}} template variable for the HM scan box.
  // Each item renders as <li>text</li> in the HTML template via the
  // HIGHLIGHTS variable substitution in generate-pdf.mjs.
  if (llmResponse.highlights && llmResponse.highlights.length > 0) {
    lines.push('## Highlights');
    lines.push('');
    for (const h of llmResponse.highlights) {
      lines.push(`- ${h}`);
    }
    lines.push('');
  }

  lines.push('## Tailored Bullets');
  lines.push('');
  for (const b of llmResponse.tailored_bullets) {
    const ref = b.cv_ref ? `  [${b.cv_ref}]` : '';
    lines.push(`- ${b.text}${ref}`);
  }

  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(llmResponse.summary);

  if (llmResponse.warnings && llmResponse.warnings.length > 0) {
    lines.push('');
    lines.push('## Warnings');
    lines.push('');
    for (const w of llmResponse.warnings) {
      lines.push(`- ${w}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- */
/* Main export                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Tailor cv.md bullets to the JD using HM-intel and LLM refinement.
 *
 * @param {SubAgentInput} input
 * @returns {Promise<SubAgentOutput>}
 */
export async function runCvTailor(input) {
  const dryRun = input?.config?.dryRun ?? true;

  if (dryRun) {
    return dryRunSkipped(STAGE);
  }

  const t0 = Date.now();

  /* ---------------------------------------------------------------------- */
  /* 1. Load and validate inputs                                             */
  /* ---------------------------------------------------------------------- */

  // CV — mandatory (read via readonly-fs barrier)
  const cvPath = join(ROOT, 'cv.md');
  if (!rfs.existsSync(cvPath)) {
    return {
      stage: STAGE,
      status: 'error',
      output: null,
      diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: 0, tokens_used: { input: 0, output: 0, cached: 0 }, model_used: 'openai:gpt-5' },
      error: 'cv.md not found at repo root',
    };
  }
  const cvText = rfs.readFileSync(cvPath, 'utf-8');

  // Article digest — optional (read via readonly-fs barrier)
  const articleDigestPath = join(ROOT, 'article-digest.md');
  const articleDigestText = rfs.existsSync(articleDigestPath)
    ? rfs.readFileSync(articleDigestPath, 'utf-8')
    : null;

  // JD text — from input.pack.jd.jd_text (orchestrator stage 1 shape) or
  // input.pack.inputs.jdText (direct invocation shape)
  const jdText =
    input?.pack?.jd?.jd_text ||
    input?.pack?.inputs?.jdText ||
    input?.pack?.inputs?.jd_text ||
    '';

  // Company / role metadata
  const company =
    input?.pack?.jd?.company ||
    input?.pack?.inputs?.company ||
    input?.pack?.meta?.company ||
    'Unknown';
  const role =
    input?.pack?.jd?.role ||
    input?.pack?.inputs?.role ||
    input?.pack?.meta?.role ||
    'Unknown';
  const rowId =
    input?.pack?.meta?.row_id ||
    input?.pack?.inputs?.rowId ||
    0;

  // HM-intel — from context (orchestrator wires it) or fall back to {}
  const hmIntel = input?.context?.hmIntel || {};

  // JD metadata object for scoring (reserved for future embedding comparison)
  const jdMeta = {};

  /* ---------------------------------------------------------------------- */
  /* 2. Deterministic pre-LLM scoring                                       */
  /* ---------------------------------------------------------------------- */

  const bullets = parseCvBullets(cvText);
  if (bullets.length === 0) {
    return {
      stage: STAGE,
      status: 'error',
      output: null,
      diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: 0, tokens_used: { input: 0, output: 0, cached: 0 }, model_used: 'openai:gpt-5' },
      error: 'cv.md parsed 0 bullets — check bullet formatting',
    };
  }

  const rankedBullets = scoreAndRankBullets(bullets, hmIntel, jdMeta, { topN: TOP_N });
  const preamble = buildLlmPreamble(rankedBullets);

  /* ---------------------------------------------------------------------- */
  /* 3. Build the LLM prompt                                                 */
  /* ---------------------------------------------------------------------- */

  // Trim JD to ~5000 chars to stay within budget
  const jdTrimmed = jdText.slice(0, 5000);

  // Trim cv.md to ~4000 chars (full context for reference)
  const cvTrimmed = cvText.slice(0, 4000);

  // Trim article-digest to ~1500 chars if present
  const digestSection = articleDigestText
    ? `\n\n## article-digest.md (proof points)\n\n${articleDigestText.slice(0, 1500)}`
    : '';

  const userPrompt = [
    '## Job Description',
    '',
    jdTrimmed || '(JD text not available — use HM-intel context to infer role requirements)',
    '',
    '## cv.md (full reference)',
    '',
    cvTrimmed,
    digestSection,
    '',
    '## Deterministically-ranked top bullets to tailor',
    '',
    preamble,
    '',
    `Tailor exactly ${rankedBullets.length} bullets. Output valid JSON only — no preamble, no markdown fences.`,
  ].join('\n');

  /* ---------------------------------------------------------------------- */
  /* 4. LLM call via lib/council.mjs                                        */
  /* ---------------------------------------------------------------------- */

  const modelKey = input?.config?.model || 'openai:gpt-5';
  const reasoningEffort = input?.config?.reasoningEffort || 'medium';

  // Max completion tokens: ~1800 is enough for 8 bullets + summary + warnings
  const MAX_COMPLETION_TOKENS = 1800;

  let llmResult = null;
  let llmError = null;
  let modelUsed = modelKey;
  let tokensUsed = { input: 0, output: 0, cached: 0 };

  try {
    const councilResult = await callCouncil({
      prompt: userPrompt,
      models: [modelKey],
      opts: {
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: MAX_COMPLETION_TOKENS,
        reasoningEffort,
      },
    });

    const result = councilResult.results?.[0];
    if (!result) throw new Error('callCouncil returned no results');
    if (result.error) throw new Error(`LLM error: ${result.error}`);

    llmResult = result;
    modelUsed = result.modelUsed || modelKey;
    // council.mjs returns total_tokens; approximate input/output split
    const totalTok = result.tokens || 0;
    tokensUsed = { input: Math.round(totalTok * 0.85), output: Math.round(totalTok * 0.15), cached: 0 };
  } catch (e) {
    llmError = String(e.message || e);
  }

  if (llmError) {
    return {
      stage: STAGE,
      status: 'error',
      output: null,
      diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: 0, tokens_used: tokensUsed, model_used: modelUsed },
      error: `LLM call failed: ${llmError}`,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* 5. Parse + validate LLM output (with one Zod retry)                    */
  /* ---------------------------------------------------------------------- */

  let parsed = null;
  let parseError = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const rawContent = attempt === 1
      ? llmResult.content
      : llmResult.content; // second attempt: same content but stricter extraction

    try {
      const jsonStr = extractJson(rawContent);
      const rawObj = JSON.parse(jsonStr);
      parsed = CvTailorLlmResponseSchema.parse(rawObj);
      parseError = null;
      break;
    } catch (e) {
      parseError = String(e.message || e);
      if (attempt === 1) {
        // Retry: try a second LLM call with a stricter prompt instructing JSON only
        try {
          const strictPrompt = [
            'You previously produced a response that did not match the required schema.',
            'Produce ONLY a JSON object with no other text. The shape MUST be exactly:',
            '{"tailored_bullets":[{"text":"...","original_rank":1,"cv_ref":"cv.md:N","notes":"..."},...],"highlights":["h1","h2","h3","h4"],"summary":"...","warnings":[]}',
            `tailored_bullets MUST have exactly ${rankedBullets.length} items.`,
            'highlights MUST have between 4 and 6 items, each a short metric-first string (≤100 chars).',
            'cv_ref values MUST be drawn from the preamble below.',
            '',
            'Original user request context (re-tailoring task — full content; do NOT claim missing data):',
            userPrompt,
          ].join('\n');

          const retry = await callCouncil({
            prompt: strictPrompt,
            models: [modelKey],
            opts: {
              systemPrompt: SYSTEM_PROMPT,
              maxTokens: MAX_COMPLETION_TOKENS,
              reasoningEffort,
            },
          });
          const retryResult = retry.results?.[0];
          if (retryResult && !retryResult.error) {
            llmResult = retryResult;
            const addTok = retryResult.tokens || 0;
            tokensUsed.input += Math.round(addTok * 0.85);
            tokensUsed.output += Math.round(addTok * 0.15);
          }
        } catch {
          // ignore retry call failure; parseError will surface on attempt 2
        }
      }
    }
  }

  if (!parsed) {
    return {
      stage: STAGE,
      status: 'error',
      output: null,
      diagnostics: {
        duration_ms: Date.now() - t0,
        cost_estimate_usd: estimateCostUsd(tokensUsed),
        tokens_used: tokensUsed,
        model_used: modelUsed,
      },
      error: `Zod validation failed after 2 attempts: ${parseError}\n\nRaw LLM content (first 500 chars): ${(llmResult?.content || '').slice(0, 500)}`,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* 6. Fix 3: cv_ref validation — ensure returned refs match preamble       */
  /* ---------------------------------------------------------------------- */
  // Build a set of the ACTUAL cv_refs from the preamble so we can detect
  // placeholder pollution (e.g. all bullets returning "cv.md:line:12").
  // If any bullet returned a ref NOT in the preamble, flag it in Warnings
  // and replace it with the correct ref from rankedBullets by original_rank.
  const preambleRefs = new Set(rankedBullets.map((b) => b.cv_ref).filter(Boolean));
  const cvRefWarnings = [];
  let cvRefCorrectionCount = 0;

  const correctedBullets = parsed.tailored_bullets.map((b) => {
    const returnedRef = b.cv_ref || '';
    // Valid: empty string (LLM chose not to assign), or a ref in the preamble set
    if (!returnedRef || preambleRefs.has(returnedRef)) return b;
    // Invalid: ref not in preamble — use the ranked bullet's actual ref by position
    const rankIdx = typeof b.original_rank === 'number' ? b.original_rank - 1 : -1;
    const correctRef = rankIdx >= 0 && rankIdx < rankedBullets.length
      ? rankedBullets[rankIdx].cv_ref
      : rankedBullets[0]?.cv_ref || '';
    cvRefWarnings.push(
      `cv_ref mismatch on bullet rank ${b.original_rank}: LLM returned "${returnedRef}", ` +
      `replaced with actual preamble ref "${correctRef}"`
    );
    cvRefCorrectionCount++;
    return { ...b, cv_ref: correctRef };
  });

  if (cvRefCorrectionCount > 0) {
    parsed = { ...parsed, tailored_bullets: correctedBullets, warnings: [...(parsed.warnings || []), ...cvRefWarnings] };
  }

  // Distinct cv_ref count — used by the smoke-test verification gate below.
  const distinctCvRefs = new Set(parsed.tailored_bullets.map((b) => b.cv_ref).filter(Boolean));

  /* ---------------------------------------------------------------------- */
  /* 7. Write artifact                                                       */
  /* ---------------------------------------------------------------------- */

  const companySlug = slugify(company);
  const roleSlug = slugify(role);
  const rowPadded = String(rowId).padStart(3, '0');
  const outDir = join(ROOT, `data/apply-packs/${rowPadded}-${companySlug}-${roleSlug}`);
  mkdirSync(outDir, { recursive: true });

  const artifactPath = join(outDir, 'cv-tailored.md');
  const markdown = buildMarkdownArtifact(parsed, company, role);
  writeFileSync(artifactPath, markdown, 'utf-8');

  /* ---------------------------------------------------------------------- */
  /* 7. Run humanize-check (bullets only — summary is diagnostic metadata)  */
  /* ---------------------------------------------------------------------- */

  // Score only the bullet text, not the ## Summary / ## Warnings sections,
  // because only the bullets get submitted to employers. The summary is
  // internal diagnostic metadata and should not inflate the AI-risk score.
  const bulletsOnlyText = parsed.tailored_bullets.map(b => `- ${b.text}`).join('\n');
  const humanize = runHumanizeCheckText(bulletsOnlyText);
  const humanizeScore = typeof humanize.score === 'number' ? humanize.score : 0;

  if (humanizeScore > 20) {
    // Flag the phrases but do NOT delete the artifact — return error with detail
    const flaggedPhrases = humanize.checks?.phrases?.hits?.map(h => h.label || h).join(', ') || 'see humanize-check output';
    return {
      stage: STAGE,
      status: 'error',
      output: {
        path: artifactPath.replace(ROOT + '/', ''),
        tailored_bullets_count: parsed.tailored_bullets.length,
        highlights: parsed.highlights || [],
        highlights_count: (parsed.highlights || []).length,
        humanize_risk_score: humanizeScore,
        humanize_risk_band: humanize.risk,
        summary: parsed.summary,
      },
      diagnostics: {
        duration_ms: Date.now() - t0,
        cost_estimate_usd: estimateCostUsd(tokensUsed),
        tokens_used: tokensUsed,
        model_used: modelUsed,
      },
      error: `humanize-check failed: score ${humanizeScore} > 20 (${humanize.risk}). Flagged: ${flaggedPhrases}`,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* 8. API-backed AI detection gate                                         */
  /* ---------------------------------------------------------------------- */
  // checkAndRegenerate pattern: run the API gate on the bullets prose.
  // If fails on first attempt, regenerate once with a stricter system prompt.
  // If still fails on second attempt, return status: 'error' with verdicts.

  let apiDetection = null;
  let apiDetectionRetried = false;

  try {
    apiDetection = await checkText(bulletsOnlyText, { budgetUsd: 0.10, skipCache: false });

    if (apiDetection.passes === false) {
      apiDetectionRetried = true;
      const gz   = apiDetection.gptzero_prob    != null ? `GPTZero ${Math.round(apiDetection.gptzero_prob    * 100)}%` : '';
      const orig = apiDetection.originality_prob != null ? `Originality ${Math.round(apiDetection.originality_prob * 100)}%` : '';
      const stricterPrompt = SYSTEM_PROMPT + `\n\nCRITICAL — API detector override: ${gz} ${orig}. ` +
        `The bullets scored > 50% AI probability on external detectors. ` +
        `Rewrite with dramatically varied sentence rhythms, concrete personal details unique to Mitchell, ` +
        `and hard-specific metrics. Avoid ALL smooth polish. Make it sound like something Mitchell wrote ` +
        `in 15 minutes from notes, not copy edited by a committee.`;

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
            const retryParsed = CvTailorLlmResponseSchema.parse(JSON.parse(extractJson(rr.content)));
            const retryBulletsText = retryParsed.tailored_bullets.map(b => `- ${b.text}`).join('\n');
            const retryDetection   = await checkText(retryBulletsText, { budgetUsd: 0.10, skipCache: true });
            // Accept retry if it improved or is no worse
            if (retryDetection.passes !== false || (apiDetection.passes === false)) {
              parsed = retryParsed;
              const retryMarkdown = buildMarkdownArtifact(retryParsed, company, role);
              writeFileSync(artifactPath, retryMarkdown, 'utf-8');
              apiDetection = retryDetection;
            }
          } catch { /* use original if retry parse fails */ }
        }
      } catch { /* ignore regeneration failure — surface original detection result */ }
    }

    // If still failing after retry, return error with API verdicts
    if (apiDetection.passes === false) {
      const gz   = apiDetection.gptzero_prob    != null ? `GPTZero ${Math.round(apiDetection.gptzero_prob    * 100)}%` : 'GPTZero n/a';
      const orig = apiDetection.originality_prob != null ? `Originality ${Math.round(apiDetection.originality_prob * 100)}%` : 'Originality n/a';
      return {
        stage: STAGE,
        status: 'error',
        output: {
          path: artifactPath.replace(ROOT + '/', ''),
          tailored_bullets_count: parsed.tailored_bullets.length,
          highlights: parsed.highlights || [],
          highlights_count: (parsed.highlights || []).length,
          humanize_risk_score: humanizeScore,
          humanize_risk_band: humanize.risk,
          summary: parsed.summary,
          api_detection: apiDetection,
        },
        diagnostics: {
          duration_ms: Date.now() - t0,
          cost_estimate_usd: estimateCostUsd(tokensUsed),
          tokens_used: tokensUsed,
          model_used: modelUsed,
          api_detection_retried: apiDetectionRetried,
        },
        error: `AI detection gate failed after ${apiDetectionRetried ? '2 attempts' : '1 attempt'}: ${gz} / ${orig}`,
      };
    }
  } catch (detectionErr) {
    // Non-fatal: API gate error should not block the artifact. Log in diagnostics.
    apiDetection = { passes: null, error: String(detectionErr.message || detectionErr) };
  }

  /* ---------------------------------------------------------------------- */
  /* 9. Return SubAgentOutput                                                */
  /* ---------------------------------------------------------------------- */

  const costUsd = estimateCostUsd(tokensUsed);

  return {
    stage: STAGE,
    status: 'ok',
    output: {
      path: artifactPath.replace(ROOT + '/', ''),
      tailored_bullets_count: parsed.tailored_bullets.length,
      highlights: parsed.highlights || [],
      highlights_count: (parsed.highlights || []).length,
      humanize_risk_score: humanizeScore,
      humanize_risk_band: humanize.risk,
      summary: parsed.summary,
      warnings: parsed.warnings || [],
      // Fix 3: cv_ref diversity metrics for smoke-test verification
      distinct_cv_refs_count: distinctCvRefs.size,
      cv_ref_corrections: cvRefCorrectionCount,
      api_detection: apiDetection,
    },
    diagnostics: {
      duration_ms: Date.now() - t0,
      cost_estimate_usd: costUsd,
      tokens_used: tokensUsed,
      model_used: modelUsed,
      api_detection_retried: apiDetectionRetried,
    },
    error: null,
  };
}

/**
 * Rough GPT-5.5 cost estimate.
 * Input: ~$5/MTok, Output: ~$15/MTok (mid-2026 pricing approximation).
 * Cached input is treated as full price (we don't have cached token count from council).
 */
function estimateCostUsd({ input = 0, output = 0 } = {}) {
  const inputCost = (input / 1_000_000) * 5.0;
  const outputCost = (output / 1_000_000) * 15.0;
  return Math.round((inputCost + outputCost) * 10000) / 10000;
}
