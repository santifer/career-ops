/**
 * dashboard-web/lib/gmail-status.mjs — Pure helper for /api/gmail/status.
 *
 * Builds a structured snapshot of the Gmail integration state without
 * touching module globals. Pulled out of server.mjs so the diagnostic
 * shape can be unit-tested without booting the HTTP stack.
 */

/**
 * @param {Object} input
 * @param {string} [input.clientId]      GMAIL_CLIENT_ID
 * @param {string} [input.clientSecret]  GMAIL_CLIENT_SECRET
 * @param {string} input.scope           OAuth scope string
 * @param {string} input.redirectUri     Configured redirect URI
 * @param {Object|null} input.tokens     Saved OAuth tokens or null
 * @param {boolean} input.polling        Whether the scan timer is active
 * @param {boolean} input.fastPolling    Whether the fast 15s loop is active
 * @param {Object} input.cache           gmailCache snapshot
 * @param {number} [input.now]           Optional clock override (test only)
 * @returns {Object} structured status payload — same shape /api/gmail/status emits
 */
export function buildGmailStatus({
  clientId,
  clientSecret,
  scope,
  redirectUri,
  tokens,
  polling,
  fastPolling,
  cache,
  now,
}) {
  const t = now ?? Date.now();
  const hasClientId = Boolean(clientId);
  const hasClientSecret = Boolean(clientSecret);
  const configured = hasClientId && hasClientSecret;
  const hasTokens = Boolean(tokens && tokens.refresh_token);
  const tokenExpired = hasTokens
    ? Boolean(tokens.expiry && t > tokens.expiry)
    : null;
  const tokenExpiresIn = hasTokens && tokens.expiry
    ? Math.max(0, Math.floor((tokens.expiry - t) / 1000))
    : null;
  const signals = (cache && Array.isArray(cache.signals)) ? cache.signals : [];
  const missingEnv = [
    hasClientId ? null : 'GMAIL_CLIENT_ID',
    hasClientSecret ? null : 'GMAIL_CLIENT_SECRET',
  ].filter(Boolean);
  return {
    configured,
    hasClientId,
    hasClientSecret,
    hasTokens,
    tokenExpired,
    tokenExpiresIn,
    polling: Boolean(polling),
    fastPolling: Boolean(fastPolling),
    scope: scope || '',
    redirectUri: redirectUri || '',
    lastScannedAt: cache?.scanned_at || null,
    cachedSignalCount: signals.length,
    activeSignalCount: signals.filter(s => !s.dismissed).length,
    missingEnv,
  };
}
