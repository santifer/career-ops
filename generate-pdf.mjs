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
import { resolve, dirname } from 'path';
import { readFile } from 'fs/promises';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Minimal Handlebars-style template processor — no external deps, pure regex.
 *
 * Supported syntax:
 *   {{VAR}}              — simple substitution; value from tokens[VAR]
 *   {{#if VAR}}...{{/if VAR}}
 *                        — render block only when tokens[VAR] is truthy
 *                          (non-empty string, non-empty array, defined + non-false)
 *                          Nested ONE level deep is supported.
 *   {{#each ARRAY}}...{{/each}}
 *                        — repeat block for each element of tokens[ARRAY] (array).
 *                          Inside block: {{this}} = current element (string),
 *                          {{this.PROP}} = property of current element (object).
 *   {{!-- comment --}}   — stripped from output (Handlebars comment syntax)
 *
 * Evaluation order: comments → #if blocks → #each blocks → simple {{VAR}}.
 *
 * @param {string} template  HTML template source
 * @param {Object} tokens    Key→value map; values may be strings, arrays, or booleans
 * @returns {string}         Rendered HTML
 */
function renderTemplate(template, tokens) {
  let out = template;

  // 1. Strip Handlebars comments: {{!-- ... --}}
  out = out.replace(/\{\{!--[\s\S]*?--\}\}/g, '');

  // 2. Process {{#if VAR}}...{{/if VAR}} blocks (one level of nesting supported)
  //    Outer pass: replace from innermost outward by iterating until stable.
  let prev;
  let guard = 0;
  do {
    prev = out;
    out = out.replace(
      /\{\{#if ([A-Z0-9_]+)\}\}([\s\S]*?)\{\{\/if \1\}\}/g,
      (_, varName, inner) => {
        const val = tokens[varName];
        const truthy =
          val !== undefined &&
          val !== null &&
          val !== false &&
          val !== '' &&
          !(Array.isArray(val) && val.length === 0);
        return truthy ? inner : '';
      }
    );
    guard++;
  } while (out !== prev && guard < 20);

  // 3. Process {{#each ARRAY}}...{{/each}} blocks
  out = out.replace(
    /\{\{#each ([A-Z0-9_]+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_, varName, inner) => {
      const arr = tokens[varName];
      if (!Array.isArray(arr) || arr.length === 0) return '';
      return arr.map(item => {
        let rendered = inner;
        if (typeof item === 'object' && item !== null) {
          // {{this.PROP}} substitution
          rendered = rendered.replace(/\{\{this\.([A-Za-z0-9_]+)\}\}/g, (__, prop) =>
            item[prop] !== undefined ? String(item[prop]) : ''
          );
          // {{this}} for objects: JSON summary or skip
          rendered = rendered.replace(/\{\{this\}\}/g, '');
        } else {
          rendered = rendered.replace(/\{\{this\}\}/g, String(item));
        }
        return rendered;
      }).join('');
    }
  );

  // 4. Simple {{VAR}} substitution (remaining tokens)
  out = out.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, varName) => {
    const val = tokens[varName];
    if (val === undefined || val === null) return '';
    if (Array.isArray(val)) return val.join('');
    return String(val);
  });

  return out;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

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

async function generatePDF() {
  const args = process.argv.slice(2);

  // Parse arguments
  let inputPath, outputPath, format = 'a4', margin = '0.6in';

  for (const arg of args) {
    if (arg.startsWith('--format=')) {
      format = arg.split('=')[1].toLowerCase();
    } else if (arg.startsWith('--margin=')) {
      margin = arg.split('=')[1];
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
  // Close any unclosed quotes from the replacement (handles all font formats)
  html = html.replace(
    /file:\/\/([^'")]+)\.(woff2?|ttf|otf)['"]?\)/g,
    `file://$1.$2')`
  );

  // Detect unresolved template tokens and warn — these render as literal text in PDF
  // and indicate the caller forgot to run renderTemplate() before passing the file.
  // Strip CSS block comments (/* ... */) and style/script tags before scanning so
  // documentation strings inside CSS comments don't produce false positives.
  const htmlBodyOnly = html
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '')  // remove style/script blocks
    .replace(/\/\*[\s\S]*?\*\//g, '');                        // remove remaining CSS comments
  const unresolvedTokens = (htmlBodyOnly.match(/\{\{[^}]+\}\}/g) || []);
  if (unresolvedTokens.length > 0) {
    const uniqueTokens = [...new Set(unresolvedTokens)];
    console.warn(`⚠️  Unresolved template tokens detected (${unresolvedTokens.length} occurrences):`);
    console.warn(`   ${uniqueTokens.join(', ')}`);
    console.warn(`   Hint: call renderTemplate(templateHtml, tokens) from generate-pdf.mjs before generating the PDF.`);
  }

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
        top: margin,
        right: margin,
        bottom: margin,
        left: margin,
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

// Guard: only run as CLI entry point, not when imported as a module.
// This allows `import { renderTemplate } from './generate-pdf.mjs'` without
// triggering the Playwright PDF generation.
const isDirectRun = process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  generatePDF().catch((err) => {
    console.error('❌ PDF generation failed:', err.message);
    process.exit(1);
  });
}

// Export renderTemplate so agent scripts (e.g. build-apply-pack.mjs, cv-tailor.mjs)
// can perform template substitution before writing the .html file for PDF generation.
export { renderTemplate };
