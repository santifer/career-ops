#!/usr/bin/env node

/**
 * build-cv.mjs — Markdown -> HTML -> PDF pipeline
 */

import { resolve, dirname, basename, join } from 'path';
import { readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';
import { renderHtmlToPdf } from './generate-pdf.mjs';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  let mdPath = process.argv[2];

  if (!mdPath) {
    const reportsDir = resolve(__dirname, 'reports');
    let files = [];
    try {
      files = readdirSync(reportsDir).filter(f => f.endsWith('.md'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    if (files.length === 0) {
      console.error('❌ No markdown report provided and reports/ is empty.');
      process.exit(1);
    }

    // Sort by mtime descending
    files.sort((a, b) => statSync(join(reportsDir, b)).mtimeMs - statSync(join(reportsDir, a)).mtimeMs);
    let newest = files[0];

    // If identical mtimes, fallback to git log
    if (files.length > 1 && statSync(join(reportsDir, files[0])).mtimeMs === statSync(join(reportsDir, files[1])).mtimeMs) {
      try {
        const out = execSync(`git log -1 --name-only --format= -- reports/`, { encoding: 'utf-8' }).trim();
        if (out && out.endsWith('.md')) {
          newest = basename(out);
        }
      } catch (e) {
        // fallback to mtime sort if git fails
      }
    }
    
    mdPath = join(reportsDir, newest);
  }

  mdPath = resolve(mdPath);
  if (!mdPath.endsWith('.md')) {
    console.error(`❌ Input file must be a markdown file (.md). Got: ${mdPath}`);
    process.exit(1);
  }
  if (!statSync(mdPath, { throwIfNoEntry: false })) {
    console.error(`❌ Input file not found: ${mdPath}`);
    process.exit(1);
  }

  console.log(`📄 Reading markdown: ${mdPath}`);
  const mdContent = readFileSync(mdPath, 'utf-8');
  
  // Convert MD to HTML and sanitize it to prevent script injection
  const parsedHtml = sanitizeHtml(marked.parse(mdContent));

  // Load resume template
  const templatePath = resolve(__dirname, 'templates', 'resume-template.html');
  let templateHtml = readFileSync(templatePath, 'utf-8');

  // Protect {{EXPERIENCE}}, strip remaining placeholders, then inject HTML
  const expToken = '___EXPERIENCE___';
  templateHtml = templateHtml.replace('{{EXPERIENCE}}', expToken);
  templateHtml = templateHtml.replace(/\{\{[^}]+\}\}/g, '');
  templateHtml = templateHtml.replace(expToken, () => parsedHtml);

  // Determine output path based on filename regex: reports/NNN-company-YYYY-MM-DD.md
  const base = basename(mdPath);
  const match = base.match(/^\d+-(.+)-(\d{4}-\d{2}-\d{2})\.md$/);
  
  let pdfPath;
  if (match) {
    const company = match[1];
    const date = match[2];
    pdfPath = resolve(__dirname, 'output', `cv-candidate-${company}-${date}.pdf`);
  } else {
    const date = new Date().toISOString().slice(0, 10);
    const safeBase = base.replace(/\.md$/, '');
    pdfPath = resolve(__dirname, 'output', `cv-candidate-unknown-${safeBase}-${date}.pdf`);
    console.warn(`⚠️  Filename ${base} does not match expected format. Using fallback: ${basename(pdfPath)}`);
  }

  // Generate PDF using exported function
  await renderHtmlToPdf(templateHtml, pdfPath, { 
    format: 'letter', 
    baseDir: os.tmpdir(), 
    inputPath: mdPath 
  });
}

main().catch(err => {
  console.error('❌ PDF pipeline failed:', err.message);
  process.exit(1);
});
