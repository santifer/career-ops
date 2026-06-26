#!/usr/bin/env node

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

export const JOB_FACTS_SCHEMA_VERSION = 'evaluation-job-facts/v1';
export const DEFAULT_JOB_FACTS_MAX_AGE_DAYS = 14;

export const FORBIDDEN_CANDIDATE_FIELDS = [
  'candidate',
  'candidateName',
  'candidateEmail',
  'candidatePhone',
  'cv',
  'email',
  'phone',
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

export function contentHash(value) {
  return `sha256:${createHash('sha256').update(String(value ?? '')).digest('hex')}`;
}

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

export function buildJobFactsPayload(input = {}, options = {}) {
  const retrievedAt = options.retrievedAt || new Date().toISOString();
  const cacheKeyInput = { ...input, retrieved_at: undefined, retrievedAt: undefined };
  const cacheKey = input.cache_key || input.cacheKey || computeJobFactsKey(cacheKeyInput);
  const facts = options.facts && typeof options.facts === 'object' ? options.facts : {};

  return {
    schema_version: JOB_FACTS_SCHEMA_VERSION,
    cache_key: cacheKey,
    listing_fingerprint: input.listing_fingerprint || input.listingFingerprint || '',
    source_url: input.source_url || input.sourceUrl || '',
    canonical_url: input.canonical_url || input.canonicalUrl || '',
    retrieved_at: retrievedAt,
    content_hash: input.content_hash || input.contentHash || '',
    facts,
  };
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

export function jobFactsCachePath(cacheDir, cacheKey) {
  if (!/^jobfacts_[a-f0-9]{24}$/i.test(String(cacheKey || ''))) return null;
  return join(cacheDir, `${cacheKey}.json`);
}

function ageDays(payload, now) {
  const retrievedAt = Date.parse(payload.retrieved_at || payload.retrievedAt || '');
  if (!Number.isFinite(retrievedAt)) return Infinity;
  return Math.max(0, (now.getTime() - retrievedAt) / 86_400_000);
}

export function readJobFactsCache(cacheKey, options = {}) {
  const cacheDir = options.cacheDir || join('data', 'cache', 'job-facts');
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_JOB_FACTS_MAX_AGE_DAYS;
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const path = jobFactsCachePath(cacheDir, cacheKey);
  if (!path) return { status: 'miss', reason: 'invalid_key' };
  if (!existsSync(path)) return { status: 'miss', reason: 'not_found' };

  let payload;
  try {
    payload = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { status: 'miss', reason: 'unreadable', error: error.message };
  }

  if (!hasReusableJobFacts(payload)) {
    return { status: 'miss', reason: 'not_reusable', payload };
  }

  const currentAgeDays = ageDays(payload, now);
  if (Number.isFinite(maxAgeDays) && currentAgeDays > maxAgeDays) {
    return { status: 'stale', reason: 'expired', ageDays: currentAgeDays, payload };
  }

  return { status: 'hit', ageDays: currentAgeDays, payload };
}

export function writeJobFactsCache(payload, options = {}) {
  if (!hasReusableJobFacts(payload)) {
    return { status: 'rejected', reason: 'not_reusable' };
  }
  const cacheDir = options.cacheDir || join('data', 'cache', 'job-facts');
  const path = jobFactsCachePath(cacheDir, payload.cache_key);
  if (!path) return { status: 'rejected', reason: 'invalid_key' };
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { status: 'written', path };
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
