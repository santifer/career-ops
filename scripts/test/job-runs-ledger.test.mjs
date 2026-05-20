/**
 * scripts/test/job-runs-ledger.test.mjs
 *
 * Unit tests for lib/job-runs-ledger.mjs.
 * Uses a tmp DB path on each test so there is no cross-test state.
 * Run with: node --test scripts/test/job-runs-ledger.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  initSchema,
  startRun,
  finishRun,
  recentRuns,
  lastFinishedRun,
  _closeDb,
} from '../../lib/job-runs-ledger.mjs';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'job-runs-test-'));
  return join(dir, 'test.sqlite');
}

test('start → ok: row is inserted and finished with ok status', () => {
  const db = tmpDb();
  const runId = startRun('portal-scan', db);
  assert.ok(typeof runId === 'number', 'startRun returns a numeric id');

  finishRun(runId, { status: 'ok', urls_found: 42 }, db);

  const row = lastFinishedRun('portal-scan', db);
  assert.ok(row !== null, 'lastFinishedRun returns a row');
  assert.equal(row.status, 'ok');
  assert.equal(row.urls_found, 42);
  assert.ok(row.finished_at, 'finished_at is populated');
  assert.ok(row.started_at, 'started_at is populated');
  assert.ok(row.host, 'host is populated');

  _closeDb();
});

test('start → fail with error: error string is persisted', () => {
  const db = tmpDb();
  const runId = startRun('liveness-sweep', db);
  assert.ok(runId != null, 'got a run id');

  finishRun(runId, { status: 'fail', error: 'ECONNREFUSED connection refused' }, db);

  const row = lastFinishedRun('liveness-sweep', db);
  assert.equal(row.status, 'fail');
  assert.ok(row.error.includes('ECONNREFUSED'), 'error text is stored');
  assert.equal(row.urls_found, null, 'urls_found is null when not supplied');

  _closeDb();
});

test('start → skipped: status reflects skipped', () => {
  const db = tmpDb();
  const runId = startRun('heartbeat', db);
  finishRun(runId, { status: 'skipped' }, db);

  const row = lastFinishedRun('heartbeat', db);
  assert.equal(row.status, 'skipped');

  _closeDb();
});

test('recentRuns ordering: newest run comes first', () => {
  const db = tmpDb();
  for (let i = 0; i < 5; i++) {
    const id = startRun('portal-scan', db);
    finishRun(id, { status: 'ok', urls_found: i * 10 }, db);
  }

  const rows = recentRuns('portal-scan', 5, db);
  assert.equal(rows.length, 5, 'all 5 rows returned');

  for (let i = 0; i < rows.length - 1; i++) {
    assert.ok(
      rows[i].started_at >= rows[i + 1].started_at,
      `row ${i} is not newer than row ${i + 1}`
    );
  }

  _closeDb();
});

test('lastFinishedRun returns null for a job with no ledger entries', () => {
  const db = tmpDb();
  initSchema(db);

  const row = lastFinishedRun('nonexistent-job', db);
  assert.equal(row, null, 'returns null when no entries exist');

  _closeDb();
});

test('startRun with null runId in finishRun is a silent no-op', () => {
  const db = tmpDb();
  assert.doesNotThrow(() => finishRun(null, { status: 'ok' }, db));

  _closeDb();
});

test('recentRuns returns empty array for a job with no entries', () => {
  const db = tmpDb();
  initSchema(db);

  const rows = recentRuns('never-ran', 10, db);
  assert.ok(Array.isArray(rows), 'returns an array');
  assert.equal(rows.length, 0, 'empty for unknown job');

  _closeDb();
});
