// @ts-check

/**
 * Returns true only for public http/https URLs — blocks loopback, private
 * ranges, and link/unique-local IPv6 to prevent SSRF from user-supplied URLs.
 *
 * @param {string} rawUrl
 * @returns {boolean}
 */
export function isSafeUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return false; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const h = parsed.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (h === 'localhost') return false;
  if (/^(127|10)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\.|^0\./.test(h)) return false;
  // IPv6: loopback, unspecified, link-local (fe80::/10), unique-local (fc00::/7)
  if (h === '::1' || h === '::') return false;
  if (/^fe[89ab]/i.test(h) || /^f[cd]/i.test(h)) return false;
  // IPv4-mapped IPv6 — Node.js URL hex-encodes octets: ::ffff:7f00:1 = 127.0.0.1
  const m = h.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/i);
  if (m) {
    const a = parseInt(m[1], 16);
    const [o1, o2] = [(a >> 8) & 0xff, a & 0xff];
    if (o1 === 127 || o1 === 10 || o1 === 0) return false;
    if ((o1 === 192 && o2 === 168) || (o1 === 172 && o2 >= 16 && o2 <= 31)) return false;
    if (o1 === 169 && o2 === 254) return false;
  }
  return true;
}
