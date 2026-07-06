// provider-registry.mjs — Convention-based provider registry (loader + resolver).
//
// A generic, dependency-free extraction of the provider pattern in scan.mjs.
// Drop this into any project with "many similar handlers/sources" (importers,
// exporters, payment gateways, ATS connectors, notifiers, …).
//
// Not related to career-ops' community plugin registry (plugins-registry.json /
// validate-plugin-registry.mjs) — same idea (pluggable handlers), different scope
// (this is a standalone in-repo pattern, not the reviewed-third-party-plugin system).
//
// ── The contract ─────────────────────────────────────────────────────
// Each provider is its own *.mjs file in a directory, with a default export:
//
//   export default {
//     id: 'stripe',                       // required — stable key, matched against config
//     detect(entry) { return {...}|null },// optional — auto-routing from config shape
//     async run(entry, ctx) { return ... },// required verb (name is configurable)
//   };
//
// Conventions:
//   - Files prefixed with `_` are never loaded as providers (use for shared helpers).
//   - Providers receive their dependencies via `ctx` (injection) instead of importing
//     transport/IO directly — keeps them testable and centralizes policy.
//   - Load order is alphabetical → detect() priority is deterministic across machines.

import { existsSync, readdirSync } from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';

/**
 * Load every provider in `dir` into a Map keyed by provider id.
 *
 * Faults are isolated: a module that fails to import, violates the contract, or
 * duplicates an id is skipped with a warning — never throws.
 *
 * @param {string} dir - directory containing provider *.mjs files
 * @param {object} [opts]
 * @param {string} [opts.requiredMethod='run'] - the verb every provider must export
 * @param {(msg: string) => void} [opts.warn=console.error] - warning sink
 * @returns {Promise<Map<string, any>>}
 */
export async function loadProviders(dir, { requiredMethod = 'run', warn = console.error } = {}) {
  const providers = new Map();
  if (!existsSync(dir)) return providers;

  const files = readdirSync(dir)
    .filter(f => f.endsWith('.mjs') && !f.startsWith('_'))
    .sort(); // deterministic detect() priority

  for (const file of files) {
    const full = path.join(dir, file);
    let mod;
    try {
      mod = await import(pathToFileURL(full).href);
    } catch (err) {
      warn(`⚠️  ${file}: failed to load — ${err.message}`);
      continue;
    }
    const p = mod.default;
    if (!p || typeof p[requiredMethod] !== 'function' || !p.id) {
      warn(`⚠️  ${file}: skipping — default export must be { id, ${requiredMethod}() }`);
      continue;
    }
    if (providers.has(p.id)) {
      warn(`⚠️  ${file}: duplicate provider id "${p.id}" — keeping first`);
      continue;
    }
    providers.set(p.id, p);
  }
  return providers;
}

/**
 * Resolve which provider handles `entry`, by precedence:
 *   1. Explicit `entry.provider` (or `entry[idField]`) wins — skips detect().
 *   2. Otherwise each provider's detect() runs in load order; first hit wins.
 *
 * Every detect() is try-wrapped so one misbehaving provider can't break routing.
 *
 * @param {any} entry - the config object to route
 * @param {Map<string, any>} providers
 * @param {object} [opts]
 * @param {string} [opts.idField='provider'] - config field holding an explicit id
 * @param {string[]} [opts.skipIds=[]] - provider ids to exclude from this pass
 * @param {(msg: string) => void} [opts.warn=console.error]
 * @returns {{ provider: any } | { error: string } | null}
 */
export function resolveProvider(entry, providers, { idField = 'provider', skipIds = [], warn = console.error } = {}) {
  const explicitId = entry?.[idField];
  if (explicitId) {
    const p = providers.get(explicitId);
    if (!p) return { error: `unknown provider: ${explicitId}` };
    return { provider: p };
  }

  for (const p of providers.values()) {
    if (skipIds.includes(p.id)) continue;
    let hit;
    try {
      hit = p.detect?.(entry);
    } catch (err) {
      warn(`⚠️  ${p.id}: detect() threw — ${err.message}`);
      continue;
    }
    if (hit) return { provider: p };
  }
  return null;
}
