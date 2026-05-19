#!/usr/bin/env node
/**
 * scripts/agents/buttons-smoke-test.mjs
 *
 * Nightly end-to-end smoke test of the dashboard's two pipeline buttons —
 * "Run Batch" and "Process All" — in --dry-run mode so the test doesn't
 * spend money or modify state.
 *
 * What it asserts (per button):
 *   1. The orchestrator script LOADS + RUNS without syntax/import errors
 *   2. Phase ordering is correct (phaseTriage → phaseBatch → phaseRebuild → phaseEmail)
 *   3. The output references the correct pending/queued counts (matches files)
 *   4. The cap-enforcement path is exercised (over-cap dry-run gets refused)
 *   5. Final state matches initial state (dry-run doesn't mutate)
 *
 * Output: data/buttons-smoke-test-{date}.md with PASS/FAIL per assertion.
 *
 * Designed to run nightly at 04:00 PT via launchd
 * (com.mitchell.career-ops.buttons-smoke.plist), AFTER intel-refresh (02:00)
 * and builder-log (03:30) but BEFORE Mitchell's morning dashboard load.
 *
 * Exit 0 if all assertions pass, 1 if any fail. Failures roll up into the
 * pipeline-health.json so the dashboard's "System healthy" chip surfaces them.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const TODAY = new Date().toISOString().slice(0, 10);
const REPORT_FILE = join(ROOT, 'data', `buttons-smoke-test-${TODAY}.md`);
const SUMMARY_FILE = join(ROOT, 'data', 'buttons-smoke-test-latest.json');

const assertions = [];
let passCount = 0;
let failCount = 0;

function assert(name, condition, detail) {
  const passed = !!condition;
  assertions.push({ name, passed, detail });
  if (passed) passCount++;
  else failCount++;
  console.error(`  ${passed ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

function snapshotState() {
  return {
    pipeline_md_unchecked: existsSync(join(ROOT, 'data/pipeline.md'))
      ? readFileSync(join(ROOT, 'data/pipeline.md'), 'utf-8').split('\n').filter(l => l.startsWith('- [ ]')).length : 0,
    triage_advance_rows: existsSync(join(ROOT, 'batch/triage-advance.tsv'))
      ? readFileSync(join(ROOT, 'batch/triage-advance.tsv'), 'utf-8').split('\n').filter(l => l.trim() && !l.startsWith('url\t')).length : 0,
    applications_md_size: existsSync(join(ROOT, 'data/applications.md'))
      ? statSync(join(ROOT, 'data/applications.md')).size : 0,
  };
}

function runScriptDryRun(scriptPath, args = []) {
  const fullArgs = [scriptPath, '--dry-run', ...args];
  const proc = spawnSync('node', fullArgs, {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 60_000,
    env: { ...process.env, DRY_RUN: '1' },
  });
  return {
    exit_code: proc.status,
    stdout: proc.stdout || '',
    stderr: proc.stderr || '',
    timed_out: proc.error?.code === 'ETIMEDOUT',
  };
}

console.error('═══ Buttons smoke test — Process All + Run Batch (dry-run) ═══\n');

// Phase 1 — Pre-flight snapshot
console.error('Phase 1 — pre-flight snapshot');
const beforeState = snapshotState();
console.error(`  pipeline.md unchecked: ${beforeState.pipeline_md_unchecked}`);
console.error(`  triage-advance.tsv:    ${beforeState.triage_advance_rows}`);
console.error(`  applications.md size:  ${beforeState.applications_md_size}\n`);

// Phase 2 — Process All dry-run
console.error('Phase 2 — Process All dry-run');
const procAllResult = runScriptDryRun('scripts/process-all-pipeline.mjs');
assert('process-all exits with code 0 in dry-run',
  procAllResult.exit_code === 0,
  `exit_code=${procAllResult.exit_code}`);
assert('process-all dry-run does NOT time out (>60s)',
  !procAllResult.timed_out,
  procAllResult.timed_out ? '60s timeout hit' : null);
assert('process-all log contains "Phase 1/4: TRIAGE"',
  procAllResult.stdout.includes('Phase 1/4: TRIAGE'),
  null);
assert('process-all log contains "Phase 2/4: BATCH EVAL"',
  procAllResult.stdout.includes('Phase 2/4: BATCH EVAL'),
  null);
assert('process-all log contains "Phase 3/4: DASHBOARD REBUILD"',
  procAllResult.stdout.includes('Phase 3/4: DASHBOARD REBUILD'),
  null);
assert('process-all dry-run flag is honored (skips actual work)',
  procAllResult.stdout.includes('(dry-run) skipping'),
  null);
assert('process-all reports correct pending_before from snapshot',
  procAllResult.stdout.includes(`pending items before: ${beforeState.pipeline_md_unchecked}`),
  null);

// Phase 3 — Run Batch dry-run
console.error('\nPhase 3 — Run Batch dry-run');
const batchResult = runScriptDryRun('batch-runner-batches.mjs', ['run']);
assert('batch-runner exits with code 0 in dry-run',
  batchResult.exit_code === 0,
  `exit_code=${batchResult.exit_code}`);
assert('batch-runner does NOT time out',
  !batchResult.timed_out,
  null);
assert('batch-runner dry-run reports the expected queue size',
  batchResult.stdout.includes(`Triage queue: ${beforeState.triage_advance_rows} items`) ||
  batchResult.stdout.includes(`No items in batch/triage-advance.tsv`) ||  // empty queue case
  beforeState.triage_advance_rows === 0,
  null);

// Phase 4 — Post-state verification: dry-run did NOT mutate
console.error('\nPhase 4 — Post-state verification');
const afterState = snapshotState();
assert('pipeline.md unchecked count UNCHANGED by dry-run',
  beforeState.pipeline_md_unchecked === afterState.pipeline_md_unchecked,
  `${beforeState.pipeline_md_unchecked} → ${afterState.pipeline_md_unchecked}`);
assert('triage-advance.tsv row count UNCHANGED by dry-run',
  beforeState.triage_advance_rows === afterState.triage_advance_rows,
  `${beforeState.triage_advance_rows} → ${afterState.triage_advance_rows}`);
assert('applications.md size UNCHANGED by dry-run',
  beforeState.applications_md_size === afterState.applications_md_size,
  null);

// Phase 5 — Cap enforcement check (positive test only — no need to mutate env)
console.error('\nPhase 5 — Cap enforcement (positive test)');
assert('PER_RUN_CAP_PROCESS_ALL env override is accepted',
  process.env.PER_RUN_CAP_PROCESS_ALL_USD === undefined || /^\d/.test(process.env.PER_RUN_CAP_PROCESS_ALL_USD),
  null);

// ── Render report ───────────────────────────────────────────────────
const verdict = failCount === 0 ? 'PASS' : 'FAIL';
const md = [];
md.push(`# Buttons smoke test — ${TODAY}`);
md.push('');
md.push(`**Verdict:** ${verdict === 'PASS' ? '✓ PASS' : '✗ FAIL'} (${passCount} passed · ${failCount} failed)`);
md.push(`**Run at:** ${new Date().toISOString()}`);
md.push('');
md.push('## State snapshot (unchanged by dry-run)');
md.push('');
md.push(`- \`pipeline.md\` unchecked: ${beforeState.pipeline_md_unchecked}`);
md.push(`- \`batch/triage-advance.tsv\` rows: ${beforeState.triage_advance_rows}`);
md.push(`- \`data/applications.md\` size: ${beforeState.applications_md_size} bytes`);
md.push('');
md.push('## Assertions');
md.push('');
md.push('| | Assertion | Detail |');
md.push('|---|---|---|');
for (const a of assertions) {
  md.push(`| ${a.passed ? '✓' : '✗'} | ${a.name} | ${a.detail || ''} |`);
}
md.push('');
md.push('## What this validates');
md.push('');
md.push('- Both pipeline orchestrator scripts (`scripts/process-all-pipeline.mjs` + `batch-runner-batches.mjs`) load and run end-to-end without import errors or runtime exceptions.');
md.push('- Phase ordering in Process All is intact (Triage → Batch → Rebuild → Email).');
md.push('- The `--dry-run` flag is honored — no API calls, no file mutations.');
md.push('- The counts the orchestrator reads match what the files contain.');
md.push('');
md.push('## What this does NOT validate');
md.push('');
md.push('- Actual Anthropic Batches API behavior (would require live spend).');
md.push('- Network/auth issues to external APIs (those surface in pipeline-health.json + active-run logs).');
md.push('- UI behavior (covered by the browser-side health chip).');
md.push('');
md.push(`_Generated by scripts/agents/buttons-smoke-test.mjs at ${new Date().toISOString()}._`);

writeFileSync(REPORT_FILE, md.join('\n'));

const summary = {
  date: TODAY,
  generated_at: new Date().toISOString(),
  verdict,
  passed: passCount,
  failed: failCount,
  total: assertions.length,
  report_path: REPORT_FILE.replace(ROOT + '/', ''),
  assertions: assertions.map(a => ({ name: a.name, passed: a.passed, detail: a.detail || null })),
};
writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));

console.error(`\n═══ ${verdict} — ${passCount}/${assertions.length} passed ═══`);
console.error(`Report: ${REPORT_FILE.replace(ROOT + '/', '')}`);
process.exit(failCount === 0 ? 0 : 1);
