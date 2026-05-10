/**
 * optimize-pipeline.mjs
 * Cleans data/pipeline.md in three phases:
 *   Phase 1: Dedup (exact URL match + prefix/truncation match)
 *   Phase 2: Auto-discard obvious misfits via hard-negative keywords
 *   Phase 3: Report (counts only, no API calls)
 *
 * Usage:
 *   node scripts/optimize-pipeline.mjs            (run all phases, write in-place)
 *   node scripts/optimize-pipeline.mjs --dry-run  (print changes without writing)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const PIPELINE_PATH = resolve(ROOT, 'data/pipeline.md');
const DRY_RUN = process.argv.includes('--dry-run');

// Hard-negative keyword lists — all matched case-insensitively against title
// (and occasionally company) text.

const ENTRY_LEVEL_KEYWORDS = [
  'new college grad',
  'college grad',
  'entry level grad',
  'entry-level grad',
  'junior',
  'intern',
  'internship',
];

// Geography keywords matched in the title field
const GEO_EXCLUDE_KEYWORDS = [
  'taiwan',
  'singapore',
  'tokyo',
  'india',
  'bangalore',
  'bengaluru',   // common alternate spelling
  'mumbai',
  'hyderabad',
  'beijing',
  'shanghai',
];

// Role-type mismatches matched in title
const ROLE_TYPE_KEYWORDS = [
  'supply chain planner',
  'supply chain analyst',
  'events content',
  'trade show',
  'procurement',
  'manufacturing planner',
  'fab ',          // trailing space avoids matching "fabulous" etc.
  'mfg ',
];

// Hardware/fab terms matched in BOTH title and company together
const HW_FAB_KEYWORDS = [
  'semiconductor fab',
  'wafer',
  'etch',
  'deposition',
  // 'fab' alone is too noisy — cover via the compound check below
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a single pipeline entry line into its parts, or null if not a task line. */
function parseLine(line) {
  // Match: - [ ] URL | Company | Title | optional-date
  //         - [x] ...
  const m = line.match(/^(-\s\[([x ])\]\s+)(\S+)\s*\|\s*(.+?)\s*\|\s*(.+?)(\s*\|\s*(\S+))?\s*$/);
  if (!m) return null;
  return {
    prefix: m[1],         // '- [ ] ' or '- [x] '
    checked: m[2] === 'x',
    url: m[3],
    company: m[4].trim(),
    title: m[5].trim(),
    date: m[7] ? m[7].trim() : null,
  };
}

/** Rebuild a line from its parsed parts. */
function buildLine(parsed, note) {
  const datePart = parsed.date ? ` | ${parsed.date}` : '';
  const notePart = note ? ` | NOTE: ${note}` : '';
  return `- [x] ${parsed.url} | ${parsed.company} | ${parsed.title}${datePart}${notePart}`;
}

/** Case-insensitive check: does haystack contain any of the needles? */
function containsAny(haystack, needles) {
  const h = haystack.toLowerCase();
  return needles.some(n => h.includes(n.toLowerCase()));
}

/**
 * Dedup detection: returns true if urlA is a prefix of urlB (truncated) or
 * they are identical. The "prefix" here means urlA starts with urlB or vice
 * versa, accounting for URL truncation (the truncated one ends mid-UUID etc.).
 */
function isTruncatedDuplicate(urlA, urlB) {
  if (urlA === urlB) return true;
  // Allow a small tail overlap: if the shorter one is a prefix of the longer
  // and the shorter is at least 20 chars (avoid false positives on short URLs)
  const [shorter, longer] =
    urlA.length <= urlB.length ? [urlA, urlB] : [urlB, urlA];
  return shorter.length >= 20 && longer.startsWith(shorter);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const raw = readFileSync(PIPELINE_PATH, 'utf8');
const lines = raw.split('\n');

// Track changes for the report
const changes = []; // { lineNo, original, updated, reason }

// Phase 1: Dedup
// Build index of seen full URLs (url -> first-seen lineNo)
// We'll do two passes: first collect all task lines and their parsed data,
// then mark duplicates.

const parsed = lines.map((line, i) => ({ line, i, p: parseLine(line) }));

// Map: canonical-url -> index-in-parsed (first occurrence of this URL or the
// "full" version of a truncated pair)
const urlIndex = new Map(); // url -> idx in parsed array

// First pass — exact dedup and truncation dedup
for (const entry of parsed) {
  if (!entry.p) continue;                 // not a task line
  if (entry.p.checked) continue;         // already done, skip dedup analysis

  const url = entry.p.url;
  let dedupOf = null; // url of the item we are a dup of

  // Check against all previously seen URLs
  for (const [seenUrl, seenIdx] of urlIndex) {
    if (isTruncatedDuplicate(url, seenUrl)) {
      // Determine which is the full URL (longer one)
      if (url.length < seenUrl.length) {
        // Current entry is the truncated one — mark it
        dedupOf = seenUrl;
      } else if (url.length > seenUrl.length) {
        // Previously seen entry is the truncated one — swap: mark old as dup
        // and promote current to canonical
        const oldEntry = parsed[seenIdx];
        const oldReason = `DEDUP: duplicate of full URL ${url}`;
        changes.push({
          lineNo: oldEntry.i + 1,
          original: oldEntry.line,
          updated: buildLine(oldEntry.p, oldReason),
          reason: oldReason,
        });
        oldEntry.line = buildLine(oldEntry.p, oldReason);
        oldEntry.deduped = true;
        // Replace in index
        urlIndex.delete(seenUrl);
        urlIndex.set(url, parsed.indexOf(entry));
      }
      // Exact match: mark current as dup of seen
      else {
        dedupOf = seenUrl;
      }
      break;
    }
  }

  if (dedupOf) {
    const reason = `DEDUP: duplicate of full URL ${dedupOf}`;
    changes.push({
      lineNo: entry.i + 1,
      original: entry.line,
      updated: buildLine(entry.p, reason),
      reason,
    });
    entry.line = buildLine(entry.p, reason);
    entry.deduped = true;
  } else {
    urlIndex.set(url, parsed.indexOf(entry));
  }
}

// Phase 2: Auto-discard
for (const entry of parsed) {
  if (!entry.p) continue;
  if (entry.p.checked) continue;
  if (entry.deduped) continue; // already handled

  const title = entry.p.title.toLowerCase();
  const company = entry.p.company.toLowerCase();
  const combined = `${title} ${company}`;

  let reason = null;

  if (containsAny(title, ENTRY_LEVEL_KEYWORDS)) {
    reason = 'entry-level role';
  } else if (containsAny(title, GEO_EXCLUDE_KEYWORDS)) {
    reason = 'excluded geography';
  } else if (containsAny(title, ROLE_TYPE_KEYWORDS)) {
    reason = 'role type mismatch';
  } else if (containsAny(combined, HW_FAB_KEYWORDS)) {
    reason = 'hardware/fab role';
  }

  if (reason) {
    const fullReason = `AUTO-DISCARD: ${reason}`;
    changes.push({
      lineNo: entry.i + 1,
      original: entry.line,
      updated: buildLine(entry.p, fullReason),
      reason: fullReason,
    });
    entry.line = buildLine(entry.p, fullReason);
    entry.discarded = true;
  }
}

// Phase 3: Counts
let pendingCount = 0;
let dedupCount = 0;
let discardCount = 0;
let linkedinEmailCount = 0;

for (const entry of parsed) {
  if (!entry.p) continue;

  // Count newly deduped/discarded
  if (entry.deduped) dedupCount++;
  else if (entry.discarded) discardCount++;
  else if (!entry.p.checked) {
    pendingCount++;
    // LinkedIn from-email check (still pending after phases 1+2)
    if (
      entry.p.url.includes('linkedin.com/jobs/view') &&
      entry.p.company === '(from email)'
    ) {
      linkedinEmailCount++;
    }
  }
}

// Build updated content — add/replace the optimize comment after the first heading
const updatedLines = parsed.map(e => e.line);

const today = new Date().toISOString().slice(0, 10);
const commentTag = `<!-- optimize-pipeline: updated ${today} -->`;

// Find first heading (# Pipeline) and insert comment after it
let headingInserted = false;
for (let i = 0; i < updatedLines.length; i++) {
  if (updatedLines[i].startsWith('# ')) {
    // Remove any existing optimize-pipeline comment on the next line
    if (
      i + 1 < updatedLines.length &&
      updatedLines[i + 1].startsWith('<!-- optimize-pipeline:')
    ) {
      updatedLines.splice(i + 1, 1, commentTag);
    } else {
      updatedLines.splice(i + 1, 0, commentTag);
    }
    headingInserted = true;
    break;
  }
}
if (!headingInserted) {
  updatedLines.unshift(commentTag);
}

const updatedContent = updatedLines.join('\n');

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

if (DRY_RUN) {
  console.log('=== optimize-pipeline DRY RUN ===\n');

  if (changes.length === 0) {
    console.log('No changes detected.');
  } else {
    for (const c of changes) {
      console.log(`Line ${c.lineNo}: [${c.reason}]`);
      console.log(`  BEFORE: ${c.original.trim()}`);
      console.log(`  AFTER:  ${c.updated.trim()}`);
      console.log('');
    }
  }
} else {
  writeFileSync(PIPELINE_PATH, updatedContent, 'utf8');
  console.log(`optimize-pipeline: wrote ${PIPELINE_PATH}`);
}

console.log('=== Summary ===');
console.log(`  Pending items remaining : ${pendingCount}`);
console.log(`  Deduped                 : ${dedupCount}`);
console.log(`  Auto-discarded          : ${discardCount}`);
console.log(`  LinkedIn (from email)   : ${linkedinEmailCount} (need manual review or AI resolution)`);
console.log(`  Total changes           : ${changes.length}`);
if (DRY_RUN) {
  console.log('\n(Dry run — no files written)');
}
