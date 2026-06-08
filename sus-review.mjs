/**
 * sus-review.mjs
 * Interactive terminal utility for reviewing the AutoSubmit SuS queue.
 *
 * Usage:
 *   node sus-review.mjs          → Interactive review of all pending entries
 *   node sus-review.mjs --list   → Print queue summary and exit
 *   node sus-review.mjs --stats  → Print full stats and exit
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const SUS_DB_PATH = join(__dirname, 'data', 'sus-db.json');

// ── ANSI colours ─────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  yellow: '\x1b[33m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  gray:   '\x1b[90m',
};

function color(str, ...codes) {
  return codes.join('') + str + C.reset;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadDb() {
  if (!existsSync(SUS_DB_PATH)) {
    console.error(color('sus-db.json not found at: ' + SUS_DB_PATH, C.red));
    process.exit(1);
  }
  return JSON.parse(readFileSync(SUS_DB_PATH, 'utf8'));
}

function saveDb(db) {
  db.last_updated = new Date().toISOString();
  writeFileSync(SUS_DB_PATH, JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return isoString.slice(0, 10);
}

function truncate(str, len) {
  if (!str) return '—';
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

function getPending(db) {
  const confirmedSet = new Set(db.confirmed.map(c => c.toLowerCase()));
  const skippedSet   = new Set((db.skipped || []).map(c =>
    (typeof c === 'string' ? c : c.company).toLowerCase()
  ));
  return (db.companies || []).filter(entry => {
    const name = (entry.company || '').toLowerCase();
    return !confirmedSet.has(name) && !skippedSet.has(name);
  });
}

// ── Print queue ───────────────────────────────────────────────────────────────

function printStats(db) {
  const pending   = getPending(db).length;
  const confirmed = db.confirmed.length;
  const skipped   = (db.skipped || []).length;
  const total     = (db.companies || []).length;

  console.log('');
  console.log(color('  AutoSubmit — SuS Queue Stats', C.bold, C.cyan));
  console.log(color('  ─────────────────────────────', C.dim));
  console.log(`  Total flagged : ${color(String(total),     C.white, C.bold)}`);
  console.log(`  Pending       : ${color(String(pending),   C.yellow, C.bold)}`);
  console.log(`  Confirmed ✓   : ${color(String(confirmed), C.green, C.bold)}`);
  console.log(`  Skipped ✗     : ${color(String(skipped),   C.gray, C.bold)}`);
  console.log('');

  if (confirmed > 0) {
    console.log(color('  Confirmed companies:', C.green));
    db.confirmed.forEach(c => console.log(color(`    ✓ ${c}`, C.green)));
    console.log('');
  }

  if ((db.skipped || []).length > 0) {
    console.log(color('  Skipped companies:', C.gray));
    db.skipped.forEach(c => {
      const name = typeof c === 'string' ? c : c.company;
      console.log(color(`    ✗ ${name}`, C.gray));
    });
    console.log('');
  }
}

function printQueue(entries) {
  if (entries.length === 0) {
    console.log(color('\n  ✅ SuS queue is empty — no pending companies.\n', C.green));
    return;
  }

  console.log('');
  console.log(color('  ⚠  SuS Queue — Pending Validation', C.bold, C.yellow));
  console.log(color('  ──────────────────────────────────', C.dim));
  console.log(
    color(
      `  ${'#'.padEnd(3)} ${'Company'.padEnd(22)} ${'Grade'.padEnd(6)} ${'Flagged'.padEnd(12)} URL`,
      C.bold
    )
  );
  console.log(color('  ' + '─'.repeat(90), C.dim));

  entries.forEach((entry, i) => {
    const num     = String(i + 1).padEnd(3);
    const company = truncate(entry.company || '—', 22).padEnd(22);
    const grade   = (entry.grade || '?').padEnd(6);
    const date    = formatDate(entry.flagged_at).padEnd(12);
    const url     = truncate(entry.url || '—', 55);
    console.log(`  ${color(num, C.cyan)} ${color(company, C.white, C.bold)} ${color(grade, C.yellow)} ${color(date, C.gray)} ${color(url, C.dim)}`);
  });
  console.log('');
}

// ── Interactive prompt ────────────────────────────────────────────────────────

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function interactiveReview(db) {
  const pending = getPending(db);

  printStats(db);
  printQueue(pending);

  if (pending.length === 0) return;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(color('  For each company: [C]onfirm  [S]kip  [V]iew URL  [Q]uit\n', C.dim));

  for (let i = 0; i < pending.length; i++) {
    const entry = pending[i];
    const label = color(`  [${i + 1}/${pending.length}] ${entry.company}`, C.bold, C.yellow) +
                  color(` (${entry.grade ?? '?'}, flagged ${formatDate(entry.flagged_at)})`, C.dim);

    console.log(label);

    let done = false;
    while (!done) {
      const answer = (await prompt(rl, color('      Action [c/s/v/q]: ', C.cyan))).trim().toLowerCase();

      if (answer === 'c') {
        if (!db.confirmed.includes(entry.company)) {
          db.confirmed.push(entry.company);
          saveDb(db);
        }
        console.log(color(`      ✓ "${entry.company}" confirmed — will be allowed for auto-submit.`, C.green));
        done = true;

      } else if (answer === 's') {
        if (!db.skipped) db.skipped = [];
        const alreadySkipped = db.skipped.some(s =>
          (typeof s === 'string' ? s : s.company).toLowerCase() === entry.company.toLowerCase()
        );
        if (!alreadySkipped) {
          db.skipped.push({ company: entry.company, skipped_at: new Date().toISOString() });
          saveDb(db);
        }
        console.log(color(`      ✗ "${entry.company}" skipped — will not be auto-submitted.`, C.gray));
        done = true;

      } else if (answer === 'v') {
        console.log(color(`      URL: ${entry.url || '—'}`, C.dim));

      } else if (answer === 'q') {
        console.log(color('\n  Exiting SuS review. Progress saved.\n', C.dim));
        rl.close();
        return;

      } else {
        console.log(color('      Invalid input. Use c, s, v, or q.', C.red));
      }
    }
    console.log('');
  }

  rl.close();

  // Re-print stats after review
  const refreshed = loadDb();
  const remaining = getPending(refreshed).length;
  console.log(color(`  Review complete. ${remaining} entries still pending.\n`, C.bold));

  // Remind about confirming and re-running
  const justConfirmed = refreshed.confirmed.filter(c =>
    pending.some(p => p.company.toLowerCase() === c.toLowerCase())
  );
  if (justConfirmed.length > 0) {
    console.log(color('  To submit confirmed jobs, run:', C.dim));
    pending
      .filter(p => justConfirmed.some(c => c.toLowerCase() === p.company.toLowerCase()))
      .forEach(p => {
        console.log(color(`    node auto-submit.mjs --url "${p.url}" --grade ${p.grade ?? 'B'}`, C.cyan));
      });
    console.log('');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const db   = loadDb();

if (args.includes('--stats')) {
  printStats(db);
  process.exit(0);
}

if (args.includes('--list')) {
  printStats(db);
  printQueue(getPending(db));
  process.exit(0);
}

// Default: interactive review
await interactiveReview(db);
