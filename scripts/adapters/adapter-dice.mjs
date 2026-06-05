/**
 * adapter-dice.mjs — Maps Dice MCP JSON objects into PulseJob[]
 *
 * Input: array of Dice job objects (from MCP response).
 *
 * Salary parsing handles:
 *   "Depends on Experience" → null / null
 *   "$100" → 100 / null
 *   "USD 121,100.00 - 201,900.00 per year" → 121100 / 201900
 *   "$130,000 - $160,000 per year" → 130000 / 160000
 *   "120000" → 120000 / null
 *
 * Usage:
 *   import { parseDiceJobs } from './adapter-dice.mjs';
 *   const jobs = parseDiceJobs(diceApiArray);
 */

/**
 * Parse salary string from Dice → { min, max } in USD annual.
 * @param {string|null|undefined} raw
 * @returns {{ min: number|null, max: number|null }}
 */
export function parseDiceSalary(raw) {
  if (!raw || typeof raw !== 'string') return { min: null, max: null };
  const s = raw.trim();

  // "Depends on Experience" or similar freeform
  if (/depends|negotiable|competitive|open|tbd|n\/a/i.test(s)) {
    return { min: null, max: null };
  }

  // Remove currency symbols and thousands separators
  const clean = s.replace(/[USD\$,]/gi, '').trim();

  // Range: "121100.00 - 201900.00" or "121,100 - 201,900"
  const rangeMatch = clean.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    return {
      min: Math.round(parseFloat(rangeMatch[1])),
      max: Math.round(parseFloat(rangeMatch[2])),
    };
  }

  // Single number
  const single = clean.match(/(\d+(?:\.\d+)?)/);
  if (single) {
    return { min: Math.round(parseFloat(single[1])), max: null };
  }

  return { min: null, max: null };
}

/**
 * Normalize a Dice postedDate string (ISO 8601 or epoch ms) to ISO string.
 * @param {string|number|null} raw
 * @returns {string|null}
 */
function parsePostedDate(raw) {
  if (!raw) return null;
  // Already ISO-ish string
  if (typeof raw === 'string' && /^\d{4}-\d{2}/.test(raw)) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  // Epoch milliseconds (number or numeric string)
  const n = Number(raw);
  if (!isNaN(n) && n > 1e9) {
    const d = new Date(n);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  // Try generic parse
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Truncate string to maxLen chars, appending "…" if truncated. */
function truncate(s, maxLen = 500) {
  if (!s) return null;
  const str = String(s);
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

/**
 * Map an array of Dice MCP job objects to PulseJob[].
 * @param {object[]} diceJobs - Raw Dice API/MCP response items
 * @param {string} [ingestedAt] - Override ingestion timestamp (default: now)
 * @returns {import('../ingest-runner.mjs').PulseJob[]}
 */
export function parseDiceJobs(diceJobs, ingestedAt) {
  const now = ingestedAt || new Date().toISOString();
  if (!Array.isArray(diceJobs)) return [];

  return diceJobs
    .filter(j => j && j.id && j.title)
    .map(j => {
      const salary = parseDiceSalary(j.salary);
      const isRemote = Boolean(j.isRemote);

      // Location: prefer displayName, fall back to "Remote" when isRemote
      const location =
        (j.jobLocation && j.jobLocation.displayName)
          ? j.jobLocation.displayName
          : (isRemote ? 'Remote' : null) ?? 'Unknown';

      const postedAt = parsePostedDate(j.postedDate) || now;

      return {
        source:           'dice',
        external_id:      String(j.id),
        title:            String(j.title),
        company:          String(j.companyName || j.company || 'Unknown'),
        location:         location,
        url:              String(j.detailsPageUrl || j.applyUrl || ''),
        posted_at:        postedAt,
        ingested_at:      now,
        state:            'new',
        salary_min:       salary.min,
        salary_max:       salary.max,
        employment_type:  j.employmentType || null,
        remote:           isRemote,
        summary:          truncate(j.summary || j.description || null),
        company_logo_url: j.companyLogoUrl || null,
        easy_apply:       j.easyApply != null ? Boolean(j.easyApply) : null,
        score:            j.score != null ? Number(j.score) : null,
        has_connection:   false,
        verified:         false,
      };
    })
    .filter(j => j.url); // drop records with no URL
}
