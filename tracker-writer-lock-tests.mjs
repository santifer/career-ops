#!/usr/bin/env node

/** Regression tests for the shared applications.md writer lock. */

import { spawn } from 'child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { acquireTrackerLock } from './tracker-utils.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
const CONCURRENT_ROW = '| 99 | 2026-01-03 | ConcurrentCo | Keeper | 4.3/5 | Applied | ❌ | [99](reports/099-concurrent.md) | preserve me |';
let passed = 0;
let failed = 0;

function pass(message) { console.log(`PASS ${message}`); passed++; }
function fail(message) { console.error(`FAIL ${message}`); failed++; }
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function trackerTable(rows) {
  return `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
${rows.join('\n')}
`;
}

async function runWhileLocked({
  name,
  script,
  args = [],
  content,
  stdin = '',
  verify,
  mutateWhileLocked,
  verifyConcurrent = after => after.includes(CONCURRENT_ROW),
  verifyOutput = () => true,
  completion = 'completes the intended update after lock release',
}) {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-writer-lock-'));
  const tracker = join(dir, 'applications.md');
  const lockDir = join(dir, `career-ops-merge-tracker-${name}.lock`);
  const db = join(dir, 'applications.db');
  writeFileSync(tracker, content);

  const extra = {};
  if (name.startsWith('reply-watch')) {
    const candidates = join(dir, 'candidates.json');
    writeFileSync(candidates, JSON.stringify([{
      message_id: 'reply-1',
      from: 'hr@acme.com',
      subject: 'Unfortunately, an update on your Acme Engineer application',
      body_snippet: 'We decided not to proceed with your application.',
      signal: 'rejection',
    }]));
    args = [candidates];
  }

  const lock = await acquireTrackerLock(lockDir, {
    timeoutMs: 2_000,
    retryMs: 20,
    staleMs: 5_000,
    tracker,
  });

  let stdout = '';
  let stderr = '';
  const child = spawn(NODE, [join(ROOT, script), ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      CAREER_OPS_TRACKER: tracker,
      CAREER_OPS_TRACKER_DB: db,
      CAREER_OPS_TRACKER_LOCK: lockDir,
      CAREER_OPS_TRACKER_LOCK_TIMEOUT_MS: '3000',
      CAREER_OPS_TRACKER_LOCK_RETRY_MS: '20',
      ...extra,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const closePromise = new Promise(resolve => child.once('close', code => resolve({ code })));
  child.stdin.end(stdin);

  try {
    await sleep(250);
    if (child.exitCode === null && readFileSync(tracker, 'utf-8') === content) {
      pass(`${name}: waits for the shared lock before reading or writing`);
    } else {
      fail(`${name}: bypassed the shared lock (exit=${child.exitCode})\n${stdout}${stderr}`);
    }

    // Simulate the current lock owner committing another row. The waiting
    // writer must read this fresh version after acquiring the lock; a writer
    // that reads before locking will erase row #99 with its stale snapshot.
    const nextContent = mutateWhileLocked
      ? mutateWhileLocked(content, CONCURRENT_ROW)
      : `${content.trimEnd()}\n${CONCURRENT_ROW}\n`;
    writeFileSync(tracker, nextContent);
  } finally {
    lock.release();
  }

  const result = await Promise.race([
    closePromise,
    sleep(5_000).then(() => ({ code: null })),
  ]);
  if (result.code === null) child.kill('SIGKILL');

  const after = existsSync(tracker) ? readFileSync(tracker, 'utf-8') : '';
  if (result.code === 0 && verify(after) && verifyConcurrent(after) && verifyOutput(stdout, stderr)) {
    pass(`${name}: ${completion}`);
  } else {
    fail(`${name}: update failed after lock release (exit=${result.code})\n${stdout}${stderr}\n${after}`);
  }
  rmSync(dir, { recursive: true, force: true });
}

await runWhileLocked({
  name: 'normalize-statuses',
  script: 'normalize-statuses.mjs',
  content: trackerTable([
    '| 1 | 2026-01-01 | Acme | Engineer | 4.0/5 | Aplicado | ❌ | [1](reports/001-acme.md) | seed |',
  ]),
  verify: content => content.includes('| Applied |'),
});

await runWhileLocked({
  name: 'dedup-tracker',
  script: 'dedup-tracker.mjs',
  content: trackerTable([
    '| 1 | 2026-01-01 | Acme | Engineer | 4.0/5 | Evaluated | ❌ | [1](reports/001-acme.md) | first |',
    '| 2 | 2026-01-02 | Acme | Engineer | 3.0/5 | Evaluated | ❌ | [2](reports/002-acme.md) | duplicate |',
  ]),
  verify: content => (content.match(/\| Acme \| Engineer \|/g) || []).length === 1,
});

await runWhileLocked({
  name: 'tracker-delete',
  script: 'tracker.mjs',
  args: ['delete', '--num', '1'],
  content: trackerTable([
    '| 1 | 2026-01-01 | Acme | Engineer | 4.0/5 | Evaluated | ❌ | [1](reports/001-acme.md) | seed |',
    '| 2 | 2026-01-02 | Beta | Analyst | 3.5/5 | Evaluated | ❌ | [2](reports/002-beta.md) | keep |',
  ]),
  verify: content => !content.includes('| 1 | 2026-01-01 | Acme |') && content.includes('| 2 | 2026-01-02 | Beta |'),
});

await runWhileLocked({
  name: 'reply-watch',
  script: 'reply-watch.mjs',
  stdin: 'y\n',
  content: trackerTable([
    '| 1 | 2026-01-01 | Acme | Engineer | 4.0/5 | Applied | ❌ | [1](reports/001-acme.md) | contact hr@acme.com |',
  ]),
  verify: content => content.includes('| Rejected |'),
});

await runWhileLocked({
  name: 'reply-watch-stale-status',
  script: 'reply-watch.mjs',
  stdin: 'y\n',
  content: trackerTable([
    '| 1 | 2026-01-01 | Acme | Engineer | 4.0/5 | Applied | ❌ | [1](reports/001-acme.md) | contact hr@acme.com |',
  ]),
  mutateWhileLocked: (content, concurrentRow) => `${content.replace('| Applied |', '| Interview |').trimEnd()}\n${concurrentRow}\n`,
  verify: content => content.includes('| 1 | 2026-01-01 | Acme | Engineer | 4.0/5 | Interview |')
    && content.includes('| 99 | 2026-01-03 | ConcurrentCo |')
    && !content.includes('| Rejected |'),
  verifyOutput: (stdout, stderr) => `${stdout}${stderr}`.includes('status changed from Applied to Interview during review'),
  completion: 'preserves a status changed while the recommendation was under review',
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
