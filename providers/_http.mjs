// HTTP transport helpers shared across providers.
// Files prefixed with _ are never loaded as providers by scan.mjs.

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; career-ops/1.3)';

async function fetchWithTimeout(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, method = 'GET', body = null, redirect = 'follow' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'user-agent': DEFAULT_USER_AGENT, ...headers },
      body,
      redirect,
      signal: controller.signal,
    });
    if (!res.ok) {
      const responseText = await res.text().catch(() => '');
      const snippet = responseText.replace(/\s+/g, ' ').trim().slice(0, 300);
      const err = new Error(snippet ? `HTTP ${res.status}: ${snippet}` : `HTTP ${res.status}`);
      err.status = res.status;
      err.body = responseText;
      throw err;
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts);
  return await res.json();
}

export async function fetchText(url, opts = {}) {
  const res = await fetchWithTimeout(url, opts);
  return await res.text();
}

export function makeHttpCtx() {
  return {
    transport: 'http',
    fetchJson,
    fetchText,
  };
}

// Normalize a posting date to epoch milliseconds (or null if absent/unparseable).
// Accepts ISO strings ("2026-05-22T16:05:41-04:00"), epoch seconds (~1.7e9),
// and epoch milliseconds (~1.7e12). Used by providers to populate Job.posted_at
// so scan.mjs can apply the freshness_filter uniformly. null = "no date" = keep.
export function toEpochMs(value) {
  if (value == null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 1e12 ? value * 1000 : value; // < 1e12 ⇒ seconds
  }
  if (typeof value === 'string') {
    const s = value.trim();
    // Numeric timestamp strings ("1710000000" / "1710000000000") — Date.parse
    // would return NaN for these, so handle them like the numeric branch.
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n < 1e12 ? n * 1000 : n;
    }
    const t = Date.parse(s);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}
