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
