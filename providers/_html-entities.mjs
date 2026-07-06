// @ts-check
// Minimal HTML entity decoder shared by the scraping providers whose sources
// return raw HTML (as opposed to a JSON API). Handles named entities (&amp;,
// &lt;, …) and numeric entities (&#252; / &#xfc;).
//
// Previously duplicated verbatim across successfactors.mjs, dassault.mjs,
// softgarden.mjs, and rheinmetall.mjs — the numeric-entity range guard drifted
// out of sync between copies (some checked only Number.isFinite, which still
// lets String.fromCodePoint throw a RangeError for a code point outside
// 0..0x10FFFF or a lone surrogate half, e.g. from `&#xD800;` or
// `&#99999999;`). A single malformed/adversarial numeric entity in a job title
// would crash the entire parse for that provider. Centralized here so the
// guard can't diverge again.

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** @param {string} s */
export function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      const valid = Number.isFinite(code) && code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return valid ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}
