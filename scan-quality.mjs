#!/usr/bin/env node

/**
 * scan-quality.mjs — summarize scanner health from local files.
 *
 * Reads scan-history.tsv and portals.yml (or the example config) to surface
 * stale companies, duplicate URLs, status distribution, and provider coverage.
 */

import { existsSync, readFileSync } from 'fs';
import yaml from 'js-yaml';

const DEFAULT_HISTORY = 'data/scan-history.tsv';
const DEFAULT_PORTALS = existsSync('portals.yml') ? 'portals.yml' : 'templates/portals.example.yml';

const args = process.argv.slice(2);
const JSON_OUTPUT = args.includes('--json');
const SELF_TEST = args.includes('--self-test');
const HELP = args.includes('--help') || args.includes('-h');

function optionValue(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

const HISTORY_PATH = optionValue('--history', DEFAULT_HISTORY);
const PORTALS_PATH = optionValue('--portals', DEFAULT_PORTALS);
const STALE_DAYS = Number(optionValue('--stale-days', '30'));

function usage() {
  return `career-ops scan quality report

Usage:
  node scan-quality.mjs [--history data/scan-history.tsv] [--portals portals.yml]
  node scan-quality.mjs --json
  node scan-quality.mjs --self-test

Options:
  --stale-days N  Mark tracked companies stale after N days without sightings (default: 30)
  --json          Emit JSON instead of Markdown`;
}

function parseScanHistory(raw) {
  if (!raw.trim()) return [];
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const first = lines[0].split('\t');
  const hasHeader = first.includes('url') && first.includes('status');
  const rows = hasHeader ? lines.slice(1) : lines;

  return rows.map((line) => {
    const [url = '', firstSeen = '', portal = '', title = '', company = '', status = '', location = ''] = line.split('\t');
    return { url, firstSeen, portal, title, company, status, location };
  }).filter((row) => row.url);
}

function parsePortals(raw) {
  const parsed = yaml.load(raw) || {};
  const trackedCompanies = Array.isArray(parsed.tracked_companies) ? parsed.tracked_companies : [];
  return trackedCompanies.map((entry) => ({
    name: String(entry?.name || '').trim(),
    enabled: entry?.enabled !== false,
    careersUrl: String(entry?.careers_url || '').trim(),
    scanMethod: String(entry?.scan_method || 'auto').trim(),
    provider: String(entry?.provider || entry?.api_provider || '').trim(),
    hasApi: Boolean(entry?.api),
    hasParser: Boolean(entry?.parser),
  })).filter((entry) => entry.name);
}

function detectProvider(entry) {
  const text = `${entry.provider} ${entry.careersUrl}`.toLowerCase();
  if (text.includes('greenhouse')) return 'greenhouse';
  if (text.includes('ashby')) return 'ashby';
  if (text.includes('lever.co')) return 'lever';
  if (text.includes('workable')) return 'workable';
  if (text.includes('recruitee')) return 'recruitee';
  if (text.includes('smartrecruiters')) return 'smartrecruiters';
  if (entry.hasParser || entry.scanMethod === 'local_parser') return 'local_parser';
  if (entry.scanMethod === 'websearch') return 'websearch';
  return 'unknown';
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function newestDate(rows) {
  const dates = rows
    .map((row) => Date.parse(row.firstSeen))
    .filter((date) => Number.isFinite(date));
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates));
}

function daysBetween(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

function analyzeScanQuality(historyRows, trackedCompanies, now = new Date()) {
  const byStatus = {};
  const byPortal = {};
  const urlCounts = {};
  const companySightings = new Map();

  for (const row of historyRows) {
    increment(byStatus, row.status || 'unknown');
    increment(byPortal, row.portal || 'unknown');
    increment(urlCounts, row.url);

    const companyKey = row.company.trim().toLowerCase();
    const seenAt = Date.parse(row.firstSeen);
    if (companyKey && Number.isFinite(seenAt)) {
      const previous = companySightings.get(companyKey);
      if (!previous || seenAt > previous.getTime()) companySightings.set(companyKey, new Date(seenAt));
    }
  }

  const duplicateUrls = Object.entries(urlCounts)
    .filter(([, count]) => count > 1)
    .map(([url, count]) => ({ url, count }))
    .sort((a, b) => b.count - a.count || a.url.localeCompare(b.url));

  const enabledCompanies = trackedCompanies.filter((company) => company.enabled);
  const providerCoverage = {};
  const missingCareersUrl = [];
  const staleCompanies = [];
  const neverSeenCompanies = [];

  for (const company of enabledCompanies) {
    increment(providerCoverage, detectProvider(company));
    if (!company.careersUrl) missingCareersUrl.push(company.name);

    const lastSeen = companySightings.get(company.name.toLowerCase());
    if (!lastSeen) {
      neverSeenCompanies.push(company.name);
    } else if (daysBetween(now, lastSeen) > STALE_DAYS) {
      staleCompanies.push({ name: company.name, lastSeen: lastSeen.toISOString().slice(0, 10) });
    }
  }

  return {
    generatedAt: now.toISOString(),
    historyRows: historyRows.length,
    latestScanDate: newestDate(historyRows)?.toISOString().slice(0, 10) || null,
    statuses: byStatus,
    portals: byPortal,
    duplicateUrls,
    trackedCompanies: trackedCompanies.length,
    enabledCompanies: enabledCompanies.length,
    providerCoverage,
    missingCareersUrl,
    staleCompanies,
    neverSeenCompanies,
  };
}

function renderMarkdown(report) {
  const lines = [
    '# Scan Quality Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- History rows: ${report.historyRows}`,
    `- Latest scan date: ${report.latestScanDate || 'none'}`,
    `- Tracked companies: ${report.trackedCompanies}`,
    `- Enabled companies: ${report.enabledCompanies}`,
    `- Duplicate URLs: ${report.duplicateUrls.length}`,
    `- Missing careers URLs: ${report.missingCareersUrl.length}`,
    `- Stale companies: ${report.staleCompanies.length}`,
    `- Never seen companies: ${report.neverSeenCompanies.length}`,
    '',
    '## Statuses',
    '',
    ...Object.entries(report.statuses).sort().map(([status, count]) => `- ${status}: ${count}`),
    '',
    '## Provider Coverage',
    '',
    ...Object.entries(report.providerCoverage).sort().map(([provider, count]) => `- ${provider}: ${count}`),
    '',
    '## Action Items',
    '',
  ];

  if (report.missingCareersUrl.length > 0) {
    lines.push(`- Add careers_url for: ${report.missingCareersUrl.slice(0, 10).join(', ')}`);
  }
  if (report.duplicateUrls.length > 0) {
    lines.push(`- Review duplicate URLs: ${report.duplicateUrls.slice(0, 5).map((entry) => `${entry.url} (${entry.count})`).join(', ')}`);
  }
  if (report.staleCompanies.length > 0) {
    lines.push(`- Refresh stale companies: ${report.staleCompanies.slice(0, 10).map((entry) => `${entry.name} (${entry.lastSeen})`).join(', ')}`);
  }
  if (report.missingCareersUrl.length === 0 && report.duplicateUrls.length === 0 && report.staleCompanies.length === 0) {
    lines.push('- No immediate scan hygiene issues found.');
  }

  return `${lines.join('\n')}\n`;
}

function selfTest() {
  const history = parseScanHistory([
    'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation',
    'https://jobs.example/a\t2026-01-01\tgreenhouse\tAI Engineer\tAcme\tadded\tRemote',
    'https://jobs.example/a\t2026-01-02\tgreenhouse\tAI Engineer\tAcme\tskipped_dup\tRemote',
    'https://jobs.example/b\t2026-03-01\tashby\tPM\tBeta\tadded\tBerlin',
  ].join('\n'));
  const companies = parsePortals([
    'tracked_companies:',
    '  - name: Acme',
    '    careers_url: https://job-boards.greenhouse.io/acme',
    '  - name: Beta',
    '    careers_url: https://jobs.ashbyhq.com/beta',
    '  - name: MissingUrl',
    '    enabled: true',
  ].join('\n'));
  const report = analyzeScanQuality(history, companies, new Date('2026-04-15T00:00:00Z'));

  const checks = [
    ['parses history rows', report.historyRows === 3],
    ['detects duplicate URL', report.duplicateUrls.length === 1 && report.duplicateUrls[0].count === 2],
    ['counts missing careers URL', report.missingCareersUrl.includes('MissingUrl')],
    ['detects provider coverage', report.providerCoverage.greenhouse === 1 && report.providerCoverage.ashby === 1],
    ['detects stale company', report.staleCompanies.some((entry) => entry.name === 'Acme')],
  ];

  const failed = checks.filter(([, ok]) => !ok);
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (failed.length > 0) process.exit(1);
}

if (HELP) {
  console.log(usage());
  process.exit(0);
}

if (SELF_TEST) {
  selfTest();
  process.exit(0);
}

const historyRaw = existsSync(HISTORY_PATH) ? readFileSync(HISTORY_PATH, 'utf-8') : '';
const portalsRaw = existsSync(PORTALS_PATH) ? readFileSync(PORTALS_PATH, 'utf-8') : 'tracked_companies: []';
const report = analyzeScanQuality(parseScanHistory(historyRaw), parsePortals(portalsRaw));

if (JSON_OUTPUT) console.log(JSON.stringify(report, null, 2));
else process.stdout.write(renderMarkdown(report));
