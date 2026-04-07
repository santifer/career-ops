// Cross-source deduplication for career-ops intelligence engine.
// URL exact match + normalized company+title fuzzy match.

const COMPANY_SUFFIXES = /[,.]?\s*\b(Inc|Ltd|GmbH|LLC|Corp|Co|PLC|SA|AG|SE)\.?\b/gi;
const SENIORITY_PREFIX = /^(Senior|Staff|Principal|Lead|Head|Junior|Intern|Associate|Founding)\s+/i;
const LOCATION_SUFFIX = /\s*(\(.*?\)|\s*[-–—]\s+.*|\s*,\s+\S+.*)$/;

/**
 * Normalize a company name for dedup comparison.
 * Lowercase, strip legal suffixes, remove non-alphanumeric, trim.
 */
export function normalizeCompany(name) {
  if (!name) return '';
  let n = name.replace(COMPANY_SUFFIXES, '');
  n = n.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  return n;
}

/**
 * Normalize a job title for dedup comparison.
 * Lowercase, strip seniority prefixes, strip location suffixes, trim.
 */
export function normalizeTitle(title) {
  if (!title) return '';
  let t = title.trim();
  // Strip location suffixes first (parens, dash, comma)
  t = t.replace(LOCATION_SUFFIX, '');
  // Lowercase
  t = t.toLowerCase();
  // Strip seniority prefix
  t = t.replace(SENIORITY_PREFIX, '');
  return t.trim();
}

/**
 * Check if a prospect is a duplicate of any existing entry.
 * Match on exact URL or normalized company+title.
 */
export function isDuplicate(prospect, existing) {
  for (const entry of existing) {
    // Exact URL match
    if (prospect.url && entry.url && prospect.url === entry.url) return true;
    // Normalized company+title match
    if (
      normalizeCompany(prospect.company) === normalizeCompany(entry.company) &&
      normalizeTitle(prospect.title) === normalizeTitle(entry.title)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Deduplicate a list of items, optionally against existing entries.
 * Keeps first occurrence.
 */
export function dedup(items, existing = []) {
  const seen = [];
  const results = [];
  for (const item of items) {
    if (isDuplicate(item, [...existing, ...seen])) continue;
    seen.push(item);
    results.push(item);
  }
  return results;
}
