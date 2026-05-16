#!/usr/bin/env node

/**
 * search-tavily.mjs — Tavily search utility for career-ops
 *
 * Dual-mode: importable module for other scripts + standalone CLI tool.
 *
 * As a module:
 *   import { tavilySearch, tavilyExtract } from './search-tavily.mjs';
 *   const results = await tavilySearch('Acme Corp AI enablement jobs Toronto');
 *
 * As a CLI:
 *   node search-tavily.mjs "query"
 *   node search-tavily.mjs "query" --depth advanced --max 10
 *   node search-tavily.mjs --extract https://example.com/jobs/123
 *   node search-tavily.mjs --liveness https://boards.greenhouse.io/acme/jobs/123
 *   node search-tavily.mjs --auth
 *
 * Used by:
 *   check-liveness.mjs  — fallback when Playwright unavailable
 *   modes/deep          — company research queries
 *   scan.mjs            — supplement ATS APIs with web search
 *
 * Setup:
 *   Add to config/profile.yml:
 *     tavily:
 *       api_key: tvly-xxx
 *       search_depth: basic    # basic (fast) | advanced (thorough, 2x cost)
 *       max_results: 5
 *   Or set TAVILY_API_KEY env var.
 */

import { readFileSync, existsSync } from 'fs';
import { load as loadYaml } from 'js-yaml';

// ── Constants ────────────────────────────────────────────────────────
const TAVILY_SEARCH_URL  = 'https://api.tavily.com/search';
const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract';
const PROFILE_PATH       = 'config/profile.yml';

// ── Config ───────────────────────────────────────────────────────────
export function loadTavilyConfig() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (apiKey) return { apiKey, searchDepth: 'basic', maxResults: 5 };

  if (!existsSync(PROFILE_PATH)) return null;
  const profile = loadYaml(readFileSync(PROFILE_PATH, 'utf8')) || {};
  const t = profile.tavily || {};
  if (!t.api_key) return null;

  return {
    apiKey:      t.api_key,
    searchDepth: t.search_depth || 'basic',
    maxResults:  t.max_results  || 5,
  };
}

function requireConfig() {
  const cfg = loadTavilyConfig();
  if (!cfg) {
    const msg =
      '❌  Tavily not configured.\n' +
      '    Add to config/profile.yml:\n' +
      '      tavily:\n' +
      '        api_key: tvly-xxx\n' +
      '    Or set TAVILY_API_KEY env var.\n' +
      '    Get a free key at: https://tavily.com';
    if (isMain()) { console.error(msg); process.exit(1); }
    throw new Error(msg);
  }
  return cfg;
}

// ── Core API calls ───────────────────────────────────────────────────

/**
 * Search the web via Tavily.
 * @param {string} query
 * @param {object} opts
 * @param {string} [opts.searchDepth] 'basic' | 'advanced'
 * @param {number} [opts.maxResults]
 * @param {string[]} [opts.includeDomains]
 * @param {string[]} [opts.excludeDomains]
 * @param {boolean} [opts.includeAnswer]   include AI-synthesised answer
 * @param {boolean} [opts.includeContent]  include raw page content
 * @returns {Promise<TavilySearchResult>}
 */
export async function tavilySearch(query, opts = {}) {
  const cfg = requireConfig();
  const body = {
    api_key:          cfg.apiKey,
    query,
    search_depth:     opts.searchDepth   || cfg.searchDepth,
    max_results:      opts.maxResults    || cfg.maxResults,
    include_answer:   opts.includeAnswer  ?? false,
    include_raw_content: opts.includeContent ?? false,
  };
  if (opts.includeDomains?.length) body.include_domains = opts.includeDomains;
  if (opts.excludeDomains?.length) body.exclude_domains = opts.excludeDomains;

  const res = await fetch(TAVILY_SEARCH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Tavily search ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Extract structured content from a URL via Tavily.
 * Useful for reading job postings without Playwright.
 * @param {string|string[]} urls
 * @returns {Promise<TavilyExtractResult>}
 */
export async function tavilyExtract(urls) {
  const cfg = requireConfig();
  const body = {
    api_key: cfg.apiKey,
    urls:    Array.isArray(urls) ? urls : [urls],
  };
  const res = await fetch(TAVILY_EXTRACT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Tavily extract ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Liveness check helper ─────────────────────────────────────────────

// Signals that strongly suggest a posting is closed
const CLOSED_SIGNALS = [
  'no longer accepting', 'position has been filled', 'job has expired',
  'posting has closed', 'this job is closed', 'application period has ended',
  'we are not currently hiring', 'position is no longer available',
  '404', 'page not found', 'job not found',
];

// Signals that confirm a posting is active
const ACTIVE_SIGNALS = [
  'apply now', 'apply for this job', 'submit your application',
  'we are hiring', 'join our team', 'open position',
  'job description', 'responsibilities', 'qualifications',
];

/**
 * Check if a job posting URL is still live using Tavily extract.
 * Returns 'active' | 'closed' | 'unknown'
 */
export async function checkLiveness(url) {
  try {
    const result = await tavilyExtract(url);
    const page = result.results?.[0];
    if (!page) return 'unknown';

    const text = (page.raw_content || page.content || '').toLowerCase();
    if (!text) return 'unknown';

    if (CLOSED_SIGNALS.some(s => text.includes(s))) return 'closed';
    if (ACTIVE_SIGNALS.some(s => text.includes(s)))  return 'active';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Research a company — returns top search results for deep-mode context.
 * @param {string} company
 * @param {string} [role]
 */
export async function researchCompany(company, role = '') {
  const query = role
    ? `"${company}" ${role} company culture glassdoor reviews`
    : `"${company}" company overview culture hiring`;
  return tavilySearch(query, { searchDepth: 'advanced', maxResults: 8, includeAnswer: true });
}

/**
 * Find job postings for a role via web search (supplements ATS API scanning).
 * @param {string} role
 * @param {string} [location]
 */
export async function searchJobs(role, location = 'Canada') {
  const query = `"${role}" jobs site:linkedin.com OR site:greenhouse.io OR site:lever.co OR site:ashbyhq.com ${location}`;
  return tavilySearch(query, { maxResults: 10 });
}

// ── Result formatters ─────────────────────────────────────────────────
export function formatResults(data) {
  const lines = [];
  if (data.answer) {
    lines.push('Answer: ' + data.answer);
    lines.push('');
  }
  (data.results || []).forEach((r, i) => {
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   ${r.url}`);
    if (r.content) lines.push(`   ${r.content.slice(0, 200).replace(/\n/g, ' ')}…`);
    lines.push('');
  });
  return lines.join('\n');
}

// ── CLI ───────────────────────────────────────────────────────────────
function isMain() {
  return process.argv[1]?.endsWith('search-tavily.mjs');
}

async function runCli() {
  const args = process.argv.slice(2);

  if (!args.length || args[0] === '--help') {
    console.log([
      'search-tavily.mjs — Tavily search + extract for career-ops',
      '',
      'Usage:',
      '  node search-tavily.mjs "query"',
      '  node search-tavily.mjs "query" --depth advanced --max 10',
      '  node search-tavily.mjs --extract <url>',
      '  node search-tavily.mjs --liveness <url>',
      '  node search-tavily.mjs --company "Acme Corp" [--role "AI Enablement"]',
      '  node search-tavily.mjs --jobs "Training Coordinator" [--location "Toronto"]',
      '  node search-tavily.mjs --auth',
      '',
      'Flags:',
      '  --depth basic|advanced   search depth (default: basic)',
      '  --max N                  max results (default: 5)',
      '  --answer                 include AI-synthesised answer',
      '  --json                   output raw JSON',
    ].join('\n'));
    return;
  }

  if (args[0] === '--auth') {
    const cfg = loadTavilyConfig();
    if (!cfg) { console.error('❌  No API key configured.'); process.exit(1); }
    console.log('Testing Tavily API key…');
    const r = await tavilySearch('test', { maxResults: 1 });
    if (r.results) console.log('✅  API key valid. Tavily is ready.');
    else           console.log('⚠️  Unexpected response:', JSON.stringify(r));
    return;
  }

  const depthIdx  = args.indexOf('--depth');
  const maxIdx    = args.indexOf('--max');
  const roleIdx   = args.indexOf('--role');
  const locationIdx = args.indexOf('--location');
  const depth     = depthIdx  !== -1 ? args[depthIdx  + 1] : undefined;
  const max       = maxIdx    !== -1 ? parseInt(args[maxIdx + 1]) : undefined;
  const asJson    = args.includes('--json');
  const withAnswer = args.includes('--answer');

  if (args[0] === '--liveness') {
    const url = args[1];
    if (!url) { console.error('Usage: --liveness <url>'); process.exit(1); }
    console.log(`Checking liveness: ${url}`);
    const status = await checkLiveness(url);
    console.log(`Status: ${status}`);
    return;
  }

  if (args[0] === '--extract') {
    const url = args[1];
    if (!url) { console.error('Usage: --extract <url>'); process.exit(1); }
    const r = await tavilyExtract(url);
    if (asJson) { console.log(JSON.stringify(r, null, 2)); return; }
    const page = r.results?.[0];
    if (page) {
      console.log(`Title:   ${page.title || '(no title)'}`);
      console.log(`URL:     ${page.url}`);
      console.log('');
      console.log((page.raw_content || page.content || '').slice(0, 2000));
    } else {
      console.log('No content extracted.');
    }
    return;
  }

  if (args[0] === '--company') {
    const company = args[1];
    const role    = roleIdx !== -1 ? args[roleIdx + 1] : '';
    if (!company) { console.error('Usage: --company "Name" [--role "Role"]'); process.exit(1); }
    const r = await researchCompany(company, role);
    if (asJson) { console.log(JSON.stringify(r, null, 2)); return; }
    console.log(formatResults(r));
    return;
  }

  if (args[0] === '--jobs') {
    const role     = args[1];
    const location = locationIdx !== -1 ? args[locationIdx + 1] : 'Canada';
    if (!role) { console.error('Usage: --jobs "Role Title" [--location "City"]'); process.exit(1); }
    const r = await searchJobs(role, location);
    if (asJson) { console.log(JSON.stringify(r, null, 2)); return; }
    console.log(formatResults(r));
    return;
  }

  // Default: plain search
  const query = args.filter(a => !a.startsWith('--') && a !== depth && a !== String(max)).join(' ');
  if (!query) { console.error('Provide a search query.'); process.exit(1); }

  const r = await tavilySearch(query, {
    searchDepth:   depth,
    maxResults:    max,
    includeAnswer: withAnswer,
  });

  if (asJson) { console.log(JSON.stringify(r, null, 2)); return; }
  console.log(formatResults(r));
}

if (isMain()) {
  runCli().catch(err => { console.error(err.message); process.exit(1); });
}
