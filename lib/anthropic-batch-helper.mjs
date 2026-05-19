/**
 * lib/anthropic-batch-helper.mjs — Anthropic Batch API wrapper.
 *
 * Design source: refresh-master Phase 2 deliverable 6. Non-urgent Tier B/C
 * Layer 2 refreshes can be submitted via the Batch API for a 50% cost
 * reduction with a 24h SLA (per Anthropic Batch API documentation).
 *
 * Verified API behavior (Anthropic Batch API public docs as of 2026-05-19):
 *   - POST https://api.anthropic.com/v1/messages/batches
 *   - Body: { requests: [{ custom_id, params: {model, max_tokens, messages, system?, ...} }] }
 *   - Response: { id, processing_status, request_counts, ... }
 *   - GET https://api.anthropic.com/v1/messages/batches/<id> → status poll
 *   - GET https://api.anthropic.com/v1/messages/batches/<id>/results → JSONL stream
 *   - Auth: `x-api-key: <KEY>` + `anthropic-version: 2023-06-01` +
 *     `anthropic-beta: message-batches-2024-09-24` (verify still required)
 *
 * Stored batch state: data/batch/anthropic-batches.json — { batchId → { custom_ids, submitted_at, status, results? } }
 *
 * Usage:
 *   const batchId = await submitBatch([{custom_id: 'tox:openai', params: {...}}, ...]);
 *   // ... later poll
 *   const status = await pollBatch(batchId);
 *   if (status === 'ended') { const results = await fetchBatchResults(batchId); }
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const BATCH_STATE_PATH = join(REPO_ROOT, 'data', 'batch', 'anthropic-batches.json');

const BATCH_ENDPOINT = 'https://api.anthropic.com/v1/messages/batches';

function readState() {
  if (!existsSync(BATCH_STATE_PATH)) return { batches: {} };
  try { return JSON.parse(readFileSync(BATCH_STATE_PATH, 'utf8')); } catch { return { batches: {} }; }
}

function writeState(state) {
  mkdirSync(dirname(BATCH_STATE_PATH), { recursive: true });
  writeFileSync(BATCH_STATE_PATH, JSON.stringify(state, null, 2));
}

/**
 * Submit a batch of message requests.
 * @param {Array<{custom_id: string, params: object}>} requests
 * @returns {Promise<{ok, batchId, requestCount}>}
 */
export async function submitBatch(requests) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'NEEDS_HUMAN: ANTHROPIC_API_KEY not set' };
  if (!Array.isArray(requests) || requests.length === 0) {
    return { ok: false, error: 'submitBatch: requests array required' };
  }

  let r;
  try {
    r = await fetch(BATCH_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'message-batches-2024-09-24',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });
  } catch (e) {
    return { ok: false, error: `Batch submit fetch error: ${e.message}` };
  }

  if (!r.ok) {
    const txt = (await r.text()).slice(0, 480);
    return { ok: false, error: `Batch submit HTTP ${r.status}: ${txt}` };
  }

  const j = await r.json();
  const state = readState();
  state.batches[j.id] = {
    submitted_at: new Date().toISOString(),
    request_count: requests.length,
    custom_ids: requests.map(r => r.custom_id),
    status: j.processing_status || 'in_progress',
    last_polled_at: null,
  };
  writeState(state);
  return { ok: true, batchId: j.id, requestCount: requests.length, status: j.processing_status };
}

export async function pollBatch(batchId) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'NEEDS_HUMAN: ANTHROPIC_API_KEY not set' };
  let r;
  try {
    r = await fetch(`${BATCH_ENDPOINT}/${batchId}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'message-batches-2024-09-24',
      },
    });
  } catch (e) {
    return { ok: false, error: `pollBatch fetch error: ${e.message}` };
  }
  if (!r.ok) {
    return { ok: false, error: `pollBatch HTTP ${r.status}` };
  }
  const j = await r.json();
  const state = readState();
  if (state.batches[batchId]) {
    state.batches[batchId].status = j.processing_status;
    state.batches[batchId].request_counts = j.request_counts;
    state.batches[batchId].last_polled_at = new Date().toISOString();
    writeState(state);
  }
  return { ok: true, status: j.processing_status, requestCounts: j.request_counts, ended_at: j.ended_at };
}

export async function fetchBatchResults(batchId) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'NEEDS_HUMAN: ANTHROPIC_API_KEY not set' };
  let r;
  try {
    r = await fetch(`${BATCH_ENDPOINT}/${batchId}/results`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'message-batches-2024-09-24',
      },
    });
  } catch (e) {
    return { ok: false, error: `fetchBatchResults fetch error: ${e.message}` };
  }
  if (!r.ok) {
    return { ok: false, error: `fetchBatchResults HTTP ${r.status}` };
  }
  const text = await r.text();
  const lines = text.trim().split('\n').filter(Boolean);
  const results = [];
  for (const line of lines) {
    try { results.push(JSON.parse(line)); } catch (e) { /* skip */ }
  }
  const state = readState();
  if (state.batches[batchId]) {
    state.batches[batchId].results = results;
    state.batches[batchId].results_fetched_at = new Date().toISOString();
    writeState(state);
  }
  return { ok: true, results };
}

/**
 * Build a single Batch API request from a Phase 1.5 anthropic-sonnet
 * adapter-style call (so callers can submit existing refresh calls to Batch
 * with minimal refactoring).
 */
export function buildBatchRequest({ customId, systemPrompt, stableCorpus, varyingPrompt, model = 'claude-sonnet-4-6', maxTokens = 3000 }) {
  const stable = (stableCorpus || '').trim();
  const shouldCache = stable.length >= 1024 * 3.5;
  const params = {
    model,
    max_tokens: maxTokens,
  };
  if (systemPrompt) {
    params.system = shouldCache
      ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
      : systemPrompt;
  }
  if (shouldCache) {
    params.messages = [{
      role: 'user',
      content: [
        { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: varyingPrompt },
      ],
    }];
  } else {
    params.messages = [{
      role: 'user',
      content: stable ? `${stable}\n\n${varyingPrompt}` : varyingPrompt,
    }];
  }
  return { custom_id: customId, params };
}
