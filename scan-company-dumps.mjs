#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const DUMPS_DIR = path.resolve('data/company-dumps');
const PORTALS_PATH = path.resolve('portals.yml');
const PORTALS_EXAMPLE_PATH = path.resolve('templates/portals.example.yml');
const OUT_DIR = path.resolve('output');

function normalizeKeywordList(value) {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr
    .filter(v => typeof v === 'string')
    .map(v => v.toLowerCase().trim())
    .filter(Boolean);
}

function buildTitleFilter(titleFilter) {
  const positive = normalizeKeywordList(titleFilter?.positive);
  const negative = normalizeKeywordList(titleFilter?.negative);

  return (title) => {
    const lower = String(title || '').toLowerCase();
    if (!lower) return false;
    const hasPositive = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNegative = negative.some(k => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

function buildLocationFilter(locationFilter) {
  if (!locationFilter) return () => true;
  const alwaysAllow = normalizeKeywordList(locationFilter.always_allow);
  const allow = normalizeKeywordList(locationFilter.allow);
  const block = normalizeKeywordList(locationFilter.block);

  return (location) => {
    if (typeof location !== 'string' || location.trim() === '') return true;
    const lower = location.toLowerCase();
    if (alwaysAllow.length > 0 && alwaysAllow.some(k => lower.includes(k))) return true;
    if (block.length > 0 && block.some(k => lower.includes(k))) return false;
    if (allow.length === 0) return true;
    return allow.some(k => lower.includes(k));
  };
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function loadConfig() {
  if (existsSync(PORTALS_PATH)) {
    return yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
  }
  if (existsSync(PORTALS_EXAMPLE_PATH)) {
    return yaml.load(readFileSync(PORTALS_EXAMPLE_PATH, 'utf-8'));
  }
  throw new Error('Neither portals.yml nor templates/portals.example.yml was found');
}

function parseJsonFile(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  if (!raw.trim()) return [];
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.items)) return parsed.items;
  return [];
}

function parseJsonlFile(filePath) {
  const lines = readFileSync(filePath, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  return lines.map(line => JSON.parse(line));
}

function loadDumpItems(filePath) {
  if (filePath.endsWith('.jsonl')) return parseJsonlFile(filePath);
  if (filePath.endsWith('.json')) return parseJsonFile(filePath);
  return [];
}

function extractLocation(company) {
  const hq = Array.isArray(company?.hq_locations) ? company.hq_locations : [];
  const first = hq.find(loc => loc?.is_headquarters) || hq[0];
  if (!first) return '';
  const city = first?.city?.name || '';
  const country = first?.country?.name || '';
  return [city, country].filter(Boolean).join(', ');
}

function getCareersHint(company) {
  const linkedin = company?.linkedin_url || '';
  if (linkedin) return linkedin;
  return '';
}

function getCompanySummary(company) {
  const parts = [];
  if (company?.tagline) parts.push(company.tagline);
  const industries = Array.isArray(company?.industries) ? company.industries.map(x => x?.name).filter(Boolean) : [];
  if (industries.length) parts.push(`industries: ${industries.slice(0, 4).join(', ')}`);
  if (company?.employees) parts.push(`size: ${company.employees}`);
  if (company?.growth_stage) parts.push(`stage: ${company.growth_stage}`);
  return parts.join(' | ');
}

function evaluateCompany(company, titleFilter, locationFilter) {
  const roles = Array.isArray(company?.job_roles) ? company.job_roles.filter(Boolean) : [];
  const location = extractLocation(company);
  const matchingRoles = roles.filter(role => titleFilter(role) && locationFilter(location));
  const locationPass = locationFilter(location);

  const totalJobs = Number(company?.total_jobs_available || 0);
  const hasOpeningsSignal = totalJobs > 0 || roles.length > 0;
  const relevance =
    matchingRoles.length > 0 ? 'direct-role-match'
    : hasOpeningsSignal && locationPass ? 'check-manually'
    : 'low-priority';

  return {
    name: company?.name || 'Unknown',
    slug: slugify(company?.name || company?.path || company?.uuid || 'company'),
    location,
    matchingRoles,
    allRoles: roles,
    totalJobs,
    relevance,
    summary: getCompanySummary(company),
    linkedin: company?.linkedin_url || '',
    careersHint: getCareersHint(company),
    websitePath: company?.path || '',
    employees: company?.employees || '',
    sourceUuid: company?.uuid || '',
  };
}

function buildMarkdown(results, meta) {
  const lines = [];
  lines.push(`# Company Dump Shortlist — ${meta.date}`);
  lines.push('');
  lines.push(`- Files scanned: ${meta.files}`);
  lines.push(`- Companies scanned: ${meta.totalCompanies}`);
  lines.push(`- Direct role matches: ${meta.directMatches}`);
  lines.push(`- Manual-check companies: ${meta.manualChecks}`);
  lines.push('');

  if (results.length === 0) {
    lines.push('No relevant companies found.');
    return lines.join('\n');
  }

  for (const item of results) {
    lines.push(`## ${item.name}`);
    lines.push('');
    lines.push(`- Relevance: \`${item.relevance}\``);
    if (item.location) lines.push(`- Location: ${item.location}`);
    if (item.employees) lines.push(`- Size: ${item.employees}`);
    if (item.summary) lines.push(`- Summary: ${item.summary}`);
    if (item.matchingRoles.length > 0) lines.push(`- Matching roles: ${item.matchingRoles.join(' | ')}`);
    else if (item.totalJobs > 0 || item.allRoles.length > 0) lines.push(`- Openings signal: total_jobs_available=${item.totalJobs}, listed roles=${item.allRoles.length}`);
    if (item.linkedin) lines.push(`- LinkedIn: ${item.linkedin}`);
    if (item.careersHint) lines.push(`- Careers hint: ${item.careersHint}`);
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const config = loadConfig();
  const titleFilter = buildTitleFilter(config?.title_filter);
  const locationFilter = buildLocationFilter(config?.location_filter);

  if (!existsSync(DUMPS_DIR)) {
    throw new Error(`Dump directory not found: ${DUMPS_DIR}`);
  }

  const files = readdirSync(DUMPS_DIR)
    .filter(name => /\.(json|jsonl)$/i.test(name))
    .sort();

  if (files.length === 0) {
    console.log('No dump files found in data/company-dumps/');
    return;
  }

  const evaluated = [];
  let totalCompanies = 0;
  const skippedFiles = [];

  for (const file of files) {
    const filePath = path.join(DUMPS_DIR, file);
    let items = [];
    try {
      items = loadDumpItems(filePath);
    } catch (err) {
      skippedFiles.push({ file, error: err.message });
      continue;
    }
    totalCompanies += items.length;
    for (const company of items) {
      evaluated.push(evaluateCompany(company, titleFilter, locationFilter));
    }
  }

  const seen = new Set();
  const deduped = evaluated.filter(item => {
    const key = item.slug || item.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const results = deduped
    .filter(item => item.relevance !== 'low-priority')
    .sort((a, b) => {
      const weight = { 'direct-role-match': 0, 'check-manually': 1 };
      return (weight[a.relevance] ?? 9) - (weight[b.relevance] ?? 9) || b.matchingRoles.length - a.matchingRoles.length || a.name.localeCompare(b.name);
    });

  const date = new Date().toISOString().slice(0, 10);
  const meta = {
    date,
    files: files.length,
    totalCompanies,
    directMatches: results.filter(x => x.relevance === 'direct-role-match').length,
    manualChecks: results.filter(x => x.relevance === 'check-manually').length,
  };

  const markdown = buildMarkdown(results, meta);

  if (skippedFiles.length > 0) {
    console.error(`Skipped ${skippedFiles.length} invalid or empty file(s):`);
    for (const item of skippedFiles) {
      console.error(`- ${item.file}: ${item.error}`);
    }
  }

  if (write) {
    mkdirSync(OUT_DIR, { recursive: true });
    const outPath = path.join(OUT_DIR, `company-dump-shortlist-${date}.md`);
    writeFileSync(outPath, markdown, 'utf-8');
    console.log(`Wrote ${outPath}`);
  } else {
    console.log(markdown);
  }
}

main();
