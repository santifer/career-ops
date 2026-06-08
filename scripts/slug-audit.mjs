#!/usr/bin/env node
/**
 * slug-audit.mjs — Verify Greenhouse + Lever slugs against the live Worker
 *
 * Usage:
 *   node scripts/slug-audit.mjs [--worker-url <url>] [--output <path>] [--config <path>] [--dry-run]
 *
 * Flags:
 *   --worker-url <url>   Worker base URL (default: env PULSE_WORKER_URL or wrangler.toml value)
 *   --output <path>      Result JSON (default: data/slug-audit-{date}.json)
 *   --config <path>      sources.yml to read slugs from (default: config/sources.yml)
 *   --dry-run            Print what would be checked; skip live fetches
 *
 * Output shape per slug:
 *   { ats, slug, status, job_count, sample_title, suggested_fix, checked_at }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

const WORKER_BASE = argVal('--worker-url')
  || process.env.PULSE_WORKER_URL
  || 'https://pulse-jobs-proxy.rahilnathanipulse.workers.dev';

const dateStamp  = new Date().toISOString().slice(0, 10);
const outputPath = argVal('--output') || path.join(ROOT, 'data', `slug-audit-${dateStamp}.json`);
const configPath = argVal('--config') || path.join(ROOT, 'config', 'sources.yml');
const dryRun     = process.argv.includes('--dry-run');

// ── load config ───────────────────────────────────────────────────────────────

let config;
if (fs.existsSync(configPath)) {
  config = yaml.load(fs.readFileSync(configPath, 'utf8'));
} else {
  // Fallback defaults if no config file yet
  config = {
    greenhouse: ['stripe', 'anthropic', 'databricks', 'openai', 'notion', 'figma', 'linear'],
    lever:      ['figma', 'linear', 'notion-hq', 'hex', 'retool'],
  };
  console.warn(`[slug-audit] config not found at ${configPath}, using defaults`);
}

// Accept either string[] or {slug, ...}[]
function extractSlugs(arr) {
  return (arr || []).map(entry => (typeof entry === 'string' ? entry : entry.slug)).filter(Boolean);
}
const ghSlugs = extractSlugs(config.greenhouse);
const lvSlugs = extractSlugs(config.lever);
const allSlugs = [
  ...ghSlugs.map(s => ({ ats: 'greenhouse', slug: s })),
  ...lvSlugs.map(s => ({ ats: 'lever',      slug: s })),
];

console.log(`[slug-audit] Worker: ${WORKER_BASE}`);
console.log(`[slug-audit] Checking ${allSlugs.length} slugs (${ghSlugs.length} GH, ${lvSlugs.length} LV)`);

if (dryRun) {
  console.log('[slug-audit] DRY-RUN — slugs that would be checked:');
  allSlugs.forEach(({ ats, slug }) => console.log(`  ${ats}/${slug} → ${WORKER_BASE}/${ats}/${slug}`));
  process.exit(0);
}

// ── common slug transforms for 404 suggestions ────────────────────────────────

function suggestFix(ats, slug, responseBody) {
  const suggestions = [];
  // Strip hyphens: notion-hq → notionhq
  if (slug.includes('-')) suggestions.push(slug.replace(/-/g, ''));
  // Add -hq suffix: notion → notion-hq
  if (!slug.endsWith('-hq')) suggestions.push(slug + '-hq');
  // Add common suffixes
  suggestions.push(slug + 'inc', slug + '-inc', slug + 'corp');
  // Remove common suffixes: stripe-inc → stripe
  suggestions.push(slug.replace(/[-_](inc|corp|llc|hq|co)$/, ''));
  // From error body if available
  if (responseBody?.error) {
    const m = responseBody.error.match(/\b([a-z0-9-]+)\b/g);
    if (m) suggestions.push(...m.filter(w => w.length > 3 && w !== ats && w !== slug));
  }
  return [...new Set(suggestions.filter(s => s && s !== slug))].slice(0, 3);
}

// ── audit ─────────────────────────────────────────────────────────────────────

const results = [];
const checkedAt = new Date().toISOString();

for (const { ats, slug } of allSlugs) {
  const url = `${WORKER_BASE}/${ats}/${slug}`;
  let result = { ats, slug, url, status: 'unknown', job_count: 0, sample_title: null, suggested_fix: [], checked_at: checkedAt };

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const body = await res.json().catch(() => null);

    result.http_status = res.status;

    if (res.status === 200 && body && !body.error) {
      result.status     = body.jobs?.length > 0 ? 'ok' : 'empty';
      result.job_count  = body.count || body.jobs?.length || 0;
      result.sample_title = body.jobs?.[0]?.title || null;
    } else if (res.status === 404) {
      result.status = 'not_found';
      result.suggested_fix = suggestFix(ats, slug, body);
    } else {
      result.status = `error_${res.status}`;
      result.suggested_fix = suggestFix(ats, slug, body);
    }
  } catch (e) {
    result.status = 'fetch_error';
    result.error  = e.message;
  }

  const icon = result.status === 'ok' ? '✓' : result.status === 'empty' ? '○' : '✗';
  console.log(`  ${icon} ${ats}/${slug}: ${result.status} (${result.job_count} jobs)${result.sample_title ? ' — "' + result.sample_title + '"' : ''}${result.suggested_fix?.length ? ' → try: ' + result.suggested_fix.join(', ') : ''}`);
  results.push(result);
}

// ── summary ───────────────────────────────────────────────────────────────────

const ok      = results.filter(r => r.status === 'ok').length;
const empty   = results.filter(r => r.status === 'empty').length;
const broken  = results.filter(r => !['ok', 'empty'].includes(r.status)).length;

console.log(`\n[slug-audit] Results: ${ok} ok, ${empty} empty, ${broken} broken`);

const output = {
  ran_at:   checkedAt,
  worker:   WORKER_BASE,
  summary:  { ok, empty, broken, total: results.length },
  results,
};

const tmpPath = outputPath + '.tmp';
fs.writeFileSync(tmpPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
fs.renameSync(tmpPath, outputPath);
console.log(`[slug-audit] Written → ${path.relative(ROOT, outputPath)}`);
