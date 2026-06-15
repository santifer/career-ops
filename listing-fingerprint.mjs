#!/usr/bin/env node

import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

export const LISTING_FINGERPRINT_SCHEMA_VERSION = 'listing-fingerprint/v1';

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}:/.-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeUrlParts(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    return {
      canonicalHost: parsed.hostname.toLowerCase(),
      canonicalPath: parsed.pathname.replace(/\/+$/, '') || '/',
    };
  } catch {
    return { canonicalHost: '', canonicalPath: '' };
  }
}

export function computeListingFingerprint(input = {}) {
  const urlParts = normalizeUrlParts(input.canonicalUrl || input.sourceUrl || '');
  const fields = [
    LISTING_FINGERPRINT_SCHEMA_VERSION,
    input.atsProvider,
    input.boardSlug,
    input.postingId,
    input.company,
    input.title,
    input.location,
    input.workMode,
    input.canonicalHost || urlParts.canonicalHost,
    input.canonicalPath || urlParts.canonicalPath,
    input.contentHash,
  ].map(normalize);
  const digest = createHash('sha256').update(fields.join('\n')).digest('hex').slice(0, 32);
  return `fp_v1_${digest}`;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const input = JSON.parse(process.argv[2] || '{}');
  console.log(computeListingFingerprint(input));
}
