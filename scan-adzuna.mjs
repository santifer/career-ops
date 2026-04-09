#!/usr/bin/env node

/**
 * scan-adzuna.mjs — Adzuna API job scanner
 *
 * Queries the Adzuna public API for job listings matching the candidate's
 * target keywords (from portals.yml title_filter), filters by relevance,
 * deduplicates against scan-history.tsv and pipeline.md, and adds new
 * offers to the pipeline for evaluation.
 *
 * Why Adzuna: native Spain coverage (country=es), structured salary data,
 * aggregates listings from LinkedIn / Indeed / company sites. Free API
 * with no scraping, no proxies, no ban risk.
 *
 * Usage:
 *   node scan-adzuna.mjs                          # default: Spain, all queries
 *   node scan-adzuna.mjs --country=gb             # UK
 *   node scan-adzuna.mjs --countries=es,gb,de     # multi-country
 *   node scan-adzuna.mjs --remote-only            # only remote/teletrabajo
 *   node scan-adzuna.mjs --max-pages=3            # limit pages per query
 *   node scan-adzuna.mjs --dry-run                # don't write files
 *
 * Credentials (required):
 *   Set environment variables:
 *     ADZUNA_APP_ID=your_app_id
 *     ADZUNA_APP_KEY=your_app_key
 *
 *   Or create a .env.adzuna file in the project root with:
 *     ADZUNA_APP_ID=your_app_id
 *     ADZUNA_APP_KEY=your_app_key
 *
 *   Get free credentials at: https://developer.adzuna.com/signup
 *
 * Output:
 *   - Adds new offers to data/pipeline.md (under "Pendientes" section)
 *   - Records all results in data/scan-history.tsv
 *   - Prints summary to stdout
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// ── Config ──────────────────────────────────────────────────────

const ADZUNA_BASE = 'https://api.adzuna.com/v1/api/jobs';
const SUPPORTED_COUNTRIES = ['gb', 'us', 'at', 'au', 'be', 'br', 'ca', 'ch', 'de', 'es', 'fr', 'in', 'it', 'mx', 'nl', 'nz', 'pl', 'ru', 'sg', 'za'];
const RESULTS_PER_PAGE = 50;          // Adzuna max per request
const DEFAULT_MAX_PAGES = 5;          // 250 results per query
const REQUEST_DELAY_MS = 250;         // Be polite to the API

const PIPELINE_FILE = join(ROOT, 'data/pipeline.md');
const SCAN_HISTORY_FILE = join(ROOT, 'data/scan-history.tsv');
const APPLICATIONS_FILE = join(ROOT, 'data/applications.md');
const PORTALS_FILE = join(ROOT, 'portals.yml');
const ENV_FILE = join(ROOT, '.env.adzuna');

// ── CLI args ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const argMap = {};
for (const arg of args) {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    argMap[key] = value === undefined ? true : value;
  }
}

const COUNTRIES = (argMap.countries || argMap.country || 'es').split(',').map(c => c.trim().toLowerCase());
const REMOTE_ONLY = argMap['remote-only'] === true;
const MAX_PAGES = parseInt(argMap['max-pages'] || DEFAULT_MAX_PAGES, 10);
const DRY_RUN = argMap['dry-run'] === true;

// Validate countries
for (const c of COUNTRIES) {
  if (!SUPPORTED_COUNTRIES.includes(c)) {
    console.error(`❌ Invalid country code: ${c}`);
    console.error(`   Supported: ${SUPPORTED_COUNTRIES.join(', ')}`);
    process.exit(1);
  }
}

// ── Credentials loading ─────────────────────────────────────────

function loadCredentials() {
  let appId = process.env.ADZUNA_APP_ID;
  let appKey = process.env.ADZUNA_APP_KEY;

  // Fallback: parse .env.adzuna file
  if ((!appId || !appKey) && existsSync(ENV_FILE)) {
    const content = readFileSync(ENV_FILE, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      const value = rest.join('=').trim().replace(/^["']|["']$/g, '');
      if (key.trim() === 'ADZUNA_APP_ID' && !appId) appId = value;
      if (key.trim() === 'ADZUNA_APP_KEY' && !appKey) appKey = value;
    }
  }

  if (!appId || !appKey) {
    console.error('❌ Adzuna credentials missing.');
    console.error('');
    console.error('Set environment variables:');
    console.error('  export ADZUNA_APP_ID=your_app_id');
    console.error('  export ADZUNA_APP_KEY=your_app_key');
    console.error('');
    console.error('Or create .env.adzuna in project root:');
    console.error('  ADZUNA_APP_ID=your_app_id');
    console.error('  ADZUNA_APP_KEY=your_app_key');
    console.error('');
    console.error('Get free credentials at: https://developer.adzuna.com/signup');
    process.exit(1);
  }

  return { appId, appKey };
}

// ── Minimal YAML parser for portals.yml title_filter ────────────
//
// Avoids adding a yaml dependency. Only handles the structure we need:
// title_filter:
//   positive:
//     - "keyword"
//   negative:
//     - "keyword"

function parseTitleFilter(yamlContent) {
  const result = { positive: [], negative: [] };
  const lines = yamlContent.split('\n');

  let inTitleFilter = false;
  let currentList = null;

  for (const line of lines) {
    // Detect title_filter section
    if (/^title_filter:\s*$/.test(line)) {
      inTitleFilter = true;
      continue;
    }
    if (!inTitleFilter) continue;

    // Detect end of title_filter (top-level key at column 0)
    if (/^[a-zA-Z]/.test(line) && !line.startsWith('title_filter')) {
      inTitleFilter = false;
      continue;
    }

    // Detect positive: / negative: subsection (2-space indent)
    const subMatch = line.match(/^  (positive|negative|seniority_boost):\s*$/);
    if (subMatch) {
      currentList = subMatch[1];
      continue;
    }

    // Parse list item: "    - "keyword"" (4-space indent)
    if (currentList && (currentList === 'positive' || currentList === 'negative')) {
      const itemMatch = line.match(/^    - ["']?([^"']+)["']?\s*(?:#.*)?$/);
      if (itemMatch) {
        result[currentList].push(itemMatch[1].trim());
      }
    }
  }

  return result;
}

// ── Filtering logic ─────────────────────────────────────────────

function matchesTitleFilter(title, filter) {
  if (!title) return false;
  const lower = title.toLowerCase();

  // Reject if any negative keyword matches (substring)
  for (const neg of filter.negative) {
    if (lower.includes(neg.toLowerCase())) return false;
  }

  // Accept if any positive keyword matches
  for (const pos of filter.positive) {
    if (lower.includes(pos.toLowerCase())) return true;
  }

  return false;
}

function isRemote(job) {
  const haystack = `${job.title || ''} ${job.description || ''} ${job.location?.display_name || ''}`.toLowerCase();
  return /\b(remote|teletrabajo|remoto|home.office|fully.remote|100%.remote|work.from.home|wfh)\b/.test(haystack);
}

// ── Dedup ───────────────────────────────────────────────────────

function loadKnownUrls() {
  const known = new Set();

  // From scan-history.tsv
  if (existsSync(SCAN_HISTORY_FILE)) {
    const content = readFileSync(SCAN_HISTORY_FILE, 'utf-8');
    const lines = content.split('\n').slice(1); // skip header
    for (const line of lines) {
      const url = line.split('\t')[0];
      if (url) known.add(url);
    }
  }

  // From pipeline.md
  if (existsSync(PIPELINE_FILE)) {
    const content = readFileSync(PIPELINE_FILE, 'utf-8');
    const urlRegex = /https?:\/\/[^\s|]+/g;
    let match;
    while ((match = urlRegex.exec(content)) !== null) {
      known.add(match[0]);
    }
  }

  return known;
}

function loadKnownCompanyRoles() {
  const known = new Set();
  if (!existsSync(APPLICATIONS_FILE)) return known;

  const content = readFileSync(APPLICATIONS_FILE, 'utf-8');
  for (const line of content.split('\n')) {
    if (!line.startsWith('|') || line.includes('---')) continue;
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length >= 4) {
      // cols: # | Date | Company | Role | ...
      const company = cols[2];
      const role = cols[3];
      if (company && role && company !== 'Company') {
        known.add(`${normalizeCompany(company)}::${normalizeRole(role)}`);
      }
    }
  }
  return known;
}

function normalizeCompany(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeRole(role) {
  return (role || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
}

// ── Adzuna API client ───────────────────────────────────────────

async function searchAdzuna({ country, query, page, appId, appKey }) {
  const url = new URL(`${ADZUNA_BASE}/${country}/search/${page}`);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('app_key', appKey);
  url.searchParams.set('results_per_page', RESULTS_PER_PAGE);
  url.searchParams.set('what', query);
  url.searchParams.set('content-type', 'application/json');
  url.searchParams.set('sort_by', 'date');
  url.searchParams.set('max_days_old', '14');

  const response = await fetch(url.toString());
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Adzuna API error ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

// ── Query strategy ──────────────────────────────────────────────
//
// Build a focused set of search terms based on the user's target roles.
// We avoid the full positive list (too noisy) and instead use phrase
// queries that map to the actual archetypes.

const QUERY_TERMS = [
  // Core target roles
  'Solutions Architect AI',
  'Forward Deployed Engineer',
  'Founding Engineer AI',
  'Developer Advocate',
  'Developer Relations',
  'AI Engineer',
  'Technical Product Manager AI',
  'Solutions Engineer AI',
  'Customer Engineer AI',
  'Implementation Engineer AI',
  // Adjacent / agentic
  'AI Agent Engineer',
  'LLM Engineer',
  'Applied AI Engineer',
  'Platform Engineer AI',
];

// ── Main scan ───────────────────────────────────────────────────

async function main() {
  console.log('🔍 Adzuna API scanner');
  console.log(`   Countries: ${COUNTRIES.join(', ')}`);
  console.log(`   Remote-only: ${REMOTE_ONLY}`);
  console.log(`   Max pages per query: ${MAX_PAGES}`);
  console.log(`   Dry run: ${DRY_RUN}`);
  console.log('');

  const { appId, appKey } = loadCredentials();

  if (!existsSync(PORTALS_FILE)) {
    console.error(`❌ portals.yml not found at ${PORTALS_FILE}`);
    process.exit(1);
  }
  const portalsContent = readFileSync(PORTALS_FILE, 'utf-8');
  const titleFilter = parseTitleFilter(portalsContent);

  if (titleFilter.positive.length === 0) {
    console.error('❌ No positive keywords found in portals.yml title_filter.');
    process.exit(1);
  }
  console.log(`✓ Loaded ${titleFilter.positive.length} positive + ${titleFilter.negative.length} negative keywords`);

  const knownUrls = loadKnownUrls();
  const knownCompanyRoles = loadKnownCompanyRoles();
  console.log(`✓ Dedup against ${knownUrls.size} known URLs and ${knownCompanyRoles.size} known company+role pairs`);
  console.log('');

  const stats = {
    fetched: 0,
    titleMatch: 0,
    titleSkip: 0,
    dupSkip: 0,
    notRemote: 0,
    added: 0,
    apiErrors: 0,
  };

  const newOffers = []; // { url, title, company, country, location, salary }
  const historyRows = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const country of COUNTRIES) {
    for (const term of QUERY_TERMS) {
      console.log(`📡 ${country.toUpperCase()} :: "${term}"`);

      for (let page = 1; page <= MAX_PAGES; page++) {
        let data;
        try {
          data = await searchAdzuna({ country, query: term, page, appId, appKey });
        } catch (err) {
          console.error(`   ⚠️  Page ${page} failed: ${err.message}`);
          stats.apiErrors++;
          break;
        }

        const results = data.results || [];
        if (results.length === 0) break;

        stats.fetched += results.length;

        for (const job of results) {
          const url = job.redirect_url || job.url;
          const title = job.title || '';
          const company = job.company?.display_name || 'Unknown';
          const location = job.location?.display_name || '';
          const portalLabel = `Adzuna ${country.toUpperCase()}`;

          if (!url) continue;

          // Title filter
          if (!matchesTitleFilter(title, titleFilter)) {
            stats.titleSkip++;
            historyRows.push([url, today, portalLabel, title, company, 'skipped_title']);
            continue;
          }
          stats.titleMatch++;

          // Remote filter (optional)
          if (REMOTE_ONLY && !isRemote(job)) {
            stats.notRemote++;
            historyRows.push([url, today, portalLabel, title, company, 'skipped_not_remote']);
            continue;
          }

          // Dedup against known URLs
          if (knownUrls.has(url)) {
            stats.dupSkip++;
            historyRows.push([url, today, portalLabel, title, company, 'skipped_dup']);
            continue;
          }

          // Dedup against company+role
          const crKey = `${normalizeCompany(company)}::${normalizeRole(title)}`;
          if (knownCompanyRoles.has(crKey)) {
            stats.dupSkip++;
            historyRows.push([url, today, portalLabel, title, company, 'skipped_dup_companyrole']);
            continue;
          }

          // Build salary string if available
          let salary = '';
          if (job.salary_min && job.salary_max) {
            const cur = job.__CLASS__?.includes('GBP') ? '£' : (country === 'gb' ? '£' : (country === 'us' ? '$' : '€'));
            salary = `${cur}${Math.round(job.salary_min / 1000)}K-${Math.round(job.salary_max / 1000)}K`;
          }

          newOffers.push({ url, title, company, country, location, salary, portal: portalLabel });
          historyRows.push([url, today, portalLabel, title, company, 'added']);
          knownUrls.add(url); // dedup within this scan
          knownCompanyRoles.add(crKey);
          stats.added++;
        }

        // Pagination check
        if (results.length < RESULTS_PER_PAGE) break;
        await sleep(REQUEST_DELAY_MS);
      }
    }
  }

  console.log('');
  console.log('━'.repeat(50));
  console.log(`Adzuna Scan — ${today}`);
  console.log('━'.repeat(50));
  console.log(`API requests:        ~${stats.fetched / RESULTS_PER_PAGE | 0}`);
  console.log(`Jobs fetched:        ${stats.fetched}`);
  console.log(`Title matches:       ${stats.titleMatch}`);
  console.log(`Filtered by title:   ${stats.titleSkip}`);
  console.log(`Skipped (not remote):${stats.notRemote}`);
  console.log(`Skipped (dup):       ${stats.dupSkip}`);
  console.log(`API errors:          ${stats.apiErrors}`);
  console.log(`✨ NEW added:         ${stats.added}`);
  console.log('');

  if (newOffers.length > 0) {
    console.log('New offers:');
    for (const o of newOffers.slice(0, 30)) {
      console.log(`  + [${o.country.toUpperCase()}] ${o.company} | ${o.title}${o.salary ? ` | ${o.salary}` : ''}`);
    }
    if (newOffers.length > 30) console.log(`  ... and ${newOffers.length - 30} more`);
  }

  if (DRY_RUN) {
    console.log('');
    console.log('🧪 Dry run — no files written.');
    return;
  }

  // ── Write outputs ─────────────────────────────────────────────

  if (newOffers.length > 0) {
    appendToPipeline(newOffers);
    console.log('');
    console.log(`✅ Added ${newOffers.length} new offers to data/pipeline.md`);
  }

  if (historyRows.length > 0) {
    appendToHistory(historyRows);
    console.log(`✅ Logged ${historyRows.length} entries to data/scan-history.tsv`);
  }

  console.log('');
  console.log('Next: run /career-ops pipeline to evaluate the new offers.');
}

function appendToPipeline(offers) {
  let content = '';
  if (existsSync(PIPELINE_FILE)) {
    content = readFileSync(PIPELINE_FILE, 'utf-8');
  } else {
    content = '# Pipeline — Pending Offers\n\n## Pendientes\n\n## Procesadas\n';
  }

  // Build new section
  const today = new Date().toISOString().slice(0, 10);
  const block = [`### Adzuna scan — ${today}`];
  for (const o of offers) {
    const tail = o.salary ? ` | ${o.salary}` : '';
    block.push(`- [ ] ${o.url} | ${o.company} | ${o.title} (${o.country.toUpperCase()}${o.location ? `, ${o.location}` : ''})${tail}`);
  }
  block.push('');
  const insertion = block.join('\n');

  // Insert after "## Pendientes" header
  const pendientesIdx = content.indexOf('## Pendientes');
  if (pendientesIdx === -1) {
    // Append at end
    content = content + '\n' + insertion;
  } else {
    // Insert after the "## Pendientes" header line
    const lineEnd = content.indexOf('\n', pendientesIdx);
    content = content.slice(0, lineEnd + 1) + '\n' + insertion + content.slice(lineEnd + 1);
  }

  writeFileSync(PIPELINE_FILE, content, 'utf-8');
}

function appendToHistory(rows) {
  const header = 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n';
  let needHeader = false;
  if (!existsSync(SCAN_HISTORY_FILE)) {
    needHeader = true;
  } else {
    const first = readFileSync(SCAN_HISTORY_FILE, 'utf-8').split('\n')[0];
    if (!first.startsWith('url')) needHeader = true;
  }

  if (needHeader) {
    writeFileSync(SCAN_HISTORY_FILE, header, 'utf-8');
  }

  const lines = rows
    .map(r => r.map(c => String(c).replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t'))
    .join('\n') + '\n';

  appendFileSync(SCAN_HISTORY_FILE, lines, 'utf-8');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(err => {
  console.error('❌ Scanner failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
