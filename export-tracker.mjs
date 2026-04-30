#!/usr/bin/env node
/**
 * export-tracker.mjs — Export applications.md to spreadsheet-friendly CSV
 *
 * Keeps data/applications.md as the source of truth while producing a file
 * that can be opened in Excel, Numbers, or imported into Google Sheets.
 *
 * Usage:
 *   node export-tracker.mjs
 *   node export-tracker.mjs --output output/applications.csv
 *   node export-tracker.mjs --stdout
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');

const args = process.argv.slice(2);
const stdout = args.includes('--stdout');
const outputFlag = args.indexOf('--output');
const outputPath = outputFlag !== -1
  ? args[outputFlag + 1]
  : 'output/applications.csv';

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function extractMarkdownLink(value) {
  const match = value.match(/\[([^\]]*)\]\(([^)]+)\)/);
  if (!match) return { label: value, path: '' };
  return { label: match[1], path: match[2] };
}

function parseApplicationsMarkdown(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (line.includes('---')) continue;

    const parts = line.split('|').map(s => s.trim());
    const num = parseInt(parts[1], 10);
    if (Number.isNaN(num)) continue;

    const pdf = extractMarkdownLink(parts[7] || '');
    const report = extractMarkdownLink(parts[8] || '');

    rows.push({
      number: num,
      date: parts[2] || '',
      company: parts[3] || '',
      role: parts[4] || '',
      score: parts[5] || '',
      status: parts[6] || '',
      pdf: pdf.label,
      pdf_path: pdf.path,
      report: report.label,
      report_path: report.path,
      notes: parts[9] || '',
    });
  }
  return rows;
}

function toCsv(rows) {
  const columns = [
    'Number',
    'Date',
    'Company',
    'Role',
    'Score',
    'Status',
    'PDF',
    'PDF Path',
    'Report',
    'Report Path',
    'Notes',
  ];

  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push([
      row.number,
      row.date,
      row.company,
      row.role,
      row.score,
      row.status,
      row.pdf,
      row.pdf_path,
      row.report,
      row.report_path,
      row.notes,
    ].map(csvEscape).join(','));
  }
  return lines.join('\n') + '\n';
}

if (!existsSync(APPS_FILE)) {
  console.error('Error: applications tracker not found.');
  process.exit(1);
}

const rows = parseApplicationsMarkdown(readFileSync(APPS_FILE, 'utf-8'));
const csv = toCsv(rows);

if (stdout) {
  process.stdout.write(csv);
} else {
  const absoluteOutput = join(CAREER_OPS, outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, csv, 'utf-8');
  console.log(`Exported ${rows.length} applications to ${outputPath}`);
}
