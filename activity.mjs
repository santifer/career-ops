#!/usr/bin/env node

/**
 * activity.mjs — per-application activity & time logging.
 *
 * career-ops tracks *applications* (data/applications.md) but had no notion of
 * the *work* you put into each one — recruiter calls, follow-ups, interview
 * prep, research. This logs that, with optional time, into a user-layer file:
 *
 *   data/activities.md   columns: Date | App# | Company | Role | Type | Minutes | Notes
 *
 * It is the source of truth for the "Time logged & recent activity" panel in
 * generate-dashboard.mjs. Markdown table, no database, no dependencies — edit
 * it by hand or via this CLI. Distinct from followup-cadence.mjs, which only
 * computes follow-up timing from follow-ups.md.
 *
 * Usage:
 *   node activity.mjs add --company "Acme" [--role "Staff Eng"] [--app 7] \
 *                         --type call --minutes 30 [--date 2026-06-19] [--note "recruiter screen"]
 *   node activity.mjs list [--company Acme] [--since 2026-06-01] [--limit 20]
 *   node activity.mjs summary            # totals by company and by type
 *
 * Types: applied · follow-up · call · interview · research · prep · email · other
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const PATH = process.env.CAREER_OPS_ACTIVITIES || 'data/activities.md';
const HEADER = [
  '# Activity Log',
  '',
  'Per-application activity & time tracking. Read by generate-dashboard.mjs.',
  '',
  '| Date | App# | Company | Role | Type | Minutes | Notes |',
  '|------|------|---------|------|------|---------|-------|',
  '',
].join('\n');
const TYPES = ['applied', 'follow-up', 'call', 'interview', 'research', 'prep', 'email', 'other'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ensureGitignored() {
  // The activity log is personal data. On installs whose .gitignore predates
  // this feature (e.g. updated via `update-system.mjs apply`, which doesn't ship
  // .gitignore), make sure the default log path is ignored so a first `add`
  // can't accidentally commit it. Only manages the default, non-overridden path.
  if (process.env.CAREER_OPS_ACTIVITIES || PATH !== 'data/activities.md') return;
  try {
    if (!existsSync('.gitignore')) return; // not a git checkout we should touch
    const text = readFileSync('.gitignore', 'utf8');
    if (text.split('\n').some((l) => l.trim() === PATH)) return; // already ignored
    writeFileSync('.gitignore', text.replace(/\s*$/, '') + `\n${PATH}\n`);
  } catch { /* best effort — never block logging on this */ }
}

function cell(s) {
  // markdown-table-safe: no pipes, no newlines
  return String(s ?? '').replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ').trim();
}

function opt(name, def = '') {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  // a flag given without a value (e.g. `--minutes` then `--note`) falls back to
  // the default, not `true` — otherwise Number(true)===1 and date validation breaks.
  return v && !v.startsWith('--') ? v : def;
}

function parseRows() {
  if (!existsSync(PATH)) return [];
  const rows = [];
  for (const line of readFileSync(PATH, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const c = t.slice(1, t.endsWith('|') ? -1 : undefined).split('|').map((x) => x.trim());
    if (!/^\d{4}-\d{2}-\d{2}/.test(c[0] || '')) continue; // skip header/separator
    rows.push({
      date: c[0], app: c[1] || '', company: c[2] || '', role: c[3] || '',
      type: (c[4] || 'other').toLowerCase(), minutes: Number((/(\d+)/.exec(c[5] || '') || [])[1] || 0),
      note: c[6] || '',
    });
  }
  return rows;
}

function add() {
  const company = opt('company');
  if (!company) fail('--company is required');
  const type = String(opt('type', 'other')).toLowerCase();
  if (!TYPES.includes(type)) fail(`--type must be one of: ${TYPES.join(', ')}`);
  const minutes = opt('minutes') ? Number(opt('minutes')) : 0;
  if (Number.isNaN(minutes) || minutes < 0) fail('--minutes must be a non-negative number');

  const row = `| ${cell(opt('date', today()))} | ${cell(opt('app'))} | ${cell(company)} | ` +
    `${cell(opt('role'))} | ${cell(type)} | ${minutes || ''} | ${cell(opt('note'))} |`;

  if (!existsSync(PATH)) {
    ensureGitignored();
    mkdirSync(dirname(PATH), { recursive: true });
    writeFileSync(PATH, HEADER);
  }
  let text = readFileSync(PATH, 'utf8').replace(/\s+$/, '');
  text += '\n' + row + '\n';
  writeFileSync(PATH, text);
  process.stdout.write(`Logged: ${row}\n`);
}

function list() {
  let rows = parseRows();
  const company = opt('company');
  const since = opt('since');
  const limit = Number(opt('limit', '20')) || 20;
  if (company) rows = rows.filter((r) => r.company.toLowerCase().includes(String(company).toLowerCase()));
  if (since) rows = rows.filter((r) => r.date >= since);
  rows = rows.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
  if (!rows.length) return process.stdout.write('No activities found.\n');
  for (const r of rows) {
    process.stdout.write(`${r.date}  ${(r.company + ' '.repeat(20)).slice(0, 20)}  ${(r.type + '         ').slice(0, 10)}  ${r.minutes ? r.minutes + 'm' : ''}  ${r.note}\n`);
  }
}

function summary() {
  const rows = parseRows();
  if (!rows.length) return process.stdout.write('No activities logged yet.\n');
  const byCompany = {}; const byType = {}; let total = 0;
  for (const r of rows) {
    total += r.minutes;
    byCompany[r.company] = (byCompany[r.company] || 0) + r.minutes;
    byType[r.type] = (byType[r.type] || 0) + r.minutes;
  }
  const fmt = (m) => (m >= 60 ? (m / 60).toFixed(m % 60 ? 1 : 0) + 'h' : m + 'm');
  process.stdout.write(`Total: ${rows.length} activities · ${fmt(total)} logged\n\nBy company:\n`);
  for (const k of Object.keys(byCompany).sort((a, b) => byCompany[b] - byCompany[a])) {
    process.stdout.write(`  ${(k + ' '.repeat(24)).slice(0, 24)} ${fmt(byCompany[k])}\n`);
  }
  process.stdout.write('\nBy type:\n');
  for (const k of Object.keys(byType).sort((a, b) => byType[b] - byType[a])) {
    process.stdout.write(`  ${(k + ' '.repeat(12)).slice(0, 12)} ${fmt(byType[k])}\n`);
  }
}

function fail(msg) {
  process.stderr.write(`activity.mjs: ${msg}\n`);
  process.exit(1);
}

const cmd = process.argv[2];
if (cmd === 'add') add();
else if (cmd === 'list') list();
else if (cmd === 'summary') summary();
else {
  process.stdout.write(
    'Usage:\n' +
    '  node activity.mjs add --company "Acme" --type call --minutes 30 [--role ..] [--app N] [--date YYYY-MM-DD] [--note ..]\n' +
    '  node activity.mjs list [--company X] [--since YYYY-MM-DD] [--limit N]\n' +
    '  node activity.mjs summary\n' +
    `\nTypes: ${TYPES.join(' · ')}\n`,
  );
}
