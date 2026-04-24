#!/usr/bin/env node

/**
 * check-liveness.mjs — Job posting liveness + freshness checker
 *
 * Two execution modes:
 *   - default:    Playwright (renders SPAs, follows redirects, sees innerText)
 *   - --fetch-mode: HTTP-only via fetch() (no JS, no browser; for batch workers)
 *
 * Liveness comes from `classifyLiveness` in liveness-core.mjs.
 * Freshness comes from `classifyFreshness` in liveness-core.mjs.
 *
 * LinkedIn ToS: per CONTRIBUTING.md, fetch-mode never makes HTTP requests
 * to linkedin.com. The LinkedIn URL ID heuristic catches old postings at
 * zero network cost; recent LinkedIn URLs in fetch mode return `unverified`.
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
import { readFile } from 'fs/promises';
import {
  classifyLiveness,
  classifyFreshness,
  extractPostingDate,
  linkedinIdToYear,
  ageInDays,
  loadFreshnessConfig,
} from './liveness-core.mjs';

// ─────────────────────────────────────────────────────────────────────
// Playwright check (santifer's logic + freshness layer)
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

    // Give SPAs (Ashby, Lever, Workday) time to hydrate
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    const html = await page.content();

    // Extract apply controls — santifer's improved logic that filters out
    // nav/header/footer (fixes the Workday split-view false-positive bug)
    const applyControls = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]')
      );

      return candidates
        .filter((element) => {
          if (element.closest('nav, header, footer')) return false;
          if (element.closest('[aria-hidden="true"]')) return false;

          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (!element.getClientRects().length) return false;

          return Array.from(element.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
        })
        .map((element) => {
          const label = [
            element.innerText,
            element.value,
            element.getAttribute('aria-label'),
            element.getAttribute('title'),
          ]
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

          return label;
        })
        .filter(Boolean);
    });

    // Liveness from santifer's classifier
    const liveness = classifyLiveness({ status, finalUrl, bodyText, applyControls });

    // Freshness layer — extract date from rendered HTML
    const datePosted = extractPostingDate(html);
    const days = ageInDays(datePosted);
    const freshness = classifyFreshness(datePosted, config);
    const dateStr = datePosted?.toISOString().slice(0, 10) ?? null;

    // If liveness says expired, that wins (URL is dead, age is moot)
    if (liveness.result === 'expired') {
      return { url, ...liveness, datePosted: dateStr, ageInDays: days, freshness: 'expired' };
    }

    // If freshness says expired, override active liveness — too old to bother
    if (freshness === 'expired') {
      return {
        url,
        result: 'expired',
        reason: `posting is ${days}d old (max: ${config.max_age_days})`,
        datePosted: dateStr,
        ageInDays: days,
        freshness,
      };
    }

    return { url, ...liveness, datePosted: dateStr, ageInDays: days, freshness };

  } catch (err) {
    return {
      url,
      result: 'expired',
      reason: `navigation error: ${err.message.split('\n')[0]}`,
      datePosted: null,
      ageInDays: null,
      freshness: 'expired',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Fetch-mode check (no Playwright; for batch workers)
// ─────────────────────────────────────────────────────────────────────

async function checkUrlFetch(url, config) {
  // LinkedIn ToS guard — never hit linkedin.com directly
  if (/linkedin\.com\//i.test(url)) {
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
    // Recent LinkedIn URL — heuristic doesn't catch it. Per CONTRIBUTING.md
    // we don't fetch LinkedIn directly. Return uncertain so the caller can
    // decide (Playwright path is OK if user runs it interactively).
    return {
      url,
      result: 'uncertain',
      reason: 'LinkedIn fetch blocked by ToS — use Playwright mode if needed',
      datePosted: null,
      ageInDays: null,
      freshness: 'unverified',
    };
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
    const finalUrl = response.url;
    const html = await response.text();

    const datePosted = extractPostingDate(html);
    const days = ageInDays(datePosted);
    const freshness = classifyFreshness(datePosted, config);
    const dateStr = datePosted?.toISOString().slice(0, 10) ?? null;

    // Strip HTML tags for liveness pattern matching
    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Strongest positive: JSON-LD datePosted is present + fresh ──
    // ATS platforms only embed JSON-LD when the job is live. SPAs (Ashby,
    // Lever, Workday) have minimal stripped text but rich JSON-LD payloads,
    // so this short-circuit avoids false "insufficient content" rejections.
    if (datePosted) {
      if (freshness === 'expired') {
        return { url, result: 'expired', reason: `posting is ${days}d old (max: ${config.max_age_days})`, datePosted: dateStr, ageInDays: days, freshness };
      }
      return { url, result: 'active', reason: `JSON-LD datePosted (${days}d old)`, datePosted: dateStr, ageInDays: days, freshness };
    }

    // No date — fall back to liveness classifier with empty applyControls
    // (fetch-mode can't reliably extract them without rendering)
    const liveness = classifyLiveness({
      status,
      finalUrl,
      bodyText,
      applyControls: [], // fetch-mode has no DOM, so no apply controls
    });

    return { url, ...liveness, datePosted: null, ageInDays: null, freshness };

  } catch (err) {
    return {
      url,
      result: 'expired',
      reason: `fetch error: ${err.message.split('\n')[0]}`,
      datePosted: null,
      ageInDays: null,
      freshness: 'expired',
    };
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
    const text = await readFile(argv[fileIdx + 1], 'utf-8');
    urls = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  } else {
    urls = argv.filter((a, i) => !a.startsWith('--') && i !== fileIdx + 1);
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

  if (fetchMode) {
    // Fetch mode — parallel-safe (no shared browser state)
    const results = await Promise.all(urls.map(u => checkUrlFetch(u, config)));
    for (const r of results) {
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

// Only run main() when invoked directly, not when imported by tests
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
