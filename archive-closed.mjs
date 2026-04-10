#!/usr/bin/env node
/**
 * archive-closed.mjs — Move reports + PDFs for discarded/skipped positions to archive/
 *
 * Updates report paths in applications.md so dashboard and verify-pipeline still work.
 *
 * Run: node archive-closed.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, renameSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');
const REPORTS_DIR = join(CAREER_OPS, 'reports');
const OUTPUT_DIR = join(CAREER_OPS, 'output');
const ARCHIVE_REPORTS = join(CAREER_OPS, 'archive', 'reports');
const ARCHIVE_OUTPUT = join(CAREER_OPS, 'archive', 'output');
const DRY_RUN = process.argv.includes('--dry-run');

const CLOSED_STATUSES = new Set([
  'discarded', 'descartado', 'descartada', 'cerrada', 'cancelada',
  'no aplicar', 'no_aplicar', 'skip',
  'rechazado', 'rechazada', 'rejected',
]);

function normalizeStatus(raw) {
  return raw.replace(/\*\*/g, '').replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim().toLowerCase();
}

function isClosed(status) {
  const norm = normalizeStatus(status);
  for (const s of CLOSED_STATUSES) {
    if (norm === s || norm.startsWith(s)) return true;
  }
  return false;
}

function slugFromReport(reportFilename) {
  // e.g. "049-att-2026-04-09.md" -> "att"
  // e.g. "120-databricks-2026-04-09.md" -> "databricks"
  const m = reportFilename.match(/^\d+-(.+)-\d{4}-\d{2}-\d{2}\.md$/);
  return m ? m[1] : null;
}

// --- Main ---

if (!existsSync(APPS_FILE)) {
  console.log('No applications.md found.');
  process.exit(0);
}

const content = readFileSync(APPS_FILE, 'utf-8');
const lines = content.split('\n');

// Collect PDFs in output/ for matching
const outputFiles = existsSync(OUTPUT_DIR) ? readdirSync(OUTPUT_DIR) : [];

let movedReports = 0;
let movedPDFs = 0;
let updatedPaths = 0;
const movedPDFSet = new Set();

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.startsWith('|')) continue;

  const parts = line.split('|').map(s => s.trim());
  if (parts.length < 9) continue;

  const num = parseInt(parts[1]);
  if (isNaN(num)) continue;

  const status = parts[6];
  if (!isClosed(status)) continue;

  // Extract report path from link: [049](reports/049-att-2026-04-09.md)
  const reportMatch = parts[8].match(/\]\(([^)]+)\)/);
  if (!reportMatch) continue;

  const reportRelPath = reportMatch[1];

  // Skip if already archived
  if (reportRelPath.startsWith('archive/')) continue;

  const reportFile = basename(reportRelPath);
  const reportFullPath = join(CAREER_OPS, reportRelPath);
  const archiveReportPath = join(ARCHIVE_REPORTS, reportFile);
  const newRelPath = `archive/reports/${reportFile}`;

  // Move report
  if (existsSync(reportFullPath)) {
    if (!DRY_RUN) {
      mkdirSync(ARCHIVE_REPORTS, { recursive: true });
      renameSync(reportFullPath, archiveReportPath);
    }
    console.log(`📦 Report: ${reportRelPath} → ${newRelPath}`);
    movedReports++;
  }

  // Update path in applications.md
  lines[i] = line.replace(reportRelPath, newRelPath);
  updatedPaths++;

  // Move matching PDFs (skip if already moved by another report for same company)
  const slug = slugFromReport(reportFile);
  if (slug) {
    for (const pdf of outputFiles) {
      if (!pdf.endsWith('.pdf')) continue;
      if (movedPDFSet.has(pdf)) continue;
      if (pdf.toLowerCase().includes(slug.toLowerCase())) {
        const pdfSrc = join(OUTPUT_DIR, pdf);
        const pdfDst = join(ARCHIVE_OUTPUT, pdf);
        if (existsSync(pdfSrc)) {
          if (!DRY_RUN) {
            mkdirSync(ARCHIVE_OUTPUT, { recursive: true });
            renameSync(pdfSrc, pdfDst);
          }
          console.log(`📦 PDF:    output/${pdf} → archive/output/${pdf}`);
          movedPDFs++;
          movedPDFSet.add(pdf);
        }
      }
    }
  }
}

// Write updated applications.md
if (!DRY_RUN && updatedPaths > 0) {
  writeFileSync(APPS_FILE, lines.join('\n'));
}

console.log(`\n📊 Summary: ${movedReports} reports, ${movedPDFs} PDFs archived, ${updatedPaths} paths updated`);
if (DRY_RUN) console.log('(dry-run — no changes written)');
