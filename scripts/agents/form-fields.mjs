/**
 * scripts/agents/form-fields.mjs — Sub-agent: fill structured application form fields.
 *
 * Stage: 'form-fields' (one of the 5 parallel draft-generation agents in
 * orchestrator stage 4 `fan_out_drafts`).
 *
 * Live mode: Answers each structured application form question using cv.md,
 * article-digest.md, and the JD text. Output is a JSON array of
 * { question, answer, char_limit, voice_check_passed } objects. Answers are
 * grounded exclusively in corpus files — no fabricated metrics.
 *
 * LLM: anthropic:claude-haiku-4-5 (cheaper model — form answers are mostly
 * mechanical) with fallback to openai:gpt-5 if Haiku is not available.
 * reasoning_effort: minimal (form answers need precision, not reasoning depth)
 * Target cost: ~$0.01–0.04 per run
 * Target latency: <60s
 *
 * O2  — form-fields live mode (Wave G2)
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

const STAGE = 'form-fields';

// Default questions used when none are passed (covers common form fields).
const DEFAULT_QUESTIONS = [
  { question: 'Why are you interested in this role?', char_limit: 500 },
  { question: 'What makes you a strong candidate?', char_limit: 500 },
  { question: 'Describe a relevant accomplishment.', char_limit: 800 },
];

// ────────────────────────────────────────────────────────────────────────────
// System prompt (O8 voice constraints — lighter version for form answers)
// ────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Today is 2026-05-17 PT. This year, 2026, has been verified by your orchestrator via system clock. You are answering application form fields for Mitchell Williams.

Voice constraints (MANDATORY — these are SHORT answers, not essays):
- Direct and concrete. Lead with the strongest claim, not a topic sentence.
- Never use: "Furthermore", "Moreover", "I'm excited to", "I'm passionate about", "It is important to note"
- NEVER use: "delve into", "tapestry", "navigate the complexities of", "leverage synergies", "deep dive"
- No hollow superlatives. "20% latency reduction" beats "significant improvement".
- Em dash (—) for parenthetical clauses if needed
- Answers must stay within char_limit if provided — count characters

CRITICAL:
- All factual claims must be grounded in cv.md or article-digest.md — no fabricated metrics
- If a question asks about something not in the corpus, answer honestly at a high level without inventing specifics
- voice_check_passed: true if answer avoids all banned phrases AND leads with a concrete claim; false otherwise

Output ONLY a JSON object — no preamble, no markdown fences:
{
  "answers": [
    {
      "question": "the question text verbatim",
      "answer": "the answer text",
      "char_limit": 500,
      "voice_check_passed": true
    }
  ],
  "warnings": ["any concerns"]
}
`;

// ────────────────────────────────────────────────────────────────────────────
// Zod schema
// ────────────────────────────────────────────────────────────────────────────

const AnswerSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  char_limit: z.number().int().nullable().default(null),
  voice_check_passed: z.boolean().default(true),
});

export const FormFieldsLlmResponseSchema = z.object({
  answers: z.array(AnswerSchema).min(1),
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
    `# Form Fields — ${company} — ${role}`,
    '',
    '> Review all answers before submitting. Do NOT paste AI-drafted text without your own read.',
    '',
  ];

  for (const ans of llmResponse.answers) {
    lines.push(`## ${ans.question}`);
    if (ans.char_limit) {
      lines.push(`*Char limit: ${ans.char_limit} | Actual: ${ans.answer.length}*`);
    }
    lines.push('');
    lines.push(ans.answer);
    lines.push('');
    lines.push(`Voice check: ${ans.voice_check_passed ? 'PASS' : 'REVIEW'}`);
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
    `# Decisions — Form Fields — ${company} — ${role}`,
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Model:** ${modelUsed}`,
    `**Tokens:** input=${tokensUsed.input} output=${tokensUsed.output}`,
    `**Questions answered:** ${llmResponse.answers.length}`,
    '',
    '## Voice check results',
    '',
  ];
  for (const ans of llmResponse.answers) {
    lines.push(`- **${ans.question.slice(0, 60)}**: ${ans.voice_check_passed ? 'PASS' : 'REVIEW'} (${ans.answer.length} chars)`);
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
  // Haiku pricing: ~$0.25/MTok input, $1.25/MTok output
  // gpt-5 fallback: ~$5/MTok input, $15/MTok output
  // Use gpt-5 pricing as conservative upper bound
  return Math.round(((input / 1_000_000) * 5.0 + (output / 1_000_000) * 15.0) * 10000) / 10000;
}

/**
 * Try Haiku via direct Anthropic API call; falls back to council.mjs openai:gpt-5
 * if ANTHROPIC_API_KEY is not set or Haiku returns a non-2xx.
 */
async function callHaikuOrFallback(userPrompt, systemPrompt, maxTokens) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (r.ok) {
        const j = await r.json();
        const content = j.content?.[0]?.text || '';
        const totalTok = (j.usage?.input_tokens || 0) + (j.usage?.output_tokens || 0);
        return {
          content,
          tokens: totalTok,
          modelUsed: 'claude-haiku-4-5',
          inputTokens: j.usage?.input_tokens || 0,
          outputTokens: j.usage?.output_tokens || 0,
        };
      }
    } catch { /* fall through to gpt-5 */ }
  }

  // Fallback: openai:gpt-5 via council.mjs
  const councilResult = await callCouncil({
    prompt: userPrompt,
    models: ['openai:gpt-5'],
    opts: {
      systemPrompt,
      maxTokens,
      reasoningEffort: 'minimal',
    },
  });
  const result = councilResult.results?.[0];
  if (!result) throw new Error('callCouncil returned no results (fallback)');
  if (result.error) throw new Error(`LLM error (fallback): ${result.error}`);
  const totalTok = result.tokens || 0;
  return {
    content: result.content,
    tokens: totalTok,
    modelUsed: result.modelUsed || 'openai:gpt-5',
    inputTokens: Math.round(totalTok * 0.85),
    outputTokens: Math.round(totalTok * 0.15),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Main export
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fill the structured application form-field answers.
 *
 * @param {SubAgentInput} input
 * @returns {Promise<SubAgentOutput>}
 */
export async function runFormFields(input) {
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
      diagnostics: { duration_ms: Date.now() - t0, cost_estimate_usd: 0, tokens_used: { input: 0, output: 0, cached: 0 }, model_used: 'claude-haiku-4-5' },
      error: 'cv.md not found at repo root',
    };
  }
  const cvText = rfs.readFileSync(cvPath, 'utf-8');

  const articleDigestPath = join(ROOT, 'article-digest.md');
  const articleDigestText = rfs.existsSync(articleDigestPath) ? rfs.readFileSync(articleDigestPath, 'utf-8') : null;

  // ── 2. Metadata + form questions ────────────────────────────────────────

  const jdText = input?.pack?.jd?.jd_text || input?.pack?.inputs?.jdText || input?.pack?.inputs?.jd_text || '';
  const company = input?.pack?.jd?.company || input?.pack?.inputs?.company || input?.pack?.meta?.company || 'Unknown';
  const role = input?.pack?.jd?.role || input?.pack?.inputs?.role || input?.pack?.meta?.role || 'Unknown';
  const rowId = input?.pack?.meta?.row_id || input?.pack?.inputs?.rowId || 0;
  const hmIntel = input?.context?.hmIntel || {};

  // form questions from input.formQuestions or pack.inputs.formQuestions
  const formQuestions =
    input?.formQuestions ||
    input?.pack?.inputs?.formQuestions ||
    DEFAULT_QUESTIONS;

  // ── 3. Build prompt ─────────────────────────────────────────────────────

  const questionsBlock = formQuestions
    .map((q, i) => {
      const qs = typeof q === 'string' ? q : q.question || String(q);
      const limit = typeof q === 'object' && q.char_limit ? ` (char limit: ${q.char_limit})` : '';
      return `${i + 1}. ${qs}${limit}`;
    })
    .join('\n');

  const digestSection = articleDigestText
    ? `\n\n## article-digest.md (proof points)\n\n${articleDigestText.slice(0, 1200)}`
    : '';
  const hmSection = Object.keys(hmIntel).length
    ? `\n\n## HM-intel\n\n${JSON.stringify(hmIntel, null, 2).slice(0, 400)}`
    : '';

  const userPrompt = [
    `## Company: ${company}`,
    `## Role: ${role}`,
    '',
    '## Application form questions to answer',
    '',
    questionsBlock,
    '',
    '## Job Description',
    '',
    jdText.slice(0, 3500) || '(not available)',
    '',
    '## cv.md (source of truth)',
    '',
    cvText.slice(0, 3500),
    digestSection,
    hmSection,
    '',
    'Answer each question per SYSTEM_PROMPT rules. Return JSON only.',
  ].join('\n');

  // ── 4. LLM call (Haiku first, gpt-5 fallback) ───────────────────────────

  const MAX_COMPLETION_TOKENS = 2000;
  let llmResult = null;
  let llmError = null;
  let modelUsed = 'claude-haiku-4-5';
  let tokensUsed = { input: 0, output: 0, cached: 0 };

  try {
    const r = await callHaikuOrFallback(userPrompt, SYSTEM_PROMPT, MAX_COMPLETION_TOKENS);
    llmResult = { content: r.content, tokens: r.tokens };
    modelUsed = r.modelUsed;
    tokensUsed = { input: r.inputTokens || Math.round(r.tokens * 0.85), output: r.outputTokens || Math.round(r.tokens * 0.15), cached: 0 };
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
      parsed = FormFieldsLlmResponseSchema.parse(JSON.parse(extractJson(llmResult.content)));
      parseError = null;
      break;
    } catch (e) {
      parseError = String(e.message || e);
      if (attempt === 1) {
        try {
          const strictPrompt = `Output ONLY JSON: {"answers":[{"question":"...","answer":"...","char_limit":null,"voice_check_passed":true}],"warnings":[]}.\nContext: ${userPrompt.slice(0, 2000)}`;
          const r = await callHaikuOrFallback(strictPrompt, SYSTEM_PROMPT, MAX_COMPLETION_TOKENS);
          llmResult = { content: r.content, tokens: r.tokens };
          tokensUsed.input += r.inputTokens || Math.round(r.tokens * 0.85);
          tokensUsed.output += r.outputTokens || Math.round(r.tokens * 0.15);
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

  // ── 6. Enforce char limits ───────────────────────────────────────────────

  for (const ans of parsed.answers) {
    if (ans.char_limit && ans.answer.length > ans.char_limit) {
      // Truncate at last sentence boundary within limit
      const truncated = ans.answer.slice(0, ans.char_limit);
      const lastPeriod = truncated.lastIndexOf('.');
      ans.answer = lastPeriod > ans.char_limit * 0.7
        ? truncated.slice(0, lastPeriod + 1)
        : truncated;
      if (!ans.warnings) ans.warnings = [];
      parsed.warnings.push(`Q "${ans.question.slice(0, 50)}…": truncated to ${ans.answer.length}/${ans.char_limit} chars`);
    }
  }

  // ── 7. Write artifacts (O9 dual-path) ───────────────────────────────────

  const companySlug = slugify(company);
  const roleSlug = slugify(role);
  const rowPadded = String(rowId).padStart(3, '0');

  const outDirPrimary = join(ROOT, `data/apply-packs/${rowPadded}-${companySlug}-${roleSlug}`);
  const outDirSecondary = join(ROOT, `data/applications/${rowPadded}-${companySlug}-${roleSlug}`);
  mkdirSync(outDirPrimary, { recursive: true });
  mkdirSync(outDirSecondary, { recursive: true });

  // Write markdown
  const markdown = buildMarkdownArtifact(parsed, company, role);
  const artifactPath = join(outDirPrimary, 'form-fields.md');
  writeFileSync(artifactPath, markdown, 'utf-8');
  writeFileSync(join(outDirSecondary, 'form-fields.md'), markdown, 'utf-8');

  // Write form-fields.json (per spec)
  const jsonPath = join(outDirPrimary, 'form-fields.json');
  const jsonPayload = JSON.stringify({
    company,
    role,
    generated_at: new Date().toISOString(),
    version: '1.0.0',
    predecessor_path: null,
    answers: parsed.answers,
    warnings: parsed.warnings,
  }, null, 2);
  writeFileSync(jsonPath, jsonPayload, 'utf-8');
  writeFileSync(join(outDirSecondary, 'form-fields.json'), jsonPayload, 'utf-8');

  // Decisions log (O9)
  const decisionsLog = buildDecisionsLog(parsed, company, role, modelUsed, tokensUsed);
  writeFileSync(join(outDirSecondary, 'decisions.md'), decisionsLog, 'utf-8');

  // ── 8. Return ────────────────────────────────────────────────────────────

  // Output shape matching orchestrator's form_field_answers contract
  const artifactOutput = parsed.answers.map(a => ({
    question: a.question,
    answer: a.answer,
    char_limit: a.char_limit,
    voice_check_passed: a.voice_check_passed,
  }));

  return {
    stage: STAGE,
    status: 'ok',
    output: artifactOutput,
    diagnostics: {
      duration_ms: Date.now() - t0,
      cost_estimate_usd: estimateCostUsd(tokensUsed),
      tokens_used: tokensUsed,
      model_used: modelUsed,
      questions_answered: parsed.answers.length,
    },
    error: null,
  };
}
