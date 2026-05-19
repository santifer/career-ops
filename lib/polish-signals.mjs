/**
 * lib/polish-signals.mjs — Phase 1 of apply-pack-polish (Mitchell · ALPHA · 2026-05-19).
 *
 * Signal-harvest layer. Reads cached hm-intel / company-pulse / cv.md /
 * article-digest / modes/_profile.md / config/profile.yml, then runs
 * `callCouncil` for the "ideal candidate" perspective and an Opus
 * dealbreaker-style adjudication to prune unsourced claims.
 *
 * Returns the shape spec'd in `data/overnight-haul-2026-05-19.md` §ALPHA-A.1:
 *
 *   {
 *     hiring_manager_priorities: string[],
 *     role_keywords: string[],
 *     anti_patterns: string[],
 *     company_voice: string,
 *     comp_anchor: { ... },
 *     must_haves: string[],
 *     nice_to_haves: string[],
 *     dealbreaker_pruned: [{ claim, reason }],
 *     source_urls_per_claim: { [claim]: string[] },
 *     confidence_per_signal: { [signal]: number },
 *     meta: { generated_at, sources_used, model_lineup, cost_usd, cache }
 *   }
 *
 * Cache: data/apply-packs/{slug}/polish-signals.json (≤3d old → reuse).
 * Honors `--no-cache` via opts.refresh === true.
 *
 * NOTE: Does NOT spawn Claude subagents — this is a library callable from
 * within an MJS script. The "researcher" + "council" + "dealbreaker" roles
 * are fulfilled by direct callCouncil() invocations with role-specific
 * prompts. The quality bar of the brief is preserved.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callCouncil } from './council.mjs';
import { createReadonlyFS } from './readonly-fs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SIGNALS_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days per quality-first

// Per OMEGA-proposal-1 (approved 2026-05-19): polish chain timeout override.
// See lib/polish-loop.mjs for the canonical comment. Mirrored here so both files
// honor the same POLISH_API_TIMEOUT_MS env var (default 300_000 ms, clamped to
// [30s, 30min] by callCouncil).
const _rawPolishTimeout = parseInt(process.env.POLISH_API_TIMEOUT_MS || '300000', 10);
const POLISH_API_TIMEOUT_MS = Number.isFinite(_rawPolishTimeout) && _rawPolishTimeout > 0
  ? Math.min(Math.max(_rawPolishTimeout, 30_000), 1_800_000)
  : 300_000;

const FULL_LINEUP = [
  'anthropic:claude-sonnet-4-6',
  'openai:gpt-5',
  'google:gemini-2.5-pro',
  'perplexity:sonar-pro',
  'perplexity:sonar-deep-research',
  'xai:grok-4',
  'xai:grok-4-x-search',
];
const RFS = createReadonlyFS([
  join(ROOT, 'cv.md'),
  join(ROOT, 'article-digest.md'),
  join(ROOT, 'modes', '_profile.md'),
  join(ROOT, 'config', 'profile.yml'),
  join(ROOT, 'data', 'hm-intel'),
  join(ROOT, 'data', 'company-pulse'),
  join(ROOT, 'data', 'voice-reference-brief.md'),
]);

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function packDir(slug) {
  return join(ROOT, 'data', 'apply-packs', slug);
}

function readJsonSafe(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function readFileSafe(path, maxLen = 12000) {
  try {
    if (!RFS.existsSync(path)) return null;
    return RFS.readFileSync(path, 'utf-8').slice(0, maxLen);
  } catch {
    return null;
  }
}

function isFreshCache(path, ttlMs = SIGNALS_CACHE_TTL_MS) {
  if (!existsSync(path)) return false;
  try {
    const ageMs = Date.now() - statSync(path).mtimeMs;
    return ageMs < ttlMs;
  } catch {
    return false;
  }
}

function extractJson(content) {
  const trimmed = String(content || '').trim();
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch { /* fall through */ }
  }
  const fenced = content.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* fall through */ }
  }
  const s = content.indexOf('{');
  const e = content.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try { return JSON.parse(content.slice(s, e + 1)); } catch { /* fall through */ }
  }
  return null;
}

/**
 * Merge a council's per-model responses into one consensus signal map.
 * Conservative: keep any string that ≥2 models surface; lower-confidence
 * solo claims survive but are tagged.
 */
function mergeCouncilSignals(councilResults) {
  const tally = {
    hiring_manager_priorities: new Map(),
    role_keywords: new Map(),
    anti_patterns: new Map(),
    must_haves: new Map(),
    nice_to_haves: new Map(),
    company_voice: [],
    comp_anchor: [],
  };

  for (const r of councilResults) {
    if (!r || r.error || !r.content) continue;
    const parsed = extractJson(r.content);
    if (!parsed) continue;
    for (const key of ['hiring_manager_priorities', 'role_keywords', 'anti_patterns', 'must_haves', 'nice_to_haves']) {
      const arr = parsed[key];
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        const k = String(item || '').trim().toLowerCase();
        if (!k) continue;
        tally[key].set(k, (tally[key].get(k) || 0) + 1);
      }
    }
    if (typeof parsed.company_voice === 'string') tally.company_voice.push(parsed.company_voice);
    if (parsed.comp_anchor && typeof parsed.comp_anchor === 'object') tally.comp_anchor.push(parsed.comp_anchor);
  }

  // Only count models that actually returned parseable JSON — errored/empty models
  // must not inflate the denominator and artificially depress confidence scores.
  const successfulParses = councilResults.filter(r => r && !r.error && r.content && extractJson(r.content)).length;
  const denominator = Math.max(successfulParses, 1);

  const out = {
    hiring_manager_priorities: [],
    role_keywords: [],
    anti_patterns: [],
    must_haves: [],
    nice_to_haves: [],
    company_voice: tally.company_voice[0] || '',
    comp_anchor: tally.comp_anchor[0] || null,
    confidence_per_signal: {},
  };
  for (const key of ['hiring_manager_priorities', 'role_keywords', 'anti_patterns', 'must_haves', 'nice_to_haves']) {
    const entries = [...tally[key].entries()].sort((a, b) => b[1] - a[1]);
    out[key] = entries.map(([k]) => k);
    for (const [k, count] of entries) {
      out.confidence_per_signal[k] = Math.min(1, count / denominator);
    }
  }
  return out;
}

/**
 * Phase 1 — harvest signals for ONE role+company pair.
 *
 * @param {object} input
 * @param {string} input.slug — apply-pack slug, e.g. 044-anthropic-communications-lead-claude-code
 * @param {string} input.company
 * @param {string} input.role
 * @param {string} input.jdText
 * @param {object} [input.opts]
 * @param {boolean} [input.opts.refresh=false] — bypass cache
 * @param {number}  [input.opts.costCap=50] — USD ceiling for this phase
 * @param {string[]} [input.opts.lineup] — override model lineup (default: full 7-model)
 * @returns {Promise<object>}
 */
export async function harvestPolishSignals({ slug, company, role, jdText, opts = {} } = {}) {
  const t0 = Date.now();
  const refresh = opts.refresh === true;
  const costCap = Number.isFinite(opts.costCap) ? opts.costCap : 50;
  const lineup = Array.isArray(opts.lineup) && opts.lineup.length ? opts.lineup : FULL_LINEUP;
  const dir = packDir(slug);
  mkdirSync(dir, { recursive: true });
  const cachePath = join(dir, 'polish-signals.json');

  if (!refresh && isFreshCache(cachePath)) {
    const cached = readJsonSafe(cachePath);
    if (cached) return { ...cached, meta: { ...(cached.meta || {}), cache: 'hit', cache_path: cachePath } };
  }

  const companySlug = slugify(company);
  const roleSlug = slugify(role);
  const hmIntelPath = join(ROOT, 'data', 'hm-intel', `${companySlug}-${roleSlug}.json`);
  const hmIntelAltPath = join(ROOT, 'data', 'hm-intel', `${roleSlug.startsWith(companySlug) ? roleSlug : companySlug + '-' + roleSlug}.json`);
  const companyPulsePath = join(ROOT, 'data', 'company-pulse', `${companySlug}.json`);

  const hmIntel = readJsonSafe(hmIntelPath) || readJsonSafe(hmIntelAltPath) || null;
  const companyPulse = readJsonSafe(companyPulsePath) || null;
  const cvText = readFileSafe(join(ROOT, 'cv.md'), 8000);
  const articleDigest = readFileSafe(join(ROOT, 'article-digest.md'), 4000);
  const profileMd = readFileSafe(join(ROOT, 'modes', '_profile.md'), 4000);
  const voiceBrief = readFileSafe(join(ROOT, 'data', 'voice-reference-brief.md'), 4000);

  const sourcesUsed = {
    hm_intel: !!hmIntel,
    company_pulse: !!companyPulse,
    cv_md: !!cvText,
    article_digest: !!articleDigest,
    modes_profile: !!profileMd,
    voice_brief: !!voiceBrief,
  };

  /* ----- COUNCIL PROMPT — what an ideal candidate looks like ----- */
  const trimmedJD = (jdText || '').slice(0, 6000);
  const trimmedHm = hmIntel ? JSON.stringify(hmIntel).slice(0, 4000) : '(no hm-intel cache)';
  const trimmedCv = cvText ? cvText.slice(0, 3500) : '(no cv.md)';
  const trimmedVoice = voiceBrief ? voiceBrief.slice(0, 2000) : '(no voice brief)';

  const councilPrompt = [
    `You are part of a council of frontier models advising on apply-pack polish for Mitchell Williams.`,
    `Target: ${company} — ${role}`,
    ``,
    `## Inputs`,
    `### Job description (verbatim, trimmed)`,
    trimmedJD || '(no JD text provided)',
    ``,
    `### Hiring-manager intel cache (synthesized by prior research)`,
    trimmedHm,
    ``,
    `### Mitchell's cv.md (trimmed)`,
    trimmedCv,
    ``,
    `### Mitchell's voice brief (canonical metrics & kill list — DO NOT invent new metrics)`,
    trimmedVoice,
    ``,
    `## Your task`,
    `Return STRICT JSON with this exact shape. No prose, no fences:`,
    `{`,
    `  "hiring_manager_priorities": ["top 5–8 priorities the actual HM at ${company} likely weights heaviest for this role"],`,
    `  "role_keywords": ["top 10–15 ATS / scan keywords this role surfaces — direct from JD"],`,
    `  "anti_patterns": ["5–8 phrases / framings that would actively hurt Mitchell for THIS role (e.g., over-claimed acronyms, voice tics, hedging)"],`,
    `  "company_voice": "2–3 sentence description of ${company}'s public writing voice as evidenced by their docs/blog/press",`,
    `  "comp_anchor": { "low": null, "mid": null, "high": null, "equity_pct_typical": null, "currency": "USD", "source_url": null },`,
    `  "must_haves": ["4–6 hard requirements Mitchell must demonstrate to clear the recruiter screen"],`,
    `  "nice_to_haves": ["3–5 differentiators that would move him from qualified to top-of-stack"],`,
    `  "source_urls_per_claim": { "claim phrase": ["url1","url2"] },`,
    `  "confidence_per_signal": { "claim phrase": 0.0 }`,
    `}`,
    `Rules:`,
    `- Use ONLY Mitchell's canonical metrics (see voice brief). Do not fabricate new numbers.`,
    `- Every claim with a source MUST include real URLs in source_urls_per_claim. If you don't have one, omit the claim.`,
    `- comp_anchor: only fill numbers you can cite (Levels.fyi, Glassdoor, equity-calculator); else leave null.`,
    `- Honor Mitchell's kill list — no "delve", "tapestry", "leverage" (verb), "passionate", exclamation marks.`,
  ].join('\n');

  let councilResults = [];
  let councilCost = 0;
  let councilError = null;
  try {
    const cr = await callCouncil({
      prompt: councilPrompt,
      models: lineup,
      // Forward cost-trace callback (Mitchell decision α.2); graceful-degrade if absent
      opts: {
        maxTokens: 3000,
        timeoutMs: POLISH_API_TIMEOUT_MS,
        ...(opts.onCostRecord ? { onCostRecord: opts.onCostRecord } : {}),
        ...(opts.phase ? { phase: opts.phase } : {}),
        agentSlug: 'apply-pack-polish',
      },
    });
    councilResults = cr.results || [];
    councilCost = (cr.report?.totalCost || 0);
  } catch (e) {
    councilError = String(e.message || e);
  }

  /* ----- DEALBREAKER ADJUDICATION (Opus 4.7 single call) ----- */
  const merged = mergeCouncilSignals(councilResults);
  const dealbreakerPrompt = [
    `You are the dealbreaker layer of an apply-pack polish pipeline.`,
    `Your job: take the merged council signals below and prune anything the council couldn't ground in evidence.`,
    ``,
    `## Merged council signals`,
    JSON.stringify(merged, null, 2),
    ``,
    `## Per-model raw responses (use these to detect convergence vs. lone-model claims)`,
    JSON.stringify(councilResults.map(r => ({ model: r.model, content: (r.content || '').slice(0, 1500), error: r.error || null })), null, 2),
    ``,
    `## Inputs ground truth`,
    `JD (trimmed): ${trimmedJD.slice(0, 2000)}`,
    `HM intel: ${trimmedHm.slice(0, 1500)}`,
    `Voice brief: ${trimmedVoice.slice(0, 1500)}`,
    ``,
    `## Your task — return STRICT JSON only`,
    `{`,
    `  "dealbreaker_pruned": [{ "claim": "...", "reason": "specific — citation missing / hallucinated metric / contradicted by JD / contradicted by voice brief" }],`,
    `  "kept": { "hiring_manager_priorities": [...], "role_keywords": [...], "anti_patterns": [...], "must_haves": [...], "nice_to_haves": [...] },`,
    `  "company_voice_refined": "...",`,
    `  "comp_anchor_refined": { ... },`,
    `  "source_urls_per_claim": { ... },`,
    `  "confidence_per_signal": { ... },`,
    `  "dealbreaker_notes": "1-3 sentences on what was risky"`,
    `}`,
    `Be conservative — prune > keep. Suspect any item that no model cited.`,
  ].join('\n');

  let dealbreakerOut = null;
  let dealbreakerCost = 0;
  try {
    const dr = await callCouncil({
      prompt: dealbreakerPrompt,
      models: ['anthropic:claude-opus-4-7'],
      opts: {
        maxTokens: 3500,
        timeoutMs: POLISH_API_TIMEOUT_MS,
        ...(opts.onCostRecord ? { onCostRecord: opts.onCostRecord } : {}),
        ...(opts.phase ? { phase: opts.phase + '-dealbreaker' } : {}),
        agentSlug: 'apply-pack-polish',
      },
    });
    const raw = dr.results?.[0]?.content || '';
    dealbreakerOut = extractJson(raw);
    dealbreakerCost = dr.report?.totalCost || 0;
  } catch (e) {
    /* fall through with null */
  }

  const finalKept = (dealbreakerOut && dealbreakerOut.kept) ? dealbreakerOut.kept : merged;
  const signals = {
    hiring_manager_priorities: finalKept.hiring_manager_priorities || merged.hiring_manager_priorities || [],
    role_keywords: finalKept.role_keywords || merged.role_keywords || [],
    anti_patterns: finalKept.anti_patterns || merged.anti_patterns || [],
    must_haves: finalKept.must_haves || merged.must_haves || [],
    nice_to_haves: finalKept.nice_to_haves || merged.nice_to_haves || [],
    company_voice: (dealbreakerOut && dealbreakerOut.company_voice_refined) || merged.company_voice || '',
    comp_anchor: (dealbreakerOut && dealbreakerOut.comp_anchor_refined) || merged.comp_anchor || null,
    dealbreaker_pruned: (dealbreakerOut && Array.isArray(dealbreakerOut.dealbreaker_pruned)) ? dealbreakerOut.dealbreaker_pruned : [],
    source_urls_per_claim: (dealbreakerOut && dealbreakerOut.source_urls_per_claim) || {},
    confidence_per_signal: (dealbreakerOut && dealbreakerOut.confidence_per_signal) || merged.confidence_per_signal || {},
    meta: {
      generated_at: new Date().toISOString(),
      duration_ms: Date.now() - t0,
      sources_used: sourcesUsed,
      model_lineup: lineup,
      models_responded: councilResults.filter(r => r && !r.error).map(r => r.model),
      cost_usd: Math.round((councilCost + dealbreakerCost) * 10000) / 10000,
      cache: 'miss',
      cache_path: cachePath,
      cost_cap_usd: costCap,
      council_error: councilError,
      dealbreaker_used: !!dealbreakerOut,
      dealbreaker_notes: (dealbreakerOut && dealbreakerOut.dealbreaker_notes) || null,
    },
  };

  try {
    writeFileSync(cachePath, JSON.stringify(signals, null, 2), 'utf-8');
  } catch (e) {
    signals.meta.cache_write_error = String(e.message || e);
  }

  return signals;
}

export const _internal = {
  mergeCouncilSignals, extractJson, isFreshCache, slugify, FULL_LINEUP,
};
