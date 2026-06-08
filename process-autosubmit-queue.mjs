#!/usr/bin/env node
/**
 * process-autosubmit-queue.mjs
 * Step 2 of the Windows AutoSubmit bat: read data/autosubmit-queue.json,
 * run auto-submit.mjs for each card, tally exit codes, write results to
 * data/autosubmit-results.json.
 *
 * Extracted from run-autosubmit.bat 2026-05-13 — inline node -e multiline JS
 * fails in Windows CMD (treats JS keywords as batch commands).
 *
 * Exit codes: 0 = completed (even with errors), 1 = could not read queue
 */

import { spawnSync }                                     from 'child_process';
import { readFileSync, writeFileSync, renameSync,
         existsSync, readdirSync, unlinkSync }           from 'fs';
import { join, dirname }                                 from 'path';
import { fileURLToPath }                                 from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH   = join(__dirname, 'data', 'autosubmit-queue.json');
const RESULTS_PATH = join(__dirname, 'data', 'autosubmit-results.json');
const OUTPUT_DIR   = join(__dirname, 'output');

let queue;
try {
  const raw = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
  queue = Array.isArray(raw) ? raw : (raw.jobs ?? []);
} catch (e) {
  console.error('Cannot read queue:', e.message);
  process.exit(1);
}

const tally = { submitted: 0, blocked: 0, sus_new: 0, errors: 0, deferred: 0 };
const notes = [];

for (const card of queue) {
  // Find most-recent matching cover letter in output/
  const slug  = card.company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const files = existsSync(OUTPUT_DIR)
    ? readdirSync(OUTPUT_DIR)
        .filter(f => f.toLowerCase().includes(slug) && f.endsWith('.txt'))
        .sort()
    : [];
  const clPath = files.length > 0 ? join(OUTPUT_DIR, files[files.length - 1]) : '';

  const args = ['auto-submit.mjs', '--url', card.url, '--grade', card.grade];
  if (clPath) args.push('--cl', clPath);

  console.log('[bat] Submitting ' + card.id + ' ' + card.company + '...');
  const result = spawnSync('node', args, {
    stdio:    'inherit',
    timeout:  300000,   // 5 min — TD-41b rescue + pre-auth Workday flow can take 2-3 min
    encoding: 'utf8',
    cwd:      __dirname,
  });
  const code = result.status ?? 1;

  if      (code === 0) { tally.submitted++; notes.push(card.id + ':applied');  console.log('[bat] ' + card.id + ' -> APPLIED'); }
  else if (code === 2) { tally.sus_new++;   notes.push(card.id + ':sus');      console.log('[bat] ' + card.id + ' -> SuS'); }
  else if (code === 3) { tally.blocked++;   notes.push(card.id + ':blocked');  console.log('[bat] ' + card.id + ' -> BLOCKED'); }
  else if (code === 4) { tally.deferred++;  notes.push(card.id + ':deferred'); console.log('[bat] ' + card.id + ' -> DEFERRED (Chromium missing)'); }
  else                 { tally.errors++;    notes.push(card.id + ':error');    console.log('[bat] ' + card.id + ' -> ERROR (exit ' + code + ')'); }
}

tally.notes = notes.join(', ');
const tmpResults = RESULTS_PATH + '.tmp';
writeFileSync(tmpResults, JSON.stringify(tally, null, 2), 'utf8');
renameSync(tmpResults, RESULTS_PATH);

// Clean up queue file
try { unlinkSync(QUEUE_PATH); } catch {}

console.log(
  '[bat] Done. submitted:' + tally.submitted +
  ' blocked:'  + tally.blocked +
  ' sus:'      + tally.sus_new +
  ' errors:'   + tally.errors +
  ' deferred:' + tally.deferred
);
