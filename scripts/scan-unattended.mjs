#!/usr/bin/env node
// scan-unattended.mjs — launchd-friendly wrapper for nightly portal scan + triage.
// Runs at 02:00 PT via com.mitchell.career-ops.scan.plist.
// Invoked directly by node so launchd doesn't need /bin/bash TCC.

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, openSync, writeSync, closeSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { hc } from '../lib/healthchecks-ping.mjs';
import { startRun, finishRun } from '../lib/job-runs-ledger.mjs';

// P1-12 portability: env overrides let GH Actions Linux runners reuse this
// script without forking it. Local launchd plists leave the env unset →
// macOS defaults below apply (status quo).
const PROJECT_DIR = process.env.CAREER_OPS_DIR || '/Users/mitchellwilliams/Documents/career-ops';
const NODE_BIN = process.env.CAREER_OPS_NODE || '/Users/mitchellwilliams/.nvm/versions/node/v24.14.0/bin/node';
const LOG_DIR = join(PROJECT_DIR, 'data/logs');
const DATE = new Date().toISOString().slice(0, 10);
const LOG_PATH = join(LOG_DIR, `scan-${DATE}.log`);

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const logFd = openSync(LOG_PATH, 'a');
const log = (msg) => writeSync(logFd, msg + '\n');

const ping = hc('PORTAL_SCAN');
const runId = startRun('portal-scan');
await ping.start();

log(`=== scan-unattended starting ${new Date().toISOString()} (hc=${ping.enabled ? 'on' : 'off'} ledger=${runId ? 'on' : 'off'}) ===`);
process.chdir(PROJECT_DIR);

function run(label, args) {
  log(`--- ${label} ---`);
  const result = spawnSync(NODE_BIN, args, {
    cwd: PROJECT_DIR,
    encoding: 'utf-8',
    env: { ...process.env, PATH: `${process.env.CAREER_OPS_NODE_BIN_DIR || '/Users/mitchellwilliams/.nvm/versions/node/v24.14.0/bin'}:${process.env.PATH || ''}` },
  });
  if (result.stdout) log(result.stdout.trimEnd());
  if (result.stderr) log('STDERR: ' + result.stderr.trimEnd());
  log(`${label} exit code: ${result.status ?? 'null'}`);
  return result.status ?? 1;
}

// Run all three scanners before triage so the batch sees offers from every
// source. Each scanner writes to the same pipeline.md and shares dedup logic.
run('scan.mjs', ['scan.mjs']);            // ATS APIs (Greenhouse/Ashby/Lever)
run('scan-rss.mjs', ['scan-rss.mjs']);    // RemoteOK + WeWorkRemotely RSS/JSON
run('scan-email.mjs', ['scan-email.mjs']); // Gmail-labelled job alerts (LinkedIn/BuiltIn/Wellfound/Otta)
// Limit lowered from 100 → 30 on 2026-05-05: at 100 the nightly batch was
// spawning 100 claude -p sessions/night (~700/week) and draining the Max cap.
// 30 is the original limit; raises ~50 min batch runtime. To raise again,
// add an ANTHROPIC_API_KEY to ~/.career-ops-secrets and port batch-runner.sh
// to use the API directly so batch costs don't hit the subscription.
run('triage-pipeline.mjs', ['scripts/triage-pipeline.mjs', '--limit=30']);

// Bridge: triage-batch.tsv (6-col) → batch-input.tsv (4-col) for batch-runner.sh
const TRIAGE_TSV = join(PROJECT_DIR, 'data/triage-batch.tsv');
const BATCH_INPUT = join(PROJECT_DIR, 'batch/batch-input.tsv');
log('--- bridge: triage-batch.tsv → batch-input.tsv ---');
let bridgeCount = 0;
if (existsSync(TRIAGE_TSV)) {
  const lines = readFileSync(TRIAGE_TSV, 'utf-8').split('\n').filter(Boolean);
  const dataRows = lines.slice(1); // skip header
  const out = ['id\turl\tsource\tnotes'];
  for (const row of dataRows) {
    const [id, company, title, url, location, archetype] = row.split('\t');
    if (!id || !url) continue;
    const noteParts = [`${company} — ${title}`];
    if (location) noteParts.push(`(${location})`);
    if (archetype) noteParts.push(`[${archetype}]`);
    out.push(`${id}\t${url}\ttriage\t${noteParts.join(' ')}`);
  }
  writeFileSync(BATCH_INPUT, out.join('\n') + '\n');
  bridgeCount = out.length - 1;
  log(`Wrote ${bridgeCount} rows to batch/batch-input.tsv`);
} else {
  log('No triage-batch.tsv found — skipping bridge');
}

log(`=== scan-unattended completed ${new Date().toISOString()} ===`);
log('');
closeSync(logFd);
finishRun(runId, { status: 'ok', urls_found: bridgeCount });
await ping.success(`bridged ${bridgeCount} rows`);
process.exit(0);
