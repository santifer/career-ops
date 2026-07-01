// @ts-check
import dotenv from 'dotenv';
try { dotenv.config(); } catch { /* optional */ }

/** @typedef {import('./_types.js').Provider} Provider */

// LinkedIn Apify Provider — retrieves postings from LinkedIn using the Apify API.
// Requires APIFY_TOKEN env var. If token is missing, silently returns [].

function normalizeJob(item, entry) {
  const title =
    item.title || item.jobTitle || item.position || item.name || '';

  const company =
    item.companyName || item.company || item.employer ||
    item.company_name || item.organizationName || entry.name || '';

  const location =
    item.location || item.jobLocation || item.place || '';

  const url =
    item.jobUrl || item.url || item.link || item.applyUrl ||
    item.jobLink || item.externalUrl || '';

  return { title, company, location, url };
}

/** @type {Provider} */
export default {
  id: 'linkedin-apify',

  detect(entry) {
    // Explicit provider only, no auto-detection from URL
    return null;
  },

  async fetch(entry, ctx) {
    const token = process.env.APIFY_TOKEN;
    if (!token || token === 'your_apify_token_here') {
      // Silently skip if token is absent
      return [];
    }

    const actorIdRaw = entry.apify_actor || 'bebity~linkedin-jobs-scraper';
    const actorId = encodeURIComponent(actorIdRaw);
    const query = entry.query || entry.scan_query || entry.search_query || entry.name || '';
    const location = entry.location || '';
    
    const parsedMaxResults = Number(entry.max_results ?? entry.limit ?? 20);
    const maxResults = Number.isFinite(parsedMaxResults) && parsedMaxResults > 0
      ? Math.floor(parsedMaxResults)
      : 20;

    // Build actor input matching the target actor format
    const input = {
      searchQueries: [`${query}${location ? ' ' + location : ''}`],
      location: location || undefined,
      maxResults,
      proxy: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    };

    const apiUrl = new URL(`https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`);
    apiUrl.searchParams.set('token', token);

    try {
      const response = await ctx.fetchJson(apiUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
        timeoutMs: 300000, // 5 minutes timeout for slow LinkedIn scrapes
      });

      const items = Array.isArray(response) ? response : (response?.data?.items || []);
      return items.map(item => normalizeJob(item, entry)).filter(j => j.title && j.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`⚠️  linkedin-apify: failed to fetch for "${entry.name}" — ${message}`);
      return [];
    }
  },
};
