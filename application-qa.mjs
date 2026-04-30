#!/usr/bin/env node
/**
 * application-qa.mjs — Check drafted application copy for bot-like signals
 *
 * Scans report/application-answer markdown for generic phrasing, placeholders,
 * repeated openings, and suspiciously long answers. It is a review aid, not a
 * language model.
 *
 * Usage:
 *   node application-qa.mjs
 *   node application-qa.mjs reports/001-acme-2026-04-28.md
 */

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(CAREER_OPS, 'reports');
const args = process.argv.slice(2);

const GENERIC_PATTERNS = [
  /\bi am excited\b/i,
  /\bi'm excited\b/i,
  /\bpassionate about\b/i,
  /\bi would love\b/i,
  /\bdynamic team\b/i,
  /\bfast-paced environment\b/i,
  /\bperfect fit\b/i,
  /\bleverage my skills\b/i,
  /\bunique opportunity\b/i,
  /\bcutting-edge\b/i,
  /\bgame[- ]changer\b/i,
  /\bsynergy\b/i,
  /\bdelve\b/i,
  /\btapestry\b/i,
  /\bmy background has prepared me\b/i,
];

const PLACEHOLDER_PATTERNS = [
  /\[[^\]]+\]/,
  /\bCompany Name\b/i,
  /\bRole Name\b/i,
  /\bINSERT\b/i,
  /\bTODO\b/i,
  /\bTBD\b/i,
];

function listReports() {
  if (!existsSync(REPORTS_DIR)) return [];
  return readdirSync(REPORTS_DIR)
    .filter(file => file.endsWith('.md'))
    .map(file => join(REPORTS_DIR, file));
}

function extractAnswerLines(markdown) {
  const lines = [];
  for (const line of markdown.split('\n')) {
    const cleaned = line.replace(/^>\s?/, '').trim();
    if (cleaned.length >= 40) lines.push(cleaned);
  }
  return lines;
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

const files = args.length > 0 ? args.map(path => join(CAREER_OPS, path)) : listReports();
mkdirSync(REPORTS_DIR, { recursive: true });

if (files.length === 0) {
  console.log('No report files found to QA.');
  process.exit(0);
}

let warnings = 0;
const openings = new Map();

for (const file of files) {
  if (!existsSync(file)) {
    console.log(`WARN missing file: ${file}`);
    warnings++;
    continue;
  }

  const markdown = readFileSync(file, 'utf-8');
  const answers = extractAnswerLines(markdown);
  const localIssues = [];

  for (const pattern of GENERIC_PATTERNS) {
    if (pattern.test(markdown)) localIssues.push(`generic phrase: ${pattern.source}`);
  }
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(markdown)) localIssues.push(`placeholder: ${pattern.source}`);
  }
  for (const answer of answers) {
    const count = wordCount(answer);
    if (count > 170) localIssues.push(`long answer (${count} words): ${answer.slice(0, 80)}...`);

    const opening = answer.split(/\s+/).slice(0, 10).join(' ').toLowerCase();
    if (!openings.has(opening)) openings.set(opening, []);
    openings.get(opening).push(file);
  }

  if (localIssues.length > 0) {
    warnings += localIssues.length;
    console.log(`\n${file.replace(CAREER_OPS + '/', '')}`);
    for (const issue of localIssues) console.log(`  WARN ${issue}`);
  }
}

for (const [opening, paths] of openings) {
  const uniqueFiles = [...new Set(paths)];
  if (uniqueFiles.length < 2) continue;
  warnings++;
  console.log(`\nRepeated opening across ${uniqueFiles.length} files: "${opening}..."`);
  for (const file of uniqueFiles.slice(0, 5)) {
    console.log(`  WARN ${file.replace(CAREER_OPS + '/', '')}`);
  }
}

if (warnings === 0) {
  console.log(`Application QA passed for ${files.length} file(s).`);
} else {
  console.log(`\nApplication QA found ${warnings} warning(s). Review before submitting.`);
}

process.exit(0);
