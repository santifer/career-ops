#!/usr/bin/env node

/**
 * scan.mjs — Zero-token portal scanner
 *
 * Fetches Greenhouse, Ashby, Lever, BambooHR, Teamtailor, Workday, and UKG
 * (UltiPro) APIs directly, applies title/location filters from portals.yml,
 * deduplicates against existing history, and appends new offers to
 * pipeline.md + scan-history.tsv.
 *
 * Zero Claude API tokens — pure HTTP + JSON/XML.
 *
 * Usage:
 *   node scan.mjs                  # scan all enabled companies
 *   node scan.mjs --dry-run        # preview without writing files
 *   node scan.mjs --company Cohere # scan a single company
 *   node scan.mjs --since 7        # show offers added in the last 7 days
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
const parseYaml = yaml.load;

// ── Config ──────────────────────────────────────────────────────────

const PORTALS_PATH = 'portals.yml';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';

// Ensure required directories exist (fresh setup)
mkdirSync('data', { recursive: true });

const CONCURRENCY = 10;
const FETCH_TIMEOUT_MS = 12_000;
const WORKDAY_MAX_RESULTS = 200;
const WORKDAY_PAGE_SIZE = 20;
const UKG_MAX_RESULTS = 200;
const UKG_PAGE_SIZE = 100;

// ── Fetch helpers ───────────────────────────────────────────────────

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, ...options });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ── Retry with exponential backoff ──────────────────────────────────

async function withRetry(fn, maxRetries = 3) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Don't retry on definitive 4xx client errors (except 429 rate-limit)
      const code = parseInt(err.message?.replace('HTTP ', ''));
      if (code >= 400 && code < 500 && code !== 429) throw err;
    }
  }
  throw lastErr;
}

// ── API detection ───────────────────────────────────────────────────

function detectApi(company) {
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

  // BambooHR
  const bambooMatch = url.match(/([^./]+)\.bamboohr\.com/);
  if (bambooMatch) {
    const slug = bambooMatch[1];
    return {
      type: 'bamboohr',
      url: `https://${slug}.bamboohr.com/careers/list`,
      slug,
    };
  }

  // Teamtailor (RSS feed)
  const teamtailorMatch = url.match(/([^./]+)\.teamtailor\.com/);
  if (teamtailorMatch) {
    const slug = teamtailorMatch[1];
    return {
      type: 'teamtailor',
      url: `https://${slug}.teamtailor.com/jobs.rss`,
    };
  }

  // Workday (must come before UKG — different domain)
  const workdayMatch = url.match(/([^./]+)\.([^./]+)\.myworkdayjobs\.com\/([^/?#]+)/);
  if (workdayMatch) {
    const [, tenant, shard, site] = workdayMatch;
    return {
      type: 'workday',
      url: `https://${tenant}.${shard}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
      host: `https://${tenant}.${shard}.myworkdayjobs.com`,
    };
  }

  // UKG / UltiPro
  const ukgMatch = url.match(/recruiting\.ultipro\.com\/([^/?#]+)\/JobBoard\/([^/?#/]+)/);
  if (ukgMatch) {
    const [, orgId, boardId] = ukgMatch;
    return {
      type: 'ukg',
      url: `https://recruiting.ultipro.com/${orgId}/JobBoard/${boardId}/JobSearchAPI/GetJobs`,
      orgId,
      boardId,
    };
  }

  return null;
}

// ── API parsers ─────────────────────────────────────────────────────

function parseGreenhouse(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.absolute_url || '',
    company: companyName,
    location: j.location?.name || '',
    compensation: '',
  }));
}

function parseAshby(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.jobUrl || '',
    company: companyName,
    location: j.location || '',
    compensation: j.compensationTierSummary || '',
  }));
}

function parseLever(json, companyName) {
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    title: j.text || '',
    url: j.hostedUrl || '',
    company: companyName,
    location: j.categories?.location || '',
    compensation: '',
  }));
}

function parseBambooHR(json, companyName, slug) {
  const jobs = json.result || [];
  return jobs.map(j => {
    const city = j.location?.city || '';
    const state = j.location?.state || '';
    const location = city ? `${city}${state ? ', ' + state : ''}` : (j.departmentLabel || '');
    return {
      title: j.jobOpeningName || '',
      url: `https://${slug}.bamboohr.com/careers/${j.id}/detail`,
      company: companyName,
      location,
      compensation: '',
    };
  }).filter(j => j.title);
}

function parseTeamtailor(rssText, companyName) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(rssText)) !== null) {
    const block = match[1];
    const title = (
      /<title><!\[CDATA\[(.*?)\]\]><\/title>/s.exec(block) ||
      /<title>(.*?)<\/title>/s.exec(block)
    )?.[1]?.trim() || '';
    const link = (/<link>(.*?)<\/link>/s.exec(block))?.[1]?.trim() || '';
    const location = (/<location>(.*?)<\/location>/s.exec(block))?.[1]?.trim() || '';
    if (title && link) {
      items.push({ title, url: link, company: companyName, location, compensation: '' });
    }
  }
  return items;
}

async function fetchWorkday(apiUrl, host) {
  const allJobs = [];
  let offset = 0;

  while (offset < WORKDAY_MAX_RESULTS) {
    const data = await withRetry(() => fetchJson(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appliedFacets: {}, limit: WORKDAY_PAGE_SIZE, offset, searchText: '' }),
    }));
    const postings = data.jobPostings || [];
    if (postings.length === 0) break;
    allJobs.push(...postings);
    if (allJobs.length >= (data.total || 0)) break;
    offset += WORKDAY_PAGE_SIZE;
  }
  return allJobs;
}

function parseWorkday(jobs, companyName, host) {
  return jobs.map(j => ({
    title: j.title || '',
    url: j.externalPath ? `${host}${j.externalPath}` : '',
    company: companyName,
    location: j.locationsText || '',
    compensation: '',
  })).filter(j => j.url);
}

async function fetchUkg(apiUrl, orgId, boardId) {
  const allJobs = [];
  let pageNumber = 1;

  while (allJobs.length < UKG_MAX_RESULTS) {
    const data = await withRetry(() => fetchJson(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId,
        boardId,
        searchParams: [{ sortBy: 'postedDate', sortDirection: 'descending', pageSize: UKG_PAGE_SIZE, pageNumber }],
      }),
    }));
    const results = data.searchResults || [];
    if (results.length === 0) break;
    allJobs.push(...results);
    if (allJobs.length >= (data.total || 0)) break;
    pageNumber++;
  }
  return allJobs;
}

function parseUkg(jobs, companyName, orgId, boardId) {
  return jobs.map(j => ({
    title: j.title || '',
    url: `https://recruiting.ultipro.com/${orgId}/JobBoard/${boardId}?requisitionId=${j.requisitionId}`,
    company: companyName,
    location: j.location || '',
    compensation: '',
  })).filter(j => j.title && j.url.includes('requisitionId='));
}

// Standard JSON-based parsers dispatched by type
const PARSERS = { greenhouse: parseGreenhouse, ashby: parseAshby, lever: parseLever };

// ── Title + location filters ────────────────────────────────────────

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

function buildLocationFilter(locationFilter) {
  const include = (locationFilter?.include || []).map(k => k.toLowerCase());
  const exclude = (locationFilter?.exclude || []).map(k => k.toLowerCase());
  if (include.length === 0 && exclude.length === 0) return () => true;

  return (location) => {
    const lower = (location || '').toLowerCase();
    const passInclude = include.length === 0 || include.some(k => lower.includes(k));
    const passExclude = !exclude.some(k => lower.includes(k));
    return passInclude && passExclude;
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

function formatPipelineEntry(o) {
  let line = `- [ ] ${o.url} | ${o.company} | ${o.title}`;
  if (o.location) line += ` | ${o.location}`;
  if (o.compensation) line += ` | ${o.compensation}`;
  return line;
}

function appendToPipeline(offers) {
  if (offers.length === 0) return;

  let text = readFileSync(PIPELINE_PATH, 'utf-8');

  // Find "## Pendientes" section and append after it
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    // No Pendientes section — append at end before Procesadas
    const procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block = `\n${marker}\n\n` + offers.map(formatPipelineEntry).join('\n') + '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    // Find the end of existing Pendientes content (next ## or end)
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;

    const block = '\n' + offers.map(formatPipelineEntry).join('\n') + '\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }

  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(offers, date, status = 'added') {
  if (offers.length === 0) return;

  // Ensure file + header exist
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }

  const lines = offers.map(o =>
    `${o.url}\t${date}\t${o.source || ''}\t${o.title}\t${o.company}\t${status}`
  ).join('\n') + '\n';

  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── --since: show recent offers from history ────────────────────────

function showSince(days) {
  if (!existsSync(SCAN_HISTORY_PATH)) {
    console.log('No scan history found. Run a scan first.');
    return;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n').slice(1);
  const recent = lines
    .filter(l => l.trim())
    .map(l => {
      const [url, date, , title, company, status] = l.split('\t');
      return { url, date, title, company, status: (status || '').trim() };
    })
    .filter(r => r.date >= cutoffStr && r.status === 'added');

  const date = new Date().toISOString().slice(0, 10);
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`New offers — last ${days} day${days === 1 ? '' : 's'} (since ${cutoffStr})`);
  console.log(`${'━'.repeat(45)}`);

  if (recent.length === 0) {
    console.log('  None found.');
  } else {
    for (const r of recent) {
      console.log(`  ${r.date}  ${r.company} | ${r.title}`);
      console.log(`           ${r.url}`);
    }
  }
  console.log(`\nTotal: ${recent.length} offer(s)`);
}

// ── Parallel fetch with concurrency limit ───────────────────────────

async function parallelFetch(tasks, limit) {
  const results = [];
  let i = 0;

  async function next() {
    while (i < tasks.length) {
      const task = tasks[i++];
      results.push(await task());
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
  return results;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const companyFlag = args.indexOf('--company');
  const filterCompany = companyFlag !== -1 ? args[companyFlag + 1]?.toLowerCase() : null;
  const sinceFlag = args.indexOf('--since');
  const sinceDays = sinceFlag !== -1 ? parseInt(args[sinceFlag + 1], 10) : null;

  // Handle --since: report mode, no scan
  if (sinceDays !== null) {
    if (isNaN(sinceDays) || sinceDays < 1) {
      console.error('Error: --since requires a positive integer (e.g. --since 7)');
      process.exit(1);
    }
    showSince(sinceDays);
    return;
  }

  // 1. Read portals.yml
  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const companies = config.tracked_companies || [];
  const titleFilter = buildTitleFilter(config.title_filter);
  const locationFilter = buildLocationFilter(config.location_filter);

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
  const skippedTitleOffers = [];
  const skippedDupOffers = [];
  const errors = [];

  const tasks = targets.map(company => async () => {
    const apiInfo = company._api;
    const { type } = apiInfo;
    try {
      let jobs;

      if (type === 'teamtailor') {
        const rssText = await withRetry(() => fetchText(apiInfo.url));
        jobs = parseTeamtailor(rssText, company.name);
      } else if (type === 'workday') {
        const rawJobs = await fetchWorkday(apiInfo.url, apiInfo.host);
        jobs = parseWorkday(rawJobs, company.name, apiInfo.host);
      } else if (type === 'ukg') {
        const rawJobs = await fetchUkg(apiInfo.url, apiInfo.orgId, apiInfo.boardId);
        jobs = parseUkg(rawJobs, company.name, apiInfo.orgId, apiInfo.boardId);
      } else if (type === 'bamboohr') {
        const json = await withRetry(() => fetchJson(apiInfo.url));
        jobs = parseBambooHR(json, company.name, apiInfo.slug);
      } else {
        const json = await withRetry(() => fetchJson(apiInfo.url));
        jobs = PARSERS[type](json, company.name);
      }

      totalFound += jobs.length;

      for (const job of jobs) {
        const source = `${type}-api`;

        if (!titleFilter(job.title) || !locationFilter(job.location)) {
          totalFiltered++;
          skippedTitleOffers.push({ ...job, source });
          continue;
        }
        if (seenUrls.has(job.url)) {
          totalDupes++;
          skippedDupOffers.push({ ...job, source });
          continue;
        }
        const key = `${job.company.toLowerCase()}::${job.title.toLowerCase()}`;
        if (seenCompanyRoles.has(key)) {
          totalDupes++;
          skippedDupOffers.push({ ...job, source });
          continue;
        }
        // Mark as seen to avoid intra-scan dupes
        seenUrls.add(job.url);
        seenCompanyRoles.add(key);
        newOffers.push({ ...job, source });
      }
    } catch (err) {
      errors.push({ company: company.name, error: err.message });
    }
  });

  await parallelFetch(tasks, CONCURRENCY);

  // 5. Write results
  if (!dryRun) {
    if (newOffers.length > 0) appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date, 'added');
    appendToScanHistory(skippedTitleOffers, date, 'skipped_title');
    appendToScanHistory(skippedDupOffers, date, 'skipped_dup');
  }

  // 6. Print summary
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Portal Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Companies scanned:     ${targets.length}`);
  console.log(`Total jobs found:      ${totalFound}`);
  console.log(`Filtered by title/loc: ${totalFiltered} removed`);
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
      const loc = o.location ? ` | ${o.location}` : '';
      const comp = o.compensation ? ` | ${o.compensation}` : '';
      console.log(`  + ${o.company} | ${o.title}${loc}${comp}`);
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

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
