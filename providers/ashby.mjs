// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Annualization multipliers for different compensation intervals
const INTERVAL_MULTIPLIERS = {
  '1 HOUR': 2080,
  '1 DAY': 260,
  '1 WEEK': 52,
  '2 WEEK': 26,
  '0.5 MONTH': 24,
  '1 MONTH': 12,
  '2 MONTH': 6,
  '3 MONTH': 4,
  '6 MONTH': 2,
  '1 YEAR': 1,
};

/**
 * Parse compensation data from Ashby job object.
 * Returns structured salary object with min, max, and currency,
 * or null if no valid compensation data exists.
 * @param {object} job - Ashby job object
 * @returns {{min: number, max: number, currency: string}|null}
 */
function parseCompensation(job) {
  const comp = job?.compensation;
  if (!comp) return null;

  const interval = comp.interval || '1 YEAR';
  const multiplier = INTERVAL_MULTIPLIERS[interval];
  if (!multiplier) return null;

  const minValue = comp.minValue;
  const maxValue = comp.maxValue;
  const currency = comp.currency || '';

  // If neither min nor max is provided, no valid compensation
  if (minValue == null && maxValue == null) return null;

  // Annualize the values
  const min = minValue != null ? minValue * multiplier : null;
  const max = maxValue != null ? maxValue * multiplier : null;

  // Must have at least one valid annual value
  if (min == null && max == null) return null;

  return {
    min: min ?? max,
    max: max ?? min,
    currency: currency.toUpperCase(),
  };
}

function resolveApiUrl(entry) {
  const url = entry.careers_url || '';
  const match = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (!match) return null;
  return `https://api.ashbyhq.com/posting-api/job-board/${match[1]}?includeCompensation=true`;
}

/** @type {Provider} */
export default {
  id: 'ashby',

  detect(entry) {
    const apiUrl = resolveApiUrl(entry);
    return apiUrl ? { url: apiUrl } : null;
  },

  async fetch(entry, ctx) {
    const apiUrl = resolveApiUrl(entry);
    if (!apiUrl) throw new Error(`ashby: cannot derive API URL for ${entry.name}`);
    const json = await ctx.fetchJson(apiUrl);
    const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
    return jobs.map(j => ({
      title: j.title || '',
      url: j.jobUrl || '',
      company: entry.name,
      location: j.location || '',
      salary: parseCompensation(j),
    }));
  },
};
