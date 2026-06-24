// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import cp from 'child_process';
import { buildSearchArgs, mapJobs, loadSlugMap, saveSlugMap } from '../freehire-core.mjs';

/** @type {Provider} */
export default {
  id: 'freehire',

  detect(entry) {
    return null; // Explicit routing only
  },

  async fetch(entry, ctx) {
    const args = buildSearchArgs(entry);
    let stdout;
    try {
      stdout = cp.execFileSync('freehire', args, { encoding: 'utf-8', timeout: 30000 });
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error("freehire: CLI command 'freehire' not found on PATH. Please install freehire and run 'freehire auth login'.");
      }
      throw new Error(`freehire: CLI search failed: ${err.message}`);
    }

    let rawJobs;
    try {
      rawJobs = JSON.parse(stdout);
    } catch (err) {
      throw new Error(`freehire: failed to parse CLI output JSON: ${err.message}`);
    }

    if (!Array.isArray(rawJobs)) {
      throw new Error("freehire: CLI did not return a JSON array");
    }

    // Filter out closed and map to standard Job objects
    const mapped = mapJobs(rawJobs, entry);

    // Update the local slug map with any mappings returned
    const slugMap = loadSlugMap(process.env.FREEHIRE_SLUG_MAP);
    let mapChanged = false;
    for (const j of rawJobs) {
      if (j && typeof j === 'object') {
        const url = (j.url || j.external_url || j.link || j.apply_url || '').trim();
        const slug = (j.slug || '').trim();
        if (url && slug && slugMap[url] !== slug) {
          slugMap[url] = slug;
          mapChanged = true;
        }
      }
    }
    if (mapChanged) {
      saveSlugMap(slugMap, process.env.FREEHIRE_SLUG_MAP);
    }

    return mapped;
  },
};
