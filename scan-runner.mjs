#!/usr/bin/env node

/**
 * scan-runner.mjs — Enhanced portal scanner with chunking & full coverage
 *
 * Builds on scan.mjs patterns but adds:
 *   - Chunked scanning (--chunk 1/4) to split work across sessions
 *   - Rate limiting between API calls
 *   - Seniority boost flagging
 *   - Full scan-history logging (added, filtered, duplicate statuses)
 *   - JSON output mode (--json) for piping
 *   - Verbose per-company logging (--verbose)
 *   - WebSearch company reporting (lists companies needing manual scan)
 *
 * Usage:
 *   node scan-runner.mjs                    # scan all API companies
 *   node scan-runner.mjs --dry-run          # preview without writing
 *   node scan-runner.mjs --chunk 1/4        # scan chunk 1 of 4
 *   node scan-runner.mjs --company Cohere   # scan a single company
 *   node scan-runner.mjs --json             # JSON output to stdout
 *   node scan-runner.mjs --verbose          # per-company detail
 *   node scan-runner.mjs --delay 2000       # 2s between API calls
 *   node scan-runner.mjs --include-websearch # also list websearch companies
 *   node scan-runner.mjs --min-score 3.5    # prune entries ≤ 3.5 after scan
 *   node scan-runner.mjs --ensure-pdf       # report entries missing PDFs
 *   node scan-runner.mjs --check-open       # verify Evaluated entries are still live
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import yaml from 'js-yaml';
const parseYaml = yaml.load;

// ── Config ──────────────────────────────────────────────────────────

const PORTALS_PATH = 'portals.yml';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';

const DEFAULT_DELAY_MS = 1000; // 1 second between API calls
const FETCH_TIMEOUT_MS = 15_000;

// ── CLI parsing ─────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    dryRun: false,
    json: false,
    verbose: false,
    includeWebsearch: false,
    chunk: null,      // { index: 1, total: 4 }
    company: null,
    delayMs: DEFAULT_DELAY_MS,
    minScore: null,   // prune threshold
    ensurePdf: false, // check for missing PDFs
    checkOpen: false, // verify Evaluated entries are still live
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--include-websearch':
        opts.includeWebsearch = true;
        break;
      case '--chunk': {
        const val = args[++i];
        if (!val || !val.includes('/')) {
          console.error('Error: --chunk requires format N/M (e.g., --chunk 1/4)');
          process.exit(1);
        }
        const [idx, total] = val.split('/').map(Number);
        if (!idx || !total || idx < 1 || idx > total) {
          console.error(`Error: Invalid chunk ${val}. Must be 1-${total || 'M'} of M.`);
          process.exit(1);
        }
        opts.chunk = { index: idx, total };
        break;
      }
      case '--company':
        opts.company = args[++i]?.toLowerCase();
        if (!opts.company) {
          console.error('Error: --company requires a name');
          process.exit(1);
        }
        break;
      case '--delay':
        opts.delayMs = parseInt(args[++i], 10) || DEFAULT_DELAY_MS;
        break;
      case '--min-score':
        opts.minScore = parseFloat(args[++i]);
        if (isNaN(opts.minScore)) {
          console.error('Error: --min-score requires a number (e.g., --min-score 3.5)');
          process.exit(1);
        }
        break;
      case '--ensure-pdf':
        opts.ensurePdf = true;
        break;
      case '--check-open':
        opts.checkOpen = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown flag: ${args[i]}`);
        process.exit(1);
    }
  }
  return opts;
}

function printUsage() {
  console.log(`
scan-runner.mjs — Enhanced portal scanner with chunking & full coverage

Usage:
  node scan-runner.mjs [OPTIONS]

Options:
  --dry-run              Preview without writing files
  --json                 Output JSON to stdout (human logs go to stderr)
  --verbose              Show per-company detail
  --chunk N/M            Split companies into M chunks, scan chunk N
  --company NAME         Scan a single company (partial match)
  --delay MS             Delay between API calls (default: 1000ms)
  --include-websearch    Also report websearch-only companies
  --min-score N          After scan, prune entries scoring <= N -> SKIP + reorganize
  --ensure-pdf           After scan, report entries missing PDFs
  --check-open           Verify Evaluated entries are still live; mark closed as Discarded
  -h, --help             Show this help

Examples:
  # Full scan with default rate limiting
  node scan-runner.mjs

  # Split into 4 sessions — run each in a separate terminal
  node scan-runner.mjs --chunk 1/4
  node scan-runner.mjs --chunk 2/4
  node scan-runner.mjs --chunk 3/4
  node scan-runner.mjs --chunk 4/4

  # Preview chunk 1 of 3
  node scan-runner.mjs --chunk 1/3 --dry-run --verbose

  # JSON output for piping
  node scan-runner.mjs --json 2>/dev/null | jq .summary
`.trim());
}

// ── Logging (respects --json mode) ──────────────────────────────────

function createLogger(opts) {
  const out = opts.json ? process.stderr : process.stdout;
  return {
    log: (...args) => out.write(args.join(' ') + '\n'),
    verbose: (...args) => { if (opts.verbose) out.write(args.join(' ') + '\n'); },
    error: (...args) => process.stderr.write(args.join(' ') + '\n'),
  };
}

// ── API detection (reused from scan.mjs) ────────────────────────────

function detectApi(company) {
  if (company.api && company.api.includes('greenhouse')) {
    return { type: 'greenhouse', url: company.api };
  }

  const url = company.careers_url || '';

  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashbyMatch) {
    return {
      type: 'ashby',
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`,
    };
  }

  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (leverMatch) {
    return {
      type: 'lever',
      url: `https://api.lever.co/v0/postings/${leverMatch[1]}`,
    };
  }

  const ghEuMatch = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (ghEuMatch && !company.api) {
    return {
      type: 'greenhouse',
      url: `https://boards-api.greenhouse.io/v1/boards/${ghEuMatch[1]}/jobs`,
    };
  }

  return null;
}

// ── API parsers (reused from scan.mjs) ──────────────────────────────

function parseGreenhouse(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.absolute_url || '',
    company: companyName,
    location: j.location?.name || '',
  }));
}

function parseAshby(json, companyName) {
  const jobs = json.jobs || [];
  return jobs.map(j => ({
    title: j.title || '',
    url: j.jobUrl || '',
    company: companyName,
    location: j.location || '',
  }));
}

function parseLever(json, companyName) {
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    title: j.text || '',
    url: j.hostedUrl || '',
    company: companyName,
    location: j.categories?.location || '',
  }));
}

const PARSERS = { greenhouse: parseGreenhouse, ashby: parseAshby, lever: parseLever };

// ── Fetch with timeout ──────────────────────────────────────────────

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithUA(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': BROWSER_UA },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ── Title filter with seniority boost ───────────────────────────────

function buildTitleFilter(titleFilter) {
  const positive = (titleFilter?.positive || []).map(k => k.toLowerCase());
  const negative = (titleFilter?.negative || []).map(k => k.toLowerCase());
  const seniorityBoost = (titleFilter?.seniority_boost || []).map(k => k.toLowerCase());

  return (title) => {
    const lower = title.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNegative = negative.some(k => lower.includes(k));
    const hasSeniority = seniorityBoost.some(k => lower.includes(k));
    return {
      pass: hasPositive && !hasNegative,
      seniority: hasSeniority,
      reason: hasNegative ? 'negative_keyword' : (!hasPositive ? 'no_positive_match' : null),
    };
  };
}

// ── Dedup (reused from scan.mjs) ────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();

  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }

  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(match[1]);
    }
  }

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

// ── Pipeline writer (reused from scan.mjs) ──────────────────────────

function appendToPipeline(offers) {
  if (offers.length === 0) return;

  let text = readFileSync(PIPELINE_PATH, 'utf-8');

  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    const procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block = `\n${marker}\n\n` + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title}${o.seniority ? ' [senior+]' : ''}`
    ).join('\n') + '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;

    const block = '\n' + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title}${o.seniority ? ' [senior+]' : ''}`
    ).join('\n') + '\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }

  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

// ── Scan history writer (enhanced: logs ALL statuses) ───────────────

function ensureScanHistory() {
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }
}

function appendToScanHistory(entries, date) {
  ensureScanHistory();
  const lines = entries.map(e =>
    `${e.url}\t${date}\t${e.source}\t${e.title}\t${e.company}\t${e.status}`
  ).join('\n') + '\n';
  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── Rate limiter ────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Chunking ────────────────────────────────────────────────────────

function chunkArray(arr, chunkSpec) {
  if (!chunkSpec) return arr;
  const { index, total } = chunkSpec;
  const size = Math.ceil(arr.length / total);
  const start = (index - 1) * size;
  return arr.slice(start, start + size);
}

// ── Liveness check for Evaluated entries ────────────────────────────

const CLOSED_SIGNALS = [
  'no longer accepting',
  'position has been filled',
  'job is no longer available',
  'this position is closed',
  'this job is no longer',
  'no longer available',
  'this position has been removed',
  'job not found',
  'the position you are looking for is no longer open',
  'this job has been expired',
];

async function checkJobLiveness(url) {
  // Greenhouse: check via API (most reliable)
  const ghMatch = url.match(/(?:job-boards|boards)(?:\.eu)?\.greenhouse\.io\/(\w+)\/jobs\/(\d+)/);
  if (ghMatch) {
    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${ghMatch[1]}/jobs/${ghMatch[2]}`;
    try {
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.ok) return { alive: true };
      if (res.status === 404) return { dead: true, reason: 'Greenhouse: job removed (404)' };
      return { alive: null, reason: `Greenhouse: HTTP ${res.status}` };
    } catch (e) {
      return { alive: null, reason: `Greenhouse: ${e.message}` };
    }
  }

  // Lever: closed jobs return 404 or redirect to board root
  const leverMatch = url.match(/jobs\.lever\.co\//);
  if (leverMatch) {
    try {
      const res = await fetchWithUA(url);
      if (res.status === 404) return { dead: true, reason: 'Lever: job removed (404)' };
      if (res.ok) {
        const text = await res.text();
        if (text.length < 1500 && !text.toLowerCase().includes('apply'))
          return { dead: true, reason: 'Lever: page has no job content' };
        return { alive: true };
      }
      return { alive: null, reason: `Lever: HTTP ${res.status}` };
    } catch (e) {
      return { alive: null, reason: `Lever: ${e.message}` };
    }
  }

  // Ashby: closed jobs return 404
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\//);
  if (ashbyMatch) {
    try {
      const res = await fetchWithUA(url);
      if (res.status === 404) return { dead: true, reason: 'Ashby: job removed (404)' };
      if (res.ok) return { alive: true };
      return { alive: null, reason: `Ashby: HTTP ${res.status}` };
    } catch (e) {
      return { alive: null, reason: `Ashby: ${e.message}` };
    }
  }

  // Generic: HTTP status + content keyword scan (use browser UA)
  try {
    const res = await fetchWithUA(url);
    if (res.status === 404 || res.status === 410)
      return { dead: true, reason: `HTTP ${res.status}` };
    if (!res.ok)
      return { alive: null, reason: `HTTP ${res.status}` };
    const text = (await res.text()).toLowerCase();
    for (const signal of CLOSED_SIGNALS) {
      if (text.includes(signal)) return { dead: true, reason: `Content: "${signal}"` };
    }
    return { alive: true };
  } catch (e) {
    return { alive: null, reason: e.message };
  }
}

async function checkEvaluatedLiveness(opts, log) {
  const appText = readFileSync(APPLICATIONS_PATH, 'utf-8');
  const lines = appText.split('\n');

  // Parse Evaluated entries from tracker
  const evaluated = [];
  for (const line of lines) {
    if (!line.includes('| Evaluated |')) continue;
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 8) continue;
    const reportMatch = cols[7].match(/\[.*?\]\((.*?)\)/);
    if (!reportMatch) continue;
    evaluated.push({
      num: cols[0],
      company: cols[2],
      role: cols[3],
      reportPath: reportMatch[1],
    });
  }

  if (evaluated.length === 0) {
    log.log('No Evaluated entries to check.');
    return;
  }

  log.log(`Checking ${evaluated.length} Evaluated entries...\n`);

  const results = { open: [], closed: [], uncertain: [] };

  for (let i = 0; i < evaluated.length; i++) {
    const entry = evaluated[i];
    if (i > 0) await sleep(opts.delayMs);

    // Read report to extract URL
    const reportFile = join(process.cwd(), entry.reportPath);
    if (!existsSync(reportFile)) {
      results.uncertain.push({ ...entry, reason: 'report file missing' });
      continue;
    }

    const reportText = readFileSync(reportFile, 'utf-8');
    const urlMatch = reportText.match(/\*\*URL:\*\*\s*(https?:\/\/\S+)/);
    if (!urlMatch) {
      results.uncertain.push({ ...entry, reason: 'no URL in report' });
      continue;
    }

    const url = urlMatch[1];
    const result = await checkJobLiveness(url);

    if (result.alive === true) {
      results.open.push({ ...entry, url });
      log.verbose(`  ✓ #${entry.num} ${entry.company} — ${entry.role}`);
    } else if (result.dead) {
      results.closed.push({ ...entry, url, reason: result.reason });
      log.verbose(`  ✗ #${entry.num} ${entry.company} — ${entry.role} (${result.reason})`);
    } else {
      results.uncertain.push({ ...entry, url, reason: result.reason });
      log.verbose(`  ? #${entry.num} ${entry.company} — ${entry.role} (${result.reason})`);
    }
  }

  // Report
  log.log(`\nResults:`);
  log.log(`  Open:      ${results.open.length}`);
  log.log(`  Closed:    ${results.closed.length}`);
  log.log(`  Uncertain: ${results.uncertain.length}`);

  if (results.closed.length > 0) {
    log.log(`\nClosed positions:`);
    for (const e of results.closed) {
      log.log(`  ✗ #${e.num} ${e.company} — ${e.role} (${e.reason})`);
    }
  }

  if (results.uncertain.length > 0) {
    log.log(`\nUncertain (manual check needed):`);
    for (const e of results.uncertain) {
      log.log(`  ? #${e.num} ${e.company} — ${e.role} (${e.reason})`);
    }
  }

  // Update applications.md: mark closed entries as Discarded
  if (!opts.dryRun && results.closed.length > 0) {
    let updatedText = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const entry of results.closed) {
      // Match the line by entry number at start of row and "Evaluated" status
      const pattern = new RegExp(
        `(\\|\\s*${entry.num}\\s*\\|[^|]*\\|[^|]*\\|[^|]*\\|[^|]*\\|)\\s*Evaluated\\s*(\\|[^|]*\\|[^|]*\\|)([^|]*)(\\|)`,
      );
      updatedText = updatedText.replace(pattern, (_, pre, mid, notes, end) => {
        const trimmedNotes = notes.trim();
        const newNote = trimmedNotes
          ? `Position closed (auto-verified); ${trimmedNotes}`
          : 'Position closed (auto-verified)';
        return `${pre} Discarded ${mid} ${newNote} ${end}`;
      });
    }
    writeFileSync(APPLICATIONS_PATH, updatedText, 'utf-8');
    log.log(`\n→ ${results.closed.length} entries marked as Discarded in applications.md`);
  } else if (opts.dryRun && results.closed.length > 0) {
    log.log(`\n(dry run — ${results.closed.length} entries would be marked as Discarded)`);
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  const log = createLogger(opts);

  // 1. Read portals.yml
  if (!existsSync(PORTALS_PATH)) {
    log.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const companies = config.tracked_companies || [];
  const titleFilter = buildTitleFilter(config.title_filter);

  // 2. Classify companies: API vs websearch
  const enabled = companies.filter(c => c.enabled !== false);
  const withApi = [];
  const websearchOnly = [];

  for (const c of enabled) {
    if (opts.company && !c.name.toLowerCase().includes(opts.company)) continue;
    const api = detectApi(c);
    if (api) {
      withApi.push({ ...c, _api: api });
    } else {
      websearchOnly.push(c);
    }
  }

  // 3. Sort API companies alphabetically for stable chunking
  withApi.sort((a, b) => a.name.localeCompare(b.name));

  // 4. Apply chunk filter
  const targets = chunkArray(withApi, opts.chunk);
  const chunkLabel = opts.chunk ? ` (chunk ${opts.chunk.index}/${opts.chunk.total})` : '';

  log.log(`scan-runner — ${new Date().toISOString().slice(0, 10)}${chunkLabel}`);
  log.log(`API companies: ${targets.length} of ${withApi.length}${chunkLabel}`);
  log.log(`WebSearch-only: ${websearchOnly.length} (need Chrome/manual scan)`);
  if (opts.dryRun) log.log('(dry run — no files will be written)\n');

  // 5. Load dedup sets
  const seenUrls = loadSeenUrls();
  const seenCompanyRoles = loadSeenCompanyRoles();

  // 6. Scan each API company serially with rate limiting
  const date = new Date().toISOString().slice(0, 10);
  const stats = {
    companiesScanned: 0,
    companiesErrored: 0,
    totalJobs: 0,
    filtered: 0,
    duplicates: 0,
    newOffers: 0,
    seniorityMatches: 0,
  };

  const newOffers = [];
  const allHistoryEntries = []; // for full scan-history logging
  const errors = [];
  const companyResults = [];

  for (let i = 0; i < targets.length; i++) {
    const company = targets[i];
    const { type, url } = company._api;

    // Rate limit (skip delay before first request)
    if (i > 0) await sleep(opts.delayMs);

    log.verbose(`[${i + 1}/${targets.length}] ${company.name} (${type}: ${url})`);

    try {
      const json = await fetchJson(url);
      const jobs = PARSERS[type](json, company.name);
      stats.totalJobs += jobs.length;
      stats.companiesScanned++;

      let companyNew = 0;
      let companyFiltered = 0;
      let companyDupes = 0;

      for (const job of jobs) {
        const filterResult = titleFilter(job.title);

        if (!filterResult.pass) {
          stats.filtered++;
          companyFiltered++;
          allHistoryEntries.push({
            url: job.url, source: `${type}-api`, title: job.title,
            company: job.company, status: `filtered:${filterResult.reason}`,
          });
          continue;
        }

        if (seenUrls.has(job.url)) {
          stats.duplicates++;
          companyDupes++;
          allHistoryEntries.push({
            url: job.url, source: `${type}-api`, title: job.title,
            company: job.company, status: 'duplicate:url',
          });
          continue;
        }

        const key = `${job.company.toLowerCase()}::${job.title.toLowerCase()}`;
        if (seenCompanyRoles.has(key)) {
          stats.duplicates++;
          companyDupes++;
          allHistoryEntries.push({
            url: job.url, source: `${type}-api`, title: job.title,
            company: job.company, status: 'duplicate:company-role',
          });
          continue;
        }

        // New offer
        seenUrls.add(job.url);
        seenCompanyRoles.add(key);

        const offer = {
          ...job,
          source: `${type}-api`,
          seniority: filterResult.seniority,
        };

        if (filterResult.seniority) stats.seniorityMatches++;
        stats.newOffers++;
        companyNew++;
        newOffers.push(offer);
        allHistoryEntries.push({
          url: job.url, source: `${type}-api`, title: job.title,
          company: job.company, status: 'added',
        });
      }

      companyResults.push({
        name: company.name,
        type,
        totalJobs: jobs.length,
        new: companyNew,
        filtered: companyFiltered,
        duplicates: companyDupes,
        error: null,
      });

      log.verbose(`  ${jobs.length} jobs → ${companyNew} new, ${companyFiltered} filtered, ${companyDupes} dupes`);

    } catch (err) {
      stats.companiesErrored++;
      errors.push({ company: company.name, error: err.message });
      companyResults.push({
        name: company.name,
        type,
        totalJobs: 0,
        new: 0,
        filtered: 0,
        duplicates: 0,
        error: err.message,
      });
      log.verbose(`  ERROR: ${err.message}`);
    }
  }

  // 7. Write results
  if (!opts.dryRun && newOffers.length > 0) {
    appendToPipeline(newOffers);
  }

  // Write ALL statuses to scan-history (not just "added")
  if (!opts.dryRun && allHistoryEntries.length > 0) {
    appendToScanHistory(allHistoryEntries, date);
  }

  // 8. Output

  // JSON output
  if (opts.json) {
    const output = {
      date,
      chunk: opts.chunk || null,
      summary: stats,
      newOffers: newOffers.map(o => ({
        company: o.company,
        title: o.title,
        url: o.url,
        location: o.location,
        source: o.source,
        seniority: o.seniority,
      })),
      errors,
      websearchCompanies: websearchOnly.map(c => ({
        name: c.name,
        scanQuery: c.scan_query || null,
        careersUrl: c.careers_url || null,
      })),
      companyResults,
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  }

  // Human-readable summary
  log.log(`\n${'━'.repeat(50)}`);
  log.log(`scan-runner — ${date}${chunkLabel}`);
  log.log(`${'━'.repeat(50)}`);
  log.log(`Companies scanned:     ${stats.companiesScanned}`);
  log.log(`Companies errored:     ${stats.companiesErrored}`);
  log.log(`Total jobs found:      ${stats.totalJobs}`);
  log.log(`Filtered by title:     ${stats.filtered} removed`);
  log.log(`Duplicates:            ${stats.duplicates} skipped`);
  log.log(`New offers added:      ${stats.newOffers} (${stats.seniorityMatches} senior+)`);

  if (errors.length > 0) {
    log.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      log.log(`  ✗ ${e.company}: ${e.error}`);
    }
  }

  if (newOffers.length > 0) {
    log.log('\nNew offers:');
    for (const o of newOffers) {
      const badge = o.seniority ? ' ★' : '';
      log.log(`  + ${o.company} | ${o.title}${badge} | ${o.location || 'N/A'}`);
    }
    if (opts.dryRun) {
      log.log('\n(dry run — run without --dry-run to save results)');
    } else {
      log.log(`\nResults saved to ${PIPELINE_PATH} and ${SCAN_HISTORY_PATH}`);
    }
  }

  // WebSearch companies report
  if (websearchOnly.length > 0 && (opts.includeWebsearch || opts.verbose)) {
    log.log(`\n${'─'.repeat(50)}`);
    log.log(`WebSearch-only companies (${websearchOnly.length}) — need Chrome or /career-ops scan:`);
    for (const c of websearchOnly) {
      log.log(`  ○ ${c.name} — ${c.careers_url || 'no URL'}`);
    }
  }

  log.log(`\n→ Run /career-ops pipeline to evaluate new offers.`);

  if (opts.chunk && opts.chunk.index < opts.chunk.total) {
    log.log(`→ Next chunk: node scan-runner.mjs --chunk ${opts.chunk.index + 1}/${opts.chunk.total}`);
  }

  // 9. Post-scan: prune + organize
  const scriptDir = dirname(fileURLToPath(import.meta.url));

  if (opts.minScore !== null && !opts.dryRun) {
    log.log(`\n${'─'.repeat(50)}`);
    log.log(`Post-scan: pruning entries scoring ≤ ${opts.minScore} + reorganizing files...`);
    try {
      const result = execFileSync('node', [
        join(scriptDir, 'organize-files.mjs'),
        '--prune', String(opts.minScore),
        '--normalize',
      ], { encoding: 'utf-8', timeout: 30_000 });
      log.log(result.trim());
    } catch (err) {
      log.error(`Organize failed: ${err.message}`);
    }
  }

  // 10. Post-scan: verify Evaluated entries are still live
  if (opts.checkOpen) {
    log.log(`\n${'─'.repeat(50)}`);
    log.log(`Post-scan: verifying Evaluated entries are still open...`);
    await checkEvaluatedLiveness(opts, log);

    // Reorganize files if any were marked Discarded
    if (!opts.dryRun) {
      try {
        const result = execFileSync('node', [
          join(scriptDir, 'organize-files.mjs'),
        ], { encoding: 'utf-8', timeout: 30_000 });
        log.log(result.trim());
      } catch (err) {
        log.error(`Organize failed: ${err.message}`);
      }
    }
  }

  // 11. Post-scan: check missing PDFs
  if (opts.ensurePdf && !opts.dryRun) {
    log.log(`\n${'─'.repeat(50)}`);
    log.log(`Post-scan: checking for missing PDFs...`);
    try {
      const result = execFileSync('node', [
        join(scriptDir, 'organize-files.mjs'),
        '--check-pdf',
      ], { encoding: 'utf-8', timeout: 30_000 });
      log.log(result.trim());
    } catch (err) {
      log.error(`PDF check failed: ${err.message}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
