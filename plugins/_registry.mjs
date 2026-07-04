// @ts-check
// plugins/_registry.mjs — the curated community-plugin registry (the trust root).
// Pure, side-effect-free import (node:fs only). plugins-registry.json is a
// SYSTEM-layer file: an entry exists only because a maintainer reviewed + merged
// it at an exact pinned commit. Users only ever install the pinnedSha the
// SHIPPED registry names — an author cannot reach users without a merged PR.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'url';

const CODEBASE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function registryPath(root) {
  return path.join(root, 'plugins-registry.json');
}

/** Load the curated registry. Fail-open to an empty registry. */
export function loadRegistry(root) {
  let f = registryPath(root);
  if (!existsSync(f)) {
    f = registryPath(CODEBASE_ROOT);
  }
  if (!existsSync(f)) return { registryVersion: 1, plugins: [] };
  try {
    const p = JSON.parse(readFileSync(f, 'utf8'));
    return p && Array.isArray(p.plugins) ? p : { registryVersion: 1, plugins: [] };
  } catch {
    return { registryVersion: 1, plugins: [] };
  }
}

/** Find a registry entry by bare id, full name, or `career-ops-plugin-<id>`. */
export function findInRegistry(root, nameOrId) {
  const reg = loadRegistry(root);
  const found = reg.plugins.find(p =>
    p.id === nameOrId || p.name === nameOrId || p.name === `career-ops-plugin-${nameOrId}`) || null;
  if (found) return found;

  // Fallback to codebase root registry if not found
  const baseReg = loadRegistry(CODEBASE_ROOT);
  return baseReg.plugins.find(p =>
    p.id === nameOrId || p.name === nameOrId || p.name === `career-ops-plugin-${nameOrId}`) || null;
}

/**
 * Classify a discovered plugin's trust state. Source is derived from the
 * FILESYSTEM (bundled = under plugins/) and the live registry — NEVER from the
 * USER-writable plugins.lock.
 *  - bundled    : shipped in plugins/, reviewed in-tree
 *  - approved   : in plugins.local/ AND its installed sha matches a registry entry
 *  - off-registry: installed from a community repo, but a DIFFERENT commit than the approved one
 *  - unverified : installed locally, not in the registry (user chose to trust the author)
 * @returns {'bundled'|'approved'|'off-registry'|'unverified'}
 */
export function classifySource(manifest, root, lockEntry) {
  if (manifest.dir.startsWith(path.join(root, 'plugins') + path.sep) ||
      manifest.dir.startsWith(path.join(CODEBASE_ROOT, 'plugins') + path.sep)) return 'bundled';
  const reg = findInRegistry(root, manifest.id);
  if (!reg) return 'unverified';
  if (lockEntry && lockEntry.sha && reg.sha && lockEntry.sha !== reg.sha) return 'off-registry';
  return 'approved';
}

/** Human-facing badge for a trust source. */
export function sourceBadge(source) {
  return {
    bundled: '📦 bundled',
    approved: '✓ approved',
    'off-registry': '⚠️ off-registry',
    unverified: '❓ community-unverified',
  }[source] || source;
}

/**
 * Validate one registry entry's shape (used by the registry CI + a test-all
 * assertion). Returns an array of problems (empty = valid). `idRe` + `hookKinds`
 * + `reservedEnv` are passed in from the engine to keep this module dep-free.
 */
export function validateRegistryEntry(e, { idRe, hookKinds, reservedEnv }) {
  const errs = [];
  if (typeof e.name !== 'string' || !e.name.startsWith('career-ops-plugin-')) errs.push('name must start with "career-ops-plugin-"');
  if (typeof e.id !== 'string' || !idRe.test(e.id)) errs.push('invalid id');
  if (e.name && e.id && e.name !== `career-ops-plugin-${e.id}`) errs.push('name must equal career-ops-plugin-<id>');
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(e.repo || '')) errs.push('repo must be a https://github.com/<owner>/<repo> URL');
  if (!/^[0-9a-f]{40}$/.test(e.sha || '')) errs.push('sha must be a 40-hex commit');
  if (!Array.isArray(e.hooks) || e.hooks.length === 0 || e.hooks.some(h => !hookKinds.includes(h))) errs.push('hooks must be a non-empty subset of the hook kinds');
  if (!Array.isArray(e.requiredEnv)) errs.push('requiredEnv must be an array');
  else if (e.requiredEnv.some(n => reservedEnv.has(n) || /^AWS_/.test(n))) errs.push('requiredEnv declares a reserved/core-owned var');
  if (!Array.isArray(e.allowedHosts)) errs.push('allowedHosts must be an array');
  else if (Array.isArray(e.requiredEnv) && e.requiredEnv.length > 0 && e.allowedHosts.length === 0) errs.push('a keyed plugin must declare allowedHosts');
  if (typeof e.license !== 'string' || !e.license) errs.push('license is required');
  if (typeof e.version !== 'string') errs.push('version is required');
  // Optional successor marker: a community plugin can declare itself the
  // maintained successor of the bundled plugin with the SAME id. When present
  // it must be the literal boolean true; the engine only grants it precedence
  // once the user installs it at this exact pinned sha (resolveSuccessorIds).
  if (e.supersedesBundled !== undefined && e.supersedesBundled !== true) errs.push('supersedesBundled, if present, must be the boolean true');
  return errs;
}

/**
 * The registry entry that is the maintained successor of a bundled plugin id
 * (declares `supersedesBundled: true` and shares the id), or null. Used only to
 * SURFACE the relationship in `plugins.mjs list`/`available` — precedence itself
 * is decided by the engine's resolveSuccessorIds() (which also checks install + sha).
 */
export function successorFor(root, bundledId) {
  return loadRegistry(root).plugins.find(p => p.supersedesBundled === true && p.id === bundledId) || null;
}
