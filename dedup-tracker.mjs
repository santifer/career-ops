#!/usr/bin/env node
/**
 * dedup-tracker.mjs — Remove duplicate entries from applications.md
 *
 * Groups by normalized company. Within each company, flags entries as
 * duplicates if:
 *   - Role Jaccard similarity >= 0.75 (on tokens with length > 3)
 *   - AND normalized locations match (or both are empty/unknown)
 *
 * Keeps entry with highest score. If a removed entry had a more advanced
 * pipeline status, promotes the keeper's status.
 *
 * Run: node dedup-tracker.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';

const CAREER_OPS = new URL('.', import.meta.url).pathname;
const APPS_FILE = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');
const DRY_RUN = process.argv.includes('--dry-run');

// Canonical English status names, ordered by pipeline advancement
const STATUS_RANK = {
  'skip':       0,
  'discarded':  0,
  'rejected':   1,
  'evaluated':  2,
  'applied':    3,
  'responded':  4,
  'interview':  5,
  'offer':      6,
};

function normalizeCompany(name) {
  return name.toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function normalizeLocation(loc) {
  return (loc || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Jaccard similarity on role tokens with length > 3.
// Threshold 0.75 avoids false positives from role specialisations like
// "Applied AI Engineer, Seoul" vs "Applied AI Engineer, Startups".
function roleMatch(a, b) {
  // Keep tokens ≥ 2 chars so 2-char acronyms (AI, ML, QA) are preserved.
  // Without this, "AI Engineer" and "ML Engineer" both collapse to {"engineer"}
  // and score 1.0 Jaccard — incorrectly flagged as duplicates.
  const tokensA = new Set(
    a.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1)
  );
  const tokensB = new Set(
    b.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1)
  );
  if (tokensA.size === 0 || tokensB.size === 0) return false;
  const intersection = [...tokensA].filter(w => tokensB.has(w)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return (intersection / union) >= 0.75;
}

// Locations must be equal to be a match.
// Both empty/unknown → conservatively allow match (can't distinguish).
// One known, one unknown → treat as different postings.
function locationMatch(a, b) {
  const la = normalizeLocation(a);
  const lb = normalizeLocation(b);
  const unknownA = !la || la === 'unknown';
  const unknownB = !lb || lb === 'unknown';
  if (unknownA && unknownB) return true;
  if (unknownA || unknownB) return false;
  return la === lb;
}

function parseScore(s) {
  const m = (s || '').replace(/\*\*/g, '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

// Table columns (0-indexed after split on '|', trimmed):
// 11-col (current):
//   [0]='' [1]=# [2]=Date [3]=Company [4]=Role [5]=Location [6]=Remote
//   [7]=Score [8]=Status [9]=PDF [10]=Report [11]=Notes [12]=''
// 9-col (legacy, no Location/Remote):
//   [0]='' [1]=# [2]=Date [3]=Company [4]=Role [5]=Score [6]=Status
//   [7]=PDF [8]=Report [9]=Notes [10]=''
function parseAppLine(line) {
  const parts = line.split('|').map(s => s.trim());
  if (parts.length < 9) return null;
  const num = parseInt(parts[1]);
  if (isNaN(num) || num === 0) return null;

  if (parts.length >= 13) {
    return {
      num,
      date:      parts[2],
      company:   parts[3],
      role:      parts[4],
      location:  parts[5],
      remote:    parts[6],
      score:     parts[7],
      status:    parts[8],
      pdf:       parts[9],
      report:    parts[10],
      notes:     parts[11] || '',
      raw:       line,
      colFormat: 11,
    };
  }
  // Legacy 9-col
  return {
    num,
    date:      parts[2],
    company:   parts[3],
    role:      parts[4],
    location:  '',
    remote:    '',
    score:     parts[5],
    status:    parts[6],
    pdf:       parts[7],
    report:    parts[8],
    notes:     parts[9] || '',
    raw:       line,
    colFormat: 9,
  };
}

// Read
if (!existsSync(APPS_FILE)) {
  console.log('No applications.md found. Nothing to dedup.');
  process.exit(0);
}
const content = readFileSync(APPS_FILE, 'utf-8');
const lines = content.split('\n');

// Parse all entries
const entries = [];
const entryLineMap = new Map(); // num → line index

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].startsWith('|')) continue;
  const app = parseAppLine(lines[i]);
  if (app && app.num > 0) {
    entries.push(app);
    entryLineMap.set(app.num, i);
  }
}

console.log(`📊 ${entries.length} entries loaded`);

// Group by company
const groups = new Map();
for (const entry of entries) {
  const key = normalizeCompany(entry.company);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(entry);
}

// Find duplicates
let removed = 0;
const linesToRemove = new Set();

for (const [, companyEntries] of groups) {
  if (companyEntries.length < 2) continue;

  const processed = new Set();
  for (let i = 0; i < companyEntries.length; i++) {
    if (processed.has(i)) continue;
    const cluster = [companyEntries[i]];
    processed.add(i);

    for (let j = i + 1; j < companyEntries.length; j++) {
      if (processed.has(j)) continue;
      if (
        roleMatch(companyEntries[i].role, companyEntries[j].role) &&
        locationMatch(companyEntries[i].location, companyEntries[j].location)
      ) {
        cluster.push(companyEntries[j]);
        processed.add(j);
      }
    }

    if (cluster.length < 2) continue;

    // Keep highest score
    cluster.sort((a, b) => parseScore(b.score) - parseScore(a.score));
    const keeper = cluster[0];

    // Promote keeper's status if a removed entry had a more advanced one
    let bestStatusRank = STATUS_RANK[keeper.status.toLowerCase()] ?? 0;
    let bestStatus = keeper.status;
    for (let k = 1; k < cluster.length; k++) {
      const rank = STATUS_RANK[cluster[k].status.toLowerCase()] ?? 0;
      if (rank > bestStatusRank) {
        bestStatusRank = rank;
        bestStatus = cluster[k].status;
      }
    }

    if (bestStatus !== keeper.status) {
      const lineIdx = entryLineMap.get(keeper.num);
      if (lineIdx !== undefined) {
        const parts = lines[lineIdx].split('|').map(s => s.trim());
        const statusCol = keeper.colFormat === 11 ? 8 : 6;
        parts[statusCol] = bestStatus;
        lines[lineIdx] = '| ' + parts.slice(1, -1).join(' | ') + ' |';
        const src = cluster.find(e => e.status === bestStatus);
        console.log(`  📝 #${keeper.num}: status promoted to "${bestStatus}" (from #${src?.num})`);
      }
    }

    // Remove lower-score duplicates
    for (let k = 1; k < cluster.length; k++) {
      const dup = cluster[k];
      const lineIdx = entryLineMap.get(dup.num);
      if (lineIdx !== undefined) {
        linesToRemove.add(lineIdx);
        removed++;
        console.log(`🗑️  Remove #${dup.num} (${dup.company} — ${dup.role} @ ${dup.location || 'unknown'}, ${dup.score}) → kept #${keeper.num}`);
      }
    }
  }
}

// Remove lines in reverse order to preserve indices
const sortedRemoveIndices = [...linesToRemove].sort((a, b) => b - a);
for (const idx of sortedRemoveIndices) {
  lines.splice(idx, 1);
}

console.log(`\n📊 ${removed} duplicates removed`);

if (!DRY_RUN && removed > 0) {
  copyFileSync(APPS_FILE, APPS_FILE + '.bak');
  writeFileSync(APPS_FILE, lines.join('\n'));
  console.log('✅ Written to applications.md (backup: applications.md.bak)');
} else if (DRY_RUN) {
  console.log('(dry-run — no changes written)');
} else {
  console.log('✅ No duplicates found');
}
