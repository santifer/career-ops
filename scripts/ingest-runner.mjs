#!/usr/bin/env node
/**
 * ingest-runner.mjs — Orchestrates secondary MCP source ingestion
 *
 * Reads raw MCP outputs, runs adapters, deduplicates, writes PulseJob array.
 *
 * CLI:
 *   node scripts/ingest-runner.mjs \
 *     --indeed fixtures/indeed-sample.md \
 *     --dice   fixtures/dice-sample.json \
 *     --output data/jobs-incoming.json
 *
 * Flags:
 *   --indeed <path>   Path to Indeed MCP markdown file
 *   --dice   <path>   Path to Dice MCP JSON file
 *   --output <path>   Output path (default: data/jobs-incoming-{date}.json)
 *   --dry-run         Print summary only, do not write output
 *
 * Output shape:
 *   {
 *     "ran_at": "2026-06-05T...",
 *     "indeed_raw": N,
 *     "dice_raw": N,
 *     "total_before_dedup": N,
 *     "deduped": N,
 *     "net": N,
 *     "jobs": [ ...PulseJob ]
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
import { parseIndeedMD } from './adapters/adapter-indeed.mjs';
import { parseDiceJobs } from './adapters/adapter-dice.mjs';
import { dedup } from './dedup.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── arg parsing ──────────────────────────────────────────────────────────────

function argVal(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

const indeedPath = argVal('--indeed');
const dicePath   = argVal('--dice');
const dryRun     = process.argv.includes('--dry-run');
const dateStamp  = new Date().toISOString().slice(0, 10);
const outputPath = argVal('--output') || path.join(ROOT, 'data', `jobs-incoming-${dateStamp}.json`);

if (!indeedPath && !dicePath) {
  console.error('Usage: node scripts/ingest-runner.mjs --indeed <file> --dice <file> [--output <file>] [--dry-run]');
  process.exit(1);
}

// ── load sources ─────────────────────────────────────────────────────────────

const now = new Date().toISOString();
let indeedJobs = [];
let diceJobs   = [];

if (indeedPath) {
  const resolved = path.resolve(indeedPath);
  if (!fs.existsSync(resolved)) {
    console.error(`[ingest] Indeed file not found: ${resolved}`);
    process.exit(1);
  }
  const md = fs.readFileSync(resolved, 'utf8');
  indeedJobs = parseIndeedMD(md, now);
  console.log(`[ingest] Indeed: parsed ${indeedJobs.length} jobs from ${path.basename(resolved)}`);
}

if (dicePath) {
  const resolved = path.resolve(dicePath);
  if (!fs.existsSync(resolved)) {
    console.error(`[ingest] Dice file not found: ${resolved}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  // Accept: raw array OR { jobs: [...] } wrapper
  const arr = Array.isArray(raw) ? raw : (raw.jobs || raw.data || []);
  diceJobs = parseDiceJobs(arr, now);
  console.log(`[ingest] Dice: parsed ${diceJobs.length} jobs from ${path.basename(resolved)}`);
}

// ── dedup ─────────────────────────────────────────────────────────────────────

const combined = [...indeedJobs, ...diceJobs];
const { kept, discarded } = dedup(combined);

console.log(`[ingest] Combined: ${combined.length} | Deduped: ${discarded.length} | Net: ${kept.length}`);

// ── output ────────────────────────────────────────────────────────────────────

const result = {
  ran_at:              now,
  indeed_raw:          indeedJobs.length,
  dice_raw:            diceJobs.length,
  total_before_dedup:  combined.length,
  deduped:             discarded.length,
  net:                 kept.length,
  jobs:                kept,
};

if (dryRun) {
  console.log('[ingest] dry-run — sample first job:');
  if (kept[0]) console.log(JSON.stringify(kept[0], null, 2));
  process.exit(0);
}

const tmpPath = outputPath + '.tmp';
fs.writeFileSync(tmpPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
fs.renameSync(tmpPath, outputPath);
console.log(`[ingest] Written → ${path.relative(ROOT, outputPath)}`);
