#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function identityKey(job) {
  return [job.company, job.title].map(normalize).join('|');
}

function postingKey(job) {
  return [job.company, job.title, job.location].map(normalize).join('|');
}

function hasCompensation(job) {
  return Boolean(job?.compensation || job?.compensation_text || job?.salary || job?.salary_range);
}

function expectsCompensation(job) {
  return job?.compensation_expected === true || hasCompensation(job);
}

function providerStatus(result) {
  return normalize(result?.status || result?.result || result?.error || '');
}

export function scoreScannerBenchmark(fixture = {}) {
  const expected = Array.isArray(fixture.expected) ? fixture.expected : [];
  const actual = Array.isArray(fixture.actual) ? fixture.actual : [];
  const providerResults = Array.isArray(fixture.provider_results)
    ? fixture.provider_results
    : (Array.isArray(fixture.providerResults) ? fixture.providerResults : []);

  const expectedByIdentity = new Map(expected.map((item) => [identityKey(item), item]));
  const expectedKeys = new Set(expectedByIdentity.keys());
  const actualIdentityKeys = actual.map(identityKey);
  const actualPostingKeys = actual.map(postingKey);
  const uniqueActualPostingKeys = new Set(actualPostingKeys);
  const matched = new Set(actualIdentityKeys.filter((item) => expectedKeys.has(item)));
  const noise = actualIdentityKeys.filter((item) => !expectedKeys.has(item)).length;
  const fresh = actual.filter((item) => item.fresh !== false).length;
  const duplicates = actual.length - uniqueActualPostingKeys.size;
  const locationCorrect = Array.from(matched).filter((matchedKey) => {
    const expectedItem = expectedByIdentity.get(matchedKey);
    return actual.some((item) =>
      identityKey(item) === matchedKey &&
      normalize(item.location) === normalize(expectedItem.location)
    );
  }).length;
  const compensationExpected = expected.filter(expectsCompensation);
  const compensationFound = compensationExpected.filter((expectedItem) =>
    actual.some((item) => identityKey(item) === identityKey(expectedItem) && hasCompensation(item))
  ).length;
  const failedProviders = providerResults.filter((item) => {
    const status = providerStatus(item);
    return status && !['ok', 'success', 'passed'].includes(status);
  }).length;
  const timedOutProviders = providerResults.filter((item) => providerStatus(item).includes('timeout')).length;

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
    location_accuracy: matched.size ? locationCorrect / matched.size : 0,
    compensation_extraction: compensationExpected.length ? compensationFound / compensationExpected.length : 0,
    provider_failure_rate: providerResults.length ? failedProviders / providerResults.length : 0,
    timeout_rate: providerResults.length ? timedOutProviders / providerResults.length : 0,
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
