#!/usr/bin/env node
// scrape-only.mjs — every-4h companion to scan-unattended.mjs.
// Runs the 3 zero-LLM scrapers (scan.mjs + scan-rss.mjs + scan-email.mjs) but
// SKIPS triage-pipeline.mjs (which burns Claude tokens). Triage stays on the
// daily 02:00 PT scan-unattended chain.
//
// Adjudicated council recommendation 2026-05-19: every-4h scrape cadence
// captures the 24-48h first-mover window without LLM cost. Tier-A/B/C plist
// filtering deferred to a later refactor — currently runs ALL companies each
// fire (ATS APIs are unrate-limited per Greenhouse/Ashby docs).

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, openSync, writeSync, closeSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { startRun, finishRun } from '../lib/job-runs-ledger.mjs';

// Derive locations from this file's path + the running node binary so the
// script is portable + the test-all.mjs absolute-path check passes without
// an explicit exclusion. This file lives at <repo>/scripts/, so the repo
// root is one level up. NODE_BIN matches the binary that launched us.
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, '..');
const NODE_BIN = process.execPath;
const NODE_BIN_DIR = dirname(NODE_BIN);
const LOG_DIR = join(PROJECT_DIR, 'data/logs');
const DATE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const LOG_PATH = join(LOG_DIR, `scrape-${DATE}.log`);

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const logFd = openSync(LOG_PATH, 'a');
const log = (msg) => writeSync(logFd, msg + '\n');

const runId = startRun('scrape-frequent');
const scanHistoryPath = join(PROJECT_DIR, 'data/scan-history.tsv');
const startingHistorySize = existsSync(scanHistoryPath) ? readFileSync(scanHistoryPath, 'utf-8').split('\n').length : 0;

log(`=== scrape-only starting ${new Date().toISOString()} ===`);
process.chdir(PROJECT_DIR);

function run(label, args) {
  log(`--- ${label} ---`);
  const result = spawnSync(NODE_BIN, args, {
    cwd: PROJECT_DIR,
    encoding: 'utf-8',
    env: { ...process.env, PATH: `${NODE_BIN_DIR}:${process.env.PATH || ''}` },
  });
  if (result.stdout) log(result.stdout.trimEnd());
  if (result.stderr) log('STDERR: ' + result.stderr.trimEnd());
  log(`${label} exit code: ${result.status ?? 'null'}`);
  return result.status ?? 1;
}

run('scan.mjs', ['scan.mjs']);
run('scan-rss.mjs', ['scan-rss.mjs']);
run('scan-email.mjs', ['scan-email.mjs']);

const endingHistorySize = existsSync(scanHistoryPath) ? readFileSync(scanHistoryPath, 'utf-8').split('\n').length : 0;
const urlsFound = Math.max(0, endingHistorySize - startingHistorySize);
log(`=== scrape-only completed ${new Date().toISOString()} (+${urlsFound} URLs) ===`);
log('');
closeSync(logFd);
finishRun(runId, { status: 'ok', urls_found: urlsFound });
process.exit(0);
