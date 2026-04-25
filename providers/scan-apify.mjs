// Apify-backed provider 
// Usage in portals.yml:
//
//   tracked_companies:
//     - name: "Engineering Lead"
//       provider: apify-indeed
//       position: "Engineering Lead"
//       location: "Chicago, IL"
//       country: "US"
//       maxItems: 50
//       enabled: true
//       # actor: misceres/indeed-scraper   # optional override
//
// Requires APIFY_TOKEN in the environment. When the token is missing, the
// plugin reports a clear, non-fatal error through scan.mjs's error list so
// users without Apify configured still get a clean scan for every other
// provider.

import { hasToken, runActor } from './_apify.mjs';

const DEFAULT_ACTOR = 'misceres/indeed-scraper';
const DEFAULT_MAX_ITEMS = 50;
const DEFAULT_COUNTRY = 'US';

function normalizeItem(raw, fallbackCompany) {
  return {
    title: raw.positionName || raw.title || '',
    url: raw.url || raw.externalApplyLink || '',
    company: raw.company || raw.companyName || fallbackCompany || '',
    location: raw.location || raw.formattedLocation || '',
  };
}

export default {
  id: 'apify-indeed',

  // No auto-detect — Apify entries must declare provider
  detect() { return null; },

  async fetch(entry, _ctx) {
    if (!hasToken()) {
      throw new Error('APIFY_TOKEN not set — skip this source or set the token in .env');
    }

    const actor = entry.actor || DEFAULT_ACTOR;
    const input = {
      position: entry.position,
      location: entry.location,
      country: entry.country || DEFAULT_COUNTRY,
      maxItems: entry.maxItems || DEFAULT_MAX_ITEMS,
      ...(entry.input || {}),
    };

    const items = await runActor(actor, input);
    return items
      .map(raw => normalizeItem(raw, entry.name))
      .filter(j => j.title && j.url);
  },
};
