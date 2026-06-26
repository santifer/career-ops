#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildJobFactsPayload,
  readJobFactsCache,
  writeJobFactsCache,
} from './evaluation-cache.mjs';

let passed = 0;
let failed = 0;

function pass(message) {
  console.log(`PASS ${message}`);
  passed++;
}

function fail(message) {
  console.error(`FAIL ${message}`);
  failed++;
}

function assert(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

const cacheDir = mkdtempSync(join(tmpdir(), 'career-ops-jobfacts-'));

try {
  const input = {
    postingId: '0',
    atsProvider: 'greenhouse',
    company: 'Example Inc',
    title: 'Senior AI Engineer',
    location: 'Remote',
    workMode: false,
    canonicalUrl: 'https://boards.greenhouse.io/example/jobs/0',
    contentHash: 'sha256:abc',
  };

  const payload = buildJobFactsPayload(input, {
    facts: { company: 'Example Inc', title: 'Senior AI Engineer' },
    retrievedAt: '2026-06-20T00:00:00.000Z',
  });

  writeJobFactsCache(payload, { cacheDir });

  const hit = readJobFactsCache(payload.cache_key, {
    cacheDir,
    now: new Date('2026-06-25T00:00:00.000Z'),
    maxAgeDays: 7,
  });
  assert(hit.status === 'hit', 'fresh cache entry is returned as a hit');
  assert(hit.payload.cache_key === payload.cache_key, 'cache hit returns the stored payload');

  const miss = readJobFactsCache('jobfacts_missing', {
    cacheDir,
    now: new Date('2026-06-25T00:00:00.000Z'),
    maxAgeDays: 7,
  });
  assert(miss.status === 'miss', 'missing cache key returns miss');

  const stale = readJobFactsCache(payload.cache_key, {
    cacheDir,
    now: new Date('2026-07-10T00:00:00.000Z'),
    maxAgeDays: 7,
  });
  assert(stale.status === 'stale', 'old cache entry returns stale');

  const invalid = buildJobFactsPayload(input, {
    facts: { candidate_email: 'person@example.com' },
    retrievedAt: '2026-06-20T00:00:00.000Z',
  });
  const invalidWrite = writeJobFactsCache(invalid, { cacheDir });
  assert(invalidWrite.status === 'rejected', 'candidate-bearing payload is rejected before writing');

  const updateSystem = readFileSync('update-system.mjs', 'utf-8');
  assert(updateSystem.includes("'evaluation-cache.mjs'"), 'evaluation-cache.mjs is registered in SYSTEM_PATHS');
  assert(updateSystem.includes("'evaluation-cache-tests.mjs'"), 'evaluation-cache-tests.mjs is registered in SYSTEM_PATHS');

  const geminiEval = readFileSync('gemini-eval.mjs', 'utf-8');
  assert(geminiEval.includes('readJobFactsCache'), 'gemini-eval checks the job-facts cache before evaluation');
  assert(geminiEval.includes('writeJobFactsCache'), 'gemini-eval writes reusable job facts after evaluation');
} finally {
  rmSync(cacheDir, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
}

console.log(`\n${passed} passed, ${failed} failed`);
