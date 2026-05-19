#!/usr/bin/env node
/**
 * scripts/network-dedup-verify.mjs (ζ needhuman-resolution 2026-05-19)
 *
 * Complete dedup verification pass for the network-database system.
 * Validates canonical ID uniqueness, cross-source merges, email dedup,
 * and produces a machine-readable report.
 *
 * Decision ζ.4 (Mitchell 2026-05-19): "lets do a complete dedup pass"
 *
 * Three sources:
 *   1. data/linkedin/Connections.csv  — LinkedIn export (gitignored, disk only)
 *   2. data/contacts-enriched.json    — Hunter enrichment cache (gitignored, disk only)
 *   3. data/network-database.json     — Canonical aggregator output (gitignored, disk only)
 *
 * Canonical ID model (from build-network-database.mjs):
 *   stableId = slugify(first) + '-' + slugify(last) + '-' + sha1(normalizedCompany + '|' + linkedinUrl)[0..8]
 *
 * Dedup strategy:
 *   - Primary canonical key: LinkedIn URL (normalized, trimmed trailing slash)
 *   - Secondary key: normalized full name + normalized company (for rows without URL)
 *   - Email dedup: preserve HIGHEST confidence per email address across sources
 *     (high > medium > low)
 *
 * Output:
 *   - Prints report to stdout as JSON
 *   - Archives current DB to data/network-pre-dedup-archive-YYYY-MM-DD.json
 *     (gitignored — reversal file, disk only, NOT committed)
 *   - If --fix flag: runs build-network-database.mjs to rebuild canonical DB
 *     and outputs before/after counts
 *
 * Usage:
 *   node scripts/network-dedup-verify.mjs [--fix] [--verbose]
 */

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const argv = process.argv.slice(2);
const FIX     = argv.includes('--fix');
const VERBOSE = argv.includes('--verbose');

function log(...args) { if (VERBOSE) console.error('[dedup]', ...args); }

const PATHS = {
  csv:        join(ROOT, 'data/linkedin/Connections.csv'),
  enriched:   join(ROOT, 'data/contacts-enriched.json'),
  db:         join(ROOT, 'data/network-database.json'),
  archive:    join(ROOT, `data/network-pre-dedup-archive-${new Date().toISOString().slice(0,10)}.json`),
};

// ── Canonical normalization helpers (must match build-network-database.mjs) ──
const SUFFIX_RE = /[,]?\s*(?:inc\.?|incorporated|llc\.?|ltd\.?|limited|corp\.?|corporation|co\.?|company|gmbh|s\.?a\.?|sas|plc|s\.?r\.?l\.?|holdings?|group|labs?|technologies|technology)\.?\s*$/i;
const PAREN_TAIL_RE = /\s*\([^)]*\)\s*$/;

function normalizeCompany(name) {
  if (!name) return '';
  let n = String(name).toLowerCase().trim();
  n = n.replace(PAREN_TAIL_RE, '');
  n = n.replace(/\s+/g, ' ');
  for (let i = 0; i < 3; i++) {
    const next = n.replace(SUFFIX_RE, '').replace(/[.,;]+$/, '').trim();
    if (next === n) break;
    n = next;
  }
  return n;
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeUrl(url) {
  return String(url || '').toLowerCase().replace(/\/*$/, '').trim();
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function stableId({ first, last, company, linkedinUrl }) {
  const base = `${slugify(first)}-${slugify(last)}`;
  const hashInput = [normalizeCompany(company), (linkedinUrl || '').toLowerCase()].join('|');
  const hash = crypto.createHash('sha1').update(hashInput).digest('hex').slice(0, 8);
  return `${base}-${hash}`;
}

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };
function higherConfidence(a, b) {
  return (CONFIDENCE_RANK[a] || 0) >= (CONFIDENCE_RANK[b] || 0) ? a : b;
}

// ── RFC-4180 CSV parser (matches build-network-database.mjs) ─────────────────
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else cur += c;
    } else {
      if (c === ',') { fields.push(cur); cur = ''; }
      else if (c === '"' && cur === '') { inQuotes = true; }
      else cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function readJsonSafe(p, fallback) {
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf-8')); }
  catch (e) { console.error(`parse error: ${p}:`, e.message); return fallback; }
}

// ── 1. Load CSV ──────────────────────────────────────────────────────────────
function loadCsv() {
  if (!existsSync(PATHS.csv)) return { rows: [], present: false };
  const raw = readFileSync(PATHS.csv, 'utf-8');
  const lines = raw.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < 10; i++) {
    if (/^\s*First Name\s*,/i.test(lines[i])) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return { rows: [], present: true, error: 'header not found' };
  const header = parseCsvLine(lines[headerIdx]).map(c => c.trim().toLowerCase());
  const col = {
    first:   header.indexOf('first name'),
    last:    header.indexOf('last name'),
    url:     header.indexOf('url'),
    email:   header.indexOf('email address'),
    company: header.indexOf('company'),
  };
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const f = parseCsvLine(line);
    const first = (f[col.first] || '').trim();
    const last  = (f[col.last]  || '').trim();
    if (!first && !last) continue;
    const url = (f[col.url] || '').trim();
    // Skip credential suffixes that appear in the URL column
    if (url && !/^https?:\/\//i.test(url)) continue;
    rows.push({
      first, last,
      url: url.toLowerCase().replace(/\/*$/, ''),
      email: (f[col.email] || '').trim(),
      company: (f[col.company] || '').trim(),
    });
  }
  return { rows, present: true };
}

// ── 2. Load contacts-enriched ─────────────────────────────────────────────────
function loadEnriched() {
  const data = readJsonSafe(PATHS.enriched, null);
  if (!data) return { entries: {}, present: false };
  const entries = data.entries || data;
  return { entries, present: true, count: Object.keys(entries).length };
}

// ── 3. Load canonical DB ──────────────────────────────────────────────────────
function loadDb() {
  const data = readJsonSafe(PATHS.db, null);
  if (!data) return { people: [], present: false };
  return { people: data.people || [], headline: data.headline, last_run: data.last_run, present: true };
}

// ── 4. Dedup analysis ────────────────────────────────────────────────────────
function runDedup(csv, enriched, db) {
  const findings = {
    csv_rows: csv.rows.length,
    enriched_entries: enriched.present ? enriched.count : 'N/A (not on disk)',
    db_people_before: db.people.length,

    // CSV self-dedup
    csv_same_name_different_url: [],    // different person (keep both)
    csv_same_url_different_name: [],    // true duplicate (remove one)
    csv_credential_suffix_rows: 0,      // rows with non-URL in URL column (already filtered)

    // DB ID collision
    db_id_collisions: 0,
    db_linkedin_url_collisions: 0,      // same URL → multiple IDs (true dup)
    db_same_name_different_ids: [],     // same name, different URLs → genuinely different people

    // Email dedup within DB
    db_email_dupes: 0,                  // same email address in multiple people.emails.professional
    db_email_confidence_upgrades: 0,    // emails with lower-confidence copy when higher exists

    // Cross-source
    enriched_merged_count: 0,
    enriched_unmatched: 0,

    // Verdict
    true_duplicate_count: 0,           // definitive same-person duplicates (same LinkedIn URL)
    action_required: false,
    recommendations: [],
  };

  // CSV: same name + different URL = different people (expected, keep both)
  const csvByName = new Map();
  for (const r of csv.rows) {
    const k = normalizeName(`${r.first} ${r.last}`);
    if (!csvByName.has(k)) csvByName.set(k, []);
    csvByName.get(k).push(r);
  }
  for (const [name, rows] of csvByName.entries()) {
    if (rows.length > 1) {
      const urls = rows.map(r => r.url).filter(Boolean);
      const uniqueUrls = new Set(urls);
      if (uniqueUrls.size === rows.length) {
        // All different URLs → different people
        findings.csv_same_name_different_url.push({ name, count: rows.length, urls });
      } else {
        // Same URL → true duplicate
        findings.true_duplicate_count += rows.length - 1;
        findings.csv_same_url_different_name.push({ name, count: rows.length, urls });
        findings.recommendations.push(`CSV: ${name} appears ${rows.length}× with same LinkedIn URL — remove duplicate rows`);
      }
    }
  }

  // CSV: URL-based dedup (definitive)
  const csvByUrl = new Map();
  for (const r of csv.rows) {
    if (!r.url) continue;
    if (!csvByUrl.has(r.url)) csvByUrl.set(r.url, []);
    csvByUrl.get(r.url).push(r);
  }
  for (const [url, rows] of csvByUrl.entries()) {
    if (rows.length > 1) {
      const names = [...new Set(rows.map(r => normalizeName(`${r.first} ${r.last}`)))];
      if (names.length > 1) {
        // Same URL, different names → data inconsistency
        findings.recommendations.push(`CSV URL ${url} has ${rows.length} rows with different names: ${names.join(', ')}`);
      }
    }
  }

  // DB: ID uniqueness
  const dbIds = db.people.map(p => p.id);
  const dbIdSet = new Set(dbIds);
  findings.db_id_collisions = dbIds.length - dbIdSet.size;

  // DB: LinkedIn URL uniqueness
  const dbByUrl = new Map();
  for (const p of db.people) {
    if (!p.linkedin_url) continue;
    const u = normalizeUrl(p.linkedin_url);
    if (!dbByUrl.has(u)) dbByUrl.set(u, []);
    dbByUrl.get(u).push(p);
  }
  for (const [url, people] of dbByUrl.entries()) {
    if (people.length > 1) {
      findings.db_linkedin_url_collisions++;
      findings.true_duplicate_count += people.length - 1;
      findings.recommendations.push(`DB: LinkedIn URL ${url} maps to ${people.length} distinct IDs — dedup required`);
    }
  }

  // DB: same name → different IDs (expected when different people share a name)
  const dbByName = new Map();
  for (const p of db.people) {
    const k = normalizeName(p.full_name);
    if (!dbByName.has(k)) dbByName.set(k, []);
    dbByName.get(k).push(p);
  }
  for (const [name, people] of dbByName.entries()) {
    if (people.length > 1) {
      const allDifferentUrls = people.every((p, i, arr) =>
        p.linkedin_url && arr.every((q, j) => i === j || normalizeUrl(p.linkedin_url) !== normalizeUrl(q.linkedin_url))
      );
      findings.db_same_name_different_ids.push({
        name,
        count: people.length,
        all_different_urls: allDifferentUrls,
        // only an issue if URLs are identical
        is_true_dup: !allDifferentUrls,
      });
    }
  }

  // DB: email address dedup within a single person's email list
  for (const p of db.people) {
    const emails = p.emails?.professional || [];
    const seen = new Map(); // email → highest confidence entry
    for (const e of emails) {
      const key = (e.email || '').toLowerCase();
      if (!key) continue;
      if (!seen.has(key)) {
        seen.set(key, e);
      } else {
        findings.db_email_dupes++;
        const existing = seen.get(key);
        if ((CONFIDENCE_RANK[e.confidence] || 0) > (CONFIDENCE_RANK[existing.confidence] || 0)) {
          seen.set(key, e); // upgrade
          findings.db_email_confidence_upgrades++;
        }
      }
    }
  }

  // Cross-source: contacts-enriched → DB match rate
  if (enriched.present) {
    const dbByNameKey = new Map(db.people.map(p => [normalizeName(p.full_name), p]));
    for (const [nameKey, entry] of Object.entries(enriched.entries)) {
      const p = dbByNameKey.get(nameKey);
      if (p) {
        findings.enriched_merged_count++;
      } else {
        findings.enriched_unmatched++;
      }
    }
  }

  // Verdict
  findings.action_required = findings.true_duplicate_count > 0 || findings.db_id_collisions > 0 || findings.db_linkedin_url_collisions > 0;

  // Expected ranges
  findings.expected_reduction = findings.true_duplicate_count;
  findings.db_people_after_expected = findings.db_people_before - findings.expected_reduction;

  // Sanity check: dedup should not reduce by more than ~5% of total
  const reduction_pct = (findings.expected_reduction / findings.db_people_before) * 100;
  if (reduction_pct > 5) {
    findings.recommendations.push(`WARNING: dedup would reduce records by ${reduction_pct.toFixed(1)}% — verify before applying`);
  }

  return findings;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const csv      = loadCsv();
const enriched = loadEnriched();
const db       = loadDb();

// Archive pre-dedup state (disk-only, gitignored via data/network-* pattern)
if (db.present) {
  try {
    copyFileSync(PATHS.db, PATHS.archive);
    log(`archived DB to ${PATHS.archive}`);
  } catch (e) {
    console.error('[dedup] archive failed:', e.message);
  }
}

const findings = runDedup(csv, enriched, db);

// If --fix, rebuild the canonical DB
if (FIX && findings.action_required) {
  log('--fix specified and action required — rebuilding canonical DB');
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('node', [join(ROOT, 'scripts/build-network-database.mjs'), '--verbose'], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 60_000,
  });
  if (result.status !== 0) {
    findings.fix_result = { ok: false, error: result.stderr?.slice(0, 400) };
  } else {
    // Re-read DB for after count
    const dbAfter = loadDb();
    findings.db_people_after_actual = dbAfter.people.length;
    findings.fix_result = { ok: true };
  }
} else if (FIX && !findings.action_required) {
  findings.fix_result = { ok: true, message: 'No action required — DB is already dedup-clean' };
}

const report = {
  generated_at: new Date().toISOString(),
  decision: 'ζ.4 — complete dedup pass (Mitchell 2026-05-19)',
  sources: {
    csv: { present: csv.present, rows: csv.rows.length, path: PATHS.csv },
    enriched: { present: enriched.present, entries: enriched.present ? enriched.count : 0, path: PATHS.enriched },
    db: { present: db.present, people: db.people.length, last_run: db.last_run, path: PATHS.db },
  },
  archive: { path: PATHS.archive, created: existsSync(PATHS.archive) },
  findings,
};

console.log(JSON.stringify(report, null, 2));
