// @ts-check
/**
 * liveness-api.mjs — zero-token liveness check for ATS-hosted job postings.
 *
 * Many postings live on ATS platforms (Greenhouse, Lever, ...) that expose a
 * public per-job JSON endpoint. We can confirm whether a posting is still live by
 * hitting that endpoint directly — no browser, no LLM tokens — and only fall back
 * to the Playwright check (liveness-browser.mjs) for non-ATS pages or when the API
 * is inconclusive. This is the cheap first rung of the liveness ladder.
 *
 * CONSERVATIVE BY DESIGN: a false "expired" is worse than the status quo (the user
 * misses a real job). So this returns `expired` ONLY on a definitive 404/410,
 * `active` ONLY on a 200, and `null` (→ caller falls back to Playwright) for
 * anything ambiguous (unknown ATS, redirect, 429/5xx, network/timeout).
 *
 * SSRF-safe by construction: the request URL is built from a FIXED, hard-coded API
 * host plus path segments extracted from the posting URL with a strict charset
 * (no slashes / traversal), and server-side redirects are refused.
 */

const TIMEOUT_MS = 8_000;
// Strict path-segment charset. Anything with a slash, dot-dot, or other char is
// rejected before it can reach the fixed-host API URL template.
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

// Each ATS: detect its posting URL, then map to the public per-job API URL.
// `match` returns the extracted path params (or null); `api` builds the FIXED-host URL.
const ATS_PROVIDERS = [
  {
    id: 'greenhouse',
    // boards.greenhouse.io/{board}/jobs/{id} · job-boards[.eu].greenhouse.io/{board}/jobs/{id}
    match(u) {
      if (!/(^|\.)greenhouse\.io$/.test(u.hostname)) return null;
      const m = u.pathname.match(/^\/([^/]+)\/jobs\/(\d+)\/?$/);
      return m ? { board: m[1], id: m[2] } : null;
    },
    api: ({ board, id }) => `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`,
  },
  {
    id: 'lever',
    // jobs.lever.co/{slug}/{id}
    match(u) {
      if (u.hostname !== 'jobs.lever.co') return null;
      const m = u.pathname.match(/^\/([^/]+)\/([^/?#]+)\/?$/);
      return m ? { slug: m[1], id: m[2] } : null;
    },
    api: ({ slug, id }) => `https://api.lever.co/v0/postings/${slug}/${id}`,
  },
];

/**
 * Map a posting URL to its ATS per-job API URL, or null if it isn't a known ATS
 * posting (or any extracted segment fails the strict charset). Pure + deterministic.
 * @param {string} rawUrl
 * @returns {{ ats: string, apiUrl: string } | null}
 */
export function resolveAtsApi(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  for (const provider of ATS_PROVIDERS) {
    const parts = provider.match(u);
    if (!parts) continue;
    // SSRF guard: every derived segment must be a single safe path segment.
    if (!Object.values(parts).every((v) => SAFE_SEGMENT.test(v) && !v.includes('..'))) return null;
    return { ats: provider.id, apiUrl: provider.api(parts) };
  }
  return null;
}

/** True if `url` is an ATS posting we can check via API (lets callers stay lazy about the browser). */
export function isAtsPosting(url) {
  return resolveAtsApi(url) !== null;
}

/**
 * Zero-token liveness check via the posting's ATS API.
 * @param {string} url
 * @returns {Promise<{ result: 'active' | 'expired', code: string, reason: string } | null>}
 *   null = not a known ATS posting, or inconclusive → caller should fall back to Playwright.
 */
export async function checkLivenessViaApi(url) {
  const resolved = resolveAtsApi(url);
  if (!resolved) return null;
  const { ats, apiUrl } = resolved;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'user-agent': 'career-ops-liveness/1.0', accept: 'application/json' },
      redirect: 'error', // refuse server-side redirects (SSRF + ambiguity guard)
      signal: controller.signal,
    });
  } catch {
    return null; // network / timeout / redirect → inconclusive, let Playwright decide
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404 || res.status === 410) {
    return { result: 'expired', code: `${ats}_api_gone`, reason: `ATS API ${res.status} — posting removed` };
  }
  if (res.status === 200) {
    return { result: 'active', code: `${ats}_api_ok`, reason: 'ATS API returns the posting (live)' };
  }
  return null; // 429/5xx/other → inconclusive, fall back to the browser check
}
