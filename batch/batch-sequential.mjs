#!/usr/bin/env node

/**
 * career-ops batch sequential processor (IDE-friendly)
 *
 * Reads batch-input.tsv and prepares evaluation context for each offer.
 * Unlike batch-runner.sh (which uses `claude -p` workers), this script
 * works with any IDE by generating structured prompts the user can feed
 * to their AI agent one at a time.
 *
 * Usage:
 *   node batch/batch-sequential.mjs                    # List pending offers
 *   node batch/batch-sequential.mjs --prepare           # Generate prompt files
 *   node batch/batch-sequential.mjs --mark-done <id>    # Mark offer as completed
 *   node batch/batch-sequential.mjs --status             # Show batch status
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_DIR = join(__dirname, '..');
const BATCH_DIR = __dirname;
const INPUT_FILE = join(BATCH_DIR, 'batch-input.tsv');
const STATE_FILE = join(BATCH_DIR, 'batch-state.tsv');
const PROMPTS_DIR = join(BATCH_DIR, 'prompts');
const REPORTS_DIR = join(PROJECT_DIR, 'reports');

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureDirs() {
  for (const dir of [PROMPTS_DIR, join(BATCH_DIR, 'tracker-additions'), join(BATCH_DIR, 'logs'), REPORTS_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

function readTSV(filePath) {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
  if (lines.length <= 1) return [];
  const headers = lines[0].split('\t');
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = line.split('\t');
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (values[i] || '').trim());
    return obj;
  });
}

function getNextReportNum() {
  let max = 0;

  // Check reports directory
  if (existsSync(REPORTS_DIR)) {
    for (const f of readdirSync(REPORTS_DIR)) {
      const match = f.match(/^(\d+)-/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
  }

  // Check state file
  const state = readTSV(STATE_FILE);
  for (const row of state) {
    if (row.report_num && row.report_num !== '-') {
      const num = parseInt(row.report_num, 10);
      if (num > max) max = num;
    }
  }

  return String(max + 1).padStart(3, '0');
}

function getState() {
  return readTSV(STATE_FILE);
}

function initState() {
  if (!existsSync(STATE_FILE)) {
    writeFileSync(STATE_FILE, 'id\turl\tstatus\tstarted_at\tcompleted_at\treport_num\tscore\terror\tretries\n');
  }
}

function updateState(id, updates) {
  initState();
  const lines = readFileSync(STATE_FILE, 'utf-8').trim().split('\n');
  const header = lines[0];
  const headers = header.split('\t');
  let found = false;
  const newLines = [header];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const rowId = values[0]?.trim();
    if (rowId === String(id)) {
      found = true;
      const row = {};
      headers.forEach((h, idx) => row[h.trim()] = values[idx]?.trim() || '-');
      Object.assign(row, updates);
      newLines.push(headers.map(h => row[h.trim()] || '-').join('\t'));
    } else {
      newLines.push(lines[i]);
    }
  }

  if (!found) {
    const row = { id: String(id), url: '-', status: '-', started_at: '-', completed_at: '-', report_num: '-', score: '-', error: '-', retries: '0' };
    Object.assign(row, updates);
    newLines.push(headers.map(h => row[h.trim()] || '-').join('\t'));
  }

  writeFileSync(STATE_FILE, newLines.join('\n') + '\n');
}

// ── Commands ─────────────────────────────────────────────────────────────────

function listPending() {
  if (!existsSync(INPUT_FILE)) {
    console.log('❌ No batch-input.tsv found. Add offers first.');
    console.log('   Format: id\\turl\\tsource\\tnotes');
    return;
  }

  const input = readTSV(INPUT_FILE);
  const state = getState();
  const completedIds = new Set(state.filter(s => s.status === 'completed').map(s => s.id));

  const pending = input.filter(row => !completedIds.has(row.id));

  if (pending.length === 0) {
    console.log('✅ All offers have been processed!');
    return;
  }

  console.log(`\n📋 Pending offers (${pending.length}/${input.length}):\n`);
  for (const row of pending) {
    const stateRow = state.find(s => s.id === row.id);
    const status = stateRow?.status || 'new';
    console.log(`  #${row.id}  ${row.url}`);
    console.log(`        Source: ${row.source || '-'}  Status: ${status}`);
    if (row.notes) console.log(`        Notes: ${row.notes}`);
    console.log();
  }

  console.log('To generate prompt files: node batch/batch-sequential.mjs --prepare');
  console.log('To mark as done:          node batch/batch-sequential.mjs --mark-done <id>');
}

function preparePrompts() {
  if (!existsSync(INPUT_FILE)) {
    console.log('❌ No batch-input.tsv found.');
    return;
  }

  ensureDirs();
  initState();

  const input = readTSV(INPUT_FILE);
  const state = getState();
  const completedIds = new Set(state.filter(s => s.status === 'completed').map(s => s.id));
  const pending = input.filter(row => !completedIds.has(row.id));

  if (pending.length === 0) {
    console.log('✅ All offers already processed!');
    return;
  }

  console.log(`\n🔧 Preparing ${pending.length} prompt files...\n`);

  let reportNum = parseInt(getNextReportNum(), 10);
  const today = new Date().toISOString().split('T')[0];

  for (const row of pending) {
    const num = String(reportNum).padStart(3, '0');
    const promptContent = `# Career-Ops Evaluation — Batch Item #${row.id}

## Instructions

Run the full auto-pipeline for this offer. Read nodes/_shared.md + modes/auto-pipeline.md for the complete flow.

**Quick summary of what to do:**
1. Extract the JD from the URL (use browser or web fetch)
2. Read cv.md, modes/_profile.md, article-digest.md (if exists), config/profile.yml
3. Classify the archetype
4. Run the 6-block A-F evaluation
5. Score (1-5 weighted average)
6. Save report as \`reports/${num}-{company-slug}-${today}.md\`
7. Generate ATS PDF via \`node generate-pdf.mjs\`
8. Write tracker TSV to \`batch/tracker-additions/${num}-{company-slug}.tsv\`

## Offer Details

- **URL:** ${row.url}
- **Source:** ${row.source || 'batch'}
- **Report Number:** ${num}
- **Date:** ${today}
- **Batch ID:** ${row.id}
${row.notes ? `- **Notes:** ${row.notes}` : ''}

## After Completing

Run this to mark the offer as done:
\`\`\`bash
node batch/batch-sequential.mjs --mark-done ${row.id}
\`\`\`

Then after all evaluations, merge tracker additions:
\`\`\`bash
node merge-tracker.mjs
\`\`\`
`;

    const promptFile = join(PROMPTS_DIR, `${num}-batch-${row.id}.md`);
    writeFileSync(promptFile, promptContent);
    updateState(row.id, { url: row.url, status: 'prepared', report_num: num, retries: '0' });

    console.log(`  ✅ #${row.id} → ${promptFile}`);
    reportNum++;
  }

  console.log(`\n📁 Prompt files saved to: ${PROMPTS_DIR}/`);
  console.log('\nWorkflow:');
  console.log('  1. Open each prompt file in your IDE');
  console.log('  2. Copy the content to your AI agent');
  console.log('  3. Let the agent run the pipeline');
  console.log('  4. Mark done: node batch/batch-sequential.mjs --mark-done <id>');
  console.log('  5. After all: node merge-tracker.mjs');
}

function markDone(id) {
  initState();
  const completedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  updateState(id, { status: 'completed', completed_at: completedAt });
  console.log(`✅ Offer #${id} marked as completed.`);
}

function showStatus() {
  if (!existsSync(STATE_FILE)) {
    console.log('No batch state found. Run --prepare first.');
    return;
  }

  const state = getState();
  if (state.length === 0) {
    console.log('No offers in batch state.');
    return;
  }

  let completed = 0, failed = 0, prepared = 0, other = 0;
  const scores = [];

  console.log('\n📊 Batch Status:\n');
  console.log('  ID    Status       Score   Report  URL');
  console.log('  ────  ──────────   ─────   ──────  ───');

  for (const row of state) {
    const status = (row.status || '-').padEnd(11);
    const score = (row.score || '-').padEnd(5);
    const report = (row.report_num || '-').padEnd(6);
    const url = (row.url || '-').substring(0, 60);
    console.log(`  ${(row.id || '-').padEnd(4)}  ${status}  ${score}   ${report}  ${url}`);

    switch (row.status) {
      case 'completed': completed++; if (row.score && row.score !== '-') scores.push(parseFloat(row.score)); break;
      case 'failed': failed++; break;
      case 'prepared': prepared++; break;
      default: other++;
    }
  }

  console.log(`\n  Total: ${state.length} | Completed: ${completed} | Prepared: ${prepared} | Failed: ${failed} | Other: ${other}`);
  if (scores.length > 0) {
    const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    console.log(`  Average score: ${avg}/5 (${scores.length} scored)`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
career-ops batch sequential processor (IDE-friendly)

Usage:
  node batch/batch-sequential.mjs                    List pending offers
  node batch/batch-sequential.mjs --prepare           Generate prompt files
  node batch/batch-sequential.mjs --mark-done <id>    Mark offer as completed
  node batch/batch-sequential.mjs --status             Show batch status
  `);
} else if (args.includes('--prepare')) {
  preparePrompts();
} else if (args.includes('--mark-done')) {
  const idx = args.indexOf('--mark-done');
  const id = args[idx + 1];
  if (!id) {
    console.error('Usage: --mark-done <id>');
    process.exit(1);
  }
  markDone(id);
} else if (args.includes('--status')) {
  showStatus();
} else {
  listPending();
}
