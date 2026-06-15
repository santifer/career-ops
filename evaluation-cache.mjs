#!/usr/bin/env node

import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

export const JOB_FACTS_SCHEMA_VERSION = 'evaluation-job-facts/v1';

export const FORBIDDEN_CANDIDATE_FIELDS = [
  'candidate',
  'candidateName',
  'cv',
  'resume',
  'profile',
  'fitScore',
  'score',
  'gaps',
  'mitigation',
  'applyDecision',
  'overrideReason',
  'compensationFloor',
  'currentSalary',
  'targetSalary',
  'trackerStatus',
  'interviewNotes',
  'followUpHistory',
];

function normalizePart(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeFieldName(value) {
  return String(value ?? '').replace(/[_\-\s]+/g, '').toLowerCase();
}

const FORBIDDEN_FIELD_NAMES = new Set(FORBIDDEN_CANDIDATE_FIELDS.map(normalizeFieldName));

export function computeJobFactsKey(input = {}) {
  const parts = [
    JOB_FACTS_SCHEMA_VERSION,
    input.postingId,
    input.atsProvider,
    input.company,
    input.title,
    input.location,
    input.workMode,
    input.canonicalUrl || input.sourceUrl,
    input.retrieved_at || input.retrievedAt,
    input.contentHash,
  ].map(normalizePart);
  return `jobfacts_${createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 24)}`;
}

export function containsForbiddenCandidateField(payload = {}) {
  const stack = [payload];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    for (const [key, value] of Object.entries(current)) {
      if (FORBIDDEN_FIELD_NAMES.has(normalizeFieldName(key))) return true;
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return false;
}

export function hasReusableJobFacts(payload = {}) {
  return payload.schema_version === JOB_FACTS_SCHEMA_VERSION &&
    Boolean(payload.listing_fingerprint || payload.cache_key) &&
    !containsForbiddenCandidateField(payload);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2];
  if (!file || !existsSync(file)) {
    console.error('Usage: node evaluation-cache.mjs <job-facts.json>');
    process.exit(2);
  }
  let payload;
  try {
    payload = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`Could not read or parse job facts payload: ${error.message}`);
    process.exit(1);
  }
  if (!hasReusableJobFacts(payload)) {
    console.error('Job facts payload is not reusable.');
    process.exit(1);
  }
  console.log(payload.cache_key || computeJobFactsKey(payload));
}
