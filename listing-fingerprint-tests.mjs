#!/usr/bin/env node

import { readFileSync } from 'fs';
import { computeListingFingerprint } from './listing-fingerprint.mjs';

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

const snakeCase = computeListingFingerprint({
  ats_provider: 'greenhouse',
  board_slug: 'example',
  posting_id: 0,
  company: 'Example Inc',
  title: 'Senior AI Engineer',
  location: 'Remote',
  work_mode: false,
  canonical_url: 'https://boards.greenhouse.io/example/jobs/0',
  content_hash: 'sha256:abc',
});

const camelCase = computeListingFingerprint({
  atsProvider: 'greenhouse',
  boardSlug: 'example',
  postingId: 0,
  company: 'Example Inc',
  title: 'Senior AI Engineer',
  location: 'Remote',
  workMode: false,
  canonicalUrl: 'https://boards.greenhouse.io/example/jobs/0',
  contentHash: 'sha256:abc',
});

assert(snakeCase === camelCase, 'snake_case and camelCase inputs produce the same fingerprint');

const blankPosting = computeListingFingerprint({
  ats_provider: 'greenhouse',
  board_slug: 'example',
  posting_id: '',
  company: 'Example Inc',
  title: 'Senior AI Engineer',
  location: 'Remote',
  work_mode: false,
  canonical_url: 'https://boards.greenhouse.io/example/jobs/0',
  content_hash: 'sha256:abc',
});
assert(snakeCase !== blankPosting, 'posting_id 0 is preserved instead of collapsing to blank');

const slashPath = computeListingFingerprint({
  company: 'Example Inc',
  title: 'Senior AI Engineer',
  canonical_host: 'jobs.example.com',
  canonical_path: '/roles/123/',
});
const noSlashPath = computeListingFingerprint({
  company: 'Example Inc',
  title: 'Senior AI Engineer',
  source_url: 'https://jobs.example.com/roles/123',
});
assert(slashPath === noSlashPath, 'direct canonical_path and parsed URL path normalize trailing slashes consistently');

const brandedUrl = computeListingFingerprint({
  ats_provider: 'greenhouse',
  board_slug: 'example',
  posting_id: '12345',
  company: 'Example Inc',
  title: 'Senior AI Engineer',
  source_url: 'https://example.com/careers/senior-ai-engineer',
});
const atsUrl = computeListingFingerprint({
  ats_provider: 'greenhouse',
  board_slug: 'example',
  posting_id: '12345',
  company: 'Example Inc',
  title: 'Senior AI Engineer',
  canonical_url: 'https://boards.greenhouse.io/example/jobs/12345',
});
assert(brandedUrl === atsUrl, 'ATS provider + board_slug + posting_id collapse branded and ATS URL aliases');

const brandedOnly = computeListingFingerprint({
  company: 'Example Inc',
  title: 'Senior AI Engineer',
  source_url: 'https://example.com/careers/senior-ai-engineer',
});
const atsOnly = computeListingFingerprint({
  company: 'Example Inc',
  title: 'Senior AI Engineer',
  source_url: 'https://boards.greenhouse.io/example/jobs/12345',
});
assert(brandedOnly !== atsOnly, 'URL host/path still distinguish listings without a stable ATS identity');

const docs = readFileSync('docs/listing-fingerprint.md', 'utf-8');
for (const text of [
  'Canonical v1 Input Set',
  'ATS identity wins over URL aliases',
  'Do not include candidate data',
]) {
  assert(docs.includes(text), `docs include ${text}`);
}

const updateSystem = readFileSync('update-system.mjs', 'utf-8');
assert(updateSystem.includes("'listing-fingerprint.mjs'"), 'listing-fingerprint.mjs is registered in SYSTEM_PATHS');
assert(updateSystem.includes("'listing-fingerprint-tests.mjs'"), 'listing-fingerprint-tests.mjs is registered in SYSTEM_PATHS');

if (failed > 0) {
  console.error(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
}

console.log(`\n${passed} passed, ${failed} failed`);
