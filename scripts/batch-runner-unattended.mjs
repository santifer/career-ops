#!/usr/bin/env node
// batch-runner-unattended.mjs — launchd-friendly wrapper for overnight batch.
// Runs at 03:00 PT via com.mitchell.career-ops.batch.plist.
// Reads ~/.career-ops-secrets, applies a 60-min watchdog timeout,
// invoked directly by node so launchd doesn't need /bin/bash TCC.

import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, openSync, writeSync, closeSync, readFileSync, renameSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const PROJECT_DIR = '/Users/mitchellwilliams/Documents/career-ops';
const SECRETS_FILE = join(homedir(), '.career-ops-secrets');
const NODE_DIR = '/Users/mitchellwilliams/.nvm/versions/node/v24.14.0/bin';
const LOG_DIR = join(PROJECT_DIR, 'data/logs');
const DATE = new Date().toISOString().slice(0, 10);
const LOG_PATH = join(LOG_DIR, `batch-${DATE}.log`);
// Default raised 2026-04-27 from 3600s (60min) → 21600s (6hr) to accommodate
// the 100-candidate triage limit. At parallel=2 with ~4-5 min/eval, 100 offers
// take ~3.5-4.2 hr; 6hr gives margin for slow workers + retries.
const TIMEOUT_MS = parseInt(process.env.BATCH_TIMEOUT_SECONDS || '21600', 10) * 1000;
// Default parallel=2 (was used 4 in one manual run today and hit Claude API
// rate-limits — 12 of 30 evaluations failed). Stay at 2 unless retrying small
// failed sets.
const PARALLEL = process.env.BATCH_PARALLEL || '2';

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const logFd = openSync(LOG_PATH, 'a');
const log = (msg) => writeSync(logFd, msg + '\n');

log(`=== batch-runner-unattended starting ${new Date().toISOString()} ===`);
process.chdir(PROJECT_DIR);

const secrets = {};
if (existsSync(SECRETS_FILE)) {
  for (const line of readFileSync(SECRETS_FILE, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) secrets[m[1]] = m[2].trim();
  }
  log(`Loaded ${Object.keys(secrets).length} secrets from ${SECRETS_FILE}`);
} else {
  log(`WARN: ${SECRETS_FILE} missing — proceeding without env injection`);
}

const childEnv = {
  ...process.env,
  ...secrets,
  PATH: `${NODE_DIR}:/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || '/usr/bin:/bin'}`,
};
log(`PATH: ${childEnv.PATH}`);

const inputFile = join(PROJECT_DIR, 'batch/batch-input.tsv');
if (!existsSync(inputFile)) {
  log('No batch-input.tsv — nothing to evaluate. Exiting clean.');
  log(`=== batch-runner-unattended completed ${new Date().toISOString()} ===`);
  closeSync(logFd);
  process.exit(0);
}

// Archive prior batch-state.tsv so each unattended night starts fresh
// (triage IDs are per-run, not stable across nights — stale state would cause false skips)
const stateFile = join(PROJECT_DIR, 'batch/batch-state.tsv');
if (existsSync(stateFile)) {
  const archive = join(PROJECT_DIR, `batch/batch-state.archive-${DATE}-${Date.now()}.tsv`);
  renameSync(stateFile, archive);
  log(`Archived prior batch-state.tsv → ${archive}`);
}

log(`--- Running batch-runner.sh (parallel=${PARALLEL}, timeout=${TIMEOUT_MS / 1000}s) ---`);
const child = spawn('/bin/bash', [join(PROJECT_DIR, 'batch/batch-runner.sh'), '--parallel', PARALLEL], {
  cwd: PROJECT_DIR,
  env: childEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (chunk) => log(chunk.toString().trimEnd()));
child.stderr.on('data', (chunk) => log('STDERR: ' + chunk.toString().trimEnd()));

const watchdog = setTimeout(() => {
  log(`TIMEOUT: killing batch-runner PID ${child.pid} after ${TIMEOUT_MS / 1000}s`);
  child.kill('SIGTERM');
  setTimeout(() => child.kill('SIGKILL'), 5000);
}, TIMEOUT_MS);

child.on('exit', (code, signal) => {
  clearTimeout(watchdog);
  log(`batch-runner.sh exit code: ${code ?? `signal:${signal}`}`);

  // Rebuild the HTML dashboard so it reflects new evaluations + tracker
  // additions from this batch. Errors here don't fail the pipeline — the
  // dashboard rebuild is best-effort.
  log('--- Rebuilding HTML dashboard ---');
  try {
    const dashChild = spawnSync(`${NODE_DIR}/node`, ['scripts/build-dashboard.mjs'], {
      cwd: PROJECT_DIR,
      env: childEnv,
      encoding: 'utf-8',
    });
    if (dashChild.stdout) log(dashChild.stdout.trimEnd());
    if (dashChild.stderr) log('STDERR: ' + dashChild.stderr.trimEnd());
    log(`build-dashboard.mjs exit code: ${dashChild.status ?? 'null'}`);
  } catch (err) {
    log(`build-dashboard.mjs error (non-fatal): ${err.message}`);
  }

  // Build Apply Packs for the top N Apply-Now roles. Skip-if-exists by
  // default — preserves any hand-edits to existing packs. New roles that
  // entered the top-N today get freshly generated packs. Best-effort.
  // --include-todays-top also builds a pack for the highest-scoring NEW
  // role from today even if it doesn't crack the cumulative top-3, so the
  // heartbeat's "What's New Overnight" #1 always has a Pack link.
  log('--- Building Apply Packs (top 3 + today\'s top) ---');
  try {
    const packChild = spawnSync(`${NODE_DIR}/node`, ['scripts/build-apply-packs.mjs', '--include-todays-top'], {
      cwd: PROJECT_DIR,
      env: childEnv,
      encoding: 'utf-8',
    });
    if (packChild.stdout) log(packChild.stdout.trimEnd());
    if (packChild.stderr) log('STDERR: ' + packChild.stderr.trimEnd());
    log(`build-apply-packs.mjs exit code: ${packChild.status ?? 'null'}`);
  } catch (err) {
    log(`build-apply-packs.mjs error (non-fatal): ${err.message}`);
  }

  log(`=== batch-runner-unattended completed ${new Date().toISOString()} ===`);
  log('');
  closeSync(logFd);
  process.exit(0);
});
