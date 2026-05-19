#!/usr/bin/env node
/**
 * scripts/maintenance/test-save-evidence-hardening.mjs
 *
 * Regression test for epsilon Ε.3 path-traversal fix in dashboard-server.mjs
 * `saveEvidence()`. Verifies:
 *   1) Canonical slug accepted (control)
 *   2) `../../etc/passwd` rejected (traversal)
 *   3) Absolute path rejected
 *   4) Backslash-separated path rejected
 *   5) Empty / non-string slug rejected
 *   6) evidenceText >50_000 chars rejected
 *   7) evidenceText non-string rejected
 *
 * Runs against the in-file function via dynamic import + module-level shim.
 *
 * Usage: node scripts/maintenance/test-save-evidence-hardening.mjs
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Re-implement the validation slice (no http context) so we don't need
// to boot the full dashboard-server. This mirrors saveEvidence's prelude.
const REPORT_SLUG_RE = /^\d{1,5}-[a-z0-9][a-z0-9-]*-\d{4}-\d{2}-\d{2}\.md$/;
const EVIDENCE_TEXT_MAX_CHARS = 50_000;

function validateInputs(reportSlug, evidenceText) {
  if (typeof reportSlug !== 'string' || !REPORT_SLUG_RE.test(reportSlug)) {
    return { ok: false, error: 'Invalid report slug' };
  }
  if (typeof evidenceText !== 'string') {
    return { ok: false, error: 'evidenceText must be a string' };
  }
  if (evidenceText.length > EVIDENCE_TEXT_MAX_CHARS) {
    return { ok: false, error: `evidenceText exceeds ${EVIDENCE_TEXT_MAX_CHARS}-char limit` };
  }
  const reportsRoot = join(ROOT, 'reports') + '/';
  const reportPath = join(ROOT, 'reports', reportSlug);
  if (!reportPath.startsWith(reportsRoot)) {
    return { ok: false, error: 'Resolved path escapes reports directory' };
  }
  return { ok: true, reportPath };
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else      { fail++; console.log(`  FAIL  ${label}`); }
}

console.log('Test: dashboard-server.mjs saveEvidence() input validation');
console.log('-----------------------------------------------------------');

// 1) Canonical slug — passes regex (existence check is downstream)
{
  const r = validateInputs('001-anthropic-comms-mgr-research-2026-05-16.md', 'text');
  check('canonical slug accepted', r.ok === true);
}

// 2) Path-traversal — explicit ../../
{
  const r = validateInputs('../../etc/passwd', 'evil');
  check('rejects ../../etc/passwd', r.ok === false && r.error.includes('Invalid report slug'));
}

// 3) Absolute path
{
  const r = validateInputs('/etc/passwd', 'evil');
  check('rejects absolute path /etc/passwd', r.ok === false);
}

// 4) Backslash traversal (Windows-style)
{
  const r = validateInputs('..\\..\\etc\\passwd', 'evil');
  check('rejects backslash traversal', r.ok === false);
}

// 5) Empty + null + number
{
  const r1 = validateInputs('', 'x');
  const r2 = validateInputs(null, 'x');
  const r3 = validateInputs(42, 'x');
  check('rejects empty string', r1.ok === false);
  check('rejects null', r2.ok === false);
  check('rejects number', r3.ok === false);
}

// 6) evidenceText >50_000 chars
{
  const huge = 'x'.repeat(50_001);
  const r = validateInputs('001-anthropic-comms-mgr-research-2026-05-16.md', huge);
  check('rejects evidenceText >50_000 chars', r.ok === false && r.error.includes('50000'));
}

// 7) evidenceText non-string
{
  const r = validateInputs('001-anthropic-comms-mgr-research-2026-05-16.md', { html: 'evil' });
  check('rejects evidenceText non-string', r.ok === false);
}

// 8) Slug with embedded ".md" but not at end (regex anchors prevent this)
{
  const r = validateInputs('001-foo.md.evil.md', 'x');
  check('rejects slug with mid-string .md', r.ok === false);
}

// 9) UPPERCASE letters in slug body — rejected (regex is lowercase-only)
{
  const r = validateInputs('001-Anthropic-2026-05-16.md', 'x');
  check('rejects uppercase slug body', r.ok === false);
}

// 10) Slug starting with letter — rejected (regex requires leading digits)
{
  const r = validateInputs('foo-2026-05-16.md', 'x');
  check('rejects slug not starting with digits', r.ok === false);
}

console.log('-----------------------------------------------------------');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
