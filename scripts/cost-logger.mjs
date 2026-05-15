#!/usr/bin/env node
/**
 * scripts/cost-logger.mjs — Per-batch cost tracking
 *
 * Appends one TSV row to data/cost-log.tsv after each batch is processed.
 * Call from batch-runner-batches.mjs phaseProcess, or standalone:
 *
 *   node scripts/cost-logger.mjs --batch-id=msgbatch_xxx [--requests=50]
 *
 * TSV columns:
 *   date  batch_id  requests  input_tokens  output_tokens
 *   cache_read_tokens  cache_write_tokens  cost_usd  model
 *
 * Cost formula (Sonnet 4.6, Batches API 50% off):
 *   input:        $3.00 / 1M tokens × 0.5 = $1.50/MTok
 *   output:      $15.00 / 1M tokens × 0.5 = $7.50/MTok
 *   cache read:   $0.30 / 1M tokens × 0.5 = $0.15/MTok
 *   cache write:  $3.75 / 1M tokens × 0.5 = $1.875/MTok
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath }  from 'url';
import { SONNET } from '../lib/models.mjs';

const ROOT     = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_FILE = join(ROOT, 'data', 'cost-log.tsv');

const HEADER = 'date\tbatch_id\trequests\tinput_tokens\toutput_tokens\tcache_read_tokens\tcache_write_tokens\tcost_usd\tmodel\n';

// Per-token costs in USD (post-Batches 50% discount)
const RATES = {
  input:        1.50 / 1e6,
  output:       7.50 / 1e6,
  cache_read:   0.15 / 1e6,
  cache_write:  1.875 / 1e6,
};

export function logBatchCost({ batchId, model, requests, usage }) {
  const {
    input_tokens        = 0,
    output_tokens       = 0,
    cache_read_input_tokens    = 0,
    cache_creation_input_tokens = 0,
  } = usage;

  const cost = (
    input_tokens               * RATES.input  +
    output_tokens              * RATES.output +
    cache_read_input_tokens    * RATES.cache_read  +
    cache_creation_input_tokens * RATES.cache_write
  );

  const row = [
    new Date().toISOString().slice(0, 10),
    batchId,
    requests,
    input_tokens,
    output_tokens,
    cache_read_input_tokens,
    cache_creation_input_tokens,
    cost.toFixed(4),
    model || SONNET,
  ].join('\t') + '\n';

  if (!existsSync(LOG_FILE)) writeFileSync(LOG_FILE, HEADER);
  appendFileSync(LOG_FILE, row);
  console.log(`[cost] Batch ${batchId}: $${cost.toFixed(4)} | in=${input_tokens} out=${output_tokens} cache_read=${cache_read_input_tokens}`);
  return cost;
}

// ── Rolling 30-day total from log ────────────────────────────────
export function monthlySpend() {
  if (!existsSync(LOG_FILE)) return 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  let total = 0;
  for (const line of readFileSync(LOG_FILE, 'utf8').split('\n').slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const date = new Date(cols[0]);
    if (date >= cutoff) total += parseFloat(cols[7]) || 0;
  }
  return total;
}

// ── Standalone CLI usage ─────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Re-implement monthlySpend without require() for ESM
  const { readFileSync } = await import('fs');
  if (!existsSync(LOG_FILE)) {
    console.log('No cost log yet. Run a batch first.');
  } else {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    let total = 0;
    const rows = [];
    for (const line of readFileSync(LOG_FILE, 'utf8').split('\n').slice(1)) {
      if (!line.trim()) continue;
      const cols = line.split('\t');
      const date = new Date(cols[0]);
      const cost = parseFloat(cols[7]) || 0;
      if (date >= cutoff) total += cost;
      rows.push({ date: cols[0], batch: cols[1], requests: cols[2], cost: cost.toFixed(4) });
    }
    console.log('\n── Cost log (last 30 days) ─────────────────────────────\n');
    for (const r of rows.slice(-20)) {
      console.log(`  ${r.date}  ${r.batch.slice(0, 30).padEnd(30)}  ${r.requests.padStart(4)} requests  $${r.cost}`);
    }
    console.log(`\n  Rolling 30-day total: $${total.toFixed(2)}`);
  }
}
