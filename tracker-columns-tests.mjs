#!/usr/bin/env node

/**
 * tracker-columns-tests.mjs — regression tests for header-name column mapping.
 *
 * merge-tracker.mjs and verify-pipeline.mjs used to parse applications.md by
 * fixed column position. Inserting a column (e.g. a Location column after Role)
 * shifted every later index by one — Location was read as Score, Score as
 * Status — so verify-pipeline flagged false errors and merge-tracker wrote
 * malformed rows. Both now map columns by header NAME (see #946).
 *
 * These tests provision a throwaway tracker + additions dir via the
 * CAREER_OPS_TRACKER / CAREER_OPS_ADDITIONS env overrides and assert:
 *   1. A 10-column tracker (with Location) merges a new row into the correct
 *      columns — Score/Status are NOT shifted, Location is populated.
 *   2. verify-pipeline reports a clean bill of health on that 10-column tracker.
 *   3. The original 9-column layout still works unchanged (back-compat).
 */

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;

let passed = 0;
let failed = 0;
function pass(m) { console.log(`PASS ${m}`); passed++; }
function fail(m) { console.error(`FAIL ${m}`); failed++; }

// Run a script with tracker/additions redirected to a sandbox. Returns
// { code, stdout } — code is 0 on success, the process exit code otherwise.
function runScript(script, args, sandbox) {
  const env = {
    ...process.env,
    CAREER_OPS_TRACKER: sandbox.tracker,
    CAREER_OPS_ADDITIONS: sandbox.additions,
    CAREER_OPS_TRACKER_LOCK: sandbox.lock,
  };
  try {
    const stdout = execFileSync(NODE, [join(ROOT, script), ...args], {
      cwd: ROOT, env, encoding: 'utf-8', timeout: 30000,
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status ?? 1, stdout: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

// Sync the sandbox tracker into the tracker.mjs index and return one parsed
// row by company name (row is null when sync/query fails or the row is absent).
function syncAndQueryRow(sb, company) {
  const sync = runScript('tracker.mjs', ['sync'], sb);
  const query = runScript('tracker.mjs', ['query', '--json'], sb);
  let row = null;
  try { row = JSON.parse(query.stdout).find(r => r.company === company) ?? null; } catch { /* malformed output → null */ }
  return { sync, query, row };
}

// Create a sandbox dir holding a tracker file and an additions dir.
function makeSandbox(trackerContent, additions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'co-cols-'));
  const tracker = join(dir, 'applications.md');
  const additionsDir = join(dir, 'tracker-additions');
  const lock = join(dir, 'lock');
  mkdirSync(additionsDir, { recursive: true });
  writeFileSync(tracker, trackerContent);
  for (const [name, content] of Object.entries(additions)) {
    writeFileSync(join(additionsDir, name), content);
  }
  return { dir, tracker, additions: additionsDir, lock };
}

// Return the data rows of a tracker (pipe lines that aren't header/separator).
function dataRows(trackerPath) {
  return readFileSync(trackerPath, 'utf-8')
    .split('\n')
    .filter(l => l.startsWith('|') && !l.includes('---') && !/\bScore\b/.test(l));
}

const HEADER_10 = `# Applications Tracker

| # | Date | Company | Role | Location | Score | Status | PDF | Report | Notes |
|---|------|---------|------|----------|-------|--------|-----|--------|-------|
| 1 | 2026-01-01 | Acme | Engineer | Remote | 4.0/5 | Applied | ✅ | — | seed row |
`;

const HEADER_9 = `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-01-01 | Acme | Engineer | 4.0/5 | Applied | ✅ | — | seed row |
`;

// TSV column order (status BEFORE score): num,date,company,role,status,score,pdf,report,notes[,location]
const TSV_WITH_LOCATION = '2\t2026-02-02\tGlobex\tManager\tApplied\tN/A\t✅\t—\tnew row\tSingapore\n';
const TSV_NO_LOCATION = '2\t2026-02-02\tGlobex\tManager\tApplied\tN/A\t✅\t—\tnew row\n';

// ── Test 1: 10-column tracker merges into the correct columns ──────────────
{
  const sb = makeSandbox(HEADER_10, { '2-globex.tsv': TSV_WITH_LOCATION });
  const res = runScript('merge-tracker.mjs', [], sb);
  if (res.code !== 0) {
    fail(`merge into 10-col tracker exits 0 (got ${res.code})\n${res.stdout}`);
  } else {
    pass('merge into 10-col tracker exits 0');
    const row = dataRows(sb.tracker).find(l => l.includes('Globex'));
    const cells = row ? row.split('|').map(s => s.trim()) : [];
    // cells: ['', num, date, company, role, location, score, status, pdf, report, notes, '']
    if (cells[5] === 'Singapore') pass('Location column populated (not shifted into Score)');
    else fail(`Location column populated — got "${cells[5]}" in row: ${row}`);
    if (cells[6] === 'N/A') pass('Score sits in the Score column');
    else fail(`Score in Score column — got "${cells[6]}" in row: ${row}`);
    if (cells[7] === 'Applied') pass('Status sits in the Status column');
    else fail(`Status in Status column — got "${cells[7]}" in row: ${row}`);
  }
  rmSync(sb.dir, { recursive: true, force: true });
}

// ── Test 2: verify-pipeline is clean on a 10-column tracker ────────────────
{
  const sb = makeSandbox(HEADER_10);
  const res = runScript('verify-pipeline.mjs', [], sb);
  if (res.code === 0 && /0 errors/.test(res.stdout)) {
    pass('verify-pipeline clean on 10-col tracker (no false column errors)');
  } else {
    fail(`verify-pipeline clean on 10-col tracker (code ${res.code})\n${res.stdout}`);
  }
  rmSync(sb.dir, { recursive: true, force: true });
}

// ── Test 3: legacy 9-column layout still works (back-compat) ───────────────
{
  const sb = makeSandbox(HEADER_9, { '2-globex.tsv': TSV_NO_LOCATION });
  const merge = runScript('merge-tracker.mjs', [], sb);
  const verify = runScript('verify-pipeline.mjs', [], sb);
  const row = dataRows(sb.tracker).find(l => l.includes('Globex'));
  const cells = row ? row.split('|').map(s => s.trim()) : [];
  // cells: ['', num, date, company, role, score, status, pdf, report, notes, '']
  if (merge.code === 0 && cells[5] === 'N/A' && cells[6] === 'Applied') {
    pass('9-col tracker still merges into correct columns');
  } else {
    fail(`9-col tracker merge (code ${merge.code}) row: ${row}`);
  }
  if (verify.code === 0 && /0 errors/.test(verify.stdout)) {
    pass('verify-pipeline clean on legacy 9-col tracker');
  } else {
    fail(`verify-pipeline clean on 9-col tracker (code ${verify.code})\n${verify.stdout}`);
  }
  rmSync(sb.dir, { recursive: true, force: true });
}

// ── Test 4: tracker.mjs CLI maps a 10-column tracker by header (#1596) ──────
// tracker.mjs used a fixed 9-cell destructure, so a Location column shifted
// Score into Status and folded the real Notes cell away.
{
  const sb = makeSandbox(HEADER_10);
  const { sync, query, row } = syncAndQueryRow(sb, 'Acme');
  if (sync.code === 0 && query.code === 0 && row) {
    if (row.role === 'Engineer') pass('tracker.mjs: Role read from Role column on 10-col tracker');
    else fail(`tracker.mjs: Role on 10-col tracker — got "${row.role}"`);
    if (row.score === '4.0/5') pass('tracker.mjs: Score not shifted on 10-col tracker');
    else fail(`tracker.mjs: Score on 10-col tracker — got "${row.score}"`);
    if (row.status === 'Applied') pass('tracker.mjs: Status not shifted on 10-col tracker');
    else fail(`tracker.mjs: Status on 10-col tracker — got "${row.status}"`);
    if (row.notes === 'seed row') pass('tracker.mjs: Notes intact on 10-col tracker');
    else fail(`tracker.mjs: Notes on 10-col tracker — got "${row.notes}"`);
  } else {
    fail(`tracker.mjs sync/query on 10-col tracker (sync ${sync.code}, query ${query.code})\n${sync.stdout}${query.stdout}`);
  }
  rmSync(sb.dir, { recursive: true, force: true });
}

// ── Test 5: removeRowByNum resolves the Report column by header ─────────────
{
  const { removeRowByNum } = await import('./tracker.mjs');
  const tenCol = HEADER_10.replace('| — | seed row |', '| [1](reports/001-acme-2026-01-01.md) | seed row |');
  const res = removeRowByNum(tenCol, 1);
  if (res.removed && res.report === '[1](reports/001-acme-2026-01-01.md)') {
    pass('removeRowByNum: report column resolved by header on 10-col tracker');
  } else {
    fail(`removeRowByNum: report on 10-col tracker — got "${res.report}"`);
  }
}

// ── Test 6: scan.mjs seen-set maps company/role by header ───────────────────
// loadSeenCompanyRoles used a positional regex, so a 10-col tracker produced
// keys like "engineer::remote" and scan dedup missed real matches.
{
  const { loadSeenCompanyRoles } = await import('./scan.mjs');
  const sb = makeSandbox(HEADER_10);
  const seen = loadSeenCompanyRoles(sb.tracker);
  if (seen.has('acme::engineer')) pass('scan.mjs: seen-set keys company::role on 10-col tracker');
  else fail(`scan.mjs: seen-set on 10-col tracker — got [${[...seen].join(', ')}]`);
  if (![...seen].some(k => k.includes('remote') || k.includes('4.0/5'))) {
    pass('scan.mjs: seen-set has no shifted-column garbage keys');
  } else {
    fail(`scan.mjs: shifted keys present — [${[...seen].join(', ')}]`);
  }
  rmSync(sb.dir, { recursive: true, force: true });
}

// ── Test 7: schema contract — every consumer maps an UNKNOWN extra column ───
// The header-name contract (#1596): a column no consumer recognizes must be
// skipped by ALL of them, never silently shifted into a known field. This is
// the guard that makes the next column insertion a one-place change instead of
// a repo-wide incident. normalize-statuses.mjs is excluded until PR #1114
// (which retrofits it) lands — add it here when that merges.
{
  const HEADER_UNKNOWN = `# Applications Tracker

| # | Date | Company | Priority | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|----------|------|-------|--------|-----|--------|-------|
| 1 | 2026-01-01 | Acme | high | Engineer | 4.0/5 | Applied | ✅ | — | seed row |
`;
  const sb = makeSandbox(HEADER_UNKNOWN);

  const verify = runScript('verify-pipeline.mjs', [], sb);
  if (verify.code === 0 && /0 errors/.test(verify.stdout)) {
    pass('contract: verify-pipeline skips an unknown extra column');
  } else {
    fail(`contract: verify-pipeline on unknown-column tracker (code ${verify.code})\n${verify.stdout}`);
  }

  const { sync, row } = syncAndQueryRow(sb, 'Acme');
  if (sync.code === 0 && row && row.role === 'Engineer' && row.score === '4.0/5' && row.status === 'Applied') {
    pass('contract: tracker.mjs skips an unknown extra column');
  } else {
    fail(`contract: tracker.mjs on unknown-column tracker — got ${JSON.stringify(row)}`);
  }

  const { loadSeenCompanyRoles } = await import('./scan.mjs');
  const seen = loadSeenCompanyRoles(sb.tracker);
  if (seen.has('acme::engineer') && seen.size === 1) {
    pass('contract: scan.mjs seen-set skips an unknown extra column');
  } else {
    fail(`contract: scan.mjs seen-set on unknown-column tracker — [${[...seen].join(', ')}]`);
  }

  rmSync(sb.dir, { recursive: true, force: true });
}

// ═══ Stage 2 (#1596): Via column ════════════════════════════════════════════

const HEADER_VIA = `# Applications Tracker

| # | Date | Company | Via | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|-----|------|-------|--------|-----|--------|-------|
| 1 | 2026-01-01 | Acme | — | Engineer | 4.0/5 | Applied | ✅ | — | direct seed row |
| 2 | 2026-01-05 | ? | Hays | Data Engineer | 4.2/5 | Applied | ✅ | — | fintech, Leeds |
`;

// ── Test 8: parseTrackerRow surfaces the Via column ─────────────────────────
{
  const { resolveColumns, parseTrackerRow } = await import('./tracker-parse.mjs');
  const lines = HEADER_VIA.split('\n');
  const colmap = resolveColumns(lines);
  const rows = lines.map(l => parseTrackerRow(l, colmap)).filter(Boolean);
  const direct = rows.find(r => r.num === 1);
  const blind = rows.find(r => r.num === 2);
  if (direct && direct.via === '—' && direct.role === 'Engineer' && direct.score === '4.0/5') {
    pass('parseTrackerRow: Via column mapped, later columns not shifted');
  } else {
    fail(`parseTrackerRow: Via layout — got ${JSON.stringify(direct)}`);
  }
  if (blind && blind.company === '?' && blind.via === 'Hays' && blind.status === 'Applied') {
    pass('parseTrackerRow: unknown-employer (?) row carries via');
  } else {
    fail(`parseTrackerRow: ? row — got ${JSON.stringify(blind)}`);
  }
}

// ── Test 9: TSV `via=` tagged field merges into the Via column ──────────────
// The batch TSV is header-less and positional; Via travels as a tagged extra
// field (`via=Hays`) instead of another positional slot, so a stale writer
// omitting the empty-location pad can't silently shift columns.
{
  const TSV_VIA = '3\t2026-02-02\t?\tPlatform Engineer\tApplied\t4.1/5\t✅\t—\tblind agency listing\tvia=Hays\n';
  const sb = makeSandbox(HEADER_VIA, { '3-blind.tsv': TSV_VIA });
  const res = runScript('merge-tracker.mjs', [], sb);
  const row = dataRows(sb.tracker).find(l => l.includes('Platform Engineer'));
  const cells = row ? row.split('|').map(s => s.trim()) : [];
  // cells: ['', num, date, company, via, role, score, status, pdf, report, notes, '']
  if (res.code === 0 && cells[3] === '?' && cells[4] === 'Hays' && cells[6] === '4.1/5' && cells[7] === 'Applied') {
    pass('merge: via= tag lands in the Via column, ? company preserved');
  } else {
    fail(`merge: via= tag (code ${res.code}) row: ${row}\n${res.stdout}`);
  }
  rmSync(sb.dir, { recursive: true, force: true });
}

// ── Test 10: ambiguous TSV extras are rejected loudly, never merged ─────────
{
  const TWO_UNTAGGED = '4\t2026-02-02\tGlobex\tManager\tApplied\tN/A\t✅\t—\tnote\tSingapore\tHays\n';
  const TWO_TAGS = '5\t2026-02-02\tGlobex\tManager\tApplied\tN/A\t✅\t—\tnote\tvia=Hays\tvia=Randstad\n';
  const sb = makeSandbox(HEADER_VIA, { '4-a.tsv': TWO_UNTAGGED, '5-b.tsv': TWO_TAGS });
  const res = runScript('merge-tracker.mjs', [], sb);
  const rows = dataRows(sb.tracker);
  // Rejection is loud on stderr; runScript only captures stdout on success, so
  // assert via the merge summary (2 skipped) plus the tracker staying clean.
  if (!rows.some(l => l.includes('Globex')) && /2 skipped/.test(res.stdout)) {
    pass('merge: ambiguous extras (two untagged / duplicate via=) rejected, not merged');
  } else {
    fail(`merge: ambiguous extras — rows: ${rows.length}\n${res.stdout}`);
  }
  rmSync(sb.dir, { recursive: true, force: true });
}

// ── Test 11: cross-channel guard — ? rows never fuzzy-merge across agencies ─
// Two blind listings for the same role via DIFFERENT agencies are distinct
// submissions (#1596): merging them silently is exactly the double-submission
// hazard the Via column exists to surface. Same agency + same role IS the
// re-blast duplicate and must still merge/update.
{
  const OTHER_AGENCY = '6\t2026-02-02\t?\tData Engineer\tApplied\t4.5/5\t✅\t—\tsame role, other agency\tvia=Randstad\n';
  const SAME_AGENCY = '7\t2026-02-03\t?\tData Engineer\tApplied\t4.6/5\t✅\t—\tre-blast, higher score\tvia=Hays\n';
  const sb = makeSandbox(HEADER_VIA, { '6-other.tsv': OTHER_AGENCY });
  const res1 = runScript('merge-tracker.mjs', [], sb);
  const rowsAfter1 = dataRows(sb.tracker).filter(l => l.includes('Data Engineer'));
  if (res1.code === 0 && rowsAfter1.length === 2 && rowsAfter1.some(l => l.includes('Randstad'))) {
    pass('merge: ? row via a different agency added as a NEW row (no cross-channel merge)');
  } else {
    fail(`merge: cross-channel guard — ${rowsAfter1.length} Data Engineer rows\n${res1.stdout}`);
  }
  writeFileSync(join(sb.additions, '7-same.tsv'), SAME_AGENCY);
  const res2 = runScript('merge-tracker.mjs', [], sb);
  const hays = dataRows(sb.tracker).filter(l => l.includes('Hays') && l.includes('Data Engineer'));
  if (res2.code === 0 && hays.length === 1 && hays[0].includes('4.6/5')) {
    pass('merge: same-agency re-blast updates the existing ? row (Via preserved)');
  } else {
    fail(`merge: same-agency update — ${hays.length} Hays rows: ${hays.join(' / ')}\n${res2.stdout}`);
  }
  rmSync(sb.dir, { recursive: true, force: true });
}

// ── Test 11b: legacy 9-col tracker — via= tag dropped WITHOUT breaking dedup ─
// The tracker has no Via column, so existing rows parse with via=''. The
// addition's via must be cleared before duplicate matching, or the
// cross-channel guard would see 'Hays' ≠ '' and add a second ? row instead of
// updating the same-agency re-blast.
{
  const FIRST = '2\t2026-02-02\t?\tData Engineer\tApplied\t4.1/5\t✅\t—\tblind listing\tvia=Hays\n';
  const REBLAST = '3\t2026-02-10\t?\tData Engineer\tApplied\t4.3/5\t✅\t—\tre-blast, higher score\tvia=Hays\n';
  const sb = makeSandbox(HEADER_9, { '2-first.tsv': FIRST });
  const res1 = runScript('merge-tracker.mjs', [], sb);
  writeFileSync(join(sb.additions, '3-reblast.tsv'), REBLAST);
  const res2 = runScript('merge-tracker.mjs', [], sb);
  const blind = dataRows(sb.tracker).filter(l => l.includes('Data Engineer'));
  if (res1.code === 0 && res2.code === 0 && blind.length === 1 && blind[0].includes('4.3/5') && /1 updated/.test(res2.stdout)) {
    pass('merge: legacy 9-col tracker — via= re-blast UPDATES the ? row (no duplicate)');
  } else {
    fail(`merge: legacy via= dedup — ${blind.length} rows: ${blind.join(' / ')}\n${res2.stdout}`);
  }
  rmSync(sb.dir, { recursive: true, force: true });
}

// ── Test 12: --migrate-via inserts the column, idempotently ─────────────────
{
  const sb = makeSandbox(HEADER_9);
  const first = runScript('merge-tracker.mjs', ['--migrate-via'], sb);
  const content = readFileSync(sb.tracker, 'utf-8');
  const header = content.split('\n').find(l => l.includes('Company'));
  const seed = content.split('\n').find(l => l.includes('Acme'));
  const headCells = header ? header.split('|').map(s => s.trim()) : [];
  const seedCells = seed ? seed.split('|').map(s => s.trim()) : [];
  if (first.code === 0 && headCells[4] === 'Via' && headCells[3] === 'Company' && seedCells[4] === '—' && seedCells[6] === '4.0/5') {
    pass('--migrate-via: Via column inserted after Company, rows padded with —');
  } else {
    fail(`--migrate-via: header "${header}" seed "${seed}"\n${first.stdout}`);
  }
  const second = runScript('merge-tracker.mjs', ['--migrate-via'], sb);
  if (second.code === 0 && readFileSync(sb.tracker, 'utf-8') === content) {
    pass('--migrate-via: idempotent (second run changes nothing)');
  } else {
    fail(`--migrate-via: not idempotent\n${second.stdout}`);
  }
  rmSync(sb.dir, { recursive: true, force: true });
}

// ── Test 13: dedup — unknown-employer rows key on Via + role + 90-day window ─
{
  const BLIND_TRACKER = `# Applications Tracker

| # | Date | Company | Via | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|-----|------|-------|--------|-----|--------|-------|
| 1 | 2026-01-05 | ? | Hays | Data Engineer | 4.2/5 | Evaluated | ✅ | — | fintech, Leeds |
| 2 | 2026-01-20 | ? | Hays | Data Engineer | 4.3/5 | Evaluated | ✅ | — | re-blast of same listing |
| 3 | 2026-01-06 | ? | Randstad | Data Engineer | 4.0/5 | Evaluated | ✅ | — | different channel |
| 4 | 2026-01-10 | ? | Hays | Platform Engineer | 3.9/5 | Evaluated | ✅ | — | old listing |
| 5 | 2026-06-01 | ? | Hays | Platform Engineer | 4.4/5 | Evaluated | ✅ | — | far outside window |
`;
  const sb = makeSandbox(BLIND_TRACKER);
  const res = runScript('dedup-tracker.mjs', [], sb);
  const rows = dataRows(sb.tracker);
  const dataEng = rows.filter(l => l.includes('Data Engineer'));
  const platform = rows.filter(l => l.includes('Platform Engineer'));
  if (res.code === 0 && dataEng.length === 2 && dataEng.some(l => l.includes('Randstad')) && dataEng.some(l => l.includes('4.3/5'))) {
    pass('dedup: same-agency re-blast within 90d deduped; other agency kept');
  } else {
    fail(`dedup: blind keying — ${dataEng.length} Data Engineer rows:\n${dataEng.join('\n')}\n${res.stdout}`);
  }
  if (platform.length === 2) {
    pass('dedup: same agency+role >90 days apart NOT deduped');
  } else {
    fail(`dedup: window — ${platform.length} Platform Engineer rows\n${res.stdout}`);
  }
  rmSync(sb.dir, { recursive: true, force: true });
}

// ── Test 14: verify-pipeline Via checks ─────────────────────────────────────
{
  const VIA_ISSUES = `# Applications Tracker

| # | Date | Company | Via | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|-----|------|-------|--------|-----|--------|-------|
| 1 | 2026-01-05 | ? | — | Data Engineer | 4.2/5 | Evaluated | ✅ | — | blind row, no agency |
| 2 | 2026-01-06 | Confidential | Hays | ML Engineer | 4.0/5 | Evaluated | ✅ | — | word placeholder |
| 3 | 2026-01-07 | Acme | Hays | Backend Engineer | 4.1/5 | Applied | ✅ | — | via agency |
| 4 | 2026-01-08 | Acme | — | Backend Engineer | 4.1/5 | Applied | ✅ | — | direct too |
`;
  const sb = makeSandbox(VIA_ISSUES);
  const res = runScript('verify-pipeline.mjs', [], sb);
  if (/unknown employer \(\?\) with no Via/.test(res.stdout)) {
    pass('verify: ? row with no Via channel is an error');
  } else {
    fail(`verify: ?-without-via\n${res.stdout}`);
  }
  if (/looks like a confidentiality placeholder/.test(res.stdout)) {
    pass('verify: localized confidentiality word linted toward ?');
  } else {
    fail(`verify: confidentiality lint\n${res.stdout}`);
  }
  if (/Cross-channel duplicate/.test(res.stdout)) {
    pass('verify: same company+role via different channels warned');
  } else {
    fail(`verify: cross-channel warning\n${res.stdout}`);
  }
  rmSync(sb.dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
