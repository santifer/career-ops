/**
 * workers/csp-nonce-worker.mjs
 * Cloudflare Worker — CSP nonce injection (D20) + HSTS preload header (D24)
 *
 * WHAT THIS WORKER DOES
 * ─────────────────────
 * Sits in front of dashboard.careers-ops.com (reverse-proxies the origin).
 * On every HTML response it:
 *   1. Generates a cryptographically random per-request nonce.
 *   2. Uses HTMLRewriter to inject nonce="…" onto every inline <script> tag.
 *   3. Sets a strict Content-Security-Policy-Report-Only header (report-only
 *      for the first 7 days — flip to Content-Security-Policy when clean).
 *   4. Replaces the origin HSTS header with one that includes `preload` and
 *      a 2-year max-age (required by hstspreload.org).
 *   5. Accepts POST /csp-report from browsers and logs violations to Workers
 *      log (or optionally writes to a KV namespace).
 *
 * DEPLOY SEQUENCE
 * ───────────────
 * See workers/DEPLOY-INSTRUCTIONS.md for step-by-step wrangler commands.
 *
 * ENV VARS (set in wrangler-csp-deploy.toml or via `wrangler secret put`)
 * ────────────────────────────────────────────────────────────────────────
 *   ORIGIN_URL          Origin server URL (e.g. http://127.0.0.1:4000)
 *                       In production this should be your tunnel / private IP.
 *   CSP_ENFORCE_MODE    Set to "enforce" to switch from Report-Only to enforcing.
 *                       Leave unset (or any other value) to stay in report-only.
 *   KV_CSP_REPORTS      (Optional) KV namespace binding for persisting reports.
 *                       If absent, violations are logged only to Workers logs.
 *
 * CLOUDFLARE RUNTIME NOTES
 * ────────────────────────
 * - Uses only Web-standard APIs: crypto, HTMLRewriter, Headers, Response, Request.
 * - No Node.js built-ins (fs, path, etc.) — Cloudflare Workers runtime only.
 * - crypto.getRandomValues() is available globally in Workers (no import needed).
 */

// ── Nonce generation ─────────────────────────────────────────────────────────

/**
 * generateNonce()
 * Creates a 16-hex-char (64-bit) random nonce suitable for CSP.
 * crypto.randomUUID() is available globally in the Cloudflare Workers runtime.
 */
function generateNonce() {
  // randomUUID() returns e.g. "110e8400-e29b-41d4-a716-446655440000"
  // Strip hyphens → 32 hex chars → take first 16 for a compact nonce.
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

// ── CSP header builder ───────────────────────────────────────────────────────

/**
 * buildCSP(nonce)
 * Returns the full CSP directive string for a given nonce.
 *
 * Policy rationale:
 *   default-src 'self' https:        — allow same-origin + any HTTPS resource
 *   script-src 'self' 'nonce-{N}'    — inline scripts need the nonce; no eval
 *     'strict-dynamic'               — trusted scripts may load other scripts
 *   style-src 'self' 'unsafe-inline' — Tailwind / inline styles; no nonce on CSS yet
 *   img-src 'self' data: https:      — data: URIs for SVG/canvas + HTTPS images
 *   connect-src 'self' http://127.0.0.1:*  — dashboard polls its local server
 *   frame-ancestors 'none'           — no embedding in iframes (clickjacking)
 *   base-uri 'self'                  — prevents <base> tag hijacking
 *   form-action 'self'               — form POST only to same origin
 *   require-trusted-types-for 'script' — future-proof against DOM XSS
 */
function buildCSP(nonce) {
  const directives = [
    "default-src 'self' https:",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' http://127.0.0.1:*",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "require-trusted-types-for 'script'",
  ];
  return directives.join('; ');
}

// ── HSTS header value ────────────────────────────────────────────────────────

/**
 * HSTS_VALUE
 * 2-year max-age is the minimum required by hstspreload.org.
 * includeSubDomains covers *.careers-ops.com.
 * preload opts into browser preload lists (Chrome, Firefox, Safari).
 *
 * WARNING: Once submitted and accepted, all subdomains MUST serve HTTPS.
 * Do not add `preload` to production until you are sure every subdomain is
 * HTTPS-only (including staging, dev, etc.).
 */
const HSTS_VALUE = 'max-age=63072000; includeSubDomains; preload';

// ── HTMLRewriter handler: inject nonce onto <script> tags ────────────────────

/**
 * ScriptNonceHandler
 * HTMLRewriter element handler that adds nonce="…" to every <script> element.
 * The rewriter streams the HTML — no full DOM parse required, zero extra memory.
 */
class ScriptNonceHandler {
  constructor(nonce) {
    this.nonce = nonce;
  }

  element(el) {
    // Only inject nonce on inline scripts (no src= attribute).
    // Scripts loaded from external URLs already use the allowlisted domain.
    // For strict-dynamic: nonces on external <script src="…"> are also fine,
    // but we skip them here to avoid breaking integrity checks.
    if (!el.getAttribute('src')) {
      el.setAttribute('nonce', this.nonce);
    }
    // For external scripts, also stamp the nonce so strict-dynamic propagates
    // trust to any scripts they dynamically load.
    else {
      el.setAttribute('nonce', this.nonce);
    }
  }
}

// ── CSP violation report handler ─────────────────────────────────────────────

/**
 * handleCspReport(request, env)
 * Accepts the JSON body that browsers POST to /csp-report.
 * Logs to console.warn (visible in `wrangler tail`) and optionally persists
 * to a KV namespace (env.KV_CSP_REPORTS) if bound.
 *
 * Browser sends: Content-Type: application/csp-report
 *   { "csp-report": { "document-uri": "…", "violated-directive": "…", … } }
 */
async function handleCspReport(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const report = body['csp-report'] || body;
  const violated = report['violated-directive'] || 'unknown';
  const docUri    = report['document-uri']       || 'unknown';
  const blocked   = report['blocked-uri']         || 'unknown';

  // Always log so `wrangler tail` surfaces violations during the monitoring window.
  console.warn(`[CSP-REPORT] violated="${violated}" doc="${docUri}" blocked="${blocked}"`);

  // Persist to KV if bound (useful for aggregate analysis outside wrangler tail).
  if (env.KV_CSP_REPORTS) {
    const key = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    await env.KV_CSP_REPORTS.put(key, JSON.stringify({ ts: new Date().toISOString(), report }), {
      // Auto-expire KV entries after 30 days to avoid unbounded storage growth.
      expirationTtl: 60 * 60 * 24 * 30,
    });
  }

  // 204 No Content is the correct response for a CSP report endpoint.
  return new Response(null, { status: 204 });
}

// ── Main Worker entry point ──────────────────────────────────────────────────

export default {
  /**
   * fetch(request, env, ctx)
   * Called by Cloudflare for every incoming request.
   *
   * Flow:
   *   1. CSP report endpoint — handle and return immediately.
   *   2. All other requests — proxy to origin, then post-process HTML responses.
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ── 1. CSP report endpoint ──────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/csp-report') {
      return handleCspReport(request, env);
    }

    // ── 2. Proxy to origin ──────────────────────────────────────────────────
    //
    // ORIGIN_URL env var allows staging vs production to point at different
    // origins without code changes. Falls back to self (same hostname) if unset,
    // which is the correct behaviour when the Worker is deployed in front of a
    // Cloudflare Pages / Tunnel origin that matches the Worker route.
    const originUrl = env.ORIGIN_URL
      ? new URL(url.pathname + url.search, env.ORIGIN_URL).href
      : request.url;

    // Clone the request with the rewritten origin URL but preserve all headers
    // (including the Cloudflare Access JWT that authenticates the user).
    const originRequest = new Request(originUrl, {
      method:  request.method,
      headers: request.headers,
      body:    request.body,
      // redirect: 'follow' is Cloudflare Workers default — leave it.
    });

    let response;
    try {
      response = await fetch(originRequest);
    } catch (err) {
      // If origin is unreachable, return 502 rather than an unhandled exception.
      console.error('[CSP-WORKER] Origin fetch failed:', err.message);
      return new Response('Bad Gateway', { status: 502 });
    }

    // ── 3. Non-HTML responses — pass through with HSTS amendment only ───────
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      // Still need to update HSTS even on non-HTML responses (spec requirement:
      // HSTS must be present on ALL HTTPS responses, not just HTML).
      const passHeaders = new Headers(response.headers);
      passHeaders.set('Strict-Transport-Security', HSTS_VALUE);
      return new Response(response.body, {
        status:     response.status,
        statusText: response.statusText,
        headers:    passHeaders,
      });
    }

    // ── 4. HTML response — inject nonces + security headers ─────────────────

    const nonce = generateNonce();
    const csp   = buildCSP(nonce);

    // Decide which CSP header name to use based on enforce mode env var.
    // Default: Report-Only (safe for first 7 days of deployment).
    // To enforce: set CSP_ENFORCE_MODE=enforce in wrangler config or via secret.
    const cspHeaderName = (env.CSP_ENFORCE_MODE === 'enforce')
      ? 'Content-Security-Policy'
      : 'Content-Security-Policy-Report-Only';

    // Build mutated response headers.
    const newHeaders = new Headers(response.headers);

    // Set/replace security headers.
    newHeaders.set(cspHeaderName, `${csp}; report-uri /csp-report`);
    newHeaders.set('Strict-Transport-Security', HSTS_VALUE);

    // Remove any CSP header the origin may have set to avoid double-header
    // conflicts (the Worker's header takes precedence but some libraries merge).
    newHeaders.delete('Content-Security-Policy');
    newHeaders.delete('Content-Security-Policy-Report-Only');
    // Then re-set ours (Headers.set() already overwrites, but delete+set is
    // explicit and avoids any browser de-duplication edge cases).
    newHeaders.set(cspHeaderName, `${csp}; report-uri /csp-report`);

    // Use HTMLRewriter to stream-transform the HTML body.
    // HTMLRewriter is zero-copy: it does not buffer the full body.
    const rewriter = new HTMLRewriter()
      .on('script', new ScriptNonceHandler(nonce));

    // Apply the rewriter to the cloned response.
    const transformedResponse = rewriter.transform(
      new Response(response.body, {
        status:     response.status,
        statusText: response.statusText,
        headers:    newHeaders,
      })
    );

    return transformedResponse;
  },
};
