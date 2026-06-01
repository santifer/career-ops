import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import yaml from 'js-yaml';
import { paths } from './storage.mjs';

const PORTALS_PATH = process.env.CAREER_OPS_PORTALS || paths.portals;
const REQUEST_TIMEOUT_MS = 15000;
const COMPANY_CONCURRENCY = 8;
const MAX_RESULTS = 200;

const ALLOWED_HOSTS = new Set([
  'boards-api.greenhouse.io',
  'api.ashbyhq.com',
  'api.lever.co',
]);

// ── ATS detection + list-API URL derivation ─────────────────────────────────

function detectAts(entry) {
  const careers = entry.careers_url || '';
  const api = entry.api || '';

  if (/greenhouse\.io/.test(api) || /greenhouse\.io/.test(careers)) {
    const board = boardFromGreenhouse(api || careers);
    if (board) return { ats: 'greenhouse', url: `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true` };
  }
  const ashby = careers.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashby) return { ats: 'ashby', url: `https://api.ashbyhq.com/posting-api/job-board/${ashby[1]}?includeCompensation=true` };

  const lever = careers.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (lever) return { ats: 'lever', url: `https://api.lever.co/v0/postings/${lever[1]}?mode=json` };

  return null;
}

function boardFromGreenhouse(url) {
  const apiMatch = url.match(/boards-api\.greenhouse\.io\/v1\/boards\/([^/?#]+)/);
  if (apiMatch) return apiMatch[1];
  const boardMatch = url.match(/(?:job-boards(?:\.eu)?|boards)\.greenhouse\.io\/([^/?#]+)/);
  return boardMatch ? boardMatch[1] : null;
}

// ── HTTP ────────────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`untrusted ATS host: ${parsed.hostname}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'error',
      signal: controller.signal,
      headers: { 'user-agent': 'career-ops-web', accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Per-ATS mapping (includes job description) ───────────────────────────────

async function fetchCompany(entry) {
  const detected = detectAts(entry);
  if (!detected) return [];
  const json = await fetchJson(detected.url);

  if (detected.ats === 'greenhouse') {
    const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
    return jobs.filter(j => j.absolute_url).map(j => ({
      company: entry.name,
      title: j.title || '',
      url: j.absolute_url,
      location: j.location?.name || '',
      description: htmlToText(j.content || ''),
    }));
  }
  if (detected.ats === 'ashby') {
    const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
    return jobs.map(j => ({
      company: entry.name,
      title: j.title || '',
      url: j.jobUrl || '',
      location: j.location || '',
      description: j.descriptionPlain || htmlToText(j.descriptionHtml || ''),
    }));
  }
  // lever
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    company: entry.name,
    title: j.text || '',
    url: j.hostedUrl || '',
    location: j.categories?.location || '',
    description: j.descriptionPlain || htmlToText(j.description || ''),
  }));
}

// ── HTML → plain text ────────────────────────────────────────────────────────

function htmlToText(html) {
  if (!html) return '';
  return html
    // Greenhouse encodes its HTML markup as entities, so decode the structural
    // angle brackets first, then strip the now-real tags.
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Title filter ─────────────────────────────────────────────────────────────

function buildTitleFilter(titleFilter = {}) {
  const positive = (titleFilter.positive || []).map(s => String(s).toLowerCase().trim()).filter(Boolean);
  const negative = (titleFilter.negative || []).map(s => String(s).toLowerCase().trim()).filter(Boolean);
  return (title) => {
    const t = String(title || '').toLowerCase();
    if (negative.some(k => t.includes(k))) return false;
    if (positive.length === 0) return true;
    return positive.some(k => t.includes(k));
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function scanPortals({ company, onProgress } = {}) {
  const emit = typeof onProgress === 'function' ? onProgress : () => {};

  if (!existsSync(PORTALS_PATH)) {
    const err = new Error('portals.yml not found. Create it from templates/portals.example.yml to enable scanning.');
    err.code = 'NO_PORTALS';
    throw err;
  }

  const portals = yaml.load(await readFile(PORTALS_PATH, 'utf-8')) || {};
  const matchesTitle = buildTitleFilter(portals.title_filter);

  let companies = Array.isArray(portals.tracked_companies) ? portals.tracked_companies : [];
  companies = companies.filter(c => c && c.name && c.enabled !== false && detectAts(c));
  if (company) {
    const needle = company.toLowerCase();
    companies = companies.filter(c => c.name.toLowerCase().includes(needle));
  }

  emit({ type: 'start', total: companies.length });

  const jobs = [];
  const errors = [];
  let processed = 0;
  for (let i = 0; i < companies.length; i += COMPANY_CONCURRENCY) {
    const batch = companies.slice(i, i + COMPANY_CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(fetchCompany));
    settled.forEach((result, idx) => {
      processed += 1;
      const name = batch[idx].name;
      if (result.status === 'fulfilled') {
        jobs.push(...result.value);
        emit({ type: 'company', name, found: result.value.length, processed, total: companies.length });
      } else {
        const message = result.reason?.message || String(result.reason);
        errors.push({ company: name, error: message });
        emit({ type: 'company', name, error: message, processed, total: companies.length });
      }
    });
  }

  const seen = new Set();
  const filtered = [];
  for (const job of jobs) {
    if (!job.url || !job.title) continue;
    if (!matchesTitle(job.title)) continue;
    if (seen.has(job.url)) continue;
    seen.add(job.url);
    filtered.push(job);
    if (filtered.length >= MAX_RESULTS) break;
  }

  return { scanned: companies.length, found: filtered.length, jobs: filtered, errors };
}
