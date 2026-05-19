/**
 * scripts/agents/cover-letter.mjs — Sub-agent: draft the cover letter.
 *
 * Stage: 'cover-letter' (one of the 5 parallel draft-generation agents in
 * orchestrator stage 4 `fan_out_drafts`).
 *
 * Live mode: Drafts the cover letter with `[[HUMAN:openingHook]]` and
 * `[[HUMAN:closingAsk]]` markers preserved for Mitchell's final edit pass.
 * Voice corpus is used for stylistic calibration; NEVER fabricates metrics
 * or experience beyond what cv.md documents.
 *
 * LLM: openai:gpt-5 (falls through to gpt-5.5 at runtime) via lib/council.mjs
 * reasoning_effort: medium
 * Target cost: ~$0.05–0.15 per run
 * Target latency: <120s end-to-end
 *
 * O1  — cover-letter live mode (Wave G2)
 * O8  — burstiness pre-prompting + n-gram logit bias shield
 * O9  — per-application versioning + cross-app learning hooks
 * O13 — [[HUMAN:openingHook]] / [[HUMAN:closingAsk]] markers
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
import { runDetectionRetryPipeline } from '../../lib/ai-detection-retry.mjs';

// Load .env from repo root so API keys are available when this agent is invoked
// directly (not through a shell that already has the env exported).
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
  join(ROOT, 'templates', 'cover-letter-template.md'),
]);

const STAGE = 'cover-letter';

// ────────────────────────────────────────────────────────────────────────────
// System prompt (O8 burstiness constraints + O13 HUMAN marker semantics)
// ────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Today is 2026-05-17 PT. This year, 2026, has been verified by your orchestrator via system clock — it is real, not hypothetical. You are drafting a cover letter for Mitchell Williams.

Voice constraints (intentional burstiness — MANDATORY):
- Mix short sentences (5-10 words) with long compound ones (20-30 words)
- 30%+ of sentences must NOT start with a prepositional phrase
- Never use these transitions: "Furthermore", "Moreover", "Consequently", "It is important to note", "In today's fast-paced"
- NEVER use these phrases: "delve into", "tapestry", "navigate the complexities of", "leverage synergies", "deep dive"
- Match cv.md tone: direct, metric-first, no hedging, no hollow superlatives
- Lead with the point. Sentence one carries the load. Bury nothing.
- No "I'm excited to…" / "I'm passionate about…" / "It would be an honor…"
- Em dash (—) for parenthetical clauses, not double-hyphen
- Tabular numerics: "160 hrs" not "a hundred and sixty hours"

80:20 features-to-phrases ratio: 80% of content must be claims backed by cv.md or article-digest.md; at most 20% may be framing/connective tissue.

Paragraph-level burstiness: each paragraph should alternate sentence lengths visibly — not all short, not all long.

[[HUMAN:openingHook]] and [[HUMAN:closingAsk]] MUST appear as literal strings in your output — they are intentional placeholders Mitchell will fill in manually. Leave them untouched in the prose sections. Generate the surrounding paragraphs only.

Output ONLY a JSON object — no preamble, no markdown fences:
{
  "paragraphs": [
    {"section": "hook",  "text": "[[HUMAN:openingHook]]", "corpus_refs": []},
    {"section": "proof", "text": "...proof paragraph...", "corpus_refs": ["cv.md:42", "article-digest.md:proof-1"]},
    {"section": "proof", "text": "...second proof paragraph...", "corpus_refs": ["cv.md:85"]},
    {"section": "why",   "text": "...why-this-company paragraph...", "corpus_refs": []},
    {"section": "ask",   "text": "[[HUMAN:closingAsk]]", "corpus_refs": []}
  ],
  "warnings": ["any concerns about overclaiming or voice drift"]
}

RULES:
- Exactly 5 paragraphs: hook (HUMAN placeholder), 2-3 proof, why, ask (HUMAN placeholder)
- hook paragraph: text MUST be exactly the string "[[HUMAN:openingHook]]"
- ask paragraph: text MUST be exactly the string "[[HUMAN:closingAsk]]"
- Proof paragraphs: 2-3 sentences each, metric-first, corpus citations in corpus_refs array
- Why paragraph: 1-2 sentences connecting Mitchell's unique combination to THIS specific company
- NEVER invent metrics or experience not present in cv.md or article-digest.md
- Compress ruthlessly: cover letter must survive 40% cut without losing its core
`;

// ────────────────────────────────────────────────────────────────────────────
// Zod schema
// ────────────────────────────────────────────────────────────────────────────

const ParagraphSchema = z.object({
  section: z.enum(['hook', 'proof', 'why', 'ask']),
  text: z.string().min(1),
  corpus_refs: z.array(z.string()).default([]),
});

export const CoverLetterLlmResponseSchema = z.object({
  paragraphs: z.array(ParagraphSchema).min(4).max(7),
  warnings: z.array(z.string()).default([]),
});

// ────────────────────────────────────────────────────────────────────────────
// Helpers (shared with cv-tailor pattern)
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

function runHumanizeCheckText(text) {
  const tmpPath = join(ROOT, '.humanize-check-cover-letter-tmp.md');
  try {
    writeFileSync(tmpPath, text, 'utf-8');
    return runHumanizeCheck(tmpPath);
  } finally {
    try { execSync(`rm -f "${tmpPath}"`); } catch { /* ignore */ }
  }
}

/**
 * Build the markdown artifact from validated LLM response.
 * The [[HUMAN:...]] markers are preserved literally — Mitchell fills them in.
 */
function buildMarkdownArtifact(llmResponse, company, role) {
  const lines = [
    `# Cover Letter — ${company} — ${role}`,
    '',
    '> **DRAFT** — Fill in `[[HUMAN:openingHook]]` and `[[HUMAN:closingAsk]]` before submitting.',
    '',
    '---',
    '',
  ];

  for (const para of llmResponse.paragraphs) {
    lines.push(para.text);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('Mitchell Williams');
  lines.push('mitwilli@gmail.com · linkedin.com/in/mitwilli · github.com/mitwilli-create');

  if (llmResponse.warnings && llmResponse.warnings.length > 0) {
    lines.push('');
    lines.push('<!-- AGENT WARNINGS:');
    for (const w of llmResponse.warnings) {
      lines.push(`  - ${w}`);
    }
    lines.push('-->');
  }

  lines.push('');

  // Metadata comment for version tracking (O9)
  lines.push('<!-- meta:version:1.0.0 predecessor_path:null -->');
  lines.push('');

  return lines.join('\n');
}

/**
 * Build the decisions.md companion file (O9 cross-app learning hook).
 */
function buildDecisionsLog(llmResponse, company, role, modelUsed, tokensUsed, humanizeScore) {
  const lines = [
    `# Decisions — Cover Letter — ${company} — ${role}`,
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Model:** ${modelUsed}`,
    `**Tokens:** input=${tokensUsed.input} output=${tokensUsed.output}`,
    `**Humanize score:** ${humanizeScore}`,
    '',
    '## Corpus picks',
    '',
  ];

  const allRefs = llmResponse.paragraphs.flatMap(p => p.corpus_refs || []);
  const uniqueRefs = [...new Set(allRefs)];
  for (const ref of uniqueRefs) {
    lines.push(`- ${ref}`);
  }
  if (uniqueRefs.length === 0) lines.push('(none recorded)');

  lines.push('');
  lines.push('## Warnings / omitted alternatives');
  lines.push('');
  if (llmResponse.warnings && llmResponse.warnings.length > 0) {
    for (const w of llmResponse.warnings) {
      lines.push(`- ${w}`);
    }
  } else {
    lines.push('(none)');
  }

  lines.push('');
  lines.push('## Sections generated');
  lines.push('');
  for (const para of llmResponse.paragraphs) {
    lines.push(`- **${para.section}**: ${para.text.slice(0, 80).replace(/\n/g, ' ')}${para.text.length > 80 ? '…' : ''}`);
  }
  lines.push('');

  return lines.join('\n');
}

function estimateCostUsd({ input = 0, output = 0 } = {}) {
  const inputCost = (input / 1_000_000) * 5.0;
  const outputCost = (output / 1_000_000) * 15.0;
  return Math.round((inputCost + outputCost) * 10000) / 10000;
}

// ────────────────────────────────────────────────────────────────────────────
// Main export
// ────────────────────────────────────────────────────────────────────────────

/**
 * Draft the cover letter with [[HUMAN:...]] markers preserved.
 *
 * @param {SubAgentInput} input
 * @returns {Promise<SubAgentOutput>}
 */
export async function runCoverLetter(input) {
  const dryRun = input?.config?.dryRun ?? true;

  if (dryRun) {
    return dryRunSkipped(STAGE);
  }

  const t0 = Date.now();

  // ── 1. Load corpus files ────────────────────────────────────────────────

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

  const voiceRefPath = join(ROOT, 'writing-samples', 'voice-reference.md');
  const voiceRefText = rfs.existsSync(voiceRefPath) ? rfs.readFileSync(voiceRefPath, 'utf-8') : null;

  const templatePath = join(ROOT, 'templates', 'cover-letter-template.md');
  const templateText = rfs.existsSync(templatePath) ? rfs.readFileSync(templatePath, 'utf-8') : null;

  // ── 2. Extract metadata ─────────────────────────────────────────────────

  const jdText =
    input?.pack?.jd?.jd_text ||
    input?.pack?.inputs?.jdText ||
    input?.pack?.inputs?.jd_text ||
    '';
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
  const hmIntel = input?.context?.hmIntel || {};

  // ── 3. Build prompt ─────────────────────────────────────────────────────

  const jdTrimmed = jdText.slice(0, 5000);
  const cvTrimmed = cvText.slice(0, 4000);
  const digestSection = articleDigestText
    ? `\n\n## article-digest.md (proof points)\n\n${articleDigestText.slice(0, 1500)}`
    : '';
  const voiceSection = voiceRefText
    ? `\n\n## voice-reference.md (calibration only — do not fabricate claims from this)\n\n${voiceRefText.slice(0, 800)}`
    : '';
  const templateSection = templateText
    ? `\n\n## cover-letter-template.md (structure guide + worked example)\n\n${templateText.slice(0, 2000)}`
    : '';
  const hmSection = Object.keys(hmIntel).length
    ? `\n\n## HM-intel (hiring manager context)\n\n${JSON.stringify(hmIntel, null, 2).slice(0, 600)}`
    : '';

  const userPrompt = [
    '## Job Description',
    '',
    jdTrimmed || '(JD text not available — infer role requirements from company and role name)',
    '',
    `## Target company: ${company}`,
    `## Target role: ${role}`,
    '',
    '## cv.md (full reference — source of truth for all claims)',
    '',
    cvTrimmed,
    digestSection,
    voiceSection,
    templateSection,
    hmSection,
    '',
    'Draft the cover letter per the SYSTEM_PROMPT rules. Output JSON only — no preamble, no fences.',
  ].join('\n');

  // ── 4. LLM call ─────────────────────────────────────────────────────────

  const modelKey = input?.config?.model || 'openai:gpt-5';
  const reasoningEffort = input?.config?.reasoningEffort || 'medium';
  const MAX_COMPLETION_TOKENS = 2200;

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
      const jsonStr = extractJson(llmResult.content);
      const rawObj = JSON.parse(jsonStr);
      parsed = CoverLetterLlmResponseSchema.parse(rawObj);
      parseError = null;
      break;
    } catch (e) {
      parseError = String(e.message || e);
      if (attempt === 1) {
        try {
          const strictPrompt = [
            'You previously produced a response that was not valid JSON. Produce ONLY a JSON object with no other text.',
            'Required shape:',
            '{"paragraphs": [{"section":"hook","text":"[[HUMAN:openingHook]]","corpus_refs":[]}, {"section":"proof","text":"...","corpus_refs":["cv.md:N"]}, {"section":"proof","text":"...","corpus_refs":[]}, {"section":"why","text":"...","corpus_refs":[]}, {"section":"ask","text":"[[HUMAN:closingAsk]]","corpus_refs":[]}], "warnings":[]}',
            '',
            'Original context (re-generate the cover letter paragraphs):',
            userPrompt.slice(0, 3000),
          ].join('\n');

          const retry = await callCouncil({
            prompt: strictPrompt,
            models: [modelKey],
            opts: { systemPrompt: SYSTEM_PROMPT, maxTokens: MAX_COMPLETION_TOKENS, reasoningEffort },
          });
          const retryResult = retry.results?.[0];
          if (retryResult && !retryResult.error) {
            llmResult = retryResult;
            const addTok = retryResult.tokens || 0;
            tokensUsed.input += Math.round(addTok * 0.85);
            tokensUsed.output += Math.round(addTok * 0.15);
          }
        } catch { /* ignore retry failure; parseError surfaces on attempt 2 */ }
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

  // ── 6. Write artifact + decisions log ───────────────────────────────────

  const companySlug = slugify(company);
  const roleSlug = slugify(role);
  const rowPadded = String(rowId).padStart(3, '0');

  // Primary path: data/apply-packs/{row}-{slug}/ (existing convention)
  const outDirPrimary = join(ROOT, `data/apply-packs/${rowPadded}-${companySlug}-${roleSlug}`);
  mkdirSync(outDirPrimary, { recursive: true });

  // Secondary path: data/applications/{id}/ (O9 per-application versioning)
  const outDirSecondary = join(ROOT, `data/applications/${rowPadded}-${companySlug}-${roleSlug}`);
  mkdirSync(outDirSecondary, { recursive: true });

  const markdown = buildMarkdownArtifact(parsed, company, role);
  const artifactName = `Mitchell Williams - ${company} - ${role} - Cover Letter.md`;
  const artifactPath = join(outDirPrimary, artifactName);
  writeFileSync(artifactPath, markdown, 'utf-8');

  // Mirror to secondary path
  writeFileSync(join(outDirSecondary, artifactName), markdown, 'utf-8');

  // ── 7. Humanize-check (prose sections only — skip HUMAN markers) ────────

  const proseSections = parsed.paragraphs
    .filter(p => p.section !== 'hook' && p.section !== 'ask')
    .map(p => p.text)
    .join('\n\n');

  let humanize = { score: 0, risk: 'UNKNOWN', checks: {} };
  let humanizeScore = 0;
  let humanizeRetried = false;

  if (proseSections.trim().length > 0) {
    humanize = runHumanizeCheckText(proseSections);
    humanizeScore = typeof humanize.score === 'number' ? humanize.score : 0;

    // O1: if risk > 20, regenerate ONCE with stricter constraints
    if (humanizeScore > 20) {
      humanizeRetried = true;
      const flaggedPhrases = humanize.checks?.phrases?.hits?.map(h => h.label || h).join(', ') || 'flagged phrases';
      const stricterSystemPrompt = SYSTEM_PROMPT + `\n\nCRITICAL: The previous draft had a humanize-check score of ${humanizeScore} (>${20}). Specifically flagged: ${flaggedPhrases}. Rewrite with dramatically varied sentence lengths, concrete specifics, and zero AI-detector tells. Make it sound like something Mitchell wrote in 20 minutes, not something polished by a committee.`;

      try {
        const retryResult = await callCouncil({
          prompt: userPrompt,
          models: [modelKey],
          opts: { systemPrompt: stricterSystemPrompt, maxTokens: MAX_COMPLETION_TOKENS, reasoningEffort },
        });
        const rr = retryResult.results?.[0];
        if (rr && !rr.error) {
          const addTok = rr.tokens || 0;
          tokensUsed.input += Math.round(addTok * 0.85);
          tokensUsed.output += Math.round(addTok * 0.15);

          try {
            const retryParsed = CoverLetterLlmResponseSchema.parse(JSON.parse(extractJson(rr.content)));
            // Accept re-generation if it's better or within threshold
            const retryProse = retryParsed.paragraphs
              .filter(p => p.section !== 'hook' && p.section !== 'ask')
              .map(p => p.text)
              .join('\n\n');
            const retryHumanize = runHumanizeCheckText(retryProse);
            const retryScore = typeof retryHumanize.score === 'number' ? retryHumanize.score : humanizeScore;

            if (retryScore <= humanizeScore) {
              parsed = retryParsed;
              humanizeScore = retryScore;
              humanize = retryHumanize;
              const retryMarkdown = buildMarkdownArtifact(retryParsed, company, role);
              writeFileSync(artifactPath, retryMarkdown, 'utf-8');
              writeFileSync(join(outDirSecondary, artifactName), retryMarkdown, 'utf-8');
            }
          } catch { /* use original if retry parse fails */ }
        }
      } catch { /* ignore retry failure — return best we have */ }
    }
  }

  // ── 8. API-backed AI detection gate ─────────────────────────────────────
  // checkAndRegenerate: run API gate on prose sections; regenerate once on fail.

  // DELTA P1 — 3-stage retry pipeline (replaces previous 1-stage retry).
  // Same model each stage; stricter prompts; band-aware exit conditions.
  // See lib/ai-detection-retry.mjs for the staged-prompt construction.

  let apiDetection = null;
  let retryFinalStatus = null;
  let retryAttempts = [];

  if (proseSections.trim().length > 0) {
    try {
      apiDetection = await checkText(proseSections, { budgetUsd: 0.10, skipCache: false });

      if (apiDetection.gateBlocks === true) {
        const pipeline = await runDetectionRetryPipeline({
          initialProse: proseSections,
          initialDetection: apiDetection,
          baseSystemPrompt: SYSTEM_PROMPT,
          regenerate: async (systemPrompt) => {
            // Same model, stricter system prompt. Model-switching as evasion is banned.
            const retryCouncil = await callCouncil({
              prompt: userPrompt,
              models: [modelKey],
              opts: { systemPrompt, maxTokens: MAX_COMPLETION_TOKENS, reasoningEffort },
            });
            const rr = retryCouncil.results?.[0];
            if (!rr || rr.error) throw new Error(rr?.error || 'no result');
            const addTok = rr.tokens || 0;
            const inTok  = Math.round(addTok * 0.85);
            const outTok = Math.round(addTok * 0.15);
            const retryParsed = CoverLetterLlmResponseSchema.parse(JSON.parse(extractJson(rr.content)));
            const retryProse  = retryParsed.paragraphs
              .filter(p => p.section !== 'hook' && p.section !== 'ask')
              .map(p => p.text)
              .join('\n\n');
            return { prose: retryProse, tokens: { input: inTok, output: outTok } };
          },
        });

        retryFinalStatus = pipeline.final_status;
        retryAttempts = pipeline.attempts;
        tokensUsed.input  += pipeline.tokens_used.input;
        tokensUsed.output += pipeline.tokens_used.output;

        // If a stage produced an accepted result, splice its prose back into
        // the body paragraphs (preserving the original hook/ask structure).
        const acceptedIdx = pipeline.attempts.findIndex(a => a.accepted);
        if (acceptedIdx >= 0) {
          const acceptedProse = pipeline.final.prose;
          const acceptedParagraphs = acceptedProse.split(/\n\n+/);
          const bodySlots = parsed.paragraphs
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => p.section !== 'hook' && p.section !== 'ask');
          for (let i = 0; i < bodySlots.length; i++) {
            const newText = i === bodySlots.length - 1
              ? acceptedParagraphs.slice(i).join('\n\n')
              : acceptedParagraphs[i] || bodySlots[i].p.text;
            parsed.paragraphs[bodySlots[i].i] = { ...bodySlots[i].p, text: newText };
          }
          const retryMarkdown = buildMarkdownArtifact(parsed, company, role);
          writeFileSync(artifactPath, retryMarkdown, 'utf-8');
          writeFileSync(join(outDirSecondary, artifactName), retryMarkdown, 'utf-8');
        }

        apiDetection = pipeline.final.detection;
      }
    } catch (detectionErr) {
      apiDetection = { passes: null, gateBlocks: null, error: String(detectionErr.message || detectionErr) };
    }
  }

  // Only block on the calibrated gateBlocks decision, NOT the legacy `passes`
  // (which the DELTA Δ.1 baseline showed has ~100% FPR on Mitchell's voice).
  const apiDetectionFailed = apiDetection?.gateBlocks === true;

  // ── 9. Write decisions log (O9) ─────────────────────────────────────────

  const decisionsLog = buildDecisionsLog(parsed, company, role, modelUsed, tokensUsed, humanizeScore);
  writeFileSync(join(outDirSecondary, 'decisions.md'), decisionsLog, 'utf-8');

  // ── 10. Return SubAgentOutput ────────────────────────────────────────────

  const costUsd = estimateCostUsd(tokensUsed);

  const finalStatus = humanizeScore > 45 || apiDetectionFailed ? 'error' : 'ok';
  const gz   = apiDetection?.gptzero_prob    != null ? `GPTZero ${Math.round(apiDetection.gptzero_prob    * 100)}%` : null;
  const orig = apiDetection?.originality_prob != null ? `Originality ${Math.round(apiDetection.originality_prob * 100)}%` : null;
  const stagesAttempted = retryAttempts.length;
  const apiErrMsg = apiDetectionFailed
    ? `AI detection gate failed after ${stagesAttempted + 1} attempt(s) (${retryFinalStatus || 'NO_RETRY'}): ${[gz, orig].filter(Boolean).join(' / ')}`
    : null;

  // Build output shape matching orchestrator's cover_letter artifact contract
  const artifactOutput = {
    path: artifactPath.replace(ROOT + '/', ''),
    body_markdown: buildMarkdownArtifact(parsed, company, role),
    humanize_score: humanizeScore,
    voice_fidelity_cosine: 0,  // voice_pass stage fills this; sub-agent returns 0
    citations: parsed.paragraphs.flatMap(p =>
      (p.corpus_refs || []).map(ref => ({
        claim: `${p.section} paragraph corpus reference`,
        source_file: ref.includes(':') ? ref.split(':')[0] : ref,
        source_line: ref.includes(':') ? parseInt(ref.split(':')[1]) || 0 : 0,
      }))
    ),
    api_detection: apiDetection,
  };

  return {
    stage: STAGE,
    status: finalStatus,
    output: artifactOutput,
    diagnostics: {
      duration_ms: Date.now() - t0,
      cost_estimate_usd: costUsd,
      tokens_used: tokensUsed,
      model_used: modelUsed,
      humanize_retry: humanizeRetried,
      humanize_risk_score: humanizeScore,
      humanize_risk_band: humanize.risk,
      api_detection_retry_stages: stagesAttempted,
      api_detection_retry_status: retryFinalStatus,
      api_detection_band: apiDetection?.band ?? null,
      api_detection_signal_quality: {
        gptzero: apiDetection?.gptzero_signal_quality ?? null,
        originality: apiDetection?.originality_signal_quality ?? null,
      },
    },
    error: humanizeScore > 45
      ? `humanize-check score ${humanizeScore} still > 45 after retry (${humanize.risk})`
      : apiErrMsg,
  };
}
