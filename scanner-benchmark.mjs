#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function key(job) {
  return [job.company, job.title, job.location].map(normalize).join('|');
}

export function scoreScannerBenchmark(fixture = {}) {
  const expected = Array.isArray(fixture.expected) ? fixture.expected : [];
  const actual = Array.isArray(fixture.actual) ? fixture.actual : [];
  const expectedKeys = new Set(expected.map(key));
  const actualKeys = actual.map(key);
  const uniqueActualKeys = new Set(actualKeys);
  const matched = new Set(actualKeys.filter((item) => expectedKeys.has(item)));
  const noise = actualKeys.filter((item) => !expectedKeys.has(item)).length;
  const fresh = actual.filter((item) => item.fresh !== false).length;
  const duplicates = actual.length - uniqueActualKeys.size;

  return {
    schema_version: 'career-ops.scanner-benchmark-result/v1',
    fixture: fixture.name || 'unnamed',
    expected: expected.length,
    actual: actual.length,
    matched: matched.size,
    coverage: expected.length ? matched.size / expected.length : 0,
    freshness: actual.length ? fresh / actual.length : 0,
    noise: actual.length ? noise / actual.length : 0,
    duplicate_rate: actual.length ? duplicates / actual.length : 0,
  };
}

export function loadFixture(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to load benchmark fixture "${file}": ${error.message}`);
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2] || 'fixtures/scanner-benchmark/core-ai-roles.json';
  let fixture;
  try {
    fixture = loadFixture(file);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(JSON.stringify(scoreScannerBenchmark(fixture), null, 2));
}
