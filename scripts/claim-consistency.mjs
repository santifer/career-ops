#!/usr/bin/env node

/**
 * scripts/claim-consistency.mjs — cross-artifact claim consistency check
 * (audit Item F, 2026-05-18). Deterministic, no LLM spend. Runs as a
 * pre-flight gate alongside humanize-check.
 *
 * Extracts numeric and named claims from outbound apply-pack artifacts
 * (cover letter, LinkedIn DMs, form-field answers, one-pager) and verifies
 * each against a trusted source set:
 *
 *   1. apply-pack/<slug>/tailored-cv.md   (preferred — the JD-tailored CV)
 *   2. cv.md                              (master CV — fallback)
 *   3. article-digest.md                  (optional proof points)
 *
 * Claim patterns scanned:
 *   - Percentages              (\d+(?:\.\d+)?%)
 *   - Dollar amounts           (\$\s*\d+(?:\.\d+)?\s*[KMB]?)
 *   - Multipliers              (\d+(?:\.\d+)?\s*x\b)
 *   - Duration phrases         (\d+\+?\s*(?:year|yr|month|mo|week|wk|day|hour|hr)s?)
 *   - Counts of N              (\d+(?:,\d{3})*(?:\.\d+)?[KMB]?\+?\s+(?:engineers|producers|...))
 *
 * Each claim is searched verbatim (and with relaxed normalization) in the
 * trusted source. Misses are reported as 🟠 potential fabrication risks.
 *
 * CLI:
 *   node scripts/claim-consistency.mjs --slug <pack-slug>
 *   node scripts/claim-consistency.mjs --all
 *   node scripts/claim-consistency.mjs --slug <slug> --dry-run
 *
 * Output: apply-pack/<slug>/claim-consistency.md  (+ JSON summary on stdout)
 * Exit code: 0 if all claims verifiable, 1 if any unverified.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Claim extraction patterns ───────────────────────────────────────────────

const CLAIM_PATTERNS = [
  // Percentage: 90%, 99.5%, etc.
  { kind: 'percent',    re: /(\d+(?:\.\d+)?)\s*%/g },
  // Dollar amount: $300K, $1M, $1.5B, $255,000
  { kind: 'dollars',    re: /\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*([KMB])?/gi },
  // Multiplier: 3x, 4.5x, 10X
  { kind: 'multiplier', re: /(\d+(?:\.\d+)?)\s*[xX]\b/g },
  // Duration: 5 years, 6+ years, 18 months, 8 weeks, 24 hours
  { kind: 'duration',   re: /(\d+(?:\.\d+)?\+?)\s*(year|yr|month|mo|week|wk|day|hour|hr)s?\b/gi },
  // Count of N people/things: "1,000 engineers", "10+ producers", "9,000 machines"
  { kind: 'count',      re: /(\d+(?:,\d{3})*(?:\.\d+)?[KMB]?\+?)\s+(engineers|producers|hires|machines|hotspots|households|views|comments|followers|users|customers)/gi },
];

// ── Normalization helpers ───────────────────────────────────────────────────

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[,]/g, '')      // strip thousands separator
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeClaim(text) {
  return normalizeText(text).replace(/[$%]/g, '').trim();
}

function extractClaims(text) {
  const claims = [];
  for (const { kind, re } of CLAIM_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      claims.push({
        kind,
        raw: m[0].trim(),
        // Build a normalization key: the digits + suffix collapsed to lowercase,
        // commas stripped. This is what we search for in the trusted source.
        key: normalizeClaim(m[0]),
        idx: m.index,
      });
    }
  }
  return claims;
}

function verifyClaim(claim, trustedText) {
  const haystack = normalizeText(trustedText);
  const needle = claim.key;
  if (haystack.includes(needle)) return { verified: true, match: needle };

  // Soft-match: try common variants. For percentages, also check "X percent".
  if (claim.kind === 'percent') {
    const num = needle.replace(/[^0-9.]/g, '');
    if (num && haystack.includes(`${num} percent`)) return { verified: true, match: `${num} percent` };
  }
  // For dollars, try "$Xk" vs "$X,000" vs "X thousand".
  if (claim.kind === 'dollars') {
    const num = needle.replace(/[^0-9.kmb]/g, '');
    if (num && haystack.includes(num)) return { verified: true, match: num };
  }
  // For durations: "5 years" vs "five years" — rare but possible. Skip.
  // For counts: "1,000 engineers" matches via comma-stripped haystack already.
  return { verified: false, match: null };
}

function parseArgs(argv) {
  const a = { slug: null, all: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--slug' && argv[i + 1]) { a.slug = argv[++i]; continue; }
    if (argv[i] === '--all') { a.all = true; continue; }
    if (argv[i] === '--dry-run') { a.dryRun = true; continue; }
  }
  return a;
}

function loadTrustedText(packDir) {
  const parts = [];
  const tailoredCv = join(packDir, 'tailored-cv.md');
  if (existsSync(tailoredCv)) parts.push(readFileSync(tailoredCv, 'utf-8'));
  const masterCv = join(ROOT, 'cv.md');
  if (existsSync(masterCv)) parts.push(readFileSync(masterCv, 'utf-8'));
  const articleDigest = join(ROOT, 'article-digest.md');
  if (existsSync(articleDigest)) parts.push(readFileSync(articleDigest, 'utf-8'));
  return parts.join('\n\n');
}

function loadOutboundArtifacts(packDir) {
  const artifacts = [];
  // refresh-master Phase 5 deliverable 3: extended artifact list to cover
  // all 6 apply-pack outputs (cv-tailored + cover-letter + form-fields +
  // impact-doc + references + referrals). Cross-artifact coherence now
  // detects claim mismatch between any pair of these.
  const candidates = [
    'cv-tailored.md',
    'tailored-cv.md',
    'cover-letter.md',
    'one-pager.md',
    'form-fields.md',
    'impact-doc.md',
    'references.md',
    'referrals.md',
    'linkedin/hiring-manager.md',
    'linkedin/recruiter.md',
    'linkedin/peer-referral.md',
    'linkedin/connection-search.md',
  ];
  for (const name of candidates) {
    const p = join(packDir, name);
    if (existsSync(p)) artifacts.push({ name, text: readFileSync(p, 'utf-8') });
  }
  return artifacts;
}

/**
 * refresh-master Phase 5 deliverable 3: cross-artifact claim agreement check.
 * For every claim that appears in ≥2 artifacts, verify the wording is consistent.
 * Mismatches (e.g., "led 5-person team" in CV vs "led 7-person team" in cover
 * letter) → flagged as CROSS_ARTIFACT_MISMATCH.
 */
function crossArtifactCoherence(artifacts) {
  const mismatches = [];
  // Extract numeric claims from each artifact + group by claim-key
  const byKey = new Map();
  for (const art of artifacts) {
    const claims = extractClaims(art.text);
    for (const c of claims) {
      const key = c.kind === 'metric' ? `metric:${c.value || c.raw.slice(0, 20)}` : `${c.kind}:${c.key}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push({ artifact: art.name, raw: c.raw, key: c.key });
    }
  }
  // For each key that appears in ≥2 artifacts, check the raw strings agree
  for (const [key, instances] of byKey.entries()) {
    if (instances.length < 2) continue;
    const distinct = new Set(instances.map(i => i.raw.toLowerCase().replace(/\s+/g, ' ').trim()));
    if (distinct.size > 1) {
      mismatches.push({
        key,
        artifacts: instances.map(i => i.artifact),
        variants: Array.from(distinct),
      });
    }
  }
  return mismatches;
}

function buildReport(slug, artifactResults, crossMismatches = []) {
  const lines = [];
  lines.push(`# Claim consistency — ${slug}`);
  lines.push('');
  lines.push(`Generated by \`scripts/claim-consistency.mjs\` on ${new Date().toISOString().slice(0, 10)}.`);
  lines.push('');
  if (crossMismatches.length) {
    lines.push(`## 🔴 Cross-artifact claim mismatch (refresh-master Phase 5 deliverable 3)`);
    lines.push('');
    lines.push(`The same claim appears in multiple artifacts with DIFFERENT wording. This is a coherence risk: HMs reading more than one artifact will see contradictions.`);
    lines.push('');
    for (const m of crossMismatches) {
      lines.push(`### \`${m.key}\` — appears in ${m.artifacts.length} artifacts`);
      lines.push('');
      lines.push(`Artifacts: ${m.artifacts.map(a => `\`${a}\``).join(', ')}`);
      lines.push('');
      lines.push(`Variants:`);
      for (const v of m.variants) lines.push(`- > ${v}`);
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }
  lines.push('Each numeric/named claim found in outbound artifacts is searched against');
  lines.push('the trusted source set (`apply-pack/<slug>/tailored-cv.md` → `cv.md` →');
  lines.push('`article-digest.md`). Unverified claims are flagged 🟠 RISK — they may');
  lines.push('reflect inflation, hallucination, or a claim that exists in the corpus but');
  lines.push('uses different phrasing.');
  lines.push('');
  lines.push('## Per-artifact summary');
  lines.push('');
  lines.push('| Artifact | Claims | Verified | Unverified | Status |');
  lines.push('|---|---:|---:|---:|---|');
  for (const a of artifactResults) {
    const status = a.unverified.length === 0 ? '✅ OK' : '🟠 RISK';
    lines.push(`| \`${a.name}\` | ${a.total} | ${a.verified.length} | ${a.unverified.length} | ${status} |`);
  }
  lines.push('');
  for (const a of artifactResults) {
    lines.push(`## \`${a.name}\``);
    lines.push('');
    if (a.unverified.length === 0) {
      lines.push('All extracted claims verifiable from the trusted source set.');
    } else {
      lines.push(`### 🟠 Unverified claims (${a.unverified.length})`);
      lines.push('');
      for (const c of a.unverified) {
        lines.push(`- **${c.raw}** (${c.kind}) — not found in trusted source. Verify against cv.md or rewrite to match a documented metric.`);
      }
    }
    if (a.verified.length > 0) {
      lines.push('');
      lines.push(`### ✅ Verified claims (${a.verified.length})`);
      lines.push('');
      const seen = new Set();
      for (const c of a.verified) {
        if (seen.has(c.key)) continue;
        seen.add(c.key);
        lines.push(`- ${c.raw} (${c.kind})`);
      }
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
  const trustedText = loadTrustedText(packDir);
  if (!trustedText) {
    return { slug: packSlug, ok: false, error: 'no_trusted_source' };
  }
  const artifacts = loadOutboundArtifacts(packDir);
  if (artifacts.length === 0) {
    return { slug: packSlug, ok: true, error: 'no_outbound_artifacts', artifacts: [] };
  }

  const artifactResults = [];
  for (const art of artifacts) {
    const claims = extractClaims(art.text);
    const verified = [];
    const unverified = [];
    for (const c of claims) {
      const r = verifyClaim(c, trustedText);
      if (r.verified) verified.push(c);
      else unverified.push(c);
    }
    artifactResults.push({
      name: art.name,
      total: claims.length,
      verified,
      unverified,
    });
  }

  // refresh-master Phase 5 deliverable 3: cross-artifact coherence
  const crossMismatches = crossArtifactCoherence(artifacts);

  const report = buildReport(packSlug, artifactResults, crossMismatches);
  const allOk = artifactResults.every(a => a.unverified.length === 0);

  if (opts.dryRun) {
    process.stdout.write(report);
  } else {
    writeFileSync(join(packDir, 'claim-consistency.md'), report);
  }

  return {
    slug: packSlug,
    ok: allOk,
    artifacts: artifactResults.map(a => ({
      name: a.name,
      total: a.total,
      verified: a.verified.length,
      unverified: a.unverified.length,
    })),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slugs = [];
  if (args.all) {
    const applyPackDir = join(ROOT, 'apply-pack');
    for (const d of readdirSync(applyPackDir)) {
      if (statSync(join(applyPackDir, d)).isDirectory()) slugs.push(d);
    }
  } else if (args.slug) {
    slugs.push(args.slug);
  } else {
    console.error('Usage: node scripts/claim-consistency.mjs --slug <pack-slug> [--dry-run]');
    console.error('       node scripts/claim-consistency.mjs --all');
    process.exit(1);
  }

  const results = slugs.map(slug => processPack(slug, args));
  const summary = {
    timestamp: new Date().toISOString(),
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
