#!/usr/bin/env node

/**
 * check-liveness.mjs — Job posting liveness + freshness checker
 *
 * Tests whether job posting URLs are still active AND fresh.
 * Two modes:
 *   - default:    Playwright-based (renders SPAs, follows redirects, sees innerText)
 *   - --fetch-mode: HTTP-only (no JS, no browser; for batch workers / claude -p)
 *
 * Freshness (NEW):
 *   Extracts `datePosted` from JSON-LD metadata or visible text and classifies
 *   the posting as fresh / stale / expired against thresholds in `portals.yml`.
 *   Use --classify or --json to consume the freshness result.
 *
 * Usage:
 *   node check-liveness.mjs <url1> [url2] ...
 *   node check-liveness.mjs --fetch-mode <url>
 *   node check-liveness.mjs --json <url>
 *   node check-liveness.mjs --classify <url>
 *   node check-liveness.mjs --file urls.txt
 *
 * Flags can combine: --fetch-mode --json --file urls.txt
 *
 * Exit code: 0 if all fresh+active, 1 if any stale/expired/uncertain
 */

import { chromium } from 'playwright';
import { readFile, readFileSync, existsSync } from 'fs';
import { readFile as readFileAsync } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─────────────────────────────────────────────────────────────────────
// Liveness patterns (used by both Playwright and fetch modes)
// ─────────────────────────────────────────────────────────────────────

const EXPIRED_PATTERNS = [
  /job (is )?no longer available/i,
  /job.*no longer open/i,           // Greenhouse: "The job you are looking for is no longer open."
  /position has been filled/i,
  /this job has expired/i,
  /job posting has expired/i,
  /no longer accepting applications/i,
  /this (position|role|job) (is )?no longer/i,
  /this job (listing )?is closed/i,
  /job (listing )?not found/i,
  /the page you are looking for doesn.t exist/i, // Workday /job/ 404
  /\d+\s+jobs?\s+found/i,           // Workday: landed on listing page ("663 JOBS FOUND") instead of a specific job
  /search for jobs page is loaded/i, // Workday SPA indicator for listing page
  /diese stelle (ist )?(nicht mehr|bereits) besetzt/i,
  /offre (expirée|n'est plus disponible)/i,
];

// URL patterns that indicate an ATS has redirected away from the job (closed/expired)
const EXPIRED_URL_PATTERNS = [
  /[?&]error=true/i,   // Greenhouse redirect on closed jobs
];

const APPLY_PATTERNS = [
  /\bapply\b/i,          // catches "Apply", "Apply Now", "Apply for this Job"
  /\bsolicitar\b/i,
  /\bbewerben\b/i,
  /\bpostuler\b/i,
  /submit application/i,
  /easy apply/i,
  /start application/i,  // Ashby
  /ich bewerbe mich/i,   // German Greenhouse
];

// Below this length the page is probably just nav/footer (closed ATS page)
const MIN_CONTENT_CHARS = 300;

// ─────────────────────────────────────────────────────────────────────
// Freshness: defaults + config loader
// ─────────────────────────────────────────────────────────────────────

const FRESHNESS_DEFAULTS = {
  max_age_days: 60,        // Hard skip — don't even evaluate
  warn_age_days: 30,       // Evaluate but flag as stale (Red Flags penalty)
  linkedin_suspect: true,  // Treat LinkedIn search-cache results as unverified
  require_date: false,     // If true, missing date = uncertain (strict mode)
};

/**
 * Read `freshness:` block from portals.yml. Falls back to defaults.
 * Minimal parser — only handles flat key:value pairs under `freshness:`.
 * Avoids adding a YAML dependency.
 */
function loadFreshnessConfig() {
  const portalsPath = join(__dirname, 'portals.yml');
  if (!existsSync(portalsPath)) return { ...FRESHNESS_DEFAULTS };

  try {
    const text = readFileSync(portalsPath, 'utf-8');
    const block = text.match(/^freshness:\s*\n((?:[ \t]+.+\n?)+)/m);
    if (!block) return { ...FRESHNESS_DEFAULTS };

    const cfg = { ...FRESHNESS_DEFAULTS };
    const lines = block[1].split('\n');
    for (const line of lines) {
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
// Date extraction (JSON-LD primary, visible text fallback)
// ─────────────────────────────────────────────────────────────────────

/**
 * Extract `datePosted` from raw HTML.
 * Priority:
 *   1. JSON-LD <script type="application/ld+json"> with `datePosted`
 *   2. Visible text "Posted on YYYY-MM-DD" / "Posted Mon DD, YYYY"
 *   3. Visible text "Posted N days/months/weeks ago"
 *   4. Inline meta tags ("datePosted":"...")
 * Returns Date | null.
 */
function extractPostingDate(html) {
  if (!html || typeof html !== 'string') return null;

  // 1. JSON-LD blocks
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    const block = match[1].trim();
    try {
      const data = JSON.parse(block);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const found = findDatePostedDeep(item);
        if (found) {
          const d = new Date(found);
          if (!isNaN(d)) return d;
        }
      }
    } catch {
      // Malformed JSON-LD — fall through to other strategies
    }
  }

  // 2. Inline "datePosted":"..." (covers minified embeds outside JSON-LD)
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

/** Recursively walk a JSON-LD object looking for a `datePosted` field. */
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
 * LinkedIn job IDs are roughly sequential. Returns the approximate year
 * the posting was created, or null if URL doesn't match LinkedIn format.
 *
 * Calibration table — recalibrate yearly. Buckets are conservative
 * (round down) so we err on flagging fresh postings as stale rather than
 * the reverse.
 */
function linkedinIdToYear(url) {
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

function ageInDays(date) {
  if (!date) return null;
  const ms = Date.now() - date.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Returns "fresh" | "stale" | "expired" | "unverified"
 *   fresh:      age <= warn_age_days OR no date and require_date is false
 *   stale:      warn < age <= max_age_days
 *   expired:    age > max_age_days
 *   unverified: no date and require_date is true
 */
function classifyFreshness(date, config) {
  if (date == null) {
    return config.require_date ? 'unverified' : 'fresh';
  }
  const days = ageInDays(date);
  if (days > config.max_age_days) return 'expired';
  if (days > config.warn_age_days) return 'stale';
  return 'fresh';
}

// ─────────────────────────────────────────────────────────────────────
// Playwright check (existing behavior, extended with date extraction)
// ─────────────────────────────────────────────────────────────────────

async function checkUrlPlaywright(page, url, config) {
  // LinkedIn ID heuristic — fast pre-filter, no network needed
  const linkedinYear = linkedinIdToYear(url);
  if (linkedinYear !== null) {
    const ageYears = new Date().getFullYear() - linkedinYear;
    if (ageYears >= 2) {
      return {
        url,
        result: 'expired',
        reason: `LinkedIn URL ID maps to ~${linkedinYear} (${ageYears}y old)`,
        datePosted: null,
        ageInDays: ageYears * 365,
        freshness: 'expired',
      };
    }
  }

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const status = response?.status() ?? 0;
    if (status === 404 || status === 410) {
      return { url, result: 'expired', reason: `HTTP ${status}`, datePosted: null, ageInDays: null, freshness: 'expired' };
    }

    await page.waitForTimeout(2000); // SPA hydration

    const finalUrl = page.url();
    for (const pattern of EXPIRED_URL_PATTERNS) {
      if (pattern.test(finalUrl)) {
        return { url, result: 'expired', reason: `redirect to ${finalUrl}`, datePosted: null, ageInDays: null, freshness: 'expired' };
      }
    }

    // Get full HTML for date extraction
    const html = await page.content();
    const datePosted = extractPostingDate(html);
    const days = ageInDays(datePosted);
    const freshness = classifyFreshness(datePosted, config);

    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');

    // Apply button is the strongest positive signal
    if (APPLY_PATTERNS.some(p => p.test(bodyText))) {
      // Override liveness with freshness if posting is too old
      if (freshness === 'expired') {
        return { url, result: 'expired', reason: `posting is ${days}d old (max: ${config.max_age_days})`, datePosted: datePosted?.toISOString().slice(0, 10), ageInDays: days, freshness };
      }
      return { url, result: 'active', reason: 'apply button detected', datePosted: datePosted?.toISOString().slice(0, 10) ?? null, ageInDays: days, freshness };
    }

    for (const pattern of EXPIRED_PATTERNS) {
      if (pattern.test(bodyText)) {
        return { url, result: 'expired', reason: `pattern matched: ${pattern.source}`, datePosted: datePosted?.toISOString().slice(0, 10) ?? null, ageInDays: days, freshness: 'expired' };
      }
    }

    if (bodyText.trim().length < MIN_CONTENT_CHARS) {
      return { url, result: 'expired', reason: 'insufficient content — likely nav/footer only', datePosted: null, ageInDays: null, freshness: 'expired' };
    }

    return { url, result: 'uncertain', reason: 'content present but no apply button found', datePosted: datePosted?.toISOString().slice(0, 10) ?? null, ageInDays: days, freshness };

  } catch (err) {
    return { url, result: 'expired', reason: `navigation error: ${err.message.split('\n')[0]}`, datePosted: null, ageInDays: null, freshness: 'expired' };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Fetch-mode check (no Playwright; for batch workers)
// ─────────────────────────────────────────────────────────────────────

async function checkUrlFetch(url, config) {
  // LinkedIn ID heuristic — fast pre-filter
  const linkedinYear = linkedinIdToYear(url);
  if (linkedinYear !== null) {
    const ageYears = new Date().getFullYear() - linkedinYear;
    if (ageYears >= 2) {
      return {
        url,
        result: 'expired',
        reason: `LinkedIn URL ID maps to ~${linkedinYear} (${ageYears}y old)`,
        datePosted: null,
        ageInDays: ageYears * 365,
        freshness: 'expired',
      };
    }
  }

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(15000),
    });

    const status = response.status;
    if (status === 404 || status === 410) {
      return { url, result: 'expired', reason: `HTTP ${status}`, datePosted: null, ageInDays: null, freshness: 'expired' };
    }

    const finalUrl = response.url;
    for (const pattern of EXPIRED_URL_PATTERNS) {
      if (pattern.test(finalUrl)) {
        return { url, result: 'expired', reason: `redirect to ${finalUrl}`, datePosted: null, ageInDays: null, freshness: 'expired' };
      }
    }

    const html = await response.text();
    const datePosted = extractPostingDate(html);
    const days = ageInDays(datePosted);
    const freshness = classifyFreshness(datePosted, config);
    const dateStr = datePosted?.toISOString().slice(0, 10) ?? null;

    // Strip HTML tags for liveness pattern matching (rough but adequate)
    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // ── Strongest positive: JSON-LD datePosted is present + fresh ──
    // ATS platforms only embed JSON-LD when the job is live. SPAs (Ashby,
    // Lever, Workday) have minimal stripped text but rich JSON-LD payloads,
    // so this short-circuit avoids false "insufficient content" rejections.
    if (datePosted) {
      if (freshness === 'expired') {
        return { url, result: 'expired', reason: `posting is ${days}d old (max: ${config.max_age_days})`, datePosted: dateStr, ageInDays: days, freshness };
      }
      return { url, result: 'active', reason: `JSON-LD datePosted (${days}d old)`, datePosted: dateStr, ageInDays: days, freshness };
    }

    // ── No date — fall back to body text signals ──
    if (APPLY_PATTERNS.some(p => p.test(bodyText))) {
      return { url, result: 'active', reason: 'apply button detected', datePosted: null, ageInDays: null, freshness };
    }

    for (const pattern of EXPIRED_PATTERNS) {
      if (pattern.test(bodyText)) {
        return { url, result: 'expired', reason: `pattern matched: ${pattern.source}`, datePosted: null, ageInDays: null, freshness: 'expired' };
      }
    }

    if (bodyText.length < MIN_CONTENT_CHARS) {
      return { url, result: 'expired', reason: 'insufficient content — likely nav/footer only', datePosted: null, ageInDays: null, freshness: 'expired' };
    }

    return { url, result: 'uncertain', reason: 'content present but no apply button or date found', datePosted: null, ageInDays: null, freshness };

  } catch (err) {
    return { url, result: 'expired', reason: `fetch error: ${err.message.split('\n')[0]}`, datePosted: null, ageInDays: null, freshness: 'expired' };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Output formatters
// ─────────────────────────────────────────────────────────────────────

function formatHuman(r) {
  const icon = { active: '✅', expired: '❌', uncertain: '⚠️' }[r.result] ?? '?';
  const ageStr = r.ageInDays != null ? ` (${r.ageInDays}d old)` : '';
  console.log(`${icon} ${r.result.padEnd(10)} ${r.url}${ageStr}`);
  if (r.result !== 'active' || r.freshness === 'stale') {
    console.log(`           ${r.reason}`);
  }
}

function formatJson(r) {
  console.log(JSON.stringify(r));
}

function formatClassify(r) {
  console.log(r.freshness);
}

// ─────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('Usage: node check-liveness.mjs [--fetch-mode] [--json|--classify] <url1> [url2] ...');
    console.error('       node check-liveness.mjs [--fetch-mode] [--json|--classify] --file urls.txt');
    process.exit(1);
  }

  const fetchMode = argv.includes('--fetch-mode');
  const jsonOut = argv.includes('--json');
  const classifyOut = argv.includes('--classify');
  const fileIdx = argv.indexOf('--file');

  let urls;
  if (fileIdx !== -1) {
    const text = await readFileAsync(argv[fileIdx + 1], 'utf-8');
    urls = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  } else {
    urls = argv.filter(a => !a.startsWith('--') && a !== argv[fileIdx + 1]);
  }

  if (urls.length === 0) {
    console.error('No URLs provided.');
    process.exit(1);
  }

  const config = loadFreshnessConfig();
  const formatter = jsonOut ? formatJson : classifyOut ? formatClassify : formatHuman;

  if (!jsonOut && !classifyOut) {
    console.log(`Checking ${urls.length} URL(s) [${fetchMode ? 'fetch-mode' : 'playwright'}]...\n`);
  }

  let active = 0, expired = 0, uncertain = 0, stale = 0;
  const results = [];

  if (fetchMode) {
    // Fetch mode — can run in parallel safely (no shared browser state)
    const promises = urls.map(u => checkUrlFetch(u, config));
    const fetched = await Promise.all(promises);
    for (const r of fetched) {
      results.push(r);
      formatter(r);
      if (r.result === 'active' && r.freshness !== 'stale') active++;
      else if (r.result === 'expired' || r.freshness === 'expired') expired++;
      else if (r.freshness === 'stale') stale++;
      else uncertain++;
    }
  } else {
    // Playwright mode — sequential per project rule
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    for (const url of urls) {
      const r = await checkUrlPlaywright(page, url, config);
      results.push(r);
      formatter(r);
      if (r.result === 'active' && r.freshness !== 'stale') active++;
      else if (r.result === 'expired' || r.freshness === 'expired') expired++;
      else if (r.freshness === 'stale') stale++;
      else uncertain++;
    }
    await browser.close();
  }

  if (!jsonOut && !classifyOut) {
    console.log(`\nResults: ${active} active  ${stale} stale  ${expired} expired  ${uncertain} uncertain`);
    console.log(`Freshness thresholds: warn=${config.warn_age_days}d, max=${config.max_age_days}d`);
  }

  if (expired > 0 || uncertain > 0 || stale > 0) process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────
// Exports for tests
// ─────────────────────────────────────────────────────────────────────

export {
  extractPostingDate,
  linkedinIdToYear,
  ageInDays,
  classifyFreshness,
  loadFreshnessConfig,
  checkUrlFetch,
  FRESHNESS_DEFAULTS,
};

// Only run main() when invoked directly, not when imported by tests
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
