#!/usr/bin/env node

/**
 * One-time ai-job-search import/sync helper.
 *
 * Preview:
 *   node scripts/import-ai-job-search.mjs --source ../ai-job-search --dry-run
 *
 * Apply:
 *   node scripts/import-ai-job-search.mjs --source ../ai-job-search --apply
 *
 * Candidate facts are never imported into cv.md/profile files. LaTeX artifacts
 * are copied as historical outputs, and tracker rows go through
 * batch/tracker-additions plus merge-tracker.mjs.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs';
import { execFileSync } from 'child_process';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_ROOT = join(REPO_ROOT, 'output', 'imported-ai-job-search');
const ADDITIONS_DIR = join(REPO_ROOT, 'batch', 'tracker-additions');
const TRACKER_PATH = existsSync(join(REPO_ROOT, 'data', 'applications.md'))
  ? join(REPO_ROOT, 'data', 'applications.md')
  : join(REPO_ROOT, 'applications.md');
const CANONICAL_STATUSES = new Set(['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP']);

function usage() {
  return `Usage:
  node scripts/import-ai-job-search.mjs --source ../ai-job-search --dry-run
  node scripts/import-ai-job-search.mjs --source ../ai-job-search --apply`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { source: '../ai-job-search', dryRun: true, apply: false, noMerge: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--source') args.source = argv[++i];
    else if (arg.startsWith('--source=')) args.source = arg.slice('--source='.length);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--apply') {
      args.apply = true;
      args.dryRun = false;
    } else if (arg === '--no-merge') {
      args.noMerge = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return args;
}

function parseCsv(text) {
  const rows = [];
  let cell = '';
  let row = [];
  let quoted = false;

  function pushCell() {
    row.push(cell);
    cell = '';
  }
  function pushRow() {
    if (row.length > 0 || cell.length > 0) {
      pushCell();
      rows.push(row);
      row = [];
    }
  }

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      pushCell();
    } else if (ch === '\n') {
      pushRow();
    } else if (ch === '\r') {
      // ignore CR; LF will flush the row
    } else {
      cell += ch;
    }
  }
  pushRow();

  if (rows.length === 0) return { header: [], records: [] };
  const header = rows[0].map(h => h.trim());
  const records = rows.slice(1)
    .filter(r => r.some(v => String(v || '').trim()))
    .map(r => Object.fromEntries(header.map((h, idx) => [h, (r[idx] || '').trim()])));
  return { header, records };
}

function readTrackerCsv(sourceRoot) {
  const csvPath = join(sourceRoot, 'job_search_tracker.csv');
  if (!existsSync(csvPath)) return { path: csvPath, header: [], records: [], missing: true };
  const { header, records } = parseCsv(readFileSync(csvPath, 'utf-8'));
  return { path: csvPath, header, records, missing: false };
}

function readSeenJobs(sourceRoot) {
  const seenPath = join(sourceRoot, 'job_scraper', 'seen_jobs.json');
  if (!existsSync(seenPath)) return { path: seenPath, count: 0, missing: true };
  const json = JSON.parse(readFileSync(seenPath, 'utf-8'));
  let count = 0;
  if (Array.isArray(json)) count = json.length;
  else if (json && typeof json === 'object') count = Object.keys(json).length;
  return { path: seenPath, count, missing: false };
}

function listTexFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.toLowerCase().endsWith('.tex'))
    .map(name => {
      const full = join(dir, name);
      return { path: full, name, size: statSync(full).size };
    });
}

function trackerMaxNumber() {
  if (!existsSync(TRACKER_PATH)) return 0;
  const matches = readFileSync(TRACKER_PATH, 'utf-8').matchAll(/^\|\s*(\d+)\s*\|/gm);
  let max = 0;
  for (const match of matches) max = Math.max(max, Number.parseInt(match[1], 10));
  return max;
}

function canonicalStatus(raw) {
  const value = String(raw || '').trim();
  if (!value) return 'Evaluated';
  for (const status of CANONICAL_STATUSES) {
    if (status.toLowerCase() === value.toLowerCase()) return status;
  }
  const lower = value.toLowerCase();
  if (['sent', 'submitted'].includes(lower)) return 'Applied';
  if (['skip', 'no aplicar', 'no_apply'].includes(lower)) return 'SKIP';
  if (['discard', 'discarded', 'closed'].includes(lower)) return 'Discarded';
  return 'Evaluated';
}

function normalizeScore(raw) {
  const match = String(raw || '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return '0.0/5';
  let value = Number.parseFloat(match[1]);
  if (value > 10) value /= 20;
  else if (value > 5) value /= 2;
  value = Math.max(0, Math.min(5, value));
  return `${value.toFixed(1)}/5`;
}

function cleanCell(value) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim();
}

function tsvLine(row, num) {
  const date = row.date || new Date().toISOString().slice(0, 10);
  const company = row.company || 'Unknown company';
  const role = row.role || 'Unknown role';
  const status = canonicalStatus(row.status);
  const score = normalizeScore(row.fit_rating);
  const pdf = '❌';
  const report = '';
  const noteParts = [
    'Imported from ai-job-search',
    row.channel ? `channel=${row.channel}` : '',
    row.sector ? `sector=${row.sector}` : '',
    row.role_type ? `role_type=${row.role_type}` : '',
    row.source ? `source=${row.source}` : '',
    row.notes || '',
  ].filter(Boolean);
  const notes = noteParts.join('; ');
  return [
    num,
    date,
    company,
    role,
    status,
    score,
    pdf,
    report,
    notes,
  ].map(cleanCell).join('\t');
}

function copyArtifacts(files, destinationDir) {
  mkdirSync(destinationDir, { recursive: true });
  const copied = [];
  for (const file of files) {
    const target = join(destinationDir, basename(file.path));
    copyFileSync(file.path, target);
    copied.push({ source: file.path, target, size: file.size });
  }
  return copied;
}

function buildPreview(sourceRoot) {
  const tracker = readTrackerCsv(sourceRoot);
  const seenJobs = readSeenJobs(sourceRoot);
  const cvTex = listTexFiles(join(sourceRoot, 'cv'));
  const coverTex = listTexFiles(join(sourceRoot, 'cover_letters'));
  return {
    source: sourceRoot,
    tracker: {
      path: tracker.path,
      missing: tracker.missing,
      header: tracker.header,
      rows: tracker.records.length,
    },
    seenJobs,
    artifacts: {
      cvTex,
      coverTex,
    },
  };
}

function applyImport(preview) {
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  mkdirSync(ADDITIONS_DIR, { recursive: true });

  const copied = {
    cvTex: copyArtifacts(preview.artifacts.cvTex, join(OUTPUT_ROOT, 'cv')),
    coverTex: copyArtifacts(preview.artifacts.coverTex, join(OUTPUT_ROOT, 'cover_letters')),
  };

  const tracker = readTrackerCsv(preview.source);
  const trackerAdditions = [];
  let nextNum = trackerMaxNumber() + 1;
  tracker.records.forEach((row, idx) => {
    const num = nextNum;
    nextNum += 1;
    const filename = `import-ai-job-search-${String(idx + 1).padStart(3, '0')}.tsv`;
    const target = join(ADDITIONS_DIR, filename);
    writeFileSync(target, `${tsvLine(row, num)}\n`, 'utf-8');
    trackerAdditions.push(target);
  });

  const manifest = {
    importedAt: new Date().toISOString(),
    source: preview.source,
    copied,
    trackerRowsQueued: trackerAdditions.length,
    trackerAdditions,
    note: 'Candidate facts were not imported. Review copied artifacts before reuse.',
  };
  const manifestPath = join(OUTPUT_ROOT, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return { manifestPath, manifest };
}

function main() {
  let args;
  try {
    args = parseArgs();
  } catch (err) {
    console.error(err.message);
    console.error(usage());
    process.exit(1);
  }
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  const sourceRoot = resolve(process.cwd(), args.source);
  if (!existsSync(sourceRoot)) {
    console.error(`ERROR: source not found: ${sourceRoot}`);
    process.exit(1);
  }

  const preview = buildPreview(sourceRoot);
  if (args.dryRun) {
    console.log(JSON.stringify({ dryRun: true, ...preview }, null, 2));
    return;
  }

  const result = applyImport(preview);
  console.log(JSON.stringify({ dryRun: false, ...preview, importResult: result.manifest }, null, 2));

  if (!args.noMerge && result.manifest.trackerRowsQueued > 0) {
    execFileSync(process.execPath, ['merge-tracker.mjs'], { cwd: REPO_ROOT, stdio: 'inherit' });
  }
}

main();
