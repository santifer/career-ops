#!/usr/bin/env node

import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

export const LISTING_FINGERPRINT_SCHEMA_VERSION = 'listing-fingerprint/v1';

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}:/.-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(input, camelCase, snakeCase) {
  return input[camelCase] ?? input[snakeCase];
}

function normalizePath(path) {
  if (!path) return '';
  return String(path).replace(/\/+$/, '') || '/';
}

function hasValue(value) {
  return normalize(value) !== '';
}

export function normalizeUrlParts(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    return {
      canonicalHost: parsed.hostname.toLowerCase(),
      canonicalPath: normalizePath(parsed.pathname),
    };
  } catch {
    return { canonicalHost: '', canonicalPath: '' };
  }
}

export function computeListingFingerprint(input = {}) {
  const canonicalUrl = pick(input, 'canonicalUrl', 'canonical_url');
  const sourceUrl = pick(input, 'sourceUrl', 'source_url');
  const urlParts = normalizeUrlParts(canonicalUrl || sourceUrl || '');
  const canonicalPath = pick(input, 'canonicalPath', 'canonical_path');
  const atsProvider = pick(input, 'atsProvider', 'ats_provider');
  const boardSlug = pick(input, 'boardSlug', 'board_slug');
  const postingId = pick(input, 'postingId', 'posting_id');
  const hasStableAtsIdentity = hasValue(atsProvider) && hasValue(boardSlug) && hasValue(postingId);
  const fields = [
    LISTING_FINGERPRINT_SCHEMA_VERSION,
    atsProvider,
    boardSlug,
    postingId,
    input.company,
    input.title,
    input.location,
    pick(input, 'workMode', 'work_mode'),
    hasStableAtsIdentity ? '' : (pick(input, 'canonicalHost', 'canonical_host') || urlParts.canonicalHost),
    hasStableAtsIdentity ? '' : (normalizePath(canonicalPath) || urlParts.canonicalPath),
    pick(input, 'contentHash', 'content_hash'),
  ].map(normalize);
  const digest = createHash('sha256').update(fields.join('\n')).digest('hex').slice(0, 32);
  return `fp_v1_${digest}`;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  let input;
  try {
    input = JSON.parse(process.argv[2] || '{}');
  } catch {
    console.error('Input must be valid JSON.');
    process.exit(1);
  }
  console.log(computeListingFingerprint(input));
}
