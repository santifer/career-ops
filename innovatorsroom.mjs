#!/usr/bin/env node

/**
 * innovatorsroom.mjs — turn an InnovatorsRoom "TechJobs" newsletter into
 * filtered pipeline entries.
 *
 * The newsletter (Beehiiv) lists roles as 6-line plaintext blocks:
 *     {flags} {location} - {company}
 *     <company tracking url>
 *     - {title}
 *     <title tracking url>
 *     🔗
 *     <APPLY tracking url>        <- the real job link (Beehiiv redirect)
 *
 * This script parses those blocks, applies the SAME title/location filters the
 * portal scanner uses (portals.yml), resolves the tracking URL of each keeper
 * to its real ATS destination, dedups against scan-history/pipeline/applications,
 * and appends the survivors to data/pipeline.md + data/scan-history.tsv.
 *
 * The email itself is fetched by the agent via the Gmail MCP (see
 * modes/innovatorsroom.md) and saved to a plaintext file passed here.
 *
 * Usage:
 *   node innovatorsroom.mjs <email-plaintext-file> [--issue 116] [--date YYYY-MM-DD] [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
import { buildTitleFilter, buildLocationFilter } from './scan.mjs';

const PORTALS_PATH = process.env.CAREER_OPS_PORTALS || 'portals.yml';
const PIPELINE_PATH = 'data/pipeline.md';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const APPLICATIONS_PATH = 'data/applications.md';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find(a => !a.startsWith('--'));
const issue = argVal('--issue');
const dateArg = argVal('--date');

function argVal(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

if (!file || !existsSync(file)) {
  console.error('Usage: node innovatorsroom.mjs <email-plaintext-file> [--issue N] [--dry-run]');
  process.exit(1);
}

// ── Parse newsletter ────────────────────────────────────────────────

const raw = readFileSync(file, 'utf-8');
const lines = raw.split(/\r?\n/).map(l => l.trim());
const issueNo = issue || (raw.match(/TechJobs\s+#(\d+)/) || [])[1] || 'latest';
const date = dateArg || new Date().toISOString().slice(0, 10);

// flags + 💻 🎓 🚀 📩 and other leading marker emoji
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
const stripEmoji = (s) => (s || '').replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
const isUrl = (l) => /^<?https?:\/\//.test(l || '');
const cleanUrl = (l) => (l || '').replace(/^<|>$/g, '').trim();

const roles = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i] !== '🔗') continue;
  const applyUrl = isUrl(lines[i + 1]) ? cleanUrl(lines[i + 1]) : '';
  if (!applyUrl) continue;

  // Walk back over the block: nearest "- {title}" line, then the header
  // ("{flags} {location} - {company}") just above it.
  let title = '', header = '';
  for (let k = i - 1; k >= Math.max(0, i - 8); k--) {
    if (!title && /^-\s+.+/.test(lines[k]) && !isUrl(lines[k])) {
      title = lines[k].replace(/^-\s+/, '').trim();
      continue;
    }
    if (title && !isUrl(lines[k]) && lines[k].includes(' - ')) {
      header = lines[k];
      break;
    }
  }
  if (!title || !header) continue;

  const parts = header.split(' - ');
  const company = stripEmoji(parts[parts.length - 1]);
  const location = stripEmoji(parts.slice(0, -1).join(' - '));
  const cleanTitle = stripEmoji(title);
  if (!company || !cleanTitle) continue;
  roles.push({ company, title: cleanTitle, location, applyUrl });
}

// ── Filter (reuse the portal scanner's filters) ─────────────────────

const cfg = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
const titleOk = buildTitleFilter(cfg.title_filter);
const locOk = buildLocationFilter(cfg.location_filter);

// dedup intra-issue by company::title (same role often appears in 2 categories)
const seenInIssue = new Set();
const filtered = [];
for (const r of roles) {
  const key = `${r.company.toLowerCase()}::${r.title.toLowerCase()}`;
  if (seenInIssue.has(key)) continue;
  seenInIssue.add(key);
  if (titleOk(r.title) && locOk(r.location)) filtered.push(r);
}

// ── Dedup against existing pipeline / history / applications ─────────

function loadSeen() {
  const urls = new Set();
  const roleKeys = new Set();
  if (existsSync(SCAN_HISTORY_PATH)) {
    for (const line of readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n').slice(1)) {
      const u = line.split('\t')[0];
      if (u) urls.add(u);
    }
  }
  if (existsSync(PIPELINE_PATH)) {
    const t = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const m of t.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) urls.add(m[1]);
  }
  if (existsSync(APPLICATIONS_PATH)) {
    const t = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const m of t.matchAll(/https?:\/\/[^\s|)]+/g)) urls.add(m[0]);
    for (const m of t.matchAll(/\|[^|]+\|[^|]+\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g)) {
      const c = m[1].trim().toLowerCase(), r = m[2].trim().toLowerCase();
      if (c && r && c !== 'company') roleKeys.add(`${c}::${r}`);
    }
  }
  return { urls, roleKeys };
}

const seen = loadSeen();

// ── Resolve tracking URLs of keepers, then final dedup ──────────────

async function resolve(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; career-ops/1.0)' }, signal: ctrl.signal });
    // strip common tracking query params from the resolved URL
    try {
      const u = new URL(r.url || url);
      for (const p of [...u.searchParams.keys()]) {
        if (/^(utm_|mc_|ref|source|src|i12m)/i.test(p)) u.searchParams.delete(p);
      }
      return u.toString();
    } catch { return r.url || url; }
  } catch { return url; }
  finally { clearTimeout(t); }
}

const added = [];
let dupCount = 0;
for (const r of filtered) {
  const roleKey = `${r.company.toLowerCase()}::${r.title.toLowerCase()}`;
  if (seen.roleKeys.has(roleKey)) { dupCount++; continue; }
  const url = await resolve(r.applyUrl);
  if (seen.urls.has(url)) { dupCount++; continue; }
  seen.urls.add(url);
  seen.roleKeys.add(roleKey);
  added.push({ ...r, url });
}

// ── Write to pipeline.md + scan-history.tsv ─────────────────────────

if (!dryRun && added.length) {
  let pipe = readFileSync(PIPELINE_PATH, 'utf-8').replace(/\s*$/, '\n');
  pipe += `\n## InnovatorsRoom #${issueNo} (${date})\n\n`;
  pipe += added.map(a => `- [ ] ${a.url} | ${a.company} | ${a.title}${a.location ? `  (${a.location})` : ''}`).join('\n') + '\n';
  writeFileSync(PIPELINE_PATH, pipe, 'utf-8');

  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\n', 'utf-8');
  }
  appendFileSync(SCAN_HISTORY_PATH,
    added.map(a => `${a.url}\t${date}\tinnovatorsroom-${issueNo}\t${a.title}\t${a.company}\tadded\t${a.location}`).join('\n') + '\n',
    'utf-8');
}

// ── Summary ─────────────────────────────────────────────────────────

console.log(`InnovatorsRoom #${issueNo} — ${date}`);
console.log('━'.repeat(42));
console.log(`Roles parsed:        ${roles.length}`);
console.log(`Passed filters:      ${filtered.length}`);
console.log(`Duplicates skipped:  ${dupCount}`);
console.log(`Added to pipeline:   ${added.length}${dryRun ? ' (dry run — not written)' : ''}`);
if (added.length) {
  console.log('\nNew roles:');
  for (const a of added) console.log(`  + ${a.company} | ${a.title} | ${a.location || 'N/A'}\n      ${a.url}`);
}
console.log(`\n→ Run /career-ops pipeline to evaluate the new roles.`);
