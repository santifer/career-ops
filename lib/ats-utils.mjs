// Canonical company-name normalizer for dedup/merge keys.
// Lowercases, strips corporate suffixes, strips all non-alphanumerics
// (incl. spaces and hyphens), so "OpenAI, Inc." / "Open AI" / "open-ai"
// all collapse to "openai".
export function normalizeCompany(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/,?\s*(inc|llc|ltd|corp|corporation|co)\b\.?/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Extracts a human-readable company slug from an ATS job URL.
// Returns the slug for Greenhouse/Ashby/Lever (with "-" → " " for display),
// the tenant for Workday, "amazon" for amazon.jobs, or a hostname-derived
// fallback. Behavior matches the previous batch-runner-batches.mjs version
// — it's the more useful of the two prior implementations.
export function guessCompany(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');

    if (host.includes('greenhouse.io')) {
      const m = u.pathname.match(/^\/([^/]+)/);
      if (m) return m[1].replace(/-/g, ' ');
    }
    if (host.includes('ashbyhq.com')) {
      const m = u.pathname.match(/^\/([^/]+)/);
      if (m) return m[1].replace(/-/g, ' ');
    }
    if (host.includes('lever.co')) {
      const m = u.pathname.match(/^\/([^/]+)/);
      if (m) return m[1].replace(/-/g, ' ');
    }

    // Amazon: amazon.jobs/en/jobs/...
    if (host === 'amazon.jobs') return 'amazon';

    // Workday tenants: {tenant}.wd5.myworkdayjobs.com → tenant is the brand
    if (host.endsWith('myworkdayjobs.com')) {
      return host.split('.')[0];
    }

    // Fallback: strip common TLDs from the hostname
    return host.replace(/\.(com|io|ai|co|jobs)$/, '');
  } catch {
    return 'unknown';
  }
}

// ── --companies filtering helpers ──────────────────────────────────────────
//
// `apply-now-queue.json` stores display names ("Mistral AI", "Cursor
// (Anysphere)"). `guessCompany(url)` returns URL slugs ("mistral", "anysphere").
// Matching uses normalizeCompany() + this alias map symmetrically on both
// sides so we never depend on slug == display.
//
// Add entries here as new mismatches surface. Identity entries are not needed —
// canonicalCompanyKey returns the normalized form by default.
export const COMPANY_SLUG_ALIASES = {
  mistralai:       'mistral',
  cursoranysphere: 'anysphere',
};

// Returns the canonical key for matching. Empty input → empty string.
export function canonicalCompanyKey(name) {
  if (!name) return '';
  const norm = normalizeCompany(name);
  return COMPANY_SLUG_ALIASES[norm] ?? norm;
}

// Parses a --companies CLI value (array or CSV string) into a deduped list of
// trimmed names. Empty / whitespace-only input → [].
export function parseCompanyFilter(value) {
  if (value === undefined || value === null || value === false) return [];
  const arr = Array.isArray(value) ? value : String(value).split(',');
  return arr.map(s => String(s ?? '').trim()).filter(Boolean);
}

/**
 * Builds a URL-level company filter from a list of display names.
 *
 * Empty / whitespace → matcher accepts ALL URLs (isActive=false pass-through).
 * Matching is exact-equality on canonicalCompanyKey applied to both sides —
 * no substring (would false-positive "openai" ⊂ "openaihealth"), no fuzzy
 * (would false-positive distance-1 collisions like "meta" vs "mesa").
 *
 * @param {string[]|string|undefined} names
 * @returns {{
 *   isActive: boolean,
 *   selectedKeys: Set<string>,
 *   matchesUrl: (url: string) => boolean,
 *   matchesCompanyName: (name: string) => boolean,
 *   describe: () => string
 * }}
 */
export function buildCompanyMatcher(names) {
  const parsed = parseCompanyFilter(names);
  const selectedKeys = new Set(parsed.map(canonicalCompanyKey).filter(Boolean));
  const isActive = selectedKeys.size > 0;
  return {
    isActive,
    selectedKeys,
    matchesUrl: (url) => isActive ? selectedKeys.has(canonicalCompanyKey(guessCompany(url))) : true,
    matchesCompanyName: (name) => isActive ? selectedKeys.has(canonicalCompanyKey(name)) : true,
    describe: () => isActive ? Array.from(selectedKeys).join(',') : 'all companies',
  };
}
