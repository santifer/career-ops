/**
 * liveness-http.mjs — HTTP-only (no browser) liveness check for a single URL.
 *
 * Used by the cron eviction path (queue-ingest.mjs --evict). Reuses the pure
 * classifyLiveness core and the SSRF guard from liveness-browser.mjs without
 * pulling in any Playwright dependency.
 *
 * Return shape: { result, code, reason }
 *   result — 'active' | 'expired' | 'uncertain'
 *   code   — stable machine code (e.g. 'http_gone', 'expired_body', 'fetch_error')
 *   reason — human-readable string
 *
 * Note: with no browser to evaluate JS, applyControls is always empty. A live
 * SPA posting that renders purely client-side will land on 'uncertain'
 * (no_apply_control) rather than 'active' — the cron eviction path treats
 * 'uncertain' as "keep", so live SPA postings are never wrongly evicted.
 *
 * Only pre-apply-control expired signals (http_gone, expired_url, expired_body)
 * trigger eviction. 'listing_page', 'insufficient_content', and all 'uncertain'
 * verdicts are kept because HTTP cannot see visible Apply controls.
 */

import { classifyLiveness } from './liveness-core.mjs';
import { rejectPrivateOrInvalid, LIVENESS_CONTEXT_OPTIONS } from './liveness-browser.mjs';

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * HTTP-level liveness check for a single URL.
 * Never throws: network errors, timeouts, and SSRF guard rejections all return
 * result='uncertain' so the cron never evicts on a transient failure.
 *
 * Unlike providers/_http.mjs:fetchText, this does NOT throw on non-2xx responses —
 * 404/410/403/503 are exactly the HTTP signals classifyLiveness keys on.
 *
 * @param {string} url
 * @param {{ timeoutMs?: number }} opts
 * @returns {Promise<{ result: string, code: string, reason: string }>}
 */
export async function checkUrlLivenessHttp(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  // SSRF guard — reject private/loopback/non-http(s) hosts before any network call.
  const guard = rejectPrivateOrInvalid(url);
  if (guard) {
    return { result: 'uncertain', code: guard.code, reason: guard.reason };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': LIVENESS_CONTEXT_OPTIONS.userAgent },
    });
  } catch (e) {
    clearTimeout(timer);
    const reason = e.name === 'AbortError' ? 'request timed out' : String(e.message);
    return { result: 'uncertain', code: 'fetch_error', reason };
  }
  clearTimeout(timer);

  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch {
    // Body read failed (e.g. connection reset after headers). Classify on what we have.
  }

  return classifyLiveness({
    status: res.status,
    finalUrl: res.url,
    bodyText,
    // applyControls: omitted — HTTP cannot evaluate JS-rendered controls.
  });
}
