// Generic Apify provider — runs any Apify actor and maps its dataset items to
// the {title, url, company, location} shape scan.mjs expects. All variation
// (which actor, what input, how to read fields from items) lives in
// portals.yml, not in code.
//
// Usage in portals.yml:
//
//   tracked_companies:
//     - name: "Indeed — VP Engineering (Chicago)"
//       provider: apify
//       actor: misceres/indeed-scraper
//       input:
//         position: "VP of Engineering"
//         location: "Chicago, IL"
//         country: "US"
//         maxItems: 25
//       field_map:
//         title:    [positionName, title]    # array = first non-empty wins
//         url:      url
//         company:  [company, companyName]
//         location: [location, formattedLocation]
//       enabled: true
//
// `field_map` values can be a string (single key), an array of strings (try
// each in order), or a dotted path for nested fields (e.g. "company.name").
// `title` and `url` are required keys; items missing either are dropped.
//
// Optional `defaults` block fills in fields that the actor's output doesn't
// expose at all. Useful for single-tenant sources like a Workday board, where
// every item is from the same employer:
//
//     defaults:
//       company: "Mondelez International"
//
// Requires APIFY_TOKEN in the environment. When unset, this entry errors
// cleanly and the rest of the scan continues.

import { hasToken, runActor } from './_apify.mjs';

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function pickField(item, spec) {
  const keys = Array.isArray(spec) ? spec : [spec];
  for (const k of keys) {
    const v = getPath(item, k);
    if (v != null && v !== '') return v;
  }
  return '';
}

function normalizeItem(item, fieldMap, defaults) {
  const out = {
    title: String(pickField(item, fieldMap.title) || ''),
    url: String(pickField(item, fieldMap.url) || ''),
    company: fieldMap.company ? String(pickField(item, fieldMap.company) || '') : '',
    location: fieldMap.location ? String(pickField(item, fieldMap.location) || '') : '',
  };
  for (const [k, v] of Object.entries(defaults || {})) {
    if (!out[k]) out[k] = String(v);
  }
  return out;
}

export default {
  id: 'apify',

  // No auto-detect — Apify entries must declare provider: apify.
  detect() { return null; },

  async fetch(entry, _ctx) {
    if (!hasToken()) {
      throw new Error('APIFY_TOKEN not set — skip this source or set the token in .env');
    }
    if (!entry.actor) {
      throw new Error(`apify: entry ${entry.name} missing 'actor' (e.g. misceres/indeed-scraper)`);
    }
    if (!entry.field_map || !entry.field_map.title || !entry.field_map.url) {
      throw new Error(`apify: entry ${entry.name} missing field_map.title and/or field_map.url`);
    }

    const items = await runActor(entry.actor, entry.input || {});
    return items
      .map(item => normalizeItem(item, entry.field_map, entry.defaults))
      .filter(j => j.title && j.url);
  },
};
