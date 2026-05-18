#!/usr/bin/env node

/**
 * scripts/cv-tailor-batch.mjs — Live cv-tailor wrapper for batch tailoring.
 *
 * Bridges the gap between `runCvTailor()` (live LLM tailoring, exported but
 * not CLI-wrapped) and consumers (build-apply-packs, dashboard) that read
 * tailored content from `apply-pack/<slug>/tailored-cv.md`.
 *
 * Wraps one or more rows in a single invocation:
 *   1. Resolve each row → posting URL + apply-pack slug
 *   2. Fetch JD text via Playwright (sequential — project rule)
 *   3. Call runCvTailor() with dryRun=false
 *   4. Copy cv-tailor's `data/apply-packs/<padded>-<slug>/cv-tailored.md` →
 *      `apply-pack/<slug>/tailored-cv.md` (consumer-expected location; Item K
 *      cleanup deferred to Phase 4.1)
 *   5. Render Typst PDF → `apply-pack/<slug>/tailored-cv.pdf`
 *   6. Append per-row cost row to `data/cost-log.tsv`
 *
 * Usage:
 *   node scripts/cv-tailor-batch.mjs --rows=48,851,50 [--dry-run]
 *   node scripts/cv-tailor-batch.mjs --rows=48 --jd-cache-dir=/tmp/jd-cache
 *   node scripts/cv-tailor-batch.mjs --rows=48 --skip-fetch  (reuse cached JD)
 *
 * Exit code: 0 if all succeeded, 1 if any failed.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

// Resolve repo root portably: prefer the parent of the script's location
// (<repo>/scripts/ → <repo>), but fall back to process.cwd() if the parent
// doesn't contain cv.md. This handles invocations from a git worktree where
// the script is symlinked back to the main repo but cv.md only lives in the
// main repo's root.
const __dirname = dirname(fileURLToPath(import.meta.url));
function resolveRoot() {
  const parent = dirname(__dirname);
  if (existsSync(join(parent, 'cv.md')) || existsSync(join(parent, 'AGENTS.md'))) {
    return parent;
  }
  return process.cwd();
}
const ROOT = resolveRoot();

// Load .env BEFORE importing runCvTailor (which itself loads .env, but we
// load it here too so our own logging picks up env state).
try {
  const { config } = await import('dotenv');
  config({ path: join(ROOT, '.env'), override: true });
} catch { /* dotenv optional */ }

const { runCvTailor } = await import('./agents/cv-tailor.mjs');

function parseArgs(argv) {
  const out = { rows: '', 'dry-run': false, 'skip-fetch': false, 'jd-cache-dir': '/tmp/jd-cache' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq >= 0) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[arg.slice(2)] = next;
        i++;
      } else {
        out[arg.slice(2)] = true;
      }
    }
  }
  return out;
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolve a row id → { url, company, role, applyPackSlug }
 * by reading data/applications.md (the canonical tracker) + locating the
 * matching apply-pack/ directory.
 */
function resolveRow(rowId) {
  const appsMd = readFileSync(join(ROOT, 'data/applications.md'), 'utf-8');
  const lines = appsMd.split('\n');
  let row = null;
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cols = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cols.length < 9) continue;
    if (cols[0] !== String(rowId)) continue;
    const reportMatch = (cols[7] || '').match(/\[(\d+)\]\((reports\/[^)]+\.md)\)/);
    row = {
      num: cols[0],
      date: cols[1],
      company: cols[2],
      role: cols[3],
      score: cols[4],
      status: cols[5],
      report: reportMatch ? reportMatch[2] : null,
    };
    break;
  }
  if (!row) throw new Error(`Row ${rowId} not found in applications.md`);

  // Extract URL from eval report
  let url = null;
  if (row.report) {
    const reportPath = join(ROOT, row.report);
    if (existsSync(reportPath)) {
      const body = readFileSync(reportPath, 'utf-8');
      const m = body.match(/^\*\*URL:\*\*\s*(\S+)/m);
      if (m) url = m[1];
    }
  }

  // Find apply-pack slug — match by row prefix
  const applyPackDir = join(ROOT, 'apply-pack');
  const subdirs = readdirSync(applyPackDir).filter((d) =>
    statSync(join(applyPackDir, d)).isDirectory()
  );
  // Naming convention: <N-padded-or-not>-<slug>
  // For rows 1-99: padded to 3 (e.g. 048-..., 050-...). For 100+: unpadded.
  const padded = rowId < 100 ? String(rowId).padStart(3, '0') : String(rowId);
  let applyPackSlug = subdirs.find((d) => d.startsWith(`${padded}-`)) || subdirs.find((d) => d.startsWith(`${rowId}-`));

  return {
    rowId: Number(rowId),
    company: row.company,
    role: row.role,
    url,
    applyPackSlug,
    status: row.status,
  };
}

/**
 * Fetch JD text from a URL via Playwright (sequential — never parallel per
 * project rule). Returns the body innerText, trimmed.
 */
async function fetchJd(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2500); // let SPAs hydrate
  const text = await page.evaluate(() => document.body?.innerText ?? '');
  return text.trim();
}

/**
 * Trim a raw JD body to the role-content portion. Greenhouse / Ashby / Lever
 * pages append voluntary self-id forms, race/ethnicity definitions, disability
 * disclosure language, and apply-form fields after the role content. Those
 * dilute the LLM signal and cause schema-validation failures when the model
 * hallucinates rather than parsing the noise.
 */
function cleanJdText(raw) {
  const stops = [
    'Apply for this job',
    'Voluntary Self-Identification',
    'Race & Ethnicity Definitions',
    'PUBLIC BURDEN STATEMENT',
    'Create a Job Alert',
    'How do you pronounce your name?',
    'Veteran Status',
    'Voluntary Self-Identification of Disability',
    'Equal Employment Opportunity',
    'Submit application',
  ];
  let text = raw;
  for (const stop of stops) {
    const idx = text.indexOf(stop);
    if (idx > 0 && idx < text.length) text = text.slice(0, idx);
  }
  if (text.length > 8000) text = text.slice(0, 8000);
  return text.trim();
}

/**
 * Locate the hm-intel JSON for a (company, role) pair. cv-tailor reads it
 * from input.context.hmIntel, NOT from disk, so we must thread it through.
 * Returns the parsed JSON object or {} if no file found.
 */
function loadHmIntel(company, role) {
  const candidates = [
    `${slugify(company)}-${slugify(role)}`,
    `${slugify(role)}`,
    // Try common slug variants used in apply-pack dir naming
    slugify(`${company} ${role}`),
  ];
  for (const c of candidates) {
    const p = join(ROOT, 'data', 'hm-intel', `${c}.json`);
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, 'utf-8'));
      } catch { /* fall through */ }
    }
  }
  return {};
}

/**
 * Build the SubAgentInput expected by runCvTailor.
 */
function buildSubAgentInput({ rowId, company, role, jdText, hmIntel }) {
  return {
    pack: {
      jd: {
        jd_text: jdText,
        company,
        role,
        url: null,
      },
      corpus: {
        cv_path: 'cv.md',
        article_digest_path: 'article-digest.md',
        voice_reference_path: 'writing-samples/voice-reference.md',
      },
      archetype: 'A2-PgM',
      meta: { row_id: rowId, company, role },
    },
    context: {
      cv: 'cv.md',
      articleDigest: 'article-digest.md',
      voiceReference: 'writing-samples/voice-reference.md',
      hmIntel: hmIntel || {},
    },
    config: { dryRun: false, model: undefined, reasoningEffort: undefined },
  };
}

function ensureCostLog() {
  const path = join(ROOT, 'data/cost-log.tsv');
  if (!existsSync(path)) {
    writeFileSync(
      path,
      'timestamp\trun_id\tagent\tmodel\tinput_tokens\toutput_tokens\tcached_tokens\tcost_usd\tnotes\n'
    );
  }
  return path;
}

function logCost({ stage, rowId, company, role, model, tokens, costUsd, status, notes }) {
  const path = ensureCostLog();
  const ts = new Date().toISOString();
  const runId = `cv-tailor-batch-${rowId}-${ts.replace(/[:.]/g, '-')}`;
  const safeNotes = `${stage} row=${rowId} status=${status} ${company} | ${role}${notes ? ` | ${notes}` : ''}`.replace(/\t/g, ' ').replace(/\n/g, ' ');
  appendFileSync(
    path,
    `${ts}\t${runId}\t${stage}\t${model || ''}\t${tokens?.input ?? 0}\t${tokens?.output ?? 0}\t${tokens?.cached ?? 0}\t${costUsd?.toFixed?.(4) ?? '0.0000'}\t${safeNotes}\n`
  );
}

async function processRow(rowSpec, browser, opts) {
  const { rowId, company, role, url, applyPackSlug, status } = rowSpec;
  console.error(`[row ${rowId}] ${company} — ${role}`);
  console.error(`  status=${status} url=${url || '(none)'} slug=${applyPackSlug || '(no apply-pack dir)'}`);

  if (!applyPackSlug) {
    return { rowId, ok: false, reason: 'no_apply_pack_dir' };
  }
  if (!url) {
    return { rowId, ok: false, reason: 'no_url_in_report' };
  }

  // --- Phase 1: fetch JD --------------------------------------------------
  mkdirSync(opts['jd-cache-dir'], { recursive: true });
  const jdCachePath = join(opts['jd-cache-dir'], `row-${rowId}.txt`);
  let jdText;
  if (opts['skip-fetch'] && existsSync(jdCachePath)) {
    jdText = readFileSync(jdCachePath, 'utf-8');
    console.error(`  jd cached (${jdText.length} chars)`);
  } else {
    const page = await browser.newPage();
    try {
      jdText = await fetchJd(page, url);
      writeFileSync(jdCachePath, jdText);
      console.error(`  jd fetched (${jdText.length} chars)`);
    } finally {
      await page.close();
    }
  }
  if (jdText.length < 200) {
    return { rowId, ok: false, reason: 'jd_too_short', jd_chars: jdText.length };
  }

  if (opts['dry-run']) {
    return { rowId, ok: true, reason: 'dry_run', jd_chars: jdText.length };
  }

  // --- Phase 2: run runCvTailor live --------------------------------------
  const cleanedJd = cleanJdText(jdText);
  const hmIntel = loadHmIntel(company, role);
  const hmIntelKeys = Object.keys(hmIntel || {}).length;
  console.error(`  jd cleaned: ${jdText.length} → ${cleanedJd.length} chars; hm-intel keys: ${hmIntelKeys}`);
  const t0 = Date.now();
  const input = buildSubAgentInput({ rowId, company, role, jdText: cleanedJd, hmIntel });
  let result;
  try {
    result = await runCvTailor(input);
  } catch (err) {
    logCost({
      stage: 'cv-tailor',
      rowId,
      company,
      role,
      model: 'unknown',
      tokens: { input: 0, output: 0, cached: 0 },
      costUsd: 0,
      status: 'error',
      notes: `exception: ${err.message}`.slice(0, 240),
    });
    return { rowId, ok: false, reason: 'tailor_exception', error: err.message };
  }
  const elapsed = Date.now() - t0;
  const costUsd = result?.diagnostics?.cost_estimate_usd || 0;
  const tokens = result?.diagnostics?.tokens_used || {};
  const model = result?.diagnostics?.model_used || '';
  const tailorStatus = result?.status || 'unknown';

  logCost({
    stage: 'cv-tailor',
    rowId,
    company,
    role,
    model,
    tokens,
    costUsd,
    status: tailorStatus,
    notes: `elapsed=${elapsed}ms humanize=${result?.output?.humanize_risk_score ?? '?'}/${result?.output?.humanize_risk_band ?? '?'}`,
  });

  // cv-tailor wrote a bullet LEDGER (highlights + top-N bullets + summary +
  // warnings) to its canonical path even when humanize gate fails. Surface
  // the ledger location regardless; humanize MEDIUM is a warning, not fatal.
  const canonicalMd = result?.output?.path ? join(ROOT, result.output.path) : null;
  const ledgerPresent = !!(canonicalMd && existsSync(canonicalMd));

  // --- Phase 3: refresh full-CV PDF from existing tailored-cv.md ---------
  // The existing apply-pack/<slug>/tailored-cv.md is a full CV markdown from
  // an earlier pipeline (different content type from the ledger). Apply the
  // cv.md role-header trims so the new Typst template doesn't wrap, then
  // render. The ledger is a separate intel artifact, NOT a CV.
  const consumerMd = join(ROOT, 'apply-pack', applyPackSlug, 'tailored-cv.md');
  const consumerPdf = join(ROOT, 'apply-pack', applyPackSlug, 'tailored-cv.pdf');
  const refreshNotes = [];
  let renderOk = false;
  if (!existsSync(consumerMd)) {
    refreshNotes.push('no_existing_tailored_cv_md');
  } else {
    const before = readFileSync(consumerMd, 'utf-8');
    const after = applyRoleHeaderTrims(before);
    if (after !== before) {
      writeFileSync(consumerMd, after);
      refreshNotes.push('trims_applied');
    } else {
      refreshNotes.push('no_trim_changes');
    }
    try {
      execSync(
        `node ${join(__dirname, 'render-cv-typst.mjs')} --input ${consumerMd} --output ${consumerPdf}`,
        { stdio: 'pipe', cwd: ROOT }
      );
      renderOk = true;
    } catch (err) {
      refreshNotes.push(`render_failed:${err.message.slice(0, 120)}`);
    }
  }

  return {
    rowId,
    ok: ledgerPresent && renderOk,
    cost_usd: costUsd,
    elapsed_ms: elapsed,
    tokens,
    tailor_status: tailorStatus,
    tailor_error: tailorStatus !== 'ok' ? (result?.error || '(none)') : null,
    humanize: result?.output?.humanize_risk_score,
    humanize_band: result?.output?.humanize_risk_band,
    tailored_bullets_count: result?.output?.tailored_bullets_count,
    highlights_count: result?.output?.highlights_count,
    ledger_md: canonicalMd ? canonicalMd.replace(ROOT + '/', '') : null,
    consumer_md: existsSync(consumerMd) ? consumerMd.replace(ROOT + '/', '') : null,
    consumer_pdf: renderOk ? consumerPdf.replace(ROOT + '/', '') : null,
    refresh_notes: refreshNotes,
  };
}

/**
 * Apply role-header trims (matching cv.md Phase 1.1 trims) to a tailored-cv.md
 * so the new Typst template doesn't wrap. Verbatim find-and-replace; safe on
 * already-trimmed content (no-op).
 */
function applyRoleHeaderTrims(md) {
  const replacements = [
    ['Internal Communications Lead, Program Manager', 'Internal Comms Lead, Program Manager'],
    ['Google — Office of Cross-Google Engineering (xGE)', 'Google — Cross-Google Eng (xGE)'],
    ['Google — Cross-Google Engineering (xGE)', 'Google — Cross-Google Eng (xGE)'],
    ['Senior Communications & Content Manager', 'Senior Comms & Content Manager'],
    ['Google — Corporate Engineering (Director-level support + TechStop)', 'Google — Corporate Engineering (TechStop)'],
    [' (~2 years)', ''],
    [' (~6 years)', ''],
    [' (~2 yrs)', ''],
    [' (~6 yrs)', ''],
    ['Fusion (ABC News / Univision Joint Venture)', 'Fusion (ABC News / Univision JV)'],
    ['August 2013 – October 2015', 'Aug 2013 – Oct 2015'],
    ['Earlier Career — Broadcast & Live Production', 'Earlier Career'],
    ['CCTV America · Al Jazeera English / Al Jazeera America ("The Stream" founding team)', 'CCTV America · Al Jazeera English / Al Jazeera America'],
  ];
  let out = md;
  for (const [from, to] of replacements) {
    out = out.split(from).join(to);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.rows) {
    console.error('Usage: node scripts/cv-tailor-batch.mjs --rows=N1,N2,... [--dry-run] [--skip-fetch]');
    process.exit(1);
  }
  const rowIds = String(args.rows).split(',').map((s) => Number(s.trim())).filter(Boolean);

  // Resolve all rows up front to fail fast on lookup errors.
  const rowSpecs = rowIds.map((id) => {
    try {
      return resolveRow(id);
    } catch (err) {
      return { rowId: id, error: err.message };
    }
  });

  const unresolved = rowSpecs.filter((r) => r.error);
  if (unresolved.length) {
    console.error('Failed to resolve some rows:');
    unresolved.forEach((r) => console.error(`  row ${r.rowId}: ${r.error}`));
  }

  const validRows = rowSpecs.filter((r) => !r.error);
  if (!validRows.length) {
    console.error('No valid rows to process.');
    process.exit(1);
  }

  console.error(`Processing ${validRows.length} row(s) sequentially (project rule: never Playwright in parallel)`);

  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const rs of validRows) {
      const r = await processRow(rs, browser, args);
      results.push({ ...rs, ...r });
      console.error(`  → ${r.ok ? 'OK' : 'FAIL: ' + r.reason} cost=$${(r.cost_usd || 0).toFixed(4)}`);
    }
  } finally {
    await browser.close();
  }

  const totalCost = results.reduce((s, r) => s + (r.cost_usd || 0), 0);
  const summary = {
    timestamp: new Date().toISOString(),
    rows_attempted: results.length,
    rows_ok: results.filter((r) => r.ok).length,
    rows_failed: results.filter((r) => !r.ok).length,
    total_cost_usd: Math.round(totalCost * 10000) / 10000,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));

  process.exit(summary.rows_failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(2);
});
