#!/usr/bin/env node

/**
 * Simulate parallel agents reserving evaluation IDs and merging tracker TSVs.
 *
 * The test uses a temporary fixture directory and environment overrides, so it
 * does not read or write the user's real data/applications.md, reports/, or
 * batch/tracker-additions/ files.
 */

import { spawn } from 'child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { acquireFileLock } from './file-lock.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NODE = process.execPath;
const RESERVE_SCRIPT = join(ROOT, 'reserve-eval-id.mjs');
const MERGE_SCRIPT = join(ROOT, 'merge-tracker.mjs');
const WORKER_COUNT = Number(process.argv[2]) || 8;
const MERGE_PROCESS_COUNT = Number(process.argv[3]) || 3;

function runNode(script, args, env) {
  return new Promise(resolve => {
    const child = spawn(NODE, [script, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

function trackerRows(trackerPath) {
  return readFileSync(trackerPath, 'utf-8')
    .split('\n')
    .filter(line => line.startsWith('|') && !line.includes('---'))
    .map(line => line.split('|').map(part => part.trim()))
    .filter(parts => Number.isInteger(parseInt(parts[1], 10)))
    .map(parts => ({
      num: parseInt(parts[1], 10),
      score: parts[5],
      company: parts[3],
      role: parts[4],
      report: parts[8],
      notes: parts[9],
    }));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'career-ops-concurrency-'));
  const dataDir = join(root, 'data');
  const reportsDir = join(root, 'reports');
  const additionsDir = join(root, 'batch/tracker-additions');

  mkdirSync(dataDir, { recursive: true });
  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(additionsDir, { recursive: true });

  const trackerPath = join(dataDir, 'applications.md');
  writeFileSync(trackerPath, [
    '# Applications Tracker',
    '',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '| 228 | 2026-06-03 | ExistingCo | Existing Engineer | 4.0/5 | Evaluated | no | [228](../reports/228-existingco-2026-06-03.md) | Existing fixture row |',
    '',
  ].join('\n'));
  writeFileSync(join(reportsDir, '228-existingco-2026-06-03.md'), '# Existing fixture report\n');

  return { root, dataDir, reportsDir, additionsDir, trackerPath };
}

function envFor(fixture) {
  return {
    CAREER_OPS_ROOT: fixture.root,
    CAREER_OPS_TRACKER: fixture.trackerPath,
    CAREER_OPS_REPORTS_DIR: fixture.reportsDir,
    CAREER_OPS_ADDITIONS_DIR: fixture.additionsDir,
    CAREER_OPS_SEQUENCE_FILE: join(fixture.dataDir, 'eval-sequence.json'),
    CAREER_OPS_LOCK_DIR: join(fixture.dataDir, '.locks'),
    CAREER_OPS_LOCK_RETRY_MS: '20',
    CAREER_OPS_RESERVE_HOLD_MS: '80',
  };
}

function writeFakeArtifacts(fixture, reservations) {
  for (const reservation of reservations) {
    const num = reservation.num;
    const reportName = `${reservation.report_num}-simulated-company-${num}-2026-06-03.md`;
    writeFileSync(join(fixture.reportsDir, reportName), `# Simulated report ${num}\n`);
    writeFileSync(join(fixture.additionsDir, `${reservation.report_num}-simulated-${num}.tsv`), [
      num,
      '2026-06-03',
      `Company ${num}`,
      `Software Engineer ${num}`,
      'Evaluated',
      '4.0/5',
      'no',
      `[${num}](reports/${reportName})`,
      `Simulated tracker addition ${num}`,
    ].join('\t'));
  }
}

function writeDuplicateReevaluationArtifacts(fixture) {
  const updates = [
    { suffix: '1', score: '4.2/5', note: 'First duplicate update should raise the score' },
    { suffix: '2', score: '4.4/5', note: 'Second duplicate update should win after in-memory refresh' },
  ];

  for (const update of updates) {
    const reportName = `228-existingco-reeval-${update.suffix}-2026-06-03.md`;
    writeFileSync(join(fixture.reportsDir, reportName), `# ExistingCo re-evaluation ${update.suffix}\n`);
    writeFileSync(join(fixture.additionsDir, `228-existingco-reeval-${update.suffix}.tsv`), [
      228,
      '2026-06-03',
      'ExistingCo',
      'Existing Engineer',
      'Evaluated',
      update.score,
      'no',
      `[228](reports/${reportName})`,
      update.note,
    ].join('\t'));
  }
}

function expectedRange(start, count) {
  return Array.from({ length: count }, (_, idx) => start + idx);
}

async function verifyLiveOwnerLockIsNotReaped() {
  const root = mkdtempSync(join(tmpdir(), 'career-ops-live-lock-'));
  const lockDir = join(root, 'live-owner.lock');
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(join(lockDir, 'owner.json'), JSON.stringify({
    owner: 'live-owner-test',
    pid: process.pid,
    hostname: 'test-host',
    created_at: new Date(Date.now() - 60_000).toISOString(),
  }, null, 2));

  try {
    let timedOut = false;
    try {
      const lock = await acquireFileLock(lockDir, {
        owner: 'live-owner-contender',
        timeoutMs: 120,
        retryDelayMs: 20,
        staleMs: 1,
      });
      lock.release();
    } catch (err) {
      timedOut = err.message.includes('Timed out waiting for lock');
    }

    assert(timedOut, 'expected an old lock with a live owner pid to block until timeout');
    assert(existsSync(lockDir), 'old lock with a live owner pid should not be deleted');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function verifyDeadOwnerLockIsReaped() {
  const root = mkdtempSync(join(tmpdir(), 'career-ops-dead-lock-'));
  const lockDir = join(root, 'dead-owner.lock');
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(join(lockDir, 'owner.json'), JSON.stringify({
    owner: 'dead-owner-test',
    pid: Number.MAX_SAFE_INTEGER,
    hostname: 'test-host',
    created_at: new Date(Date.now() - 60_000).toISOString(),
  }, null, 2));

  try {
    const lock = await acquireFileLock(lockDir, {
      owner: 'dead-owner-contender',
      timeoutMs: 500,
      retryDelayMs: 20,
      staleMs: 1,
    });
    assert(lock.staleRecovered, 'expected a stale lock with a dead owner pid to be recovered');
    lock.release();
    assert(!existsSync(lockDir), 'recovered lock should be released by the new owner');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  const fixture = createFixture();
  const env = envFor(fixture);

  console.log('');
  console.log('career-ops concurrency simulation');
  console.log(`temp_fixture=${fixture.root}`);
  console.log(`reservation_processes=${WORKER_COUNT}`);
  console.log(`merge_processes=${MERGE_PROCESS_COUNT}`);
  console.log('');

  try {
    console.log('0) Checking stale-lock safety...');
    await verifyLiveOwnerLockIsNotReaped();
    await verifyDeadOwnerLockIsReaped();
    console.log('  result=PASS live owner locks are preserved and dead owner locks recover');
    console.log('');

    console.log('1) Reserving IDs in parallel...');
    const reservationResults = await Promise.all(
      Array.from({ length: WORKER_COUNT }, (_, idx) => runNode(
        RESERVE_SCRIPT,
        ['--owner', `simulation-${idx + 1}`],
        env
      ))
    );

    const reservations = reservationResults.map((result, idx) => {
      if (result.code !== 0) {
        throw new Error(`reservation ${idx + 1} failed: ${result.stderr || result.stdout}`);
      }
      return JSON.parse(result.stdout);
    }).sort((a, b) => a.num - b.num);

    for (const reservation of reservations) {
      console.log(`  reserved report_num=${reservation.report_num} wait_ms=${reservation.lock_wait_ms} attempts=${reservation.lock_attempts}`);
    }

    const reservedNums = reservations.map(item => item.num);
    const expectedNums = expectedRange(229, WORKER_COUNT);
    assert(JSON.stringify(reservedNums) === JSON.stringify(expectedNums),
      `expected reservations ${expectedNums.join(', ')}, got ${reservedNums.join(', ')}`);

    console.log('  result=PASS unique sequential reservations');
    console.log('');

    console.log('2) Writing fake reports and tracker TSVs...');
    writeFakeArtifacts(fixture, reservations);
    writeDuplicateReevaluationArtifacts(fixture);
    console.log(`  pending_tsv_count=${readdirSync(fixture.additionsDir).filter(file => file.endsWith('.tsv')).length}`);
    console.log('');

    console.log('3) Running merge-tracker concurrently...');
    const mergeEnv = { ...env, CAREER_OPS_MERGE_HOLD_MS: '120' };
    const mergeResults = await Promise.all(
      Array.from({ length: MERGE_PROCESS_COUNT }, (_, idx) => runNode(
        MERGE_SCRIPT,
        [],
        { ...mergeEnv, CAREER_OPS_MERGE_OWNER: `simulation-merge-${idx + 1}` }
      ))
    );

    mergeResults.forEach((result, idx) => {
      console.log(`  merge_process=${idx + 1} exit_code=${result.code}`);
      const importantLines = result.stdout
        .split('\n')
        .filter(line => line.includes('Existing:') || line.includes('Found') || line.includes('Add #') || line.includes('Update:') || line.includes('No pending') || line.includes('Summary') || line.includes('lock acquired'));
      for (const line of importantLines) console.log(`    ${line}`);
      if (result.stderr.trim()) console.log(`    stderr=${result.stderr.trim()}`);
      assert(result.code === 0, `merge process ${idx + 1} failed`);
    });
    console.log('');

    console.log('4) Verifying final tracker...');
    const rows = trackerRows(fixture.trackerPath);
    const finalNums = rows.map(row => row.num).sort((a, b) => a - b);
    const expectedFinal = [228, ...expectedNums];
    assert(JSON.stringify(finalNums) === JSON.stringify(expectedFinal),
      `expected final tracker numbers ${expectedFinal.join(', ')}, got ${finalNums.join(', ')}`);

    const existingRow = rows.find(row => row.num === 228);
    assert(existingRow?.score === '4.4/5', `expected duplicate re-evaluation to keep score 4.4/5, got ${existingRow?.score ?? 'missing'}`);
    assert(existingRow?.notes.includes('Second duplicate update'),
      `expected duplicate re-evaluation notes to reflect the second update, got ${existingRow?.notes ?? 'missing'}`);

    const mergedFiles = readdirSync(join(fixture.additionsDir, 'merged')).filter(file => file.endsWith('.tsv')).length;
    assert(mergedFiles === WORKER_COUNT + 2, `expected ${WORKER_COUNT + 2} merged TSVs, got ${mergedFiles}`);

    console.log(`  final_tracker_numbers=${finalNums.join(', ')}`);
    console.log(`  merged_tsv_count=${mergedFiles}`);
    console.log('  result=PASS no duplicate IDs and no lost tracker rows');
    console.log('');
    console.log('simulation_result=PASS');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error('');
  console.error(`simulation_result=FAIL error_message="${err.message}"`);
  process.exit(1);
});
