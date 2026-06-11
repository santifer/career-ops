#!/usr/bin/env node

/**
 * tracker.mjs — SQLite storage layer for the applications tracker (RFC #918).
 *
 * SQLite becomes the source of truth; data/applications.md becomes a rendered
 * read-only view. Opt-in: nothing changes for users who never run `migrate`.
 *
 * Why: at hundreds of rows, a markdown table degrades structurally — encoding
 * corruption propagates, columns drift, a `|` inside a cell shifts every
 * column after it, and agents grepping the table get model-dependent results.
 * A schema-validated store makes every query return the same rows for every
 * model on every CLI, and one query replaces reading the whole table into
 * context.
 *
 * Zero new dependencies — uses node:sqlite (built into Node >= 22.5).
 *
 * Usage:
 *   node tracker.mjs migrate [--dry-run]        # one-time: applications.md → applications.db (repairs corruption)
 *   node tracker.mjs query [--status Applied] [--company acme] [--role designer]
 *                          [--since 2026-01-01] [--limit 20] [--json]
 *   node tracker.mjs add --company X --role Y [--status Evaluated] [--score 4.2/5]
 *                        [--date YYYY-MM-DD] [--pdf ✅] [--report ...] [--notes ...] [--force]
 *   node tracker.mjs update --id N [--status X] [--score X] [--notes X] [--pdf X] [--report X]
 *   node tracker.mjs history --id N             # status transition log for one application
 *   node tracker.mjs render                     # applications.db → applications.md (view)
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { pathToFileURL } from 'url';
import yaml from 'js-yaml';

const DB_PATH = 'data/applications.db';
const MD_PATH = 'data/applications.md';
const STATES_PATH = 'templates/states.yml';
const HEADER = '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |';
const SEPARATOR = '|---|------|---------|------|-------|--------|-----|--------|-------|';
const RENDER_MARKER = '<!-- Rendered from data/applications.db by tracker.mjs — query/edit via `node tracker.mjs`, do not hand-edit (RFC #918) -->';

// ── node:sqlite loading ─────────────────────────────────────────────

async function loadSqlite() {
  // node:sqlite is stable in behavior but still flagged experimental in some
  // Node lines — silence only that one warning, leave everything else alone.
  const origEmit = process.emitWarning;
  process.emitWarning = (warning, ...args) => {
    const text = typeof warning === 'string' ? warning : warning?.message || '';
    if (text.includes('SQLite is an experimental feature')) return;
    return origEmit.call(process, warning, ...args);
  };
  try {
    const { DatabaseSync } = await import('node:sqlite');
    return DatabaseSync;
  } catch {
    console.error('Error: node:sqlite is not available. tracker.mjs needs Node >= 22.5 (you are on ' + process.version + ').');
    console.error('The markdown tracker keeps working without it — SQLite is opt-in.');
    process.exit(1);
  }
}

function openDb(DatabaseSync) {
  mkdirSync('data', { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id      INTEGER PRIMARY KEY,
      date    TEXT NOT NULL,
      company TEXT NOT NULL,
      role    TEXT NOT NULL,
      score   TEXT NOT NULL DEFAULT '—',
      status  TEXT NOT NULL,
      pdf     TEXT NOT NULL DEFAULT '❌',
      report  TEXT NOT NULL DEFAULT '—',
      notes   TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS status_events (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER NOT NULL REFERENCES applications(id),
      status TEXT NOT NULL,
      date   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_apps_status ON applications(status);
    CREATE INDEX IF NOT EXISTS idx_apps_company ON applications(company);
    CREATE INDEX IF NOT EXISTS idx_events_app ON status_events(app_id);
  `);
  return db;
}

// ── Canonical states (templates/states.yml is the source of truth) ──

function loadStates() {
  const doc = yaml.load(readFileSync(STATES_PATH, 'utf-8'));
  const byKey = new Map(); // lowercased label/alias → canonical label
  const labels = [];
  for (const s of doc?.states || []) {
    if (!s?.label) continue;
    labels.push(s.label);
    byKey.set(s.label.toLowerCase(), s.label);
    if (s.id) byKey.set(String(s.id).toLowerCase(), s.label);
    for (const alias of s.aliases || []) byKey.set(String(alias).toLowerCase(), s.label);
  }
  return { byKey, labels };
}

// Strip markdown bold, trailing dates, and surrounding noise, then resolve
// against canonical labels/aliases. Returns the canonical label or null.
function normalizeStatus(raw, states) {
  if (!raw) return null;
  const cleaned = String(raw)
    .replace(/\*\*/g, '')
    .replace(/\(?\d{4}-\d{2}-\d{2}\)?/g, '')
    .trim()
    .toLowerCase();
  return states.byKey.get(cleaned) || null;
}

const SCORE_RE = /^\*{0,2}(\d(?:\.\d)?\/5)\*{0,2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Mojibake left by a UTF-8 → GBK → UTF-8 round trip: an em-dash cell becomes
// "鈥?" / "鈥�" variants. Only short placeholder cells are repaired — free-text
// notes are preserved as-is rather than risk corrupting real content.
function repairPlaceholder(cell) {
  if (/^鈥.{0,2}$/.test(cell) || cell === '�') return '—';
  return cell;
}

// ── Markdown parsing (migrate) ──────────────────────────────────────

function parseMarkdownRows(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    let cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    if (cells.length < 2) continue;
    if (cells[0] === '#' || /^[-: ]*$/.test(cells.join(''))) continue; // header / separator
    if (cells.length > 9) cells = [...cells.slice(0, 8), cells.slice(8).join(' | ')]; // stray pipes → notes
    while (cells.length < 9) cells.push('');
    rows.push(cells);
  }
  return rows;
}

async function migrate(args) {
  const dryRun = args.includes('--dry-run');
  if (!existsSync(MD_PATH)) {
    console.error(`Error: ${MD_PATH} not found — nothing to migrate.`);
    process.exit(1);
  }
  const states = loadStates();
  const rows = parseMarkdownRows(readFileSync(MD_PATH, 'utf-8'));
  console.log(`Parsed ${rows.length} data rows from ${MD_PATH}`);

  const repairs = { mojibake: 0, scoreInStatus: 0, unknownStatus: 0, badId: 0, badDate: 0 };
  const usedIds = new Set();
  let maxId = 0;
  const apps = [];

  for (const cells of rows) {
    let [idRaw, date, company, role, score, status, pdf, report, notes] = cells;

    const before = [score, pdf, report].join('|');
    score = repairPlaceholder(score);
    pdf = repairPlaceholder(pdf);
    report = repairPlaceholder(report);
    if ([score, pdf, report].join('|') !== before) repairs.mojibake++;

    // Score sitting in the status column (column drift)
    const scoreInStatus = status.match(SCORE_RE);
    if (scoreInStatus) {
      if (!SCORE_RE.test(score)) score = scoreInStatus[1];
      status = 'Evaluated';
      repairs.scoreInStatus++;
    }

    const canonical = normalizeStatus(status, states);
    if (!canonical) {
      notes = notes ? `${notes} [migrate: original status "${status}"]` : `[migrate: original status "${status}"]`;
      status = 'Evaluated';
      repairs.unknownStatus++;
    } else {
      status = canonical;
    }

    let id = parseInt(idRaw, 10);
    if (!Number.isInteger(id) || id <= 0 || usedIds.has(id)) {
      id = 0; // assign after the pass, once maxId is known
      repairs.badId++;
    } else {
      usedIds.add(id);
      if (id > maxId) maxId = id;
    }

    if (!DATE_RE.test(date)) repairs.badDate++; // kept as-is — flagged, not destroyed

    apps.push({ id, date, company, role, score: score || '—', status, pdf: pdf || '❌', report: report || '—', notes });
  }
  for (const app of apps) if (app.id === 0) app.id = ++maxId;

  console.log(`Repairs: ${repairs.mojibake} mojibake placeholders, ${repairs.scoreInStatus} scores moved out of status column, ` +
    `${repairs.unknownStatus} unknown statuses defaulted to Evaluated (original kept in notes), ` +
    `${repairs.badId} missing/duplicate ids reassigned, ${repairs.badDate} malformed dates flagged`);

  if (dryRun) {
    console.log('(dry run — no database written)');
    return;
  }

  const DatabaseSync = await loadSqlite();
  const db = openDb(DatabaseSync);
  const existing = db.prepare('SELECT COUNT(*) AS n FROM applications').get().n;
  if (existing > 0) {
    console.error(`Error: ${DB_PATH} already contains ${existing} rows. Delete the file to re-migrate.`);
    process.exit(1);
  }

  copyFileSync(MD_PATH, MD_PATH + '.pre-migrate.bak');
  const insertApp = db.prepare('INSERT INTO applications (id, date, company, role, score, status, pdf, report, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertEvent = db.prepare('INSERT INTO status_events (app_id, status, date) VALUES (?, ?, ?)');
  db.exec('BEGIN');
  try {
    for (const a of apps) {
      insertApp.run(a.id, a.date, a.company, a.role, a.score, a.status, a.pdf, a.report, a.notes);
      insertEvent.run(a.id, a.status, DATE_RE.test(a.date) ? a.date : new Date().toISOString().slice(0, 10));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  console.log(`Migrated ${apps.length} applications into ${DB_PATH} (markdown backed up to ${MD_PATH}.pre-migrate.bak)`);
  console.log(`Next: \`node tracker.mjs render\` regenerates ${MD_PATH} as a clean view.`);
}

// ── Query helpers ───────────────────────────────────────────────────

function flagValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] !== undefined && !args[idx + 1].startsWith('--')) return args[idx + 1];
  const kv = args.find(a => a.startsWith(flag + '='));
  return kv ? kv.split('=').slice(1).join('=') : null;
}

function rowToMarkdown(r) {
  const clean = (v) => String(v ?? '').replace(/\|/g, '│').replace(/\r?\n/g, ' ');
  return `| ${r.id} | ${clean(r.date)} | ${clean(r.company)} | ${clean(r.role)} | ${clean(r.score)} | ${clean(r.status)} | ${clean(r.pdf)} | ${clean(r.report)} | ${clean(r.notes)} |`;
}

async function query(args) {
  const DatabaseSync = await loadSqlite();
  const db = openDb(DatabaseSync);
  const states = loadStates();

  const where = [];
  const params = [];
  const status = flagValue(args, '--status');
  if (status) {
    const canonical = normalizeStatus(status, states);
    if (!canonical) { console.error(`Error: unknown status "${status}". Canonical: ${states.labels.join(', ')}`); process.exit(1); }
    where.push('status = ?'); params.push(canonical);
  }
  const company = flagValue(args, '--company');
  if (company) { where.push('company LIKE ?'); params.push(`%${company}%`); }
  const role = flagValue(args, '--role');
  if (role) { where.push('role LIKE ?'); params.push(`%${role}%`); }
  const since = flagValue(args, '--since');
  if (since) {
    if (!DATE_RE.test(since)) { console.error('Error: --since must be YYYY-MM-DD'); process.exit(1); }
    where.push('date >= ?'); params.push(since);
  }
  const id = flagValue(args, '--id');
  if (id) { where.push('id = ?'); params.push(parseInt(id, 10)); }

  let sql = 'SELECT * FROM applications' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY id DESC';
  const limit = parseInt(flagValue(args, '--limit') || '0', 10);
  if (limit > 0) { sql += ' LIMIT ?'; params.push(limit); }

  const rows = db.prepare(sql).all(...params);
  if (args.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log(HEADER);
    console.log(SEPARATOR);
    for (const r of rows) console.log(rowToMarkdown(r));
    console.error(`\n${rows.length} row(s)`); // stderr so stdout stays pipeable
  }
}

// ── Mutations ───────────────────────────────────────────────────────

async function add(args) {
  const DatabaseSync = await loadSqlite();
  const db = openDb(DatabaseSync);
  const states = loadStates();

  const company = flagValue(args, '--company');
  const role = flagValue(args, '--role');
  if (!company || !role) { console.error('Error: add requires --company and --role'); process.exit(1); }

  // Repo rule: never create a new entry when company+role already exists.
  const dupe = db.prepare('SELECT id, status FROM applications WHERE lower(company) = ? AND lower(role) = ?')
    .get(company.toLowerCase(), role.toLowerCase());
  if (dupe && !args.includes('--force')) {
    console.error(`Error: "${company}" + "${role}" already exists as #${dupe.id} (${dupe.status}). Use \`update --id ${dupe.id}\` or --force.`);
    process.exit(1);
  }

  const status = normalizeStatus(flagValue(args, '--status') || 'Evaluated', states);
  if (!status) { console.error(`Error: unknown status. Canonical: ${states.labels.join(', ')}`); process.exit(1); }
  const date = flagValue(args, '--date') || new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(date)) { console.error('Error: --date must be YYYY-MM-DD'); process.exit(1); }

  const id = (db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM applications').get().m) + 1;
  db.prepare('INSERT INTO applications (id, date, company, role, score, status, pdf, report, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, date, company, role, flagValue(args, '--score') || '—', status,
      flagValue(args, '--pdf') || '❌', flagValue(args, '--report') || '—', flagValue(args, '--notes') || '');
  db.prepare('INSERT INTO status_events (app_id, status, date) VALUES (?, ?, ?)').run(id, status, date);
  console.log(rowToMarkdown(db.prepare('SELECT * FROM applications WHERE id = ?').get(id)));
}

async function update(args) {
  const DatabaseSync = await loadSqlite();
  const db = openDb(DatabaseSync);
  const states = loadStates();

  const id = parseInt(flagValue(args, '--id') || '', 10);
  if (!Number.isInteger(id)) { console.error('Error: update requires --id N'); process.exit(1); }
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  if (!row) { console.error(`Error: no application with id ${id}`); process.exit(1); }

  const sets = [];
  const params = [];
  for (const field of ['score', 'pdf', 'report', 'notes', 'company', 'role', 'date']) {
    const v = flagValue(args, '--' + field);
    if (v !== null) { sets.push(`${field} = ?`); params.push(v); }
  }
  const statusRaw = flagValue(args, '--status');
  let newStatus = null;
  if (statusRaw) {
    newStatus = normalizeStatus(statusRaw, states);
    if (!newStatus) { console.error(`Error: unknown status "${statusRaw}". Canonical: ${states.labels.join(', ')}`); process.exit(1); }
    sets.push('status = ?'); params.push(newStatus);
  }
  if (sets.length === 0) { console.error('Error: nothing to update — pass at least one field flag'); process.exit(1); }

  params.push(id);
  db.prepare(`UPDATE applications SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  if (newStatus && newStatus !== row.status) {
    const eventDate = flagValue(args, '--date') || new Date().toISOString().slice(0, 10);
    db.prepare('INSERT INTO status_events (app_id, status, date) VALUES (?, ?, ?)').run(id, newStatus, eventDate);
  }
  console.log(rowToMarkdown(db.prepare('SELECT * FROM applications WHERE id = ?').get(id)));
}

async function history(args) {
  const DatabaseSync = await loadSqlite();
  const db = openDb(DatabaseSync);
  const id = parseInt(flagValue(args, '--id') || '', 10);
  if (!Number.isInteger(id)) { console.error('Error: history requires --id N'); process.exit(1); }
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  if (!app) { console.error(`Error: no application with id ${id}`); process.exit(1); }
  console.log(`#${app.id} ${app.company} — ${app.role}`);
  for (const e of db.prepare('SELECT status, date FROM status_events WHERE app_id = ? ORDER BY id').all(id)) {
    console.log(`  ${e.date}  ${e.status}`);
  }
}

// ── Render (db → markdown view) ─────────────────────────────────────

async function render() {
  const DatabaseSync = await loadSqlite();
  const db = openDb(DatabaseSync);
  const rows = db.prepare('SELECT * FROM applications ORDER BY id DESC').all();
  if (rows.length === 0) {
    console.error(`Error: ${DB_PATH} is empty — run \`migrate\` first (refusing to overwrite ${MD_PATH} with nothing).`);
    process.exit(1);
  }
  // Safety: never silently clobber a hand-maintained tracker that was never migrated.
  if (existsSync(MD_PATH) && !readFileSync(MD_PATH, 'utf-8').includes(RENDER_MARKER)) {
    copyFileSync(MD_PATH, MD_PATH + '.bak');
    console.log(`Existing hand-maintained ${MD_PATH} backed up to ${MD_PATH}.bak`);
  }
  const out = [
    '# Applications Tracker',
    '',
    RENDER_MARKER,
    '',
    HEADER,
    SEPARATOR,
    ...rows.map(rowToMarkdown),
    '',
  ].join('\n');
  writeFileSync(MD_PATH, out, 'utf-8');
  console.log(`Rendered ${rows.length} applications to ${MD_PATH}`);
}

// ── Main ────────────────────────────────────────────────────────────

const COMMANDS = { migrate, query, add, update, history, render };

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const fn = COMMANDS[command];
  if (!fn) {
    console.log('Usage: node tracker.mjs <migrate|query|add|update|history|render> [flags]');
    console.log('See the header comment of this file for examples, or docs/SCRIPTS.md.');
    process.exit(command ? 1 : 0);
  }
  await fn(args);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
