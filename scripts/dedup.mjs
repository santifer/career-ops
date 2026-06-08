/**
 * dedup.mjs — Deduplication for PulseJob arrays
 *
 * Key: lowercase(company) + "|" + lowercase(title) + "|" + lowercase(location or "remote")
 *
 * Conflict resolution:
 *   1. Keep the job with the newer posted_at.
 *   2. If same date: prefer by source priority (greenhouse > lever > ashby > workday > linkedin > indeed > dice).
 *
 * Usage:
 *   import { dedup } from '../scripts/dedup.mjs';
 *   const { kept, discarded } = dedup([...jobs]);
 */

/** Source priority: lower index = preferred when same date. */
const SOURCE_PRIORITY = ['greenhouse', 'lever', 'ashby', 'workday', 'linkedin', 'icims', 'indeed', 'dice'];

function sourcePriority(source) {
  const idx = SOURCE_PRIORITY.indexOf(source);
  return idx === -1 ? SOURCE_PRIORITY.length : idx;
}

/**
 * Build the dedup key for a job.
 * @param {object} job
 * @returns {string}
 */
export function dedupKey(job) {
  const loc = (job.location || (job.remote ? 'remote' : 'unknown')).trim().toLowerCase();
  return `${job.company.trim().toLowerCase()}|${job.title.trim().toLowerCase()}|${loc}`;
}

/**
 * Deduplicate an array of PulseJob objects.
 * @param {object[]} jobs
 * @returns {{ kept: object[], discarded: object[] }}
 */
export function dedup(jobs) {
  const map = new Map(); // key → job
  const discarded = [];

  for (const job of jobs) {
    const key = dedupKey(job);
    if (!map.has(key)) {
      map.set(key, job);
      continue;
    }

    const existing = map.get(key);
    const existTs = existing.posted_at ? Date.parse(existing.posted_at) : 0;
    const newTs   = job.posted_at      ? Date.parse(job.posted_at)      : 0;

    let winner;
    if (newTs > existTs) {
      winner = job;
      discarded.push(existing);
    } else if (newTs < existTs) {
      winner = existing;
      discarded.push(job);
    } else {
      // Same date — prefer by source priority
      if (sourcePriority(job.source) < sourcePriority(existing.source)) {
        winner = job;
        discarded.push(existing);
      } else {
        winner = existing;
        discarded.push(job);
      }
    }
    map.set(key, winner);
  }

  return { kept: Array.from(map.values()), discarded };
}
