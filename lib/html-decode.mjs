/**
 * lib/html-decode.mjs — single HTML entity decoder.
 *
 * Replaces the four near-identical decoders that had drifted across
 * scan-rss.mjs (decodeEntities + two htmlDecode copies) and
 * signal-monitor.mjs (decodeHtmlEntities). Each only handled the
 * subset its author happened to need; URLs encoded with `&#x2F;`
 * silently failed in some callers and not others.
 *
 * Handles:
 *   - Named: &amp; &lt; &gt; &quot; &apos; &nbsp;
 *   - Decimal numeric: &#39; &#160; etc.
 *   - Hex numeric: &#x2F; &#x27; &#xA0; etc.
 *
 * Order matters: numeric entities are decoded first so that an entity
 * like `&#38;` does not produce `&` and then trigger a false re-decode
 * of an immediately-following named entity in pathological inputs.
 */

export function decodeHtmlEntities(input) {
  if (input == null) return input;
  const s = String(input);
  return s
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function safeFromCodePoint(cp) {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10FFFF) return '';
  try { return String.fromCodePoint(cp); } catch { return ''; }
}
