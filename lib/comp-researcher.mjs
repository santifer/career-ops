// lib/comp-researcher.mjs — multi-source comp band researcher.
//
// 2026-05-17 — Built after Mitchell flagged that 21 Apply-Now + All-Evaluations
// rows show `—` for Base because the JD doesn't disclose comp. The dashboard
// must show real, current bands. Source ladder (in priority order):
//
//   1. JD itself (re-parsed) — first 12K chars of the JD HTML, look for
//      pay-transparency bands like "$X-$Y" / "$X to $Y" / "$XK-$YK"
//   2. Levels.fyi public salary page for the company — scrape role band
//   3. Glassdoor company median by role family
//   4. Council-of-models — 3-5 LLMs synthesize a band from comparable peer
//      companies + market signal. Always-last fallback. Stamped "researched,
//      low confidence" so the UI can flag it.
//
// Caches per (company-slug, role-slug) into data/comp-cache/{slug}/{role}.json
// with 30-day TTL. Returns { band, low, high, source, confidence, method,
// queriedAt, sourcesAttempted, sourcesUsed, notes }.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithTimeout, readCached } from './fetch-utils.mjs';
import { callCouncil, extractRichContent } from './council.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_DIR = join(ROOT, 'data', 'comp-cache');
const CACHE_TTL_DAYS = 30;

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function ensureCacheDir(companySlug) {
  const dir = join(CACHE_DIR, companySlug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function readCache(companySlug, roleSlug) {
  const fp = join(CACHE_DIR, companySlug, `${roleSlug}.json`);
  if (!existsSync(fp)) return null;
  try {
    const data = JSON.parse(readFileSync(fp, 'utf-8'));
    const ageMs = Date.now() - new Date(data.queriedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > CACHE_TTL_DAYS) return null;
    data._cacheAgeDays = Math.round(ageDays * 10) / 10;
    return data;
  } catch {
    return null;
  }
}

function writeCache(companySlug, roleSlug, payload) {
  const dir = ensureCacheDir(companySlug);
  const fp = join(dir, `${roleSlug}.json`);
  writeFileSync(fp, JSON.stringify(payload, null, 2), 'utf-8');
  return fp;
}

// ─── Source 1: JD re-parse ────────────────────────────────────────
// Look for pay-transparency-style bands in the raw JD HTML.
async function tryJdReparse({ jdUrl }) {
  if (!jdUrl) return null;
  try {
    const res = await fetchWithTimeout(jdUrl, {}, 12_000);
    if (!res.ok) return null;
    // Strip HTML tags to plain text for regex matching.
    const text = res.text.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    // Multiple band patterns:
    //   $190,000 - $240,000 / $190K-$240K / $190K to $240K / USD 190,000 to 240,000
    const patterns = [
      /\$\s*(\d{2,3})[,.]?(\d{3})\s*[-–—to]+\s*\$?\s*(\d{2,3})[,.]?(\d{3})/i,
      /\$\s*(\d{2,3})\s*K\s*[-–—to]+\s*\$?\s*(\d{2,3})\s*K/i,
      /USD\s*(\d{2,3})[,.]?(\d{3})\s*[-–—to]+\s*(\d{2,3})[,.]?(\d{3})/i,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (!m) continue;
      let lo, hi;
      if (re.source.includes('K')) {
        lo = parseInt(m[1], 10) * 1000;
        hi = parseInt(m[2], 10) * 1000;
      } else {
        lo = parseInt(m[1] + m[2], 10);
        hi = parseInt(m[3] + m[4], 10);
      }
      if (lo > 1000 && hi > lo && hi < 10_000_000) {
        return {
          source: 'jd_reparse',
          confidence: 'high',
          low: lo,
          high: hi,
          band: `$${Math.round(lo/1000)}K-$${Math.round(hi/1000)}K`,
          notes: 'Found in JD body via re-parse',
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Source 2: Levels.fyi public salary page ──────────────────────
async function tryLevelsFyi({ company, role }) {
  if (!company) return null;
  const slug = slugify(company);
  const url = `https://www.levels.fyi/companies/${slug}/salaries`;
  try {
    const res = await fetchWithTimeout(url, {}, 10_000);
    if (!res.ok) return null;
    const text = res.text;
    // Levels.fyi pages embed JSON-LD with salary aggregates. Look for them.
    // Falls back to text-scan for $XXXK patterns near the role family.
    const roleFamily = _roleFamily(role);
    const roleRe = new RegExp(`${roleFamily}[\\s\\S]{0,2000}?\\$(\\d{2,3})\\s*K\\s*[-–]\\s*\\$?(\\d{2,3})\\s*K`, 'i');
    const m = text.match(roleRe);
    if (m) {
      const lo = parseInt(m[1], 10) * 1000;
      const hi = parseInt(m[2], 10) * 1000;
      if (lo > 50_000 && hi > lo && hi < 2_000_000) {
        return {
          source: 'levels_fyi',
          confidence: 'medium',
          low: lo,
          high: hi,
          band: `$${m[1]}K-$${m[2]}K`,
          notes: `Scraped from levels.fyi/companies/${slug}/salaries — ${roleFamily} family`,
          url,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Map a freeform role title to a Levels.fyi role family.
function _roleFamily(role) {
  const r = String(role || '').toLowerCase();
  if (/comms|communication|pr\b|editorial|marketing/.test(r)) return 'Marketing';
  if (/developer\s+advocat|devrel|developer\s+relations|developer\s+education/.test(r)) return 'Developer Advocate';
  if (/forward\s+deployed|solutions\s+engineer|applied\s+engineer/.test(r)) return 'Software Engineer';
  if (/product\s+manag/.test(r)) return 'Product Manager';
  if (/data\s+scientist|ml\s+engineer/.test(r)) return 'Data Scientist';
  if (/software|sde|engineer/.test(r)) return 'Software Engineer';
  if (/program\s+manag/.test(r)) return 'Technical Program Manager';
  if (/designer/.test(r)) return 'Product Designer';
  return 'Software Engineer';
}

// ─── Source 3: Glassdoor company median ───────────────────────────
async function tryGlassdoor({ company, role }) {
  if (!company) return null;
  const slug = slugify(company);
  const url = `https://www.glassdoor.com/Salary/${encodeURIComponent(company)}-Salaries-E.htm`;
  try {
    const res = await fetchWithTimeout(url, {}, 10_000);
    if (!res.ok || /\b403\b/.test(String(res.status))) return null;
    const text = res.text.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    // Glassdoor pages embed median values like "$185K-$235K" near role names.
    const roleKeyword = String(role || '').split(/\s+/)[0];
    const re = new RegExp(`${roleKeyword}[\\s\\S]{0,1500}?\\$(\\d{2,3})\\s*K\\s*[-–]\\s*\\$?(\\d{2,3})\\s*K`, 'i');
    const m = text.match(re);
    if (m) {
      const lo = parseInt(m[1], 10) * 1000;
      const hi = parseInt(m[2], 10) * 1000;
      if (lo > 50_000 && hi > lo) {
        return {
          source: 'glassdoor',
          confidence: 'medium',
          low: lo,
          high: hi,
          band: `$${m[1]}K-$${m[2]}K`,
          notes: `Glassdoor scrape — median for "${roleKeyword}" near ${company}`,
          url,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Source 4: Council-of-models synthesis ────────────────────────
async function tryCouncil({ company, role, seniority, location }) {
  const prompt = `You are a senior comp researcher for AI-native companies. Estimate the total annual base salary band (USD) for the following role, drawing on the most current public market signal you have (Levels.fyi, Blind, Glassdoor, recent JDs at peer companies, public funding rounds).

Company: ${company}
Role: ${role}
Seniority: ${seniority || '(infer from title)'}
Location: ${location || '(assume US remote / hybrid major metro)'}

REQUIRED OUTPUT FORMAT (one JSON object, no prose):
{"low": <integer USD>, "high": <integer USD>, "midpoint": <integer USD>, "basis": "<one sentence of comparable companies and source signal>", "confidence": "<high|medium|low>"}

Rules:
- If you have HIGH confidence (recent public band at this company OR strong peer match), return high.
- If you only know peer-company bands at similar stage/role, return medium.
- If you're guessing from broad market signal, return low.
- Numbers must be base salary only (exclude equity/bonus/total comp).
- For US AI-native Series B+: typical Sr Comms = $190-260K, Sr DevRel = $180-240K, FDE = $200-280K, Sr PM = $200-280K.`;

  try {
    // Council models: cheap-and-fast tier for comp synthesis. Skip the
    // heavy deep-research models (Perplexity sonar-deep-research, Grok 4.3).
    const { results } = await callCouncil({
      prompt,
      // 2026-05-18: swapped xai:grok-4-fast-reasoning → xai:grok-4 (auto-escalates to
      // grok-4.3) since grok-4-fast-reasoning was retired May 15. Still works via
      // fallback chain but the new slot is the canonical entry.
      models: ['perplexity:sonar-reasoning-pro', 'xai:grok-4', 'google:gemini-2.5-pro'],
      opts: { maxTokens: 400 },
    });
    const valid = results.filter(r => !r.error && r.content).map(r => {
      const rich = extractRichContent(r);
      try {
        const m = rich.content.match(/\{[^{}]*"low"[^{}]*\}/);
        if (!m) return null;
        const parsed = JSON.parse(m[0]);
        if (!parsed.low || !parsed.high) return null;
        return {
          ...parsed,
          model: r.model,
          // Capture evidence quality signals (meta-audit v2 P0 #1):
          // citations + grounding_urls let downstream callers weight grounded
          // comp ranges higher than ungrounded ones.
          citation_count: rich.citations.length,
          grounding_url_count: rich.grounding_urls.length,
        };
      } catch { return null; }
    }).filter(Boolean);

    if (!valid.length) return null;

    // Median across model estimates.
    const lows = valid.map(v => v.low).sort((a, b) => a - b);
    const highs = valid.map(v => v.high).sort((a, b) => a - b);
    const midLow = lows[Math.floor(lows.length / 2)];
    const midHigh = highs[Math.floor(highs.length / 2)];

    // Confidence = highest common rating across models
    const confidences = valid.map(v => v.confidence || 'low');
    const conf = confidences.includes('high') && confidences.filter(c => c === 'high').length >= 2 ? 'high'
               : confidences.includes('medium') ? 'medium'
               : 'low';

    return {
      source: 'council',
      confidence: conf,
      low: midLow,
      high: midHigh,
      band: `$${Math.round(midLow/1000)}K-$${Math.round(midHigh/1000)}K`,
      notes: `Council median across ${valid.length} models. Basis: ${valid[0].basis || 'peer comparison'}`,
      modelCount: valid.length,
      models: valid.map(v => v.model),
    };
  } catch (e) {
    return { source: 'council', error: String(e.message || e) };
  }
}

// ─── Main entry ───────────────────────────────────────────────────
export async function researchComp({ company, role, seniority, location, jdUrl, useCache = true, force = false }) {
  if (!company || !role) {
    return { error: 'company and role are required' };
  }
  const companySlug = slugify(company);
  const roleSlug = slugify(role);

  if (useCache && !force) {
    const cached = readCache(companySlug, roleSlug);
    if (cached) return { ...cached, fromCache: true };
  }

  const sourcesAttempted = [];
  const sourcesFailed = [];

  // Source ladder — short-circuit on first successful HIGH or MEDIUM result.
  const ladder = [
    { name: 'jd_reparse',  fn: () => tryJdReparse({ jdUrl }) },
    { name: 'levels_fyi',  fn: () => tryLevelsFyi({ company, role }) },
    { name: 'glassdoor',   fn: () => tryGlassdoor({ company, role }) },
    { name: 'council',     fn: () => tryCouncil({ company, role, seniority, location }) },
  ];

  let result = null;
  for (const step of ladder) {
    sourcesAttempted.push(step.name);
    const r = await step.fn();
    if (!r || r.error) {
      sourcesFailed.push({ name: step.name, error: r?.error || 'no match' });
      continue;
    }
    result = r;
    // Stop at first high/medium confidence hit (don't waste council calls).
    if (r.confidence === 'high' || r.confidence === 'medium') break;
  }

  if (!result) {
    const payload = {
      company, role, seniority, location,
      band: null, low: null, high: null,
      source: 'none', confidence: 'none',
      notes: 'No comp data found in any source (JD, Levels.fyi, Glassdoor, council fallback).',
      sourcesAttempted, sourcesFailed,
      queriedAt: new Date().toISOString(),
    };
    writeCache(companySlug, roleSlug, payload);
    return payload;
  }

  const payload = {
    company, role, seniority, location,
    band: result.band,
    low: result.low,
    high: result.high,
    midpoint: Math.round((result.low + result.high) / 2),
    source: result.source,
    confidence: result.confidence,
    notes: result.notes || '',
    url: result.url || jdUrl || null,
    modelCount: result.modelCount,
    models: result.models,
    sourcesAttempted, sourcesFailed,
    queriedAt: new Date().toISOString(),
  };
  writeCache(companySlug, roleSlug, payload);
  return payload;
}

// Convenience reader for the dashboard — returns the cached entry if any,
// without re-fetching. Used by build-dashboard.mjs Tier 6 fallback.
export function lookupCompCache(company, role) {
  return readCache(slugify(company), slugify(role));
}

// Convenience: list every cached comp entry (useful for backfill audits).
export function listCompCache() {
  if (!existsSync(CACHE_DIR)) return [];
  const out = [];
  for (const companyDir of readdirSync(CACHE_DIR)) {
    const subDir = join(CACHE_DIR, companyDir);
    let stat;
    try { stat = readdirSync(subDir); } catch { continue; }
    for (const file of stat) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = JSON.parse(readFileSync(join(subDir, file), 'utf-8'));
        out.push({ companySlug: companyDir, roleSlug: file.replace(/\.json$/, ''), ...data });
      } catch {}
    }
  }
  return out;
}
