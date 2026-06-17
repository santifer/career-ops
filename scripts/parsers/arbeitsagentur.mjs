// @ts-check
/**
 * Arbeitsagentur (Bundesagentur für Arbeit) Jobsuche API parser.
 *
 * Zero-token Level-0 source for scan.mjs. Hits the public Jobsuche REST API
 * (the same one the arbeitsagentur.de website uses) for a configurable set of
 * keywords and prints a flat JSON array of {title, url, company, location} to
 * stdout. scan.mjs applies title_filter + location_filter + dedup afterwards,
 * so this parser over-fetches (recall-first).
 *
 * Public API: GET https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs
 *   header X-API-Key: jobboerse-jobsuche  (public client key)
 *   params: was, wo, umkreis, size, page, angebotsart=1 (employment),
 *           veroeffentlichtseit (days)
 * Detail URL: https://www.arbeitsagentur.de/jobsuche/jobdetail/{encoded refnr}
 *
 * Configuration (no hardcoded search terms):
 *   Keywords  — positional CLI args, or AA_KEYWORDS env (comma-separated). Required.
 *   --wo CITY / AA_WO         — anchor city for a radius search (optional; empty = nationwide)
 *   --umkreis KM / AA_UMKREIS — radius in km around --wo (default 50; only used when --wo set)
 *   --days N / AA_DAYS        — recency window (default 30)
 *   --size N / AA_SIZE        — results per keyword (default 100, API max 100)
 *   --remote-nationwide       — when --wo is set, ALSO run a nationwide pass per
 *                               keyword keeping only remote-titled hits (captures
 *                               remote roles hosted at a far HQ). Off by default.
 *
 * Examples:
 *   node arbeitsagentur.mjs "Machine Learning Engineer" "Data Scientist"
 *   node arbeitsagentur.mjs --wo Berlin --umkreis 50 "DevOps Engineer"
 *   AA_KEYWORDS="NLP,MLOps" node arbeitsagentur.mjs --wo München --remote-nationwide
 *
 * In portals.yml, pass these through parser.args. Output goes to stdout as JSON;
 * all logging goes to stderr so stdout stays clean.
 */

import dns from 'node:dns';
// WSL2/Node fetch can stall on IPv6; force IPv4 regardless of parent env.
dns.setDefaultResultOrder('ipv4first');

const API_URL = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs';
const API_KEY = 'jobboerse-jobsuche';
const DETAIL_BASE = 'https://www.arbeitsagentur.de/jobsuche/jobdetail/';

// -- Parse CLI args: flags (--key value / --bool) + positional keywords. --
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true; // boolean flag
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

const { flags, positional } = parseArgs(process.argv.slice(2));

// Keywords: positional args win, else AA_KEYWORDS env (comma-separated). No default.
const KEYWORDS = positional.length
  ? positional
  : String(process.env.AA_KEYWORDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

const SIZE = Number(flags.size || process.env.AA_SIZE || 100);          // results per keyword (API max 100)
const VEROEFFENTLICHT_DAYS = Number(flags.days || process.env.AA_DAYS || 30); // recency window
const PER_REQUEST_TIMEOUT_MS = Number(process.env.AA_TIMEOUT_MS || 12_000);
const WO = String(flags.wo || process.env.AA_WO || '').trim();          // anchor city; empty = nationwide
const UMKREIS = String(flags.umkreis || process.env.AA_UMKREIS || 50);  // km; only used when WO set
const REMOTE_NATIONWIDE = Boolean(flags['remote-nationwide'] || process.env.AA_REMOTE_NATIONWIDE);
const REMOTE_RE = /(remote|homeoffice|home[-\s]?office|ortsunabh|deutschlandweit|bundesweit|100\s*%|full[-\s]?remote|fully remote)/i;

async function fetchKeyword(was, extra = {}) {
  const params = new URLSearchParams({
    was,
    size: String(SIZE),
    page: '1',
    angebotsart: '1', // 1 = ARBEIT (employment; excludes Ausbildung/Selbständigkeit)
    veroeffentlichtseit: String(VEROEFFENTLICHT_DAYS),
    ...extra,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}?${params.toString()}`, {
      headers: { 'X-API-Key': API_KEY, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`  ! "${was}": HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data?.stellenangebote) ? data.stellenangebote : [];
  } catch (err) {
    console.error(`  ! "${was}": ${err?.message || err}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function buildLocation(arbeitsort) {
  if (!arbeitsort || typeof arbeitsort !== 'object') return '';
  const parts = [arbeitsort.ort, arbeitsort.region].filter(Boolean);
  const loc = parts.join(', ');
  const land = arbeitsort.land;
  // Most are Germany; only append a non-DE country so the location filter can act on it.
  if (land && !/deutschland|germany/i.test(land)) return loc ? `${loc}, ${land}` : land;
  return loc;
}

function normalize(job) {
  const refnr = job?.refnr;
  const title = String(job?.titel || '').trim();
  if (!refnr || !title) return null;
  return {
    title,
    url: DETAIL_BASE + encodeURIComponent(String(refnr)),
    company: String(job?.arbeitgeber || '').trim(),
    location: buildLocation(job?.arbeitsort),
    refnr: String(refnr),
  };
}

async function main() {
  if (!KEYWORDS.length) {
    console.error(
      'Arbeitsagentur: no keywords given. Pass them as CLI args or AA_KEYWORDS env.\n' +
      '  node arbeitsagentur.mjs "Machine Learning Engineer" "Data Scientist"\n' +
      '  node arbeitsagentur.mjs --wo Berlin --umkreis 50 "DevOps Engineer"',
    );
    process.stdout.write('[]');
    return;
  }

  const mode = WO
    ? `geo=${WO}/${UMKREIS}km${REMOTE_NATIONWIDE ? ' + remote-titled nationwide' : ''}`
    : 'nationwide';
  console.error(`Arbeitsagentur: ${KEYWORDS.length} keywords, size=${SIZE}, last ${VEROEFFENTLICHT_DAYS}d; ${mode}`);

  const byRef = new Map();
  for (const kw of KEYWORDS) {
    let primary;
    let wide = [];
    if (WO) {
      // Pass A: commutable radius around the anchor city.
      primary = await fetchKeyword(kw, { wo: WO, umkreis: String(UMKREIS) });
      // Pass B (optional): nationwide, keep only explicitly-remote titles.
      if (REMOTE_NATIONWIDE) {
        wide = (await fetchKeyword(kw)).filter((j) => REMOTE_RE.test(String(j?.titel || '')));
      }
    } else {
      // No anchor city → single nationwide pass, keep everything.
      primary = await fetchKeyword(kw);
    }
    console.error(`  · "${kw}": ${primary.length}${WO && REMOTE_NATIONWIDE ? ` + remote-titled ${wide.length}` : ''}`);
    for (const raw of [...primary, ...wide]) {
      const job = normalize(raw);
      if (job && !byRef.has(job.refnr)) byRef.set(job.refnr, job);
    }
  }

  const out = [...byRef.values()].map(({ refnr, ...rest }) => rest);
  console.error(`Arbeitsagentur: ${out.length} unique`);
  process.stdout.write(JSON.stringify(out));
}

main().catch((err) => {
  console.error(`Arbeitsagentur parser fatal: ${err?.message || err}`);
  process.stdout.write('[]');
  process.exit(0); // stay non-fatal for scan.mjs; emit empty array
});
