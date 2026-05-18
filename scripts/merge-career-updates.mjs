#!/usr/bin/env node
/**
 * scripts/merge-career-updates.mjs — corpus auto-merge for the Update Drawer
 * (Inventory Document B item #5, v1 MVP — 2026-05-18).
 *
 * Reads new entries from data/career-updates.jsonl (since the cursor in
 * data/career-updates-merged-cursor.txt), routes them into the right corpus
 * file by tag, and commits via scripts/agent-commit.mjs so the change has a
 * proper audit trail.
 *
 * Routing:
 *   tag=project   → interview-prep/story-bank.md  (Recent updates section)
 *   tag=1:1       → interview-prep/story-bank.md  (Recent updates section)
 *   tag=cert      → cv.md                         (Recent section)
 *   tag=training  → cv.md                         (Recent section)
 *   tag=note      → (skipped — personal scratch; JSONL is the system of record)
 *
 * Idempotency:
 *   - Cursor file records the byte offset of the last merged JSONL line so
 *     re-runs don't double-append. A merge run reads lines after the cursor,
 *     appends summary bullets to the target corpus, then updates the cursor.
 *   - --dry-run prints what would happen without writing or committing.
 *   - Env UPDATE_MERGER_DISABLED=1 short-circuits the script (returns ok:true,
 *     skipped:'disabled-by-env'). The endpoint uses this to back off during
 *     batch runs or unit tests.
 *
 * Usage:
 *   node scripts/merge-career-updates.mjs            # merge up to 10 new entries
 *   node scripts/merge-career-updates.mjs --limit 5  # bound the batch size
 *   node scripts/merge-career-updates.mjs --dry-run  # preview only
 *
 * Output (stdout, JSON):
 *   { ok, merged, files, skipped, commit_sha?, dry_run? }
 */

import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));

const JSONL_PATH   = join(ROOT, 'data/career-updates.jsonl');
const CURSOR_PATH  = join(ROOT, 'data/career-updates-merged-cursor.txt');
const STORY_BANK   = join(ROOT, 'interview-prep/story-bank.md');
const CV_PATH      = join(ROOT, 'cv.md');
const AGENT_COMMIT = join(ROOT, 'scripts/agent-commit.mjs');

const args = process.argv.slice(2);
function flag(name) { return args.includes(name); }
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const DRY_RUN = flag('--dry-run');
const LIMIT   = parseInt(arg('--limit', '10'), 10) || 10;

const VALID_TAGS = new Set(['project', 'cert', 'training', '1:1', 'note']);
const STORY_SECTION_HEADING = '## Recent updates (auto-merged via Update Drawer)';
const CV_SECTION_HEADING    = '## Recent';

function out(payload) {
  console.log(JSON.stringify(payload));
}

if (process.env.UPDATE_MERGER_DISABLED === '1') {
  out({ ok: true, skipped: 'disabled-by-env' });
  process.exit(0);
}

if (!existsSync(JSONL_PATH)) {
  out({ ok: true, skipped: 'no-jsonl', merged: 0, files: [] });
  process.exit(0);
}

// Read cursor (entry-count index — simpler than byte offset for an append-only
// JSONL with stable line ordering).
let cursor = 0;
if (existsSync(CURSOR_PATH)) {
  const raw = readFileSync(CURSOR_PATH, 'utf-8').trim();
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 0) cursor = n;
}

// Read JSONL
const jsonl = readFileSync(JSONL_PATH, 'utf-8').split('\n').filter(Boolean);
const totalEntries = jsonl.length;

if (cursor >= totalEntries) {
  out({ ok: true, skipped: 'up-to-date', merged: 0, cursor, total: totalEntries, files: [] });
  process.exit(0);
}

// Parse the new entries (cursor..cursor+LIMIT)
const newRaw = jsonl.slice(cursor, cursor + LIMIT);
const newEntries = [];
for (const line of newRaw) {
  try {
    const e = JSON.parse(line);
    if (e && typeof e.text === 'string' && VALID_TAGS.has(e.tag)) {
      newEntries.push(e);
    }
  } catch (_) {
    // Malformed line — skip but still advance cursor so we don't loop forever
  }
}

const advanceTo = cursor + newRaw.length;

if (!newEntries.length) {
  // Still advance the cursor over the malformed lines
  if (!DRY_RUN) writeFileSync(CURSOR_PATH, String(advanceTo) + '\n');
  out({ ok: true, skipped: 'no-valid-entries', merged: 0, cursor: advanceTo, files: [] });
  process.exit(0);
}

// Group entries by target file
const toStoryBank = newEntries.filter(e => e.tag === 'project' || e.tag === '1:1');
const toCv        = newEntries.filter(e => e.tag === 'cert' || e.tag === 'training');
const skipped     = newEntries.filter(e => e.tag === 'note');

function summaryLine(e) {
  const dateStr = (e.date || '').slice(0, 10);
  const tagStr  = `[${e.tag}]`;
  // Keep the merged line tight — 200 chars max + ellipsis. Full text stays in
  // the JSONL for anyone who needs the unabridged version.
  const t = (e.text || '').replace(/\s+/g, ' ').trim();
  const preview = t.length > 200 ? t.slice(0, 200).trimEnd() + '…' : t;
  return `- ${dateStr} ${tagStr} ${preview}`;
}

function appendToSection(filePath, heading, lines) {
  // Read or seed the file. If the heading exists, append after its trailing
  // block; if not, add the section to the end of the file.
  let content = '';
  if (existsSync(filePath)) {
    content = readFileSync(filePath, 'utf-8');
  }

  const headingIdx = content.indexOf(heading);
  if (headingIdx === -1) {
    const trail = content.endsWith('\n') ? '' : '\n';
    const block = `${trail}\n${heading}\n\n${lines.join('\n')}\n`;
    return content + block;
  }

  // Section exists. Insert after the last line of that section (i.e., before
  // the next ## heading or EOF). This keeps the section monotonically growing.
  const afterHeading = headingIdx + heading.length;
  // Find the next "## " heading after this one
  const remainder = content.slice(afterHeading);
  const nextHeadingMatch = remainder.match(/\n## [^\n]/);
  let insertPoint;
  if (nextHeadingMatch) {
    insertPoint = afterHeading + nextHeadingMatch.index;
  } else {
    insertPoint = content.length;
  }
  // Find the end of the existing section content (strip trailing whitespace)
  const before = content.slice(0, insertPoint).replace(/\s+$/, '');
  const after  = content.slice(insertPoint);
  const joined = `${before}\n${lines.join('\n')}\n${after.startsWith('\n') ? after : '\n' + after}`;
  return joined;
}

const changedFiles = [];

if (toStoryBank.length) {
  const newContent = appendToSection(
    STORY_BANK,
    STORY_SECTION_HEADING,
    toStoryBank.map(summaryLine),
  );
  if (DRY_RUN) {
    // Don't write
  } else {
    writeFileSync(STORY_BANK, newContent);
  }
  changedFiles.push('interview-prep/story-bank.md');
}

if (toCv.length) {
  const newContent = appendToSection(
    CV_PATH,
    CV_SECTION_HEADING,
    toCv.map(summaryLine),
  );
  if (DRY_RUN) {
    // Don't write
  } else {
    writeFileSync(CV_PATH, newContent);
  }
  changedFiles.push('cv.md');
}

// Advance the cursor over ALL lines we processed (including skipped notes
// and any malformed lines) so future runs don't reprocess them.
if (!DRY_RUN) writeFileSync(CURSOR_PATH, String(advanceTo) + '\n');

if (DRY_RUN) {
  out({
    ok: true,
    dry_run: true,
    merged: toStoryBank.length + toCv.length,
    skipped: skipped.length,
    files: changedFiles,
    cursor_would_be: advanceTo,
    preview: {
      story_bank: toStoryBank.map(summaryLine),
      cv:         toCv.map(summaryLine),
    },
  });
  process.exit(0);
}

// Commit via agent-commit.mjs so the change is tracked in git history.
// Skip the commit step if there's nothing to commit (only "note" entries).
if (!changedFiles.length) {
  out({ ok: true, merged: 0, skipped: skipped.length, files: [], cursor: advanceTo });
  process.exit(0);
}

const commitMessage = `chore(update-drawer): auto-merge ${newEntries.length - skipped.length} career update(s) — ${changedFiles.join(', ')}`;
const r = spawnSync('node', [
  AGENT_COMMIT,
  '--agent', 'update-drawer-merger',
  '--files', changedFiles.join(','),
  '--message', commitMessage,
], { cwd: ROOT, encoding: 'utf-8' });

let commitSha = null;
let commitOk  = false;
try {
  const parsed = JSON.parse(r.stdout || '{}');
  commitOk = !!parsed.ok;
  commitSha = parsed.sha || null;
} catch (_) {}

out({
  ok: true,
  merged: toStoryBank.length + toCv.length,
  skipped: skipped.length,
  files: changedFiles,
  cursor: advanceTo,
  commit_ok: commitOk,
  commit_sha: commitSha,
  commit_stdout_tail: (r.stdout || '').slice(-300),
});
