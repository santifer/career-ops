// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// BambooHR provider — hits the public careers list JSON endpoint.
//
// careers_url shape: `https://{company}.bamboohr.com/careers` (or `/careers/list`)
// List endpoint:     `https://{company}.bamboohr.com/careers/list`
// Detail endpoint:   `https://{company}.bamboohr.com/careers/{id}/detail`
//
// The list endpoint returns enough to populate the scanner's Job shape
// (title, id, location). Detail is reserved for downstream evaluation
// modes — the scanner only needs (title, url, location).
//
// NOTE 2026-05-20: BambooHR appears to gate `/careers/list` against
// unrecognized clients (HTTP 403 across several known slugs in testing).
// Parsing follows modes/scan.md exactly; if a real customer board fails,
// confirm the slug still hosts on bamboohr.com and inspect response headers.

function assertBambooUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`bamboohr: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`bamboohr: URL must use HTTPS: ${url}`);
  if (!parsed.hostname.endsWith('.bamboohr.com'))
    throw new Error(`bamboohr: untrusted hostname "${parsed.hostname}" — must end in .bamboohr.com`);
  return parsed;
}

function resolveSlug(entry) {
  if (entry.api) {
    const parsed = assertBambooUrl(entry.api);
    return parsed.hostname.split('.')[0];
  }
  const url = entry.careers_url || '';
  const match = url.match(/https:\/\/([^.]+)\.bamboohr\.com/);
  return match ? match[1] : null;
}

function formatLocation(loc) {
  if (!loc || typeof loc !== 'object') return '';
  const parts = [loc.city, loc.state, loc.country].filter(p => typeof p === 'string' && p.trim());
  return parts.join(', ');
}

/** @type {Provider} */
export default {
  id: 'bamboohr',

  detect(entry) {
    try {
      return resolveSlug(entry) ? { url: `https://${resolveSlug(entry)}.bamboohr.com/careers/list` } : null;
    } catch {
      return null;
    }
  },

  async fetch(entry, ctx) {
    const slug = resolveSlug(entry);
    if (!slug) throw new Error(`bamboohr: cannot derive subdomain for ${entry.name}`);
    const listUrl = `https://${slug}.bamboohr.com/careers/list`;
    assertBambooUrl(listUrl);
    const json = await ctx.fetchJson(listUrl, {
      headers: { accept: 'application/json' },
      redirect: 'error',
    });
    const items = Array.isArray(json?.result) ? json.result : [];
    return items
      .filter(j => j && j.id != null && j.jobOpeningName)
      .map(j => ({
        title: j.jobOpeningName,
        url: j.jobOpeningShareUrl || `https://${slug}.bamboohr.com/careers/${j.id}/detail`,
        company: entry.name,
        location: formatLocation(j.location) || j.locationCity || '',
      }));
  },
};
