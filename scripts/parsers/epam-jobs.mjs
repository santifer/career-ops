// EPAM careers local parser — careers.epam.com is a custom Next.js board with
// a public JSON search API (no ATS vendor), so we hit the API directly.
// Prints jobs-json-v1: [{ title, url, location }].
// Constrained to India + Hyderabad via the country/city facet ids below
// (verified live: country=4060741400035606931 (India), city=4060741400035606933 (Hyderabad)).
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const CAREER_OPS = 'E:/Opencode/career-lens/career-lens';
const { fetchJson } = await import(pathToFileURL(join(CAREER_OPS, 'providers/_http.mjs')).href);

const API = 'https://careers.epam.com/api/jobs/v2/search/careers-i18n';
const PAGE_SIZE = 50;
const MAX_JOBS = parseInt(process.env.EPAM_SCAN_MAX_JOBS || '500', 10);
const FACETS = encodeURIComponent('country=4060741400035606931;city=4060741400035606933');

async function fetchPage(from) {
  const url = `${API}?from=${from}&lang=en&size=${PAGE_SIZE}&websiteLocale=en-us&facets=${FACETS}`;
  return await fetchJson(url, {
    headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
    timeoutMs: 45000,
  });
}

const jobs = [];
let from = 0;
for (;;) {
  const body = await fetchPage(from);
  const list = body?.data?.jobs || [];
  for (const j of list) {
    if (j.is_hidden) continue;
    const cities = (j.city || []).map((c) => c.name).filter(Boolean);
    jobs.push({
      title: (j.name || '').replace(/\s+/g, ' ').trim(),
      url: `https://careers.epam.com${j.seo?.url || ''}`,
      location: cities.length ? cities.join(', ') : 'India, Hyderabad',
    });
  }
  const total = body?.data?.total || 0;
  from += PAGE_SIZE;
  if (from >= total || from >= MAX_JOBS || !list.length) break;
}

console.log(JSON.stringify(jobs));
