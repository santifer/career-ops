import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Builds array of command-line arguments for running 'freehire search'.
 *
 * @param {object} entry - The portals.yml company/board entry.
 * @returns {string[]} Arguments array.
 */
export function buildSearchArgs(entry) {
  const args = ['search', entry.query || ''];
  if (entry.remote) {
    args.push('--remote');
  }
  if (entry.region) {
    const regions = Array.isArray(entry.region) ? entry.region : [entry.region];
    for (const r of regions) {
      if (typeof r === 'string' && r.trim()) {
        args.push('--region', r.trim());
      }
    }
  }
  if (entry.limit) {
    args.push('--limit', String(entry.limit));
  }
  args.push('--json');
  return args;
}

/**
 * Loads the slug map mapping external job URL to Freehire slug.
 *
 * @param {string} [filePath]
 * @returns {Object<string, string>}
 */
export function loadSlugMap(filePath = 'data/freehire-slugs.json') {
  if (!existsSync(filePath)) return {};
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) || {};
  } catch {
    return {};
  }
}

/**
 * Saves the slug map mapping external job URL to Freehire slug.
 *
 * @param {Object<string, string>} map
 * @param {string} [filePath]
 */
export function saveSlugMap(map, filePath = 'data/freehire-slugs.json') {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(map, null, 2), 'utf-8');
}

export const STATUS_MAP = {
  'Applied': 'applied',
  'Responded': 'responded',
  'Interview': 'interview',
  'Offer': 'offer',
  'Rejected': 'rejected',
  'Discarded': 'withdrawn',
};

/**
 * Maps a canonical status from applications.md to a Freehire stage.
 *
 * @param {string} status - Canonical application status.
 * @returns {string|null} Freehire stage, or null if status shouldn't be synced.
 */
export function mapStatusToStage(status) {
  return STATUS_MAP[status] || null;
}

/**
 * Maps Freehire search result jobs into normalized scanner Job objects.
 * Drops closed postings (having closed_at field set).
 *
 * @param {any[]} jobs - Freehire API/CLI job array.
 * @param {object} entry - The portals.yml entry.
 * @returns {import('./providers/_types.js').Job[]} Mapped jobs.
 */
export function mapJobs(jobs, entry) {
  if (!Array.isArray(jobs)) return [];
  return jobs
    .filter(j => j && typeof j === 'object' && !j.closed_at)
    .map(j => {
      const title = (j.title || '').trim();
      const url = (j.url || j.external_url || j.link || j.apply_url || '').trim();
      const company = (j.company || j.company_name || j.companyName || entry.name || '').trim();
      const location = (j.location || '').trim();
      
      let postedAt;
      const rawDate = j.published_at || j.created_at || j.posted_at || j.postedAt;
      if (rawDate) {
        const parsed = Date.parse(rawDate);
        if (!Number.isNaN(parsed)) {
          postedAt = parsed;
        }
      }
      
      return {
        title,
        url,
        company,
        location,
        ...(postedAt !== undefined ? { postedAt } : {}),
      };
    })
    .filter(j => j.title && j.url);
}
