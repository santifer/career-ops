#!/usr/bin/env node

/**
 * generate-pdf.mjs — HTML → PDF via Playwright
 *
 * Usage:
 *   node career-ops/generate-pdf.mjs <input.html> <output.pdf> [--format=letter|a4]
 *
 * Requires: @playwright/test (or playwright) installed.
 * Uses Chromium headless to render the HTML and produce a clean, ATS-parseable PDF.
 */

import { chromium } from 'playwright';
import { resolve, dirname, relative, isAbsolute } from 'path';
import { readFile } from 'fs/promises';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Handle photo substitution from config/profile.yml.
 * Validates format (.jpg/.jpeg/.png), encodes to base64, replaces {{PHOTO_BLOCK}}.
 */
function handlePhotoSubstitution(html, projectRoot) {
  const configPath = resolve(projectRoot, 'config', 'profile.yml');
  if (!existsSync(configPath)) {
    return html.replace(/\{\{PHOTO_BLOCK\}\}/g, '');
  }

  try {
    const config = yaml.load(readFileSync(configPath, 'utf8'));
    const photoPath = config?.photo;

    if (!photoPath || typeof photoPath !== 'string') {
      return html.replace(/\{\{PHOTO_BLOCK\}\}/g, '');
    }

    const trimmedPhotoPath = photoPath.trim();
    if (isAbsolute(trimmedPhotoPath)) {
      console.warn(`⚠️ Photo path must be project-relative: ${trimmedPhotoPath}`);
      return html.replace(/\{\{PHOTO_BLOCK\}\}/g, '');
    }

    const fullPath = resolve(projectRoot, trimmedPhotoPath);
    const relPath = relative(projectRoot, fullPath);
    if (relPath.startsWith('..') || isAbsolute(relPath)) {
      console.warn(`⚠️ Photo path escapes project root: ${trimmedPhotoPath}`);
      return html.replace(/\{\{PHOTO_BLOCK\}\}/g, '');
    }

    if (!existsSync(fullPath)) {
      console.warn(`⚠️ Photo file not found: ${fullPath}`);
      return html.replace(/\{\{PHOTO_BLOCK\}\}/g, '');
    }

    const ext = trimmedPhotoPath.split('.').pop().toLowerCase();
    const supported = ['jpg', 'jpeg', 'png'];
    if (!supported.includes(ext)) {
      console.warn(`⚠️ Unsupported photo format: .${ext}. Supported: ${supported.join(', ')}`);
      return html.replace(/\{\{PHOTO_BLOCK\}\}/g, '');
    }

    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const imgBuffer = readFileSync(fullPath);
    const base64 = imgBuffer.toString('base64');
    const dataUri = `data:${mime};base64,${base64}`;

    const photoHtml = `<img class="cv-photo" src="${dataUri}" alt="">`;
    return html.replace(/\{\{PHOTO_BLOCK\}\}/g, photoHtml);
  } catch (err) {
    console.warn(`⚠️ Photo handling error: ${err.message}`);
    return html.replace(/\{\{PHOTO_BLOCK\}\}/g, '');
  }
}

// Ensure output directory exists (fresh setup)
mkdirSync(resolve(__dirname, 'output'), { recursive: true });

/**
 * Normalize text for ATS compatibility by converting problematic Unicode.
 *
 * ATS parsers and legacy systems often fail on em-dashes, smart quotes,
 * zero-width characters, and non-breaking spaces. These cause mojibake,
 * parsing errors, or display issues. See issue #1.
 *
 * Only touches body text — preserves CSS, JS, tag attributes, and URLs.
 * Returns { html, replacements } so the caller can log what was changed.
 */
function normalizeTextForATS(html) {
  const replacements = {};
  const bump = (key, n) => { replacements[key] = (replacements[key] || 0) + n; };

  const masks = [];
  const masked = html.replace(
    /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi,
    (match) => {
      const token = `\u0000MASK${masks.length}\u0000`;
      masks.push(match);
      return token;
    }
  );

  let out = '';
  let i = 0;
  while (i < masked.length) {
    const lt = masked.indexOf('<', i);
    if (lt === -1) { out += sanitizeText(masked.slice(i)); break; }
    out += sanitizeText(masked.slice(i, lt));
    const gt = masked.indexOf('>', lt);
    if (gt === -1) { out += masked.slice(lt); break; }
    out += masked.slice(lt, gt + 1);
    i = gt + 1;
  }

  const restored = out.replace(/\u0000MASK(\d+)\u0000/g, (_, n) => masks[Number(n)]);
  return { html: restored, replacements };

  function sanitizeText(text) {
    if (!text) return text;
    let t = text;
    t = t.replace(/\u2014/g, () => { bump('em-dash', 1); return '-'; });
    t = t.replace(/\u2013/g, () => { bump('en-dash', 1); return '-'; });
    t = t.replace(/[\u201C\u201D\u201E\u201F]/g, () => { bump('smart-double-quote', 1); return '"'; });
    t = t.replace(/[\u2018\u2019\u201A\u201B]/g, () => { bump('smart-single-quote', 1); return "'"; });
    t = t.replace(/\u2026/g, () => { bump('ellipsis', 1); return '...'; });
    t = t.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, () => { bump('zero-width', 1); return ''; });
    t = t.replace(/\u00A0/g, () => { bump('nbsp', 1); return ' '; });
    return t;
  }
}

/**
 * Main entry point — parse CLI args, read HTML, embed photo, normalize text,
 * render with Playwright Chromium, and write the output PDF.
 *
 * CLI arguments: <input.html> <output.pdf> [--format=letter|a4]
 */
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

  // Handle photo substitution from config/profile.yml
  html = handlePhotoSubstitution(html, __dirname);

  // Resolve font paths relative to career-ops/fonts/
  const fontsDir = resolve(__dirname, 'fonts');
  html = html.replace(
    /url\(['"]?\.\/fonts\//g,
    `url('file://${fontsDir}/`
  );
  // Close any unclosed quotes from the replacement (handles all font formats)
  html = html.replace(
    /file:\/\/([^'")]+)\.(woff2?|ttf|otf)['"]?\)/g,
    `file://$1.$2')`
  );

  // Normalize text for ATS compatibility (issue #1)
  const normalized = normalizeTextForATS(html);
  html = normalized.html;
  const totalReplacements = Object.values(normalized.replacements).reduce((a, b) => a + b, 0);
  if (totalReplacements > 0) {
    const breakdown = Object.entries(normalized.replacements).map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`🧹 ATS normalization: ${totalReplacements} replacements (${breakdown})`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
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

    console.log(`✅ PDF generated: ${outputPath}`);
    console.log(`📊 Pages: ${pageCount}`);
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
