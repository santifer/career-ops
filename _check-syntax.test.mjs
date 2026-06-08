#!/usr/bin/env node
// Pre-run syntax guard — prevents wasted bat runs when a critical file is truncated.
// Checks: (1) every root-level *.mjs parses (node --check), (2) critical JSON files
// are valid JSON and free of trailing null bytes (r7 OneDrive-truncation guard).
// Exit 0 = all clean. Exit 1 = one or more failures.
// 2026-06-05 (retro): closed B0 — glob *.mjs instead of hardcoded list; added JSON
// validation after package.json was silently truncated and missed by the old gate.
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// (1) All root-level .mjs files (auto-enrolls new scripts — was the B0 gap)
const mjsFiles = readdirSync(__dirname)
  .filter(f => f.endsWith('.mjs') && !f.includes('.bak') && !f.includes('.truncated'))
  .sort();

// (2) Critical JSON files — config + live data the bat/refresh depend on.
const CRITICAL_JSON = [
  'package.json',
  'package-lock.json',
  'data/last-refresh.json',
  'data/sus-db.json',
  'data/autosubmit-whitelist.json',
  'data/bat-run-log.json',
  'data/autosubmit-results.json',
];

console.log(`[syntax-guard] Checking ${mjsFiles.length} .mjs + ${CRITICAL_JSON.length} JSON files...`);

let failures = 0;

for (const file of mjsFiles) {
  const result = spawnSync('node', ['--check', path.join(__dirname, file)], { encoding: 'utf8' });
  if (result.status === 0) {
    console.log(`  OK  ${file}`);
  } else {
    failures++;
    const errLine = (result.stderr || result.stdout || 'unknown error')
      .split('\n').find(l => l.includes('SyntaxError') || l.includes('Error') || l.trim())?.trim() ?? 'unknown error';
    console.log(`  FAIL ${file} -- ${errLine}`);
  }
}

for (const file of CRITICAL_JSON) {
  const fullPath = path.join(__dirname, file);
  let raw;
  try {
    raw = readFileSync(fullPath);
  } catch {
    console.log(`  SKIP ${file} (not present)`);
    continue;
  }
  if (raw.includes(0x00)) {
    failures++;
    console.log(`  FAIL ${file} -- contains NUL bytes (r7 truncation)`);
    continue;
  }
  try {
    JSON.parse(raw.toString('utf8'));
    console.log(`  OK  ${file}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${file} -- ${String(e.message).split('\n')[0]}`);
  }
}

if (failures > 0) {
  console.log(`\n[syntax-guard] ${failures} file(s) FAILED. Bat should not run until fixed.`);
  process.exit(1);
} else {
  console.log(`\n[syntax-guard] All files clean.`);
  process.exit(0);
}
