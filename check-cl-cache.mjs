#!/usr/bin/env node
/**
 * check-cl-cache.mjs — Kaizen #3
 *
 * Given a company name (and optional max-age days), reports whether a current
 * cover letter already exists in output/. Lets the cloud 6am agent skip CL
 * generation when a fresh one is already on disk for the Win bat to consume.
 *
 * Why: yesterday and today the cloud agent generated CLs that were never used
 * (sandbox can't AutoSubmit). The Win bat does the actual submission and it
 * picks the most recent CL from output/ matching the company-slug. So if a
 * fresh CL is already there, the cloud agent should NOT regenerate.
 *
 * Usage:
 *   node check-cl-cache.mjs --company "Capital Rx" [--max-age-days 14]
 *
 * Output (JSON, one-line):
 *   {"company":"Capital Rx","slug":"capital-rx","exists":true,"path":"output/cl_capital-rx_senior-scrum-master_2026-05-06.txt","age_days":3,"verdict":"reuse|generate|stale"}
 *
 * Verdict:
 *   "reuse"     → fresh CL on disk, skip generation
 *   "generate"  → no CL at all, generate fresh
 *   "stale"     → CL exists but older than --max-age-days, regenerate
 */

import { readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'output');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    out[key] = argv[i + 1];
    i++;
  }
  return out;
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Strip non-alphanumeric for tolerant matching. Handles legacy filenames where
// "Capital Rx" was saved as "capitalrx" (no hyphen) and new code slugs it as
// "capital-rx" (hyphenated). Comparing the stripped form on both sides matches.
function alphaOnly(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const args        = parseArgs(process.argv.slice(2));
const company     = args['company'] || '';
const maxAgeDays  = parseInt(args['max-age-days'] || '14', 10);

if (!company) {
  console.error('Usage: node check-cl-cache.mjs --company "Name" [--max-age-days 14]');
  process.exit(1);
}

const slug = slugify(company);

if (!existsSync(OUTPUT_DIR)) {
  console.log(JSON.stringify({
    company, slug, exists: false, path: null, age_days: null, verdict: 'generate',
  }));
  process.exit(0);
}

// Find most recent CL matching the slug. Filename convention:
// cl_<company-slug>_<role-slug>_<YYYY-MM-DD>.txt
// Match using alphaOnly() on both sides so "capital-rx" finds legacy "capitalrx"
// filenames (and vice versa).
const slugStripped = alphaOnly(slug);
const matches = readdirSync(OUTPUT_DIR)
  .filter(f => f.endsWith('.txt') && f.startsWith('cl_'))
  .filter(f => {
    // Extract the company-slug portion: between "cl_" and the next "_"
    const m = f.match(/^cl_([^_]+)_/);
    if (!m) return false;
    return alphaOnly(m[1]) === slugStripped;
  })
  .map(f => {
    const full = join(OUTPUT_DIR, f);
    return { name: f, path: full, mtime: statSync(full).mtime.getTime() };
  })
  .sort((a, b) => b.mtime - a.mtime);

if (matches.length === 0) {
  console.log(JSON.stringify({
    company, slug, exists: false, path: null, age_days: null, verdict: 'generate',
  }));
  process.exit(0);
}

const newest    = matches[0];
const ageDays   = Math.round((Date.now() - newest.mtime) / 86_400_000 * 10) / 10;
const relPath   = newest.path.replace(__dirname + '/', '').replace(__dirname + '\\', '');
const verdict   = ageDays <= maxAgeDays ? 'reuse' : 'stale';

console.log(JSON.stringify({
  company, slug,
  exists: true,
  path: relPath,
  age_days: ageDays,
  verdict,
}));
process.exit(0);
