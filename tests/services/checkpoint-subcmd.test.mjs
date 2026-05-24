/**
 * tests/services/checkpoint-subcmd.test.mjs
 *
 * CLI-level tests for the `checkpoint` subcommand in yash-resume-pipeline.mjs.
 * Spawns the script as a child process so the test stays isolated from module
 * state; env vars WORK_QUEUE_DB and CHECKPOINT_DIR are injected per-test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, closeDb } from '../../services/db.mjs';

const execFileP = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = resolve(ROOT, 'yash-resume-pipeline.mjs');

function freshEnv() {
  const dir = mkdtempSync(join(tmpdir(), 'yrp-chk-'));
  const dbPath = join(dir, 'work-queue.db');
  const checkpointDir = join(dir, 'checkpoints');
  mkdirSync(checkpointDir, { recursive: true });
  // Initialise the DB schema so upsertCheckpoint has a valid table.
  // We also need a runs row so the foreign key on checkpoints(run_id) is satisfied.
  const db = initDb(dbPath);
  // Insert a synthetic queue row and run row for run_id=1
  db.prepare(`INSERT INTO queue(url, url_hash, added_at, added_by, status) VALUES(?,?,?,?,?)`)
    .run('https://example.com/job/1', 'abcdef1234567890', new Date().toISOString(), 0, 'running');
  db.prepare(`INSERT INTO runs(id, queue_id, url, started_at, status) VALUES(?,?,?,?,?)`)
    .run(1, 1, 'https://example.com/job/1', new Date().toISOString(), 'running');
  closeDb(db);
  return {
    dir,
    dbPath,
    checkpointDir,
    env: {
      ...process.env,
      WORK_QUEUE_DB: dbPath,
      CHECKPOINT_DIR: checkpointDir,
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

async function runCheckpoint(args, env) {
  try {
    const { stdout, stderr } = await execFileP('node', [SCRIPT, 'checkpoint', ...args], {
      cwd: ROOT,
      env,
    });
    return { code: 0, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (e) {
    return { code: e.code ?? 1, stdout: (e.stdout ?? '').trim(), stderr: (e.stderr ?? '').trim() };
  }
}

// ── Test 1: invalid phase rejected ───────────────────────────────────────────

test('checkpoint: invalid phase returns fail JSON', async () => {
  const { env, cleanup } = freshEnv();
  try {
    const { code, stdout } = await runCheckpoint([
      '--run-id', '1',
      '--phase', 'not_a_real_phase',
      '--url-hash', 'abcdef1234567890',
      '--inputs', '{"foo":"bar"}',
    ], env);
    assert.equal(code, 1, 'should exit 1 for invalid phase');
    const obj = JSON.parse(stdout);
    assert.equal(obj.status, 'fail');
    assert.match(obj.error, /invalid phase/i);
  } finally { cleanup(); }
});

// ── Test 2: happy path writes .json file and DB row ──────────────────────────

test('checkpoint: valid call writes checkpoint file and returns ok', async () => {
  const { env, checkpointDir, dbPath, cleanup } = freshEnv();
  try {
    const urlHash = 'abcdef1234567890';
    const inputs = { jd_path: 'jds/JD_Foo_Bar_Yash_Anghan_2026-01-01.md' };
    const { code, stdout } = await runCheckpoint([
      '--run-id', '1',
      '--phase', 'jd_fetch_end',
      '--url-hash', urlHash,
      '--inputs', JSON.stringify(inputs),
    ], env);
    assert.equal(code, 0, `should exit 0; stdout: ${stdout}`);
    const obj = JSON.parse(stdout);
    assert.equal(obj.status, 'ok');
    assert.equal(obj.phase, 'jd_fetch_end');
    assert.ok(obj.inputs_path, 'inputs_path should be set');

    // Verify the .json file exists on disk
    const { existsSync } = await import('node:fs');
    assert.ok(existsSync(obj.inputs_path), `checkpoint file should exist at ${obj.inputs_path}`);

    // Verify DB row was written
    const db2 = initDb(dbPath);
    const row = db2.prepare(`SELECT * FROM checkpoints WHERE run_id=1`).get();
    closeDb(db2);
    assert.ok(row, 'checkpoint row should exist in DB');
    assert.equal(row.last_phase, 'jd_fetch_end');
  } finally { cleanup(); }
});

// ── Test 3: invalid JSON in --inputs rejected ─────────────────────────────────

test('checkpoint: malformed --inputs JSON returns fail JSON', async () => {
  const { env, cleanup } = freshEnv();
  try {
    const { code, stdout } = await runCheckpoint([
      '--run-id', '1',
      '--phase', 'resume_gen_end',
      '--url-hash', 'abcdef1234567890',
      '--inputs', '{not valid json',
    ], env);
    assert.equal(code, 1, 'should exit 1 for malformed JSON');
    const obj = JSON.parse(stdout);
    assert.equal(obj.status, 'fail');
    assert.match(obj.error, /invalid.*inputs|inputs.*json|JSON/i);
  } finally { cleanup(); }
});
