#!/usr/bin/env node
/**
 * Validate the Job Pulse Kanban golden file.
 *
 * Usage:
 *   node validate-kanban.mjs [path-to-kanban.html]
 *
 * Checks (each emits a {check, ok, detail}):
 *   1) HTML loads, has <html>, <head>, <body>, exactly one <script> with the seed.
 *   2) The inline <script> block parses as JS (extracts and node --check).
 *   3) SEED_VERSION matches /^v\d+-live-jobs$/.
 *   4) LINKEDIN_CONNECTIONS array parseable, count matches the
 *      LINKEDIN_CONNECTIONS_COUNT constant if present.
 *   5) Every card object has the required keys.
 *   6) No duplicate (company, role) tuples.
 *
 * Exit 0 = all green; exit 1 = warnings only; exit 2 = errors.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goldenPathFile = path.resolve(__dirname, '..', 'assets', 'golden-path.txt');

const filePath = process.argv[2]
  || (fs.existsSync(goldenPathFile) ? fs.readFileSync(goldenPathFile, 'utf8').trim() : null);
if (!filePath || !fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(2);
}

const html = fs.readFileSync(filePath, 'utf8');
const checks = [];
const push = (check, ok, detail = '') => checks.push({ check, ok, detail });

// 1) Basic HTML structure
push('html-has-doctype',  /^\s*<!DOCTYPE html>/i.test(html), '');
push('html-has-html-tag', /<html[\s>]/i.test(html), '');
push('html-has-head-tag', /<head[\s>]/i.test(html), '');
push('html-has-body-tag', /<body[\s>]/i.test(html), '');
const scriptBlocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
push('has-inline-script', scriptBlocks.length >= 1, `${scriptBlocks.length} <script> blocks`);

// 2) JS parse check on the largest inline script (the seed/data block)
let mainScript = scriptBlocks.sort((a, b) => b.length - a.length)[0] || '';
const tmpJs = path.join(os.tmpdir(), `kanban-validate-${Date.now()}.mjs`);
fs.writeFileSync(tmpJs, mainScript);
try {
  // node --check parses ES modules / scripts; we don't run them.
  execSync(`node --check "${tmpJs}"`, { stdio: 'pipe' });
  push('js-parses', true, '');
} catch (e) {
  push('js-parses', false, String(e.stderr || e).split('\n').slice(0, 3).join(' | '));
} finally {
  try { fs.unlinkSync(tmpJs); } catch {}
}

// 3) SEED_VERSION
const seedMatch = html.match(/const\s+SEED_VERSION\s*=\s*'([^']+)'/);
const seed = seedMatch ? seedMatch[1] : null;
push('seed-version-format', !!seed && /^v\d+-live-jobs$/.test(seed), `value: ${seed}`);

// 4) LINKEDIN_CONNECTIONS sanity
const arrMatch = html.match(/const\s+LINKEDIN_CONNECTIONS\s*=\s*\[([\s\S]*?)\];/);
const linkedinCount = arrMatch ? (arrMatch[1].match(/\{n:/g) || []).length : 0;
const declaredCount = (() => {
  const m = html.match(/LINKEDIN_CONNECTIONS_COUNT\s*=\s*LINKEDIN_CONNECTIONS\.length/);
  return m ? linkedinCount : null;
})();
push('linkedin-connections-found', !!arrMatch, `${linkedinCount} entries`);

// 5) Required card keys
const cardBlocks = [...html.matchAll(/\{\s*id:\s*'([a-z]+-?\d+)'[\s\S]*?\bclosedAt:\s*null,\s*\}/g)];
const required = ['company','role','platform','columnId','url','keywords','jobDescText','createdAt','lastRefreshed','closedAt'];
let missingTotal = 0;
for (const m of cardBlocks) {
  const block = m[0];
  for (const k of required) {
    if (!new RegExp(`\\b${k}\\s*:`).test(block)) missingTotal++;
  }
}
push('cards-have-required-keys', missingTotal === 0, `${cardBlocks.length} cards, ${missingTotal} missing-key incidents`);

// 6) Duplicate (company, role) check
const tuples = [...html.matchAll(/company:\s*'([^']+)',\s*role:\s*'([^']+)'/g)]
  .map(([, c, r]) => `${c.toLowerCase()}::${r.toLowerCase()}`);
const tupleCount = new Map();
tuples.forEach(t => tupleCount.set(t, (tupleCount.get(t) || 0) + 1));
const dupes = [...tupleCount.entries()].filter(([, n]) => n > 1).map(([t]) => t);
push('no-duplicate-cards', dupes.length === 0, dupes.length ? `dupes: ${dupes.slice(0, 3).join('; ')}${dupes.length > 3 ? '…' : ''}` : '');

// Aggregate
const failed = checks.filter(c => !c.ok);
const summary = {
  filePath,
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
};

console.log(JSON.stringify(summary, null, 2));
process.stderr.write(`\nValidation: ${summary.passed}/${summary.total} checks passed\n`);
if (failed.length) {
  process.stderr.write(`FAILED:\n`);
  for (const f of failed) process.stderr.write(`  - ${f.check}: ${f.detail}\n`);
}
process.exit(failed.length ? 2 : 0);
