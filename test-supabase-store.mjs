#!/usr/bin/env node
/**
 * Real Supabase round-trip test for queue-store.
 *
 * Requires:
 *   RUN_SUPABASE_INTEGRATION=1
 *   SUPABASE_URL
 *   SUPABASE_DASHBOARD_KEY
 *
 * Intended for a local Supabase project (`supabase start`) or a disposable
 * test project after supabase/migrations/202606060001_queue_store.sql is run.
 */

import assert from 'assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'fs';

import { createSupabaseClient, isSupabaseConfigured } from './supabase-client.mjs';
import {
  LOCAL_ENRICHMENTS_PATH,
  loadQueue,
  saveQueue,
  setStatus,
} from './queue-store.mjs';

if (process.env.RUN_SUPABASE_INTEGRATION !== '1') {
  console.log('SKIP: set RUN_SUPABASE_INTEGRATION=1 with SUPABASE_URL and SUPABASE_DASHBOARD_KEY to run the DB round-trip test.');
  process.exit(0);
}

if (!isSupabaseConfigured('dashboard')) {
  throw new Error('SUPABASE_URL and SUPABASE_DASHBOARD_KEY are required');
}

function cleanupSidecar(roleId) {
  if (!existsSync(LOCAL_ENRICHMENTS_PATH)) return;
  const sidecar = JSON.parse(readFileSync(LOCAL_ENRICHMENTS_PATH, 'utf-8'));
  if (sidecar.roles) delete sidecar.roles[roleId];
  else delete sidecar[roleId];
  writeFileSync(LOCAL_ENRICHMENTS_PATH, JSON.stringify(sidecar, null, 2) + '\n', 'utf-8');
}

const client = createSupabaseClient('dashboard');
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const id = `custom:test-${suffix}`;
const url = `https://example.invalid/career-ops-test/${suffix}`;

try {
  const queue = loadQueue();
  queue.roles.push({
    id,
    company: 'Career Ops Test',
    title: 'Supabase Round Trip',
    url,
    ats: 'custom',
    source: 'manual',
    location: 'Test',
    jd_path: 'jds/test.md',
    status: 'scored',
    score: 4.2,
    score_raw: 4.2,
    size_bucket: 'unknown',
    eligibility: 'ok',
    employment_type: 'full-time',
    confidence: 'high',
    flags: ['integration-test'],
    free_text_fields: [],
    reason: 'LOCAL ONLY: candidate-specific test reason',
    visa_answer: 'LOCAL ONLY: test visa answer',
    drafts: { email: { answer: 'local-only@example.invalid' } },
    unknown_future_field: 'LOCAL ONLY BY DEFAULT',
  });
  saveQueue(queue);

  const reloaded = loadQueue();
  const role = reloaded.roles.find((r) => r.id === id);
  assert.ok(role, 'role reloads from Supabase + sidecar');
  assert.equal(role.reason, 'LOCAL ONLY: candidate-specific test reason');
  assert.equal(role.unknown_future_field, 'LOCAL ONLY BY DEFAULT');

  const cloudRows = client.selectSync('active_roles', {
    select: '*',
    query: { id: `eq.${id}` },
  });
  assert.equal(cloudRows.length, 1, 'cloud active row exists');
  assert.equal(cloudRows[0].source, 'manual');
  assert.equal(Object.hasOwn(cloudRows[0], 'reason'), false, 'reason is not a cloud column');
  assert.equal(Object.hasOwn(cloudRows[0], 'drafts'), false, 'drafts are not cloud columns');
  assert.equal(Object.hasOwn(cloudRows[0], 'unknown_future_field'), false, 'new fields default local-only');

  setStatus(reloaded, id, 'skipped');
  saveQueue(reloaded);

  const afterDecision = loadQueue();
  assert.equal(afterDecision.roles.some((r) => r.id === id), false, 'terminal role leaves active queue');

  const seenRows = client.selectSync('seen_urls', {
    select: '*',
    query: { url: `eq.${url}` },
  });
  assert.equal(seenRows.length, 1, 'terminal role is inserted into seen_urls');
  assert.equal(seenRows[0].final_status, 'skipped');

  client.requestSync('DELETE', 'seen_urls', {
    query: { url: `eq.${url}` },
    headers: { Prefer: 'return=minimal' },
  });
  cleanupSidecar(id);
  console.log('PASS: Supabase queue-store round trip');
} catch (err) {
  try {
    client.requestSync('DELETE', 'active_roles', {
      query: { id: `eq.${id}` },
      headers: { Prefer: 'return=minimal' },
    });
    client.requestSync('DELETE', 'seen_urls', {
      query: { url: `eq.${url}` },
      headers: { Prefer: 'return=minimal' },
    });
    cleanupSidecar(id);
  } catch {}
  throw err;
}
