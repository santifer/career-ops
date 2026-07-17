#!/usr/bin/env node

/**
 * check-letter-length.mjs — Validate the cover-letter length convention.
 *
 * Usage:
 *   node check-letter-length.mjs <compiled-letter.pdf>
 *
 * Rule (user requirement, not the CV's rule): a cover letter must never be a
 * single page, and must never be "one full page plus a stray trailing line" on
 * page 2 — it should read as roughly one and a half pages. Concretely:
 *   - pageCount must be exactly 2 (1 is too short, 3+ is too long)
 *   - page 2's non-whitespace character count must be at least
 *     MIN_PAGE2_RATIO of page 1's, so page 2 holds a real paragraph or more,
 *     not just the signature block trailing behind a one-line overflow
 *
 * Requires `pdftotext` (poppler-utils) for the page-count and per-page text
 * extraction. This is an optional dependency (unlike tectonic/pdflatex,
 * poppler-utils is not otherwise required by career-ops) — when it is not
 * installed, this check is skipped with a clear note instead of blocking the
 * pipeline, and the agent should fall back to visually inspecting the two
 * rendered pages.
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const MIN_PAGE2_RATIO = 0.45; // calibrated empirically: a stray trailing line measured ~0.15, a real half page measured ~0.55

function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error('Usage: node check-letter-length.mjs <compiled-letter.pdf>');
    process.exit(1);
  }

  const absPath = resolve(pdfPath);
  if (!existsSync(absPath)) {
    console.error(`PDF not found: ${absPath}`);
    process.exit(1);
  }

  let pageCount;
  try {
    const info = execFileSync('pdfinfo', [absPath], { encoding: 'utf-8' });
    const match = info.match(/Pages:\s+(\d+)/);
    pageCount = match ? parseInt(match[1], 10) : null;
  } catch {
    console.log(JSON.stringify({
      checked: false,
      reason: 'pdfinfo not available (poppler-utils not installed). Skipping the automated length gate -- visually confirm the letter runs onto page 2 with at least half a page of content there, not a single stray line.',
    }, null, 2));
    process.exit(0); // soft: an optional tool being missing must not fail the pipeline
  }

  const result = { checked: true, pageCount, valid: true, issues: [] };

  if (pageCount === 1) {
    result.valid = false;
    result.issues.push('Letter is exactly 1 page. It must run onto a second page -- lengthen the body (add or expand a paragraph) rather than trimming.');
  } else if (pageCount > 2) {
    result.valid = false;
    result.issues.push(`Letter is ${pageCount} pages. That is too long for a cover letter -- trim body content back toward roughly one and a half pages.`);
  } else {
    const page1 = extractPageChars(absPath, 1);
    const page2 = extractPageChars(absPath, 2);
    result.page1Chars = page1;
    result.page2Chars = page2;
    const ratio = page1 > 0 ? page2 / page1 : 0;
    result.page2ToPage1Ratio = parseFloat(ratio.toFixed(3));
    if (ratio < MIN_PAGE2_RATIO) {
      result.valid = false;
      result.issues.push(`Page 2 holds only ${page2} non-whitespace characters (${(ratio * 100).toFixed(0)}% of page 1's ${page1}) -- reads as a stray trailing line/signature, not "one and a half pages". Lengthen the body (add detail to an existing paragraph or a new one) until page 2 holds at least ${Math.round(MIN_PAGE2_RATIO * 100)}% of page 1's content.`);
    }
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 1);
}

function extractPageChars(pdfPath, pageNum) {
  const text = execFileSync('pdftotext', ['-f', String(pageNum), '-l', String(pageNum), pdfPath, '-'], { encoding: 'utf-8' });
  return text.replace(/\s+/g, '').length;
}

main();
