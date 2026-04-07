#!/usr/bin/env node

/**
 * generate-pdf.mjs - HTML to PDF via Playwright
 *
 * Usage:
 *   node career-ops/generate-pdf.mjs <input.html> <output.pdf> [--format=letter|a4]
 *
 * Requires: @playwright/test (or playwright) installed.
 * Uses Chromium headless to render the HTML and produce a clean, ATS-parseable PDF.
 *
 * Also runs an ATS-compatibility normalization pass on the HTML body text
 * before rendering. See normalizeTextForATS() and issue #1.
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Normalize text for ATS compatibility by removing problematic Unicode characters.
 *
 * Background: ATS parsers and legacy systems often fail on Unicode artifacts
 * like em-dashes, smart quotes, zero-width characters, and non-breaking spaces.
 * These can cause mojibake, parsing errors, or display issues. See issue #1.
 *
 * This pass is surgical: it only touches the body text inside HTML tags,
 * never tag names, attributes, URLs, or content inside <style>/<script>.
 * Em-dashes and smart quotes inside CSS strings (e.g. font-family names)
 * are preserved.
 *
 * Returns { html, replacements } so the caller can log what was changed.
 */
function normalizeTextForATS(html) {
  const replacements = {};
  const bump = (key, n) => { replacements[key] = (replacements[key] || 0) + n; };

  // Mask out <style>...</style> and <script>...</script> blocks so we don't
  // touch CSS or JS. We restore them at the end.
  const masks = [];
  const masked = html.replace(
    /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi,
    (match) => {
      const token = `\u0000MASK${masks.length}\u0000`;
      masks.push(match);
      return token;
    }
  );

  // Walk the masked HTML and only sanitize text outside tags.
  let out = '';
  let i = 0;
  while (i < masked.length) {
    const lt = masked.indexOf('<', i);
    if (lt === -1) {
      out += sanitizeText(masked.slice(i));
      break;
    }
    out += sanitizeText(masked.slice(i, lt));
    const gt = masked.indexOf('>', lt);
    if (gt === -1) {
      out += masked.slice(lt);
      break;
    }
    out += masked.slice(lt, gt + 1); // tag verbatim
    i = gt + 1;
  }

  // Restore masked style/script blocks unchanged.
  const restored = out.replace(/\u0000MASK(\d+)\u0000/g, (_, n) => masks[Number(n)]);

  return { html: restored, replacements };

  function sanitizeText(text) {
    if (!text) return text;
    let t = text;

    // Em-dash and en-dash -> hyphen. Strongest AI tell.
    t = t.replace(/\u2014/g, (m) => { bump('em-dash', 1); return '-'; });
    t = t.replace(/\u2013/g, (m) => { bump('en-dash', 1); return '-'; });

    // Smart quotes -> ASCII. Both curly double and curly single.
    t = t.replace(/[\u201C\u201D\u201E\u201F]/g, (m) => { bump('smart-double-quote', 1); return '"'; });
    t = t.replace(/[\u2018\u2019\u201A\u201B]/g, (m) => { bump('smart-single-quote', 1); return "'"; });

    // Ellipsis character -> three ASCII dots.
    t = t.replace(/\u2026/g, (m) => { bump('ellipsis', 1); return '...'; });

    // Zero-width and invisible characters: strip entirely.
    // U+200B zero-width space, U+200C ZWNJ, U+200D ZWJ, U+2060 word joiner, U+FEFF BOM.
    t = t.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, (m) => { bump('zero-width', 1); return ''; });

    // Non-breaking space -> regular space.
    t = t.replace(/\u00A0/g, (m) => { bump('nbsp', 1); return ' '; });

    return t;
  }
}

async function generatePDF() {
  const args = process.argv.slice(2);

  // Parse arguments
  let inputPath, outputPath, format = 'a4';

  for (const arg of args) {
    if (arg.startsWith('--format=')) {
      format = arg.split('=')[1].toLowerCase();
    } else if (!inputPath) {
      inputPath = arg;
    } else if (!outputPath) {
      outputPath = arg;
    }
  }

  if (!inputPath || !outputPath) {
    console.error('Usage: node generate-pdf.mjs <input.html> <output.pdf> [--format=letter|a4]');
    process.exit(1);
  }

  inputPath = resolve(inputPath);
  outputPath = resolve(outputPath);

  // Validate format
  const validFormats = ['a4', 'letter'];
  if (!validFormats.includes(format)) {
    console.error(`Invalid format "${format}". Use: ${validFormats.join(', ')}`);
    process.exit(1);
  }

  console.log(`📄 Input:  ${inputPath}`);
  console.log(`📁 Output: ${outputPath}`);
  console.log(`📏 Format: ${format.toUpperCase()}`);

  // Read HTML to inject font paths as absolute file:// URLs
  let html = await readFile(inputPath, 'utf-8');

  // Resolve font paths relative to career-ops/fonts/
  const fontsDir = resolve(__dirname, 'fonts');
  html = html.replace(
    /url\(['"]?\.\/fonts\//g,
    `url('file://${fontsDir}/`
  );
  // Close any unclosed quotes from the replacement
  html = html.replace(
    /file:\/\/([^'")]+)\.woff2['"]\)/g,
    `file://$1.woff2')`
  );

  // Normalize text for ATS compatibility. See normalizeTextForATS() above
  // and modes/_shared.md "Professional Writing & ATS Compatibility". Issue #1.
  const sanitized = normalizeTextForATS(html);
  html = sanitized.html;
  const totalReplacements = Object.values(sanitized.replacements).reduce((a, b) => a + b, 0);
  if (totalReplacements > 0) {
    const breakdown = Object.entries(sanitized.replacements)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    console.log(`🧹 ATS normalization: ${totalReplacements} replacements (${breakdown})`);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Set content with file base URL for any relative resources
  await page.setContent(html, {
    waitUntil: 'networkidle',
    baseURL: `file://${dirname(inputPath)}/`,
  });

  // Wait for fonts to load
  await page.evaluate(() => document.fonts.ready);

  // Generate PDF
  const pdfBuffer = await page.pdf({
    format: format,
    printBackground: true,
    margin: {
      top: '0.6in',
      right: '0.6in',
      bottom: '0.6in',
      left: '0.6in',
    },
    preferCSSPageSize: false,
  });

  // Write PDF
  const { writeFile } = await import('fs/promises');
  await writeFile(outputPath, pdfBuffer);

  // Count pages (approximate from PDF structure)
  const pdfString = pdfBuffer.toString('latin1');
  const pageCount = (pdfString.match(/\/Type\s*\/Page[^s]/g) || []).length;

  await browser.close();

  console.log(`✅ PDF generated: ${outputPath}`);
  console.log(`📊 Pages: ${pageCount}`);
  console.log(`📦 Size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

  return { outputPath, pageCount, size: pdfBuffer.length };
}

generatePDF().catch((err) => {
  console.error('❌ PDF generation failed:', err.message);
  process.exit(1);
});
