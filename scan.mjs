#!/usr/bin/env node

/**
 * scan.mjs — Zero-token portal scanner
 *
 * Fetches Greenhouse, Ashby, Lever, Workday, and SmartRecruiters APIs
 * directly, applies title filters from portals.yml, deduplicates against
 * existing history, and appends new offers to pipeline.md + scan-history.tsv.
 *
 * Zero Claude API tokens — pure HTTP + JSON.
 *
 * Usage:
 *   node scan.mjs                  # scan all enabled companies
 *   node scan.mjs --dry-run        # preview without writing files
 *   node scan.mjs --company NVIDIA # scan a single company
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
import { fetchWithTimeout, poolMap } from './lib/fetch-utils.mjs';
const parseYaml = yaml.load;

// ── Config ──────────────────────────────────────────────────────────

const PORTALS_PATH = 'portals.yml';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';

// Ensure required directories exist (fresh setup)
mkdirSync('data', { recursive: true });

const CONCURRENCY = 10;
const FETCH_TIMEOUT_MS = 10_000;

// ── API detection ───────────────────────────────────────────────────

export function detectApi(company) {
  // Greenhouse: explicit api field
  if (company.api && company.api.includes('greenhouse')) {
    return { type: 'greenhouse', url: company.api };
  }

  const url = company.careers_url || '';

  // Ashby
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashbyMatch) {
    return {
      type: 'ashby',
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
    };
  }

  // Lever
  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (leverMatch) {
    return {
      type: 'lever',
      url: `https://api.lever.co/v0/postings/${leverMatch[1]}`,
    };
  }

  // Greenhouse EU boards
  const ghEuMatch = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (ghEuMatch && !company.api) {
    return {
      type: 'greenhouse',
      url: `https://boards-api.greenhouse.io/v1/boards/${ghEuMatch[1]}/jobs`,
    };
  }

  // Workday — matches {company}.wd{N}.myworkdayjobs.com/{career-site}
  // Builds the internal CXS JSON endpoint (no auth required for public boards).
  const wdMatch = url.match(/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:en-US\/)?([^/?#]+)/i);
  if (wdMatch) {
    const [, slug, wdN, site] = wdMatch;
    return {
      type: 'workday',
      url: `https://${slug}.${wdN}.myworkdayjobs.com/wday/cxs/${slug}/${site}/jobs`,
      meta: { slug, wdN, site },
    };
  }

  // SmartRecruiters — matches careers.{company}.com or {company}.com/careers-home
  // AMD, and others use this ATS. Public API requires no auth.
  const srMatch = url.match(/careers\.([a-z0-9-]+)\.com\/careers-home/i) ||
                  url.match(/([a-z0-9-]+)\.com\/careers-home/i);
  if (srMatch && company.smartrecruiters_id) {
    return {
      type: 'smartrecruiters',
      url: `https://api.smartrecruiters.com/v1/companies/${company.smartrecruiters_id}/postings?status=PUBLIC&limit=100`,
    };
  }

  return null;
}

// ── API parsers ─────────────────────────────────────────────────────

// ── Date normalizer ─────────────────────────────────────────────────
// Returns YYYY-MM-DD string from various ATS date formats.

function isoToDate(val) {
  if (!val) return '';
  try { return new Date(val).toISOString().slice(0, 10); } catch { return ''; }
}

// Workday returns human strings like "Posted 2 Days Ago", "Posted Today",
// "Posted 30+ Days Ago". Convert to approximate YYYY-MM-DD.
function workdayPostedToDate(str) {
  if (!str) return '';
  const s = str.toLowerCase();
  const today = new Date();
  if (s.includes('today') || s.includes('0 day')) return today.toISOString().slice(0, 10);
  const m = s.match(/(\d+)\+?\s*day/);
  if (m) {
    const d = new Date(today);
    d.setDate(d.getDate() - parseInt(m[1], 10));
    return (parseInt(m[1], 10) >= 30 ? '≥30d ' : '') + d.toISOString().slice(0, 10);
  }
  return '';
}

function parseGreenhouse(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.absolute_url || '',
    company: companyName,
    location: j.location?.name || '',
    posted: isoToDate(j.first_published || j.updated_at),
  }));
}

function parseAshby(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.jobUrl || '',
    company: companyName,
    location: j.location || '',
    posted: isoToDate(j.publishedAt),
  }));
}

function parseLever(json, companyName) {
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    title: j.text || '',
    url: j.hostedUrl || '',
    company: companyName,
    location: j.categories?.location || '',
    // createdAt is Unix ms
    posted: j.createdAt ? new Date(j.createdAt).toISOString().slice(0, 10) : '',
  }));
}

function parseWorkday(json, companyName, meta) {
  const postings = json.jobPostings || [];
  const base = `https://${meta.slug}.${meta.wdN}.myworkdayjobs.com/en-US/${meta.site}`;
  return postings.map(j => ({
    title: j.title || '',
    // externalPath is like "/job/Seattle/Solutions-Architect_R12345"
    url: `${base}${j.externalPath || ''}`,
    company: companyName,
    location: j.locationsText || '',
    posted: workdayPostedToDate(j.postedOn),
  }));
}

function parseSmartRecruiters(json, companyName) {
  const content = json.content || [];
  return content.map(j => ({
    title: j.name || '',
    url: j.ref || `https://careers.smartrecruiters.com/${j.company?.identifier || ''}/${j.id}`,
    company: companyName,
    location: j.location?.city || j.location?.country || '',
    posted: isoToDate(j.releasedDate || j.updatedAt),
  }));
}

const PARSERS = {
  greenhouse: parseGreenhouse,
  ashby: parseAshby,
  lever: parseLever,
  workday: parseWorkday,
  smartrecruiters: parseSmartRecruiters,
};

// ── Fetch with timeout ──────────────────────────────────────────────

async function fetchJson(url) {
  const { ok, status, text } = await fetchWithTimeout(url, {}, FETCH_TIMEOUT_MS);
  if (!ok) throw new Error(`HTTP ${status}`);
  return JSON.parse(text);
}

// Workday requires a POST with a JSON body; supports pagination via offset.
// Each page gets its own timeout (FETCH_TIMEOUT_MS); a cumulative budget
// scaled to maxResults caps the total request time so a single huge tenant
// (e.g. Micron's 2,889-job board) doesn't stall the whole scan.
async function fetchWorkday(apiUrl, { searchText = '', maxResults = 500 } = {}) {
  const estimatedPages = Math.ceil(maxResults / 20);
  const totalBudgetMs = Math.max(FETCH_TIMEOUT_MS * 2, estimatedPages * 500);
  const startedAt = Date.now();

  // Workday's public API caps at 20 results per page (limit > 20 → HTTP 400).
  const LIMIT = 20;
  let offset = 0;
  let allPostings = [];
  let total = Infinity;

  while (offset < total && allPostings.length < maxResults) {
    if (Date.now() - startedAt > totalBudgetMs) {
      throw new Error(`workday fetch exceeded total budget (${totalBudgetMs}ms)`);
    }
    const { ok, status, text } = await fetchWithTimeout(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appliedFacets: {}, limit: LIMIT, offset, searchText }),
    }, FETCH_TIMEOUT_MS);
    if (!ok) throw new Error(`HTTP ${status}`);
    const data = JSON.parse(text);
    const postings = data.jobPostings || [];
    total = data.total ?? postings.length;
    allPostings = allPostings.concat(postings);
    offset += postings.length;
    if (postings.length < LIMIT) break; // no more pages
  }

  return { jobPostings: allPostings, total: allPostings.length };
}

// ── Title filter ────────────────────────────────────────────────────

export function buildTitleFilter(titleFilter) {
  const positive = (titleFilter?.positive || []).map(k => k.toLowerCase());
  const negative = (titleFilter?.negative || []).map(k => k.toLowerCase());

  return (title) => {
    const lower = title.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNegative = negative.some(k => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

// ── Dedup ───────────────────────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();

  // scan-history.tsv
  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) { // skip header
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }

  // pipeline.md — extract URLs from checkbox lines
  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(match[1]);
    }
  }

  // applications.md — extract URLs from report links and any inline URLs
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0]);
    }
  }

  return seen;
}

function loadSeenCompanyRoles() {
  const seen = new Set();
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    // Parse markdown table rows: | # | Date | Company | Role | ...
    for (const match of text.matchAll(/\|[^|]+\|[^|]+\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g)) {
      const company = match[1].trim().toLowerCase();
      const role = match[2].trim().toLowerCase();
      if (company && role && company !== 'company') {
        seen.add(`${company}::${role}`);
      }
    }
  }
  return seen;
}

// ── Pipeline writer ─────────────────────────────────────────────────

function appendToPipeline(offers, date) {
  if (offers.length === 0) return;

  let text = readFileSync(PIPELINE_PATH, 'utf-8');

  // Find "## Pendientes" section and append after it
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    // No Pendientes section — append at end before Procesadas
    const procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block = `\n${marker}\n\n` + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title} | ${o.posted || date}`
    ).join('\n') + '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    // Find the end of existing Pendientes content (next ## or end)
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;

    const block = '\n' + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title} | ${o.posted || date}`
    ).join('\n') + '\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }

  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(offers, date) {
  // Ensure file + header exist
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }

  const lines = offers.map(o =>
    `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded`
  ).join('\n') + '\n';

  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// parallelFetch replaced by poolMap from lib/fetch-utils.mjs (shared with triage/heartbeat).

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const companyFlag = args.indexOf('--company');
  const filterCompany = companyFlag !== -1 ? args[companyFlag + 1]?.toLowerCase() : null;

  // 1. Read portals.yml
  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const companies = config.tracked_companies || [];
  const titleFilter = buildTitleFilter(config.title_filter);

  // 2. Filter to enabled companies with detectable APIs
  const targets = companies
    .filter(c => c.enabled !== false)
    .filter(c => !filterCompany || c.name.toLowerCase().includes(filterCompany))
    .map(c => ({ ...c, _api: detectApi(c) }))
    .filter(c => c._api !== null);

  const skippedCount = companies.filter(c => c.enabled !== false).length - targets.length;

  console.log(`Scanning ${targets.length} companies via API (${skippedCount} skipped — no API detected)`);
  if (dryRun) console.log('(dry run — no files will be written)\n');

  // 3. Load dedup sets
  const seenUrls = loadSeenUrls();
  const seenCompanyRoles = loadSeenCompanyRoles();

  // 4. Fetch all APIs
  const date = new Date().toISOString().slice(0, 10);
  let totalFound = 0;
  let totalFiltered = 0;
  let totalDupes = 0;
  const newOffers = [];
  const errors = [];

  const tasks = targets.map(company => async () => {
    const { type, url, meta } = company._api;
    try {
      // Workday requires a POST-based paginated fetch; all others use GET.
      const json = type === 'workday'
        ? await fetchWorkday(url)
        : await fetchJson(url);
      const jobs = type === 'workday'
        ? PARSERS.workday(json, company.name, meta)
        : PARSERS[type](json, company.name);
      totalFound += jobs.length;

      for (const job of jobs) {
        if (!titleFilter(job.title)) {
          totalFiltered++;
          continue;
        }
        if (seenUrls.has(job.url)) {
          totalDupes++;
          continue;
        }
        const key = `${job.company.toLowerCase()}::${job.title.toLowerCase()}`;
        if (seenCompanyRoles.has(key)) {
          totalDupes++;
          continue;
        }
        // Mark as seen to avoid intra-scan dupes
        seenUrls.add(job.url);
        seenCompanyRoles.add(key);
        newOffers.push({ ...job, source: `${type}-api` });
      }
    } catch (err) {
      errors.push({ company: company.name, error: err.message });
    }
  });

  await poolMap(tasks, (task) => task(), CONCURRENCY);

  // 5. Write results
  if (!dryRun && newOffers.length > 0) {
    appendToPipeline(newOffers, date);
    appendToScanHistory(newOffers, date);
  }

  // 6. Print summary
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Portal Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Companies scanned:     ${targets.length}`);
  console.log(`Total jobs found:      ${totalFound}`);
  console.log(`Filtered by title:     ${totalFiltered} removed`);
  console.log(`Duplicates:            ${totalDupes} skipped`);
  console.log(`New offers added:      ${newOffers.length}`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  ✗ ${e.company}: ${e.error}`);
    }
  }

  if (newOffers.length > 0) {
    console.log('\nNew offers:');
    for (const o of newOffers) {
      console.log(`  + ${o.company} | ${o.title} | ${o.location || 'N/A'} | posted:${o.posted || '?'}`);
    }
    if (dryRun) {
      console.log('\n(dry run — run without --dry-run to save results)');
    } else {
      console.log(`\nResults saved to ${PIPELINE_PATH} and ${SCAN_HISTORY_PATH}`);
    }
  }

  console.log(`\n→ Run /career-ops pipeline to evaluate new offers.`);
  console.log('→ Share results and get help: https://discord.gg/8pRpHETxa4');
}

// Guard: only run main() when invoked as the entrypoint, so test files can
// import this module without triggering the script.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
