#!/usr/bin/env node

/**
 * review-loop.mjs — local pre-review loop for career-ops changes.
 *
 * Runs the repo's review gates and prints a compact reviewer handoff. It does
 * not call any AI provider; paste the generated prompt into your reviewer of
 * choice after the local checks pass.
 */

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';

const args = new Set(process.argv.slice(2));
const QUICK = args.has('--quick') || !args.has('--full');
const JSON_OUTPUT = args.has('--json');
const LIST_ONLY = args.has('--list');
const SELF_TEST = args.has('--self-test');
const HELP = args.has('--help') || args.has('-h');
const BASH_COMMAND = findBashCommand();

function findBashCommand() {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    ];
    return candidates.find((candidate) => existsSync(candidate)) || null;
  }
  return 'bash';
}

const REVIEW_COMMANDS = [
  {
    id: 'test-suite',
    label: QUICK ? 'Node test suite (quick)' : 'Node test suite (full)',
    command: process.execPath,
    args: ['test-all.mjs', ...(QUICK ? ['--quick'] : [])],
    required: true,
  },
  {
    id: 'diff-check',
    label: 'Git whitespace/conflict check',
    command: 'git',
    args: ['diff', '--check'],
    required: true,
  },
  {
    id: 'dependency-audit',
    label: 'NPM dependency audit',
    command: 'npm',
    args: ['audit'],
    required: true,
    skipWhen: () => !existsSync('package-lock.json'),
  },
  {
    id: 'dashboard-tests',
    label: 'Dashboard Go tests',
    command: 'go',
    args: ['test', './...'],
    cwd: 'dashboard',
    required: false,
    skipWhen: () => QUICK || !existsSync('dashboard/go.mod'),
  },
  {
    id: 'batch-shell-syntax',
    label: 'Batch runner shell syntax',
    command: BASH_COMMAND || 'bash',
    args: ['-n', 'batch/batch-runner.sh'],
    required: false,
    skipWhen: () => !BASH_COMMAND || !existsSync('batch/batch-runner.sh'),
  },
];

function usage() {
  return `career-ops review loop

Usage:
  node review-loop.mjs [--quick|--full] [--json]
  node review-loop.mjs --list
  node review-loop.mjs --self-test

Options:
  --quick      Run the fast local gate (default)
  --full       Include slower dashboard Go tests
  --json       Emit machine-readable results
  --list       Print planned commands without running them
  --self-test  Validate review-loop invariants`;
}

function commandPlan() {
  return REVIEW_COMMANDS
    .filter((entry) => !(entry.skipWhen && entry.skipWhen()))
    .map(({ id, label, command, args, cwd = '.', required }) => ({
      id,
      label,
      command,
      args,
      cwd,
      required,
    }));
}

function runCommand(entry) {
  const result = spawnSync(entry.command, entry.args, {
    cwd: entry.cwd,
    encoding: 'utf-8',
    shell: false,
    timeout: 120000,
  });

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  return {
    ...entry,
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status,
    output: output.slice(0, 4000),
  };
}

function buildReviewerPrompt(results) {
  const failed = results.filter((result) => result.status !== 'passed');
  const statusLine = failed.length === 0 ? 'All local checks passed.' : `${failed.length} local check(s) failed.`;
  const checks = results
    .map((result) => `- ${result.status === 'passed' ? 'PASS' : 'FAIL'} ${result.id}: ${result.command} ${result.args.join(' ')}`)
    .join('\n');

  return [
    'Review this career-ops change with a bug-finding mindset.',
    '',
    statusLine,
    '',
    'Local checks:',
    checks,
    '',
    'Focus on behavioral regressions, data safety, security, tests, docs, and rollback.',
    'Report findings first, ordered by severity, with file and line references.',
  ].join('\n');
}

function printPlan(plan) {
  console.log('Review loop command plan:');
  for (const entry of plan) {
    const required = entry.required ? 'required' : 'optional';
    const cwd = entry.cwd === '.' ? '' : ` (cwd: ${entry.cwd})`;
    console.log(`- [${required}] ${entry.id}: ${entry.command} ${entry.args.join(' ')}${cwd}`);
  }
}

function selfTest() {
  const plan = commandPlan();
  const ids = new Set(plan.map((entry) => entry.id));
  const failures = [];

  const expectedRequired = ['test-suite', 'diff-check'];
  if (existsSync('package-lock.json')) expectedRequired.push('dependency-audit');

  for (const requiredId of expectedRequired) {
    if (!ids.has(requiredId)) failures.push(`missing required check: ${requiredId}`);
  }

  for (const entry of plan) {
    const text = [entry.command, ...entry.args].join(' ');
    if (/[;&|`]/.test(text)) failures.push(`unsafe shell metacharacter in ${entry.id}`);
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
  }

  console.log('review-loop self-test passed');
}

if (HELP) {
  console.log(usage());
  process.exit(0);
}

if (SELF_TEST) {
  selfTest();
  process.exit(0);
}

const plan = commandPlan();

if (LIST_ONLY) {
  printPlan(plan);
  process.exit(0);
}

const results = plan.map(runCommand);
const prompt = buildReviewerPrompt(results);
const failedRequired = results.some((result) => result.required && result.status !== 'passed');

if (JSON_OUTPUT) {
  console.log(JSON.stringify({ ok: !failedRequired, quick: QUICK, results, reviewerPrompt: prompt }, null, 2));
} else {
  for (const result of results) {
    console.log(`${result.status === 'passed' ? 'PASS' : 'FAIL'} ${result.label}`);
    if (result.status !== 'passed' && result.output) {
      console.log(result.output);
    }
  }
  console.log('\nReviewer handoff prompt:\n');
  console.log(prompt);
}

process.exit(failedRequired ? 1 : 0);
