/**
 * lib/identity-lock.mjs — Mitchell-identity-file checksum guard.
 *
 * Design source: refresh-master Phase 1.5 deliverable 5 (anti-hallucination
 * mandate). The Global Charter forbids agents from silently editing
 * Mitchell-only files; this module is the runtime enforcement.
 *
 * Guarded files:
 *   - cv.md
 *   - modes/_profile.md
 *   - config/profile.yml
 *   - article-digest.md
 *
 * Behavior:
 *   - assertOrUpdateChecksums(): compute SHA256 of all guarded files; compare
 *     to data/identity-lock-state.json. On mismatch with no
 *     MITCHELL_AUTHORIZED_EDIT=1 env flag set, throw IdentityLockViolation.
 *     On match (or first run / explicit authorization), update the state.
 *   - getLastChecksums(): read current locked state for observability.
 *
 * Called by:
 *   - scripts/refresh-master.mjs at start of every run
 *   - any orchestrator that mutates cache state (Phase 2 verifier)
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const STATE_PATH = join(REPO_ROOT, 'data', 'identity-lock-state.json');

export const GUARDED_FILES = [
  'cv.md',
  'modes/_profile.md',
  'config/profile.yml',
  'article-digest.md',
];

export class IdentityLockViolation extends Error {
  constructor(file, oldHash, newHash) {
    super(
      `IDENTITY-LOCK VIOLATION: ${file} changed from ${oldHash.slice(0, 12)} to ${newHash.slice(0, 12)} without MITCHELL_AUTHORIZED_EDIT=1. ` +
      `If this edit was intentional, set MITCHELL_AUTHORIZED_EDIT=1 in the environment and re-run.`
    );
    this.name = 'IdentityLockViolation';
    this.file = file;
    this.oldHash = oldHash;
    this.newHash = newHash;
  }
}

function sha256(filepath) {
  const abs = join(REPO_ROOT, filepath);
  if (!existsSync(abs)) return null;
  const h = createHash('sha256');
  h.update(readFileSync(abs));
  return h.digest('hex');
}

function ensureStateDir() {
  const d = dirname(STATE_PATH);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

export function getLastChecksums() {
  if (!existsSync(STATE_PATH)) return { first_run: true, checksums: {} };
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); }
  catch { return { first_run: true, checksums: {} }; }
}

export function assertOrUpdateChecksums(opts = {}) {
  const authorized = process.env.MITCHELL_AUTHORIZED_EDIT === '1' || opts.authorized === true;
  const last = getLastChecksums();
  const now = {};
  const changes = [];

  for (const file of GUARDED_FILES) {
    const cur = sha256(file);
    now[file] = cur;
    const prev = last.checksums?.[file] || null;
    if (prev && cur && prev !== cur) {
      changes.push({ file, oldHash: prev, newHash: cur });
    }
  }

  if (changes.length && !authorized && !last.first_run) {
    const first = changes[0];
    throw new IdentityLockViolation(first.file, first.oldHash, first.newHash);
  }

  ensureStateDir();
  writeFileSync(STATE_PATH, JSON.stringify({
    first_run: false,
    last_check_at: new Date().toISOString(),
    last_check_authorized: authorized,
    last_change_count: changes.length,
    changes: changes.map(c => ({ file: c.file, oldHash: c.oldHash, newHash: c.newHash, recorded_at: new Date().toISOString() })),
    checksums: now,
  }, null, 2));

  return { ok: true, changes, authorized, first_run: !!last.first_run };
}

// CLI: node lib/identity-lock.mjs           → print current state
// CLI: node lib/identity-lock.mjs --check   → assert (exits non-zero on violation)
// CLI: node lib/identity-lock.mjs --update  → MITCHELL_AUTHORIZED_EDIT=1 implied, write new checksums
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) {
    try {
      const r = assertOrUpdateChecksums();
      console.log(JSON.stringify({ ok: true, ...r }, null, 2));
    } catch (e) {
      console.error(JSON.stringify({ ok: false, error: e.message, file: e.file, oldHash: e.oldHash, newHash: e.newHash }, null, 2));
      process.exit(2);
    }
  } else if (argv.includes('--update')) {
    const r = assertOrUpdateChecksums({ authorized: true });
    console.log(JSON.stringify({ ok: true, ...r }, null, 2));
  } else {
    console.log(JSON.stringify(getLastChecksums(), null, 2));
  }
}
