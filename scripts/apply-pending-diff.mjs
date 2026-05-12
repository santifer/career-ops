#!/usr/bin/env node
/**
 * apply-pending-diff — review and apply diffs from data/pending-diffs/.
 *
 * Lists every .md file in data/pending-diffs/, shows its title, and offers to:
 * - View it (cat to stdout)
 * - Mark it reviewed (append `<!-- REVIEWED: {ISO date} -->` and rename to data/pending-diffs/applied/)
 * - Skip it (no change)
 *
 * Designed for non-interactive consumption too:
 *   node scripts/apply-pending-diff.mjs --list                  # JSON list of pending diffs
 *   node scripts/apply-pending-diff.mjs --view {filename}       # cat a specific diff
 *   node scripts/apply-pending-diff.mjs --mark-reviewed {file}  # mark a specific diff applied
 *   node scripts/apply-pending-diff.mjs                          # interactive (stdin/stdout)
 *
 * IMPORTANT: this script does NOT auto-apply diffs to source files. Mitchell still
 * has to manually copy proposed changes into config/profile.yml etc. The script
 * tracks which diffs have been read and processed, so the same Grok run doesn't
 * surface in tomorrow's heartbeat as still-pending.
 */

import { readFileSync, existsSync, readdirSync, mkdirSync, renameSync, appendFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PENDING_DIR = join(ROOT, 'data/pending-diffs');
const APPLIED_DIR = join(PENDING_DIR, 'applied');

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => {
    if (!a.startsWith('--')) return [`__pos${i}`, a];
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? (arr[i+1] && !arr[i+1].startsWith('--') ? arr[i+1] : true)];
  })
);

if (!existsSync(PENDING_DIR)) {
  console.log('No pending-diffs directory.');
  process.exit(0);
}

function listPending() {
  const files = readdirSync(PENDING_DIR)
    .filter(f => f.endsWith('.md') && f !== '.gitkeep')
    .map(f => {
      const path = join(PENDING_DIR, f);
      const stat = statSync(path);
      const content = readFileSync(path, 'utf-8');
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const reviewed = /<!--\s*REVIEWED/i.test(content);
      return {
        filename: f,
        path,
        title: titleMatch ? titleMatch[1] : f,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        reviewed,
      };
    });
  return files;
}

function markReviewed(filename) {
  const src = join(PENDING_DIR, filename);
  if (!existsSync(src)) {
    console.error(`Not found: ${filename}`);
    return false;
  }
  if (!existsSync(APPLIED_DIR)) mkdirSync(APPLIED_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const content = readFileSync(src, 'utf-8');
  if (!/<!--\s*REVIEWED/i.test(content)) {
    appendFileSync(src, `\n<!-- REVIEWED: ${today} -->\n`);
  }
  const dst = join(APPLIED_DIR, filename);
  renameSync(src, dst);
  console.log(`✅ ${filename} → ${dst}`);
  return true;
}

function viewDiff(filename) {
  const path = join(PENDING_DIR, filename);
  if (!existsSync(path)) {
    console.error(`Not found: ${filename}`);
    return false;
  }
  process.stdout.write(readFileSync(path, 'utf-8'));
  return true;
}

if (args.list) {
  console.log(JSON.stringify(listPending(), null, 2));
  process.exit(0);
}

if (args.view) {
  const filename = typeof args.view === 'string' ? args.view : args.__pos1;
  if (!filename) { console.error('--view requires a filename'); process.exit(1); }
  const ok = viewDiff(filename);
  process.exit(ok ? 0 : 1);
}

if (args['mark-reviewed']) {
  const filename = typeof args['mark-reviewed'] === 'string' ? args['mark-reviewed'] : args.__pos1;
  if (!filename) { console.error('--mark-reviewed requires a filename'); process.exit(1); }
  const ok = markReviewed(filename);
  process.exit(ok ? 0 : 1);
}

// Interactive mode
async function interactive() {
  const files = listPending();
  if (files.length === 0) {
    console.log('No pending diffs.');
    return;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, ans => res(ans)));

  console.log(`\n${files.length} pending diff(s) in ${PENDING_DIR}:\n`);
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    console.log(`  [${i + 1}] ${f.filename}`);
    console.log(`      ${f.title}`);
    console.log(`      ${f.size} bytes · modified ${f.mtime}${f.reviewed ? ' · ALREADY REVIEWED' : ''}`);
    console.log('');
  }

  const choice = await ask('Select [N] to view, [N!] to mark reviewed, or q to quit: ');
  if (choice.toLowerCase() === 'q' || !choice.trim()) {
    rl.close();
    return;
  }
  const force = choice.endsWith('!');
  const idx = parseInt(choice.replace('!', '').trim(), 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= files.length) {
    console.error('Invalid selection.');
    rl.close();
    return;
  }
  const file = files[idx];
  if (force) {
    markReviewed(file.filename);
    rl.close();
    return;
  }
  console.log(`\n--- ${file.filename} ---\n`);
  process.stdout.write(readFileSync(file.path, 'utf-8'));
  console.log('\n--- end ---\n');
  const action = await ask('Mark reviewed (y) or skip (n)? ');
  if (action.toLowerCase().startsWith('y')) {
    markReviewed(file.filename);
  } else {
    console.log('Skipped.');
  }
  rl.close();
}

interactive().catch(err => {
  console.error(err);
  process.exit(1);
});
