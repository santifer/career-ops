/**
 * lib/wealth-lens.mjs — Universal comp-framing-through-wealth-trajectory lens.
 *
 * Evaluates any comp object against Mitchell's wealth-generation goals:
 * - Pre-IPO equity-weighted at AI-native / frontier labs
 * - Total-comp floor $250K–$320K target, $175K absolute walk-line
 * - Ranks wealth potential: equity upside > base growth > market positioning
 *
 * Exports:
 *   applyWealthLens(comp, role, opts) → WealthLensResult
 *   renderWealthLensCard(result) → HTML string
 *   getWealthCeiling(role, opts) → WealthCeilingResult
 *
 * LLM enrichment (opts.live = true): uses callCouncil with anthropic:claude-haiku-4-5.
 * Results cached in-memory for the process lifetime.
 */

import { callCouncil } from './council.mjs';

// ── In-memory cache for LLM enrichment calls ────────────────────────────────
const _cache = new Map(); // cacheKey → { result, expiresAt }

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.result;
}
function _cacheSet(key, result, ttlMs = 30 * 60 * 1000) {
  _cache.set(key, { result, expiresAt: Date.now() + ttlMs });
}

// ── Wealth-trajectory constants (from calibration brief 2026-05-16) ──────────
const FLOOR_ABSOLUTE = 175_000;   // walk regardless of equity
const FLOOR_PREFERRED = 200_000;  // equity-trade floor (won't drop below)
const TC_TARGET_LOW  = 250_000;
const TC_TARGET_HIGH = 320_000;

/**
 * Deterministic wealth-alignment classifier.
 * Returns 'wealth-aligned' | 'wealth-mixed' | 'wealth-misaligned'
 * + a why string and ceiling_estimate.
 *
 * @param {object} comp   - { base?, bonus_pct?, equity_annual_vest?, equity_disclosed?, total_comp? }
 * @param {object} role   - { company?, ai_native?, pre_ipo?, stage?, ipo_trajectory? }
 */
function _classifyWealth(comp, role) {
  const base = comp.base ?? 0;
  const bonusPct = comp.bonus_pct ?? 0;
  const equityVest = comp.equity_annual_vest ?? 0;
  const totalComp = comp.total_comp ?? (base * (1 + bonusPct / 100) + equityVest);

  const isAiNative = Boolean(role.ai_native);
  const isPreIpo   = Boolean(role.pre_ipo);
  const stage      = role.stage ?? 'unknown';
  const equityDisclosed = comp.equity_disclosed !== false; // undefined = assume not disclosed

  // Hard floor check
  if (base > 0 && base < FLOOR_ABSOLUTE) {
    return {
      signal: 'wealth-misaligned',
      why: `Base $${base.toLocaleString()} is below absolute walk-line of $${FLOOR_ABSOLUTE.toLocaleString()}. Pass regardless of equity.`,
      ceiling_estimate: null,
    };
  }

  // Undisclosed equity at pre-IPO AI-native company — could be the biggest upside signal
  if (!equityDisclosed && isPreIpo && isAiNative) {
    return {
      signal: 'wealth-mixed',
      why: `Equity undisclosed at pre-IPO AI-native company — ceiling depends entirely on valuation trajectory and grant size. Request equity details before advancing.`,
      ceiling_estimate: null,
    };
  }

  // Total comp in target range + equity upside → aligned
  if (totalComp >= TC_TARGET_LOW && (isPreIpo || isAiNative)) {
    const ceiling = isPreIpo
      ? Math.round(totalComp * 3.5) // pre-IPO 3.5× upside on vest + growth
      : Math.round(totalComp * 1.8);
    return {
      signal: 'wealth-aligned',
      why: `TC ~$${Math.round(totalComp).toLocaleString()} hits $${TC_TARGET_LOW.toLocaleString()}–$${TC_TARGET_HIGH.toLocaleString()} target range. ${isPreIpo ? 'Pre-IPO equity multiplies ceiling.' : 'AI-native trajectory strengthens comp growth.'}`,
      ceiling_estimate: ceiling,
    };
  }

  // Base in range but TC unknown / below target
  if (base >= FLOOR_PREFERRED && base < TC_TARGET_LOW && !equityDisclosed) {
    return {
      signal: 'wealth-mixed',
      why: `Base $${base.toLocaleString()} is workable but TC is unclear. Push for equity disclosure and total-comp modeling before deciding.`,
      ceiling_estimate: null,
    };
  }

  if (totalComp > 0 && totalComp < TC_TARGET_LOW) {
    return {
      signal: 'wealth-misaligned',
      why: `TC ~$${Math.round(totalComp).toLocaleString()} is below $${TC_TARGET_LOW.toLocaleString()} target. Only proceed if pre-IPO equity story is compelling and disclosed.`,
      ceiling_estimate: isPreIpo ? Math.round(totalComp * 4) : null,
    };
  }

  // Default for fully-undisclosed comp
  return {
    signal: 'wealth-mixed',
    why: `Insufficient comp data to classify. Disclose base + equity for a definitive read.`,
    ceiling_estimate: null,
  };
}

/**
 * applyWealthLens(comp, role, opts) → WealthLensResult
 *
 * @param {object} comp   - Comp data (see _classifyWealth)
 * @param {object} role   - Role context (see _classifyWealth)
 * @param {object} opts   - { live?: boolean, llmClient?: object, cacheTtlMs?: number }
 *
 * @returns {Promise<WealthLensResult>}
 *   { displayed, signal, why, ceiling_estimate?, refresh_after_ms?, _fromCache?, _model? }
 */
export async function applyWealthLens(comp = {}, role = {}, opts = {}) {
  const { live = false, llmClient = null, cacheTtlMs = 30 * 60 * 1000 } = opts;

  // Deterministic classification always runs first
  const base = comp.base ?? 0;
  const bonusPct = comp.bonus_pct ?? 0;
  const equityVest = comp.equity_annual_vest ?? 0;
  const totalComp = comp.total_comp ?? (base ? base * (1 + bonusPct / 100) + equityVest : 0);

  const { signal, why, ceiling_estimate } = _classifyWealth(comp, role);

  const compStr = totalComp > 0
    ? `$${Math.round(totalComp).toLocaleString()} TC`
    : base > 0
      ? `$${base.toLocaleString()} base (equity undisclosed)`
      : 'Comp undisclosed';

  const alignLabel = {
    'wealth-aligned': 'Wealth-Aligned',
    'wealth-mixed': 'Wealth-Mixed',
    'wealth-misaligned': 'Wealth-Misaligned',
  }[signal];

  const displayed = `${compStr} · ${alignLabel}`;

  // Fast path: no LLM enrichment requested
  if (!live) {
    return { displayed, signal, why, ceiling_estimate, refresh_after_ms: null };
  }

  // LLM enrichment via direct Anthropic Haiku call (council.mjs doesn't register haiku as a provider)
  const cacheKey = `wealth-lens:${JSON.stringify({ comp, role })}`;
  const cached = _cacheGet(cacheKey);
  if (cached) return { ...cached, _fromCache: true };

  const company = role.company ?? 'this company';
  const stageLabel = role.pre_ipo ? 'pre-IPO' : (role.stage ?? 'unknown stage');
  const aiLabel = role.ai_native ? 'AI-native' : 'non-AI-native';

  const todayIso = new Date().toISOString().slice(0, 10);
  const prompt = [
    `You are a compensation analyst focused on wealth generation for a senior AI professional.`,
    `Today is ${todayIso} PT. The candidate has a $175K absolute walk-line, $250K–$320K TC target, and prefers pre-IPO equity at frontier-AI labs (Series C+).`,
    ``,
    `Company: ${company} (${stageLabel}, ${aiLabel})`,
    `Comp data: ${JSON.stringify(comp)}`,
    `Initial classification: ${signal} — ${why}`,
    `${ceiling_estimate ? `Ceiling estimate: $${ceiling_estimate.toLocaleString()}` : ''}`,
    ``,
    `Enrich this classification with: (1) current valuation context if known, (2) a tighter ceiling range based on typical equity grants at similar-stage companies, (3) one concrete negotiation lever.`,
    `Respond in JSON: { "enriched_why": "...", "ceiling_low": number_or_null, "ceiling_high": number_or_null, "negotiation_lever": "..." }`,
    `Keep enriched_why under 2 sentences. Be specific; avoid generic advice.`,
  ].join('\n');

  let enrichedResult = null;
  try {
    // Allow injecting a mock client in tests; default uses Anthropic Haiku directly
    const client = llmClient ?? {
      call: async (p) => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
        let r;
        try {
          r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5',
              max_tokens: 300,
              messages: [{ role: 'user', content: p }],
            }),
            signal: AbortSignal.timeout(120_000), // Phase A.0 hardening — LLM API timeout
          });
        } catch (e) {
          if (e.name === 'TimeoutError' || e.name === 'AbortError') {
            throw new Error('Anthropic Haiku TIMEOUT after 120s — slow upstream. Not retrying.');
          }
          throw e;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const j = await r.json();
        return j.content?.[0]?.text ?? '';
      },
    };

    const raw = await client.call(prompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      enrichedResult = {
        displayed,
        signal,
        why: parsed.enriched_why ?? why,
        ceiling_estimate: parsed.ceiling_high ?? parsed.ceiling_low ?? ceiling_estimate,
        ceiling_range: parsed.ceiling_low && parsed.ceiling_high
          ? [parsed.ceiling_low, parsed.ceiling_high]
          : null,
        negotiation_lever: parsed.negotiation_lever ?? null,
        refresh_after_ms: cacheTtlMs,
        _model: 'anthropic:claude-haiku-4-5',
      };
    }
  } catch (err) {
    // LLM failure: fall through to deterministic result + flag
    enrichedResult = null;
  }

  const result = enrichedResult ?? {
    displayed,
    signal,
    why,
    ceiling_estimate,
    refresh_after_ms: cacheTtlMs,
    _llm_error: true,
  };

  _cacheSet(cacheKey, result, cacheTtlMs);
  return result;
}

/**
 * renderWealthLensCard(result) → HTML string for comp chip popout
 *
 * @param {WealthLensResult} result
 * @returns {string} HTML
 */
export function renderWealthLensCard(result) {
  const { displayed, signal, why, ceiling_estimate, ceiling_range, negotiation_lever } = result;

  const signalColor = {
    'wealth-aligned':    '#22c55e', // green-500
    'wealth-mixed':      '#f59e0b', // amber-500
    'wealth-misaligned': '#ef4444', // red-500
  }[signal] ?? '#6b7280';

  const ceilStr = ceiling_range
    ? `$${ceiling_range[0].toLocaleString()}–$${ceiling_range[1].toLocaleString()}`
    : ceiling_estimate
      ? `~$${ceiling_estimate.toLocaleString()}`
      : 'Unknown';

  return `
<div class="wealth-lens-card" style="font-family:system-ui;max-width:340px;padding:12px 14px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08);">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${signalColor};flex-shrink:0;"></span>
    <span style="font-size:13px;font-weight:600;color:#111;">${displayed}</span>
  </div>
  <p style="margin:0 0 6px;font-size:12px;color:#374151;line-height:1.45;">${why}</p>
  <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;border-top:1px solid #f3f4f6;padding-top:6px;margin-top:6px;">
    <span>Wealth ceiling: <strong style="color:#111;">${ceilStr}</strong></span>
    ${negotiation_lever ? `<span style="max-width:160px;text-align:right;">${negotiation_lever}</span>` : ''}
  </div>
</div>`.trim();
}

/**
 * getWealthCeiling(role, opts) → WealthCeilingResult
 *
 * Returns current + peer-benchmarked comp ceiling for a given role.
 * Uses lib/peer-context.mjs if available; otherwise deterministic stub.
 *
 * @param {object} role   - { title, company, level?, ai_native?, pre_ipo?, stage?, base?, equity_annual_vest? }
 * @param {object} opts   - { live?: boolean, llmClient? }
 * @returns {Promise<WealthCeilingResult>}
 */
export async function getWealthCeiling(role = {}, opts = {}) {
  const { live = false, llmClient = null } = opts;

  // Try peer-context lib if present
  let peerContext = null;
  try {
    const mod = await import('./peer-context.mjs');
    peerContext = mod;
  } catch {
    // Not available — fall back to deterministic stub
  }

  const base = role.base ?? 0;
  const equityVest = role.equity_annual_vest ?? 0;
  const current = base + equityVest;

  // Deterministic peer benchmarks (AI PM/PgM/SA roles 2026, Series C+ companies)
  // Sources: Levels.fyi + Glassdoor + calibration brief ranges
  let benchmarks;
  if (peerContext && typeof peerContext.getPeerContext === 'function') {
    const ctx = peerContext.getPeerContext('comp', current > 0 ? current : null, { company: role.company });
    const peerValues = (ctx.peerCompanies || []).map(p => p.value).filter(v => v > 0).sort((a, b) => b - a);
    benchmarks = peerValues.length >= 2
      ? {
          p50: peerValues[Math.floor(peerValues.length * 0.5)] || 265_000,
          p90: peerValues[Math.floor(peerValues.length * 0.1)] || 380_000,
        }
      : {
          p50: current > 0 ? Math.max(current, 240_000) : 265_000,
          p90: current > 0 ? Math.max(current * 1.35, 340_000) : 380_000,
        };
  } else {
    benchmarks = {
      p50: current > 0 ? Math.max(current, 240_000) : 265_000,
      p90: current > 0 ? Math.max(current * 1.35, 340_000) : 380_000,
    };
  }

  const isPreIpo = Boolean(role.pre_ipo);
  const multiplier = isPreIpo ? 3.2 : 1.6;
  const ceiling = Math.round((benchmarks.p90 ?? benchmarks.p50 ?? 300_000) * multiplier);

  const assumptions = [
    `Role level: ${role.level ?? 'senior IC'}`,
    `Stage: ${role.pre_ipo ? 'pre-IPO' : (role.stage ?? 'unknown')}`,
    `AI-native: ${Boolean(role.ai_native)}`,
    `Equity multiplier: ${multiplier}× on P90 peer`,
    `Benchmark source: ${peerContext ? 'peer-context.mjs' : 'deterministic stub (levels.fyi 2026 estimates)'}`,
  ];

  if (!live) {
    return {
      current,
      p50_peer: benchmarks.p50 ?? null,
      p90_peer: benchmarks.p90 ?? null,
      ceiling_under_assumptions: ceiling,
      assumptions,
    };
  }

  // LLM enrichment for live mode
  const cacheKey = `wealth-ceiling:${JSON.stringify(role)}`;
  const cached = _cacheGet(cacheKey);
  if (cached) return { ...cached, _fromCache: true };

  const todayIso2 = new Date().toISOString().slice(0, 10);
  const prompt = [
    `You are a comp benchmarking specialist for AI roles. Today is ${todayIso2} PT.`,
    `Role: ${role.title ?? 'Senior AI role'} at ${role.company ?? 'a company'} (${isPreIpo ? 'pre-IPO' : (role.stage ?? 'public')}).`,
    `Current TC estimate: $${current > 0 ? current.toLocaleString() : 'unknown'}.`,
    ``,
    `Return JSON: { "p50_peer": number, "p90_peer": number, "ceiling_under_assumptions": number, "extra_assumption": "..." }`,
    `Use Levels.fyi + Glassdoor norms for late-2025/2026. Be specific to the role and company stage.`,
    `ceiling_under_assumptions = realistic 4-year total wealth including pre-IPO equity scenarios.`,
  ].join('\n');

  try {
    const client = llmClient ?? {
      call: async (p) => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
        let r;
        try {
          r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5',
              max_tokens: 250,
              messages: [{ role: 'user', content: p }],
            }),
            signal: AbortSignal.timeout(120_000), // Phase A.0 hardening — LLM API timeout
          });
        } catch (e) {
          if (e.name === 'TimeoutError' || e.name === 'AbortError') {
            throw new Error('Anthropic Haiku TIMEOUT after 120s — slow upstream. Not retrying.');
          }
          throw e;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const j = await r.json();
        return j.content?.[0]?.text ?? '';
      },
    };
    const raw = await client.call(prompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const result = {
        current,
        p50_peer: parsed.p50_peer ?? benchmarks.p50,
        p90_peer: parsed.p90_peer ?? benchmarks.p90,
        ceiling_under_assumptions: parsed.ceiling_under_assumptions ?? ceiling,
        assumptions: [...assumptions, parsed.extra_assumption].filter(Boolean),
        _model: 'anthropic:claude-haiku-4-5',
      };
      _cacheSet(cacheKey, result);
      return result;
    }
  } catch {
    // fall through
  }

  const fallback = { current, p50_peer: benchmarks.p50 ?? null, p90_peer: benchmarks.p90 ?? null, ceiling_under_assumptions: ceiling, assumptions };
  _cacheSet(cacheKey, fallback);
  return fallback;
}
