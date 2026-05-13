#!/usr/bin/env node
/**
 * scripts/backfill-linkedin-urls.mjs
 *
 * Resolves LinkedIn jobs/view URLs to canonical ATS URLs across:
 *   1. reports/*.md  — rewrites **URL:** field in-place
 *   2. data/pipeline.md — rewrites URL column in checked/unchecked items
 *
 * Three-strategy cascade for reports:
 *   A/B/C. HTTP fetch + HTML parse (lib/resolve-ats-url: resolveUrls)
 *   D.     Scan the report body text for embedded ATS URLs
 *   E.     Query ATS API by company + role title (portals.yml lookup)
 *
 * Results cached in data/url-resolve-cache.tsv (TTL 30 days).
 *
 * Usage:
 *   node scripts/backfill-linkedin-urls.mjs             # live run
 *   node scripts/backfill-linkedin-urls.mjs --dry-run   # preview only
 *   node scripts/backfill-linkedin-urls.mjs --reports-only
 *   node scripts/backfill-linkedin-urls.mjs --pipeline-only
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  resolveUrls,
  extractAtsUrlFromText,
  resolveViaAtsSearch,
  updateCache,
} from '../lib/resolve-ats-url.mjs';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const DRY_RUN       = args.includes('--dry-run');
const REPORTS_ONLY  = args.includes('--reports-only');
const PIPELINE_ONLY = args.includes('--pipeline-only');

const LINKEDIN_URL_RE = /https?:\/\/www\.linkedin\.com\/jobs\/view\/\d+/gi;

function log(msg) { process.stdout.write(msg + '\n'); }
function dim(msg) { process.stdout.write('\x1b[2m' + msg + '\x1b[0m\n'); }
function green(msg) { process.stdout.write('\x1b[32m' + msg + '\x1b[0m\n'); }
function yellow(msg) { process.stdout.write('\x1b[33m' + msg + '\x1b[0m\n'); }

// ── Header extraction ──────────────────────────────────────────

function extractReportHeader(text) {
  // Matches: "# Evaluation: Company — Role" (and Spanish "# Evaluación: ...")
  const m = text.match(/^#\s+Evalu[^:]*:\s+(.+?)\s+[—–]\s+(.+?)(?:\s*\(.*?\))?\s*$/m);
  if (!m) return { company: null, role: null };
  return { company: m[1].trim(), role: m[2].trim() };
}

// ── Phase 1: Reports ──────────────────────────────────────────

async function backfillReports() {
  const reportsDir = join(ROOT, 'reports');
  if (!existsSync(reportsDir)) { dim('reports/ not found — skipping'); return; }

  const files = readdirSync(reportsDir).filter(f => f.endsWith('.md'));
  const hits = [];

  for (const file of files) {
    const path = join(reportsDir, file);
    const text = readFileSync(path, 'utf8');
    const m = text.match(/\*\*URL:\*\*\s*(https?:\/\/www\.linkedin\.com\/jobs\/view\/\d+)/i);
    if (m) hits.push({ file, path, text, linkedInUrl: m[1] });
  }

  log(`\nPhase 1 — Reports: found ${hits.length} with LinkedIn URLs`);
  if (!hits.length) return;

  // ── Strategies A/B/C: HTTP fetch + HTML parse ────────────────
  log('  Strategies A/B/C — HTTP fetch...');
  const urls = hits.map(h => h.linkedInUrl);
  const resolvedMap = new Map();

  for await (const { url, resolved, changed } of resolveUrls(urls, { root: ROOT, delayMs: 500 })) {
    resolvedMap.set(url, { resolved, changed, strategy: 'fetch' });
    if (changed) {
      green(`  ✓ [fetch] ${url.match(/\/(\d+)$/)[1]} → ${resolved}`);
    }
  }

  // ── Strategies D/E: body-scan + ATS API (for still-unresolved) ──
  const unresolved = hits.filter(h => !resolvedMap.get(h.linkedInUrl)?.changed);
  if (unresolved.length) {
    log(`  Strategy D — body scan (${unresolved.length} unresolved)...`);
    for (const hit of unresolved) {
      const found = extractAtsUrlFromText(hit.text);
      if (found) {
        const jobId = hit.linkedInUrl.match(/\/(\d+)$/)?.[1];
        resolvedMap.set(hit.linkedInUrl, { resolved: found, changed: true, strategy: 'body' });
        yellow(`  ✓ [body] ${hit.file} → ${found}`);
        if (!DRY_RUN && jobId) updateCache(jobId, found, ROOT);
      }
    }

    const stillUnresolved = unresolved.filter(h => !resolvedMap.get(h.linkedInUrl)?.changed);
    if (stillUnresolved.length) {
      log(`  Strategy E — ATS API search (${stillUnresolved.length} remaining)...`);
      for (const hit of stillUnresolved) {
        const { company, role } = extractReportHeader(hit.text);
        if (!company || !role) {
          dim(`  · [api] ${hit.file} — could not parse company/role from header`);
          continue;
        }
        const found = await resolveViaAtsSearch(company, role, { root: ROOT });
        if (found) {
          const jobId = hit.linkedInUrl.match(/\/(\d+)$/)?.[1];
          resolvedMap.set(hit.linkedInUrl, { resolved: found, changed: true, strategy: 'api' });
          yellow(`  ✓ [api:${company}] ${hit.file} → ${found}`);
          if (!DRY_RUN && jobId) updateCache(jobId, found, ROOT);
        } else {
          dim(`  · [api] ${company} — ${role} — no title match in ATS`);
        }
        // Small delay between ATS API calls
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }

  // ── Rewrite report files ─────────────────────────────────────
  let rewritten = 0;
  for (const { file, path, text, linkedInUrl } of hits) {
    const entry = resolvedMap.get(linkedInUrl);
    if (!entry?.changed) continue;

    const newText = text.replace(
      new RegExp(`(\\*\\*URL:\\*\\*\\s*)${escapeRe(linkedInUrl)}`, 'g'),
      `$1${entry.resolved}`
    );

    if (DRY_RUN) {
      dim(`  [dry-run] Would rewrite ${file} [${entry.strategy}]`);
    } else {
      writeFileSync(path, newText);
      dim(`  Rewrote ${file} [${entry.strategy}]`);
      rewritten++;
    }
  }

  const total = [...resolvedMap.values()].filter(v => v.changed).length;
  log(`  Reports resolved: ${total} / ${hits.length}${DRY_RUN ? ' (dry-run)' : `, rewrote ${rewritten}`}`);
}

// ── Phase 2: pipeline.md ──────────────────────────────────────

async function backfillPipeline() {
  const pipelinePath = join(ROOT, 'data', 'pipeline.md');
  if (!existsSync(pipelinePath)) { dim('data/pipeline.md not found — skipping'); return; }

  const text = readFileSync(pipelinePath, 'utf8');
  const linkedInUrls = [...new Set(
    [...text.matchAll(LINKEDIN_URL_RE)].map(m => m[0])
  )];

  log(`\nPhase 2 — pipeline.md: found ${linkedInUrls.length} unique LinkedIn URLs`);
  if (!linkedInUrls.length) return;

  const resolvedMap = new Map();

  for await (const { url, resolved, changed } of resolveUrls(linkedInUrls, { root: ROOT, delayMs: 400 })) {
    resolvedMap.set(url, { resolved, changed });
    if (changed) {
      green(`  ✓ ${url.match(/\/(\d+)$/)[1]} → ${resolved}`);
    } else {
      dim(`  · ${url.match(/\/(\d+)$/)[1]} — unresolvable`);
    }
  }

  let newText = text;
  let rewritten = 0;
  for (const [linkedInUrl, { resolved, changed }] of resolvedMap.entries()) {
    if (!changed) continue;
    newText = newText.replaceAll(linkedInUrl, resolved);
    rewritten++;
  }

  if (newText !== text) {
    if (DRY_RUN) {
      dim(`  [dry-run] Would rewrite pipeline.md (${rewritten} URLs)`);
    } else {
      writeFileSync(pipelinePath, newText);
      log(`  pipeline.md rewritten (${rewritten} URLs updated)`);
    }
  } else {
    dim('  pipeline.md unchanged (all unresolvable)');
  }
}

// ── Main ──────────────────────────────────────────────────────

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

log(`\n═══ LinkedIn URL Backfill ${DRY_RUN ? '[DRY RUN] ' : ''}════════════════════`);

if (!PIPELINE_ONLY) await backfillReports();
if (!REPORTS_ONLY)  await backfillPipeline();

log('\nDone.\n');
