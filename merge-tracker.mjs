#!/usr/bin/env node
/**
 * merge-tracker.mjs — Merge batch tracker additions into applications.md
 *
 * Handles multiple TSV formats:
 * - 9-col: num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes
 * - 8-col: num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport (no notes)
 * - Pipe-delimited (markdown table row): | col | col | ... |
 *
 * Dedup: company normalized + role fuzzy match + report number match
 * If duplicate with higher score → update in-place, update report link
 * Validates status against states.yml (rejects non-canonical, logs warning)
 *
 * Run: node career-ops/merge-tracker.mjs [--dry-run] [--verify]
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execFileSync } from 'child_process';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
// Support both layouts: data/applications.md (boilerplate) and applications.md (original)
const APPS_FILE = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');
const ADDITIONS_DIR = join(CAREER_OPS, 'batch/tracker-additions');
const MERGED_DIR = join(ADDITIONS_DIR, 'merged');
const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY = process.argv.includes('--verify');

// Canonical states and aliases
const CANONICAL_STATES = ['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP'];

function validateStatus(status) {
  const clean = status.replace(/\*\*/g, '').replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
  const lower = clean.toLowerCase();

  for (const valid of CANONICAL_STATES) {
    if (valid.toLowerCase() === lower) return valid;
  }

  // Aliases
  const aliases = {
    // Spanish → English
    'evaluada': 'Evaluated', 'condicional': 'Evaluated', 'hold': 'Evaluated', 'evaluar': 'Evaluated', 'verificar': 'Evaluated',
    'aplicado': 'Applied', 'enviada': 'Applied', 'aplicada': 'Applied', 'applied': 'Applied', 'sent': 'Applied',
    'respondido': 'Responded',
    'entrevista': 'Interview',
    'oferta': 'Offer',
    'rechazado': 'Rejected', 'rechazada': 'Rejected',
    'descartado': 'Discarded', 'descartada': 'Discarded', 'cerrada': 'Discarded', 'cancelada': 'Discarded',
    'no aplicar': 'SKIP', 'no_aplicar': 'SKIP', 'skip': 'SKIP', 'monitor': 'SKIP',
    'geo blocker': 'SKIP',
  };

  if (aliases[lower]) return aliases[lower];

  // DUPLICADO/Repost → Discarded
  if (/^(duplicado|dup|repost)/i.test(lower)) return 'Discarded';

  console.warn(`⚠️  Non-canonical status "${status}" → defaulting to "Evaluated"`);
  return 'Evaluated';
}

function normalizeCompany(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Pull a normalized territory token from a parenthetical, e.g.
// "Strategic AE (NY/Remote)" → "nyremote", "Sr AE (Southwest)" → "southwest".
function extractTerritoryToken(role) {
  const m = role.match(/\(([^)]+)\)/);
  if (!m) return null;
  return m[1].toLowerCase().replace(/[^a-z0-9]/g, '') || null;
}

function roleFuzzyMatch(a, b) {
  // Distinct territories ⇒ distinct roles, even if titles otherwise overlap.
  const territoryA = extractTerritoryToken(a);
  const territoryB = extractTerritoryToken(b);
  if (territoryA && territoryB && territoryA !== territoryB) return false;

  const wordsA = a.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const wordsB = b.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const overlap = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb)));
  return overlap.length >= 2;
}

// All dedup paths must require a company match. Cross-company collisions on
// report number or entry number (e.g. duplicate `042-` filename prefixes)
// were silently collapsing distinct applications by score.
function findDuplicate(addition, existingApps) {
  const normCompany = normalizeCompany(addition.company);
  const sameCompany = existingApps.filter(app => normalizeCompany(app.company) === normCompany);
  if (sameCompany.length === 0) return null;

  const reportNum = extractReportNum(addition.report);
  if (reportNum) {
    const m = sameCompany.find(app => extractReportNum(app.report) === reportNum);
    if (m) return m;
  }

  const numMatch = sameCompany.find(app => app.num === addition.num);
  if (numMatch) return numMatch;

  return sameCompany.find(app => roleFuzzyMatch(addition.role, app.role)) || null;
}

function extractReportNum(reportStr) {
  const m = reportStr.match(/\[(\d+)\]/);
  return m ? parseInt(m[1]) : null;
}

function parseScore(s) {
  const m = s.replace(/\*\*/g, '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

function parseAppLine(line) {
  const parts = line.split('|').map(s => s.trim());
  if (parts.length < 9) return null;
  const num = parseInt(parts[1]);
  if (isNaN(num) || num === 0) return null;
  return {
    num, date: parts[2], company: parts[3], role: parts[4],
    score: parts[5], status: parts[6], pdf: parts[7], report: parts[8],
    notes: parts[9] || '', raw: line,
  };
}

/**
 * Parse a TSV file content into a structured addition object.
 * Handles: 9-col TSV, 8-col TSV, pipe-delimited markdown.
 */
function parseTsvContent(content, filename) {
  content = content.trim();
  if (!content) return null;

  let parts;
  let addition;

  // Detect pipe-delimited (markdown table row)
  if (content.startsWith('|')) {
    parts = content.split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length < 8) {
      console.warn(`⚠️  Skipping malformed pipe-delimited ${filename}: ${parts.length} fields`);
      return null;
    }
    // Format: num | date | company | role | score | status | pdf | report | notes
    addition = {
      num: parseInt(parts[0]),
      date: parts[1],
      company: parts[2],
      role: parts[3],
      score: parts[4],
      status: validateStatus(parts[5]),
      pdf: parts[6],
      report: parts[7],
      notes: parts[8] || '',
    };
  } else {
    // Tab-separated
    parts = content.split('\t');
    if (parts.length < 8) {
      console.warn(`⚠️  Skipping malformed TSV ${filename}: ${parts.length} fields`);
      return null;
    }

    // Detect column order: some TSVs have (status, score), others have (score, status)
    // Heuristic: if col4 looks like a score and col5 looks like a status, they're swapped
    const col4 = parts[4].trim();
    const col5 = parts[5].trim();
    const col4LooksLikeScore = /^\d+\.?\d*\/5$/.test(col4) || col4 === 'N/A' || col4 === 'DUP';
    const col5LooksLikeScore = /^\d+\.?\d*\/5$/.test(col5) || col5 === 'N/A' || col5 === 'DUP';
    const col4LooksLikeStatus = /^(evaluated|applied|responded|interview|offer|rejected|discarded|skip|evaluada|aplicado|respondido|entrevista|oferta|rechazado|descartado|no aplicar|cerrada|duplicado|repost|condicional|hold|monitor)/i.test(col4);
    const col5LooksLikeStatus = /^(evaluated|applied|responded|interview|offer|rejected|discarded|skip|evaluada|aplicado|respondido|entrevista|oferta|rechazado|descartado|no aplicar|cerrada|duplicado|repost|condicional|hold|monitor)/i.test(col5);

    let statusCol, scoreCol;
    if (col4LooksLikeStatus && !col4LooksLikeScore) {
      // Standard format: col4=status, col5=score
      statusCol = col4; scoreCol = col5;
    } else if (col4LooksLikeScore && col5LooksLikeStatus) {
      // Swapped format: col4=score, col5=status
      statusCol = col5; scoreCol = col4;
    } else if (col5LooksLikeScore && !col4LooksLikeScore) {
      // col5 is definitely score → col4 must be status
      statusCol = col4; scoreCol = col5;
    } else {
      // Default: standard format (status before score)
      statusCol = col4; scoreCol = col5;
    }

    addition = {
      num: parseInt(parts[0]),
      date: parts[1],
      company: parts[2],
      role: parts[3],
      status: validateStatus(statusCol),
      score: scoreCol,
      pdf: parts[6],
      report: parts[7],
      notes: parts[8] || '',
    };
  }

  if (isNaN(addition.num) || addition.num === 0) {
    console.warn(`⚠️  Skipping ${filename}: invalid entry number`);
    return null;
  }

  return addition;
}

// ---- Main ----

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (!isMain) {
  // Imported as a module (e.g. by test-all.mjs) — skip the CLI side effects.
} else {

// Read applications.md
if (!existsSync(APPS_FILE)) {
  console.log('No applications.md found. Nothing to merge into.');
  process.exit(0);
}
const appContent = readFileSync(APPS_FILE, 'utf-8');
const appLines = appContent.split('\n');
const existingApps = [];
let maxNum = 0;

for (const line of appLines) {
  if (line.startsWith('|') && !line.includes('---') && !line.includes('Empresa')) {
    const app = parseAppLine(line);
    if (app) {
      existingApps.push(app);
      if (app.num > maxNum) maxNum = app.num;
    }
  }
}

console.log(`📊 Existing: ${existingApps.length} entries, max #${maxNum}`);

// Read tracker additions
if (!existsSync(ADDITIONS_DIR)) {
  console.log('No tracker-additions directory found.');
  process.exit(0);
}

const tsvFiles = readdirSync(ADDITIONS_DIR).filter(f => f.endsWith('.tsv'));
if (tsvFiles.length === 0) {
  console.log('✅ No pending additions to merge.');
  process.exit(0);
}

// Sort files numerically for deterministic processing
tsvFiles.sort((a, b) => {
  const numA = parseInt(a.replace(/\D/g, '')) || 0;
  const numB = parseInt(b.replace(/\D/g, '')) || 0;
  return numA - numB;
});

console.log(`📥 Found ${tsvFiles.length} pending additions`);

let added = 0;
let updated = 0;
let skipped = 0;
const newLines = [];

for (const file of tsvFiles) {
  const content = readFileSync(join(ADDITIONS_DIR, file), 'utf-8').trim();
  const addition = parseTsvContent(content, file);
  if (!addition) { skipped++; continue; }

  const duplicate = findDuplicate(addition, existingApps);

  if (duplicate) {
    const newScore = parseScore(addition.score);
    const oldScore = parseScore(duplicate.score);

    if (newScore > oldScore) {
      console.log(`🔄 Update: #${duplicate.num} ${addition.company} — ${addition.role} (${oldScore}→${newScore})`);
      const lineIdx = appLines.indexOf(duplicate.raw);
      if (lineIdx >= 0) {
        // Preserve the original Date column on in-place updates — re-eval date
        // belongs in the notes, not in the canonical "first seen" date.
        const updatedLine = `| ${duplicate.num} | ${duplicate.date} | ${addition.company} | ${addition.role} | ${addition.score} | ${duplicate.status} | ${duplicate.pdf} | ${addition.report} | Re-eval ${addition.date} (${oldScore}→${newScore}). ${addition.notes} |`;
        appLines[lineIdx] = updatedLine;
        updated++;
      }
    } else {
      console.log(`⏭️  Skip: ${addition.company} — ${addition.role} (existing #${duplicate.num} ${oldScore} >= new ${newScore})`);
      skipped++;
    }
  } else {
    // New entry — use the number from the TSV
    const entryNum = addition.num > maxNum ? addition.num : ++maxNum;
    if (addition.num > maxNum) maxNum = addition.num;

    const newLine = `| ${entryNum} | ${addition.date} | ${addition.company} | ${addition.role} | ${addition.score} | ${addition.status} | ${addition.pdf} | ${addition.report} | ${addition.notes} |`;
    newLines.push(newLine);
    added++;
    console.log(`➕ Add #${entryNum}: ${addition.company} — ${addition.role} (${addition.score})`);
  }
}

// Insert new lines after the header (line index of first data row)
if (newLines.length > 0) {
  // Find header separator (|---|...) and insert after it
  let insertIdx = -1;
  for (let i = 0; i < appLines.length; i++) {
    if (appLines[i].includes('---') && appLines[i].startsWith('|')) {
      insertIdx = i + 1;
      break;
    }
  }
  if (insertIdx >= 0) {
    appLines.splice(insertIdx, 0, ...newLines);
  }
}

// Write back
if (!DRY_RUN) {
  writeFileSync(APPS_FILE, appLines.join('\n'));

  // Move processed files to merged/
  if (!existsSync(MERGED_DIR)) mkdirSync(MERGED_DIR, { recursive: true });
  for (const file of tsvFiles) {
    renameSync(join(ADDITIONS_DIR, file), join(MERGED_DIR, file));
  }
  console.log(`\n✅ Moved ${tsvFiles.length} TSVs to merged/`);
}

console.log(`\n📊 Summary: +${added} added, 🔄${updated} updated, ⏭️${skipped} skipped`);
if (DRY_RUN) console.log('(dry-run — no changes written)');

// Optional verify
if (VERIFY && !DRY_RUN) {
  console.log('\n--- Running verification ---');
  try {
    execFileSync('node', [join(CAREER_OPS, 'verify-pipeline.mjs')], { stdio: 'inherit' });
  } catch (e) {
    process.exit(1);
  }
}

} // end isMain

export { normalizeCompany, extractTerritoryToken, roleFuzzyMatch, extractReportNum, parseScore, parseTsvContent, findDuplicate };
