/**
 * lib/pdf-child-page.mjs — PDF flavor renderer for child pages.
 *
 * When the user wants a PDF version of a child page (e.g., to annotate
 * via Acrobat Chrome extension), this module wraps the HTML via
 * wrapForPDFFlavor (lib/child-page-template.mjs) and pipes it through
 * the existing Playwright generate-pdf.mjs infrastructure.
 *
 * Reuses the chromium launcher from generate-pdf.mjs — no new npm deps,
 * no reimplementation of PDF rendering logic. The normalizeTextForATS
 * step from generate-pdf.mjs is intentionally NOT applied here: child
 * pages use em-dashes and smart quotes for readability; ATS normalization
 * is only needed for CV PDFs.
 *
 * Exports:
 *   renderChildPageAsPDF({ html, outPath, opts }) → Promise<{ path, bytes }>
 *   linkOrGeneratePDF(rowId, storySlug, opts) → Promise<string>
 *
 * Testing strategy (per spec guardrails):
 *   - No live Playwright render in tests
 *   - Mock the launcher via opts.playwrightLauncher
 *   - Tests cover: argument validation, wrapForPDFFlavor application,
 *     cache-hit path, PDF write path, error propagation
 */

import { existsSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { wrapForPDFFlavor } from './child-page-template.mjs';
import { slugify } from './child-page-template.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Playwright launcher (real path — imported lazily so tests can stub it)
// ---------------------------------------------------------------------------

/**
 * Launch a Chromium browser via Playwright and render html to a PDF buffer.
 * This is the real implementation; tests inject opts.playwrightLauncher instead.
 *
 * @param {string} html — full HTML string
 * @param {string} format — 'a4' | 'letter'
 * @param {string} margin — CSS margin string
 * @returns {Promise<Buffer>}
 */
async function defaultPlaywrightLauncher(html, format, margin) {
  // Dynamic import keeps Playwright out of the module-load critical path
  // so tools that import this lib without Playwright installed don't crash.
  const { chromium } = await import('playwright');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();

    // Inject html directly (no file needed — saves a tmp file write)
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    const pdfBuffer = await page.pdf({
      format,
      printBackground: true,
      margin: { top: margin, right: margin, bottom: margin, left: margin },
      preferCSSPageSize: false,
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// renderChildPageAsPDF
// ---------------------------------------------------------------------------

/**
 * Renders a child page HTML string as a PDF file.
 *
 * @param {object} params
 * @param {string} params.html — full HTML document (from renderChildPageHTML or renderStoryChildPage)
 * @param {string} params.outPath — absolute path to write the PDF
 * @param {object} [params.opts]
 * @param {string} [params.opts.format] — 'a4' | 'letter', default 'a4'
 * @param {string} [params.opts.margin] — CSS margin, default '0.6in'
 * @param {Function} [params.opts.playwrightLauncher] — async (html, format, margin) => Buffer
 *        Inject a mock for testing — signature matches defaultPlaywrightLauncher.
 * @returns {Promise<{ path: string, bytes: number }>}
 */
export async function renderChildPageAsPDF({ html, outPath, opts = {} } = {}) {
  if (!html || typeof html !== 'string') {
    throw new Error('renderChildPageAsPDF: html is required and must be a string');
  }
  if (!outPath || typeof outPath !== 'string') {
    throw new Error('renderChildPageAsPDF: outPath is required and must be a string');
  }

  const format = opts.format || 'a4';
  const margin = opts.margin || '0.6in';

  // Validate format
  if (!['a4', 'letter'].includes(format)) {
    throw new Error(`renderChildPageAsPDF: invalid format "${format}" — use 'a4' or 'letter'`);
  }

  // Apply PDF flavor (print-friendly overrides, remove interactive affordances)
  const printHtml = wrapForPDFFlavor(html, { margin });

  // Ensure output directory exists
  mkdirSync(dirname(outPath), { recursive: true });

  // Launch Playwright (real or mock)
  const launcher = opts.playwrightLauncher || defaultPlaywrightLauncher;
  const pdfBuffer = await launcher(printHtml, format, margin);

  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error('renderChildPageAsPDF: PDF launcher returned an empty buffer');
  }

  // Write the PDF
  writeFileSync(outPath, pdfBuffer);

  return { path: outPath, bytes: pdfBuffer.length };
}

// ---------------------------------------------------------------------------
// linkOrGeneratePDF
// ---------------------------------------------------------------------------

/**
 * Returns the path to a cached PDF if it exists and is < 24h old,
 * otherwise generates a new PDF on-demand and returns its path.
 *
 * @param {string|number} rowId — application tracker row ID
 * @param {string} storySlug — slugified story name
 * @param {object} [opts]
 * @param {string} [opts.html] — HTML to render (required unless PDF already cached)
 * @param {string} [opts.format] — 'a4' | 'letter'
 * @param {string} [opts.margin] — CSS margin
 * @param {Function} [opts.playwrightLauncher] — mock launcher for tests
 * @param {string} [opts.repoRoot] — override repo root (for testing)
 * @param {number} [opts.cacheTtlMs] — override cache TTL in ms (default 24h)
 * @returns {Promise<string>} — absolute path to the PDF
 */
export async function linkOrGeneratePDF(rowId, storySlug, opts = {}) {
  if (rowId == null) throw new Error('linkOrGeneratePDF: rowId is required');
  if (!storySlug) throw new Error('linkOrGeneratePDF: storySlug is required');

  const repoRoot = opts.repoRoot || REPO_ROOT;
  const slug = slugify(String(storySlug));
  const cacheTtlMs = opts.cacheTtlMs ?? 24 * 60 * 60 * 1000;

  const pdfDir = join(repoRoot, 'data', 'apply-packs', `${rowId}-pdfs`);
  const pdfPath = join(pdfDir, `${slug}.pdf`);

  // Cache hit: file exists and is fresh enough
  if (existsSync(pdfPath)) {
    try {
      const stat = statSync(pdfPath);
      if (Date.now() - stat.mtimeMs < cacheTtlMs) {
        return pdfPath;
      }
    } catch {
      // stat failed — regenerate
    }
  }

  // Cache miss: need html to generate
  if (!opts.html) {
    throw new Error(
      `linkOrGeneratePDF: PDF not cached at ${pdfPath} and opts.html not provided — cannot generate`
    );
  }

  const { path } = await renderChildPageAsPDF({
    html: opts.html,
    outPath: pdfPath,
    opts,
  });

  return path;
}

// ---------------------------------------------------------------------------
// Utility: read a cached PDF as a Buffer (convenience for piping to response)
// ---------------------------------------------------------------------------

/**
 * Read a cached PDF from disk.
 *
 * @param {string} pdfPath
 * @returns {Promise<Buffer>}
 */
export async function readCachedPDF(pdfPath) {
  return readFile(pdfPath);
}

// ---------------------------------------------------------------------------
// Utility: pdfExists — synchronous existence + freshness check
// ---------------------------------------------------------------------------

/**
 * Returns true if a PDF exists at path and is within the TTL.
 *
 * @param {string} pdfPath
 * @param {number} [cacheTtlMs] — default 24h
 * @returns {boolean}
 */
export function pdfExists(pdfPath, cacheTtlMs = 24 * 60 * 60 * 1000) {
  if (!existsSync(pdfPath)) return false;
  try {
    const stat = statSync(pdfPath);
    return Date.now() - stat.mtimeMs < cacheTtlMs;
  } catch {
    return false;
  }
}
