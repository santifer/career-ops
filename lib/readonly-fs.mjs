/**
 * lib/readonly-fs.mjs — Read-only filesystem barrier for sub-agents (O5).
 *
 * Sub-agents that access the corpus (cv.md, article-digest.md, voice-reference.md,
 * hm-intel/, interview-prep/, story-bank.md) must use this wrapper instead of
 * importing node:fs directly. Write operations are intentionally excluded.
 *
 * Design goals:
 *   - Defense-in-depth: prevents accidental reads of .env, credentials, or
 *     files outside the declared corpus (path traversal / ../ escapes blocked)
 *   - Explicit allowlist: every read path must be whitelisted at construction time
 *   - Both sync and async forms for compatibility with existing sub-agent code
 *   - Zero external dependencies — only node:fs + node:path
 *
 * createReadonlyFS(allowedPaths):
 *   allowedPaths — array of absolute paths OR path fragments relative to repo root.
 *   Each entry may be a file or a directory (directory prefix-matching is used).
 *   Returns a frozen object with read-only operations.
 *
 * createWriteableFS(writableSubdirs):
 *   writableSubdirs — array of absolute paths or subdirs under repo root.
 *   Returns a frozen object with write operations gated to those paths.
 *
 * Usage (in a sub-agent):
 *
 *   import { createReadonlyFS, createWriteableFS } from '../../lib/readonly-fs.mjs';
 *   import { join, dirname } from 'node:path';
 *   import { fileURLToPath } from 'node:url';
 *
 *   const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
 *
 *   const rfs = createReadonlyFS([
 *     join(ROOT, 'cv.md'),
 *     join(ROOT, 'article-digest.md'),
 *     join(ROOT, 'writing-samples', 'voice-reference.md'),
 *     join(ROOT, 'data', 'hm-intel'),
 *     join(ROOT, 'interview-prep'),
 *     join(ROOT, 'interview-prep', 'story-bank.md'),
 *   ]);
 *
 *   const cvText = rfs.readFileSync(join(ROOT, 'cv.md'), 'utf-8');
 *   const exists  = await rfs.exists(join(ROOT, 'article-digest.md'));
 *
 *   const wfs = createWriteableFS([
 *     join(ROOT, 'data', 'apply-packs'),
 *     join(ROOT, 'data', 'applications'),
 *   ]);
 *
 *   wfs.writeFileSync(outPath, content, 'utf-8');
 */

import * as fsSync from 'node:fs';
import * as fsAsync from 'node:fs/promises';
import { resolve, normalize } from 'node:path';

// ── Internal path validator ───────────────────────────────────────────────────

/**
 * Resolve a raw path and verify it is covered by at least one allowed prefix.
 *
 * @param {string} rawPath - The path the caller wants to access
 * @param {string[]} allowedPaths - Resolved absolute allowed paths/prefixes
 * @param {'read'|'write'} mode - Used only in error messages
 * @returns {string} The resolved absolute path
 * @throws {Error} If the path is outside all allowed prefixes
 */
function guard(rawPath, allowedPaths, mode) {
  if (allowedPaths.length === 0) {
    throw new Error(
      `[readonly-fs] ${mode} denied: allowedPaths is empty — blanket deny is active. ` +
      `Path: ${rawPath}`
    );
  }

  const target = resolve(normalize(rawPath));

  const permitted = allowedPaths.some(allowed => {
    // Exact file match
    if (target === allowed) return true;
    // Directory prefix match (allowed is a directory, target is inside it)
    // Use trailing sep to prevent '/data/hm-intel-extra' matching '/data/hm-intel'
    if (target.startsWith(allowed + '/') || target.startsWith(allowed + '\\')) return true;
    return false;
  });

  if (!permitted) {
    throw new Error(
      `[readonly-fs] ${mode} denied: path "${target}" is outside allowed paths.\n` +
      `Allowed:\n${allowedPaths.map(p => '  ' + p).join('\n')}\n` +
      `Hint: add the path to the sub-agent's allowedPaths array if it is intentional.`
    );
  }

  return target;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a read-only filesystem accessor scoped to allowedPaths.
 *
 * @param {string[]} allowedPaths - Array of absolute paths (files or dirs) that
 *   the sub-agent is permitted to read. Resolved via path.resolve at creation time.
 * @returns {ReadonlyFS}
 */
export function createReadonlyFS(allowedPaths = []) {
  if (!Array.isArray(allowedPaths)) {
    throw new TypeError('[readonly-fs] allowedPaths must be an array');
  }

  // Resolve all allowed paths once at construction time
  const resolved = allowedPaths.map(p => resolve(normalize(String(p))));

  const rfs = {
    /**
     * Async: Read file contents, gated to allowedPaths.
     * API mirrors fs/promises.readFile.
     *
     * @param {string} path
     * @param {string|object} [options]
     * @returns {Promise<Buffer|string>}
     */
    readFile(path, options) {
      const safe = guard(path, resolved, 'read');
      return fsAsync.readFile(safe, options);
    },

    /**
     * Sync: Read file contents, gated to allowedPaths.
     * API mirrors fs.readFileSync.
     *
     * @param {string} path
     * @param {string|object} [options]
     * @returns {Buffer|string}
     */
    readFileSync(path, options) {
      const safe = guard(path, resolved, 'read');
      return fsSync.readFileSync(safe, options);
    },

    /**
     * Async: Read directory contents.
     * API mirrors fs/promises.readdir.
     *
     * @param {string} path
     * @param {string|object} [options]
     * @returns {Promise<string[]|Dirent[]>}
     */
    readdir(path, options) {
      const safe = guard(path, resolved, 'read');
      return fsAsync.readdir(safe, options);
    },

    /**
     * Sync: Read directory contents.
     *
     * @param {string} path
     * @param {string|object} [options]
     * @returns {string[]|Dirent[]}
     */
    readdirSync(path, options) {
      const safe = guard(path, resolved, 'read');
      return fsSync.readdirSync(safe, options);
    },

    /**
     * Async: Get file/directory stats.
     * API mirrors fs/promises.stat.
     *
     * @param {string} path
     * @returns {Promise<fs.Stats>}
     */
    stat(path) {
      const safe = guard(path, resolved, 'read');
      return fsAsync.stat(safe);
    },

    /**
     * Async: Check whether a path exists (returns boolean, never throws).
     *
     * @param {string} path
     * @returns {Promise<boolean>}
     */
    async exists(path) {
      const safe = guard(path, resolved, 'read');
      return fsAsync.access(safe).then(() => true, () => false);
    },

    /**
     * Sync: Check whether a path exists.
     *
     * @param {string} path
     * @returns {boolean}
     */
    existsSync(path) {
      const safe = guard(path, resolved, 'read');
      return fsSync.existsSync(safe);
    },

    // Expose the resolved allowedPaths for introspection (tests, debugging)
    get _allowedPaths() { return [...resolved]; },
  };

  // Prevent accidental extension of the returned object
  return Object.freeze(rfs);
}

/**
 * Create a writable filesystem accessor scoped to writableSubdirs.
 * Only write operations are exposed; reads are deliberately excluded
 * (sub-agents should use createReadonlyFS for reads).
 *
 * @param {string[]} writableSubdirs - Array of absolute paths the sub-agent
 *   is allowed to write to (files must be inside one of these dirs).
 * @returns {WriteableFS}
 */
export function createWriteableFS(writableSubdirs = []) {
  if (!Array.isArray(writableSubdirs)) {
    throw new TypeError('[readonly-fs] writableSubdirs must be an array');
  }

  const resolved = writableSubdirs.map(p => resolve(normalize(String(p))));

  const wfs = {
    /**
     * Sync: Write file — gated to writableSubdirs.
     * API mirrors fs.writeFileSync.
     *
     * @param {string} path
     * @param {string|Buffer} data
     * @param {string|object} [options]
     */
    writeFileSync(path, data, options) {
      const safe = guard(path, resolved, 'write');
      fsSync.writeFileSync(safe, data, options);
    },

    /**
     * Async: Write file — gated to writableSubdirs.
     * API mirrors fs/promises.writeFile.
     *
     * @param {string} path
     * @param {string|Buffer} data
     * @param {string|object} [options]
     * @returns {Promise<void>}
     */
    writeFile(path, data, options) {
      const safe = guard(path, resolved, 'write');
      return fsAsync.writeFile(safe, data, options);
    },

    /**
     * Sync: Create directories recursively — gated to writableSubdirs.
     * API mirrors fs.mkdirSync.
     *
     * @param {string} path
     * @param {object} [options]
     */
    mkdirSync(path, options) {
      const safe = guard(path, resolved, 'write');
      fsSync.mkdirSync(safe, options);
    },

    /**
     * Async: Create directories recursively.
     *
     * @param {string} path
     * @param {object} [options]
     * @returns {Promise<string|undefined>}
     */
    mkdir(path, options) {
      const safe = guard(path, resolved, 'write');
      return fsAsync.mkdir(safe, options);
    },

    // Expose for introspection
    get _writablePaths() { return [...resolved]; },
  };

  return Object.freeze(wfs);
}

// ── Convenience: DENIED write stub ───────────────────────────────────────────

/**
 * writeFileSync / writeFile that ALWAYS throws, for strict read-only contexts.
 * Included on createReadonlyFS so that if someone accidentally calls it,
 * the error message is clear.
 */
// These are intentionally NOT exported on the ReadonlyFS object —
// they are injected as non-enumerable traps only in test/documentation contexts.
export const WRITE_DENIED_STUB = {
  writeFileSync() {
    throw new Error('[readonly-fs] write denied: use createWriteableFS for write operations');
  },
  writeFile() {
    return Promise.reject(new Error('[readonly-fs] write denied: use createWriteableFS for write operations'));
  },
};
