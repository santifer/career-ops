#!/usr/bin/env node

/**
 * discover-personio.mjs — Personio tenant discovery via web intelligence.
 *
 * Personio uses a wildcard SSL certificate (*.jobs.personio.de), so
 * Certificate Transparency logs cannot enumerate individual tenants.
 * Instead, this script combines multiple free web-intelligence sources:
 *   - Common Crawl CDX index (primary — ~4,000+ slugs across 12 monthly crawls)
 *   - HackerTarget hostsearch (passive DNS, ~50 free)
 *   - urlscan.io search API (~35 free)
 *
 * For each discovered tenant, it hits the public search.json feed,
 * applies title/location/content filters from portals.yml, and outputs:
 *   - Matching jobs → pipeline.md + scan-history.tsv
 *   - Company suggestions → data/discovery-report.md (portals.yml YAML snippets)
 *
 * The cache is additive: slugs accumulate across runs and are never removed.
 *
 * Usage:
 *   node discover-personio.mjs                # full discovery run
 *   node discover-personio.mjs --dry-run      # preview without writing files
 *   node discover-personio.mjs --refresh      # force re-query all sources (merge into cache)
 *   node discover-personio.mjs --slugs-only   # enumerate + cache slugs, don't scan feeds
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { pathToFileURL } from 'url';
import yaml from 'js-yaml';
import {
  buildTitleFilter,
  buildLocationFilter,
  buildContentFilter,
  appendToPipeline,
  appendToScanHistory,
  loadSeenUrls,
} from './scan.mjs';

// ── Config ──────────────────────────────────────────────────────────

const PORTALS_PATH = process.env.CAREER_OPS_PORTALS || 'portals.yml';
const CACHE_PATH = 'data/personio-tenants.json';
const REPORT_PATH = 'data/discovery-report.md';
const CACHE_TTL_DAYS = 7;
const CONCURRENCY = 10;
const STAGGER_MS = 200;
const TENANT_TIMEOUT_MS = 10_000;
const SOURCE_TIMEOUT_MS = 30_000;
const CC_MAX_INDICES = 12;

const PERSONIO_SLUG_RE = /^([a-z0-9][a-z0-9-]*)\.jobs\.personio\.(de|com)$/i;
const PERSONIO_URL_RE = /https?:\/\/([a-z0-9][a-z0-9-]*)\.jobs\.personio\.(de|com)/i;

// ── Multi-source tenant enumeration ─────────────────────────────────
// Personio uses a wildcard SSL certificate (*.jobs.personio.de), so CT
// logs only reveal the wildcard — not individual tenant subdomains.
// Instead we combine multiple free web-intelligence sources.
//
// Coverage (observed Jul 2026):
//   Common Crawl (12 indices): ~4,100 slugs   (primary)
//   HackerTarget hostsearch:   ~50 slugs       (supplement, free tier)
//   urlscan.io search:         ~35 slugs       (supplement, free tier)
//   Wayback Machine CDX:       marginal        (included for completeness)
//
// The cache is additive: slugs discovered in any run are retained even
// if a source stops listing them. --refresh re-queries all sources and
// merges into the existing cache.

/**
 * Extract Personio tenant slugs from a URL string.
 * @param {string} url
 * @returns {string|null} lowercase slug or null
 */
function extractSlug(url) {
  const m = url.match(PERSONIO_URL_RE);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Query Common Crawl's CDX index API across multiple monthly crawl indices.
 * Each index captures a different snapshot of the web, so querying many
 * indices maximises coverage of ephemeral / low-traffic Personio tenants.
 * @returns {Promise<Set<string>>}
 */
async function fetchCommonCrawlSlugs() {
  let indices;
  try {
    const res = await fetch('https://index.commoncrawl.org/collinfo.json', {
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    });
    indices = (await res.json()).slice(0, CC_MAX_INDICES).map(i => i.id);
  } catch (err) {
    console.error(`  ⚠️  Common Crawl index list failed: ${err.message}`);
    return new Set();
  }

  const slugs = new Set();
  for (const idx of indices) {
    const url = `https://index.commoncrawl.org/${idx}-index?url=*.jobs.personio.de&output=json&limit=10000`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
      const text = await res.text();
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          const slug = extractSlug(obj.url || '');
          if (slug) slugs.add(slug);
        } catch { /* skip malformed lines */ }
      }
    } catch (err) {
      console.error(`  ⚠️  ${idx}: ${err.message}`);
    }
  }
  return slugs;
}

/**
 * Query HackerTarget's free hostsearch API (passive DNS).
 * Free tier returns ~50 results — no auth needed.
 */
async function fetchHackerTargetSlugs() {
  const url = 'https://api.hackertarget.com/hostsearch/?q=jobs.personio.de';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
    const text = await res.text();
    const slugs = new Set();
    for (const m of text.matchAll(/([a-z0-9][a-z0-9-]*)\.jobs\.personio\.(de|com)/gi)) {
      slugs.add(m[1].toLowerCase());
    }
    return slugs;
  } catch (err) {
    console.error(`  ⚠️  HackerTarget failed: ${err.message}`);
    return new Set();
  }
}

/**
 * Query urlscan.io's free search API (web scan results).
 * Returns domains observed in public URL scans — no auth needed.
 */
async function fetchUrlscanSlugs() {
  const url = 'https://urlscan.io/api/v1/search/?q=domain:jobs.personio.de&size=1000';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
    const data = await res.json();
    const slugs = new Set();
    for (const r of (data.results || [])) {
      const domain = r.page?.domain || '';
      const m = domain.match(PERSONIO_SLUG_RE);
      if (m) slugs.add(m[1].toLowerCase());
    }
    return slugs;
  } catch (err) {
    console.error(`  ⚠️  urlscan.io failed: ${err.message}`);
    return new Set();
  }
}

/**
 * Enumerate all Personio tenant slugs from multiple web-intelligence sources.
 * Results are merged into an additive cache so coverage grows over time.
 * @param {{ refresh?: boolean }} options
 * @returns {Promise<Set<string>>}
 */
export async function enumerateSlugs({ refresh = false } = {}) {
  // Load existing cache (even on refresh — we merge additively)
  let cachedSlugs = new Set();
  let cacheAge = Infinity;
  if (existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
      cachedSlugs = new Set(cached.slugs || []);
      cacheAge = Date.now() - new Date(cached.fetchedAt).getTime();
    } catch { /* ignore corrupt cache */ }
  }

  if (!refresh && cacheAge < CACHE_TTL_DAYS * 86_400_000 && cachedSlugs.size > 0) {
    console.log(`Using cached slug list (${cachedSlugs.size} slugs, age ${Math.round(cacheAge / 86_400_000)}d)`);
    return cachedSlugs;
  }

  console.log('Enumerating Personio tenants from multiple sources…');

  // Query all sources in parallel
  const [ccSlugs, htSlugs, usSlugs] = await Promise.all([
    fetchCommonCrawlSlugs().then(s => { console.log(`  Common Crawl:  ${s.size} slugs`); return s; }),
    fetchHackerTargetSlugs().then(s => { console.log(`  HackerTarget:  ${s.size} slugs`); return s; }),
    fetchUrlscanSlugs().then(s => { console.log(`  urlscan.io:    ${s.size} slugs`); return s; }),
  ]);

  // Merge all sources + existing cache (additive — never remove slugs)
  const all = new Set([...cachedSlugs, ...ccSlugs, ...htSlugs, ...usSlugs]);

  if (all.size === 0) {
    console.warn('All sources returned empty — no tenants discovered');
    return all;
  }

  const newCount = all.size - cachedSlugs.size;
  console.log(`  Total unique:  ${all.size} slugs (${newCount} new since last cache)`);

  // Persist merged cache
  mkdirSync('data', { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify({
    fetchedAt: new Date().toISOString(),
    sources: {
      commonCrawl: ccSlugs.size,
      hackerTarget: htSlugs.size,
      urlscan: usSlugs.size,
      previousCache: cachedSlugs.size,
    },
    slugs: [...all].sort(),
  }, null, 2), 'utf-8');

  return all;
}

// ── Tenant job scanner ──────────────────────────────────────────────

export function humanizeSlug(slug) {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Fetch the public search.json feed for a Personio tenant.
 * Tries .de first, then .com.
 * @param {string} slug
 * @returns {Promise<{tld: string, jobs: Array}|null>}
 */
export async function fetchTenantJobs(slug) {
  for (const tld of ['de', 'com']) {
    const url = `https://${slug}.jobs.personio.${tld}/search.json`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TENANT_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      });
      if (res.status === 429) {
        const err = new Error(`Rate limited (429) for ${slug}.jobs.personio.${tld}`);
        err.rateLimited = true;
        throw err;
      }
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trim()) continue;
      const data = JSON.parse(text);
      if (!Array.isArray(data)) continue;

      return {
        tld,
        jobs: data.map(job => ({
          title: job.name || '',
          url: `https://${slug}.jobs.personio.${tld}/job/${job.id}`,
          company: humanizeSlug(slug),
          location: Array.isArray(job.offices)
            ? job.offices.join(', ')
            : (job.office || ''),
          description: job.description || '',
          department: job.department || '',
        })),
      };
    } catch (err) {
      if (err.rateLimited) throw err;
      continue;
    }
  }
  return null;
}

// ── Already-tracked slug extraction ─────────────────────────────────

export function loadTrackedPersonioSlugs(portalsPath) {
  if (!existsSync(portalsPath)) return new Set();
  let config;
  try {
    config = yaml.load(readFileSync(portalsPath, 'utf-8')) || {};
  } catch {
    return new Set();
  }
  const companies = Array.isArray(config.tracked_companies) ? config.tracked_companies : [];
  const slugs = new Set();
  for (const entry of companies) {
    if (!entry?.careers_url) continue;
    const slug = extractSlug(entry.careers_url);
    if (slug) slugs.add(slug);
  }
  return slugs;
}

// ── Parallel runner with stagger ────────────────────────────────────

async function parallelRun(items, fn, { concurrency = 10, staggerMs = 0 } = {}) {
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
      if (staggerMs > 0 && idx < items.length) {
        await new Promise(r => setTimeout(r, staggerMs));
      }
    }
  }

  const count = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: count }, () => worker()));
  return results;
}

// ── Discovery report generator ──────────────────────────────────────

function generateReport(discoveries, date) {
  const lines = [
    `# Personio Discovery Report — ${date}`,
    '',
    `Discovered **${discoveries.length}** companies with matching jobs via Certificate Transparency scan.`,
    '',
    'Copy the YAML blocks below into `portals.yml` under `tracked_companies:` to track them.',
    '',
    '---',
    '',
  ];

  for (const d of discoveries) {
    const jobLabel = d.matchingJobs !== 1 ? 'jobs' : 'job';
    lines.push(`## ${d.company} (${d.matchingJobs} matching ${jobLabel}, ${d.totalJobs} total)`);
    lines.push('');
    lines.push('```yaml');
    lines.push(`- name: ${d.company}`);
    lines.push(`  careers_url: https://${d.slug}.jobs.personio.${d.tld}`);
    lines.push(`  notes: "${d.location}. ${d.totalJobs} positions. Discovered via CT on ${date}."`);
    lines.push(`  enabled: true`);
    lines.push('```');
    lines.push('');
    lines.push('Matching jobs:');
    for (const job of d.jobs) {
      lines.push(`- [${job.title}](${job.url}) | ${job.location}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const refresh = args.includes('--refresh');
  const slugsOnly = args.includes('--slugs-only');

  // 1. Enumerate slugs from CT logs
  const allSlugs = await enumerateSlugs({ refresh });

  if (allSlugs.size === 0) {
    console.error('No Personio tenants found. Check network connectivity and retry with --refresh.');
    process.exit(1);
  }

  if (slugsOnly) {
    console.log(`\n${allSlugs.size} Personio tenants cached to ${CACHE_PATH}`);
    return;
  }

  // 2. Load portals.yml for filters
  let config = {};
  if (existsSync(PORTALS_PATH)) {
    try {
      config = yaml.load(readFileSync(PORTALS_PATH, 'utf-8')) || {};
    } catch {
      console.warn('Could not parse portals.yml — running without filters');
    }
  }
  const titleFilter = buildTitleFilter(config.title_filter);
  const locationFilter = buildLocationFilter(config.location_filter);
  const contentFilter = buildContentFilter(config.content_filter);

  // 3. Exclude already-tracked Personio tenants
  const trackedSlugs = loadTrackedPersonioSlugs(PORTALS_PATH);
  const newSlugs = [...allSlugs].filter(s => !trackedSlugs.has(s));
  console.log(`\n${allSlugs.size} total slugs, ${trackedSlugs.size} already tracked, ${newSlugs.length} to scan`);

  if (newSlugs.length === 0) {
    console.log('All discovered tenants are already tracked — nothing to do.');
    return;
  }

  // 4. Scan tenant feeds
  console.log(`Scanning ${newSlugs.length} tenant feeds (${CONCURRENCY} concurrent, ${STAGGER_MS}ms stagger)…\n`);

  const date = new Date().toISOString().slice(0, 10);
  const { seen: seenUrls } = loadSeenUrls();

  let activeTenants = 0;
  let totalJobs = 0;
  let filteredTitle = 0;
  let filteredLocation = 0;
  let filteredContent = 0;
  let dupes = 0;
  const newOffers = [];
  /** @type {Map<string, {company:string, slug:string, tld:string, totalJobs:number, matchingJobs:number, jobs:Array, location:string}>} */
  const discoveredCompanies = new Map();

  let discoveryErrors = 0;
  let discoveryRetries = 0;
  const RETRY_MAX = 2;
  const RETRY_BASE_MS = 2000;

  await parallelRun(newSlugs, async (slug) => {
    let result;
    let lastErr;
    for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
      try {
        result = await fetchTenantJobs(slug);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < RETRY_MAX) {
          discoveryRetries++;
          const backoff = RETRY_BASE_MS * Math.pow(2, attempt) + Math.random() * 500;
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }
    if (lastErr) { discoveryErrors++; return; }
    if (!result || result.jobs.length === 0) return;

    activeTenants++;
    totalJobs += result.jobs.length;

    const matches = [];
    for (const job of result.jobs) {
      if (!titleFilter(job.title)) { filteredTitle++; continue; }
      if (!locationFilter(job.location)) { filteredLocation++; continue; }
      if (!contentFilter(job.description)) { filteredContent++; continue; }
      if (seenUrls.has(job.url)) { dupes++; continue; }

      seenUrls.add(job.url);
      matches.push(job);
    }

    if (matches.length > 0) {
      for (const m of matches) {
        newOffers.push({ ...m, source: 'personio-discovery' });
      }
      discoveredCompanies.set(slug, {
        company: humanizeSlug(slug),
        slug,
        tld: result.tld,
        totalJobs: result.jobs.length,
        matchingJobs: matches.length,
        jobs: matches,
        location: result.jobs[0]?.location || 'Unknown',
      });
    }
  }, { concurrency: CONCURRENCY, staggerMs: STAGGER_MS });

  // 5. Summary
  console.log(`\n${'━'.repeat(50)}`);
  console.log(`Personio Discovery — ${date}`);
  console.log(`${'━'.repeat(50)}`);
  console.log(`Tenants scanned:       ${newSlugs.length}`);
  console.log(`Active tenants:        ${activeTenants}`);
  console.log(`Total jobs found:      ${totalJobs}`);
  console.log(`Filtered by title:     ${filteredTitle} removed`);
  console.log(`Filtered by location:  ${filteredLocation} removed`);
  console.log(`Filtered by content:   ${filteredContent} removed`);
  console.log(`Duplicates:            ${dupes} skipped`);
  if (discoveryErrors > 0) {
    const errorRate = Math.round((discoveryErrors / newSlugs.length) * 100);
    console.log(`Errors (rate-limited): ${discoveryErrors} (${errorRate}%, ${discoveryRetries} retries)`);
  }
  console.log(`New companies found:   ${discoveredCompanies.size}`);
  console.log(`New offers matched:    ${newOffers.length}`);

  if (newOffers.length > 0) {
    console.log('\nNew offers:');
    for (const o of newOffers) {
      console.log(`  + ${o.company} | ${o.title} | ${o.location}`);
    }
  }

  // 6. Write outputs
  if (!dryRun && newOffers.length > 0) {
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
    console.log(`\nResults saved to pipeline.md and scan-history.tsv`);
  }

  if (discoveredCompanies.size > 0) {
    const report = generateReport([...discoveredCompanies.values()], date);
    if (!dryRun) {
      mkdirSync('data', { recursive: true });
      writeFileSync(REPORT_PATH, report, 'utf-8');
      console.log(`Discovery report saved to ${REPORT_PATH}`);
    } else {
      console.log('\n--- Discovery Report (dry run) ---\n');
      console.log(report);
    }
  }

  if (dryRun) {
    console.log('\n(dry run — no files were written)');
  }

  console.log(`\n→ Review ${REPORT_PATH} and add companies to portals.yml for zero-token scanning.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
