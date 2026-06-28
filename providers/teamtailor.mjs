// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Teamtailor provider — hits the public, no-auth RSS jobs feed at
// `https://<slug>.teamtailor.com/jobs.rss`. Teamtailor's JSON API requires an
// API token, but every career site exposes this zero-auth RSS feed with the
// full posting list (title, link, location, department, pubDate).
//
// Auto-detects from a `<slug>.teamtailor.com` careers host like personio. Per-
// tenant subdomains are the variable part, so the SSRF defence is an anchored
// host regex rather than a static allowlist. The tenant label must be a valid
// DNS label — it may contain internal hyphens but must not start or end with
// one (so `acme-.teamtailor.com` is rejected); the optional trailing group
// keeps single-character labels valid.
//
// The feed is a flat RSS document, so it is parsed in-process with a tiny tag
// extractor (no new dependency — the repo ships none for XML).

const TEAMTAILOR_HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.teamtailor\.com$/;

/** @param {string} url */
function assertTeamtailorUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`teamtailor: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`teamtailor: URL must use HTTPS: ${url}`);
  if (!TEAMTAILOR_HOST_RE.test(parsed.hostname))
    throw new Error(`teamtailor: untrusted hostname "${parsed.hostname}" — must match <slug>.teamtailor.com`);
  return url;
}

/**
 * Resolve the tenant host (e.g. `acme.teamtailor.com`) from a careers_url.
 * Returns null for non-Teamtailor or malformed URLs.
 * @param {import('./_types.js').PortalEntry} entry
 */
function resolveHost(entry) {
  const raw = typeof entry.careers_url === 'string' ? entry.careers_url : '';
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!TEAMTAILOR_HOST_RE.test(parsed.hostname)) return null;
  return parsed.hostname;
}

// NaN-safe Date.parse — `|| undefined` would also coerce a valid epoch 0.
function toEpochMs(value) {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** @type {Provider} */
export default {
  id: 'teamtailor',

  detect(entry) {
    const host = resolveHost(entry);
    return host ? { url: `https://${host}/jobs.rss` } : null;
  },

  async fetch(entry, ctx) {
    const host = resolveHost(entry);
    if (!host) throw new Error(`teamtailor: cannot derive feed URL for ${entry.name}`);
    const feedUrl = `https://${host}/jobs.rss`;
    assertTeamtailorUrl(feedUrl);
    // redirect:'error' prevents SSRF via server-side redirects; combined with
    // assertTeamtailorUrl above it guarantees the final hostname stays in-domain.
    const text = await ctx.fetchText(feedUrl, { redirect: 'error' });
    return parseTeamtailorRss(text, entry.name);
  },
};

function fromCodePoint(cp) {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return '';
  }
}

// Decode the XML entities that appear in Teamtailor job text: numeric (&#38; /
// &#x27;) and the named five. Numeric forms are decoded first; &amp; is decoded
// LAST so a literal "&amp;lt;" yields "&lt;" rather than over-decoding to "<".
function decodeXmlEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// Resolve a tag's inner text: unwrap a CDATA section, else decode entities.
function extractText(inner) {
  const cdata = inner.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) return cdata[1].trim();
  return decodeXmlEntities(inner).trim();
}

// Extract the text of the first <tag>…</tag> in a block. Returns '' when absent.
// `tag` may be namespaced (e.g. `tt:name`); the colon is a literal in the regex.
function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? extractText(m[1]) : '';
}

/**
 * Parse Teamtailor's public RSS jobs feed. Exported for unit tests.
 *
 * Shape: `<rss><channel><title>Company</title>…<item>…</item>…</channel></rss>`,
 * each `<item>` carrying `<title>`, `<link>`, `<pubDate>` (RFC 822), an HTML
 * `<description>`, and a `<tt:locations><tt:location>` block with `<tt:name>`,
 * `<tt:city>`, `<tt:country>`, `<tt:department>` (the `tt:` namespace is
 * `https://teamtailor.com/locations`).
 *
 * Field mapping → the normalized Job shape:
 *   - title:    `<title>`, entity-decoded (items without one are dropped).
 *   - url:      `<link>` — an absolute posting URL. Teamtailor career sites can
 *               run on a custom domain, so it is NOT host-locked; the requirement
 *               is a well-formed `https:` URL. It is the dedup key, so an item
 *               without one is dropped. url is display-only (written to the
 *               pipeline/history, never server-fetched here).
 *   - company:  the channel `<title>` (the company's own name), falling back to
 *               the portal entry name when the channel omits it.
 *   - location: every `<tt:name>` in the item (primary + extra locations),
 *               de-duplicated and joined with ", "; falls back to assembling the
 *               first location's `<tt:city>` / `<tt:country>` when no name.
 *   - postedAt: `<pubDate>` → epoch ms (omitted when unparseable/absent).
 *
 * @param {string} xml — raw RSS feed body
 * @param {string} companyName — fallback value written into job.company
 * @returns {Array<{title: string, url: string, company: string, location: string, postedAt?: number}>}
 */
export function parseTeamtailorRss(xml, companyName) {
  if (typeof xml !== 'string') return [];

  // The company name is the channel <title>; read it from the channel header
  // (everything before the first <item>) so it can't be shadowed by an item's
  // own <title>. Fall back to the portal entry name.
  const channelHead = xml.split(/<item\b/)[0];
  const company = tagText(channelHead, 'title') || companyName || '';

  // Strip <description> subtrees from the whole feed before splitting into
  // <item> blocks: descriptions are large HTML blobs we don't map, and dropping
  // them keeps the non-greedy block match cheap and robust.
  const stripped = xml.replace(/<description\b[^>]*>[\s\S]*?<\/description>/gi, '');
  const blocks = stripped.match(/<item\b[^>]*>[\s\S]*?<\/item>/g) || [];

  const jobs = [];
  for (const item of blocks) {
    const title = tagText(item, 'title');
    if (!title) continue;

    // url: require a well-formed https: URL (display-only; custom domains allowed).
    let url = '';
    const rawUrl = tagText(item, 'link');
    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol === 'https:') url = parsed.href;
      } catch {
        // malformed URL → leave url = '' → dropped below
      }
    }
    if (!url) continue;

    // location: collect every <tt:name> (primary + extra locations), de-dupe.
    const names = [];
    const seen = new Set();
    for (const m of item.matchAll(/<tt:name\b[^>]*>([\s\S]*?)<\/tt:name>/g)) {
      const name = extractText(m[1]);
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
    let location = names.join(', ');
    if (!location) {
      const city = tagText(item, 'tt:city');
      const country = tagText(item, 'tt:country');
      location = [city, country].filter(Boolean).join(', ');
    }

    jobs.push({
      title,
      url,
      location,
      company,
      postedAt: toEpochMs(tagText(item, 'pubDate')),
    });
  }
  return jobs;
}
