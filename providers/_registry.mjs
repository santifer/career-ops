// Provider registry — loading and routing shared by the scanner and the portal
// health check. Files prefixed with _ are never loaded as providers by scan.mjs,
// so this helper module lives safely alongside the provider plugins.
//
// Extracted from scan.mjs (#1451-era inline definitions) so verify-portals.mjs
// can route non-ATS boards through the SAME provider layer the scanner uses,
// without importing scan.mjs itself (which has top-level side effects and would
// form an import cycle via classifyFetchError).

import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * Load every provider plugin in a directory into an id→provider Map.
 *
 * Alphabetical order so detect() priority is deterministic across machines.
 * Malformed modules (wrong shape, duplicate id, import error) are logged and
 * skipped, never fatal.
 *
 * @param {string} dir - Absolute path to the providers directory.
 * @returns {Promise<Map<string, object>>}
 */
export async function loadProviders(dir) {
  const providers = new Map();
  if (!existsSync(dir)) return providers;
  const entries = readdirSync(dir)
    .filter(f => f.endsWith('.mjs') && !f.startsWith('_'))
    .sort();
  for (const file of entries) {
    const full = path.join(dir, file);
    let mod;
    try {
      mod = await import(pathToFileURL(full).href);
    } catch (err) {
      console.error(`⚠️  ${file}: failed to load — ${err.message}`);
      continue;
    }
    const p = mod.default;
    if (!p || typeof p.fetch !== 'function' || !p.id) {
      console.error(`⚠️  ${file}: skipping — default export must be { id, fetch }`);
      continue;
    }
    if (providers.has(p.id)) {
      console.error(`⚠️  ${file}: duplicate provider id "${p.id}" — keeping first`);
      continue;
    }
    providers.set(p.id, p);
  }
  return providers;
}

/**
 * Resolve which provider handles a tracked_companies entry.
 *   1. Explicit `provider:` field wins (skips detect()).
 *   2. local-parser when parser.command + script are configured (before API detect).
 *   3. Specific (URL/shape-based) detect() runs first, in load order; first hit wins.
 *   4. Generic catch-alls (providers with isFallback: true, e.g. serper's bare
 *      scan_method:websearch match) only run if no specific provider claimed the
 *      entry — otherwise a careers_url that's actually a known free ATS gets shadowed.
 *
 * @param {object} entry - tracked_companies entry.
 * @param {Map<string, object>} providers - id→provider Map from loadProviders().
 * @param {{skipIds?: string[]}} [opts] - Provider ids to skip (e.g. 'local-parser'
 *   so a network-only health check never execs a configured local command).
 * @returns {{provider: object}|{error: string}|null}
 */
export function resolveProvider(entry, providers, { skipIds = [] } = {}) {
  if (entry.provider) {
    const p = providers.get(entry.provider);
    if (!p) return { error: `unknown provider: ${entry.provider}` };
    return { provider: p };
  }

  const localParser = providers.get('local-parser');
  if (localParser && !skipIds.includes('local-parser')) {
    try {
      const hit = localParser.detect?.(entry);
      if (hit) return { provider: localParser };
    } catch (err) {
      console.error(`⚠️  local-parser: detect() threw for "${entry.name}" — ${err.message}`);
    }
  }

  const fallbacks = [];
  for (const p of providers.values()) {
    if (skipIds.includes(p.id)) continue;
    if (p.isFallback) { fallbacks.push(p); continue; }
    let hit;
    try {
      hit = p.detect?.(entry);
    } catch (err) {
      console.error(`⚠️  ${p.id}: detect() threw for "${entry.name}" — ${err.message}`);
      continue;
    }
    if (hit) return { provider: p };
  }
  for (const p of fallbacks) {
    let hit;
    try {
      hit = p.detect?.(entry);
    } catch (err) {
      console.error(`⚠️  ${p.id}: detect() threw for "${entry.name}" — ${err.message}`);
      continue;
    }
    if (hit) return { provider: p };
  }
  return null;
}
