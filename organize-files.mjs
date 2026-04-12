#!/usr/bin/env node

/**
 * organize-files.mjs — Reorganize reports & PDFs into status-based subdirectories
 *
 * Directory structure:
 *   reports/{open,applied,archived}/
 *   output/{open,applied,archived}/
 *
 * Mapping:
 *   open/     ← Evaluated (pending decision)
 *   applied/  ← Applied, Responded, Interview, Offer
 *   archived/ ← SKIP, Discarded, Rejected
 *
 * Usage:
 *   node organize-files.mjs                  # reorganize based on current statuses
 *   node organize-files.mjs --prune 3.5      # mark entries ≤ 3.5 as SKIP first
 *   node organize-files.mjs --check-pdf      # report entries missing PDFs
 *   node organize-files.mjs --dry-run        # preview without writing
 *   node organize-files.mjs --normalize      # also normalize statuses to English
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync, rmSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const ROOT = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = existsSync(join(ROOT, 'data/applications.md'))
  ? join(ROOT, 'data/applications.md')
  : join(ROOT, 'applications.md');
const REPORTS_DIR = join(ROOT, 'reports');
const OUTPUT_DIR = join(ROOT, 'output');
const ARCHIVE_DIR = join(ROOT, 'archive/reports');

// ── CLI ─────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, prune: null, checkPdf: false, normalize: false, rename: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run': opts.dryRun = true; break;
      case '--prune': opts.prune = parseFloat(args[++i]); break;
      case '--check-pdf': opts.checkPdf = true; break;
      case '--normalize': opts.normalize = true; break;
      case '--rename': opts.rename = true; break;
      case '--help': case '-h': printHelp(); process.exit(0);
      default: console.error(`Unknown flag: ${args[i]}`); process.exit(1);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
organize-files.mjs — Reorganize reports & PDFs by status

Usage:
  node organize-files.mjs [OPTIONS]

Options:
  --prune N       Mark entries scoring ≤ N as SKIP before organizing
  --check-pdf     Report entries missing PDFs
  --normalize     Normalize statuses to English canonical form
  --rename        Rename PDFs to standard format: LastName-Company-Role-ID.pdf
  --dry-run       Preview without writing
  -h, --help      Show this help

Subdirectories:
  open/     Evaluated (pending decision)
  applied/  Applied, Responded, Interview, Offer
  archived/ SKIP, Discarded, Rejected
`.trim());
}

// ── Status mapping ──────────────────────────────────────────────────

const STATUS_DIR_MAP = {
  'evaluated': 'open',
  'evaluada': 'open',
  'condicional': 'open',
  'hold': 'open',

  'applied': 'applied',
  'aplicado': 'applied',
  'aplicada': 'applied',
  'enviada': 'applied',
  'responded': 'applied',
  'respondido': 'applied',
  'interview': 'applied',
  'entrevista': 'applied',
  'offer': 'applied',
  'oferta': 'applied',

  'skip': 'archived',
  'no aplicar': 'archived',
  'discarded': 'archived',
  'descartado': 'archived',
  'descartada': 'archived',
  'rejected': 'archived',
  'rechazado': 'archived',
  'rechazada': 'archived',
  'cerrada': 'archived',
  'cancelada': 'archived',
  'monitor': 'archived',
  'geo blocker': 'archived',
};

const STATUS_NORMALIZE = {
  'evaluada': 'Evaluated',
  'condicional': 'Evaluated',
  'hold': 'Evaluated',
  'aplicado': 'Applied',
  'aplicada': 'Applied',
  'enviada': 'Applied',
  'respondido': 'Responded',
  'entrevista': 'Interview',
  'oferta': 'Offer',
  'rechazado': 'Rejected',
  'rechazada': 'Rejected',
  'descartado': 'Discarded',
  'descartada': 'Discarded',
  'cerrada': 'Discarded',
  'cancelada': 'Discarded',
  'no aplicar': 'SKIP',
  'monitor': 'SKIP',
  'geo blocker': 'SKIP',
};

function statusToDir(status) {
  const clean = status.replace(/\*\*/g, '').trim().toLowerCase();
  return STATUS_DIR_MAP[clean] || 'open';
}

function normalizeStatus(status) {
  const clean = status.replace(/\*\*/g, '').trim();
  const lower = clean.toLowerCase();
  return STATUS_NORMALIZE[lower] || clean;
}

// ── File search ─────────────────────────────────────────────────────

/**
 * Find a report file by its filename across all known locations.
 * Returns the full path if found, null otherwise.
 */
function findReportFile(filename) {
  const searchDirs = [
    REPORTS_DIR,                        // reports/ (flat, legacy)
    ARCHIVE_DIR,                        // archive/reports/ (old archive)
    join(REPORTS_DIR, 'open'),          // reports/open/
    join(REPORTS_DIR, 'applied'),       // reports/applied/
    join(REPORTS_DIR, 'archived'),      // reports/archived/
  ];

  for (const dir of searchDirs) {
    const path = join(dir, filename);
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Get candidate last name from profile.yml for PDF naming.
 */
function getCandidateLastName() {
  const profilePath = join(ROOT, 'config/profile.yml');
  if (!existsSync(profilePath)) return 'Candidate';
  try {
    const config = yaml.load(readFileSync(profilePath, 'utf-8'));
    const fullName = config?.candidate?.full_name || '';
    // Take first last name (before second last name if present)
    const parts = fullName.split(/\s+/);
    return parts.length >= 2 ? parts[parts.length - 2] : parts[0] || 'Candidate';
  } catch { return 'Candidate'; }
}

/**
 * Build the canonical PDF filename for an entry.
 * Format: LastName-Company-Role_Slug-0151.pdf
 */
function canonicalPdfName(entry, lastName) {
  const company = entry.company
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  const role = entry.role
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
  const id = String(entry.num).padStart(4, '0');
  return `${lastName}-${company}-${role}-${id}.pdf`;
}

/**
 * Collect all PDFs across output/ subdirectories.
 */
function collectAllPdfs() {
  const pdfs = [];
  const searchDirs = [
    OUTPUT_DIR,
    join(OUTPUT_DIR, 'open'),
    join(OUTPUT_DIR, 'applied'),
    join(OUTPUT_DIR, 'archived'),
  ];
  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const file of readdirSync(dir)) {
        if (file.endsWith('.pdf')) pdfs.push({ path: join(dir, file), filename: file });
      }
    } catch { /* ignore */ }
  }
  return pdfs;
}

/**
 * Match PDFs to tracker entries with priority-based claiming.
 * Returns Map<entryNum, Array<{path, filename}>>
 */
function matchPdfsToEntries(entries, lastName) {
  const allPdfs = collectAllPdfs();
  const claimed = new Set();            // PDF paths already claimed
  const entryPdfs = new Map();          // entryNum → [{path, filename}]

  for (const entry of entries) entryPdfs.set(entry.num, []);

  // Pass 1: exact canonical name or report number suffix (strongest match)
  for (const entry of entries) {
    const canonical = canonicalPdfName(entry, lastName);
    const numPad4 = String(entry.num).padStart(4, '0');
    const numPad3 = String(entry.num).padStart(3, '0');

    for (const pdf of allPdfs) {
      if (claimed.has(pdf.path)) continue;
      if (
        pdf.filename === canonical ||
        pdf.filename.endsWith(`-${numPad4}.pdf`) ||
        pdf.filename.endsWith(`-${numPad3}.pdf`)
      ) {
        entryPdfs.get(entry.num).push(pdf);
        claimed.add(pdf.path);
      }
    }
  }

  // Pass 2: company slug + role keywords (medium match)
  for (const entry of entries) {
    const slug = companyToSlug(entry.company);
    // Extract 2-3 distinctive role keywords
    const roleWords = entry.role.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !['the', 'and', 'for', 'senior', 'lead', 'staff', 'principal'].includes(w));

    for (const pdf of allPdfs) {
      if (claimed.has(pdf.path)) continue;
      const lower = pdf.filename.toLowerCase();
      if (!lower.includes(slug)) continue;
      // Must also match at least one role keyword
      if (roleWords.some(w => lower.includes(w))) {
        entryPdfs.get(entry.num).push(pdf);
        claimed.add(pdf.path);
      }
    }
  }

  // Pass 3: company slug only (weakest — only if entry has no PDFs yet)
  for (const entry of entries) {
    if (entryPdfs.get(entry.num).length > 0) continue;
    const slug = companyToSlug(entry.company);

    for (const pdf of allPdfs) {
      if (claimed.has(pdf.path)) continue;
      if (pdf.filename.toLowerCase().includes(slug)) {
        entryPdfs.get(entry.num).push(pdf);
        claimed.add(pdf.path);
      }
    }
  }

  return entryPdfs;
}

// ── Slug extraction ─────────────────────────────────────────────────

function companyToSlug(company) {
  return company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractReportFilename(reportLink) {
  // Order matters: try longer prefixes first so reports/open/ matches before reports/
  const m = reportLink.match(/\]\((?:reports\/\w+\/|archive\/reports\/|reports\/)([^)]+)\)/);
  return m ? m[1] : null;
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs();

  if (!existsSync(APPS_FILE)) {
    console.log('No applications.md found.');
    process.exit(0);
  }

  // 1. Ensure subdirectories exist
  const subdirs = ['open', 'applied', 'archived'];
  for (const sub of subdirs) {
    mkdirSync(join(REPORTS_DIR, sub), { recursive: true });
    mkdirSync(join(OUTPUT_DIR, sub), { recursive: true });
  }

  // 2. Read applications.md
  let content = readFileSync(APPS_FILE, 'utf-8');
  const lines = content.split('\n');

  // 3. Parse entries
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) continue;
    const parts = line.split('|').map(s => s.trim());
    const num = parseInt(parts[1]);
    if (isNaN(num) || num === 0) continue;
    entries.push({
      lineIdx: i,
      num,
      date: parts[2],
      company: parts[3],
      role: parts[4],
      score: parts[5],
      status: parts[6],
      pdf: parts[7],
      report: parts[8],
      notes: parts[9] || '',
    });
  }

  console.log(`Found ${entries.length} entries in applications.md`);

  // 4. Prune if requested
  let pruned = 0;
  if (opts.prune !== null) {
    for (const entry of entries) {
      const score = parseFloat(entry.score);
      if (isNaN(score)) continue;
      if (score <= opts.prune) {
        const dir = statusToDir(entry.status);
        if (dir !== 'archived') {
          entry.status = 'SKIP';
          entry.notes = `Auto-pruned (≤${opts.prune}). ${entry.notes}`.trim();
          pruned++;
        }
      }
    }
    if (pruned > 0) console.log(`Pruned ${pruned} entries scoring ≤ ${opts.prune} → SKIP`);
  }

  // 5. Normalize statuses if requested
  let normalized = 0;
  if (opts.normalize) {
    for (const entry of entries) {
      const norm = normalizeStatus(entry.status);
      if (norm !== entry.status) {
        entry.status = norm;
        normalized++;
      }
    }
    if (normalized > 0) console.log(`Normalized ${normalized} statuses to English`);
  }

  // 6. Plan moves
  const lastName = getCandidateLastName();
  const moves = [];       // { from, to, type }
  const pdfMoves = [];    // { from, to }
  const pdfRenames = [];  // { from, to } — rename to canonical format
  const missingReports = [];
  const missingPdfs = [];
  const linkUpdates = []; // { lineIdx, oldLink, newLink }

  // Match PDFs to entries with priority-based claiming
  const entryPdfs = matchPdfsToEntries(entries, lastName);

  for (const entry of entries) {
    const targetDir = statusToDir(entry.status);
    const reportFilename = extractReportFilename(entry.report);

    if (!reportFilename) {
      missingReports.push(entry);
      continue;
    }

    // Find current report location
    const currentPath = findReportFile(reportFilename);
    const targetPath = join(REPORTS_DIR, targetDir, reportFilename);

    if (currentPath && currentPath !== targetPath) {
      moves.push({ from: currentPath, to: targetPath, type: 'report', entry });
    } else if (!currentPath) {
      missingReports.push(entry);
    }

    // Update link in applications.md
    const newLink = `reports/${targetDir}/${reportFilename}`;
    const currentLinkMatch = entry.report.match(/\]\(([^)]+)\)/);
    if (currentLinkMatch && currentLinkMatch[1] !== newLink) {
      linkUpdates.push({
        lineIdx: entry.lineIdx,
        oldLink: currentLinkMatch[1],
        newLink,
        num: entry.num,
      });
    }

    // Plan PDF moves (and renames if --rename)
    const pdfs = entryPdfs.get(entry.num) || [];
    if (pdfs.length === 0 && statusToDir(entry.status) !== 'archived') {
      missingPdfs.push(entry);
    }

    const canonical = canonicalPdfName(entry, lastName);
    for (const pdf of pdfs) {
      const targetFilename = opts.rename ? canonical : pdf.filename;
      const pdfTarget = join(OUTPUT_DIR, targetDir, targetFilename);
      if (pdf.path !== pdfTarget) {
        if (!pdfMoves.some(m => m.from === pdf.path)) {
          pdfMoves.push({ from: pdf.path, to: pdfTarget });
          if (opts.rename && pdf.filename !== canonical) {
            pdfRenames.push({ from: pdf.filename, to: canonical });
          }
        }
      }
    }
  }

  // 7. Summary
  console.log(`\nPlan:`);
  console.log(`  Reports to move:  ${moves.length}`);
  console.log(`  PDFs to move:     ${pdfMoves.length}`);
  if (pdfRenames.length > 0) console.log(`  PDFs to rename:   ${pdfRenames.length}`);
  console.log(`  Links to update:  ${linkUpdates.length}`);
  if (missingReports.length > 0) {
    console.log(`  Missing reports:  ${missingReports.length}`);
  }

  if (opts.dryRun) {
    if (moves.length > 0) {
      console.log(`\nReport moves (dry run):`);
      for (const m of moves.slice(0, 20)) {
        console.log(`  ${basename(m.from)} → ${m.to.replace(ROOT + '/', '')}`);
      }
      if (moves.length > 20) console.log(`  ... and ${moves.length - 20} more`);
    }
    if (pdfMoves.length > 0) {
      console.log(`\nPDF moves (dry run):`);
      for (const m of pdfMoves.slice(0, 10)) {
        console.log(`  ${basename(m.from)} → ${m.to.replace(ROOT + '/', '')}`);
      }
      if (pdfMoves.length > 10) console.log(`  ... and ${pdfMoves.length - 10} more`);
    }
    console.log(`\n(dry run — no changes written)`);
  }

  // 8. Execute
  if (!opts.dryRun) {
    // Move reports
    let reportsMoved = 0;
    for (const m of moves) {
      try {
        mkdirSync(dirname(m.to), { recursive: true });
        renameSync(m.from, m.to);
        reportsMoved++;
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.log(`  ⚠️  Skipped (not found): ${basename(m.from)}`);
        } else { throw err; }
      }
    }

    // Move PDFs
    let pdfsMoved = 0;
    for (const m of pdfMoves) {
      try {
        mkdirSync(dirname(m.to), { recursive: true });
        renameSync(m.from, m.to);
        pdfsMoved++;
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.log(`  ⚠️  Skipped PDF (not found): ${basename(m.from)}`);
        } else { throw err; }
      }
    }

    // Update applications.md
    for (const entry of entries) {
      const targetDir = statusToDir(entry.status);
      const reportFilename = extractReportFilename(entry.report);
      if (!reportFilename) continue;

      const newLink = `reports/${targetDir}/${reportFilename}`;
      const reportCol = entry.report.replace(/\]\([^)]+\)/, `](${newLink})`);

      // Rebuild line
      const newLine = `| ${entry.num} | ${entry.date} | ${entry.company} | ${entry.role} | ${entry.score} | ${entry.status} | ${entry.pdf} | ${reportCol} | ${entry.notes} |`;
      lines[entry.lineIdx] = newLine;
    }

    writeFileSync(APPS_FILE, lines.join('\n'));

    console.log(`\nDone:`);
    console.log(`  Reports moved: ${reportsMoved}`);
    console.log(`  PDFs moved:    ${pdfsMoved}`);
    console.log(`  Links updated: ${linkUpdates.length}`);

    // Clean up archive/reports/ if empty
    if (existsSync(ARCHIVE_DIR)) {
      try {
        const remaining = readdirSync(ARCHIVE_DIR);
        if (remaining.length === 0) {
          rmSync(ARCHIVE_DIR, { recursive: true });
          const archiveParent = join(ROOT, 'archive');
          if (existsSync(archiveParent) && readdirSync(archiveParent).length === 0) {
            rmSync(archiveParent, { recursive: true });
          }
          console.log(`  Cleaned up empty archive/ directory`);
        }
      } catch { /* ignore cleanup errors */ }
    }
  }

  // 9. Check PDFs
  if (opts.checkPdf) {
    const nonArchived = missingPdfs.filter(e => statusToDir(e.status) !== 'archived');
    if (nonArchived.length > 0) {
      console.log(`\nEntries missing PDFs (${nonArchived.length}):`);
      for (const e of nonArchived) {
        console.log(`  #${e.num} ${e.company} — ${e.role} (${e.score}, ${e.status})`);
      }
      console.log(`\n→ Run /career-ops pdf for each to generate.`);
    } else {
      console.log(`\nAll non-archived entries have PDFs.`);
    }
  }

  // 10. Dir summary
  if (!opts.dryRun) {
    const countFiles = (dir) => {
      try { return readdirSync(dir).filter(f => f.endsWith('.md')).length; } catch { return 0; }
    };
    const countPdfs = (dir) => {
      try { return readdirSync(dir).filter(f => f.endsWith('.pdf')).length; } catch { return 0; }
    };

    console.log(`\nDirectory summary:`);
    console.log(`  reports/open/:     ${countFiles(join(REPORTS_DIR, 'open'))} reports`);
    console.log(`  reports/applied/:  ${countFiles(join(REPORTS_DIR, 'applied'))} reports`);
    console.log(`  reports/archived/: ${countFiles(join(REPORTS_DIR, 'archived'))} reports`);
    console.log(`  output/open/:      ${countPdfs(join(OUTPUT_DIR, 'open'))} PDFs`);
    console.log(`  output/applied/:   ${countPdfs(join(OUTPUT_DIR, 'applied'))} PDFs`);
    console.log(`  output/archived/:  ${countPdfs(join(OUTPUT_DIR, 'archived'))} PDFs`);

    // Check for orphaned files still in flat reports/
    const flatReports = readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md'));
    if (flatReports.length > 0) {
      console.log(`\n⚠️  ${flatReports.length} reports still in flat reports/ (no tracker entry found)`);
    }
  }
}

main();
