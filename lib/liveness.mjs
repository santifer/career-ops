/**
 * lib/liveness.mjs — shared liveness probe + tracker mutator.
 *
 * Extracted from scripts/heartbeat.mjs (2026-05-18) so both the daily
 * heartbeat AND the new overnight liveness-sweep (scripts/liveness-sweep.mjs)
 * can use the same API-aware probe without one importing the other (which
 * would run the heartbeat's main() at module load).
 *
 * Exports:
 *   verifyApplyNowLink(url) → { result: 'active'|'expired'|'uncertain'|'no-url', reason: string }
 *   markRowAsExpired(rowNum, urlReason, opts?) → void   (mutates data/applications.md in place)
 *
 * Hard-expired phrase precedence already enforced via liveness-core.mjs
 * classifyLiveness() — these higher-level functions add API-aware paths
 * for Greenhouse + Ashby (zero-cost, zero-rate-limit-risk) before falling
 * back to the generic HTML scan.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(__filename));

const HARD_EXPIRED_RE = /position has been filled|no longer accepting|job (?:posting )?no longer available|this job has expired|posting has expired|position is no longer|this role has been closed|role has been filled|applications? (?:have|are) closed|diese stelle (ist )?(?:nicht mehr|bereits) besetzt|offre (?:expirée|n'est plus disponible)/i;

/**
 * API-aware liveness probe.
 *  - Greenhouse: hits boards-api.greenhouse.io (200 = active, 404/410 = expired)
 *  - Ashby:      hits api.ashbyhq.com/posting-api/job-board (still in array = active)
 *  - Generic:    fetch + status check + hard-expired phrase scan
 *
 * Returns:
 *   { result: 'active', reason }       — clearly live
 *   { result: 'expired', reason }      — definitively closed
 *   { result: 'uncertain', reason }    — network error / 5xx / SPA we couldn't classify
 *   { result: 'no-url', reason }       — empty url passed in
 */
export async function verifyApplyNowLink(url) {
  if (!url) return { result: 'no-url', reason: 'no URL' };

  // Greenhouse JSON API — definitive
  const greenhouseMatch = url.match(/(?:job-boards|boards)\.(?:eu\.)?greenhouse\.io\/([\w-]+)\/jobs\/(\d+)/i);
  if (greenhouseMatch) {
    try {
      const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${greenhouseMatch[1]}/jobs/${greenhouseMatch[2]}`;
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });
      if (res.status === 200) return { result: 'active', reason: 'Greenhouse API 200' };
      if (res.status === 404 || res.status === 410) return { result: 'expired', reason: `Greenhouse API ${res.status}` };
    } catch {}
  }

  // Ashby JSON API — definitive
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([\w-]+)\/([\w-]+)/i);
  if (ashbyMatch) {
    try {
      const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`;
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const json = await res.json();
        const stillListed = (json.jobs || []).some(j => (j.jobUrl || '').includes(ashbyMatch[2]) || (j.id === ashbyMatch[2]));
        return stillListed
          ? { result: 'active', reason: 'Ashby API: role still listed' }
          : { result: 'expired', reason: 'Ashby API: role no longer in board' };
      }
    } catch {}
  }

  // Generic fallback — fetch the URL, look at status, then scan for hard-expired phrases.
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
    });
    const status = res.status;
    const finalUrl = res.url || url;
    if (status === 404 || status === 410 || status === 451) {
      return { result: 'expired', reason: `HTTP ${status}` };
    }
    if (status >= 500) return { result: 'uncertain', reason: `HTTP ${status} (server error)` };
    if (status >= 400) return { result: 'expired', reason: `HTTP ${status}` };
    // Redirect to listing page (no specific job ID in the final URL)
    if (/\/(jobs|positions|careers|search|listings)\/?(\?|$)/i.test(finalUrl) && !/\/(jobs|positions)\/[\w-]+/.test(finalUrl)) {
      return { result: 'expired', reason: 'redirected to listing page' };
    }
    const html = await res.text();
    const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (HARD_EXPIRED_RE.test(bodyText)) {
      return { result: 'expired', reason: 'expired phrase in body' };
    }
    return { result: 'active', reason: `HTTP ${status}` };
  } catch (err) {
    return { result: 'uncertain', reason: `fetch failed: ${err.message.slice(0, 60)}` };
  }
}

/**
 * Mark a tracker row as Discarded with a closure note.
 * Mutates data/applications.md in place. Only fires on rows currently
 * marked Evaluated — won't touch Applied/Interview rows (those need
 * Mitchell's eyes; the sweep writes them to data/liveness-state.json
 * for surfacing in the heartbeat instead).
 *
 * @param {number|string} rowNum
 * @param {string} urlReason  — short description like "Ashby API: role no longer in board"
 * @param {Object} [opts]
 * @param {string} [opts.applicationsPath]  — override path for tests
 * @param {boolean} [opts.silent]            — suppress console output
 */
export function markRowAsExpired(rowNum, urlReason, opts = {}) {
  const path = opts.applicationsPath || join(ROOT, 'data/applications.md');
  if (!existsSync(path)) return false;
  const text = readFileSync(path, 'utf-8');
  const re = new RegExp(`^(\\| ${rowNum} \\|[^|]+\\|[^|]+\\|[^|]+\\|[^|]+\\|)\\s*Evaluated\\s*(\\|[^|]+\\|[^|]+\\|)\\s*([^|]*)\\s*\\|`, 'm');
  if (!re.test(text)) return false;
  const updated = text.replace(re, (_, prefix, mid, notes) =>
    `${prefix} Discarded ${mid} ⚠️ LINK EXPIRED on ${new Date().toISOString().slice(0,10)} (${urlReason}). Original notes: ${notes.trim()} |`
  );
  writeFileSync(path, updated);
  if (!opts.silent) {
    console.log(`  ↓ Marked row #${rowNum} as Discarded (link expired: ${urlReason})`);
  }
  return true;
}
