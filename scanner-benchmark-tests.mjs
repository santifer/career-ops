#!/usr/bin/env node

import { readFileSync } from 'fs';
import { scoreScannerBenchmark } from './scanner-benchmark.mjs';

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

function assertEqual(actual, expected, message) {
  if (Object.is(actual, expected)) pass(message);
  else fail(`${message}: expected ${expected}, got ${actual}`);
}

const result = scoreScannerBenchmark({
  name: 'metric-coverage',
  expected: [
    {
      id: 'expected-1',
      company: 'Example Inc',
      title: 'Senior AI Engineer',
      location: 'Berlin',
      compensation_expected: true,
    },
    {
      id: 'expected-2',
      company: 'Acme Labs',
      title: 'Applied ML Engineer',
      location: 'Remote',
      compensation_expected: false,
    },
  ],
  actual: [
    {
      provider: 'greenhouse',
      company: 'Example Inc',
      title: 'Senior AI Engineer',
      location: 'Berlin',
      fresh: true,
      compensation: { min: 120000, max: 160000, currency: 'EUR' },
    },
    {
      provider: 'lever',
      company: 'Acme Labs',
      title: 'Applied ML Engineer',
      location: 'Paris',
      fresh: true,
    },
    {
      provider: 'workday',
      company: 'Old Corp',
      title: 'Frontend Intern',
      location: 'Paris',
      fresh: false,
    },
    {
      provider: 'greenhouse',
      company: 'Example Inc',
      title: 'Senior AI Engineer',
      location: 'Berlin',
      fresh: true,
      compensation: { min: 120000, max: 160000, currency: 'EUR' },
    },
  ],
  provider_results: [
    { provider: 'greenhouse', status: 'ok' },
    { provider: 'lever', status: 'timeout' },
    { provider: 'workday', status: 'error' },
  ],
});

assertEqual(result.coverage, 1, 'coverage matches expected postings by identity');
assertEqual(result.freshness, 0.75, 'freshness counts non-stale actual postings');
assertEqual(result.noise, 0.25, 'noise counts unmatched actual postings');
assertEqual(result.duplicate_rate, 0.25, 'duplicate_rate counts repeated normalized postings');
assertEqual(result.location_accuracy, 0.5, 'location_accuracy scores matched postings with correct locations');
assertEqual(result.compensation_extraction, 1, 'compensation_extraction scores required compensation matches');
assertEqual(result.provider_failure_rate, 2 / 3, 'provider_failure_rate scores failed provider runs');
assertEqual(result.timeout_rate, 1 / 3, 'timeout_rate scores timeout provider runs');

const docs = readFileSync('docs/scanner-benchmark.md', 'utf-8');
for (const metric of ['location_accuracy', 'compensation_extraction', 'provider_failure_rate', 'timeout_rate']) {
  if (docs.includes(metric)) pass(`docs mention ${metric}`);
  else fail(`docs missing ${metric}`);
}

const updateSystem = readFileSync('update-system.mjs', 'utf-8');
if (updateSystem.includes("'scanner-benchmark.mjs'")) pass('scanner-benchmark.mjs is registered in SYSTEM_PATHS');
else fail('scanner-benchmark.mjs missing from SYSTEM_PATHS');
if (updateSystem.includes("'scanner-benchmark-tests.mjs'")) pass('scanner-benchmark-tests.mjs is registered in SYSTEM_PATHS');
else fail('scanner-benchmark-tests.mjs missing from SYSTEM_PATHS');

if (failed > 0) {
  console.error(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
}

console.log(`\n${passed} passed, ${failed} failed`);
