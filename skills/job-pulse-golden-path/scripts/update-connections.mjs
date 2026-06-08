#!/usr/bin/env node
/**
 * Insert or update entries in the LINKEDIN_CONNECTIONS array in place.
 *
 * Usage:
 *   node update-connections.mjs --connections <conns.json> [--kanban <path>]
 *
 * Connection input shape (compact, matching the file's existing format):
 *   [
 *     {"n":"Naomi Izedonmwen","c":"Accenture","p":"Senior Manager","u":"https://www.linkedin.com/in/naomiizedonmwen"},
 *     ...
 *   ]
 *
 * Behavior:
 *   - Dedupes by LinkedIn URL (u). Existing entries with same u are updated,
 *     not duplicated.
 *   - Preserves existing array order; new entries appended at the end.
 *   - Writes a .bak before changing the golden file.
 *   - Bumps SEED_VERSION (since this changes board behavior on next reload).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goldenPathFile = path.resolve(__dirname, '..', 'assets', 'golden-path.txt');

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
}
const kanbanPath = flag('kanban')
  || (fs.existsSync(goldenPathFile) ? fs.readFileSync(goldenPathFile, 'utf8').trim() : null);
const connArg = flag('connections');
if (!kanbanPath || !fs.existsSync(kanbanPath)) {
  console.error(`Kanban file not found: ${kanbanPath}`);
  process.exit(2);
}
if (!connArg) {
  console.error('Pass --connections <file.json>');
  process.exit(2);
}

const inputConns = JSON.parse(fs.readFileSync(connArg, 'utf8'));
if (!Array.isArray(inputConns)) {
  console.error('Connections file must be a JSON array.');
  process.exit(2);
}

const html = fs.readFileSync(kanbanPath, 'utf8');

// Locate LINKEDIN_CONNECTIONS array
const arrRe = /(const\s+LINKEDIN_CONNECTIONS\s*=\s*\[)([\s\S]*?)(\];)/;
const arrMatch = html.match(arrRe);
if (!arrMatch) {
  console.error('Could not find LINKEDIN_CONNECTIONS in the file.');
  process.exit(3);
}
const [full, prefix, body, suffix] = arrMatch;

// Parse existing entries (compact shape: {n:'...',c:'...',p:'...',u:'...'})
const entryRe = /\{n:'([^']*)',c:'([^']*)',p:'([^']*)',u:'([^']*)'\}/g;
const existing = [];
for (const m of body.matchAll(entryRe)) {
  existing.push({ n: m[1], c: m[2], p: m[3], u: m[4] });
}

// Merge by URL
const byUrl = new Map(existing.map(e => [e.u, e]));
let added = 0, updated = 0;
for (const inc of inputConns) {
  if (!inc.u) continue;
  if (byUrl.has(inc.u)) {
    Object.assign(byUrl.get(inc.u), inc);
    updated++;
  } else {
    byUrl.set(inc.u, { n: inc.n || '', c: inc.c || '', p: inc.p || '', u: inc.u });
    added++;
  }
}

if (added === 0 && updated === 0) {
  console.log(JSON.stringify({ ok: true, noop: true, total: existing.length }));
  process.exit(0);
}

function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
const merged = [...byUrl.values()];
const formatted = merged
  .map(e => `  {n:'${esc(e.n)}',c:'${esc(e.c)}',p:'${esc(e.p)}',u:'${esc(e.u)}'}`)
  .join(',\n');

const newBlock = `${prefix}\n${formatted}\n${suffix}`;
let next = html.replace(full, newBlock);

// Bump SEED_VERSION
const seedRe = /const\s+SEED_VERSION\s*=\s*'v(\d+)-live-jobs'/;
const seedMatch = next.match(seedRe);
const prevSeed = seedMatch ? parseInt(seedMatch[1], 10) : null;
if (prevSeed !== null) {
  next = next.replace(seedRe, `const SEED_VERSION      = 'v${prevSeed + 1}-live-jobs'`);
}

// Backup + atomic write
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const bak = `${kanbanPath}.bak-${ts}`;
fs.copyFileSync(kanbanPath, bak);
const tmp = `${kanbanPath}.tmp`;
fs.writeFileSync(tmp, next, 'utf8');
fs.renameSync(tmp, kanbanPath);

console.log(JSON.stringify({
  ok: true,
  kanban: kanbanPath,
  backup: bak,
  added,
  updated,
  totalConnections: merged.length,
  prevSeedVersion: prevSeed !== null ? `v${prevSeed}-live-jobs` : null,
  newSeedVersion: prevSeed !== null ? `v${prevSeed + 1}-live-jobs` : null,
}, null, 2));
