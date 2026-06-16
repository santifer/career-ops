#!/usr/bin/env node

/**
 * build-dashboard.mjs — Build the career-ops Go TUI dashboard.
 *
 * Produces the platform-correct binary name:
 *   Linux / macOS → career-dashboard
 *   Windows       → career-dashboard.exe
 *
 * Usage:
 *   node build-dashboard.mjs          # build to repo root
 *   npm run build:dashboard           # same via npm
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = join(ROOT, 'dashboard');
const IS_WINDOWS = process.platform === 'win32';
const BINARY_NAME = IS_WINDOWS ? 'career-dashboard.exe' : 'career-dashboard';
const OUTPUT_PATH = join(ROOT, BINARY_NAME);

if (!existsSync(DASHBOARD_DIR)) {
  console.error('Error: dashboard/ directory not found.');
  process.exit(1);
}

try {
  execFileSync('go', ['version'], { stdio: 'pipe' });
} catch {
  console.error('Error: Go toolchain not found. Install Go from https://go.dev/dl/');
  process.exit(1);
}

console.log(`Building career-ops dashboard → ${BINARY_NAME}`);
try {
  execFileSync(
    'go',
    ['build', '-o', OUTPUT_PATH, '.'],
    { cwd: DASHBOARD_DIR, stdio: 'inherit', timeout: 120_000 },
  );
} catch (err) {
  console.error(`Build failed: ${err.message}`);
  process.exit(1);
}

console.log(`\nDone. Run the dashboard with:`);
if (IS_WINDOWS) {
  console.log(`  .\\career-dashboard.exe`);
} else {
  console.log(`  ./career-dashboard`);
}
