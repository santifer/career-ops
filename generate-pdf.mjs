#!/usr/bin/env node

/**
 * generate-pdf.mjs — HTML → PDF via Playwright
 *
 * Usage:
 *   node generate-pdf.mjs cv-{candidate}-{company}-temp.html <output.pdf> [--format=letter|a4]
 *
 * Requires: playwright installed.
 * Uses Chromium headless to render the HTML and produce a clean, ATS-parseable PDF.
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { normalizeTextForATS } from './lib/ats-normalize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure output directory exists (fresh setup)
mkdirSync(resolve(__dirname, 'output'), { recursive: true });

async function generatePDF() {
  const args = process.argv.slice(2);

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

  const validFormats = ['a4', 'letter'];
  if (!validFormats.includes(format)) {
    console.error(`Invalid format "${format}". Use: ${validFormats.join(', ')}`);
    process.exit(1);
  }

  console.log(`📄 Input:  ${inputPath}`);
  console.log(`📁 Output: ${outputPath}`);
  console.log(`📏 Format: ${format.toUpperCase()}`);

  let html = await readFile(inputPath, 'utf-8');

  // Fix font paths: resolve ./fonts/ to absolute file:// URLs.
  // On Windows: resolve() returns C:\path\fonts → convert to file:///C:/path/fonts
  // On Unix:    resolve() returns /path/fonts   → convert to file:///path/fonts
  const fontsDir = resolve(__dirname, 'fonts').replace(/\\/g, '/');
  const fontFileBase = fontsDir.startsWith('/') ? `file://${fontsDir}` : `file:///${fontsDir}`;
  html = html.replace(/url\(['"]?\.\/fonts\//g, `url('${fontFileBase}/`);
  // Ensure closing quote before ) for any unquoted url() values
  html = html.replace(
    /file:\/\/\/?([^'")]+)\.(woff2?|ttf|otf)['"]?\)/g,
    `file:///$1.$2')`
  );

  // Normalize text for ATS compatibility (em-dashes, smart quotes, zero-width chars)
  const { html: normalizedHtml, replacements } = normalizeTextForATS(html);
  html = normalizedHtml;
  const totalReplacements = Object.values(replacements).reduce((a, b) => a + b, 0);
  if (totalReplacements > 0) {
    const breakdown = Object.entries(replacements).map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`🧹 ATS normalization: ${totalReplacements} replacements (${breakdown})`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'networkidle',
      baseURL: `file://${dirname(inputPath)}/`,
    });

    await page.evaluate(() => document.fonts.ready);

    const pdfBuffer = await page.pdf({
      format,
      printBackground: true,
      margin: { top: '0.6in', right: '0.6in', bottom: '0.6in', left: '0.6in' },
      preferCSSPageSize: false,
    });

    await writeFile(outputPath, pdfBuffer);

    // Approximate page count from PDF structure (informational only)
    const pdfString = pdfBuffer.toString('latin1');
    const pageCount = (pdfString.match(/\/Type\s*\/Page[^s]/g) || []).length;

    console.log(`✅ PDF generated: ${outputPath}`);
    console.log(`📊 Pages: ~${pageCount}`);
    console.log(`📦 Size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    return { outputPath, pageCount, size: pdfBuffer.length };
  } finally {
    await browser.close();
  }
}

generatePDF().catch((err) => {
  console.error('❌ PDF generation failed:', err.message);
  process.exit(1);
});
