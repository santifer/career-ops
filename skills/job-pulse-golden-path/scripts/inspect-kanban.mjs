#!/usr/bin/env node
/**
 * Inspect the Job Pulse Kanban golden file and print a structured snapshot.
 *
 * Usage:
 *   node inspect-kanban.mjs [path-to-kanban.html]
 *     (defaults to the path in ../assets/golden-path.txt)
 *
 * Output: JSON-on-stdout, human-readable summary on stderr.
 *
 * Reports:
 *   - SEED_VERSION (current value)
 *   - card count + id pattern detected (rN vs live-N)
 *   - anchor comment style (REAL JOB vs LIVE JOB CARD)
 *   - LINKEDIN_CONNECTIONS count
 *   - last 5 card titles (so you can see what's at the end before splicing)
 *   - schema sanity (do all cards have the required keys?)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goldenPathFile = path.resolve(__dirname, '..', 'assets', 'golden-path.txt');

const filePath = process.argv[2]
  || (fs.existsSync(goldenPathFile) ? fs.readFileSync(goldenPathFile, 'utf8').trim() : null);

if (!filePath) {
  console.error('No path supplied and no assets/golden-path.txt found.');
  process.exit(2);
}
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(2);
}

const html = fs.readFileSync(filePath, 'utf8');

// SEED_VERSION
const seedMatch = html.match(/const\s+SEED_VERSION\s*=\s*'([^']+)'/);
const seedVersion = seedMatch ? seedMatch[1] : null;

// Anchor comment style
const realJobAnchors  = (html.match(/\/\/ ── REAL JOB \d+/g)        || []).length;
const liveCardAnchors = (html.match(/\/\/ ── LIVE JOB CARD \d+/g)   || []).length;
const anchorStyle = realJobAnchors >= liveCardAnchors ? 'REAL JOB' : 'LIVE JOB CARD';

// Card ids (id:'rN' or id:'live-N')
const idMatches = [...html.matchAll(/\bid:\s*'([a-z]+-?\d+)'/g)].map(m => m[1]);
const rIds   = idMatches.filter(s => /^r\d+$/.test(s));
const lvIds  = idMatches.filter(s => /^live-\d+$/.test(s));
const idPattern = rIds.length >= lvIds.length ? 'rN' : 'live-N';
const cards = idPattern === 'rN' ? rIds : lvIds;
const lastN = (() => {
  const nums = cards.map(s => parseInt(s.replace(/^[a-z-]+/, ''), 10)).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) : 0;
})();

// LINKEDIN_CONNECTIONS count (compact-shape array of {n,c,p,u})
const linkedinMatch = html.match(/const\s+LINKEDIN_CONNECTIONS\s*=\s*\[([\s\S]*?)\];/);
const linkedinCount = linkedinMatch
  ? (linkedinMatch[1].match(/\{n:/g) || []).length
  : null;

// Last 5 card "company / role" pairs by walking the file backwards
const cardCompanyMatches = [...html.matchAll(/company:\s*'([^']+)',\s*role:\s*'([^']+)'/g)];
const last5 = cardCompanyMatches.slice(-5).map(([, company, role]) => ({ company, role }));

// Sanity: do all rN/liveN cards have url + columnId + jobDescText?
const cardBlocks = [...html.matchAll(/\{\s*id:\s*'([a-z]+-?\d+)'[\s\S]*?\bclosedAt:\s*null,\s*\}/g)];
const requiredKeys = ['company','role','platform','columnId','url','keywords','jobDescText','createdAt','lastRefreshed','closedAt'];
const schemaIssues = [];
for (const m of cardBlocks) {
  const block = m[0];
  const id = m[1];
  for (const k of requiredKeys) {
    if (!new RegExp(`\\b${k}\\s*:`).test(block)) {
      schemaIssues.push({ id, missing: k });
    }
  }
}

const report = {
  filePath,
  fileSizeBytes: fs.statSync(filePath).size,
  seedVersion,
  seedNumber: seedVersion ? parseInt((seedVersion.match(/v(\d+)/) || [])[1] || '0', 10) : null,
  anchorStyle,
  anchorCounts: { realJob: realJobAnchors, liveCard: liveCardAnchors },
  idPattern,
  cardCount: cardBlocks.length,
  highestCardNumber: lastN,
  nextCardId: idPattern === 'rN' ? `r${lastN + 1}` : `live-${lastN + 1}`,
  linkedinConnectionsCount: linkedinCount,
  lastFiveCards: last5,
  schemaIssues,
  schemaClean: schemaIssues.length === 0,
};

// Human summary on stderr
process.stderr.write(`\nJob Pulse Kanban — current state\n`);
process.stderr.write(`  file:           ${filePath}\n`);
process.stderr.write(`  SEED_VERSION:   ${seedVersion}\n`);
process.stderr.write(`  cards:          ${report.cardCount} (highest ${idPattern} = ${lastN}, next = ${report.nextCardId})\n`);
process.stderr.write(`  anchor style:   ${anchorStyle} (${realJobAnchors} REAL JOB / ${liveCardAnchors} LIVE JOB CARD)\n`);
process.stderr.write(`  connections:    ${linkedinCount}\n`);
process.stderr.write(`  last 5 cards:\n`);
for (const c of last5) process.stderr.write(`    - ${c.company} · ${c.role}\n`);
process.stderr.write(`  schema clean:   ${report.schemaClean}\n`);
if (!report.schemaClean) {
  process.stderr.write(`  schema issues:  ${schemaIssues.length}\n`);
  schemaIssues.slice(0, 10).forEach(i => process.stderr.write(`    - ${i.id} missing ${i.missing}\n`));
}

// Machine-readable JSON on stdout
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
