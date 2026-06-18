// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Arbeitsagentur (Bundesagentur für Arbeit) provider — hits the public Jobsuche
// REST API (the same endpoint arbeitsagentur.de uses), so it lives in-process
// alongside the other JSON-API providers (greenhouse/ashby shape). One or more
// keywords are queried; scan.mjs applies title_filter + location_filter + dedup
// afterwards, so this provider over-fetches (recall-first).
//
// Configure via a `job_boards` (or `tracked_companies`) entry with
// `provider: arbeitsagentur` and an `arbeitsagentur:` block:
//
//   - name: Arbeitsagentur — ML/KI Deutschland
//     provider: arbeitsagentur
//     arbeitsagentur:
//       keywords: ["Machine Learning Engineer", "Data Scientist"]  # required
//       wo: Berlin              # optional anchor city; omit for nationwide
//       umkreis: 50             # km radius around `wo` (default 50)
//       days: 30                # recency window in days (default 30)
//       size: 100               # results per keyword (1–100, default 100)
//       remoteNationwide: true  # also run a nationwide pass keeping remote-titled hits
//     enabled: true

const API_URL = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs';
const API_KEY = 'jobboerse-jobsuche'; // public client key the arbeitsagentur.de UI uses
const DETAIL_BASE = 'https://www.arbeitsagentur.de/jobsuche/jobdetail/';
const REMOTE_RE = /(remote|homeoffice|home[-\s]?office|ortsunabh|deutschlandweit|bundesweit|100\s*%|full[-\s]?remote|fully remote)/i;

// Clamp a runtime integer into [min, max], falling back to `def` for NaN, so a
// stray portals.yml value can't produce empty (size=0) or pathological queries.
function intInRange(val, def, min, max) {
  const n = Number(val);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * Reads and sanitizes the entry's `arbeitsagentur:` config block.
 * @param {{ arbeitsagentur?: any }} entry
 * @returns {{ keywords: string[], wo: string, umkreis: number, days: number, size: number, remoteNationwide: boolean }}
 */
export function parseArbeitsagenturConfig(entry) {
  const cfg = (entry && entry.arbeitsagentur) || {};
  const keywords = Array.isArray(cfg.keywords)
    ? cfg.keywords.filter(k => typeof k === 'string' && k.trim()).map(k => k.trim())
    : [];
  return {
    keywords,
    wo: typeof cfg.wo === 'string' ? cfg.wo.trim() : '',
    umkreis: intInRange(cfg.umkreis, 50, 0, 1000), // km; only used when `wo` is set
    days: intInRange(cfg.days, 30, 1, 1000),       // recency window
    size: intInRange(cfg.size, 100, 1, 100),       // results per keyword (API max 100)
    remoteNationwide: cfg.remoteNationwide === true,
  };
}

/**
 * Assembles a human-readable location from the API's `arbeitsort` object. Most
 * postings are in Germany; only a non-DE country is appended so the downstream
 * location_filter can act on it.
 * @param {any} arbeitsort
 */
export function buildLocation(arbeitsort) {
  if (!arbeitsort || typeof arbeitsort !== 'object') return '';
  const loc = [arbeitsort.ort, arbeitsort.region].filter(Boolean).join(', ');
  const land = arbeitsort.land;
  if (land && !/deutschland|germany/i.test(land)) return loc ? `${loc}, ${land}` : land;
  return loc;
}

/**
 * Normalizes one raw Arbeitsagentur posting into a Job plus its `refnr` (kept
 * for dedup, stripped before the provider returns). Returns null when the
 * posting lacks a usable refnr or title.
 * @param {any} job
 * @returns {({title: string, url: string, company: string, location: string, refnr: string}) | null}
 */
export function normalizeJob(job) {
  const refnr = job && job.refnr;
  const title = String((job && job.titel) || '').trim();
  if (!refnr || !title) return null;
  return {
    title,
    url: DETAIL_BASE + encodeURIComponent(String(refnr)),
    company: String((job && job.arbeitgeber) || '').trim(),
    location: buildLocation(job && job.arbeitsort),
    refnr: String(refnr),
  };
}

/** @type {Provider} */
export default {
  id: 'arbeitsagentur',

  /**
   * Fetches and normalizes postings from the Arbeitsagentur Jobsuche API.
   * @param {{ name?: string, arbeitsagentur?: any }} entry
   * @param {{ fetchJson: (url: string, opts?: object) => Promise<any> }} ctx
   * @returns {Promise<Array<{title: string, url: string, company: string, location: string}>>}
   */
  async fetch(entry, ctx) {
    const { keywords, wo, umkreis, days, size, remoteNationwide } = parseArbeitsagenturConfig(entry);
    if (!keywords.length) {
      throw new Error(`arbeitsagentur: entry "${entry.name || '(unnamed)'}" has no arbeitsagentur.keywords[]`);
    }

    /** @param {string} was @param {Record<string,string>} [extra] */
    const fetchKeyword = async (was, extra = {}) => {
      const params = new URLSearchParams({
        was,
        size: String(size),
        page: '1',
        angebotsart: '1', // 1 = ARBEIT (employment; excludes Ausbildung/Selbständigkeit)
        veroeffentlichtseit: String(days),
        ...extra,
      });
      // redirect:'error' prevents SSRF via server-side redirects.
      const json = await ctx.fetchJson(`${API_URL}?${params.toString()}`, {
        headers: { 'X-API-Key': API_KEY, accept: 'application/json' },
        redirect: 'error',
        timeoutMs: 12_000,
      });
      return Array.isArray(json && json.stellenangebote) ? json.stellenangebote : [];
    };

    const byRef = new Map();
    const errors = [];
    for (const kw of keywords) {
      try {
        // Pass A: commutable radius around `wo`, or a single nationwide pass.
        const primary = wo
          ? await fetchKeyword(kw, { wo, umkreis: String(umkreis) })
          : await fetchKeyword(kw);
        // Pass B (optional): nationwide, keep only explicitly remote-titled hits
        // (captures remote roles hosted at a far HQ).
        const wide = wo && remoteNationwide
          ? (await fetchKeyword(kw)).filter(j => REMOTE_RE.test(String((j && j.titel) || '')))
          : [];
        for (const raw of [...primary, ...wide]) {
          const job = normalizeJob(raw);
          if (job && !byRef.has(job.refnr)) byRef.set(job.refnr, job);
        }
      } catch (err) {
        // Recall-first: tolerate a single failed keyword and keep going.
        errors.push(`"${kw}": ${(err && err.message) || err}`);
      }
    }

    // Don't fail silently if the whole source is down — surface it so scan.mjs
    // records the error instead of treating an outage as "zero new offers".
    if (!byRef.size && errors.length) {
      throw new Error(`arbeitsagentur: all ${errors.length} keyword request(s) failed — ${errors[0]}`);
    }

    return [...byRef.values()].map(({ refnr, ...job }) => job);
  },
};
