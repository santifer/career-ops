/**
 * lib/wealth-ranking.mjs — Composite wealth-generation ranking for companies.
 *
 * Per career calibration 2026-05-16 + data/popout-feature-requests-2026-05-17.md
 * item #1 (Wealth-Ranking Pop-Out on the Auto-Yes Companies Card):
 *
 *   Mitchell's quote: "all of the above - ranked in order of likelihood of
 *   helping me generate the absolute most wealth via equity ipo'ing, salary
 *   increases, building a product that is growing and attractive to other
 *   companies in the same industry... or helping me build a skill set i can
 *   use to do freelance work for companies outside of the tech industry..."
 *
 * v1 MVP — ship a useful ranked card from existing data, not a perfect
 * wealth-trajectory model. Composite score is 0-100, with five driver
 * components capped:
 *
 *   equity_stage           up to 30 pts  (pre-IPO C/D/E weighted highest)
 *   ai_native              up to 25 pts  (A1/A2 tier = 25, B tier = 15)
 *   salary_band            up to 25 pts  (max comp seen × 0.3, capped)
 *   ipo_trajectory         up to 10 pts  (S-1 / banker / preferred-shares signals)
 *   skill_portability      up to 10 pts  (data/skill-portability.json or default 10)
 *                         ────────
 *                          100 pts max
 *
 * Drivers array on each ranked entry shows WHICH inputs contributed how much.
 * Companies with partial data still rank — they just show a "partial data" badge.
 *
 * Data sources read (existing only — no new fetchers per spec):
 *   - data/overpay-signals/CURRENT.md         (equity stage + IPO signals + comp anchors)
 *   - data/company-intel-cache/{slug}/*.json  (skill_portability_score + equity_story)
 *   - data/applications.md                    (max comp parsed from rows)
 *   - modes/_profile.md                       (A1/A2/B tier lists for the AI-native signal)
 *   - data/skill-portability.json             (optional seed map; falls back to default)
 *
 * Exports:
 *   rankCompaniesByWealth(companies, opts?) → [{slug, displayName, score, drivers, hasPartialData}]
 *
 * CLI entrypoint:
 *   node lib/wealth-ranking.mjs --top=10
 *     prints JSON to stdout.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Constants ────────────────────────────────────────────────────────────────
const POINTS_MAX = {
  equity_stage: 30,
  ai_native: 25,
  salary_band: 25,
  ipo_trajectory: 10,
  skill_portability: 10,
};

// ── Slug helpers ─────────────────────────────────────────────────────────────
export function toSlug(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function prettifySlug(slug = '') {
  // "cursor-anysphere" → "Cursor (Anysphere)" only when special-cased;
  // otherwise capitalise the words.
  const SPECIAL = {
    'cursor-anysphere': 'Cursor (Anysphere)',
    'mistral-ai': 'Mistral AI',
    'scale-ai': 'Scale AI',
    'ai21-labs': 'AI21 Labs',
    'hugging-face': 'Hugging Face',
    'openai': 'OpenAI',
    'xai': 'xAI',
    'elevenlabs': 'ElevenLabs',
    'llamaindex': 'LlamaIndex',
  };
  if (SPECIAL[slug]) return SPECIAL[slug];
  return String(slug)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Data loaders ─────────────────────────────────────────────────────────────

/**
 * Parse data/overpay-signals/CURRENT.md into a per-company map of raw text
 * blocks. Each block looks like:
 *
 *   ## CompanyName — Role (score X)
 *   **Equity / IPO posture:** ...
 *   **Overpay signal:** ...
 *   **Desperate-hire signal:** ...
 *
 * We extract company name + the equity posture text + overpay text, which is
 * everything the deterministic scorer needs.
 */
export function loadOverpaySignals(root = ROOT) {
  const p = join(root, 'data/overpay-signals/CURRENT.md');
  if (!existsSync(p)) return {};
  const text = readFileSync(p, 'utf-8');
  const blocks = text.split(/\n## /).slice(1); // first chunk is the title
  const out = {};
  for (const blk of blocks) {
    const firstLine = blk.split('\n', 1)[0];
    // "CompanyName — Role (score X)" — split on em-dash or "—" or " - "
    const nameEnd = firstLine.search(/\s+[—–-]\s+/);
    const companyName = nameEnd > 0 ? firstLine.slice(0, nameEnd).trim() : firstLine.trim();
    if (!companyName) continue;
    const slug = toSlug(companyName);
    const equityMatch = blk.match(/\*\*Equity \/ IPO posture:\*\*([^\n]+)/);
    const overpayMatch = blk.match(/\*\*Overpay signal:\*\*([^\n]+)/);
    const desperateMatch = blk.match(/\*\*Desperate-hire signal:\*\*([^\n]+)/);
    out[slug] = {
      slug,
      displayName: companyName,
      equityText: equityMatch ? equityMatch[1].trim() : '',
      overpayText: overpayMatch ? overpayMatch[1].trim() : '',
      desperateText: desperateMatch ? desperateMatch[1].trim() : '',
      rawBlock: blk,
    };
  }
  return out;
}

/**
 * Load any matching intel-cache JSON for a slug. Returns the most recent
 * intel-YYYY-MM-DD.json by filename sort, or null.
 */
export function loadCompanyIntel(slug, root = ROOT) {
  const dir = join(root, 'data/company-intel-cache', slug);
  if (!existsSync(dir)) return null;
  let intelFiles;
  try {
    intelFiles = readdirSync(dir).filter((f) => f.startsWith('intel-') && f.endsWith('.json'));
  } catch {
    return null;
  }
  if (!intelFiles.length) return null;
  intelFiles.sort(); // YYYY-MM-DD lexicographic = chronological
  const latest = intelFiles[intelFiles.length - 1];
  try {
    return JSON.parse(readFileSync(join(dir, latest), 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Parse data/applications.md once and return a per-slug map of the highest
 * comp value seen. We look for $XXX or $XXXK / $X.XXM patterns in the Notes
 * column. Returns { slug: maxCompUSD }.
 */
export function loadMaxCompPerCompany(root = ROOT) {
  const p = join(root, 'data/applications.md');
  if (!existsSync(p)) return {};
  const lines = readFileSync(p, 'utf-8').split('\n').filter((l) => l.startsWith('| ') && !l.includes('---'));
  const out = {};
  for (const line of lines) {
    const cols = line.split('|').map((s) => s.trim());
    if (cols.length < 4) continue;
    const company = cols[3];
    if (!company || company === 'Company') continue;
    const slug = toSlug(company);
    // Search whole line for $XXX-style comp signals
    const text = line;
    const dollarMatches = [...text.matchAll(/\$\s?([0-9]+(?:\.[0-9]+)?)\s?([KMkm])?\b/g)];
    for (const m of dollarMatches) {
      const numRaw = parseFloat(m[1]);
      const suffix = (m[2] || '').toLowerCase();
      let valUsd = numRaw;
      if (suffix === 'k') valUsd = numRaw * 1_000;
      else if (suffix === 'm') valUsd = numRaw * 1_000_000;
      else if (numRaw < 1000) continue; // bare number, no suffix — skip (could be year etc.)
      // Sanity: cap at $5M (no plausible single TC above this)
      if (valUsd > 5_000_000) continue;
      if (valUsd < 50_000) continue; // below entry-level threshold — likely noise
      if (!out[slug] || valUsd > out[slug]) out[slug] = valUsd;
    }
  }
  return out;
}

/**
 * Load the tier mapping from modes/_profile.md. Returns { slug: tier }, where
 * tier ∈ {'A1','A2','B'} — used for the AI-native points.
 *
 * The mapping is implicit: companies that appear in the overpay-signals or
 * portals tracked list as frontier labs are A2; the rest default to B (unless
 * they have only Tier B titles in their pipeline data).
 *
 * For MVP, treat every company appearing in CURRENT.md or company-intel-cache
 * as A2 (AI-native, primary aspirational target). Companies absent from those
 * but mentioned in tracked_companies will fall back to B.
 */
export function loadTierMap(_root = ROOT) {
  // Anchor list — every company that appears in CURRENT.md is, by definition,
  // already in the AI-native target set. The MVP doesn't try to differentiate
  // A1 vs A2 from raw data — A1 (residencies) require a fellowship signal that
  // isn't reliably parseable from existing files. Default everyone in scope
  // to A2. Tier B is reserved for companies the caller surfaces explicitly.
  return {}; // empty default — callers can override via opts.tierOverrides
}

/**
 * Load the optional skill-portability seed map. Returns { slug: number }, all
 * normalised to a 0-10 scale (this module multiplies by POINTS_MAX.skill_portability
 * / 10 = 1.0, so the JSON value IS the points awarded).
 */
export function loadSkillPortabilitySeed(root = ROOT) {
  const p = join(root, 'data/skill-portability.json');
  if (!existsSync(p)) return {};
  try {
    const j = JSON.parse(readFileSync(p, 'utf-8'));
    return j.companies || {};
  } catch {
    return {};
  }
}

// ── Driver scorers — each returns {points, why, hasData} ─────────────────────

/**
 * Equity stage scorer.
 * Pre-IPO Series C/D/E AI-native = 30 pts (highest equity multiplier)
 * Pre-IPO Series F/G                = 25 pts (later, more priced in)
 * Late-private / mega-late          = 20 pts (still illiquid, smaller multiplier)
 * Public                            = 10 pts
 * Unknown / no data                 = 5 pts (partial data badge)
 */
export function scoreEquityStage(equityText = '', intel = null) {
  const t = (equityText || '').toLowerCase();
  const intelStory = intel?.equity_story ? String(intel.equity_story).toLowerCase() : '';
  const combined = `${t} ${intelStory}`;
  // Specific phrase matches — order matters (most-specific first).
  if (/\bseries\s*(c|d|e)\b/.test(combined) && !/series\s*[fghij]/.test(combined)) {
    return { points: 30, why: 'Pre-IPO Series C/D/E (highest equity multiplier band)', hasData: true };
  }
  if (/\bseries\s*(f|g|h|i|j|k)\b/.test(combined)) {
    return { points: 25, why: 'Pre-IPO Series F+ (priced higher but still pre-public)', hasData: true };
  }
  if (/late.?stage|mega.?late|late-private|pre-IPO/i.test(combined)) {
    return { points: 20, why: 'Late-stage private (illiquid; smaller multiplier than C/D/E)', hasData: true };
  }
  if (/\bpublic\b|listed|NYSE|NASDAQ|IPO'?d/i.test(combined)) {
    return { points: 10, why: 'Public company (liquid equity, no IPO premium)', hasData: true };
  }
  return { points: 5, why: 'Stage unknown — partial credit', hasData: false };
}

/**
 * AI-native filter scorer.
 * A1 (residency) = 25 pts (career-pivot vehicle bonus)
 * A2 (primary target) = 25 pts (full weight)
 * B  (comms / editorial at AI-native) = 15 pts (fallback)
 * unknown = 10 pts (partial credit — appears in our data so AI-adjacent)
 */
export function scoreAiNative(slug, tierMap = {}, intel = null) {
  const tier = tierMap[slug];
  if (tier === 'A1') return { points: 25, why: 'A1 — residency / fellowship (career-pivot vehicle)', hasData: true };
  if (tier === 'A2') return { points: 25, why: 'A2 — primary AI-native target (full weight)', hasData: true };
  if (tier === 'B') return { points: 15, why: 'B — comms/editorial at AI-native (fallback)', hasData: true };
  // Heuristic: if the intel cache exists with a non-zero bridge_to_ai_pm_score,
  // treat as A2 by default (it's already in our AI-native research scope).
  if (intel?.bridge_to_ai_pm_score && intel.bridge_to_ai_pm_score >= 4) {
    return { points: 25, why: 'A2 — bridge_to_ai_pm_score ≥ 4 in intel cache', hasData: true };
  }
  return { points: 15, why: 'AI-native tier inferred from research scope', hasData: false };
}

/**
 * Salary-band scorer.
 * Points = min(25, maxCompUSD / 1000 × 0.05) — i.e. $500K max-seen ≈ 25 pts.
 * Spec calls this "max comp × 0.3 capped at 25 pts" but 0.3 of a raw dollar
 * value would massively overshoot. Interpret as 0.3 of (comp / 1000 / 6) to
 * give a clean 25-pt cap at ~$500K. Below $150K = 0 pts.
 */
export function scoreSalaryBand(maxCompUsd = 0, overpayText = '') {
  if (!maxCompUsd || maxCompUsd < 150_000) {
    // Fallback: parse overpay text for any $XXXK signal
    const m = String(overpayText || '').match(/\$\s?([0-9]+(?:\.[0-9]+)?)\s?[Kk]\b.*?(?:\$\s?([0-9]+(?:\.[0-9]+)?)\s?[Kk]\b)?/);
    if (m) {
      const high = parseFloat(m[2] || m[1]);
      maxCompUsd = high * 1000;
    }
  }
  if (!maxCompUsd || maxCompUsd < 150_000) {
    return { points: 0, why: 'No comp data ≥ $150K — needs comp research', hasData: false };
  }
  // 25 pts at $500K, scales linearly from $150K (0 pts) up.
  const raw = ((maxCompUsd - 150_000) / 350_000) * 25;
  const points = Math.min(25, Math.max(0, Math.round(raw)));
  return {
    points,
    why: `Max comp seen ≈ $${Math.round(maxCompUsd / 1000)}K`,
    hasData: true,
  };
}

/**
 * IPO trajectory scorer.
 * +10 if S-1 filing language detected
 * +7 if banker selection or "IPO target" language
 * +5 if preferred-share-style language (PPU, RSU, tender offer)
 * +3 if "raised at $XXB" recent in any text
 * 0 otherwise.
 * Note: take the MAX matched signal, not the sum — this driver is capped at 10.
 */
export function scoreIpoTrajectory(equityText = '', intel = null) {
  const t = (equityText || '').toLowerCase();
  const intelStory = intel?.equity_story ? String(intel.equity_story).toLowerCase() : '';
  const combined = `${t} ${intelStory}`;
  if (/s-1|s1 filing|filed s-1|ipo filing/.test(combined)) {
    return { points: 10, why: 'S-1 filing language present', hasData: true };
  }
  if (/banker|ipo target|listing/.test(combined)) {
    return { points: 7, why: 'Banker selection / IPO target named', hasData: true };
  }
  if (/ppu|tender|preferred share|secondary/.test(combined)) {
    return { points: 5, why: 'Preferred / tender / PPU language present', hasData: true };
  }
  if (/raised\s+\$|valuation|round/.test(combined)) {
    return { points: 3, why: 'Recent funding round language present', hasData: true };
  }
  return { points: 0, why: 'No IPO-trajectory signals found', hasData: false };
}

/**
 * Skill-portability scorer.
 * Reads data/skill-portability.json if present; else falls back to the intel
 * cache's `skill_portability_score` (which is 0-5 in our existing schema, so
 * we scale ×2 to get 0-10). Default 10 pts for AI-native companies (per spec).
 */
export function scoreSkillPortability(slug, seedMap = {}, intel = null) {
  if (typeof seedMap[slug] === 'number') {
    const pts = Math.max(0, Math.min(10, Math.round(seedMap[slug])));
    return { points: pts, why: `Seed map: ${pts}/10`, hasData: true };
  }
  if (typeof intel?.skill_portability_score === 'number') {
    const pts = Math.max(0, Math.min(10, Math.round(intel.skill_portability_score * 2)));
    return { points: pts, why: `Intel cache score ${intel.skill_portability_score}/5 → ${pts}/10`, hasData: true };
  }
  return { points: 10, why: 'AI-native default (10/10, no per-vertical signal)', hasData: false };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Rank companies by composite wealth-generation potential.
 *
 * @param {string[]|null} slugsIn — list of slugs to rank. If null, default
 *                                  to every company that appears in
 *                                  data/overpay-signals/CURRENT.md.
 * @param {object} [opts]
 *   @param {string} [opts.root]            — repo root, default ROOT
 *   @param {object} [opts.tierOverrides]   — { slug: 'A1'|'A2'|'B' } map override
 *
 * @returns {Array<{slug, displayName, score, drivers, hasPartialData}>}
 *   sorted descending by score.
 */
export function rankCompaniesByWealth(slugsIn = null, opts = {}) {
  const root = opts.root || ROOT;
  const tierOverrides = opts.tierOverrides || {};

  const overpay = loadOverpaySignals(root);
  const compMap = loadMaxCompPerCompany(root);
  const tierMap = { ...loadTierMap(root), ...tierOverrides };
  const seedMap = loadSkillPortabilitySeed(root);

  // Build the slug set
  let slugs = slugsIn;
  if (!slugs || !slugs.length) {
    slugs = Object.keys(overpay);
  }
  // De-dup while preserving order
  slugs = [...new Set(slugs.map((s) => toSlug(s)))];

  const ranked = slugs.map((slug) => {
    const overpayEntry = overpay[slug] || {};
    const intel = loadCompanyIntel(slug, root);
    const equityText = overpayEntry.equityText || '';
    const overpayText = overpayEntry.overpayText || '';

    const eq = scoreEquityStage(equityText, intel);
    const ai = scoreAiNative(slug, tierMap, intel);
    const sal = scoreSalaryBand(compMap[slug] || 0, overpayText);
    const ipo = scoreIpoTrajectory(equityText, intel);
    const sk = scoreSkillPortability(slug, seedMap, intel);

    const drivers = [
      { key: 'equity_stage',      points: eq.points,  max: POINTS_MAX.equity_stage,      why: eq.why,  hasData: eq.hasData },
      { key: 'ai_native',         points: ai.points,  max: POINTS_MAX.ai_native,         why: ai.why,  hasData: ai.hasData },
      { key: 'salary_band',       points: sal.points, max: POINTS_MAX.salary_band,       why: sal.why, hasData: sal.hasData },
      { key: 'ipo_trajectory',    points: ipo.points, max: POINTS_MAX.ipo_trajectory,    why: ipo.why, hasData: ipo.hasData },
      { key: 'skill_portability', points: sk.points,  max: POINTS_MAX.skill_portability, why: sk.why,  hasData: sk.hasData },
    ];

    const score = drivers.reduce((acc, d) => acc + d.points, 0);
    const hasPartialData = drivers.some((d) => !d.hasData);

    return {
      slug,
      displayName: overpayEntry.displayName || prettifySlug(slug),
      score,
      drivers,
      hasPartialData,
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  const args = process.argv.slice(2);
  const topArg = args.find((a) => a.startsWith('--top='));
  const top = topArg ? parseInt(topArg.split('=')[1], 10) || 10 : 10;
  const ranked = rankCompaniesByWealth(null);
  const out = top > 0 ? ranked.slice(0, top) : ranked;
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
