// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Consider provider — VC "talent network" portfolio boards on getconsider.com
// (Founderful, Creandum, Balderton, Lightspeed, Notion Capital, …). The board
// is a JS app, but its data comes from a same-origin JSON endpoint we can hit
// directly (discovered via a headless capture of the board's network calls):
//
//   POST {board_origin}/api-boards/search-jobs
//   body: {"meta":{"size":N},"board":{"id":"<board_id>","isParent":true},
//          "query":{"promoteFeatured":true}}
//   -> { jobs: [ {title,url,applyUrl,companyName,locations[],timeStamp,remote} ], total }
//
// `url` is the clean destination ATS link (dedups with the ashby/greenhouse
// providers); `companyName` is the portfolio company. The board id is NOT the
// host (Founderful's is "wingman"), so set it explicitly in portals.yml:
//
//   - name: Founderful (portfolio)
//     provider: consider
//     consider_board: wingman
//     careers_url: https://jobs.founderful.com/jobs
//     enabled: true
//
// `consider_size` (default 500) caps how many newest/featured jobs are pulled in
// the single request. Boards larger than that are truncated (rare for VC boards).

import { toEpochMs } from './_http.mjs';

const ENDPOINT_PATH = '/api-boards/search-jobs';
const DEFAULT_SIZE = 500;

function resolveOrigin(entry) {
  const url = entry.careers_url || '';
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function locationString(job) {
  if (Array.isArray(job.locations) && job.locations.length) {
    return job.locations.filter(l => typeof l === 'string').join(', ');
  }
  if (Array.isArray(job.normalizedLocations) && job.normalizedLocations.length) {
    return job.normalizedLocations.map(l => l?.label || l?.value).filter(Boolean).join(', ');
  }
  return job.remote ? 'Remote' : '';
}

/** @type {Provider} */
export default {
  id: 'consider',

  detect(entry) {
    const origin = resolveOrigin(entry);
    return entry.consider_board && origin ? { url: origin + ENDPOINT_PATH } : null;
  },

  async fetch(entry, ctx) {
    const origin = resolveOrigin(entry);
    if (!origin) throw new Error(`consider: ${entry.name} needs a valid careers_url`);
    if (!entry.consider_board) throw new Error(`consider: ${entry.name} needs a 'consider_board' id in portals.yml`);
    const size = Number.isInteger(entry.consider_size) && entry.consider_size > 0 ? entry.consider_size : DEFAULT_SIZE;

    const json = await ctx.fetchJson(origin + ENDPOINT_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', referer: origin + '/jobs' },
      body: JSON.stringify({
        meta: { size },
        board: { id: String(entry.consider_board), isParent: true },
        query: { promoteFeatured: true },
      }),
    });

    const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
    return jobs
      .map(j => {
        const rawUrl = j.url || j.applyUrl || '';
        if (!rawUrl) return null;
        // Normalize to an absolute URL so the dedup key matches what the
        // ashby/greenhouse providers emit (Consider returns absolute ATS links,
        // but resolve defensively in case a relative path ever appears).
        let url;
        try {
          url = new URL(rawUrl, origin).toString();
        } catch {
          return null;
        }
        return {
          title: j.title || '',
          url,
          company: j.companyName || entry.name,
          location: locationString(j),
          postedAt: toEpochMs(j.timeStamp),
        };
      })
      .filter(Boolean);
  },
};
