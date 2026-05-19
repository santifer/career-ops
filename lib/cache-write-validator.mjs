/**
 * lib/cache-write-validator.mjs — Provenance-first cache write gate.
 *
 * Design source: refresh-master Phase 1.5 deliverables 4 (provenance schema)
 * + 7 (citation density gating). Every refresh-master cache write must pass
 * through validateCacheWrite() before hitting disk. Writes failing any rule
 * are blocked with a structured error the orchestrator can log and the
 * caller can adjudicate.
 *
 * Required envelope fields on every cache write:
 *   - source_urls:    array of ≥1 distinct https URLs (citations for the data)
 *   - retrieved_at:   ISO-8601 timestamp (when the underlying research ran)
 *   - model:          provider:model string (e.g., 'anthropic:claude-sonnet-4-6')
 *   - verifier_passed: boolean (Phase 2 verifier-lane decision; Phase 1.5 = null OK)
 *   - diff_summary:   short string ('initial' | '+N signals, -M obsolete' | etc.)
 *
 * Validation rules:
 *   1. PROVENANCE: all required fields present, types correct
 *   2. CITATION DENSITY: source_urls count >= ceil(content_tokens / 100) *
 *      cache.minCitationsPer100Tokens (default 1.0)
 *   3. EVIDENCE-SOURCE ALLOWLIST: for caches that declare an evidenceAllowlist
 *      (Phase 3 — pre-IPO equity claims must cite SEC/Crunchbase/company),
 *      every source URL must match one allowlist regex
 *   4. TEMPORAL COHERENCE (Phase 2): "as of X" claim must be within
 *      coherence_threshold_days of retrieved_at
 *
 * Backfill: validateExistingCache() reads an old cache and reports what
 * provenance fields are missing — used by Phase 1.5 migration script.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

/** Required envelope fields on every Phase-1.5+ cache write. */
export const REQUIRED_FIELDS = ['source_urls', 'retrieved_at', 'model'];

/** Optional but tracked fields. */
export const TRACKED_FIELDS = ['verifier_passed', 'diff_summary'];

/**
 * Validate a cache write candidate. Returns { ok, errors, warnings,
 * augmented } where `augmented` is the envelope with any missing
 * optional-but-tracked fields filled to defaults (null verifier_passed
 * etc.).
 */
export function validateCacheWrite({ cache, envelope, contentJson, priorCacheJson }) {
  const errors = [];
  const warnings = [];

  if (!envelope || typeof envelope !== 'object') {
    return { ok: false, errors: ['Envelope is missing or not an object'], warnings, augmented: null };
  }

  // 1. Required fields
  for (const f of REQUIRED_FIELDS) {
    if (envelope[f] === undefined || envelope[f] === null) {
      errors.push(`Missing required provenance field: ${f}`);
    }
  }

  // 1a. source_urls must be array of strings, ≥1 https URL
  if (Array.isArray(envelope.source_urls)) {
    const valid = envelope.source_urls.filter(u => typeof u === 'string' && /^https?:\/\//.test(u));
    if (valid.length === 0) errors.push('source_urls present but contains 0 valid https URLs');
    if (valid.length < envelope.source_urls.length) {
      warnings.push(`source_urls: ${envelope.source_urls.length - valid.length} entries are not valid URLs`);
    }
  } else if (envelope.source_urls !== undefined && envelope.source_urls !== null) {
    errors.push('source_urls must be an array');
  }

  // 1b. retrieved_at ISO-8601
  if (envelope.retrieved_at && !/^\d{4}-\d{2}-\d{2}T/.test(envelope.retrieved_at)) {
    errors.push(`retrieved_at not ISO-8601: ${envelope.retrieved_at}`);
  }

  // 2. Citation density. Token estimate = chars / 3.5 (heuristic).
  const contentText = stringifyForTokens(contentJson);
  const contentTokens = Math.ceil(contentText.length / 3.5);
  const minPer100 = cache?.minCitationsPer100Tokens ?? 1.0;
  const minCitations = Math.max(1, Math.ceil((contentTokens / 100) * minPer100));
  const actualCitations = Array.isArray(envelope.source_urls) ? envelope.source_urls.length : 0;
  if (actualCitations < minCitations) {
    errors.push(
      `Citation density too low: ${actualCitations} URL(s) for ~${contentTokens} tokens; ` +
      `min required = ${minCitations} (${minPer100}/100 tokens). ` +
      `Add more source URLs or lower minCitationsPer100Tokens for cache "${cache?.id}".`
    );
  }

  // 3. Evidence-source allowlist
  if (cache?.evidenceAllowlist && Array.isArray(envelope.source_urls)) {
    const allowlist = cache.evidenceAllowlist.map(r => new RegExp(r));
    const offenders = envelope.source_urls.filter(u => !allowlist.some(re => re.test(u)));
    if (offenders.length > 0) {
      errors.push(
        `Evidence-source allowlist violation for cache "${cache.id}": ` +
        `${offenders.length} URL(s) not on allowlist. First offender: ${offenders[0]}. ` +
        `Allowlist: ${cache.evidenceAllowlist.join(' | ')}`
      );
    }
  }

  // 4. Temporal coherence — flag stale-as-fresh
  if (envelope.as_of && envelope.retrieved_at) {
    const asOfMs = Date.parse(envelope.as_of);
    const retMs = Date.parse(envelope.retrieved_at);
    if (Number.isFinite(asOfMs) && Number.isFinite(retMs)) {
      const gapDays = (retMs - asOfMs) / 86400000;
      const threshold = cache?.temporalCoherenceMaxDays ?? 90;
      if (gapDays > threshold) {
        warnings.push(
          `Temporal coherence: claim "as_of ${envelope.as_of}" lags retrieved_at by ${gapDays.toFixed(1)} days ` +
          `(threshold ${threshold}). Possible stale-claim-as-fresh.`
        );
      }
    }
  }

  // 5. Diff-aware writes — Phase 2 escalation point. Compute structural delta
  //    vs prior cache and surface as warning if >20% change. Actual write
  //    block requires Phase 2 verifier (we just flag here in Phase 1.5).
  if (priorCacheJson) {
    const drift = computeJsonDriftPct(priorCacheJson, contentJson);
    if (drift > 0.20) {
      warnings.push(`Diff-aware: structural drift vs prior cache = ${(drift * 100).toFixed(1)}% (>20% threshold). ` +
        `Phase 2 verifier should adjudicate this write.`);
    }
  }

  const augmented = {
    ...envelope,
    verifier_passed: envelope.verifier_passed ?? null,
    diff_summary: envelope.diff_summary || (priorCacheJson ? 'updated' : 'initial'),
    validator_passed: errors.length === 0,
    validator_warnings_count: warnings.length,
  };

  return { ok: errors.length === 0, errors, warnings, augmented };
}

function stringifyForTokens(contentJson) {
  if (contentJson === null || contentJson === undefined) return '';
  try { return typeof contentJson === 'string' ? contentJson : JSON.stringify(contentJson); }
  catch { return String(contentJson); }
}

function computeJsonDriftPct(a, b) {
  const sa = stringifyForTokens(a);
  const sb = stringifyForTokens(b);
  if (!sa || !sb) return 1.0;
  // crude character-level Jaccard of trigrams (cheap, no deps)
  const tri = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
    return set;
  };
  const A = tri(sa), B = tri(sb);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return 1 - (inter / Math.max(1, union));
}

/**
 * Inspect an existing cache file and report missing provenance fields.
 * Used by the Phase 1.5 backfill script.
 */
export function validateExistingCache(filepath) {
  if (!existsSync(filepath)) return { ok: false, errors: ['file not found'], path: filepath };
  let raw;
  try { raw = JSON.parse(readFileSync(filepath, 'utf8')); }
  catch (e) { return { ok: false, errors: [`invalid JSON: ${e.message}`], path: filepath }; }
  const missing = [];
  for (const f of REQUIRED_FIELDS) {
    if (raw[f] === undefined || raw[f] === null) missing.push(f);
  }
  // Some caches stash provenance under .meta or .provenance — check those too
  if (raw.meta) {
    for (const f of REQUIRED_FIELDS) {
      if (missing.includes(f) && raw.meta[f] !== undefined && raw.meta[f] !== null) {
        missing.splice(missing.indexOf(f), 1);
      }
    }
  }
  return {
    ok: missing.length === 0,
    missing,
    path: filepath,
    hasSourceUrls: Array.isArray(raw.source_urls) || Array.isArray(raw.meta?.source_urls),
    hasRetrievedAt: !!(raw.retrieved_at || raw.as_of || raw.meta?.retrieved_at),
    hasModel: !!(raw.model || raw.meta?.model || raw.meta?.models_responded),
  };
}

/**
 * Backfill an existing cache with minimal provenance based on file mtime +
 * any embedded meta. Best-effort; only fills missing fields.
 */
export function backfillCacheProvenance(filepath, opts = {}) {
  if (!existsSync(filepath)) return { ok: false, errors: ['file not found'] };
  let cache;
  try { cache = JSON.parse(readFileSync(filepath, 'utf8')); }
  catch (e) { return { ok: false, errors: [`invalid JSON: ${e.message}`] }; }
  const mtime = statSync(filepath).mtime.toISOString();
  const patches = {};
  if (!cache.retrieved_at) patches.retrieved_at = cache.as_of || cache.meta?.retrieved_at || mtime;
  if (!cache.model) patches.model = cache.meta?.models_responded?.[0] || cache.meta?.model || 'unknown:backfilled';
  if (!cache.source_urls) {
    // Try to harvest URLs from common embedded shapes
    const harvested = new Set();
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      for (const v of Object.values(o)) {
        if (typeof v === 'string' && /^https?:\/\//.test(v)) harvested.add(v);
        else if (Array.isArray(v)) v.forEach(walk);
        else if (typeof v === 'object') walk(v);
      }
    };
    walk(cache);
    patches.source_urls = Array.from(harvested);
  }
  patches.diff_summary = cache.diff_summary || 'backfilled-pre-phase-1.5';
  patches.verifier_passed = cache.verifier_passed ?? null;
  patches._backfilled_at = new Date().toISOString();

  const merged = { ...cache, ...patches };
  if (!opts.dryRun) writeFileSync(filepath, JSON.stringify(merged, null, 2));
  return { ok: true, patched: Object.keys(patches), path: filepath, dryRun: !!opts.dryRun };
}

/**
 * Scan a directory tree for cache files and report provenance coverage.
 * Used by Phase 1.5 migration verification + dashboard observability.
 */
export function scanCacheCoverage(dirGlobs) {
  const report = { dirs: [], totals: { files: 0, withProvenance: 0, missingFields: {} } };
  for (const d of dirGlobs) {
    const abs = join(REPO_ROOT, d);
    if (!existsSync(abs)) continue;
    const entries = readdirSync(abs).filter(f => f.endsWith('.json'));
    const dirReport = { dir: d, files: entries.length, withProvenance: 0, missing: {} };
    for (const f of entries) {
      const v = validateExistingCache(join(abs, f));
      report.totals.files++;
      if (v.ok) {
        report.totals.withProvenance++;
        dirReport.withProvenance++;
      } else {
        for (const m of v.missing || []) {
          report.totals.missingFields[m] = (report.totals.missingFields[m] || 0) + 1;
          dirReport.missing[m] = (dirReport.missing[m] || 0) + 1;
        }
      }
    }
    report.dirs.push(dirReport);
  }
  return report;
}

// CLI: node lib/cache-write-validator.mjs --scan
//      node lib/cache-write-validator.mjs --backfill <path>
//      node lib/cache-write-validator.mjs --validate <path>
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--scan') {
    const dirs = [
      'data/hm-intel',
      'data/company-toxicity-cache',
      'data/positioning-cache',
      'data/role-enrichment',
      'data/company-pulse',
      'data/strategy-ceiling',
    ];
    console.log(JSON.stringify(scanCacheCoverage(dirs), null, 2));
  } else if (argv[0] === '--backfill') {
    const path = argv[1];
    const dryRun = argv.includes('--dry-run');
    if (!path) { console.error('--backfill <path>'); process.exit(2); }
    console.log(JSON.stringify(backfillCacheProvenance(path, { dryRun }), null, 2));
  } else if (argv[0] === '--validate') {
    const path = argv[1];
    if (!path) { console.error('--validate <path>'); process.exit(2); }
    console.log(JSON.stringify(validateExistingCache(path), null, 2));
  } else {
    console.log('usage: --scan | --backfill <path> [--dry-run] | --validate <path>');
  }
}
