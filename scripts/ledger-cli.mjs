#!/usr/bin/env node
// scripts/ledger-cli.mjs — Tiny stdin/stdout shim around lib/job-runs-ledger.mjs
// so shell wrappers (notably scripts/wrappers/cron-run.sh) can record
// job_runs rows without re-implementing the SQLite glue in bash.
//
// Usage:
//   node scripts/ledger-cli.mjs start <job_name>        # writes "running" row, prints id
//   node scripts/ledger-cli.mjs finish <id> <status> [urls_found] [error_msg]
//                                                      # closes the row, status ∈ ok|fail|skipped
//
// Every command exits 0 on internal failure so the wrapper can pipe stdout
// safely (the row just won't get recorded — never break the parent job).
// Pipe stderr to /dev/null in shell to keep launchd logs clean.

import { startRun, finishRun } from '../lib/job-runs-ledger.mjs';

const [cmd, ...args] = process.argv.slice(2);

try {
  if (cmd === 'start') {
    const jobName = args[0];
    if (!jobName) {
      console.error('ledger-cli: missing job_name');
      process.exit(0);
    }
    const id = startRun(jobName);
    if (id != null) process.stdout.write(String(id));
    process.exit(0);
  }

  if (cmd === 'finish') {
    const id = Number(args[0]);
    const status = args[1] || 'ok';
    const urlsFound = args[2] && args[2] !== '' ? Number(args[2]) : null;
    const errMsg = args[3] && args[3] !== '' ? args[3] : null;
    if (Number.isNaN(id) || !id) {
      // No row was opened (e.g., wrapper start step failed) — silently no-op.
      process.exit(0);
    }
    finishRun(id, { status, urls_found: urlsFound, error: errMsg });
    process.exit(0);
  }

  console.error(`ledger-cli: unknown command '${cmd}' (expected start|finish)`);
  process.exit(0);
} catch (e) {
  console.error(`ledger-cli: ${e.message}`);
  process.exit(0);
}
