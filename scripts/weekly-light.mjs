#!/usr/bin/env node
/**
 * weekly-light.mjs — Zero-LLM-cost weekly health run.
 * Runs: verify-pipeline → analyze-patterns → followup-cadence
 * No API calls. Safe on any day, any quota state.
 * Triggered by: com.mitchell.career-ops.weekly-light (Saturday 08:10 PT)
 */

import { execSync } from 'child_process';
import { writeFileSync, appendFileSync } from 'fs';
import path from 'path';
import { installRunRecord } from '../lib/job-runs-ledger.mjs';

const __jobRun = installRunRecord('weekly-light');

const root = '/Users/mitchellwilliams/Documents/career-ops';
const logPath = path.join(root, 'data/logs/weekly-light.out');
const ts = new Date().toISOString();

function run(label, cmd) {
  console.log(`\n[${ts}] Running: ${label}`);
  try {
    const out = execSync(cmd, { cwd: root, encoding: 'utf8', timeout: 60000 });
    console.log(out);
    return { ok: true, label, out };
  } catch (e) {
    console.error(`[ERROR] ${label}: ${e.message}`);
    return { ok: false, label, err: e.message };
  }
}

const results = [];

results.push(run('verify-pipeline', 'node verify-pipeline.mjs'));
results.push(run('analyze-patterns', 'node analyze-patterns.mjs'));
results.push(run('followup-cadence', 'node followup-cadence.mjs'));

const failed = results.filter(r => !r.ok);
const summary = `[${ts}] weekly-light: ${results.length - failed.length}/${results.length} OK` +
  (failed.length ? ` | FAILED: ${failed.map(r => r.label).join(', ')}` : '');

console.log('\n' + summary);
appendFileSync(path.join(root, 'data/logs/weekly-light-summary.log'), summary + '\n');

process.exit(failed.length > 0 ? 1 : 0);
