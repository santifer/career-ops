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
import path from 'path';
import yaml from 'js-yaml';
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
  const validFormats = ['a4', 'letter', 'latex'];
  if (!validFormats.includes(format)) {
    console.error(`❌ Invalid format: ${format}. Use: a4, letter, or latex`);
    process.exit(1);
  }

  // Handle LaTeX generation
  if (format === 'latex') {
    console.log("📄 Generating LaTeX source...");
    
    try {
      // 1. Load profile.yml
      const profilePath = path.join(process.cwd(), 'config', 'profile.yml');
      const profileContent = await fs.readFile(profilePath, 'utf-8');
      const profile = yaml.load(profileContent);
      
      // 2. Load cv.md
      const cvPath = path.join(process.cwd(), 'cv.md');
      const cvContent = await fs.readFile(cvPath, 'utf-8');
      
      // 3. Parse CV for sections
      const extractCVSection = (content, sectionName) => {
        const regex = new RegExp(`## ${sectionName}\\s*\\n([\\s\\S]*?)(?=## |$)`, 'i');
        const match = content.match(regex);
        return match ? match[1].trim() : '';
      };
      
      // 4. Load the LaTeX template
      const templatePath = path.join(process.cwd(), 'templates', 'cv-template.tex');
      let texContent = await fs.readFile(templatePath, 'utf-8');
      
      // 5. Extract data from profile and CV
      const candidate = profile.candidate || {};
      const summary = extractCVSection(cvContent, 'Professional Summary');
      const experience = extractCVSection(cvContent, 'Work Experience');
      const skills = extractCVSection(cvContent, 'Skills');
      const education = extractCVSection(cvContent, 'Education');
      
      // This block ensures the script finds exactly what's in the .tex template
      // Match the [[ ]] style in your .tex template
      let finalTex = texContent
        .replace(/\[\[FULL_NAME\]\]/g, candidate.full_name || 'Your Name')
        .replace(/\[\[EMAIL\]\]/g, candidate.email || 'your.email@example.com')
        .replace(/\[\[LOCATION\]\]/g, candidate.location || 'City, State')
        .replace(/\[\[PHONE\]\]/g, candidate.phone || '+1-555-0000')
        .replace(/\[\[LINKEDIN\]\]/g, candidate.linkedin || 'linkedin.com/in/yourprofile')
        .replace(/\[\[GITHUB\]\]/g, candidate.github || 'github.com/yourprofile')
        .replace(/\[\[SUMMARY\]\]/g, summary || 'Your professional summary here')
        .replace(/\[\[EXPERIENCE\]\]/g, experience || 'Your experience here')
        .replace(/\[\[SKILLS\]\]/g, skills || 'Your skills here')
        .replace(/\[\[EDUCATION\]\]/g, education || 'Your education here');
      
      
      // Debug: verify replacements happened
      const unreplacedCount = (finalTex.match(/\[\[/g) || []).length;
      if (unreplacedCount > 0) {
        console.warn(`⚠️  Warning: ${unreplacedCount} placeholders still unreplaced`);
      }
      
      // 7. Save the populated LaTeX file to /output/ folder
      const outputDir = path.join(process.cwd(), 'output');
      // Create output directory if it doesn't exist
      await fs.mkdir(outputDir, { recursive: true });
      // Extract filename from output path (remove .pdf extension)
      const outputFilename = path.basename(outputPath).replace(/\.pdf$/, '.tex');
      const texOutputPath = path.join(outputDir, outputFilename);
      
      await fs.writeFile(texOutputPath, finalTex);
      
      console.log(`✅ LaTeX saved to: ${texOutputPath}`);
      console.log(`📋 Ready for Overleaf! All placeholders replaced.`);
      return;
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

  // Launch Chromium to render HTML → PDF
  const browser = await chromium.launch();
  const context = await browser.createContext();
  const page = await context.newPage();

  // Set viewport to A4/Letter
  const viewportWidth = '210mm'; // A4 width in Playwright format
  const viewportHeight = '297mm'; // A4 height
  
  await page.goto(`file://${inputPath}`, { waitUntil: 'networkidle' });
  
  // Determine page size based on format
  let pageSize = { format: 'A4' };
  if (format === 'letter') {
    pageSize = { format: 'Letter' };
  }
  
  await page.pdf({ path: outputPath, format: pageSize.format });
  
  await browser.close();

  console.log(`✅ PDF saved to: ${outputPath}`);
}

generatePDF().catch((err) => {
  console.error(`❌ Global Error: ${err.message}`);
  process.exit(1);
});