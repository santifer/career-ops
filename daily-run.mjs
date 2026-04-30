#!/usr/bin/env node
/**
 * daily-run.mjs — One-command daily Career-Ops preparation run
 *
 * This runs the non-LLM parts that should happen every day:
 * scan configured portals, rank pending roles, export the tracker, and verify
 * data integrity. It deliberately does not submit applications.
 *
 * Usage:
 *   node daily-run.mjs
 *   node daily-run.mjs --dry-run
 *   node daily-run.mjs --background
 *   node daily-run.mjs --no-scan --limit 25
 */

import { existsSync, mkdirSync, openSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn, spawnSync } from 'child_process';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

function hasArg(name) {
  return args.includes(name);
}

function argValue(name, fallback = null) {
  const idx = args.indexOf(name);
  return idx === -1 ? fallback : args[idx + 1];
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function runStep(label, command, commandArgs, options = {}) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, commandArgs, {
    cwd: CAREER_OPS,
    encoding: 'utf-8',
    stdio: 'pipe',
    env: process.env,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }

  return result.status;
}

function startBackground() {
  mkdirSync(join(CAREER_OPS, 'batch/logs'), { recursive: true });
  const logPath = join(CAREER_OPS, 'batch/logs', `daily-run-${timestamp()}.log`);
  const out = openSync(logPath, 'a');
  const err = openSync(logPath, 'a');
  const childArgs = process.argv.slice(1).filter(arg => arg !== '--background');

  const child = spawn(process.execPath, childArgs, {
    cwd: CAREER_OPS,
    detached: true,
    stdio: ['ignore', out, err],
    env: process.env,
  });

  child.unref();
  console.log(`Started daily run in background (PID ${child.pid})`);
  console.log(`Log: ${logPath}`);
}

if (hasArg('--background')) {
  startBackground();
  process.exit(0);
}

const dryRun = hasArg('--dry-run');
const noScan = hasArg('--no-scan');
const skipVerify = hasArg('--skip-verify');
const limit = argValue('--limit', '30');

try {
  console.log(`Career-Ops daily run — ${new Date().toISOString().slice(0, 10)}`);
  console.log('This prepares applications for human review; it never submits them.');

  if (!existsSync(join(CAREER_OPS, 'cv.md'))) {
    throw new Error('cv.md is missing. Run onboarding before daily automation.');
  }
  if (!existsSync(join(CAREER_OPS, 'config/profile.yml'))) {
    throw new Error('config/profile.yml is missing. Run onboarding before daily automation.');
  }
  if (!existsSync(join(CAREER_OPS, 'portals.yml'))) {
    throw new Error('portals.yml is missing. Configure portals before daily automation.');
  }

  runStep('Setup check', 'node', ['doctor.mjs']);

  if (!noScan) {
    const scanArgs = ['scan.mjs'];
    if (dryRun) scanArgs.push('--dry-run');
    runStep(dryRun ? 'Portal scan preview' : 'Portal scan', 'node', scanArgs);
  }

  runStep('Rank pending pipeline', 'node', ['pipeline-ranker.mjs', '--limit', limit]);
  runStep('Export application tracker CSV', 'node', ['export-tracker.mjs']);

  if (!skipVerify) {
    runStep('Pipeline verification', 'node', ['verify-pipeline.mjs'], { allowFailure: true });
  }

  console.log('\nDaily run complete.');
  console.log('Review output/pipeline-ranked.md for the fastest high-fit roles to process next.');
  console.log('Open output/applications.csv in your spreadsheet tool for application status.');
} catch (err) {
  console.error(`\nDaily run failed: ${err.message}`);
  process.exit(1);
}
