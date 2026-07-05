// Shared RSS/XML parsing utilities used by providers that consume public job
// RSS feeds (nodesk, personio, teamtailor, wellfound). Extracted here to avoid
// duplicating ~80 lines of identical entity-decoding and tag-extraction logic
// across each provider file.
//
// Files prefixed with _ are never loaded as providers by scan.mjs.
//
// Nothing in this file performs network I/O; providers own their fetch() logic
// and call these helpers to parse the text they receive.

// Entity decoding
function fromCodePoint(cp) {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return '';
  }
}

/**
 * Decode the XML/HTML entities that appear in RSS feed text.
 *
 * Decoding order matters:
 *   1. Numeric hex  (&#x26; → &)
 *   2. Numeric dec  (&#38;  → &)
 *   3. Named five   (&lt; &gt; &quot; &apos;)
 *   4. &amp; LAST   — so "&amp;lt;" yields "&lt;" rather than double-decoding to "<"
 *
 * @param {string} s
 * @returns {string}
 */
export function decodeXmlEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Tag extraction

/**
 * Resolve a tag's inner text: unwrap a CDATA section, else decode entities.
 *
 * @param {string} inner - raw content between opening and closing tag
 * @returns {string}
 */
export function extractText(inner) {
  const cdata = inner.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) return cdata[1].trim();
  return decodeXmlEntities(inner).trim();
}

/**
 * Extract the inner text of the first `<tag>…</tag>` occurrence in a block.
 * Tag names may contain a namespace colon (e.g. `tt:city`). Returns `''` when
 * the tag is absent.
 *
 * @param {string} block - XML/RSS block to search within
 * @param {string} tag   - tag name (may include namespace prefix)
 * @returns {string}
 */
export function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? extractText(m[1]) : '';
}

// Helpers shared across multiple providers

/**
 * NaN-safe Date.parse → epoch ms. Returns `undefined` for missing or
 * unparseable values (avoids the `|| undefined` pitfall that coerces epoch 0).
 *
 * @param {string | undefined | null} value
 * @returns {number | undefined}
 */
export function toEpochMs(value) {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Accept only absolute HTTPS URLs. Returns `''` for anything else.
 *
 * @param {string | undefined | null} value
 * @returns {string}
 */
export function cleanHttpsUrl(value) {
  if (!value) return '';
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

/**
 * Split all `<item>…</item>` blocks out of an RSS/XML string.
 * Returns an empty array when the feed contains no items.
 *
 * @param {string} xml
 * @returns {string[]}
 */
export function splitItems(xml) {
  if (typeof xml !== 'string') return [];
  return xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || [];
}
