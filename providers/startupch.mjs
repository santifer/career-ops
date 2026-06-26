// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// startup.ch provider — the Swiss Startup Association job board. Server-rendered
// ColdFusion page; all current listings are in one HTML response (no JS board).
//
// Each listing is a `.white-box.startup-box` card with:
//   <a href="index.cfm?...&profil_id={pid}&JobID={jid}#job_{jid}">
//   <img ... alt="{Company} AG" />            <- employer
//   <h4 class="top10-title ...">{Title}</h4>  <- role
//   <p class="d-inline-flex mb-1">{City}</p>  <- location (after location.png)
//
// The href carries a per-request CFID/CFTOKEN session — we strip it and build a
// canonical, session-free URL so the dedup key is stable across scans.
//
// startup.ch has light anti-bot behaviour: it 200s an error page to bot-ish
// user agents and under bursty load. We therefore (a) send real browser
// headers, (b) prime a session cookie from the homepage first, and (c) throw a
// descriptive error if the error page comes back — so the scan logs it (visible,
// retried next run) instead of silently reporting zero jobs.
//
// Auto-detects from a careers_url whose host is startup.ch.

const HOME_URL = 'https://www.startup.ch/';
const LIST_URL = 'https://www.startup.ch/jobs';
const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9,de;q=0.8',
};

function decodeEntities(s) {
  // Unescape `&amp;` LAST so it can't double-unescape entities produced by the
  // other replacements (CodeQL: double escaping/unescaping).
  return s
    .replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"').replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö')
    .replace(/&uuml;/g, 'ü').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').trim();
}

async function fetchWithTimeout(url, headers, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 300);
      throw new Error(snippet ? `HTTP ${res.status}: ${snippet}` : `HTTP ${res.status}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** @type {Provider} */
export default {
  id: 'startupch',

  detect(entry) {
    let host;
    try { host = new URL(entry.careers_url || '').hostname; } catch { return null; }
    return /(^|\.)startup\.ch$/i.test(host) ? { url: LIST_URL } : null;
  },

  async fetch(entry /* , ctx */) {
    // Prime a CFID/CFTOKEN session from the homepage (best-effort).
    let cookie = '';
    try {
      const home = await fetchWithTimeout(HOME_URL, BROWSER_HEADERS);
      const setCookies = typeof home.headers.getSetCookie === 'function'
        ? home.headers.getSetCookie()
        : [home.headers.get('set-cookie')].filter(Boolean);
      cookie = setCookies.map(c => c.split(';')[0]).join('; ');
    } catch { /* proceed without a primed cookie */ }

    const res = await fetchWithTimeout(LIST_URL, { ...BROWSER_HEADERS, ...(cookie ? { cookie } : {}) });
    const html = await res.text();

    const chunks = html.split(/white-box startup-box/i).slice(1);
    if (chunks.length === 0) {
      // Distinguish the anti-bot/error page from a genuinely empty board so the
      // scan surfaces it rather than silently reporting zero.
      if (/unerwarteter Fehler|<title>\s*Error\s*<\/title>/i.test(html)) {
        throw new Error('startup.ch returned an error/anti-bot page (likely rate-limited) — retry next scan');
      }
      return [];
    }

    const out = [];
    const seen = new Set();
    for (const chunk of chunks) {
      const card = chunk.slice(0, 2000);
      const jid = card.match(/JobID=(\d+)/)?.[1];
      if (!jid || seen.has(jid)) continue;
      const pid = card.match(/profil_id=(\d+)/)?.[1] || '';
      const title = card.match(/<h4[^>]*top10-title[^>]*>([^<]+)<\/h4>/i)?.[1];
      if (!title) continue;
      const company = (card.match(/alt="([^"]+)"/i)?.[1] || entry.name || '').trim();
      const location = card.match(/location\.png[\s\S]{0,160}?<p[^>]*>([^<]+)<\/p>/i)?.[1] || '';
      seen.add(jid);
      out.push({
        title: decodeEntities(title),
        url: `https://www.startup.ch/index.cfm?page=137888${pid ? `&profil_id=${pid}` : ''}&JobID=${jid}`,
        company: decodeEntities(company),
        location: decodeEntities(location),
      });
    }
    return out;
  },
};
