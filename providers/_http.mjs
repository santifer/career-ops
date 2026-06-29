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

// Returns the raw Response (after the timeout + non-2xx guard) so providers that
// need response headers — e.g. startup.ch reads Set-Cookie to prime a session —
// can route through ctx instead of re-implementing fetch. Pass redirect:'error'
// like every other provider call so a 3xx can't be followed to a private IP.
export async function fetchResponse(url, opts = {}) {
  return await fetchWithTimeout(url, opts);
}

export function makeHttpCtx() {
  return {
    transport: 'http',
    fetchJson,
    fetchText,
    fetchResponse,
  };
}

/**
 * Convert a date value to epoch milliseconds for freshness comparisons.
 * Handles ISO 8601 strings, RFC 2822 (RSS pubDate), Unix seconds, and epoch ms.
 * Returns null for missing or unparseable values.
 */
export function toEpochMs(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    // Heuristic: values < 1e12 are Unix seconds, >= 1e12 are already ms
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  const ms = Date.parse(value);
  return isNaN(ms) ? null : ms;
}
