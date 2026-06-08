#!/usr/bin/env node
/**
 * Splice one or more new job cards into the golden Kanban file.
 *
 * Usage:
 *   node splice-cards.mjs --cards <cards.json> [--kanban <path>] [--bump-seed]
 *   echo '[ {card1}, {card2} ]' | node splice-cards.mjs --cards stdin
 *
 * Behavior:
 *   1) Reads current state via the same logic as inspect-kanban.mjs.
 *   2) For each input card object: assigns next sequential id following the
 *      file's existing pattern (rN or live-N), validates required keys,
 *      refuses duplicates by (company, role) tuple, generates the comment
 *      block in the file's existing anchor style.
 *   3) Locates the closing of the last existing card object, splices the
 *      new card block(s) immediately after.
 *   4) Bumps SEED_VERSION (v15-live-jobs -> v16-live-jobs).
 *   5) Writes a timestamped .bak next to the golden file.
 *   6) Atomic .tmp -> rename.
 *
 * Card input shape (omit id/createdAt/lastRefreshed; the script fills them):
 *   {
 *     "company": "Samsara",
 *     "role": "Program Manager, X",
 *     "platform": "greenhouse",
 *     "url": "https://...",
 *     "connectionName": "" | "Jane Doe",
 *     "connectionLinkedinUrl": "" | "https://www.linkedin.com/in/janedoe",
 *     "keywords": ["...","..."],
 *     "jobDescText": "...",
 *     "verifiedMonth": "April 2026"     // optional, used in the comment
 *   }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goldenPathFile = path.resolve(__dirname, '..', 'assets', 'golden-path.txt');

// --- CLI parsing -----------------------------------------------------------
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return null;
  return args[i + 1];
}
const kanbanPath = flag('kanban')
  || (fs.existsSync(goldenPathFile) ? fs.readFileSync(goldenPathFile, 'utf8').trim() : null);
const cardsArg = flag('cards');
const bumpSeed = !args.includes('--no-bump-seed'); // default true

if (!kanbanPath || !fs.existsSync(kanbanPath)) {
  console.error(`Kanban file not found: ${kanbanPath}`);
  process.exit(2);
}
if (!cardsArg) {
  console.error('Pass --cards <file.json> or --cards stdin');
  process.exit(2);
}

let inputCards;
if (cardsArg === 'stdin') {
  const raw = fs.readFileSync(0, 'utf8');
  inputCards = JSON.parse(raw);
} else {
  if (!fs.existsSync(cardsArg)) {
    console.error(`Cards file not found: ${cardsArg}`);
    process.exit(2);
  }
  inputCards = JSON.parse(fs.readFileSync(cardsArg, 'utf8'));
}
if (!Array.isArray(inputCards)) inputCards = [inputCards];

// --- Read current state ----------------------------------------------------
const html = fs.readFileSync(kanbanPath, 'utf8');

const seedMatch = html.match(/const\s+SEED_VERSION\s*=\s*'v(\d+)-live-jobs'/);
if (!seedMatch) {
  console.error('Could not find SEED_VERSION in the file. Aborting.');
  process.exit(3);
}
const currentSeed = parseInt(seedMatch[1], 10);

const realJobCount  = (html.match(/\/\/ ── REAL JOB \d+/g) || []).length;
const liveCardCount = (html.match(/\/\/ ── LIVE JOB CARD \d+/g) || []).length;
const anchorStyle   = realJobCount >= liveCardCount ? 'REAL JOB' : 'LIVE JOB CARD';

const idMatches = [...html.matchAll(/\bid:\s*'([a-z]+-?\d+)'/g)].map(m => m[1]);
const rIds  = idMatches.filter(s => /^r\d+$/.test(s));
const lvIds = idMatches.filter(s => /^live-\d+$/.test(s));
const idPattern = rIds.length >= lvIds.length ? 'rN' : 'live-N';
const cards = idPattern === 'rN' ? rIds : lvIds;
const lastN = cards.length
  ? Math.max(...cards.map(s => parseInt(s.replace(/^[a-z-]+/, ''), 10)))
  : 0;

// Existing (company, role) tuples for dedupe
const existingTuples = new Set(
  [...html.matchAll(/company:\s*'([^']+)',\s*role:\s*'([^']+)'/g)]
    .map(([, c, r]) => `${c.toLowerCase()}::${r.toLowerCase()}`)
);

// --- Validate input cards --------------------------------------------------
const required = ['company','role','platform','url','keywords','jobDescText'];
const accepted = [];
const rejected = [];

for (const c of inputCards) {
  const missing = required.filter(k => c[k] === undefined || c[k] === null || c[k] === '');
  if (missing.length) {
    rejected.push({ card: c, reason: `missing: ${missing.join(',')}` });
    continue;
  }
  const tup = `${c.company.toLowerCase()}::${c.role.toLowerCase()}`;
  if (existingTuples.has(tup)) {
    rejected.push({ card: c, reason: `duplicate (company, role) already on board` });
    continue;
  }
  if (!Array.isArray(c.keywords) || c.keywords.length > 7) {
    rejected.push({ card: c, reason: `keywords must be array of <=7 strings` });
    continue;
  }
  accepted.push(c);
  existingTuples.add(tup);
}

if (accepted.length === 0) {
  console.error('No cards accepted. Reasons:');
  for (const r of rejected) console.error(`  - ${r.card.company} / ${r.card.role}: ${r.reason}`);
  process.exit(4);
}

// --- Build card blocks -----------------------------------------------------
function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function nextId(seed) {
  return idPattern === 'rN' ? `r${seed}` : `live-${seed}`;
}
function makeBlock(card, seed, ord) {
  const id = nextId(seed);
  const verified = card.verifiedMonth || new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const hOff = ord;
  const hRefresh = (ord / 2).toFixed(1);
  const conn = card.connectionName || '';
  const connUrl = card.connectionLinkedinUrl || '';
  const hasConn = !!conn;
  const kw = card.keywords.map(k => `'${esc(k)}'`).join(',');
  const anchor = anchorStyle === 'REAL JOB' ? 'REAL JOB' : 'LIVE JOB CARD';
  const dashes = '─'.repeat(anchorStyle === 'REAL JOB' ? 41 : 36);
  return `
    // ── ${anchor} ${seed} ${dashes}
    // ${esc(card.company)} · ${esc(card.role)} · ${esc(card.platform)}
    // Verified live ${esc(verified)}: ${esc(card.url)}
    {
      id:'${id}', company:'${esc(card.company)}', role:'${esc(card.role)}',
      platform:'${esc(card.platform)}', columnId:'new-hot',
      url:'${esc(card.url)}',
      connectionName:'${esc(conn)}', hasConnection:${hasConn}, connectionLinkedinUrl:'${esc(connUrl)}',
      keywords:[${kw}],
      jobDescText:'${esc(card.jobDescText)}',
      createdAt: new Date(now - ${hOff}*h).toISOString(),
      lastRefreshed: new Date(now - ${hRefresh}*h).toISOString(), closedAt:null,
    },`;
}

let nextSeed = lastN + 1;
const newBlocks = accepted.map((c, i) => makeBlock(c, nextSeed + i, i + 1)).join('\n');

// --- Locate insertion point -----------------------------------------------
// Find the LAST card object's closing '},' inside makeSamples(); we splice right after it.
// Strategy: find the last "    // ── REAL JOB " or "// ── LIVE JOB CARD " marker, then walk
// forward to its closing },.
const markerRe = anchorStyle === 'REAL JOB'
  ? /\/\/ ── REAL JOB \d+/g
  : /\/\/ ── LIVE JOB CARD \d+/g;

let lastMarker = null;
for (const m of html.matchAll(markerRe)) lastMarker = m;
if (!lastMarker) {
  console.error('Could not find any existing card marker — aborting (would splice into wrong place).');
  process.exit(3);
}
const closeRe = /\n\s{0,8}\},\n/g;
closeRe.lastIndex = lastMarker.index;
const closeMatch = closeRe.exec(html);
if (!closeMatch) {
  console.error('Could not find closing of last card object — aborting.');
  process.exit(3);
}
const insertAt = closeMatch.index + closeMatch[0].length;

// --- Build new file content ------------------------------------------------
let next = html.slice(0, insertAt) + newBlocks + '\n' + html.slice(insertAt);

if (bumpSeed) {
  next = next.replace(
    /const\s+SEED_VERSION\s*=\s*'v\d+-live-jobs'/,
    `const SEED_VERSION      = 'v${currentSeed + 1}-live-jobs'`,
  );
}

if (next === html) {
  console.error('No-op: nothing changed.');
  process.exit(0);
}

// --- Backup and atomic write ----------------------------------------------
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const bak = `${kanbanPath}.bak-${ts}`;
fs.copyFileSync(kanbanPath, bak);
const tmp = `${kanbanPath}.tmp`;
fs.writeFileSync(tmp, next, 'utf8');
fs.renameSync(tmp, kanbanPath);

// --- Report ---------------------------------------------------------------
console.log(JSON.stringify({
  ok: true,
  kanban: kanbanPath,
  backup: bak,
  prevSeedVersion: `v${currentSeed}-live-jobs`,
  newSeedVersion: bumpSeed ? `v${currentSeed + 1}-live-jobs` : `v${currentSeed}-live-jobs`,
  acceptedCount: accepted.length,
  rejectedCount: rejected.length,
  rejected,
  insertedIds: accepted.map((_, i) => nextId(nextSeed + i)),
  anchorStyle,
  idPattern,
}, null, 2));
