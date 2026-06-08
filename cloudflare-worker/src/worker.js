/**
 * pulse-jobs-proxy — Cloudflare Worker
 *
 * Routes:
 *   GET /health                  → { status, version, timestamp }
 *   GET /greenhouse/:company     → PulseJob[] from Greenhouse boards API
 *   GET /lever/:company          → PulseJob[] from Lever postings API
 *
 * All responses: JSON + CORS headers (open for Pulse Engine MVP HTML).
 * Jobs normalized to PulseJob schema (parity with schema/pulse-job.schema.json).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function err(msg, status = 500) {
  return json({ error: msg }, status);
}

// ── Greenhouse ────────────────────────────────────────────────────────────────

function normalizeGreenhouse(job, company, now) {
  const loc = job.location?.name ?? '';
  const isRemote = /\bremote\b/i.test(loc);
  return {
    source:           'greenhouse',
    external_id:      String(job.id),
    title:            job.title ?? '',
    company:          company,
    location:         loc || 'Remote',
    url:              job.absolute_url ?? '',
    posted_at:        job.updated_at ?? now,
    ingested_at:      now,
    state:            'new',
    salary_min:       null,
    salary_max:       null,
    employment_type:  null,
    remote:           isRemote,
    summary:          null,
    company_logo_url: null,
    easy_apply:       null,
    score:            null,
    has_connection:   false,
    verified:         true,
  };
}

async function handleGreenhouse(company, now) {
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs`;
  let res;
  try {
    res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'pulse-jobs-proxy/1.0' },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
  } catch (e) {
    return err(`Greenhouse fetch failed: ${e.message}`);
  }

  if (res.status === 404) return err(`Greenhouse board not found: ${company}`, 404);
  if (!res.ok) return err(`Greenhouse API error: ${res.status}`);

  const data = await res.json();
  const jobs = (data.jobs ?? []).map(j => normalizeGreenhouse(j, company, now));

  return json({ source: 'greenhouse', company, count: jobs.length, jobs });
}

// ── Lever ─────────────────────────────────────────────────────────────────────

function normalizeLever(posting, company, now) {
  const loc  = posting.categories?.location ?? posting.categories?.allLocations?.[0] ?? '';
  const isRemote = /\bremote\b/i.test(loc);
  const postedAt = posting.createdAt
    ? new Date(posting.createdAt).toISOString()
    : now;

  // Truncate description to 500 chars
  let summary = posting.descriptionPlain ?? posting.description ?? null;
  if (summary) {
    summary = summary.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (summary.length > 500) summary = summary.slice(0, 499) + '…';
  }

  return {
    source:           'lever',
    external_id:      posting.id ?? '',
    title:            posting.text ?? '',
    company:          company,
    location:         loc || 'Remote',
    url:              posting.hostedUrl ?? posting.applyUrl ?? '',
    posted_at:        postedAt,
    ingested_at:      now,
    state:            'new',
    salary_min:       null,
    salary_max:       null,
    employment_type:  posting.categories?.commitment ?? null,
    remote:           isRemote,
    summary:          summary,
    company_logo_url: null,
    easy_apply:       null,
    score:            null,
    has_connection:   false,
    verified:         true,
  };
}

async function handleLever(company, now) {
  const apiUrl = `https://api.lever.co/v0/postings/${company}?mode=json`;
  let res;
  try {
    res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'pulse-jobs-proxy/1.0' },
      cf: { cacheTtl: 300, cacheEverything: true },
    });
  } catch (e) {
    return err(`Lever fetch failed: ${e.message}`);
  }

  if (res.status === 404) return err(`Lever company not found: ${company}`, 404);
  if (!res.ok) return err(`Lever API error: ${res.status}`);

  const data = await res.json();
  const postings = Array.isArray(data) ? data : (data.postings ?? []);
  const jobs = postings.map(p => normalizeLever(p, company, now));

  return json({ source: 'lever', company, count: jobs.length, jobs });
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== 'GET') {
      return err('Method not allowed', 405);
    }

    const url  = new URL(request.url);
    const path = url.pathname;
    const now  = new Date().toISOString();

    if (path === '/health') {
      return json({ status: 'ok', version: env.WORKER_VERSION ?? '1.0.0', timestamp: now });
    }

    const ghMatch = path.match(/^\/greenhouse\/([^/]+)$/);
    if (ghMatch) return handleGreenhouse(ghMatch[1], now);

    const lvMatch = path.match(/^\/lever\/([^/]+)$/);
    if (lvMatch) return handleLever(lvMatch[1], now);

    return err('Not found', 404);
  },
};
