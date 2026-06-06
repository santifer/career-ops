/**
 * lib/ats-fetch.mjs — zero-token JD fetcher for Greenhouse / Ashby / Lever.
 *
 * Returns a normalized shape so the location gate and the LLM eval can consume any ATS:
 *   { ok, url, ats, company, title, location, workplaceType, isRemote,
 *     secondaryLocations, comp, text, error }
 *
 * Used by triage.mjs (batch scoring of scanned jobs) and openrouter-eval.mjs (--url mode).
 */

const deent = (s) => (s || '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
export const stripHtml = (h) => deent(h || '')
  .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();

const COMP_RE = /\$\s?\d{2,3}[,.]?\d{0,3}\s?[kK]?\s?[-–to]+\s?\$?\s?\d{2,3}[,.]?\d{0,3}\s?[kK]?/;
export const findComp = (t) => { const m = (t || '').match(COMP_RE); return m ? m[0].trim() : ''; };

// Company-embedded Greenhouse boards where the board token isn't in the URL.
const GH_BOARD_MAP = {
  'databricks.com': 'databricks', 'mongodb.com': 'mongodb', 'datadoghq.com': 'datadog',
  'stripe.com': 'stripe', 'boomi.com': 'boomi', 'elastic.co': 'elastic', 'helsing.ai': 'helsing',
  'coreweave.com': 'coreweave', 'snowflake.com': 'snowflake', 'gitlab.com': 'gitlab',
};

export function detectAts(url = '') {
  let m;
  if ((m = url.match(/jobs\.ashbyhq\.com\/([^/]+)\/([0-9a-f-]{36})/i)))
    return { ats: 'ashby', org: m[1], id: m[2] };
  if ((m = url.match(/jobs\.lever\.co\/([^/]+)\/([0-9a-f-]{36})/i)) ||
      (m = url.match(/api\.lever\.co\/v0\/postings\/([^/]+)\/([0-9a-f-]+)/i)))
    return { ats: 'lever', org: m[1], id: m[2] };
  // Greenhouse hosted: boards.greenhouse.io/{board}/jobs/{id} or job-boards.greenhouse.io/{board}/jobs/{id}
  if ((m = url.match(/(?:job-)?boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/)?([^/?]+)\/jobs\/(\d+)/i)))
    return { ats: 'greenhouse', board: m[1], id: m[2] };
  // Greenhouse embedded on a company domain: {company}.com/...?gh_jid={id}
  if ((m = url.match(/gh_jid=(\d+)/i))) {
    const id = m[1];
    const host = (url.match(/https?:\/\/(?:www\.)?([^/]+)/i) || [])[1] || '';
    const domain = Object.keys(GH_BOARD_MAP).find(d => host.endsWith(d));
    if (domain) return { ats: 'greenhouse', board: GH_BOARD_MAP[domain], id };
    return { ats: 'greenhouse', board: null, id }; // board unknown — caller may supply opts.board
  }
  return { ats: null };
}

async function getJson(u, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(u, { headers: { 'accept': 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      // Retry transient network failures ("fetch failed"); don't retry real HTTP errors.
      if (/^HTTP \d/.test(e.message) || i === tries - 1) throw e;
      await new Promise(res => setTimeout(res, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function fetchJob(url, opts = {}) {
  const d = detectAts(url);
  const board = opts.board || d.board;
  try {
    if (d.ats === 'ashby') {
      let bd = null;
      for (const name of [d.org, d.org[0].toUpperCase() + d.org.slice(1)]) {
        try { bd = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${name}?includeCompensation=true`); break; } catch {}
      }
      if (!bd) return { ok: false, url, ats: 'ashby', error: 'board not found' };
      const p = (bd.jobs || []).find(x => (x.jobUrl || '').includes(d.id) || (x.applyUrl || '').includes(d.id) || x.id === d.id);
      if (!p) return { ok: false, url, ats: 'ashby', error: 'posting not found' };
      const text = stripHtml(p.descriptionHtml || p.descriptionPlain || '');
      return {
        ok: true, url, ats: 'ashby', company: opts.company || d.org, title: p.title,
        location: p.location || '', workplaceType: p.workplaceType || '', isRemote: p.isRemote === true,
        secondaryLocations: (p.secondaryLocations || []).map(s => s.location).filter(Boolean),
        comp: p.compensation?.compensationTierSummary || p.compensationTierSummary || findComp(text), text,
      };
    }
    if (d.ats === 'lever') {
      const p = await getJson(`https://api.lever.co/v0/postings/${d.org}/${d.id}`);
      const text = stripHtml(p.descriptionPlain || p.description || (p.lists || []).map(l => l.content).join(' '));
      const location = p.categories?.location || (p.categories?.allLocations || []).join(' | ') || '';
      return {
        ok: true, url, ats: 'lever', company: opts.company || d.org, title: p.text,
        location, workplaceType: p.workplaceType || '', isRemote: /remote/i.test(p.workplaceType || ''),
        secondaryLocations: (p.categories?.allLocations || []).slice(1),
        comp: p.salaryRange ? `$${p.salaryRange.min}-${p.salaryRange.max}` : findComp(text), text,
      };
    }
    if (d.ats === 'greenhouse') {
      if (!board) return { ok: false, url, ats: 'greenhouse', error: 'board token unknown (embedded gh_jid)' };
      const p = await getJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${d.id}?content=true`);
      const text = stripHtml(p.content || '');
      return {
        ok: true, url, ats: 'greenhouse', company: opts.company || board, title: p.title,
        location: p.location?.name || '', workplaceType: '', isRemote: /remote/i.test(p.location?.name || ''),
        secondaryLocations: [], comp: findComp(text), text,
      };
    }
    return { ok: false, url, ats: null, error: 'unrecognized ATS url' };
  } catch (e) {
    return { ok: false, url, ats: d.ats, error: String(e.message || e).slice(0, 80) };
  }
}

// CLI: node lib/ats-fetch.mjs <url>
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  if (!url) { console.error('usage: node lib/ats-fetch.mjs <job-url>'); process.exit(1); }
  const r = await fetchJob(url);
  console.log(JSON.stringify({ ...r, text: (r.text || '').slice(0, 300) + '…' }, null, 2));
}
