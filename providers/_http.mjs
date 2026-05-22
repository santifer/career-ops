/**
 * _http.mjs — Shared HTTP helper for provider plugins.
 * Files prefixed with _ are never loaded as providers by scan.mjs.
 *
 * makeHttpCtx() returns { get(url, opts?), post(url, body, opts?) }.
 * Both methods return parsed JSON and throw on non-2xx responses.
 * Requires Node.js 18+ (global fetch).
 */

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; career-ops-scanner/1.0; +https://github.com/santifer/career-ops)',
  'Accept': 'application/json',
};

const DEFAULT_TIMEOUT_MS = 20_000;

export function makeHttpCtx() {
  async function request(url, options = {}) {
    const { headers = {}, timeout = DEFAULT_TIMEOUT_MS, ...rest } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        ...rest,
        headers: { ...DEFAULT_HEADERS, ...headers },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
      }
      return res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get(url, options = {}) {
      return request(url, { method: 'GET', ...options });
    },

    post(url, body, options = {}) {
      return request(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
      });
    },
  };
}
