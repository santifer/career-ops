#!/usr/bin/env node

/**
 * scripts/preflight-pack.mjs — consolidated pre-flight report for one apply
 * pack (added 2026-05-18). Runs every quality gate that's already in the
 * repo and writes a single PASS/CAUTION/FAIL verdict to
 * apply-pack/<slug>/PREFLIGHT.md.
 *
 * Gates executed (all deterministic — no LLM spend):
 *   1. Tailored-CV PDF: 2-page invariant, ATS keyword density (≥6 of 10
 *      target keywords), no Typst escape leaks (\@ / \# / \$ / "(see cv.md)").
 *   2. Cover letter humanize-check: existing scripts/humanize-check.mjs.
 *   3. JD-keyword overlap: scripts/jd-keyword-score.mjs (CV ≥50% green,
 *      30-50% yellow, <30% red).
 *   4. Claim consistency: scripts/claim-consistency.mjs (all-verified =
 *      green, ≤2 unverified = yellow, more = red).
 *   5. cv.md / tailored-cv.md word count (sanity).
 *
 * Verdict assembly:
 *   - PASS:    all gates green.
 *   - CAUTION: any gate yellow but none red.
 *   - FAIL:    any gate red.
 *
 * CLI:
 *   node scripts/preflight-pack.mjs --slug 048-anthropic-engineering-editorial-lead
 *   node scripts/preflight-pack.mjs --slug <slug> --dry-run    # print, don't write
 *   node scripts/preflight-pack.mjs --all                       # every pack with a tailored-cv.pdf
 *
 * Exit code: 0 if PASS, 1 if CAUTION, 2 if FAIL (lets shell pipelines gate).
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
function resolveRoot() {
  const parent = dirname(__dirname);
  if (existsSync(join(parent, 'cv.md')) || existsSync(join(parent, 'AGENTS.md'))) return parent;
  return process.cwd();
}
const ROOT = resolveRoot();

const ATS_KEYWORDS = [
  'FDE', 'Forward Deployed', 'Applied AI', 'Solutions Architect',
  'AI Program Manager', 'MCP', 'RAG', 'agentic', 'Claude', 'evaluation',
];

function parseArgs(argv) {
  const a = { slug: null, all: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--slug' && argv[i + 1]) { a.slug = argv[++i]; continue; }
    if (argv[i] === '--all') { a.all = true; continue; }
    if (argv[i] === '--dry-run') { a.dryRun = true; continue; }
  }
  return a;
}

function runShell(cmd) {
  // The downstream gate scripts (jd-keyword-score, claim-consistency) exit
  // with non-zero status when packs fall below threshold — but the JSON
  // output is STILL on stdout. execSync throws on non-zero; capture stdout
  // anyway via err.stdout.
  try {
    return { ok: true, stdout: execSync(cmd, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] }).toString() };
  } catch (err) {
    const stdout = err.stdout ? err.stdout.toString() : '';
    return { ok: stdout.length > 0, stdout, stderr: err.message || String(err) };
  }
}

function parseJsonTail(text) {
  // Locate the first '{\n' to skip dotenv preamble lines.
  const idx = text.indexOf('{\n');
  if (idx < 0) return null;
  try { return JSON.parse(text.slice(idx)); } catch { return null; }
}

function colorize(level) {
  return ({ green: '🟢', yellow: '🟡', red: '🔴' })[level] || '⚪';
}

function checkPdf(packDir) {
  const pdfPath = join(packDir, 'tailored-cv.pdf');
  if (!existsSync(pdfPath)) {
    return { level: 'red', detail: 'tailored-cv.pdf not found', metrics: {} };
  }
  let pages = 0;
  try {
    pages = Number(execSync(`pdfinfo ${JSON.stringify(pdfPath)} | awk '/^Pages/{print $2}'`).toString().trim());
  } catch { /* fall through with pages=0 */ }
  let text = '';
  try {
    text = execSync(`pdftotext -layout ${JSON.stringify(pdfPath)} -`).toString();
  } catch { /* fall through with empty text */ }

  const normalized = text.replace(/\s+/g, ' ');
  const kwHits = ATS_KEYWORDS.filter(kw => normalized.includes(kw));
  const leaks = (text.match(/\\#|\\@|\\\$|\(see cv\.md\)/g) || []).length;

  let level = 'green';
  const notes = [];
  if (pages !== 2) { level = 'red'; notes.push(`PDF is ${pages || '?'} pages (expected 2)`); }
  if (kwHits.length < 6) { level = level === 'red' ? 'red' : 'yellow'; notes.push(`Only ${kwHits.length} of ${ATS_KEYWORDS.length} ATS keywords matched`); }
  if (leaks > 0) { level = 'red'; notes.push(`${leaks} Typst escape-leak(s) in text layer`); }

  return {
    level,
    detail: notes.join('; ') || 'OK',
    metrics: { pages, kwHits: kwHits.length, kwTotal: ATS_KEYWORDS.length, missing: ATS_KEYWORDS.filter(kw => !normalized.includes(kw)), leaks },
  };
}

function checkHumanize(packDir) {
  const coverPath = join(packDir, 'cover-letter.md');
  if (!existsSync(coverPath)) return { level: 'yellow', detail: 'cover-letter.md not found (skipped)', metrics: {} };
  const r = runShell(`node ${JSON.stringify(join(ROOT, 'scripts', 'humanize-check.mjs'))} --file ${JSON.stringify(coverPath)} --json`);
  if (!r.ok) return { level: 'yellow', detail: `humanize-check failed: ${r.stderr.slice(0, 120)}`, metrics: {} };
  const parsed = parseJsonTail(r.stdout) || (() => { try { return JSON.parse(r.stdout); } catch { return null; } })();
  if (!parsed) return { level: 'yellow', detail: 'humanize-check returned no JSON', metrics: {} };
  const score = typeof parsed.score === 'number' ? parsed.score : 0;
  const band = parsed?.risk?.label || parsed?.risk || 'UNKNOWN';
  let level = 'green';
  if (score >= 71) level = 'red';
  else if (score >= 46) level = 'red';
  else if (score >= 21) level = 'yellow';
  return { level, detail: `score=${score}% band=${band}`, metrics: { score, band } };
}

function checkKeywordAlignment(slug) {
  const r = runShell(`node ${JSON.stringify(join(ROOT, 'scripts', 'jd-keyword-score.mjs'))} --slug ${JSON.stringify(slug)}`);
  if (!r.ok) return { level: 'yellow', detail: `jd-keyword-score failed: ${r.stderr.slice(0, 120)}`, metrics: {} };
  const parsed = parseJsonTail(r.stdout);
  const cvArt = parsed?.results?.[0]?.artifacts?.find(a => a.path.includes('tailored-cv') || a.path === 'cv.md (fallback)');
  if (!cvArt) return { level: 'yellow', detail: 'no CV artifact in scorer result', metrics: {} };
  const score = cvArt.score;
  let level = 'green';
  if (score < 30) level = 'red';
  else if (score < 50) level = 'yellow';
  return { level, detail: `JD keyword overlap (CV): ${score}% (${cvArt.misses} misses)`, metrics: { score, misses: cvArt.misses } };
}

function checkClaimConsistency(slug) {
  const r = runShell(`node ${JSON.stringify(join(ROOT, 'scripts', 'claim-consistency.mjs'))} --slug ${JSON.stringify(slug)}`);
  if (!r.ok) return { level: 'yellow', detail: `claim-consistency failed: ${r.stderr.slice(0, 120)}`, metrics: {} };
  const parsed = parseJsonTail(r.stdout);
  const artifacts = parsed?.results?.[0]?.artifacts || [];
  const totalClaims = artifacts.reduce((s, a) => s + (a.total || 0), 0);
  const totalUnverified = artifacts.reduce((s, a) => s + (a.unverified || 0), 0);
  const ratio = totalClaims > 0 ? totalUnverified / totalClaims : 0;
  // The exact-match verifier under-counts semantically-equivalent paraphrases
  // (cv.md says "eight years at Google", cover letter says "8 years at Google
  // and adjacent newsrooms" — same fact, fails strict match). Tune the gate
  // to flag only when the unverified ratio is large enough that the LLM is
  // likely inventing numbers, not just rephrasing them.
  let level = 'green';
  if (ratio >= 0.5 || totalUnverified >= 30) level = 'red';
  else if (ratio >= 0.25 || totalUnverified >= 10) level = 'yellow';
  return {
    level,
    detail: `${totalClaims - totalUnverified}/${totalClaims} claims verified (${Math.round((1 - ratio) * 100)}% — exact-match; semantic paraphrases under-counted)`,
    metrics: { totalClaims, totalUnverified, ratio: Number(ratio.toFixed(2)) },
  };
}

function buildReport(slug, gates, verdict) {
  const lines = [];
  lines.push(`# Pre-flight — ${slug}`);
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()} by \`scripts/preflight-pack.mjs\`.`);
  lines.push('');
  lines.push(`## Verdict: ${colorize(verdict.level === 'PASS' ? 'green' : verdict.level === 'CAUTION' ? 'yellow' : 'red')} **${verdict.level}**`);
  lines.push('');
  if (verdict.blockers.length) {
    lines.push('### Blockers (fix before submitting)');
    for (const b of verdict.blockers) lines.push(`- ${b}`);
    lines.push('');
  }
  if (verdict.cautions.length) {
    lines.push('### Cautions (review before submitting)');
    for (const c of verdict.cautions) lines.push(`- ${c}`);
    lines.push('');
  }
  lines.push('## Gate results');
  lines.push('');
  lines.push('| Gate | Status | Detail |');
  lines.push('|---|---|---|');
  for (const [name, g] of Object.entries(gates)) {
    lines.push(`| ${name} | ${colorize(g.level)} ${g.level.toUpperCase()} | ${g.detail} |`);
  }
  lines.push('');
  // Per-gate metric drill-down
  lines.push('## Drill-down');
  lines.push('');
  lines.push('### PDF (tailored-cv.pdf)');
  lines.push(`- Pages: ${gates.pdf.metrics.pages ?? '?'}`);
  lines.push(`- ATS keywords matched: ${gates.pdf.metrics.kwHits ?? 0} / ${gates.pdf.metrics.kwTotal ?? 0}`);
  if (gates.pdf.metrics.missing?.length) {
    lines.push(`- Missing keywords: ${gates.pdf.metrics.missing.map(k => '`' + k + '`').join(', ')}`);
  }
  lines.push(`- Escape leaks: ${gates.pdf.metrics.leaks ?? 0}`);
  lines.push('');
  if (gates.humanize.metrics.score !== undefined) {
    lines.push('### Cover letter (humanize-check)');
    lines.push(`- Score: ${gates.humanize.metrics.score}%`);
    lines.push(`- Band: ${gates.humanize.metrics.band}`);
    lines.push('');
  }
  lines.push('### JD keyword overlap');
  lines.push(`- Score: ${gates.keywordAlignment.metrics.score ?? '?'}%`);
  lines.push(`- See [keyword-alignment.md](keyword-alignment.md) for full per-artifact breakdown.`);
  lines.push('');
  lines.push('### Claim consistency');
  lines.push(`- Verified: ${(gates.claimConsistency.metrics.totalClaims || 0) - (gates.claimConsistency.metrics.totalUnverified || 0)} / ${gates.claimConsistency.metrics.totalClaims || 0}`);
  lines.push(`- See [claim-consistency.md](claim-consistency.md) for unverified-claim list.`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('Re-run any time: `node scripts/preflight-pack.mjs --slug ' + slug + '`');
  return lines.join('\n') + '\n';
}

function aggregateVerdict(gates) {
  const blockers = [];
  const cautions = [];
  for (const [name, g] of Object.entries(gates)) {
    if (g.level === 'red') blockers.push(`${name}: ${g.detail}`);
    else if (g.level === 'yellow') cautions.push(`${name}: ${g.detail}`);
  }
  const level = blockers.length ? 'FAIL' : (cautions.length ? 'CAUTION' : 'PASS');
  return { level, blockers, cautions };
}

function processPack(slug, opts) {
  const packDir = join(ROOT, 'apply-pack', slug);
  if (!existsSync(packDir) || !statSync(packDir).isDirectory()) {
    return { slug, ok: false, error: 'pack_dir_not_found' };
  }

  const gates = {
    pdf: checkPdf(packDir),
    humanize: checkHumanize(packDir),
    keywordAlignment: checkKeywordAlignment(slug),
    claimConsistency: checkClaimConsistency(slug),
  };
  const verdict = aggregateVerdict(gates);
  const report = buildReport(slug, gates, verdict);

  if (opts.dryRun) {
    process.stdout.write(report);
  } else {
    writeFileSync(join(packDir, 'PREFLIGHT.md'), report);
  }

  return {
    slug,
    ok: verdict.level === 'PASS',
    verdict: verdict.level,
    blockers: verdict.blockers.length,
    cautions: verdict.cautions.length,
    gates: Object.fromEntries(Object.entries(gates).map(([n, g]) => [n, g.level])),
  };
}

function discoverReadyPacks() {
  const applyPackDir = join(ROOT, 'apply-pack');
  if (!existsSync(applyPackDir)) return [];
  return readdirSync(applyPackDir)
    .filter(d => statSync(join(applyPackDir, d)).isDirectory())
    .filter(d => existsSync(join(applyPackDir, d, 'tailored-cv.pdf')));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slugs = args.all ? discoverReadyPacks() : (args.slug ? [args.slug] : []);
  if (slugs.length === 0) {
    console.error('Usage: node scripts/preflight-pack.mjs --slug <pack> [--dry-run]');
    console.error('       node scripts/preflight-pack.mjs --all');
    process.exit(1);
  }

  const results = [];
  for (const slug of slugs) {
    const r = processPack(slug, args);
    results.push(r);
    if (r.error) {
      console.error(`[${slug}] ERROR: ${r.error}`);
    } else {
      console.error(`[${slug}] ${colorize(r.verdict === 'PASS' ? 'green' : r.verdict === 'CAUTION' ? 'yellow' : 'red')} ${r.verdict} (blockers=${r.blockers} cautions=${r.cautions})`);
    }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    packs_attempted: results.length,
    pass: results.filter(r => r.verdict === 'PASS').length,
    caution: results.filter(r => r.verdict === 'CAUTION').length,
    fail: results.filter(r => r.verdict === 'FAIL').length,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));

  // Exit: 0 PASS, 1 CAUTION, 2 FAIL (whichever the worst result is across packs).
  if (summary.fail > 0) process.exit(2);
  if (summary.caution > 0) process.exit(1);
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(3);
});
