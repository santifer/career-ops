#!/usr/bin/env node

/**
 * scripts/jd-keyword-score.mjs — JD-keyword overlap scorer (audit Item E,
 * 2026-05-18). Deterministic, no LLM spend. Runs as a post-build / pre-flight
 * gate to flag tailored apply-pack artifacts that miss the JD's load-bearing
 * terms.
 *
 * Per-pack workflow:
 *   1. Read JD body from apply-pack/<slug>/grok-intel.md (Block A excerpt) or
 *      apply-pack/<slug>/README.md (role context); fall back to the eval
 *      report at reports/<num>-<slug>-<date>.md if those are sparse.
 *   2. Tokenize, lowercase, drop stopwords + numeric-only tokens, count.
 *      Sort by raw frequency; cap at top-20 (configurable).
 *   3. For each artifact (cv / cover-letter / form-fields / one-pager),
 *      compute the overlap with the JD top-20 — count matches, list misses.
 *   4. Write a markdown report to apply-pack/<slug>/keyword-alignment.md
 *      with the scoreboard + recommended additions.
 *
 * CLI:
 *   node scripts/jd-keyword-score.mjs --slug 048-anthropic-engineering-editorial-lead
 *   node scripts/jd-keyword-score.mjs --all                  # every apply-pack dir
 *   node scripts/jd-keyword-score.mjs --slug <slug> --top 30 # custom keyword cap
 *   node scripts/jd-keyword-score.mjs --slug <slug> --dry-run # print to stdout
 *
 * Exit code: 0 if every artifact hits the alignment floor (default ≥50%),
 *            1 if any pack falls below.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// English stopword set — small, hand-curated for resume/JD parsing.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have', 'in', 'is', 'it',
  'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'were', 'will', 'with', 'you', 'your',
  'we', 'our', 'us', 'they', 'them', 'their', 'be', 'been', 'being', 'do', 'does', 'did', 'doing',
  'can', 'could', 'should', 'would', 'may', 'might', 'must', 'shall', 'so', 'if', 'then', 'than',
  'but', 'not', 'no', 'nor', 'because', 'about', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'under', 'over', 'again', 'further', 'once', 'here', 'there',
  'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
  'some', 'such', 'only', 'own', 'same', 'too', 'very', 'just', 'one', 'two', 'three', 'i',
  'me', 'my', 'who', 'whom', 'which', 'what', 'these', 'those', 'am', 'doesn', 'don', 'didn',
  'haven', 'isn', 'wasn', 'weren', 'won', 'wouldn', 'couldn', 'shouldn', 'aren', 'shan',
  'role', 'work', 'team', 'company', 'job', 'position', 'opportunity', 'candidate', 'experience',
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s\-/]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(t => t.replace(/^[-/]+|[-/]+$/g, ''))
    .filter(t => t.length >= 3)
    .filter(t => !/^\d+$/.test(t))
    .filter(t => !STOPWORDS.has(t));
}

function frequency(tokens) {
  const counts = new Map();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  return counts;
}

function topN(counts, n) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([term, count]) => ({ term, count }));
}

function parseArgs(argv) {
  const a = { slug: null, all: false, top: 20, dryRun: false, threshold: 0.5 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--slug' && argv[i + 1]) { a.slug = argv[++i]; continue; }
    if (argv[i] === '--all') { a.all = true; continue; }
    if (argv[i] === '--top' && argv[i + 1]) { a.top = Number(argv[++i]); continue; }
    if (argv[i] === '--dry-run') { a.dryRun = true; continue; }
    if (argv[i] === '--threshold' && argv[i + 1]) { a.threshold = Number(argv[++i]); continue; }
  }
  return a;
}

/**
 * Load and concatenate JD-source text for a pack. Tries grok-intel.md,
 * README.md, then the eval report linked in applications.md.
 */
function loadJdText(packDir, slug) {
  const parts = [];
  for (const name of ['grok-intel.md', 'README.md', 'one-pager.md']) {
    const p = join(packDir, name);
    if (existsSync(p)) parts.push(readFileSync(p, 'utf-8'));
  }
  // Fallback: eval report. Slug pattern: <padded-rowid>-<roleSlug>; the
  // report is reports/<rowid>-<slug>-<date>.md OR reports/<num>-<slug>-<date>.md.
  const m = slug.match(/^(\d+)-(.+)$/);
  if (m) {
    const rowid = m[1];
    const reportsDir = join(ROOT, 'reports');
    if (existsSync(reportsDir)) {
      const reports = readdirSync(reportsDir).filter(f =>
        f.startsWith(`${rowid}-`) || f.startsWith(`${String(Number(rowid)).padStart(3, '0')}-`)
      );
      for (const r of reports) {
        const p = join(reportsDir, r);
        if (existsSync(p) && statSync(p).isFile()) parts.push(readFileSync(p, 'utf-8'));
      }
    }
  }
  return parts.join('\n\n');
}

function loadArtifact(packDir, filename) {
  const p = join(packDir, filename);
  if (!existsSync(p)) return null;
  return { path: filename, text: readFileSync(p, 'utf-8') };
}

function scoreOverlap(jdTopTerms, artifactText) {
  const artifactTokens = new Set(tokenize(artifactText));
  const hits = [];
  const misses = [];
  for (const { term } of jdTopTerms) {
    if (artifactTokens.has(term)) hits.push(term);
    else misses.push(term);
  }
  return {
    hits,
    misses,
    score: jdTopTerms.length > 0 ? hits.length / jdTopTerms.length : 0,
  };
}

function buildReport(slug, jdTopTerms, artifactScores, threshold) {
  const lines = [];
  lines.push(`# Keyword alignment — ${slug}`);
  lines.push('');
  lines.push(`Generated by \`scripts/jd-keyword-score.mjs\` on ${new Date().toISOString().slice(0, 10)}.`);
  lines.push(`Threshold: ${Math.round(threshold * 100)}%. Below threshold = ATS-filter risk.`);
  lines.push('');
  lines.push('## JD top terms');
  lines.push('');
  lines.push('| Rank | Term | Frequency |');
  lines.push('|---:|---|---:|');
  jdTopTerms.forEach((t, i) => {
    lines.push(`| ${i + 1} | \`${t.term}\` | ${t.count} |`);
  });
  lines.push('');
  lines.push('## Per-artifact overlap');
  lines.push('');
  lines.push('| Artifact | Hits | Score | Status |');
  lines.push('|---|---:|---:|---|');
  for (const a of artifactScores) {
    const pct = Math.round(a.score * 100);
    const status = a.score >= threshold ? '✅ OK' : '🟠 BELOW THRESHOLD';
    lines.push(`| \`${a.path}\` | ${a.hits.length} / ${jdTopTerms.length} | ${pct}% | ${status} |`);
  }
  lines.push('');
  lines.push('## Misses per artifact');
  lines.push('');
  for (const a of artifactScores) {
    lines.push(`### \`${a.path}\` (${a.misses.length} misses)`);
    if (a.misses.length === 0) {
      lines.push('All top JD terms present.');
    } else {
      lines.push('Recommended additions: ' + a.misses.map(t => `\`${t}\``).join(', '));
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

function processPack(packSlug, opts) {
  const packDir = join(ROOT, 'apply-pack', packSlug);
  if (!existsSync(packDir) || !statSync(packDir).isDirectory()) {
    return { slug: packSlug, ok: false, error: 'pack_dir_not_found' };
  }

  const jdText = loadJdText(packDir, packSlug);
  if (!jdText || jdText.trim().length < 200) {
    return { slug: packSlug, ok: false, error: 'jd_text_too_short' };
  }
  const jdTokens = tokenize(jdText);
  const jdCounts = frequency(jdTokens);
  const jdTopTerms = topN(jdCounts, opts.top);

  const artifactNames = ['tailored-cv.md', 'cover-letter.md', 'form-fields.md', 'one-pager.md'];
  const cvMdFallback = readFileSync(join(ROOT, 'cv.md'), 'utf-8'); // for cv fallback
  const artifactScores = [];
  for (const name of artifactNames) {
    let a = loadArtifact(packDir, name);
    if (!a && name === 'tailored-cv.md') {
      // Fall back to master cv.md so we can still score.
      a = { path: 'cv.md (fallback)', text: cvMdFallback };
    }
    if (!a) continue;
    artifactScores.push({ path: a.path, ...scoreOverlap(jdTopTerms, a.text) });
  }

  const report = buildReport(packSlug, jdTopTerms, artifactScores, opts.threshold);
  const allOk = artifactScores.every(a => a.score >= opts.threshold);

  if (opts.dryRun) {
    process.stdout.write(report);
  } else {
    const outPath = join(packDir, 'keyword-alignment.md');
    writeFileSync(outPath, report);
  }

  return {
    slug: packSlug,
    ok: allOk,
    jdTopTerms: jdTopTerms.length,
    artifacts: artifactScores.map(a => ({ path: a.path, score: Math.round(a.score * 100), misses: a.misses.length })),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slugs = [];
  if (args.all) {
    const applyPackDir = join(ROOT, 'apply-pack');
    if (!existsSync(applyPackDir)) {
      console.error(`apply-pack/ directory not found at ${applyPackDir}`);
      process.exit(1);
    }
    for (const d of readdirSync(applyPackDir)) {
      if (statSync(join(applyPackDir, d)).isDirectory()) slugs.push(d);
    }
  } else if (args.slug) {
    slugs.push(args.slug);
  } else {
    console.error('Usage: node scripts/jd-keyword-score.mjs --slug <pack-slug> [--top 20] [--threshold 0.5] [--dry-run]');
    console.error('       node scripts/jd-keyword-score.mjs --all');
    process.exit(1);
  }

  const results = [];
  for (const slug of slugs) {
    results.push(processPack(slug, args));
  }

  const summary = {
    timestamp: new Date().toISOString(),
    threshold: args.threshold,
    top_n: args.top,
    packs_attempted: results.length,
    packs_ok: results.filter(r => r.ok).length,
    packs_failed: results.filter(r => !r.ok).length,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.packs_failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});
