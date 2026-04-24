/**
 * liveness-core.mjs — Pure-function classifiers for job posting liveness + freshness.
 *
 * Two concerns, two functions:
 *   - classifyLiveness({status, finalUrl, bodyText, applyControls}) → liveness
 *   - classifyFreshness(datePosted, freshnessConfig)               → freshness
 *
 * Liveness asks: "is this URL still serving a live job page right now?"
 * Freshness asks: "is the posting recent enough to bother evaluating?"
 *
 * Both are pure: no I/O, no Playwright, no fetch. Importable from
 * check-liveness.mjs (Playwright runner), scan.mjs (API scanner), and
 * batch workers (fetch-mode).
 */

import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────
// Liveness — santifer's classifier (kept verbatim from upstream)
// ─────────────────────────────────────────────────────────────────────

const HARD_EXPIRED_PATTERNS = [
  /job (is )?no longer available/i,
  /job.*no longer open/i,
  /position has been filled/i,
  /this job has expired/i,
  /job posting has expired/i,
  /no longer accepting applications/i,
  /this (position|role|job) (is )?no longer/i,
  /this job (listing )?is closed/i,
  /job (listing )?not found/i,
  /the page you are looking for doesn.t exist/i,
  /diese stelle (ist )?(nicht mehr|bereits) besetzt/i,
  /offre (expirée|n'est plus disponible)/i,
];

const LISTING_PAGE_PATTERNS = [
  /\d+\s+jobs?\s+found/i,
  /search for jobs page is loaded/i,
];

const EXPIRED_URL_PATTERNS = [
  /[?&]error=true/i,
];

const APPLY_PATTERNS = [
  /\bapply\b/i,
  /\bsolicitar\b/i,
  /\bbewerben\b/i,
  /\bpostuler\b/i,
  /submit application/i,
  /easy apply/i,
  /start application/i,
  /ich bewerbe mich/i,
];

const MIN_CONTENT_CHARS = 300;

function firstMatch(patterns, text = '') {
  return patterns.find((pattern) => pattern.test(text));
}

function hasApplyControl(controls = []) {
  return controls.some((control) => APPLY_PATTERNS.some((pattern) => pattern.test(control)));
}

export function classifyLiveness({ status = 0, finalUrl = '', bodyText = '', applyControls = [] } = {}) {
  if (status === 404 || status === 410) {
    return { result: 'expired', reason: `HTTP ${status}` };
  }

  const expiredUrl = firstMatch(EXPIRED_URL_PATTERNS, finalUrl);
  if (expiredUrl) {
    return { result: 'expired', reason: `redirect to ${finalUrl}` };
  }

  const expiredBody = firstMatch(HARD_EXPIRED_PATTERNS, bodyText);
  if (expiredBody) {
    return { result: 'expired', reason: `pattern matched: ${expiredBody.source}` };
  }

  if (hasApplyControl(applyControls)) {
    return { result: 'active', reason: 'visible apply control detected' };
  }

  const listingPage = firstMatch(LISTING_PAGE_PATTERNS, bodyText);
  if (listingPage) {
    return { result: 'expired', reason: `pattern matched: ${listingPage.source}` };
  }

  if (bodyText.trim().length < MIN_CONTENT_CHARS) {
    return { result: 'expired', reason: 'insufficient content — likely nav/footer only' };
  }

  return { result: 'uncertain', reason: 'content present but no visible apply control found' };
}

// ─────────────────────────────────────────────────────────────────────
// Freshness — config defaults + loader
// ─────────────────────────────────────────────────────────────────────

export const FRESHNESS_DEFAULTS = {
  max_age_days: 60,        // Hard skip — pipeline.md filters before A-F
  warn_age_days: 30,       // Evaluator applies automatic Red Flags penalty
  linkedin_suspect: true,  // Treat LinkedIn search-cache as unverified
  require_date: false,     // Strict mode: missing date = uncertain
};

/**
 * Load freshness block from portals.yml. Returns defaults if not found.
 * Minimal regex parser — flat key:value only — to avoid adding js-yaml
 * here (liveness-core has zero deps today and we'd like to keep it that
 * way; scan.mjs already pulls in js-yaml separately).
 */
export function loadFreshnessConfig(portalsPath = join(__dirname, 'portals.yml')) {
  if (!existsSync(portalsPath)) return { ...FRESHNESS_DEFAULTS };

  try {
    const text = readFileSync(portalsPath, 'utf-8');
    const block = text.match(/^freshness:\s*\n((?:[ \t]+.+\n?)+)/m);
    if (!block) return { ...FRESHNESS_DEFAULTS };

    const cfg = { ...FRESHNESS_DEFAULTS };
    for (const line of block[1].split('\n')) {
      const m = line.match(/^[ \t]+(\w+):\s*(.+?)\s*(?:#.*)?$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (/^\d+$/.test(val)) val = parseInt(val, 10);
      else val = val.replace(/^["']|["']$/g, '');
      cfg[key] = val;
    }
    return cfg;
  } catch {
    return { ...FRESHNESS_DEFAULTS };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Date extraction — JSON-LD primary, visible text fallback
// ─────────────────────────────────────────────────────────────────────

/**
 * Extract `datePosted` from raw HTML.
 * Priority:
 *   1. JSON-LD <script type="application/ld+json"> with `datePosted`
 *      (top-level, nested @graph, or any depth)
 *   2. Inline `"datePosted":"..."` minified embeds
 *   3. Visible text "Posted YYYY-MM-DD", "Posted Mon DD, YYYY",
 *      "Posted N days/weeks/months ago"
 * Returns Date | null.
 */
export function extractPostingDate(html) {
  if (!html || typeof html !== 'string') return null;

  // 1. JSON-LD blocks
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const found = findDatePostedDeep(item);
        if (found) {
          const d = new Date(found);
          if (!isNaN(d)) return d;
        }
      }
    } catch {
      // Malformed JSON-LD, fall through
    }
  }

  // 2. Inline minified
  const inline = html.match(/"datePosted"\s*:\s*"([^"]+)"/);
  if (inline) {
    const d = new Date(inline[1]);
    if (!isNaN(d)) return d;
  }

  // 3. Visible text patterns
  const isoMatch = html.match(/Posted\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})/i);
  if (isoMatch) {
    const d = new Date(isoMatch[1]);
    if (!isNaN(d)) return d;
  }

  const longMatch = html.match(/Posted\s+(?:on\s+)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})/i);
  if (longMatch) {
    const d = new Date(longMatch[1]);
    if (!isNaN(d)) return d;
  }

  const daysAgo = html.match(/Posted\s+(\d+)\s+days?\s+ago/i);
  if (daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(daysAgo[1], 10));
    return d;
  }

  const weeksAgo = html.match(/Posted\s+(\d+)\s+weeks?\s+ago/i);
  if (weeksAgo) {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(weeksAgo[1], 10) * 7);
    return d;
  }

  const monthsAgo = html.match(/Posted\s+(\d+)\s+months?\s+ago/i);
  if (monthsAgo) {
    const d = new Date();
    d.setMonth(d.getMonth() - parseInt(monthsAgo[1], 10));
    return d;
  }

  return null;
}

/** Recursively walk a JSON-LD object looking for `datePosted`. */
function findDatePostedDeep(obj, depth = 0) {
  if (depth > 6 || obj == null) return null;
  if (typeof obj !== 'object') return null;
  if (typeof obj.datePosted === 'string') return obj.datePosted;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findDatePostedDeep(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const key of Object.keys(obj)) {
    const found = findDatePostedDeep(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// LinkedIn URL ID year heuristic
// ─────────────────────────────────────────────────────────────────────

/**
 * LinkedIn job IDs are sequential and roughly map to year. Returns the
 * approximate year, or null if URL doesn't match LinkedIn format.
 *
 * Calibration table — recalibrate yearly. Buckets are conservative
 * (round down) so we err on flagging fresh postings as stale rather
 * than the reverse.
 */
export function linkedinIdToYear(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/linkedin\.com\/jobs\/view\/[^?#]*?-(\d{8,})/i);
  if (!m) return null;
  const id = parseInt(m[1], 10);
  if (!Number.isFinite(id)) return null;

  if (id < 3_000_000_000) return 2020;
  if (id < 3_500_000_000) return 2021;
  if (id < 3_800_000_000) return 2022;
  if (id < 4_100_000_000) return 2023;
  if (id < 4_400_000_000) return 2024;
  return 2025;
}

// ─────────────────────────────────────────────────────────────────────
// Freshness classification
// ─────────────────────────────────────────────────────────────────────

export function ageInDays(date) {
  if (!date) return null;
  const ms = Date.now() - date.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Returns "fresh" | "stale" | "expired" | "unverified"
 *   fresh:      age <= warn_age_days, OR null date with require_date=false
 *   stale:      warn < age <= max_age_days
 *   expired:    age > max_age_days
 *   unverified: null date with require_date=true
 */
export function classifyFreshness(date, config) {
  if (date == null) {
    return config.require_date ? 'unverified' : 'fresh';
  }
  const days = ageInDays(date);
  if (days > config.max_age_days) return 'expired';
  if (days > config.warn_age_days) return 'stale';
  return 'fresh';
}
