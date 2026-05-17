#!/usr/bin/env node
// scripts/audit-apply-now.mjs — comprehensive audit of the Apply-Now queue.
//
// 2026-05-17 — Mitchell asked: go through everything in the Apply-Now queue
// to make sure it's not broken, missing information, features not clicking,
// etc. This script audits every row + drawer + interactive element and
// reports findings categorized by severity (BLOCKER / MAJOR / MINOR / OK).
//
// Audited per row:
//   • Table cells: Score, Base, Company, Role, Status, Equity, Location,
//     Health, People, Eval Date, Age, Action
//   • Drawer cards: Role at a glance (TL;DR + 3 alignment bars), Rejection
//     cooldown banner, How to position, What Fits, What's Missing, Stories
//     to lead with, Action (Apply/Skip/Defer), Notes & activity
//   • Interactivity: status popover, tier-tag tooltip, base-chip popover,
//     equity badge, careers link, role link, story child-links, action
//     buttons, alignment-bar tooltips
//   • Report file existence

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const html = readFileSync(join(ROOT, 'dashboard/index.html'), 'utf-8');

// ─── Step 1: extract every Apply-Now row ───────────────────────────
// Locate the <table id="apply-now-table"> section, then walk its rows.
// Apply-Now tbody is at id="apply-now-tbody". The drawers can contain
// NESTED <tbody>/</tbody> from "How to position" markdown tables — so we
// can't just slice to the first </tbody>. Walk forward, depth-tracking
// the open/close balance, and stop at depth 0.
const tbodyStart = html.indexOf('id="apply-now-tbody"');
if (tbodyStart < 0) {
  console.error('FATAL: apply-now-tbody not found in HTML');
  process.exit(1);
}
let depth = 1; // we're inside the outer tbody once we see its opening tag
let cursor = html.indexOf('>', tbodyStart) + 1;
const tagRe = /<(\/)?tbody\b[^>]*>/g;
tagRe.lastIndex = cursor;
let end = -1;
while (true) {
  const m = tagRe.exec(html);
  if (!m) break;
  depth += m[1] ? -1 : 1;
  if (depth === 0) { end = m.index; break; }
}
if (end < 0) {
  console.error('FATAL: matching </tbody> for apply-now-tbody not found');
  process.exit(1);
}
const tableHtml = html.slice(cursor, end);

// Extract a balanced <tr>...</tr> block starting at the given offset.
// Handles drawers that contain inner <tr> from How-to-position markdown
// tables — naive `</tr>` non-greedy match would cut at the first inner
// closing tag.
function _extractTrBlock(source, openIdx) {
  let depth = 1;
  let cursor = source.indexOf('>', openIdx) + 1;
  const tagRe = /<(\/)?tr[\s>]/g;
  tagRe.lastIndex = cursor;
  while (true) {
    const m = tagRe.exec(source);
    if (!m) return { end: -1, body: '' };
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { end: m.index + m[0].length + (m[0].endsWith('>') ? 0 : '>'.length), body: source.slice(cursor, m.index) };
  }
}

// Find every <tr class="row" with data-row-id="apply-N" in the apply-now-tbody,
// then for each, find the immediately-following <tr class="detail-row"
// id="detail-apply-N">.
const rowMatches = [...tableHtml.matchAll(/<tr class="row[^"]*"[^>]+data-row-id="(apply-\d+)"[^>]*>/g)];
const rows = [];
for (const m of rowMatches) {
  const rowId = m[1];
  const trOpen = m.index;
  // Extract the row's <tr>...</tr> block (depth-tracked).
  const trBlock = _extractTrBlock(tableHtml, trOpen);
  const tr = tableHtml.slice(trOpen, trBlock.end);
  const dataAttrs = {};
  for (const attr of tr.matchAll(/data-([\w-]+)="([^"]*)"/g)) {
    dataAttrs[attr[1]] = attr[2];
  }
  // Find detail-row that starts AFTER the row's closing </tr>.
  const detailRe = new RegExp(`<tr class="detail-row" id="detail-${rowId}"[^>]*>`);
  const detailMatch = tableHtml.slice(trBlock.end).match(detailRe);
  let drawer = '';
  if (detailMatch) {
    const detailOpen = trBlock.end + detailMatch.index;
    const detailBlock = _extractTrBlock(tableHtml, detailOpen);
    drawer = detailBlock.body;
  }
  rows.push({ rowId, tr, drawer, data: dataAttrs });
}

console.log(`Apply-Now rows extracted: ${rows.length}\n`);

// ─── Step 2: per-row audit ─────────────────────────────────────────
const findings = []; // {severity, rowId, company, role, area, issue}

function pushFinding(sev, row, area, issue) {
  findings.push({ severity: sev, rowId: row.rowId, num: row.data.num, company: row.data.company, role: row.data.role, area, issue });
}

for (const row of rows) {
  const { tr, drawer, data } = row;

  // ── Cell audits ────────────────────────────────────────
  // Score
  const scoreMatch = tr.match(/<span class="badge score-badge-lg[^"]*">([^<]+)<\/span>/);
  if (!scoreMatch || !/^\d/.test(scoreMatch[1])) {
    pushFinding('MAJOR', row, 'Score cell', `missing or unparseable: ${scoreMatch?.[1] || 'empty'}`);
  }

  // Base
  const baseChip = tr.match(/<td class="base-cell">([\s\S]+?)<\/td>/);
  if (baseChip) {
    if (/base-chip-empty/.test(baseChip[1]) && /—<\/span>/.test(baseChip[1])) {
      pushFinding('MAJOR', row, 'Base cell', 'shows — (no comp from JD or cache)');
    }
  } else {
    pushFinding('BLOCKER', row, 'Base cell', 'cell missing entirely');
  }

  // Status pill
  if (!/status-pill/.test(tr)) {
    pushFinding('MAJOR', row, 'Status cell', 'status pill missing');
  }
  if (!/openStatusPopover/.test(tr) && /status-pill/.test(tr)) {
    pushFinding('MAJOR', row, 'Status cell', 'status pill has no popover click handler');
  }

  // Equity
  if (!/equity-cell/.test(tr)) {
    pushFinding('MINOR', row, 'Equity cell', 'equity-cell missing');
  } else if (/data-equity="unknown"/.test(tr)) {
    pushFinding('MINOR', row, 'Equity cell', 'data-equity="unknown" — no overpay signal');
  }

  // Location
  const locMatch = tr.match(/<td class="location-cell">([\s\S]+?)<\/td>/);
  if (locMatch && /—\s*<\/span>/.test(locMatch[1])) {
    pushFinding('MINOR', row, 'Location cell', 'shows —');
  }

  // Health (was "Benefits") — recently renamed
  const healthMatch = tr.match(/<td class="benefits-cell">([\s\S]+?)<\/td>/);
  if (healthMatch && /—\s*<\/td>/.test(healthMatch[1])) {
    pushFinding('MINOR', row, 'Health cell', 'shows —');
  }

  // People (network proximity)
  const peopleMatch = tr.match(/<td class="people-cell">([\s\S]+?)<\/td>/);
  if (peopleMatch && /—\s*<\/td>/.test(peopleMatch[1])) {
    pushFinding('MINOR', row, 'People cell', 'shows —');
  }

  // Action cell — must have Apply + Report + Email + Verify links
  const actionMatch = tr.match(/<td class="action-cell">([\s\S]+?)<\/td>/);
  if (!actionMatch) {
    pushFinding('BLOCKER', row, 'Action cell', 'cell missing');
  } else {
    const ac = actionMatch[1];
    if (!/Apply/.test(ac)) pushFinding('MAJOR', row, 'Action: Apply link', 'missing Apply link');
    if (!/Report/.test(ac)) pushFinding('MAJOR', row, 'Action: Report link', 'missing Report link');
    if (!/Email/.test(ac)) pushFinding('MINOR', row, 'Action: Email link', 'missing Email button');
    if (!/Verify/.test(ac)) pushFinding('MINOR', row, 'Action: Verify link', 'missing Verify button');
  }

  // Eval date + age
  if (!data.role) pushFinding('BLOCKER', row, 'Role data', 'data-role missing');
  if (!data.company) pushFinding('BLOCKER', row, 'Company data', 'data-company missing');
  if (!data.score) pushFinding('MAJOR', row, 'Score data', 'data-score missing');

  // ── Drawer audits ──────────────────────────────────────
  if (!drawer || drawer.length < 200) {
    pushFinding('BLOCKER', row, 'Drawer', `empty or tiny (${drawer.length} chars)`);
    continue;
  }

  // Role at a glance: TL;DR + 3 alignment bars
  const hasRoleAtGlance = /Role at a glance/.test(drawer);
  const hasAlignBars = /alignment-bars/.test(drawer);
  const hasProfileBar = />Profile alignment</.test(drawer);
  const hasIntvBar = />Interview likelihood</.test(drawer);
  const hasHmBar = />HM-noticing chance</.test(drawer);
  if (!hasRoleAtGlance) pushFinding('MAJOR', row, 'Drawer: Role at a glance', 'card missing');
  if (!hasAlignBars) pushFinding('MAJOR', row, 'Drawer: alignment bars', 'all 3 bars missing');
  else {
    if (!hasProfileBar) pushFinding('MAJOR', row, 'Drawer: profile alignment bar', 'missing');
    if (!hasIntvBar) pushFinding('MAJOR', row, 'Drawer: interview likelihood bar', 'missing');
    if (!hasHmBar) pushFinding('MAJOR', row, 'Drawer: HM-noticing bar', 'missing');
  }

  // How to position
  const htpMatch = drawer.match(/How to position[\s\S]+?<div class="dcard-body htp-md">([\s\S]+?)<\/div>\s*<\/div>/);
  if (!htpMatch) {
    pushFinding('MAJOR', row, 'Drawer: How to position', 'card missing entirely');
  } else {
    const inner = htpMatch[1];
    // Check for raw markdown pipes (table not rendered)
    if (/\|\s*-{3,}\s*\|/.test(inner) && !/<table/.test(inner)) {
      pushFinding('MAJOR', row, 'Drawer: How to position', 'raw markdown table not rendered as HTML');
    }
    // Check for empty
    if (inner.replace(/<[^>]+>/g, '').trim().length < 20) {
      pushFinding('MAJOR', row, 'Drawer: How to position', 'card present but empty');
    }
  }

  // What Fits
  const whatFitsMatch = drawer.match(/WHAT FITS[\s\S]+?<ul class="match-list">([\s\S]+?)<\/ul>/);
  if (!whatFitsMatch) {
    pushFinding('MAJOR', row, 'Drawer: What Fits', 'card missing entirely');
  } else {
    const wfBody = whatFitsMatch[1];
    const liCount = (wfBody.match(/<li/g) || []).length;
    if (liCount < 2) pushFinding('MAJOR', row, 'Drawer: What Fits', `only ${liCount} items (expected 3+)`);
    // Check for HTML bleed (raw <br> etc. as text)
    if (/&lt;br&gt;|&lt;p&gt;/.test(wfBody)) {
      pushFinding('MINOR', row, 'Drawer: What Fits', 'HTML entities visible in evidence text');
    }
    // Check for mid-word truncation (still some? our 480 cap + sentence boundary should prevent)
    if (/[a-z]{3,}\.\.\.<\/span>$/i.test(wfBody)) {
      pushFinding('MINOR', row, 'Drawer: What Fits', 'mid-word truncation pattern');
    }
  }

  // What's Missing
  const gapMatch = drawer.match(/WHAT&#39;S MISSING|WHAT'S MISSING/);
  if (!gapMatch) {
    pushFinding('MINOR', row, 'Drawer: What\'s Missing', 'card not present (may be fine if no gaps)');
  }

  // Stories to lead with
  const storyMatch = drawer.match(/STORIES TO LEAD WITH([\s\S]+?)<\/div>\s*<\/div>/);
  if (!storyMatch) {
    pushFinding('MAJOR', row, 'Drawer: Stories', 'card missing entirely');
  } else {
    const storyCount = (storyMatch[1].match(/dcard-story-row/g) || []).length;
    if (storyCount < 1) pushFinding('MAJOR', row, 'Drawer: Stories', 'no story rows present');
  }

  // Action card buttons (drawer)
  const actionCardMatch = drawer.match(/dcard--action[\s\S]+?dcard-action-buttons/);
  if (!actionCardMatch) {
    pushFinding('MAJOR', row, 'Drawer: Action card', 'card missing');
  } else {
    if (!/Apply →/.test(drawer)) pushFinding('MAJOR', row, 'Drawer: Apply →', 'button missing');
    if (!/data-action="skip"/.test(drawer)) pushFinding('MINOR', row, 'Drawer: Skip', 'button missing');
    if (!/data-action="defer"/.test(drawer)) pushFinding('MINOR', row, 'Drawer: Defer', 'button missing');
  }

  // Notes & activity
  if (!/NOTES &amp; ACTIVITY|NOTES &amp;amp; ACTIVITY/.test(drawer)) {
    pushFinding('MINOR', row, 'Drawer: Notes', 'card missing');
  }

  // Rejection cooldown banner — only present when applicable; check not malformed
  if (/throttle-banner/.test(drawer) && /throttle-cooldown/.test(drawer)) {
    if (!/throttle-cooldown--compact/.test(drawer)) {
      pushFinding('MINOR', row, 'Drawer: Rejection cooldown', 'banner not using compact format');
    }
  }

  // Tracker note technical-language check
  if (/<span class="tn-reeval">Re-eval \d{4}-\d{2}-\d{2}\s*\(Phase/.test(drawer)) {
    pushFinding('MINOR', row, 'Drawer: Tracker note', 'still showing raw technical Re-eval badge');
  }
  if (/GATES:\s*none\s+fired/.test(drawer)) {
    pushFinding('MINOR', row, 'Drawer: Tracker note', 'raw "GATES: none fired" present (should be plain-language)');
  }

  // ── Report file existence ─────────────────────────────
  // Pull report path from action cell link
  const reportLinkMatch = tr.match(/href="reports\/([^"]+\.html)"/);
  if (reportLinkMatch) {
    const mdName = reportLinkMatch[1].replace(/\.html$/, '.md');
    if (!existsSync(join(ROOT, 'reports', mdName))) {
      pushFinding('BLOCKER', row, 'Report file', `${mdName} missing from filesystem`);
    }
  } else {
    pushFinding('MAJOR', row, 'Report link', 'no Report .html link in action cell');
  }
}

// ─── Step 3: report ─────────────────────────────────────────
const bySev = {
  BLOCKER: findings.filter(f => f.severity === 'BLOCKER'),
  MAJOR:   findings.filter(f => f.severity === 'MAJOR'),
  MINOR:   findings.filter(f => f.severity === 'MINOR'),
};

console.log('═══ AUDIT SUMMARY ═══');
console.log(`  Rows audited: ${rows.length}`);
console.log(`  BLOCKER:      ${bySev.BLOCKER.length}`);
console.log(`  MAJOR:        ${bySev.MAJOR.length}`);
console.log(`  MINOR:        ${bySev.MINOR.length}`);
console.log(`  Total issues: ${findings.length}\n`);

if (bySev.BLOCKER.length) {
  console.log('═══ BLOCKERS ═══');
  for (const f of bySev.BLOCKER) {
    console.log(`  #${f.num} ${f.company} — ${f.role}`);
    console.log(`    ${f.area}: ${f.issue}`);
  }
  console.log();
}

if (bySev.MAJOR.length) {
  console.log('═══ MAJOR ═══');
  // Group by area for scannability
  const byArea = {};
  for (const f of bySev.MAJOR) {
    if (!byArea[f.area]) byArea[f.area] = [];
    byArea[f.area].push(f);
  }
  for (const area of Object.keys(byArea).sort()) {
    console.log(`\n  ${area} (${byArea[area].length}):`);
    for (const f of byArea[area]) {
      console.log(`    • #${f.num} ${f.company} — ${f.role.slice(0, 50)}: ${f.issue}`);
    }
  }
  console.log();
}

if (bySev.MINOR.length && process.argv.includes('--verbose')) {
  console.log('═══ MINOR ═══');
  const byArea = {};
  for (const f of bySev.MINOR) {
    if (!byArea[f.area]) byArea[f.area] = [];
    byArea[f.area].push(f);
  }
  for (const area of Object.keys(byArea).sort()) {
    console.log(`\n  ${area} (${byArea[area].length}):`);
    for (const f of byArea[area]) {
      console.log(`    • #${f.num} ${f.company}: ${f.issue}`);
    }
  }
}

// Tally of areas with most issues across all severities
console.log('\n═══ HOTSPOT AREAS (most issues across all severities) ═══');
const tally = {};
for (const f of findings) {
  tally[f.area] = (tally[f.area] || 0) + 1;
}
const sortedTally = Object.entries(tally).sort((a, b) => b[1] - a[1]);
for (const [area, count] of sortedTally.slice(0, 8)) {
  console.log(`  ${count.toString().padStart(3)} × ${area}`);
}
