import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  uploadResume,
  uploadCoverLetter,
  formatUploadDetails,
  RESUME_SELECTORS,
  CL_SELECTORS,
} from '../scripts/form-fill.mjs';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const FIXTURES   = path.join(ROOT, 'fixtures');

// Shared real files for fs.existsSync checks
if (!fs.existsSync(FIXTURES)) fs.mkdirSync(FIXTURES, { recursive: true });
const REAL_RESUME = path.join(FIXTURES, 'test-resume.pdf');
const REAL_CL     = path.join(FIXTURES, 'test-cl.txt');
if (!fs.existsSync(REAL_RESUME)) fs.writeFileSync(REAL_RESUME, 'PDF stub', 'utf8');
if (!fs.existsSync(REAL_CL))     fs.writeFileSync(REAL_CL,     'CL stub',  'utf8');

// ── Mock page factory ─────────────────────────────────────────────────────────
//
// This mock matches EXACTLY one selector string — lets us test fallthrough behavior
// by specifying which specific selector in the chain should match.

function makeExactMockPage({ matchingSelector = null } = {}) {
  const uploaded = {};
  return {
    locator: (selector) => ({
      first: function() { return this; },
      count: async () => (matchingSelector && selector === matchingSelector ? 1 : 0),
      setInputFiles: async (val) => { uploaded[selector] = val; },
    }),
    _uploaded: uploaded,
  };
}

// Personal stubs
function makePersonalWith(resumePath, clDefaultPath = '') {
  return {
    resume: { path: resumePath },
    cover_letter: { default_path: clDefaultPath },
  };
}

// ── Selector constants ────────────────────────────────────────────────────────

describe('selector constants', () => {

  test('RESUME_SELECTORS has at least 8 strategies', () => {
    assert.ok(RESUME_SELECTORS.length >= 8, `expected ≥8 strategies, got ${RESUME_SELECTORS.length}`);
  });

  test('CL_SELECTORS has at least 7 strategies', () => {
    assert.ok(CL_SELECTORS.length >= 7, `expected ≥7 strategies, got ${CL_SELECTORS.length}`);
  });

  test('RESUME_SELECTORS are all unique', () => {
    const unique = new Set(RESUME_SELECTORS);
    assert.equal(unique.size, RESUME_SELECTORS.length, 'duplicate selector found');
  });

  test('CL_SELECTORS are all unique', () => {
    const unique = new Set(CL_SELECTORS);
    assert.equal(unique.size, CL_SELECTORS.length, 'duplicate selector found');
  });

});

// ── uploadResume — pre-flight checks ─────────────────────────────────────────

describe('uploadResume pre-flight', () => {

  test('returns no_path when resume.path is absent', async () => {
    const page = makeExactMockPage();
    const result = await uploadResume(page, { resume: { path: '' } });
    assert.equal(result.uploaded, false);
    assert.equal(result.reason, 'no_path');
  });

  test('returns no_path when resume is undefined', async () => {
    const page = makeExactMockPage();
    const result = await uploadResume(page, {});
    assert.equal(result.uploaded, false);
    assert.equal(result.reason, 'no_path');
  });

  test('returns file_missing when resume.path does not exist on disk', async () => {
    const page = makeExactMockPage({ matchingSelector: RESUME_SELECTORS[0] });
    const result = await uploadResume(page, makePersonalWith('/nonexistent/resume.pdf'));
    assert.equal(result.uploaded, false);
    assert.equal(result.reason, 'file_missing');
    assert.equal(result.path, '/nonexistent/resume.pdf');
  });

  test('does not upload even if input is present when file is missing', async () => {
    const page = makeExactMockPage({ matchingSelector: RESUME_SELECTORS[0] });
    const result = await uploadResume(page, makePersonalWith('/does/not/exist.pdf'));
    assert.equal(result.uploaded, false, 'should not upload a missing file');
    assert.equal(page._uploaded[RESUME_SELECTORS[0]], undefined, 'setInputFiles should not be called');
  });

});

// ── uploadResume — selector fallthrough ───────────────────────────────────────

describe('uploadResume selector strategy', () => {

  test('succeeds on first matching selector', async () => {
    const page = makeExactMockPage({ matchingSelector: RESUME_SELECTORS[0] });
    const result = await uploadResume(page, makePersonalWith(REAL_RESUME));
    assert.equal(result.uploaded, true);
    assert.equal(result.selector, RESUME_SELECTORS[0]);
    assert.equal(result.path, REAL_RESUME);
  });

  test('falls through to a later selector when early ones do not match', async () => {
    // Match the 4th selector (name*="resume") only
    const page = makeExactMockPage({ matchingSelector: RESUME_SELECTORS[3] });
    const result = await uploadResume(page, makePersonalWith(REAL_RESUME));
    assert.equal(result.uploaded, true);
    assert.equal(result.selector, RESUME_SELECTORS[3]);
  });

  test('returns no_matching_input when no selector matches', async () => {
    const page = makeExactMockPage({ matchingSelector: null }); // nothing matches
    const result = await uploadResume(page, makePersonalWith(REAL_RESUME));
    assert.equal(result.uploaded, false);
    assert.equal(result.reason, 'no_matching_input');
    assert.equal(result.tried, RESUME_SELECTORS.length);
  });

  test('records the correct file path in setInputFiles', async () => {
    const page = makeExactMockPage({ matchingSelector: RESUME_SELECTORS[0] });
    await uploadResume(page, makePersonalWith(REAL_RESUME));
    assert.equal(page._uploaded[RESUME_SELECTORS[0]], REAL_RESUME);
  });

});

// ── uploadCoverLetter — pre-flight + fallback ─────────────────────────────────

describe('uploadCoverLetter', () => {

  test('returns no_path when both matchedClPath and default_path are absent', async () => {
    const page = makeExactMockPage({ matchingSelector: CL_SELECTORS[0] });
    const result = await uploadCoverLetter(page, makePersonalWith(REAL_RESUME, ''), null);
    assert.equal(result.uploaded, false);
    assert.equal(result.reason, 'no_path');
  });

  test('uses matchedClPath when provided', async () => {
    const page = makeExactMockPage({ matchingSelector: CL_SELECTORS[0] });
    const result = await uploadCoverLetter(page, makePersonalWith(REAL_RESUME, ''), REAL_CL);
    assert.equal(result.uploaded, true);
    assert.equal(result.path, REAL_CL);
  });

  test('falls back to default_path when matchedClPath is null', async () => {
    const page = makeExactMockPage({ matchingSelector: CL_SELECTORS[0] });
    const result = await uploadCoverLetter(page, makePersonalWith(REAL_RESUME, REAL_CL), null);
    assert.equal(result.uploaded, true);
    assert.equal(result.path, REAL_CL);
  });

  test('matchedClPath takes priority over default_path', async () => {
    // Both exist — matchedClPath should win
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-test-'));
    const matched  = path.join(tmpDir, 'matched.txt');
    const fallback = path.join(tmpDir, 'fallback.txt');
    fs.writeFileSync(matched,  'matched CL',  'utf8');
    fs.writeFileSync(fallback, 'fallback CL', 'utf8');

    try {
      const page = makeExactMockPage({ matchingSelector: CL_SELECTORS[0] });
      const result = await uploadCoverLetter(page, makePersonalWith(REAL_RESUME, fallback), matched);
      assert.equal(result.path, matched, 'should use matched CL, not fallback');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('returns file_missing when CL file does not exist', async () => {
    const page = makeExactMockPage({ matchingSelector: CL_SELECTORS[0] });
    const result = await uploadCoverLetter(page, makePersonalWith(REAL_RESUME, ''), '/nonexistent/cl.txt');
    assert.equal(result.uploaded, false);
    assert.equal(result.reason, 'file_missing');
  });

  test('returns no_matching_input when file exists but no selector matches', async () => {
    const page = makeExactMockPage({ matchingSelector: null });
    const result = await uploadCoverLetter(page, makePersonalWith(REAL_RESUME, REAL_CL), null);
    assert.equal(result.uploaded, false);
    assert.equal(result.reason, 'no_matching_input');
    assert.equal(result.tried, CL_SELECTORS.length);
  });

});

// ── formatUploadDetails ───────────────────────────────────────────────────────

describe('formatUploadDetails', () => {

  test('formats uploaded resume correctly', () => {
    const lines = formatUploadDetails({
      resume: { uploaded: true, selector: 'input[type="file"][name*="resume" i]', path: '/home/user/Resume.pdf' },
    });
    assert.ok(lines.length > 0, 'should produce output');
    assert.ok(lines[0].includes('Resume.pdf'), 'should include filename');
    assert.ok(lines[0].includes('via'), 'should include selector label');
  });

  test('formats no_path resume correctly', () => {
    const lines = formatUploadDetails({ resume: { uploaded: false, reason: 'no_path' } });
    assert.ok(lines[0].includes('resume.path not set'), 'should mention path config');
  });

  test('formats file_missing resume correctly', () => {
    const lines = formatUploadDetails({ resume: { uploaded: false, reason: 'file_missing', path: '/bad/path.pdf' } });
    assert.ok(lines[0].includes('file not found'), 'should say file not found');
    assert.ok(lines[0].includes('/bad/path.pdf'), 'should include the bad path');
  });

  test('formats no_matching_input correctly', () => {
    const lines = formatUploadDetails({ resume: { uploaded: false, reason: 'no_matching_input', tried: 10 } });
    assert.ok(lines[0].includes('no_matching_input'), 'should include reason');
    assert.ok(lines[0].includes('10'), 'should include tried count');
  });

  test('formats uploaded CL correctly', () => {
    const lines = formatUploadDetails({
      cl: { uploaded: true, selector: 'label:has-text("Cover Letter") ~ input[type="file"]', path: '/home/user/cl.txt' },
    });
    assert.ok(lines[0].includes('cl.txt'), 'should include CL filename');
  });

  test('formats no_path CL correctly', () => {
    const lines = formatUploadDetails({ cl: { uploaded: false, reason: 'no_path' } });
    assert.ok(lines[0].includes('no matched CL'), 'should explain no CL available');
  });

  test('handles both resume and cl in single call', () => {
    const lines = formatUploadDetails({
      resume: { uploaded: true,  selector: 'input[name="resume"]', path: '/r.pdf' },
      cl:     { uploaded: false, reason: 'no_path' },
    });
    assert.equal(lines.length, 2, 'should produce one line per upload type');
  });

  test('returns empty array when details is empty', () => {
    const lines = formatUploadDetails({});
    assert.equal(lines.length, 0);
  });

});
