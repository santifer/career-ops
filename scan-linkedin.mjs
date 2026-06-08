#!/usr/bin/env node
/**
 * scan-linkedin.mjs — LinkedIn Pulse job scanner (guest API, zero LLM tokens)
 *
 * Reads portals.yml LinkedIn Jobs section, fetches public job search results
 * using LinkedIn's guest API (no login required), parses job cards, deduplicates
 * against scan-history.tsv, and appends new offers to pipeline.md.
 *
 * Usage:
 *   node scan-linkedin.mjs                         # scan all LinkedIn queries
 *   node scan-linkedin.mjs --dry-run               # preview without writing files
 *   node scan-linkedin.mjs --query "Scrum Master"  # filter to matching queries
 *
 * LinkedIn blocking notes:
 *   - Returns HTTP 999 (non-standard) for bot-like requests → treated as rate-limit
 *   - Redirects to /authwall when session required → detected and skipped
 *   - 3 retries with exponential backoff per request
 *   - 2–3 s random sleep between queries
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';

const PORTALS_PATH      = 'portals.yml';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH     = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';

mkdirSync('data', { recursive: true });

const FETCH_TIMEOUT_MS      = 15_000;
const MAX_RESULTS_PER_QUERY = 25;
const SLEEP_MIN_MS          = 2000;
const SLEEP_MAX_MS          = 3500;
const MAX_RETRIES           = 3;

// Mirrors the UA pool in auto-submit.mjs
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

function randomUA() { return UA_POOL[Math.floor(Math.random() * UA_POOL.length)]; }
function sleep(ms)   { return new Promise(r => setTimeout(r, ms)); }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randSleep()   { return sleep(randInt(SLEEP_MIN_MS, SLEEP_MAX_MS)); }

function htmlDecode(str) {
  return (str || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .trim();
}

// ── LinkedIn guest fetch ─────────────────────────────────────────────────────

async function fetchLinkedIn(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':      randomUA(),
          'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control':   'no-cache',
        },
        redirect: 'follow',
      });

      const finalUrl = (res.url || '').toLowerCase();
      if (finalUrl.includes('/authwall') || finalUrl.includes('/login')) {
        clearTimeout(timer);
        return { status: 'authwall', html: '' };
      }

      // LinkedIn returns 999 for bot-detected requests (treat as rate-limit)
      if (res.status === 429 || res.status === 999) {
        const wait = attempt * 12000;
        console.warn(`    ⚠ Rate limited (HTTP ${res.status}). Waiting ${wait / 1000}s (attempt ${attempt}/${MAX_RETRIES})...`);
        clearTimeout(timer);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        clearTimeout(timer);
        return { status: 'error', html: '', statusCode: res.status };
      }

      const html = await res.text();
      clearTimeout(timer);
      return { status: 'ok', html };
    } catch (err) {
      clearTimeout(timer);
      if (attempt === MAX_RETRIES) return { status: 'error', html: '', error: err.message };
      await sleep(attempt * 3000);
    }
  }
  return { status: 'error', html: '' };
}

// ── HTML / JSON-LD parser ────────────────────────────────────────────────────

/**
 * Parse LinkedIn search result HTML for job cards.
 * Strategy 1 — JSON-LD structured data (most reliable, survives layout changes).
 * Strategy 2 — Regex HTML parsing of base-search-card structure.
 */
function parseLinkedInHtml(html) {
  const jobs = [];

  // Strategy 1: JSON-LD
  const jsonldRe = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  for (const [, raw] of html.matchAll(jsonldRe)) {
    try {
      const data  = JSON.parse(raw);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] !== 'JobPosting') continue;
        const title    = htmlDecode(item.title || '');
        const company  = htmlDecode(item.hiringOrganization?.name || '');
        const location = htmlDecode(
          item.jobLocation?.address?.addressLocality ||
          item.jobLocation?.description || ''
        );
        const url     = item.url || '';
        const idMatch = url.match(/\/jobs\/view\/(\d+)/);
        if (title && company && idMatch) {
          jobs.push({ id: idMatch[1], title, company, location,
            url: `https://www.linkedin.com/jobs/view/${idMatch[1]}`,
            _source: 'jsonld' });
        }
      }
    } catch { /* malformed JSON-LD — skip */ }
  }
  if (jobs.length > 0) return jobs;

  // Strategy 2: HTML card regex
  // Each card is anchored by data-entity-urn="urn:li:jobPosting:{id}"
  for (const [fullMatch, jobId] of html.matchAll(/data-entity-urn="urn:li:jobPosting:(\d+)"/g)) {
    const idx       = html.indexOf(fullMatch);
    const cardStart = Math.max(0, idx - 500);
    const cardEnd   = Math.min(html.length, idx + 2500);
    const card      = html.slice(cardStart, cardEnd);

    const titleM =
      card.match(/<h3[^>]*base-search-card__title[^>]*>\s*([\s\S]*?)\s*<\/h3>/i) ||
      card.match(/class="sr-only"[^>]*>\s*([\s\S]*?)\s*<\/span>/i);
    const title = titleM
      ? htmlDecode(titleM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
      : '';

    const companyM =
      card.match(/<h4[^>]*base-search-card__subtitle[^>]*>[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/i) ||
      card.match(/class="base-search-card__subtitle"[^>]*>\s*([\s\S]*?)\s*<\/[a-z]+>/i);
    const company = companyM
      ? htmlDecode(companyM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
      : '';

    const locationM = card.match(/<span[^>]*job-search-card__location[^>]*>\s*([\s\S]*?)\s*<\/span>/i);
    const location  = locationM
      ? htmlDecode(locationM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
      : '';

    if (jobId && (title || company)) {
      jobs.push({
        id: jobId,
        title:    title    || 'Unknown Title',
        company:  company  || 'Unknown Company',
        location,
        url: `https://www.linkedin.com/jobs/view/${jobId}`,
        _source: 'html',
      });
    }
  }

  return jobs;
}

// ── Search URL builder ───────────────────────────────────────────────────────

function buildSearchUrl(query, location, remote) {
  const params = new URLSearchParams({
    keywords: query,
    location,
    position: '1',
    pageNum:  '0',
    count:    String(MAX_RESULTS_PER_QUERY),
  });
  if (remote) params.set('f_WT', '2');
  return `https://www.linkedin.com/jobs/search/?${params}`;
}

// ── Title filter ─────────────────────────────────────────────────────────────

function buildTitleFilter(titleFilter) {
  const positive = (titleFilter?.positive || []).map(k => k.toLowerCase());
  const negative = (titleFilter?.negative || []).map(k => k.toLowerCase());
  return (title) => {
    const lower = title.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNegative = negative.some(k => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

// ── Dedup ────────────────────────────────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();

  if (existsSync(SCAN_HISTORY_PATH)) {
    for (const line of readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n').slice(1)) {
      const url = line.split('\t')[0]?.trim();
      if (url) seen.add(url);
    }
  }

  if (existsSync(PIPELINE_PATH)) {
    for (const m of readFileSync(PIPELINE_PATH, 'utf-8').matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(m[1]);
    }
  }

  if (existsSync(APPLICATIONS_PATH)) {
    for (const m of readFileSync(APPLICATIONS_PATH, 'utf-8').matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(m[0]);
    }
  }

  return seen;
}

// ── Writers ──────────────────────────────────────────────────────────────────

function appendToPipeline(offers) {
  if (offers.length === 0) return;
  if (!existsSync(PIPELINE_PATH)) {
    writeFileSync(PIPELINE_PATH, '# Pipeline\n\n## Pendientes\n\n## Procesadas\n', 'utf-8');
  }

  let text = readFileSync(PIPELINE_PATH, 'utf-8');
  const marker = '## Pendientes';
  const idx    = text.indexOf(marker);
  const block  = '\n' + offers.map(o => `- [ ] ${o.url} | ${o.company} | ${o.title}`).join('\n') + '\n';

  if (idx === -1) {
    text += `\n${marker}\n${block}`;
  } else {
    const afterMarker  = idx + marker.length;
    const nextSection  = text.indexOf('\n## ', afterMarker);
    const insertAt     = nextSection === -1 ? text.length : nextSection;
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }

  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(offers, date) {
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }
  appendFileSync(
    SCAN_HISTORY_PATH,
    offers.map(o => `${o.url}\t${date}\tlinkedin\t${o.title}\t${o.company}\tadded`).join('\n') + '\n',
    'utf-8'
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args     = process.argv.slice(2);
  const dryRun   = args.includes('--dry-run');
  const qFlag    = args.indexOf('--query');
  const filterQ  = qFlag !== -1 ? args[qFlag + 1]?.toLowerCase() : null;

  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config      = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
  const allQueries  = (config.search_queries || []).filter(q => q.board === 'linkedin');
  const titleFilter = buildTitleFilter(config.title_filter);

  const targets = filterQ
    ? allQueries.filter(q => q.query.toLowerCase().includes(filterQ))
    : allQueries;

  if (targets.length === 0) {
    console.log('No LinkedIn queries found in portals.yml (board: linkedin).');
    return;
  }

  console.log(`LinkedIn Pulse — scanning ${targets.length} quer${targets.length === 1 ? 'y' : 'ies'}`);
  if (dryRun) console.log('(dry run — no files will be written)');
  console.log('');

  const seenUrls = loadSeenUrls();
  const date     = new Date().toISOString().slice(0, 10);

  let totalFound    = 0;
  let totalFiltered = 0;
  let totalDupes    = 0;
  let totalBlocked  = 0;
  const newOffers   = [];
  const errors      = [];

  for (let qi = 0; qi < targets.length; qi++) {
    const q         = targets[qi];
    const searchUrl = buildSearchUrl(q.query, q.location, q.remote);
    const label     = `"${q.query}" @ ${q.location}`;

    process.stdout.write(`  [${qi + 1}/${targets.length}] ${label} ... `);

    const { status, html, statusCode, error } = await fetchLinkedIn(searchUrl);

    if (status === 'authwall') {
      console.log('BLOCKED (authwall)');
      totalBlocked++;
      errors.push({ query: label, error: 'authwall' });
      if (qi < targets.length - 1) await randSleep();
      continue;
    }

    if (status === 'error') {
      const msg = statusCode ? `HTTP ${statusCode}` : (error || 'unknown');
      console.log(`ERROR (${msg})`);
      errors.push({ query: label, error: msg });
      if (qi < targets.length - 1) await randSleep();
      continue;
    }

    const jobs = parseLinkedInHtml(html);
    totalFound += jobs.length;

    let queryNew = 0;
    for (const job of jobs) {
      if (!titleFilter(job.title)) { totalFiltered++; continue; }
      if (seenUrls.has(job.url))   { totalDupes++;    continue; }
      seenUrls.add(job.url);
      newOffers.push({ ...job, query: q.query });
      queryNew++;
    }

    console.log(`${jobs.length} found, ${queryNew} new`);

    if (qi < targets.length - 1) await randSleep();
  }

  // Write results
  if (!dryRun && newOffers.length > 0) {
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
  }

  // Summary
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`LinkedIn Pulse — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Queries run:           ${targets.length}`);
  console.log(`Jobs found (raw):      ${totalFound}`);
  console.log(`Filtered by title:     ${totalFiltered} removed`);
  console.log(`Duplicates:            ${totalDupes} skipped`);
  console.log(`Auth-blocked queries:  ${totalBlocked}`);
  console.log(`New offers added:      ${newOffers.length}`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  ✗ ${e.query}: ${e.error}`);
  }

  if (newOffers.length > 0) {
    console.log('\nNew offers:');
    for (const o of newOffers) {
      console.log(`  + ${o.company} | ${o.title} | ${o.location || 'N/A'}`);
    }
    if (dryRun) {
      console.log('\n(dry run — run without --dry-run to save results)');
    } else {
      console.log(`\nResults saved to ${PIPELINE_PATH} and ${SCAN_HISTORY_PATH}`);
    }
  }

  console.log(`\n→ Run /career-ops pipeline to evaluate new offers.`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
