#!/usr/bin/env node
/**
 * ingest-runner.mjs — Orchestrates secondary MCP + Worker source ingestion
 *
 * CLI:
 *   node scripts/ingest-runner.mjs \
 *     --indeed      fixtures/indeed-sample.md \
 *     --dice        fixtures/dice-sample.json \
 *     --greenhouse  stripe,anthropic,databricks \
 *     --lever       figma,linear \
 *     --worker-url  https://pulse-jobs-proxy.rahilnathanipulse.workers.dev \
 *     --output      data/jobs-incoming.json
 *
 * Flags:
 *   --indeed      <path>         Indeed MCP markdown file
 *   --dice        <path>         Dice MCP JSON file
 *   --greenhouse  <slugs>        Comma-separated Greenhouse company slugs (fetched via Worker)
 *   --lever       <slugs>        Comma-separated Lever company slugs (fetched via Worker)
 *   --worker-url  <url>          Cloudflare Worker base URL (default: env PULSE_WORKER_URL)
 *   --gh-fixture  <path>         Greenhouse fixture JSON (skips live Worker fetch; for tests)
 *   --lv-fixture  <path>         Lever fixture JSON (skips live Worker fetch; for tests)
 *   --output      <path>         Output path (default: data/jobs-incoming-{date}.json)
 *   --dry-run                    Print summary only, do not write
 *
 * Output shape:
 *   {
 *     ran_at, indeed_raw, dice_raw, greenhouse_raw, lever_raw,
 *     total_before_dedup, deduped, net, jobs: [ ...PulseJob ]
 *   }
 *
 * @typedef {Object} PulseJob
 * @property {string} source
 * @property {string} external_id
 * @property {string} title
 * @property {string} company
 * @property {string} location
 * @property {string} url
 * @property {string} posted_at
 * @property {string} ingested_at
 * @property {string} state
 * @property {number|null} salary_min
 * @property {number|null} salary_max
 * @property {string|null} employment_type
 * @property {boolean|null} remote
 * @property {string|null} summary
 * @property {string|null} company_logo_url
 * @property {boolean|null} easy_apply
 * @property {number|null} score
 * @property {boolean} has_connection
 * @property {boolean} verified
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseIndeedMD }                from './adapters/adapter-indeed.mjs';
import { parseDiceJobs }                from './adapters/adapter-dice.mjs';
import { parseGreenhouseWorkerResponse } from './adapters/adapter-greenhouse.mjs';
import { parseLeverWorkerResponse }      from './adapters/adapter-lever.mjs';
import { dedup }                         from './dedup.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── arg parsing ──────────────────────────────────────────────────────────────

function argVal(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

const indeedPath   = argVal('--indeed');
const dicePath     = argVal('--dice');
const ghSlugs      = (argVal('--greenhouse') || '').split(',').map(s => s.trim()).filter(Boolean);
const lvSlugs      = (argVal('--lever') || '').split(',').map(s => s.trim()).filter(Boolean);
const workerBase   = argVal('--worker-url') || process.env.PULSE_WORKER_URL || '';
const ghFixture    = argVal('--gh-fixture');
const lvFixture    = argVal('--lv-fixture');
const dryRun       = process.argv.includes('--dry-run');
const dateStamp    = new Date().toISOString().slice(0, 10);
const outputPath   = argVal('--output') || path.join(ROOT, 'data', `jobs-incoming-${dateStamp}.json`);

if (!indeedPath && !dicePath && ghSlugs.length === 0 && lvSlugs.length === 0 && !ghFixture && !lvFixture) {
  console.error('Usage: node scripts/ingest-runner.mjs [--indeed <file>] [--dice <file>] [--greenhouse <slugs>] [--lever <slugs>] [--output <file>] [--dry-run]');
  process.exit(1);
}

// ── load sources ─────────────────────────────────────────────────────────────

const now = new Date().toISOString();
let indeedJobs     = [];
let diceJobs       = [];
let greenhouseJobs = [];
let leverJobs      = [];

if (indeedPath) {
  const resolved = path.resolve(indeedPath);
  if (!fs.existsSync(resolved)) { console.error(`[ingest] Indeed file not found: ${resolved}`); process.exit(1); }
  indeedJobs = parseIndeedMD(fs.readFileSync(resolved, 'utf8'), now);
  console.log(`[ingest] Indeed: parsed ${indeedJobs.length} jobs`);
}

if (dicePath) {
  const resolved = path.resolve(dicePath);
  if (!fs.existsSync(resolved)) { console.error(`[ingest] Dice file not found: ${resolved}`); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const arr = Array.isArray(raw) ? raw : (raw.jobs || raw.data || []);
  diceJobs = parseDiceJobs(arr, now);
  console.log(`[ingest] Dice: parsed ${diceJobs.length} jobs`);
}

// Greenhouse fixture (test mode) or live Worker fetch
if (ghFixture) {
  const resolved = path.resolve(ghFixture);
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const responses = Array.isArray(raw) ? raw : [raw];
  for (const r of responses) {
    const jobs = parseGreenhouseWorkerResponse(r, r.company || '', now);
    greenhouseJobs.push(...jobs);
  }
  console.log(`[ingest] Greenhouse (fixture): parsed ${greenhouseJobs.length} jobs`);
} else if (ghSlugs.length > 0) {
  if (!workerBase) { console.error('[ingest] --greenhouse requires --worker-url or PULSE_WORKER_URL env var'); process.exit(1); }
  for (const slug of ghSlugs) {
    try {
      const res = await fetch(`${workerBase}/greenhouse/${slug}`);
      if (!res.ok) { console.warn(`[ingest] Greenhouse ${slug}: HTTP ${res.status}`); continue; }
      const data = await res.json();
      const jobs = parseGreenhouseWorkerResponse(data, slug, now);
      greenhouseJobs.push(...jobs);
      console.log(`[ingest] Greenhouse/${slug}: ${jobs.length} jobs`);
    } catch (e) {
      console.warn(`[ingest] Greenhouse ${slug} failed: ${e.message}`);
    }
  }
}

// Lever fixture (test mode) or live Worker fetch
if (lvFixture) {
  const resolved = path.resolve(lvFixture);
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const responses = Array.isArray(raw) ? raw : [raw];
  for (const r of responses) {
    const jobs = parseLeverWorkerResponse(r, r.company || '', now);
    leverJobs.push(...jobs);
  }
  console.log(`[ingest] Lever (fixture): parsed ${leverJobs.length} jobs`);
} else if (lvSlugs.length > 0) {
  if (!workerBase) { console.error('[ingest] --lever requires --worker-url or PULSE_WORKER_URL env var'); process.exit(1); }
  for (const slug of lvSlugs) {
    try {
      const res = await fetch(`${workerBase}/lever/${slug}`);
      if (!res.ok) { console.warn(`[ingest] Lever ${slug}: HTTP ${res.status}`); continue; }
      const data = await res.json();
      const jobs = parseLeverWorkerResponse(data, slug, now);
      leverJobs.push(...jobs);
      console.log(`[ingest] Lever/${slug}: ${jobs.length} jobs`);
    } catch (e) {
      console.warn(`[ingest] Lever ${slug} failed: ${e.message}`);
    }
  }
}

// ── dedup ─────────────────────────────────────────────────────────────────────

// Source order: greenhouse/lever (verified/ATS-direct) first, then indeed/dice
const combined = [...greenhouseJobs, ...leverJobs, ...indeedJobs, ...diceJobs];
const { kept, discarded } = dedup(combined);

console.log(`[ingest] Combined: ${combined.length} | Deduped: ${discarded.length} | Net: ${kept.length}`);

// ── output ────────────────────────────────────────────────────────────────────

const result = {
  ran_at:              now,
  indeed_raw:          indeedJobs.length,
  dice_raw:            diceJobs.length,
  greenhouse_raw:      greenhouseJobs.length,
  lever_raw:           leverJobs.length,
  total_before_dedup:  combined.length,
  deduped:             discarded.length,
  net:                 kept.length,
  jobs:                kept,
};

if (dryRun) {
  console.log('[ingest] dry-run — summary:');
  console.log(JSON.stringify({ ...result, jobs: `[${kept.length} jobs]` }, null, 2));
  if (kept[0]) console.log('[ingest] first job:', JSON.stringify(kept[0], null, 2));
  process.exit(0);
}

const tmpPath = outputPath + '.tmp';
fs.writeFileSync(tmpPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
fs.renameSync(tmpPath, outputPath);
console.log(`[ingest] Written → ${path.relative(ROOT, outputPath)}`);
