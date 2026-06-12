#!/usr/bin/env node
/**
 * check-syntax.mjs — Zero-dependency syntax linter.
 *
 * Runs `node --check` on every tracked .mjs file so a typo can't land on main.
 * Used by `npm run lint` and the CI workflow. Exits non-zero on the first error.
 */

import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'output', 'data']);

function collect(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

const files = collect(root);
let failed = 0;

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    console.error(`✗ ${file.replace(root, '.')}`);
    console.error(String(err.stderr || err.message).trim());
  }
}

if (failed > 0) {
  console.error(`\n${failed} file(s) failed syntax check.`);
  process.exit(1);
}
console.log(`✓ ${files.length} .mjs files passed syntax check.`);
