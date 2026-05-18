/**
 * providers/_http.mjs — minimal HTTP context for scan.mjs providers.
 *
 * Restored 2026-05-18 — the file was deleted at some point but scan.mjs still
 * imports `makeHttpCtx`, which made `node --test tests/unit/scan-parsers.test.mjs`
 * crash before a single assertion ran. Since the providers ecosystem this
 * referenced was never re-implemented (scan.mjs in its current shape calls
 * Greenhouse/Ashby/Lever APIs directly through detectApi), `makeHttpCtx` only
 * needs to return a plain object that satisfies the unused `(company, ctx)`
 * arity in `provider.fetch`. Keep it small and stable so the test runner has
 * no excuse to fail on import resolution.
 */

export function makeHttpCtx({
  userAgent = 'career-ops-scan/1.0 (+https://github.com/mitwilli-create/career-ops)',
  timeoutMs = 8000,
} = {}) {
  return {
    userAgent,
    timeoutMs,
    headers: {
      'User-Agent': userAgent,
      'Accept': 'application/json,text/html;q=0.9',
    },
    fetch: (url, opts = {}) =>
      fetch(url, {
        ...opts,
        signal: opts.signal || AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': userAgent, ...(opts.headers || {}) },
      }),
  };
}
