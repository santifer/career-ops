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
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import path from 'path'; // 
const __dirname = dirname(fileURLToPath(import.meta.url));

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
  const validFormats = ['a4', 'letter', 'latex']; // Added 'latex' here
  if (!validFormats.includes(format)) {
    const validFormats = ['a4', 'letter', 'latex'];
    process.exit(1);
  }

  // Handle LaTeX generation
  if (format === 'latex') {
    console.log("📄 Generating LaTeX source...");
    
    try {
      const templatePath = path.join(process.cwd(), 'templates', 'cv-template.tex');
      const texContent = await fs.readFile(templatePath, 'utf-8');

      // Determine output path (changing .pdf extension to .tex)
      const texOutputPath = outputPath.replace(/\.pdf$/, '.tex');
      
      await fs.writeFile(texOutputPath, texContent);
      
      console.log(`✅ LaTeX saved to: ${texOutputPath}`);
      return; // Exit the function early so it doesn't try to launch Chromium
    } catch (error) {
      console.error('❌ Error generating LaTeX:', error.message);
      process.exit(1);
    }
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

  // Normalize text for ATS compatibility (issue #1)
  const normalized = normalizeTextForATS(html);
  html = normalized.html;
  const totalReplacements = Object.values(normalized.replacements).reduce((a, b) => a + b, 0);
  if (totalReplacements > 0) {
    const breakdown = Object.entries(normalized.replacements).map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`🧹 ATS normalization: ${totalReplacements} replacements (${breakdown})`);
  }
// --- START OF LATEX ADDITION ---
  if (format === 'latex') {
    console.log("📄 Generating LaTeX source...");

    try {
      // 1. Load the LaTeX template from the templates folder
      const templatePath = path.join(process.cwd(), 'templates', 'cv-template.tex');
      let texContent = await fs.readFile(templatePath, 'utf-8');

      // 2. Map the data to LaTeX placeholders
    console.log("🔗 Mapping data to template...");

    // This ensures we have string data to work with
    const name = profile.name || "Kevin Brown Jr.";
    const email = profile.email || "";
    const summaryText = html || "Resume content goes here";

    let finalTex = texContent
      .replace(/\[\[FULL_NAME\]\]/g, 'Kevin Brown Jr.')
      .replace(/\[\[EMAIL\]\]/g, 'attaboy313.KB@gmail.com')
      .replace(/\[\[LOCATION\]\]/g, 'Oak Park, MI')
      .replace(/\[\[PHONE\]\]/g, '248-993-5102')
      .replace(/\[\[SUMMARY\]\]/g, summaryText)
      .replace(/\[\[EXPERIENCE\]\]/g, 'Security Specialist | Full-Stack Student')
      .replace(/\[\[SKILLS\]\]/g, 'React, Node.js, FL Studio, SQL')
      .replace(/\[\[EDUCATION\]\]/g, 'Self-Taught Developer')
      .replace(/\[\[LINKEDIN\]\]/g, '#')
      .replace(/\[\[GITHUB\]\]/g, '#');
    // DEBUG: Check if finalTex actually has content now

    // DEBUG: Check if finalTex actually has content now
    if (!finalTex || finalTex.length < 100) {
      console.log("⚠️ Warning: finalTex seems too short or empty!");
    }

      // 3. Save the file strictly inside the /output/ folder
      const finalFileName = outputBaseName.endsWith('.tex') ? path.basename(outputBaseName) : `${path.basename(outputBaseName)}.tex`;
      const outputPath = path.join(process.cwd(), 'output', finalFileName);
      
      console.log(`✅ Success! LaTeX source saved to: ${outputPath}`);
      return; 
    } catch (err) {
      console.error(`❌ Error generating LaTeX: ${err.message}`);
      process.exit(1);
    }
  }
}

generatePDF().catch((err) => {
  console.error(`❌ Global Error: ${err.message}`);
  process.exit(1);
});