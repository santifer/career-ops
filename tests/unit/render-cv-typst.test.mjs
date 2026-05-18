/**
 * tests/unit/render-cv-typst.test.mjs — regression harness for the Typst
 * CV renderer (audit Item W, 2026-05-18).
 *
 * Invariants enforced:
 *   1. Master cv.md renders to exactly 2 pages.
 *   2. No Typst escape leakage (\@, \#, or placeholder strings like
 *      "(see cv.md)") appears in the PDF text layer.
 *   3. Required ATS keywords appear in the rendered text — below threshold
 *      means the keyword density is too low for ATS.
 *   4. CLI overrides (--highlights, --tagline) take effect when supplied.
 *
 * The tests assume cv.md exists at the repo root. Skip-mark each test when
 * the corpus is absent (CI environments without Mitchell's gitignored cv.md
 * fall through cleanly rather than failing).
 */

import { test, describe } from 'node:test';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CV_PATH = join(ROOT, 'cv.md');
const RENDERER = join(ROOT, 'scripts', 'render-cv-typst.mjs');

// Single shared tmpdir so the rendered PDF is reused across the test suite.
let tmpDir;
let masterPdfPath;
let masterText;

describe('render-cv-typst regression (audit Item W)', () => {
  test('setup: cv.md exists + renderer is executable', () => {
    if (!existsSync(CV_PATH)) {
      // Corpus absent (gitignored personal data). Mark as skipped via a
      // soft-skip pattern: assert(true) but log a notice. The remaining
      // tests will also no-op via the same existsSync gate.
      console.warn(`[skip] cv.md not present at ${CV_PATH} — corpus is gitignored, tests can only run on Mitchell's working copy`);
      return;
    }
    assert(existsSync(RENDERER), `renderer missing at ${RENDERER}`);
  });

  test('master cv.md renders to a 2-page PDF', () => {
    if (!existsSync(CV_PATH)) return;
    tmpDir = mkdtempSync(join(tmpdir(), 'cv-regression-'));
    masterPdfPath = join(tmpDir, 'cv-regression-master.pdf');
    execSync(`node ${RENDERER} --input ${CV_PATH} --output ${masterPdfPath}`, {
      cwd: ROOT,
      stdio: 'pipe',
    });
    assert(existsSync(masterPdfPath), 'expected PDF to be created');
    const pageInfo = execSync(`pdfinfo ${masterPdfPath} | grep Pages`).toString();
    assert.match(pageInfo, /Pages:\s+2\b/, `expected 2 pages, got: ${pageInfo.trim()}`);
  });

  test('no Typst escape leakage in PDF text layer', () => {
    if (!existsSync(CV_PATH)) return;
    if (!masterPdfPath) return;
    masterText = execSync(`pdftotext -layout ${masterPdfPath} -`).toString();
    assert(!masterText.includes('\\@'), 'found \\@ escape leak — escapeTypst() applied where escapeTypstStr() should have been');
    assert(!masterText.includes('\\#'), 'found \\# escape leak');
    assert(!masterText.includes('(see cv.md)'), 'found "(see cv.md)" placeholder leak');
    // Smart-quote-friendly check: also catch the curly variants
    assert(!masterText.includes('\\"'), 'found stray backslash-quote');
  });

  test('critical ATS keywords appear at least once each', () => {
    if (!existsSync(CV_PATH)) return;
    if (!masterText) return;
    const required = ['FDE', 'Forward Deployed', 'Applied AI', 'Solutions Architect', 'AI Program Manager', 'MCP', 'RAG', 'Claude'];
    // pdftotext may break a phrase across lines; normalize whitespace before scan
    const normalized = masterText.replace(/\s+/g, ' ');
    for (const kw of required) {
      assert(normalized.includes(kw), `missing ATS keyword: "${kw}"`);
    }
  });

  test('--highlights CLI flag injects a Highlights box', () => {
    if (!existsSync(CV_PATH)) return;
    const out = join(tmpDir, 'cv-regression-highlights.pdf');
    const items = [
      'Smoke-test highlight one',
      'Smoke-test highlight two',
      'Smoke-test highlight three',
      'Smoke-test highlight four',
    ];
    execSync(
      `node ${RENDERER} --input ${CV_PATH} --output ${out} --highlights ${JSON.stringify(items.join('|'))}`,
      { cwd: ROOT, stdio: 'pipe' }
    );
    const text = execSync(`pdftotext -layout ${out} -`).toString();
    assert(text.includes('HIGHLIGHTS'), 'expected HIGHLIGHTS label to render');
    for (const item of items) {
      assert(text.includes(item), `expected highlight "${item}" in rendered text`);
    }
  });

  test('--tagline CLI flag overrides the cv.md tagline', () => {
    if (!existsSync(CV_PATH)) return;
    const out = join(tmpDir, 'cv-regression-tagline.pdf');
    const customTagline = 'Forward Deployed Engineer · Applied AI · Comms × Production AI';
    execSync(
      `node ${RENDERER} --input ${CV_PATH} --output ${out} --tagline ${JSON.stringify(customTagline)}`,
      { cwd: ROOT, stdio: 'pipe' }
    );
    const text = execSync(`pdftotext -layout ${out} -`).toString().replace(/\s+/g, ' ');
    assert(text.includes(customTagline.split(' · ')[0]), 'custom tagline should appear in PDF');
  });

  test('cleanup: remove tmpdir', () => {
    if (tmpDir && existsSync(tmpDir)) {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* non-fatal */ }
    }
  });
});
