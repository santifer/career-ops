/**
 * greenhouse.mjs — Greenhouse ATS provider for career-ops scanner.
 *
 * Detects from:
 *   entry.api containing boards-api.greenhouse.io
 *   entry.careers_url containing job-boards.greenhouse.io or boards.greenhouse.io
 *
 * API: GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
 * Response: { jobs: [{ title, absolute_url, location: { name } }] }
 */

const API_RE = /boards-api\.greenhouse\.io\/v1\/boards\/([^/?#\s]+)\/jobs/;
const CAREERS_RE = /(?:job-boards|boards)\.greenhouse\.io\/([^/?#\s]+)/;

function slugFrom(entry) {
  if (entry.api) {
    const m = entry.api.match(API_RE);
    if (m) return m[1];
  }
  if (entry.careers_url) {
    const m = entry.careers_url.match(CAREERS_RE);
    if (m) return m[1];
  }
  return null;
}

export default {
  id: 'greenhouse',

  detect(entry) {
    return slugFrom(entry) ? {} : null;
  },

  async fetch(entry, ctx) {
    const slug = slugFrom(entry);
    if (!slug) throw new Error(`greenhouse: cannot determine slug for "${entry.name}"`);

    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;
    const data = await ctx.get(apiUrl);
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];

    return jobs.map(j => ({
      title: j.title || '',
      url: j.absolute_url || '',
      company: entry.name,
      location: j.location?.name || '',
    })).filter(j => j.url);
  },
};
