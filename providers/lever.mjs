/**
 * lever.mjs — Lever ATS provider for career-ops scanner.
 *
 * Detects from:
 *   entry.api containing api.lever.co
 *   entry.careers_url containing jobs.lever.co
 *
 * API: GET https://api.lever.co/v0/postings/{slug}?mode=json
 * Response: [{ text, hostedUrl, applyUrl, categories: { location } }]
 */

const API_RE = /api\.lever\.co\/v0\/postings\/([^/?#\s]+)/;
const JOBS_RE = /jobs\.lever\.co\/([^/?#\s]+)/;

function apiUrlFrom(entry) {
  if (entry.api && API_RE.test(entry.api)) {
    return entry.api.includes('mode=json') ? entry.api : `${entry.api}?mode=json`;
  }
  if (entry.careers_url) {
    const m = entry.careers_url.match(JOBS_RE);
    if (m) return `https://api.lever.co/v0/postings/${m[1]}?mode=json`;
  }
  return null;
}

export default {
  id: 'lever',

  detect(entry) {
    return apiUrlFrom(entry) ? {} : null;
  },

  async fetch(entry, ctx) {
    const apiUrl = apiUrlFrom(entry);
    if (!apiUrl) throw new Error(`lever: cannot determine API URL for "${entry.name}"`);

    const jobs = await ctx.get(apiUrl);
    if (!Array.isArray(jobs)) throw new Error(`lever: expected array, got ${typeof jobs}`);

    return jobs.map(j => ({
      title: j.text || '',
      url: j.hostedUrl || j.applyUrl || '',
      company: entry.name,
      location: j.categories?.location || j.workplaceType || '',
    })).filter(j => j.url && j.title);
  },
};
