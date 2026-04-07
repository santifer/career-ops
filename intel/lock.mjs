/**
 * Advisory file locking for background schedule writes.
 * Uses lockfiles with PID + timestamp for stale detection.
 */

import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';

const DEFAULT_MAX_AGE_MS = 60_000;

/**
 * Acquire an advisory lock at the given path.
 * @param {string} lockPath - Path to the lockfile
 * @param {{ maxAgeMs?: number }} opts - Options
 * @returns {boolean} true if lock acquired, false if held by another process
 */
export function acquireLock(lockPath, opts = {}) {
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;

  // Check for existing lock
  let existing;
  try {
    existing = readFileSync(lockPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // No lockfile — fall through to create
  }

  if (existing !== undefined) {
    // Parse timestamp
    const tsMatch = existing.match(/ts:(\d+)/);
    if (tsMatch) {
      const lockTs = Number(tsMatch[1]);
      if (Date.now() - lockTs > maxAgeMs) {
        // Stale — remove and re-acquire
        try { unlinkSync(lockPath); } catch {}
      } else {
        return false; // Lock is fresh — held
      }
    } else {
      return false; // Can't parse — treat as held
    }
  }

  // Try to create lockfile atomically
  const content = `pid:${process.pid}\nts:${Date.now()}`;
  try {
    writeFileSync(lockPath, content, { flag: 'wx' });
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') return false; // Race condition
    throw err;
  }
}

/**
 * Release an advisory lock.
 * @param {string} lockPath - Path to the lockfile
 */
export function releaseLock(lockPath) {
  try {
    unlinkSync(lockPath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * Run fn while holding the lock. Releases on success or error.
 * @param {string} lockPath - Path to the lockfile
 * @param {() => T} fn - Function to run under lock
 * @param {{ maxAgeMs?: number }} opts - Options
 * @returns {T} Result of fn
 */
export function withLock(lockPath, fn, opts = {}) {
  if (!acquireLock(lockPath, opts)) {
    throw new Error('Could not acquire lock');
  }
  try {
    return fn();
  } finally {
    releaseLock(lockPath);
  }
}
