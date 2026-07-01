// Shared provider HTTP parsing helpers.
// Files prefixed with _ are never loaded as providers by scan.mjs.

export const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
  accept: 'text/html,application/xhtml+xml',
};

/**
 * Trim string values from provider payloads, returning an empty string for
 * missing or non-string fields.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Resolve an absolute or relative HTTP(S) URL and reject other protocols.
 *
 * @param {unknown} value
 * @param {string} baseUrl
 * @returns {string}
 */
export function validHttpUrl(value, baseUrl) {
  try {
    const parsed = new URL(value, baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

/**
 * Parse and normalize an HTTPS URL, throwing provider-scoped errors on invalid
 * or non-HTTPS input.
 *
 * @param {unknown} value
 * @param {string} [providerId]
 * @returns {string}
 */
export function assertHttpsUrl(value, providerId = 'provider') {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${providerId}: invalid URL: ${value}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${providerId}: URL must use HTTPS: ${value}`);
  }
  return parsed.href;
}
