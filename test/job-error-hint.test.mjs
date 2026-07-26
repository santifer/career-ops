/**
 * job-error-hint.test.mjs — regression tests for jobErrorHint()
 * (web/src/lib/job-error-hint.mjs, PR #2158 CodeRabbit fixup).
 *
 * jobErrorHint() classifies WHY a worker job errored, reading only the job's
 * terminal step label. The auth pattern used to be a bare "auth" substring,
 * which matched inside unrelated words like "author" (career-ops evaluates
 * AI/tech job postings, so terminal labels can legitimately mention parsing
 * failures on JD/CV author metadata) and incorrectly produced the sign-in
 * prompt for a completely unrelated error.
 *
 * web/ lives deliberately OUTSIDE the auto-updater's world (its own
 * release-please component; see validate-system-paths-coverage.mjs
 * EXCLUDE_PREFIXES) -- a core-only install has no web/ tree, so this test
 * warns rather than fails when web/ is absent, matching the HAS_WEB pattern
 * used by test/apply-cv-resolver.test.mjs and test/followup-view.test.mjs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const JOB_ERROR_HINT = join(ROOT, 'web', 'src', 'lib', 'job-error-hint.mjs');
const HAS_WEB = existsSync(JOB_ERROR_HINT);

if (!HAS_WEB) {
  test('job-error-hint: skipped — web/ not present (core-only install; web/ is excluded from the auto-updater by design)', () => {});
} else {
  const { jobErrorHint } = await import(pathToFileURL(JOB_ERROR_HINT).href);

  function jobWithLabel(label) {
    return { status: 'error', steps: [{ label }] };
  }

  test('jobErrorHint: "author" in an unrelated terminal label does NOT trigger the sign-in hint (the bug this fixup addresses)', () => {
    assert.equal(jobErrorHint(jobWithLabel('Failed to parse author metadata')), null);
  });

  test('jobErrorHint: a genuine authentication label still triggers the sign-in hint', () => {
    const hint = jobErrorHint(jobWithLabel('The CLI exited with an error — is it installed and authenticated?'));
    assert.equal(hint?.kind, 'auth');
  });

  test('jobErrorHint: "unauthorized" still triggers the sign-in hint', () => {
    assert.equal(jobErrorHint(jobWithLabel('401 unauthorized')).kind, 'auth');
  });

  test('jobErrorHint: "No CLI configured" still triggers the sign-in hint', () => {
    assert.equal(jobErrorHint(jobWithLabel('No CLI configured — open Config')).kind, 'auth');
  });

  test('jobErrorHint: connection and interrupted labels are unaffected', () => {
    assert.equal(jobErrorHint(jobWithLabel('Connection error')).kind, 'connection');
    assert.equal(jobErrorHint(jobWithLabel('Interrupted (page reloaded)')).kind, 'interrupted');
  });

  test('jobErrorHint: a non-error job returns null', () => {
    assert.equal(jobErrorHint({ status: 'success', steps: [{ label: 'Done' }] }), null);
    assert.equal(jobErrorHint(null), null);
  });
}
