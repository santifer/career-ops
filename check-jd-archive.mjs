#!/usr/bin/env node
/**
 * check-jd-archive.mjs — JD Archival Validator for career-ops
 *
 * A report's `**URL:**` header is a live pointer, not an archive — it rots
 * the day a posting closes or gets taken down, which reliably happens
 * somewhere in the weeks between applying and a later interview round. Prior
 * to this script, "also archive the JD" was a prompt-only instruction in
 * `modes/pdf.md` step 4 ("write the JD to jds/{slug}.md if it isn't already
 * one") with zero code enforcement — on a real tracker with 7 saved reports,
 * `jds/` was completely empty. This is the watchdog: zero LLM, zero network,
 * zero writes.
 *
 * A report counts as archived when EITHER holds:
 *   (a) it carries a `## Job Description` section (the primary mechanism —
 *       `## Job Description (archived verbatim)` per modes/oferta.md and
 *       modes/pdf.md) with substantive content, not an empty placeholder, or
 *   (b) a corresponding jds/ capture exists for it.
 *
 * (b) reuses jd-capture.mjs's findCaptureForReport — the same report-number
 * lookup outcome.mjs already relies on — rather than inventing a new slug
 * matcher. That function only resolves captures written with a numeric
 * report-number prefix (archive-posting.mjs --report=N), which AGENTS.md's
 * "JD captures (jds/)" section already documents as the recommended writer;
 * the other jds/ naming conventions in play (date-prefixed, sha1-suffixed,
 * bare company-role slugs) have no report number to key on and are not
 * reliably resolvable back to a specific report, so they cannot be credited
 * here. The report's own filename ({###}-{company-slug}-{YYYY-MM-DD}.md)
 * already carries the canonical company slug used to disambiguate captures —
 * no separate slugify pass is needed.
 *
 * Reports missing BOTH are flagged `missing-jd-archive`.
 *
 * Run: node check-jd-archive.mjs                        (JSON to stdout)
 *      node check-jd-archive.mjs --summary               (human-readable table)
 *      node check-jd-archive.mjs --reports-dir path/to    (override, for testing)
 *      node check-jd-archive.mjs --jds-dir path/to        (override, for testing)
 *      node check-jd-archive.mjs --self-test
 *      node check-jd-archive.mjs --help
 *
 * Exit codes: 1 if any `missing-jd-archive` finding, 0 otherwise.
 *
 * Issue #2789 — github.com/santifer/career-ops
 */

import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { flagValue } from './lib/cli-flags.mjs';
import { findCaptureForReport } from './jd-capture.mjs';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPORTS_DIR = join(CAREER_OPS, 'reports');
const DEFAULT_JDS_DIR = join(CAREER_OPS, 'jds');

// Below this many non-whitespace characters, a "## Job Description" section
// is treated as an unfilled placeholder, not an archive — a bare heading
// with nothing under it (or a one-line "(see URL above)" stub) should not
// pass as verbatim JD text.
const MIN_ARCHIVE_CHARS = 40;

const USAGE = `Usage:
  node check-jd-archive.mjs                      # full JSON findings to stdout
  node check-jd-archive.mjs --summary             # human-readable table
  node check-jd-archive.mjs --reports-dir <path>  # override reports/ (testing)
  node check-jd-archive.mjs --jds-dir <path>      # override jds/ (testing)
  node check-jd-archive.mjs --self-test           # run the in-memory test suite
  node check-jd-archive.mjs --help                # print this usage block and exit`;

// --- CLI args ---
const args = process.argv.slice(2);
const summaryMode = args.includes('--summary');
const selfTestMode = args.includes('--self-test');
const reportsDirArg = flagValue(args, '--reports-dir') ?? null;
const jdsDirArg = flagValue(args, '--jds-dir') ?? null;

// --- Report filename parsing ---
// reports/{###}-{company-slug}-{YYYY-MM-DD}.md (AGENTS.md "Save report .md").
// The company slug may itself contain hyphens (e.g. confidential-hays for
// agency-mediated postings, #1596), so the match is anchored on the fixed
// numeric-prefix and trailing-date shapes and everything between is the slug.
const REPORT_FILENAME_RE = /^(\d+)-(.+)-(\d{4}-\d{2}-\d{2})\.md$/;

export function parseReportFilename(filename) {
  const m = REPORT_FILENAME_RE.exec(filename);
  if (!m) return null;
  return { reportNum: parseInt(m[1], 10), companySlug: m[2], date: m[3] };
}

// --- Archive-section detection ---
// Matches "## Job Description", with or without a parenthetical/suffix (the
// canonical heading is "## Job Description (archived verbatim)"). Content is
// read up to the next "## " heading or end of file; HTML comments are
// stripped before the length check so a commented-out template stub doesn't
// count as archived text.
const JD_HEADING_RE = /^##\s+Job Description\b.*$/im;

export function hasEmbeddedJdArchive(content) {
  const text = String(content ?? '');
  const m = JD_HEADING_RE.exec(text);
  if (!m) return false;
  const rest = text.slice(m.index + m[0].length);
  const nextHeadingOffset = rest.search(/^##\s+/m);
  const section = nextHeadingOffset === -1 ? rest : rest.slice(0, nextHeadingOffset);
  const stripped = section.replace(/<!--[\s\S]*?-->/g, '').trim();
  return stripped.length >= MIN_ARCHIVE_CHARS;
}

// --- Core check ---
// Pure function over an already-resolved reports/jds directory pair, so the
// self-test runs entirely on its own fixtures.
export function checkJdArchive(reportsDir, jdsDir) {
  const findings = [];
  const warnings = [];
  let reportsScanned = 0;

  if (!existsSync(reportsDir)) {
    return { reportsScanned, findings, warnings };
  }

  const files = readdirSync(reportsDir).filter((f) => f.endsWith('.md')).sort();

  for (const file of files) {
    reportsScanned += 1;

    let content;
    try {
      content = readFileSync(join(reportsDir, file), 'utf-8');
    } catch (e) {
      warnings.push({ type: 'warning', file, detail: `could not read file: ${e.message.split('\n')[0]}` });
      continue;
    }

    if (hasEmbeddedJdArchive(content)) continue;

    const meta = parseReportFilename(file);
    let capture = null;
    if (meta && existsSync(jdsDir)) {
      capture = findCaptureForReport(jdsDir, meta.reportNum, { companySlug: meta.companySlug });
    }
    if (capture !== null) continue;

    findings.push({
      type: 'missing-jd-archive',
      file,
      report: meta ? meta.reportNum : null,
      companySlug: meta ? meta.companySlug : null,
      detail: meta
        ? `no "## Job Description" section with archived JD text, and no jds/ capture found for report ${meta.reportNum} (company slug "${meta.companySlug}")`
        : `no "## Job Description" section with archived JD text, and the filename does not match the {###}-{company-slug}-{YYYY-MM-DD}.md convention so no jds/ capture could be resolved`,
    });
  }

  return { reportsScanned, findings, warnings };
}

export const hasMissingArchive = (findings) => findings.some((f) => f.type === 'missing-jd-archive');

// --- Summary mode ---
function printSummary(result) {
  const { reportsScanned, findings, warnings } = result;
  console.log(`\n${'='.repeat(78)}`);
  console.log('  JD Archive Coverage — career-ops');
  console.log(`  reports scanned: ${reportsScanned}`);
  console.log(`${'='.repeat(78)}\n`);

  if (findings.length === 0) {
    console.log(reportsScanned === 0
      ? '  No report files found under reports/.\n'
      : '  Every report has an archived JD (embedded section or jds/ capture).\n');
  } else {
    const header = '  ' + 'Report'.padEnd(10) + 'File'.padEnd(38) + 'Detail';
    console.log(header);
    console.log('  ' + '-'.repeat(90));
    for (const f of findings) {
      const reportCol = (f.report !== null ? String(f.report) : '?').padEnd(10);
      const fileCol = f.file.substring(0, 36).padEnd(38);
      console.log('  ' + reportCol + fileCol + f.detail);
    }
    console.log('');
  }

  if (warnings.length) {
    console.log(`  ${warnings.length} warning${warnings.length === 1 ? '' : 's'} (files skipped, never fatal):`);
    for (const w of warnings) {
      console.log(`    ${w.file}: ${w.detail}`);
    }
    console.log('');
  }
}

// --- Self-test (fixtures only — never reads the real reports/ for findings) ---
function runSelfTest() {
  let pass = 0;
  let fail = 0;
  const check = (cond, label) => {
    if (cond) { pass += 1; } else { fail += 1; console.error(`  FAIL: ${label}`); }
  };

  // --- Unit-level checks on the pure functions ---
  check(parseReportFilename('042-acme-2026-01-15.md')?.reportNum === 42, 'parseReportFilename extracts the report number');
  check(parseReportFilename('042-acme-2026-01-15.md')?.companySlug === 'acme', 'parseReportFilename extracts a simple company slug');
  check(parseReportFilename('042-confidential-hays-2026-01-15.md')?.companySlug === 'confidential-hays',
    'parseReportFilename extracts a hyphenated company slug (agency-mediated posting, #1596)');
  check(parseReportFilename('not-a-report.md') === null, 'parseReportFilename rejects a non-conforming filename');
  check(parseReportFilename('042-acme-2026-01-15.txt') === null, 'parseReportFilename requires the .md extension');

  check(hasEmbeddedJdArchive('## Job Description (archived verbatim)\n\n' + 'A'.repeat(50) + '\n\n## Machine Summary\nfoo'),
    'hasEmbeddedJdArchive recognizes the canonical heading with substantive content');
  check(hasEmbeddedJdArchive('## Job Description\n\nWe are looking for a Senior Widget Engineer to join our growing platform team.'),
    'hasEmbeddedJdArchive recognizes a bare "## Job Description" heading (no parenthetical) with content');
  check(!hasEmbeddedJdArchive('## Job Description (archived verbatim)\n\n<!-- paste JD here -->\n\n## Machine Summary'),
    'hasEmbeddedJdArchive rejects a section containing only an HTML-comment placeholder');
  check(!hasEmbeddedJdArchive('## Job Description (archived verbatim)\n\nTBD\n\n## Machine Summary'),
    'hasEmbeddedJdArchive rejects a section too short to be real JD text');
  check(!hasEmbeddedJdArchive('# Evaluation: Acme — Engineer\n\n**URL:** https://example.com\n'),
    'hasEmbeddedJdArchive returns false when there is no Job Description section at all');

  // --- Fixture directory tree (mkdtempSync, mirrors the repo's own test convention) ---
  const tmpDir = mkdtempSync(join(tmpdir(), 'check-jd-archive-test-'));
  const reportsDir = join(tmpDir, 'reports');
  const jdsDir = join(tmpDir, 'jds');
  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(jdsDir, { recursive: true });

  try {
    // Fixture 1: no archive section, no jds/ capture -> flagged.
    writeFileSync(join(reportsDir, '001-acme-2026-01-15.md'), [
      '# Evaluation: Acme — Senior Widget Engineer',
      '',
      '**Date:** 2026-01-15',
      '**URL:** https://example.com/jobs/acme-widget-engineer',
      '**Score:** 4.2/5',
      '',
      '## Machine Summary',
      'score: 4.2',
    ].join('\n'));

    // Fixture 2: embedded archive section with substantive content -> not flagged.
    writeFileSync(join(reportsDir, '002-globex-2026-01-16.md'), [
      '# Evaluation: Globex — Instructional Designer',
      '',
      '**Date:** 2026-01-16',
      '**URL:** https://example.com/jobs/globex-id',
      '**Score:** 4.5/5',
      '',
      '## Job Description (archived verbatim)',
      '',
      'Globex Corporation is seeking an Instructional Designer to build learning',
      'experiences for our internal enablement platform. Requirements: 3+ years',
      'of L&D experience, familiarity with Articulate 360, strong stakeholder',
      'communication skills.',
      '',
      '## Machine Summary',
      'score: 4.5',
    ].join('\n'));

    // Fixture 3: no archive section, but a matching jds/ capture (report-number
    // prefixed, per archive-posting.mjs --report=N) -> not flagged (either form counts).
    writeFileSync(join(reportsDir, '003-initech-2026-01-17.md'), [
      '# Evaluation: Initech — EdTech Specialist',
      '',
      '**Date:** 2026-01-17',
      '**URL:** https://example.com/jobs/initech-edtech',
      '**Score:** 4.0/5',
      '',
      '## Machine Summary',
      'score: 4.0',
    ].join('\n'));
    writeFileSync(join(jdsDir, '003-2026-01-17_initech_edtech-specialist.pdf'), 'fake-pdf-bytes');

    // Fixture 4: filename doesn't match the {###}-{slug}-{date}.md convention ->
    // still flagged (can't be resolved to a jds/ capture), but with the
    // "no meta" detail branch rather than a crash.
    writeFileSync(join(reportsDir, 'hand-named-report.md'), '# Evaluation: Weyland — Analyst\n\n**URL:** https://example.com\n');

    const result = checkJdArchive(reportsDir, jdsDir);

    check(result.reportsScanned === 4, `all 4 fixture reports scanned (got ${result.reportsScanned})`);

    const flaggedFiles = new Set(result.findings.map((f) => f.file));
    check(flaggedFiles.has('001-acme-2026-01-15.md'), 'report with neither archive form is flagged missing-jd-archive');
    check(!flaggedFiles.has('002-globex-2026-01-16.md'), 'report with an embedded archive section is not flagged');
    check(!flaggedFiles.has('003-initech-2026-01-17.md'), 'report with a matching jds/ capture (no embedded section) is not flagged');
    check(flaggedFiles.has('hand-named-report.md'), 'report with a non-conforming filename and no archive section is flagged');

    const handNamedFinding = result.findings.find((f) => f.file === 'hand-named-report.md');
    check(handNamedFinding?.report === null, 'non-conforming filename finding carries report: null instead of guessing');

    check(result.findings.every((f) => f.type === 'missing-jd-archive'), 'every finding uses the missing-jd-archive type');
    check(hasMissingArchive(result.findings) === true, 'hasMissingArchive is true when findings are present');

    // Company-slug disambiguation: a jds/ capture with the right report-number
    // prefix but a DIFFERENT company must not be credited to this report.
    const mismatchReportsDir = join(tmpDir, 'reports-mismatch');
    const mismatchJdsDir = join(tmpDir, 'jds-mismatch');
    mkdirSync(mismatchReportsDir, { recursive: true });
    mkdirSync(mismatchJdsDir, { recursive: true });
    writeFileSync(join(mismatchReportsDir, '005-umbrella-2026-01-20.md'), '# Evaluation: Umbrella — Analyst\n\n**URL:** https://example.com\n');
    writeFileSync(join(mismatchJdsDir, '005-2026-01-20_othercorp_analyst.pdf'), 'fake-pdf-bytes');
    const mismatchResult = checkJdArchive(mismatchReportsDir, mismatchJdsDir);
    check(mismatchResult.findings.some((f) => f.file === '005-umbrella-2026-01-20.md'),
      'a jds/ capture for the same report number but a different company is not credited (company-slug guard)');

    // Empty reports dir -> clean empty result, exit 0 path.
    const emptyReportsDir = join(tmpDir, 'reports-empty');
    mkdirSync(emptyReportsDir, { recursive: true });
    const emptyResult = checkJdArchive(emptyReportsDir, jdsDir);
    check(emptyResult.reportsScanned === 0 && emptyResult.findings.length === 0 && !hasMissingArchive(emptyResult.findings),
      'no report files -> empty result, exit 0 (the designed empty-repo case, matches a fresh checkout with reports/*.md gitignored)');

    // Missing reports dir entirely (never created) -> same clean empty result, no crash.
    const neverCreatedResult = checkJdArchive(join(tmpDir, 'does-not-exist'), jdsDir);
    check(neverCreatedResult.reportsScanned === 0 && neverCreatedResult.findings.length === 0,
      'missing reports directory -> empty result, no crash');

    // Missing jds dir (never created) with no embedded section -> still flagged, no crash.
    const noJdsDirResult = checkJdArchive(reportsDir, join(tmpDir, 'jds-does-not-exist'));
    check(noJdsDirResult.findings.some((f) => f.file === '001-acme-2026-01-15.md'),
      'missing jds/ directory does not crash the lookup — falls through to flagged');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`\n  check-jd-archive self-test: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

// --- Run (CLI only; guarded so the module is safely importable for tests) ---
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }

  if (selfTestMode) {
    runSelfTest();
  }

  const reportsDir = reportsDirArg || DEFAULT_REPORTS_DIR;
  const jdsDir = jdsDirArg || DEFAULT_JDS_DIR;

  const result = checkJdArchive(reportsDir, jdsDir);

  if (summaryMode) {
    printSummary(result);
  } else {
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      reportsScanned: result.reportsScanned,
      findings: result.findings,
      warnings: result.warnings,
    }, null, 2));
  }

  process.exit(hasMissingArchive(result.findings) ? 1 : 0);
}
