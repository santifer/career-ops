#!/usr/bin/env node
/**
 * pipeline-ranker.mjs — Rank pending pipeline jobs before full evaluation
 *
 * This is a cheap, deterministic triage pass. It does not replace the
 * Career-Ops evaluation modes; it decides which queued roles deserve full
 * JD extraction, report generation, and tailored CV work first.
 *
 * Usage:
 *   node pipeline-ranker.mjs
 *   node pipeline-ranker.mjs --limit 20
 *   node pipeline-ranker.mjs --json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const PIPELINE_PATH = join(CAREER_OPS, 'data/pipeline.md');
const PROFILE_PATH = join(CAREER_OPS, 'config/profile.yml');
const PORTALS_PATH = join(CAREER_OPS, 'portals.yml');
const OUTPUT_CSV = join(CAREER_OPS, 'output/pipeline-ranked.csv');
const OUTPUT_MD = join(CAREER_OPS, 'output/pipeline-ranked.md');

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const limitFlag = args.indexOf('--limit');
const limit = limitFlag !== -1 ? parseInt(args[limitFlag + 1], 10) : null;

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function normalize(value) {
  return String(value || '').toLowerCase();
}

function parsePendingPipeline(markdown) {
  const pending = [];
  let inPending = false;

  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      inPending = /^##\s+Pendientes/i.test(line);
      continue;
    }
    if (!inPending || !line.startsWith('- [ ]')) continue;

    const raw = line.replace(/^- \[ \]\s*/, '').trim();
    const parts = raw.split('|').map(s => s.trim());
    const url = parts[0] || '';
    pending.push({
      url,
      company: parts[1] || inferCompany(url),
      title: parts[2] || inferTitle(url),
      raw,
    });
  }

  return pending;
}

function inferCompany(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host.includes('greenhouse.io')) return pathPart(url, 0);
    if (host.includes('ashbyhq.com')) return pathPart(url, 0);
    if (host.includes('lever.co')) return pathPart(url, 0);
    return host;
  } catch {
    return '';
  }
}

function inferTitle(url) {
  try {
    const parsed = new URL(url);
    const slug = parsed.pathname.split('/').filter(Boolean).at(-1) || '';
    return slug.replace(/[-_]/g, ' ');
  } catch {
    return '';
  }
}

function pathPart(url, index) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split('/').filter(Boolean)[index] || '';
  } catch {
    return '';
  }
}

function loadYaml(path, fallback) {
  if (!existsSync(path)) return fallback;
  return yaml.load(readFileSync(path, 'utf-8')) || fallback;
}

function keywordHits(text, keywords) {
  const lower = normalize(text);
  return (keywords || []).filter(k => lower.includes(normalize(k)));
}

function trackedCompanyMap(portals) {
  const map = new Map();
  for (const company of portals.tracked_companies || []) {
    map.set(normalize(company.name), company);
  }
  return map;
}

function rankOffer(offer, profile, portals, trackedCompanies) {
  const title = offer.title || '';
  const company = offer.company || '';
  const haystack = `${title} ${company}`;
  let score = 45;
  const reasons = [];
  const cautions = [];

  const positiveHits = keywordHits(title, portals.title_filter?.positive || []);
  if (positiveHits.length > 0) {
    const points = Math.min(24, positiveHits.length * 8);
    score += points;
    reasons.push(`title match: ${positiveHits.slice(0, 3).join(', ')}`);
  }

  const negativeHits = keywordHits(title, portals.title_filter?.negative || []);
  if (negativeHits.length > 0) {
    const points = Math.min(35, negativeHits.length * 14);
    score -= points;
    cautions.push(`negative title signal: ${negativeHits.slice(0, 3).join(', ')}`);
  }

  const targetHits = keywordHits(title, profile.target_roles?.primary || []);
  if (targetHits.length > 0) {
    score += 14;
    reasons.push(`target role: ${targetHits[0]}`);
  }

  const boostHits = keywordHits(title, portals.title_filter?.seniority_boost || []);
  if (boostHits.length > 0) {
    score += 5;
    reasons.push(`seniority signal: ${boostHits[0]}`);
  }

  const superpowerTerms = [
    'backend',
    'platform',
    'infrastructure',
    'distributed',
    'systems',
    'reliability',
    'sre',
    'database',
    'storage',
    'compute',
    'deployment',
    'observability',
  ];
  const superpowerHits = keywordHits(haystack, superpowerTerms);
  if (superpowerHits.length > 0) {
    score += Math.min(16, superpowerHits.length * 4);
    reasons.push(`profile fit: ${superpowerHits.slice(0, 3).join(', ')}`);
  }

  const tracked = trackedCompanies.get(normalize(company));
  if (tracked?.enabled !== false) {
    score += 8;
    reasons.push('tracked priority company');
  }

  const titleLower = normalize(title);
  if (/\b(staff|principal|director|head|manager)\b/.test(titleLower)) {
    score -= 18;
    cautions.push('likely above target level');
  } else if (/\bsenior\b/.test(titleLower)) {
    score -= 4;
    cautions.push('senior level: review leveling carefully');
  }

  if (/\b(university grad|new grad|intern|coop|co-op)\b/.test(titleLower)) {
    score -= 35;
    cautions.push('likely wrong career stage');
  }

  score = Math.max(0, Math.min(100, score));
  const tier = score >= 82 ? 'A'
    : score >= 70 ? 'B'
      : score >= 58 ? 'C'
        : score >= 45 ? 'D'
          : 'E';

  return {
    ...offer,
    priority_score: score,
    tier,
    reasons: reasons.length ? reasons : ['needs full evaluation'],
    cautions,
  };
}

function toCsv(rows) {
  const header = ['Priority Score', 'Tier', 'Company', 'Role', 'URL', 'Reasons', 'Cautions'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      row.priority_score,
      row.tier,
      row.company,
      row.title,
      row.url,
      row.reasons.join('; '),
      row.cautions.join('; '),
    ].map(csvEscape).join(','));
  }
  return lines.join('\n') + '\n';
}

function toMarkdown(rows) {
  const lines = [
    '# Ranked Pipeline',
    '',
    '| Priority | Tier | Company | Role | Notes |',
    '|---:|:---:|---|---|---|',
  ];

  for (const row of rows) {
    const notes = [
      row.reasons.join('; '),
      row.cautions.length ? `Caution: ${row.cautions.join('; ')}` : '',
    ].filter(Boolean).join(' ');
    lines.push(`| ${row.priority_score} | ${row.tier} | ${row.company} | [${row.title}](${row.url}) | ${notes} |`);
  }

  return lines.join('\n') + '\n';
}

if (!existsSync(PIPELINE_PATH)) {
  console.error('Error: data/pipeline.md not found.');
  process.exit(1);
}

const profile = loadYaml(PROFILE_PATH, {});
const portals = loadYaml(PORTALS_PATH, {});
const trackedCompanies = trackedCompanyMap(portals);
const pending = parsePendingPipeline(readFileSync(PIPELINE_PATH, 'utf-8'));

const ranked = pending
  .map(offer => rankOffer(offer, profile, portals, trackedCompanies))
  .sort((a, b) => b.priority_score - a.priority_score || a.company.localeCompare(b.company));

const selected = Number.isFinite(limit) ? ranked.slice(0, limit) : ranked;

if (jsonOutput) {
  console.log(JSON.stringify(selected, null, 2));
} else {
  mkdirSync(join(CAREER_OPS, 'output'), { recursive: true });
  writeFileSync(OUTPUT_CSV, toCsv(selected), 'utf-8');
  writeFileSync(OUTPUT_MD, toMarkdown(selected), 'utf-8');

  console.log(`Ranked ${ranked.length} pending offers`);
  console.log(`Wrote output/pipeline-ranked.csv and output/pipeline-ranked.md`);
  for (const row of selected.slice(0, 10)) {
    console.log(`${String(row.priority_score).padStart(3)} ${row.tier}  ${row.company} | ${row.title}`);
  }
}
