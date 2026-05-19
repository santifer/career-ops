/**
 * lib/strategy-ceiling.mjs — Dynamic per-metric strategy ceiling with 3-5 actions.
 *
 * When a user clicks a score/percentage/gap chip in the dashboard, this module
 * returns the ceiling for that metric + concrete next-actions to close the gap.
 *
 * Exports:
 *   computeStrategyCeiling({ rowId, role, company, metricKey, currentValue, jdText, hmIntel, opts })
 *     → Promise<StrategyCeilingResult>
 *   getCachedStrategy(cacheKey, maxAgeMs) → cached | null
 *   forceRefresh(cacheKey)
 *   renderStrategyCard(result) → HTML string
 *
 * LLM: openai:gpt-5 (gpt-5.5 fallback) via callCouncil, reasoning_effort: medium, max 1500 tokens.
 * Cache: file-backed at data/strategy-cache/{rowId}-{metricKey}.json (24h default).
 * Cost target: $0.04–0.06/generation.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callCouncil } from './council.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_DIR = join(ROOT, 'data', 'strategy-cache');
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

// ── Zod-style inline schema validator ────────────────────────────────────────

/**
 * Validate a parsed strategy response.
 * Returns { ok: true, data } or { ok: false, error: string }
 */
function validateStrategyResponse(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'Not an object' };
  if (typeof obj.current !== 'number') return { ok: false, error: 'current must be number' };
  if (typeof obj.ceiling !== 'number') return { ok: false, error: 'ceiling must be number' };
  if (typeof obj.gap_pct !== 'number') return { ok: false, error: 'gap_pct must be number' };
  if (!Array.isArray(obj.actions)) return { ok: false, error: 'actions must be array' };
  if (obj.actions.length < 3 || obj.actions.length > 5) {
    return { ok: false, error: `actions must be 3-5 items, got ${obj.actions.length}` };
  }
  for (const [i, a] of obj.actions.entries()) {
    if (typeof a.title !== 'string' || !a.title) return { ok: false, error: `action[${i}].title missing` };
    if (typeof a.what !== 'string' || !a.what) return { ok: false, error: `action[${i}].what missing` };
    if (typeof a.why !== 'string' || !a.why) return { ok: false, error: `action[${i}].why missing` };
    if (!['low', 'medium', 'high'].includes(a.effort)) return { ok: false, error: `action[${i}].effort must be low|medium|high` };
    if (typeof a.expected_lift_pct !== 'number') return { ok: false, error: `action[${i}].expected_lift_pct must be number` };
  }
  return { ok: true, data: obj };
}

// ── Corpus hash helper (for cache invalidation) ──────────────────────────────

function _computeCorpusHash() {
  const files = [
    join(ROOT, 'cv.md'),
    join(ROOT, 'article-digest.md'),
  ];
  const h = createHash('sha1');
  for (const f of files) {
    try { h.update(readFileSync(f, 'utf-8')); } catch { /* not found — skip */ }
  }
  return h.digest('hex').slice(0, 12);
}

// ── File-backed cache ─────────────────────────────────────────────────────────

/** Build the cache key from inputs (deterministic). */
export function buildCacheKey({ rowId, metricKey, company, role }) {
  const corpusHash = _computeCorpusHash();
  return `${rowId}-${metricKey}-${(company ?? '').toLowerCase().replace(/\s+/g, '-')}-${(role ?? '').toLowerCase().replace(/\s+/g, '-').slice(0, 30)}-${corpusHash}`;
}

/** Return cached result if present and fresh. */
export function getCachedStrategy(cacheKey, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  if (!existsSync(CACHE_DIR)) return null;
  const filePath = join(CACHE_DIR, `${cacheKey}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
    const age = Date.now() - (raw.generated_at ?? 0);
    if (age > maxAgeMs) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Force-invalidate a cache entry so the next call re-generates. */
export function forceRefresh(cacheKey) {
  const filePath = join(CACHE_DIR, `${cacheKey}.json`);
  if (existsSync(filePath)) {
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
      raw.generated_at = 0; // expire immediately
      writeFileSync(filePath, JSON.stringify(raw, null, 2));
    } catch { /* ignore */ }
  }
}

function _writeCache(cacheKey, data) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const filePath = join(CACHE_DIR, `${cacheKey}.json`);
  writeFileSync(filePath, JSON.stringify({ ...data, generated_at: Date.now() }, null, 2));
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function _buildPrompt({ role, company, metricKey, currentValue, jdText, hmIntel }) {
  const jdSnippet = jdText ? jdText.slice(0, 1500) : '(not provided)';
  const hmSnippet = hmIntel && Object.keys(hmIntel).length > 0
    ? JSON.stringify(hmIntel).slice(0, 600)
    : '(not provided)';
  // γ GAMMA fix 2026-05-19 — replaced hardcoded "Today is 2026-05-17 PT" with
  // a live system-clock value so LLM "in the last X days" reasoning anchors
  // to the current day rather than the day this prompt was written.
  const todayIso = new Date().toISOString().slice(0, 10);

  return [
    `You are a senior career strategist. Today is ${todayIso} PT.`,
    `The candidate is Mitchell Williams: senior AI practitioner, brand "rare combination, ships fast," targeting $250K–$320K TC at pre-IPO frontier-AI labs.`,
    ``,
    `Task: for the metric "${metricKey}" with current value ${currentValue}%, compute the realistic ceiling and 3–5 next-actions to close the gap.`,
    ``,
    `Context:`,
    `  - Role: ${role ?? 'unknown'}`,
    `  - Company: ${company ?? 'unknown'}`,
    `  - JD snippet: ${jdSnippet}`,
    `  - HM intel: ${hmSnippet}`,
    ``,
    `Respond ONLY with valid JSON matching this schema exactly:`,
    `{`,
    `  "current": <number 0-100, same as input ${currentValue}>,`,
    `  "ceiling": <number 0-100, realistic achievable ceiling given context>,`,
    `  "gap_pct": <number, ceiling minus current>,`,
    `  "actions": [`,
    `    {`,
    `      "title": "<short imperative phrase>",`,
    `      "what": "<1-2 sentence concrete action>",`,
    `      "why": "<1 sentence on why this moves the metric>",`,
    `      "effort": "low" | "medium" | "high",`,
    `      "expected_lift_pct": <number, estimated pct-point improvement>,`,
    `      "corpus_ref": "<optional: cv.md section or story-bank entry this leverages>",`,
    `      "citation": "<optional: source/data point>"`,
    `    }`,
    `  ],`,
    `  "reasoning": "<1-2 sentences explaining ceiling rationale>"`,
    `}`,
    `Rules: 3–5 actions. expected_lift_pct sum should not exceed gap_pct. Be specific to the role and company — no generic advice.`,
    `Return ONLY the JSON object, no markdown fences.`,
  ].join('\n');
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * computeStrategyCeiling — compute ceiling + actions for a metric chip.
 *
 * @param {object} params
 *   rowId        {number|string}  — application row ID (for cache key)
 *   role         {string}         — job title
 *   company      {string}         — company name
 *   metricKey    {string}         — e.g. 'interview_likelihood', 'fit_score'
 *   currentValue {number}         — current value 0–100
 *   jdText       {string?}        — raw JD text (will be trimmed to 1500 chars)
 *   hmIntel      {object?}        — hiring-manager intel object
 *   opts         {object}         — { maxAgeMs?, llmClient?, dry? }
 *
 * @returns {Promise<StrategyCeilingResult>}
 */
export async function computeStrategyCeiling({
  rowId,
  role,
  company,
  metricKey,
  currentValue,
  jdText = '',
  hmIntel = {},
  opts = {},
} = {}) {
  const {
    maxAgeMs = DEFAULT_MAX_AGE_MS,
    llmClient = null,
    dry = false,
  } = opts;

  const cacheKey = buildCacheKey({ rowId, metricKey, company, role });

  // Check cache first
  const cached = getCachedStrategy(cacheKey, maxAgeMs);
  if (cached && !dry) return { ...cached, cache_key: cacheKey, _fromCache: true };

  if (dry) {
    // Dry-run: return a deterministic stub
    return {
      current: currentValue,
      ceiling: Math.min(100, currentValue + 30),
      gap_pct: 30,
      actions: [
        { title: 'Dry-run placeholder', what: 'No LLM call in dry mode.', why: 'Testing.', effort: 'low', expected_lift_pct: 5 },
        { title: 'Review JD', what: 'Read the JD carefully.', why: 'Understand requirements.', effort: 'low', expected_lift_pct: 5 },
        { title: 'Tailor narrative', what: 'Update your narrative.', why: 'Match role framing.', effort: 'medium', expected_lift_pct: 10 },
      ],
      generated_at: Date.now(),
      cache_key: cacheKey,
      _dry: true,
    };
  }

  const prompt = _buildPrompt({ role, company, metricKey, currentValue, jdText, hmIntel });

  // LLM call with 1 retry on Zod validation failure
  const client = llmClient ?? {
    call: async (p) => {
      const r = await callCouncil({
        prompt: p,
        models: ['openai:gpt-5'],
        opts: { maxTokens: 1500 },
      });
      // gpt-5 fallback to o1 handled inside council.mjs
      const hit = r.results.find(x => !x.error);
      if (!hit) throw new Error('No successful council response: ' + (r.results[0]?.error ?? 'unknown'));
      return hit.content;
    },
  };

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let raw = '';
    try {
      raw = await client.call(prompt);
    } catch (err) {
      throw new Error(`LLM call failed: ${err.message}`);
    }

    // Extract JSON from response (handles stray prose/fences)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      lastError = 'LLM returned no JSON object';
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
      lastError = `JSON parse error: ${err.message}`;
      continue;
    }

    // Inject current value if model didn't echo it
    if (parsed.current == null) parsed.current = currentValue;
    // Recompute gap_pct if missing
    if (parsed.gap_pct == null && parsed.ceiling != null) {
      parsed.gap_pct = Math.max(0, parsed.ceiling - parsed.current);
    }

    const validation = validateStrategyResponse(parsed);
    if (!validation.ok) {
      lastError = `Schema validation failed: ${validation.error}`;
      continue;
    }

    const result = {
      current: parsed.current,
      ceiling: parsed.ceiling,
      gap_pct: parsed.gap_pct,
      actions: parsed.actions,
      reasoning: parsed.reasoning ?? null,
      generated_at: Date.now(),
      cache_key: cacheKey,
    };

    _writeCache(cacheKey, result);
    return result;
  }

  // Both attempts failed — return degraded result rather than throwing
  const degraded = {
    current: currentValue,
    ceiling: Math.min(100, currentValue + 20),
    gap_pct: 20,
    actions: [
      {
        title: 'LLM unavailable — manual review needed',
        what: 'Check the JD requirements against your CV and story bank.',
        why: 'Automated ceiling computation failed; fallback to manual.',
        effort: 'medium',
        expected_lift_pct: 10,
      },
      {
        title: 'Strengthen alignment narrative',
        what: 'Update your cover letter to mirror the top 3 JD requirements.',
        why: 'Direct keyword alignment improves ATS and HM match scores.',
        effort: 'medium',
        expected_lift_pct: 8,
      },
      {
        title: 'Activate HM warm path',
        what: 'Identify a 1st- or 2nd-degree connection at the company via LinkedIn.',
        why: 'Referrals bypass cold ATS screening and increase interview rate 3–5×.',
        effort: 'high',
        expected_lift_pct: 15,
      },
    ],
    generated_at: Date.now(),
    cache_key: cacheKey,
    _degraded: true,
    _last_error: lastError,
  };

  // Still cache degraded result (short TTL — 1 hour so retry is cheap)
  _writeCache(cacheKey, { ...degraded, generated_at: Date.now() - (DEFAULT_MAX_AGE_MS - 60 * 60 * 1000) });
  return degraded;
}

// ── Renderer ─────────────────────────────────────────────────────────────────

/**
 * renderStrategyCard(result) → HTML string for dashboard drawer popout.
 *
 * @param {StrategyCeilingResult} result
 * @returns {string} HTML
 */
export function renderStrategyCard(result) {
  const { current, ceiling, gap_pct, actions = [], reasoning, _fromCache, _degraded } = result;

  const gapBar = Math.min(100, Math.max(0, gap_pct ?? 0));
  const ceilPct = Math.min(100, Math.max(0, ceiling ?? current));
  const currPct = Math.min(100, Math.max(0, current ?? 0));

  const effortBadge = (effort) => {
    const map = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444' };
    return `<span style="display:inline-block;padding:1px 6px;border-radius:10px;font-size:10px;font-weight:600;background:${map[effort] ?? '#6b7280'};color:#fff;">${effort}</span>`;
  };

  const actionItems = actions.map((a, i) => `
  <li style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #f3f4f6;">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
      <span style="font-size:12px;font-weight:600;color:#111;">${i + 1}. ${a.title}</span>
      ${effortBadge(a.effort)}
      <span style="margin-left:auto;font-size:11px;color:#6b7280;">+${a.expected_lift_pct}%</span>
    </div>
    <p style="margin:0 0 3px;font-size:12px;color:#374151;">${a.what}</p>
    <p style="margin:0;font-size:11px;color:#6b7280;font-style:italic;">${a.why}</p>
    ${a.corpus_ref ? `<p style="margin:3px 0 0;font-size:10px;color:#9ca3af;">Ref: ${a.corpus_ref}</p>` : ''}
  </li>`).join('');

  return `
<div class="strategy-card" style="font-family:system-ui;max-width:420px;padding:14px 16px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08);">
  ${_degraded ? `<div style="font-size:11px;color:#f59e0b;margin-bottom:8px;">⚠ LLM unavailable — showing fallback actions.</div>` : ''}
  ${_fromCache ? `<div style="font-size:10px;color:#9ca3af;margin-bottom:6px;">Cached result</div>` : ''}

  <!-- Progress bar -->
  <div style="margin-bottom:12px;">
    <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-bottom:4px;">
      <span>Current: <strong style="color:#111;">${currPct}%</strong></span>
      <span>Ceiling: <strong style="color:#111;">${ceilPct}%</strong></span>
    </div>
    <div style="background:#f3f4f6;border-radius:4px;height:8px;overflow:hidden;position:relative;">
      <div style="background:#3b82f6;height:100%;width:${currPct}%;border-radius:4px;"></div>
      <div style="background:#22c55e;height:100%;width:${gapBar}%;margin-left:${currPct}%;border-radius:4px;position:absolute;top:0;left:${currPct}%;opacity:0.5;"></div>
    </div>
    ${reasoning ? `<p style="margin:6px 0 0;font-size:11px;color:#6b7280;font-style:italic;">${reasoning}</p>` : ''}
  </div>

  <!-- Actions -->
  <ul style="list-style:none;padding:0;margin:0;">
    ${actionItems}
  </ul>
</div>`.trim();
}
