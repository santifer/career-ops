#!/usr/bin/env node
/*
 * fetch-jd.mjs — Fetch a single job's description as clean text via the ATS
 * provider's per-job API (NOT a full HTML page).
 *
 * Usage:
 *   node fetch-jd.mjs "<job-url>"            # prints clean JD text to stdout
 *   node fetch-jd.mjs "<job-url>" --json     # prints {title, company, location, text}
 *
 * Exit 0 + non-empty stdout on success. Exit 1 (empty/short output) when the
 * provider is unknown or the API misses, so callers (batch-runner.sh) can fall
 * back to the worker's WebFetch path.
 *
 * Why: batch/in-session workers otherwise WebFetch the full HTML page (10-30k
 * tokens of nav/markup, and mis-fetches on SPAs). The provider APIs return just
 * the JD body — ~80-90% fewer tokens and far more reliable. Providers covered:
 * Greenhouse, Ashby, Lever (solid); Workday (best-effort). Anything else falls
 * back. Mirrors the API conventions in providers/ and modes/scan.md.
 */

const UA = 'career-ops-fetch-jd/1.0';
const MIN_USEFUL = 200; // chars; below this we treat as a miss and fall back

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&#x27;': "'", '&apos;': "'", '&nbsp;': ' ', '&mdash;': '-', '&ndash;': '-',
  '&rsquo;': "'", '&lsquo;': "'", '&ldquo;': '"', '&rdquo;': '"', '&hellip;': '...',
};

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&[a-z]+;|&#x?\d*;/gi, m => ENTITIES[m.toLowerCase()] ?? m);
}

function htmlToText(html) {
  if (!html) return '';
  // Decode entities FIRST (Greenhouse `content` is entity-encoded HTML, e.g.
  // &lt;div&gt;), THEN strip tags — otherwise encoded tags survive as text.
  return decodeEntities(String(html))
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br)\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const FETCH_TIMEOUT_MS = 12000; // bound each request so a hung ATS endpoint can't stall a worker

async function getJson(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers = { 'user-agent': UA, accept: 'application/json', ...(opts.headers || {}) };
  try {
    const res = await fetch(url, { ...opts, headers, signal: opts.signal ?? controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Provider detectors + single-job fetchers ─────────────────────────

async function greenhouse(url) {
  // job-boards.greenhouse.io/{board}/jobs/{id} or boards.greenhouse.io/{board}/jobs/{id}
  const m = url.match(/greenhouse\.io\/(?:embed\/job_app\?for=)?([^/?#]+)\/jobs\/(\d+)/)
        || url.match(/greenhouse\.io\/([^/?#]+).*[?&]gh_jid=(\d+)/);
  if (!m) return null;
  const [, board, id] = m;
  const j = await getJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}?questions=false`);
  return { title: j.title || '', company: board, location: j.location?.name || '', text: htmlToText(j.content) };
}

async function ashby(url) {
  // jobs.ashbyhq.com/{org}/{postingId}
  const m = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)\/([^/?#]+)/i);
  if (!m) return null;
  const [, org, postingId] = m;
  const j = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${org}?includeCompensation=true`);
  const jobs = Array.isArray(j?.jobs) ? j.jobs : [];
  const post = jobs.find(p => p.id === postingId || p.jobId === postingId) || jobs.find(p => (p.jobUrl || '').includes(postingId));
  if (!post) return null;
  const text = post.descriptionPlain || htmlToText(post.descriptionHtml) || '';
  return { title: post.title || '', company: org, location: post.location || post.locationName || '', text };
}

async function lever(url) {
  // jobs.lever.co/{co}/{id} (also api.eu.lever.co)
  const m = url.match(/lever\.co\/([^/?#]+)\/([0-9a-f-]{8,})/i);
  if (!m) return null;
  const [, co, id] = m;
  const eu = /jobs\.eu\.lever\.co/.test(url);
  const host = eu ? 'api.eu.lever.co' : 'api.lever.co';
  const j = await getJson(`https://${host}/v0/postings/${co}/${id}`);
  const parts = [j.descriptionPlain || htmlToText(j.description)];
  for (const l of (j.lists || [])) parts.push(`\n${l.text}\n${htmlToText(l.content)}`);
  if (j.additionalPlain || j.additional) parts.push(j.additionalPlain || htmlToText(j.additional));
  return { title: j.text || '', company: co, location: j.categories?.location || '', text: parts.filter(Boolean).join('\n').trim() };
}

async function workday(url) {
  // {tenant}.{dc}.myworkdayjobs.com[/{locale}]/{site}/job/{path}_{reqid}
  const m = url.match(/^https:\/\/([\w-]+)\.(wd[\w-]*)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)\/job\/(.+?)(?:\?.*)?$/);
  if (!m) return null;
  const [, tenant, dc, site, jobPath] = m;
  const host = `${tenant}.${dc}.myworkdayjobs.com`;
  // CXS job-detail endpoint mirrors the careers path after /job/
  const j = await getJson(`https://${host}/wday/cxs/${tenant}/${site}/job/${jobPath}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
  });
  const info = j?.jobPostingInfo || {};
  const text = info.jobDescription ? htmlToText(info.jobDescription) : '';
  return { title: info.title || '', company: tenant, location: info.location || '', text };
}

const PROVIDERS = [greenhouse, ashby, lever, workday];

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const url = args.find(a => /^https?:\/\//.test(a));
  if (!url) { process.stderr.write('usage: node fetch-jd.mjs <url> [--json]\n'); process.exit(2); }

  let result = null;
  for (const p of PROVIDERS) {
    try {
      const r = await p(url);
      if (r && (r.text || '').length >= MIN_USEFUL) { result = r; break; }
    } catch { /* try next / fall back */ }
  }

  if (!result) process.exit(1); // signal caller to fall back to WebFetch

  if (json) {
    process.stdout.write(JSON.stringify(result));
  } else {
    const head = [result.title && `# ${result.title}`, result.company && `Company: ${result.company}`, result.location && `Location: ${result.location}`].filter(Boolean).join('\n');
    process.stdout.write(`${head}\n\n${result.text}\n`);
  }
}

main().catch(err => { process.stderr.write(`fetch-jd error: ${err.message}\n`); process.exit(1); });
