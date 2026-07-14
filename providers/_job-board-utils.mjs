// Shared helpers for public job-board providers.
// Files prefixed with _ are never loaded as providers by scan.mjs.

export const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (compatible; career-ops/1.16; +https://github.com/santifer/career-ops)',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9,da;q=0.8',
};

export function numericEntity(cp) {
  return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
}

export function decodeEntities(text = '') {
  return String(text)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export function stripTags(html = '') {
  return decodeEntities(String(html).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanText(value) {
  return decodeEntities(String(value ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
}

export function tagText(block, tag) {
  const match = String(block || '').match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!match) return '';
  const inner = match[1];
  const cdata = inner.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata ? cdata[1].trim() : cleanText(inner);
}

export function toEpochMs(value) {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function ensureHttpsUrl(value, { hostnames } = {}) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const parsed = new URL(decodeEntities(value.trim()));
    if (parsed.protocol !== 'https:') return '';
    if (Array.isArray(hostnames) && hostnames.length && !hostnames.includes(parsed.hostname)) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

export function positiveInt(value, fallback, { min = 1, max = 100 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function appendParam(params, key, value) {
  if (value === undefined || value === null || value === '') return;
  if (Array.isArray(value)) {
    for (const item of value) appendParam(params, key, item);
    return;
  }
  params.append(key, String(value));
}

export function requireSearchValue(entry, key, providerId) {
  const value = entry?.[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${providerId}: "${key}" is required`);
}
