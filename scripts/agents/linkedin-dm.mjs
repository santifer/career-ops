/**
 * scripts/agents/linkedin-dm.mjs — Sub-agent: draft the recruiter LinkedIn DM.
 *
 * Stage: 'linkedin-dm' (one of the 5 parallel draft-generation agents in
 * orchestrator stage 4 `fan_out_drafts`).
 *
 * Live mode: Drafts 3 variants of a recruiter LinkedIn DM (cold, warm,
 * mutual-connection). 160-220 words each, 2-3 paragraphs, Mitchell's voice.
 * Uses HM-intel to personalize the outreach.
 *
 * LLM: openai:gpt-5 via lib/council.mjs, reasoning_effort: medium
 * Target cost: ~$0.03–0.07 per run
 * Target latency: <90s
 *
 * O2  — linkedin-dm live mode (Wave G2)
 * O8  — burstiness pre-prompting + n-gram logit bias shield
 * O9  — per-application versioning + cross-app learning hooks
 *
 * @typedef {import('./types.mjs').SubAgentInput} SubAgentInput
 * @typedef {import('./types.mjs').SubAgentOutput} SubAgentOutput
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const STAGE = 'linkedin-dm';

// ────────────────────────────────────────────────────────────────────────────
// System prompt (O8 burstiness constraints)
// ────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Today is 2026-05-17 PT. This year, 2026, has been verified by your orchestrator via system clock — it is real, not hypothetical. You are writing LinkedIn DM variants for Mitchell Williams to send to a recruiter or hiring manager.

Voice constraints (intentional burstiness — MANDATORY):
- Mix short sentences (5-10 words) with long compound ones (20-30 words)
- 30%+ of sentences must NOT start with a prepositional phrase
- Never use: "Furthermore", "Moreover", "Consequently", "It is important to note", "In today's fast-paced"
- NEVER use: "delve into", "tapestry", "navigate the complexities of", "leverage synergies", "deep dive"
- Match cv.md tone: direct, metric-first, no hedging
- No "I'm excited…" / "I'm passionate…" / "I'd love the opportunity to connect"
- Use the FULL role name — never abbreviate (e.g., "Communications Manager" not "Comms Mgr")
- Em dash (—) for parenthetical clauses, not double-hyphen
- 2-3 short paragraphs, 160-220 words total per variant

LinkedIn outreach voice patterns:
- Full role names (never abbreviate)
- Time chunks not aggregates ("two years inside X" not "two years of AI experience")
- Concrete qualifiers on every metric
- Paragraph break before each significant impact line

Output ONLY a JSON object — no preamble, no markdown fences:
{
  "messages": [
    {
      "variant": "cold",
      "text": "...",
      "char_count": 0
    },
    {
      "variant": "warm",
      "text": "...",
      "char_count": 0
    },
    {
      "variant": "mutual-connection",
      "text": "...",
      "char_count": 0
    }
  ],
  "warnings": ["..."]
}

RULES:
- Exactly 3 variants: cold, warm, mutual-connection
- cold: assume zero prior contact
- warm: assume a previous LinkedIn interaction (comment, view, mutual connection visibility) — reference it briefly
- mutual-connection: reference [MUTUAL_CONNECTION_NAME] as a placeholder Mitchell will fill in
- All factual claims grounded in cv.md or article-digest.md — no fabricated metrics
- char_count is the actual character count of the text field (compute it)
- 160-220 words each — count them
`;

// ────────────────────────────────────────────────────────────────────────────
// Zod schema
// ────────────────────────────────────────────────────────────────────────────

const MessageVariantSchema = z.object({
  variant: z.enum(['cold', 'warm', 'mutual-connection']),
  text: z.string().min(100).max(2000),
  char_count: z.number().int().min(0),
});

export const LinkedinDmLlmResponseSchema = z.object({
  messages: z.array(MessageVariantSchema).length(3),
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

function buildMarkdownArtifact(llmResponse, company, role) {
  const lines = [
    `# LinkedIn DM Variants — ${company} — ${role}`,
    '',
    '> Pick one variant, fill in any `[PLACEHOLDER]` text, review before sending.',
    '',
  ];

  for (const msg of llmResponse.messages) {
    lines.push(`## ${msg.variant.charAt(0).toUpperCase() + msg.variant.slice(1)} (${msg.char_count} chars)`);
    lines.push('');
    lines.push(msg.text);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  if (llmResponse.warnings && llmResponse.warnings.length > 0) {
    lines.push('<!-- AGENT WARNINGS:');
    for (const w of llmResponse.warnings) lines.push(`  - ${w}`);
    lines.push('-->');
    lines.push('');
  }

  lines.push('<!-- meta:version:1.0.0 predecessor_path:null -->');
  lines.push('');

  return lines.join('\n');
}

function buildDecisionsLog(llmResponse, company, role, modelUsed, tokensUsed) {
  const lines = [
    `# Decisions — LinkedIn DM — ${company} — ${role}`,
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Model:** ${modelUsed}`,
    `**Tokens:** input=${tokensUsed.input} output=${tokensUsed.output}`,
    '',
    '## Variants generated',
    '',
  ];
  for (const msg of llmResponse.messages) {
    lines.push(`- **${msg.variant}**: ${msg.char_count} chars, ~${msg.text.split(/\s+/).length} words`);
  }
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
 * Draft the recruiter LinkedIn DM (3 variants: cold, warm, mutual-connection).
 *
 * @param {SubAgentInput} input
 * @returns {Promise<SubAgentOutput>}
 */
export async function runLinkedinDm(input) {
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
    ? `\n\n## article-digest.md (proof points)\n\n${articleDigestText.slice(0, 1200)}`
    : '';
  const hmSection = Object.keys(hmIntel).length
    ? `\n\n## HM-intel (recruiter/hiring-manager signal)\n\n${JSON.stringify(hmIntel, null, 2).slice(0, 600)}`
    : '';

  const userPrompt = [
    `## Company: ${company}`,
    `## Role (FULL name — never abbreviate): ${role}`,
    '',
    '## Job Description',
    '',
    jdText.slice(0, 4000) || '(not available)',
    '',
    '## cv.md (source of truth)',
    '',
    cvText.slice(0, 3500),
    digestSection,
    hmSection,
    '',
    'Write 3 LinkedIn DM variants per SYSTEM_PROMPT rules. Output JSON only.',
  ].join('\n');

  // ── 4. LLM call ─────────────────────────────────────────────────────────

  const modelKey = input?.config?.model || 'openai:gpt-5';
  const reasoningEffort = input?.config?.reasoningEffort || 'medium';
  const MAX_COMPLETION_TOKENS = 1800;

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
      parsed = LinkedinDmLlmResponseSchema.parse(JSON.parse(extractJson(llmResult.content)));
      parseError = null;
      break;
    } catch (e) {
      parseError = String(e.message || e);
      if (attempt === 1) {
        try {
          const strictPrompt = `Output ONLY JSON: {"messages":[{"variant":"cold","text":"...","char_count":0},{"variant":"warm","text":"...","char_count":0},{"variant":"mutual-connection","text":"...","char_count":0}],"warnings":[]}.\nContext: ${userPrompt.slice(0, 2000)}`;
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

  // ── 6. Fix char_counts if LLM got them wrong ────────────────────────────

  for (const msg of parsed.messages) {
    msg.char_count = msg.text.length;
  }

  // ── 7. Write artifacts (O9 dual-path) ───────────────────────────────────

  const companySlug = slugify(company);
  const roleSlug = slugify(role);
  const rowPadded = String(rowId).padStart(3, '0');

  const outDirPrimary = join(ROOT, `data/apply-packs/${rowPadded}-${companySlug}-${roleSlug}`);
  const outDirSecondary = join(ROOT, `data/applications/${rowPadded}-${companySlug}-${roleSlug}`);
  mkdirSync(outDirPrimary, { recursive: true });
  mkdirSync(outDirSecondary, { recursive: true });

  const markdown = buildMarkdownArtifact(parsed, company, role);
  const artifactPath = join(outDirPrimary, 'linkedin-dm.md');
  writeFileSync(artifactPath, markdown, 'utf-8');
  writeFileSync(join(outDirSecondary, 'linkedin-dm.md'), markdown, 'utf-8');

  // Decisions log (O9)
  const decisionsLog = buildDecisionsLog(parsed, company, role, modelUsed, tokensUsed);
  writeFileSync(join(outDirSecondary, 'decisions.md'), decisionsLog, 'utf-8');

  // ── 7b. API-backed AI detection gate ─────────────────────────────────────
  // Run checkAndRegenerate on the cold variant (primary prose).

  const primaryVariant = parsed.messages.find(m => m.variant === 'cold') || parsed.messages[0];
  let apiDetection = null;
  let apiDetectionRetried = false;

  try {
    apiDetection = await checkText(primaryVariant.text, { budgetUsd: 0.10, skipCache: false });

    if (apiDetection.passes === false) {
      apiDetectionRetried = true;
      const gz   = apiDetection.gptzero_prob    != null ? `GPTZero ${Math.round(apiDetection.gptzero_prob    * 100)}%` : '';
      const orig = apiDetection.originality_prob != null ? `Originality ${Math.round(apiDetection.originality_prob * 100)}%` : '';
      const stricterPrompt = SYSTEM_PROMPT + `\n\nCRITICAL — API detector override: ${gz} ${orig}. ` +
        `The DM variants scored > 50% AI probability. Rewrite with dramatically more varied sentence ` +
        `rhythms, concrete personal details, and zero AI-detector tells. Make it sound genuinely human.`;

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
            const retryParsed = LinkedinDmLlmResponseSchema.parse(JSON.parse(extractJson(rr.content)));
            for (const msg of retryParsed.messages) { msg.char_count = msg.text.length; }
            const retryPrimary   = retryParsed.messages.find(m => m.variant === 'cold') || retryParsed.messages[0];
            const retryDetection = await checkText(retryPrimary.text, { budgetUsd: 0.10, skipCache: true });
            if (retryDetection.passes !== false || apiDetection.passes === false) {
              parsed = retryParsed;
              const retryMarkdown = buildMarkdownArtifact(retryParsed, company, role);
              writeFileSync(artifactPath, retryMarkdown, 'utf-8');
              writeFileSync(join(outDirSecondary, 'linkedin-dm.md'), retryMarkdown, 'utf-8');
              apiDetection = retryDetection;
            }
          } catch { /* use original if retry fails */ }
        }
      } catch { /* ignore regeneration failure */ }
    }
  } catch (detectionErr) {
    apiDetection = { passes: null, error: String(detectionErr.message || detectionErr) };
  }

  const apiDetectionFailed = apiDetection?.passes === false;

  // ── 8. Return ────────────────────────────────────────────────────────────

  // Build output shape matching orchestrator's linkedin_dm artifact contract
  // The orchestrator expects { body, channel } — we return the cold variant
  // as the primary body and include the full messages array in extra fields.
  const finalPrimary = parsed.messages.find(m => m.variant === 'cold') || parsed.messages[0];
  const artifactOutput = {
    body: finalPrimary.text,
    channel: 'linkedin-message',
    path: artifactPath.replace(ROOT + '/', ''),
    variants: parsed.messages.map(m => ({ variant: m.variant, char_count: m.char_count })),
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
      api_detection_retried: apiDetectionRetried,
    },
    error: apiDetectionFailed
      ? `AI detection gate failed after ${apiDetectionRetried ? '2 attempts' : '1 attempt'}: ${[gz, orig].filter(Boolean).join(' / ')}`
      : null,
  };
}
