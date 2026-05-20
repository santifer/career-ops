// lib/job-runs-ledger.mjs — SQLite ledger for scheduled-job execution history.
//
// Backs P1-5 (dashboard chip strip) + P1-6 (ledger itself) from
// data/input-quality-roadmap.md. Every scheduled job opens a row at
// startRun() and closes it at finishRun(). The dashboard reads recentRuns()
// to color-code chips and feed the click-through modal.
//
// Designed to NEVER break the underlying job: every public API is wrapped
// in try/catch and returns null/[] on failure. A missing data/ dir,
// concurrent writes from sibling processes, or a corrupt DB must not
// take down scan / batch / heartbeat / etc.

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const DEFAULT_DB_PATH = join(ROOT, 'data', 'job-runs.sqlite');

let _db = null;
let _dbPath = null;

function openDb(dbPath = DEFAULT_DB_PATH) {
  if (_db && _dbPath === dbPath) return _db;
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT    NOT NULL,
      started_at   TEXT    NOT NULL,
      finished_at  TEXT,
      status       TEXT    NOT NULL DEFAULT 'running',
      urls_found   INTEGER,
      error        TEXT,
      host         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_job_runs_name_started
      ON job_runs(job_name, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_job_runs_status
      ON job_runs(status);
  `);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  _db = db;
  _dbPath = dbPath;
  return db;
}

/**
 * Open a new run row. Returns the row id, or null on any failure.
 * Callers MUST tolerate null — a broken ledger never breaks the job.
 *
 * @param {string} jobName - canonical job name (e.g., 'scan', 'batch', 'heartbeat')
 * @returns {number|null}
 */
export function startRun(jobName) {
  try {
    if (!jobName || typeof jobName !== 'string') return null;
    const db = openDb();
    const stmt = db.prepare(`
      INSERT INTO job_runs (job_name, started_at, status, host)
      VALUES (?, ?, 'running', ?)
    `);
    const result = stmt.run(jobName, new Date().toISOString(), hostname());
    return Number(result.lastInsertRowid);
  } catch (_e) {
    return null;
  }
}

/**
 * Close a run row. Accepts null id (no-op) so callers can pipe through
 * startRun()'s null without branching.
 *
 * @param {number|null} id - row id from startRun()
 * @param {'ok'|'fail'|'skipped'} status
 * @param {number|null} urlsFound - opt-in, only set when the job's signal is URL discovery
 * @param {string|null} error - error message if status === 'fail'
 */
export function finishRun(id, status, urlsFound = null, error = null) {
  try {
    if (id == null) return;
    const db = openDb();
    const safeStatus = ['ok', 'fail', 'skipped'].includes(status) ? status : 'fail';
    const stmt = db.prepare(`
      UPDATE job_runs
      SET finished_at = ?, status = ?, urls_found = ?, error = ?
      WHERE id = ?
    `);
    stmt.run(
      new Date().toISOString(),
      safeStatus,
      urlsFound == null ? null : Number(urlsFound),
      error == null ? null : String(error).slice(0, 4000),
      id
    );
  } catch (_e) {
    // Swallow — never break the job.
  }
}

/**
 * @param {string} jobName
 * @param {number} limit
 * @returns {Array<{id:number, job_name:string, started_at:string, finished_at:string|null, status:string, urls_found:number|null, error:string|null, host:string|null}>}
 */
export function recentRuns(jobName, limit = 10) {
  try {
    const db = openDb();
    const stmt = db.prepare(`
      SELECT id, job_name, started_at, finished_at, status, urls_found, error, host
      FROM job_runs
      WHERE job_name = ?
      ORDER BY started_at DESC
      LIMIT ?
    `);
    return stmt.all(jobName, Math.max(1, Math.min(500, Number(limit) || 10)));
  } catch (_e) {
    return [];
  }
}

/**
 * Return distinct job names seen in the ledger, most-recent activity first.
 * Used by the dashboard endpoint to enumerate which chips to render when
 * no explicit allowlist is provided.
 *
 * @returns {string[]}
 */
export function listJobNames() {
  try {
    const db = openDb();
    const stmt = db.prepare(`
      SELECT job_name, MAX(started_at) AS latest
      FROM job_runs
      GROUP BY job_name
      ORDER BY latest DESC
    `);
    return stmt.all().map(r => r.job_name);
  } catch (_e) {
    return [];
  }
}

/**
 * Single most-recent run for a job (any status). Returns null if none.
 *
 * @param {string} jobName
 */
export function lastRun(jobName) {
  try {
    const rows = recentRuns(jobName, 1);
    return rows[0] || null;
  } catch (_e) {
    return null;
  }
}

/**
 * Convenience: wrap an async function with start/finish bookkeeping.
 * The wrapped function may return a number (treated as urls_found) or
 * an object with shape { urls_found?, status? }.
 *
 * Catches throws, records 'fail', and re-throws so the underlying job
 * still surfaces the error to launchd / the caller.
 *
 * @param {string} jobName
 * @param {() => Promise<number|{urls_found?:number, status?:string}|void>} fn
 */
export async function withRunRecord(jobName, fn) {
  const id = startRun(jobName);
  try {
    const result = await fn();
    let urls = null;
    let status = 'ok';
    if (typeof result === 'number') urls = result;
    else if (result && typeof result === 'object') {
      if (typeof result.urls_found === 'number') urls = result.urls_found;
      if (typeof result.status === 'string') status = result.status;
    }
    finishRun(id, status, urls, null);
    return result;
  } catch (e) {
    finishRun(id, 'fail', null, e?.message || String(e));
    throw e;
  }
}

/**
 * One-line wiring helper for scheduled scripts. Opens a run row, registers
 * exit handlers that close the row automatically, and returns a handle the
 * caller can use to record urls_found.
 *
 * Usage at the top of a scheduled script:
 *
 *   import { installRunRecord } from '../lib/job-runs-ledger.mjs';
 *   const __job = installRunRecord('scan');
 *   // ...later when results are known:
 *   __job.setUrlsFound(found.length);
 *
 * Returns { id, setUrlsFound(n), setError(e), finish(status?) } even when
 * the ledger fails to open — every method becomes a safe no-op.
 *
 * @param {string} jobName
 */
export function installRunRecord(jobName) {
  const id = startRun(jobName);
  let finished = false;
  let urlsFound = null;
  let recordedError = null;

  const doFinish = (status, err) => {
    if (finished) return;
    finished = true;
    finishRun(id, status, urlsFound, err || recordedError);
  };

  // Natural exit (no pending tasks). Most jobs land here.
  process.on('beforeExit', () => doFinish('ok', null));

  // Hard exit. Sync only — but finishRun's sqlite write is sync.
  process.on('exit', (code) => {
    if (!finished) doFinish(code === 0 ? 'ok' : 'fail', code === 0 ? null : `exit code ${code}`);
  });

  process.on('uncaughtException', (e) => {
    doFinish('fail', e?.message || String(e));
    // Preserve default crash behavior.
    if (!process.listenerCount('uncaughtException')) throw e;
  });

  process.on('unhandledRejection', (reason) => {
    doFinish('fail', reason?.message || String(reason));
  });

  // launchd / kill -TERM. Treat as failure unless explicitly finished.
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(sig, () => {
      doFinish('fail', `terminated by ${sig}`);
      process.exit(143);
    });
  }

  return {
    id,
    setUrlsFound(n) {
      if (typeof n === 'number' && !Number.isNaN(n)) urlsFound = Math.floor(n);
    },
    setError(e) {
      recordedError = e?.message || String(e || '');
    },
    finish(status = 'ok') {
      doFinish(status, null);
    },
    /** Mark this run as 'skipped' (cadence guard, dry-run, no-op exit). */
    skip(reason = null) {
      doFinish('skipped', reason);
    },
  };
}

// Test/cleanup utility — used only by tests to reset the singleton.
export function _resetForTests() {
  if (_db) {
    try { _db.close(); } catch (_e) {}
  }
  _db = null;
  _dbPath = null;
}
