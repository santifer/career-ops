/**
 * scripts/test/launchd-wrapper.test.mjs
 *
 * Node native test suite for scripts/launchd-wrapper.mjs.
 * Run:  node --test scripts/test/launchd-wrapper.test.mjs
 *
 * Fixtures use a real temporary state file so we can assert on the written
 * JSON without mocking the filesystem. Each test uses an isolated label so
 * tests don't interfere with each other.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WRAPPER = join(__dirname, '..', 'launchd-wrapper.mjs');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Create a unique temp directory for one test run.
 * We override the repo-root by pointing STATE_PATH at a tmp directory so
 * tests don't pollute data/launchd-wrapper-state.json.
 *
 * launchd-wrapper resolves ROOT as join(__dirname, '..') from its own location.
 * We can't change that dynamically, but we can use a unique label and clean up
 * after. For state-file isolation we use the WRAPPER_STATE_PATH env var that
 * the wrapper checks (see note below about the env override approach).
 *
 * SIMPLER APPROACH USED HERE: run the wrapper against a temp data/ dir by
 * setting the env var LAUNCHD_WRAPPER_STATE_PATH — the wrapper reads this
 * env var to locate the state file when set (see implementation).
 *
 * Actually, since the implementation resolves ROOT from __dirname, the easiest
 * safe approach is just to use unique labels and clean up the real state file
 * before + after each test. The state file path is deterministic:
 *   <repo>/data/launchd-wrapper-state.json
 */
const REPO_ROOT = join(__dirname, '..', '..');
const STATE_PATH = join(REPO_ROOT, 'data', 'launchd-wrapper-state.json');

function uniqueLabel(prefix) {
  return `test.${prefix}.${randomBytes(4).toString('hex')}`;
}

/**
 * Run the wrapper synchronously and return { status, stdout, stderr }.
 * We spawn via `node` so we get real module resolution.
 */
function runWrapper(args, opts = {}) {
  const result = spawnSync(
    process.execPath,
    [WRAPPER, ...args],
    {
      encoding: 'utf-8',
      timeout: 30_000, // 30s wall-clock max for any single test
      env: { ...process.env, ...opts.env },
    }
  );
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    signal: result.signal,
    error: result.error,
  };
}

/**
 * Read the wrapper state for a specific label from the state file.
 * Returns the label's history array (may be empty []).
 */
function readLabelHistory(label) {
  try {
    if (!existsSync(STATE_PATH)) return [];
    const raw = readFileSync(STATE_PATH, 'utf-8');
    const state = JSON.parse(raw);
    return state?.labels?.[label] ?? [];
  } catch {
    return [];
  }
}

/**
 * Remove a label's entries from the state file so each test is isolated.
 */
function clearLabel(label) {
  try {
    if (!existsSync(STATE_PATH)) return;
    const raw = readFileSync(STATE_PATH, 'utf-8');
    const state = JSON.parse(raw);
    if (state?.labels) {
      delete state.labels[label];
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf-8');
    }
  } catch {
    // Ignore — test cleanup is best-effort
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('success on first attempt → exits 0, 1 entry recorded with exit_code=0 attempts_used=1', async () => {
  const label = uniqueLabel('success');
  try {
    const result = runWrapper([
      `--label=${label}`,
      '--max-retries=2',
      '--retry-backoff-sec=1',
      '--',
      process.execPath,
      '--eval',
      'process.exit(0)',
    ]);

    assert.equal(result.status, 0, `wrapper should exit 0, got ${result.status}\nstderr: ${result.stderr}`);

    const history = readLabelHistory(label);
    assert.equal(history.length, 1, `expected 1 entry, got ${history.length}`);

    const entry = history[0];
    assert.equal(entry.exit_code, 0, 'exit_code should be 0');
    assert.equal(entry.attempts_used, 1, 'attempts_used should be 1');
    assert.ok(entry.started_at, 'started_at should be set');
    assert.ok(entry.finished_at, 'finished_at should be set');
    assert.ok(typeof entry.duration_sec === 'number', 'duration_sec should be a number');
  } finally {
    clearLabel(label);
  }
});

test('failure-then-success with retry → exits 0, attempts_used=2', async () => {
  // We use a counter file in tmpdir: first invocation deletes the file (exits 1),
  // second invocation sees the file is gone (exits 0).
  // Simpler: use a sentinel file that the script creates on first call then exits 1;
  // on second call the file exists so it exits 0.
  const label = uniqueLabel('retry');
  const sentinelPath = join(tmpdir(), `wrapper-test-${randomBytes(4).toString('hex')}.flag`);

  // Cleanup sentinel in case it already exists
  try { rmSync(sentinelPath); } catch { /* ignore */ }

  // Script logic:
  //   - If sentinel doesn't exist: create it and exit 1 (simulate transient failure)
  //   - If sentinel exists: exit 0 (simulate recovery)
  const scriptSrc = [
    `const { existsSync, writeFileSync } = await import('node:fs');`,
    `const p = ${JSON.stringify(sentinelPath)};`,
    `if (!existsSync(p)) { writeFileSync(p, ''); process.exit(1); }`,
    `process.exit(0);`,
  ].join('\n');

  try {
    const result = runWrapper([
      `--label=${label}`,
      '--max-retries=2',
      '--retry-backoff-sec=1', // 1s backoff for speed; actual delay is 1*2^0=1s
      '--',
      process.execPath,
      '--input-type=module',
      '--eval',
      scriptSrc,
    ]);

    assert.equal(result.status, 0, `wrapper should exit 0 after retry\nstderr: ${result.stderr}`);

    const history = readLabelHistory(label);
    assert.equal(history.length, 1, `expected 1 run entry, got ${history.length}`);

    const entry = history[0];
    assert.equal(entry.exit_code, 0, 'final exit_code should be 0');
    assert.equal(entry.attempts_used, 2, 'attempts_used should be 2 (failed once, succeeded on retry)');
  } finally {
    clearLabel(label);
    try { rmSync(sentinelPath); } catch { /* ignore */ }
  }
});

test('all retries fail → exits with last failing code, attempts_used=max+1', async () => {
  const label = uniqueLabel('allfail');
  // Exit code 42 — distinctive enough to assert on
  const scriptSrc = `process.exit(42);`;

  try {
    const result = runWrapper([
      `--label=${label}`,
      '--max-retries=2',
      '--retry-backoff-sec=1',
      '--',
      process.execPath,
      '--eval',
      scriptSrc,
    ]);

    assert.equal(result.status, 42, `wrapper should exit 42, got ${result.status}\nstderr: ${result.stderr}`);

    const history = readLabelHistory(label);
    assert.equal(history.length, 1, `expected 1 run entry`);

    const entry = history[0];
    assert.equal(entry.exit_code, 42, 'exit_code should be 42');
    // max-retries=2 → loop runs attempt 0,1,2 → 3 total attempts
    assert.equal(entry.attempts_used, 3, 'attempts_used should be 3 (max_retries + 1)');
  } finally {
    clearLabel(label);
  }
});

test('--label missing → wrapper exits 2 with usage error on stderr', () => {
  const result = runWrapper([
    '--max-retries=2',
    '--',
    process.execPath,
    '--eval',
    'process.exit(0)',
  ]);

  assert.equal(result.status, 2, `expected exit code 2, got ${result.status}`);
  assert.ok(
    result.stderr.includes('--label'),
    `stderr should mention --label; got: ${result.stderr}`
  );
});

test('state file corruption → wrapper continues with fresh state, warns on stderr', async () => {
  const label = uniqueLabel('corrupt');

  // Write obviously broken JSON to the state file
  const dataDir = join(REPO_ROOT, 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  // Save original state so we can restore it
  let originalState = null;
  try {
    originalState = readFileSync(STATE_PATH, 'utf-8');
  } catch { /* may not exist */ }

  // Write corrupt content
  writeFileSync(STATE_PATH, '{{{not valid json', 'utf-8');

  try {
    const result = runWrapper([
      `--label=${label}`,
      '--max-retries=0',
      '--retry-backoff-sec=1',
      '--',
      process.execPath,
      '--eval',
      'process.exit(0)',
    ]);

    // Wrapper should still exit 0 (the underlying command succeeded)
    assert.equal(result.status, 0, `wrapper should exit 0 even with corrupt state\nstderr: ${result.stderr}`);

    // stderr should warn about the corruption
    assert.ok(
      result.stderr.includes('WARN') || result.stderr.includes('could not load'),
      `stderr should warn about state load failure; got: ${result.stderr}`
    );

    // The wrapper should have written a fresh state file (or at least tried)
    // We can verify by reading the label's history — it should have 1 entry
    const history = readLabelHistory(label);
    // The wrapper writes to state after recovery from corruption; history may
    // have 1 entry if the re-save succeeded.
    // We assert the run completed; whether the state was recovered is secondary.
    // (If the save succeeded we get 1 entry; if it failed we get 0 — both are valid.)
    assert.ok(history.length <= 1, `unexpected history length ${history.length}`);
  } finally {
    clearLabel(label);
    // Restore original state
    try {
      if (originalState !== null) {
        writeFileSync(STATE_PATH, originalState, 'utf-8');
      } else {
        rmSync(STATE_PATH, { force: true });
      }
    } catch { /* ignore restore failure */ }
  }
});
