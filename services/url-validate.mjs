// services/url-validate.mjs
// SSRF-safe URL validation per spec §4.1 step 4 + §8.5.
// Pure function; no I/O.

const MAX_LEN = 2048;
const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

// RFC1918 + loopback + link-local CIDR membership tests (IPv4 only — we don't accept IPv6 hosts).
function isPrivateIPv4(host) {
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = m.slice(1).map(Number);
  if (a === 0) return true;                                    // 0.0.0.0/8 — SSRF bypass
  if (a === 10) return true;                                   // 10.0.0.0/8
  if (a === 127) return true;                                  // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;                     // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true;            // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                     // 192.168.0.0/16
  return false;
}

export function validateUrl(input) {
  if (typeof input !== 'string' || !input) return { ok: false, error: 'empty input' };
  if (input.length > MAX_LEN) return { ok: false, error: `length > ${MAX_LEN}` };
  let u;
  try { u = new URL(input); } catch { return { ok: false, error: 'malformed URL' }; }
  if (u.username || u.password) return { ok: false, error: 'credential injection (@) not allowed' };
  if (!ALLOWED_SCHEMES.has(u.protocol)) return { ok: false, error: `scheme ${u.protocol} not allowed` };
  if (u.port === '0') return { ok: false, error: 'invalid port 0' };
  const host = u.hostname.toLowerCase();
  if (host.startsWith('[')) return { ok: false, error: 'IPv6 host not allowed' };
  if (host === '255.255.255.255') return { ok: false, error: 'broadcast host not allowed' };
  if (host === 'localhost') return { ok: false, error: 'loopback host not allowed' };
  if (isPrivateIPv4(host)) return { ok: false, error: 'private/loopback/link-local host not allowed' };
  return { ok: true };
}
