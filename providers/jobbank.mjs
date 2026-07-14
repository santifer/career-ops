// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import {
  BROWSER_HEADERS,
  appendParam,
  cleanText,
  ensureHttpsUrl,
  positiveInt,
  tagText,
  toEpochMs,
} from './_job-board-utils.mjs';

const BASE_URL = 'https://jobbank.dk';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 60;

function parseJobbankDescription(description) {
  const text = cleanText(description);
  const hosIndex = text.indexOf(' hos ');
  if (hosIndex === -1) return { company: '', location: '', deadline: '' };

  let rest = text.slice(hosIndex + 5).trim();
  let deadline = '';
  const deadlineMatch = rest.match(/\((?:Ans[o\u00f8]gningsfrist|Ansoegningsfrist):\s*(.*?)\)\s*$/i);
  if (deadlineMatch) {
    const value = cleanText(deadlineMatch[1]);
    if (!/^l[o\u00f8]bende$/i.test(value)) deadline = value;
    rest = rest.slice(0, deadlineMatch.index).trim();
  }

  const comma = rest.indexOf(', ');
  return {
    company: comma === -1 ? cleanText(rest) : cleanText(rest.slice(0, comma)),
    location: comma === -1 ? '' : cleanText(rest.slice(comma + 2)),
    deadline,
  };
}

export function parseJobbankFeed(xml) {
  if (typeof xml !== 'string') return [];
  const items = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || [];
  const jobs = [];

  for (const item of items) {
    const title = tagText(item, 'title');
    const url = ensureHttpsUrl(tagText(item, 'link'), { hostnames: ['jobbank.dk'] });
    if (!title || !url) continue;

    const description = tagText(item, 'description');
    const parsed = parseJobbankDescription(description);
    const postedAt = toEpochMs(tagText(item, 'pubDate'));
    const job = {
      title,
      url,
      company: parsed.company,
      location: parsed.location,
      description,
    };
    if (postedAt !== undefined) job.postedAt = postedAt;
    jobs.push(job);
  }

  return jobs;
}

export function buildJobbankFeedUrl(entry = {}) {
  const params = new URLSearchParams();
  appendParam(params, 'key', entry.key);
  appendParam(params, 'amt', entry.location);
  appendParam(params, 'fjernarbejde', entry.remote);
  appendParam(params, 'oprettet', entry.since);

  if ([...params.keys()].length === 0) {
    throw new Error('jobbank: at least one of key, location, remote, or since is required');
  }

  return `${BASE_URL}/job/rss?${params.toString()}`;
}

/** @type {Provider} */
export default {
  id: 'jobbank',

  async fetch(entry, ctx) {
    const xml = await ctx.fetchText(buildJobbankFeedUrl(entry), {
      redirect: 'follow',
      timeoutMs: 20_000,
      headers: BROWSER_HEADERS,
    });
    const limit = positiveInt(entry?.limit, DEFAULT_LIMIT, { min: 1, max: MAX_LIMIT });
    return parseJobbankFeed(xml).slice(0, limit);
  },
};
