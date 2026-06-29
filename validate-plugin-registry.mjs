#!/usr/bin/env node
// @ts-check
// validate-plugin-registry.mjs — deterministic shape gate for plugins-registry.json.
// Run locally + by the registry-validate CI. Shape/uniqueness only (no network);
// the CI additionally clones each changed entry at its pinned SHA and runs the
// min-file + manifest + audit checks in a no-secret, read-only sandbox.

import { loadRegistry, validateRegistryEntry } from './plugins/_registry.mjs';
import { HOOK_KINDS, RESERVED_ENV } from './plugins/_engine.mjs';

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/** @returns {string[]} problems (empty = valid) */
export function validateRegistry(root) {
  const reg = loadRegistry(root);
  const problems = [];
  if (reg.registryVersion !== 1) problems.push(`unsupported registryVersion ${JSON.stringify(reg.registryVersion)}`);
  const names = new Set(), ids = new Set();
  for (const e of reg.plugins) {
    for (const er of validateRegistryEntry(e, { idRe: ID_RE, hookKinds: HOOK_KINDS, reservedEnv: RESERVED_ENV })) {
      problems.push(`${e.name || e.id || '?'}: ${er}`);
    }
    if (e.name && names.has(e.name)) problems.push(`duplicate name: ${e.name}`);
    if (e.id && ids.has(e.id)) problems.push(`duplicate id: ${e.id}`);
    names.add(e.name); ids.add(e.id);
  }
  return problems;
}

if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1] || '').href) {
  const root = process.cwd();
  const deep = process.argv.includes('--deep');
  const problems = validateRegistry(root);
  // --deep: clone each entry at its pinned SHA + statically validate it (no
  // plugin code is executed). Used by the registry-validate CI in a sandbox.
  if (deep && problems.length === 0) {
    const { auditRegistryEntry } = await import('./plugin-install.mjs');
    const { loadRegistry } = await import('./plugins/_registry.mjs');
    for (const e of loadRegistry(root).plugins) {
      for (const p of auditRegistryEntry(e.repo, e.sha, e.id)) problems.push(`${e.name}: ${p}`);
    }
  }
  if (problems.length) { for (const p of problems) console.error(`✗ ${p}`); process.exit(1); }
  console.log(`✓ plugins-registry.json is valid${deep ? ' (deep: all entries cloned + audited)' : ''}`); process.exit(0);
}
