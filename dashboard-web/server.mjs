/**
 * JobSeeker — Mission Control Dashboard
 * Apple-grade UX · Gmail Integration · Status Updates
 * Port: 4747 | Node.js built-ins only
 */

import http from 'http';
import https from 'https';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { URLSearchParams } from 'url';
import { spawn } from 'child_process';
import {
  validateOnboardPayload,
  serializeProfileYaml,
  extractProfileFromResume,
  parseProfileSummary,
} from './lib/onboard.mjs';
import { makeSafeResolver } from './lib/path-safety.mjs';
import { readJsonBody, MAX_BODY_BYTES } from './lib/http-utils.mjs';
import { buildGmailStatus } from './lib/gmail-status.mjs';

const PORT = Number(process.env.PORT || 4747);
// Bind to loopback by default; opt-in to LAN exposure via HOST=0.0.0.0
const HOST = process.env.HOST || '127.0.0.1';
const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dir, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const REPORTS_DIR = process.env.REPORTS_DIR || path.join(ROOT, 'reports');
// CONFIG_DIR isolates user-config writes (profile.yml) for safe smoke tests.
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(ROOT, 'config');
const TOKENS_FILE = path.join(DATA_DIR, 'gmail-tokens.json');
const CACHE_FILE = path.join(DATA_DIR, 'gmail-cache.json');

// Gmail OAuth config — set in .env
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || `http://localhost:${PORT}/auth/gmail/callback`;
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

// ── Markdown table parser ─────────────────────────────────────────────────────

function parseMarkdownTable(content) {
  const lines = content.split('\n');
  let headers = null;
  const rows = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('|') || !t.endsWith('|')) continue;
    const cells = t.slice(1, -1).split('|').map(c => c.trim());
    if (!headers) { headers = cells.map(h => h.trim() === '#' ? 'num' : h.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')); continue; }
    if (cells.every(c => /^[-: ]+$/.test(c))) continue;
    if (cells.length < 2) continue;
    const row = {}; headers.forEach((h,i) => { row[h] = (cells[i]||'').trim(); }); rows.push(row);
  }
  return rows;
}

function stripMd(text) {
  return (text||'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*\*/g,'').replace(/`/g,'').trim();
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d) / 86400000);
}

// ── Comp parsing from report Block D ──────────────────────────────────────────
// Extract comp range from "## D) Comp" block. Returns:
//   { display: "$270-310K base", lowUSD: 270000, highUSD: 310000, currency: 'USD',
//     kind: 'base' | 'tc' | 'ote' | 'unknown', score: 0..5, premium: bool }
//
// "premium" flags companies with known top-tier comp (Anthropic / OpenAI / etc.)
// even when the report's number isn't precise enough to filter on alone.

const PREMIUM_COMPANIES = new Set([
  'anthropic','openai','nvidia','google deepmind','deepmind','aws ai','amazon ai',
  'stripe','databricks','meta ai','meta','apple','netflix','airbnb','figma',
  'scale ai','cohere','mistral','perplexity','xai','x.ai','runway','character.ai',
  'inflection','adept','suno','elevenlabs','huggingface','hugging face',
]);

// In-memory cache: reportLink -> parsed comp object (re-parse on server restart)
const compCache = new Map();

// Convert a currency token to USD (rough, for sorting only).
function toUSD(amount, currency) {
  if (!isFinite(amount)) return amount;
  const rate = { USD: 1, CAD: 0.74, EUR: 1.08, GBP: 1.27, INR: 0.012, CHF: 1.13, AUD: 0.66, SGD: 0.74 }[currency] || 1;
  return Math.round(amount * rate);
}

// Parse a single comp number with K/M suffix support.
// Examples handled: "270K", "270,000", "1.2M", "$300", "443K"
function parseAmount(raw) {
  if (!raw) return NaN;
  let s = String(raw).replace(/[\$£€₹,\s]/g, '');
  let mult = 1;
  if (/k$/i.test(s)) { mult = 1000; s = s.slice(0, -1); }
  else if (/m$/i.test(s)) { mult = 1_000_000; s = s.slice(0, -1); }
  const n = parseFloat(s);
  if (!isFinite(n)) return NaN;
  // Heuristic: if the bare number is < 800 and there's no K, assume thousands
  // (e.g., "$270 - 310" almost always means thousands in JD comp blocks)
  if (mult === 1 && n > 0 && n < 800) mult = 1000;
  return n * mult;
}

function detectCurrency(text) {
  if (/£/.test(text)) return 'GBP';
  if (/€/.test(text) || /\bEUR\b/i.test(text)) return 'EUR';
  if (/₹|\bINR\b|\blakh|\bcrore/i.test(text)) return 'INR';
  if (/\bCAD\b/i.test(text)) return 'CAD';
  if (/\bCHF\b/i.test(text)) return 'CHF';
  if (/\bAUD\b/i.test(text)) return 'AUD';
  return 'USD';
}

// Heuristic: pull the most informative range from the report's Block D.
// Strategy: find Block D, score every $/£/€ range we find, pick the best one.
function extractCompFromReport(reportText, company) {
  if (!reportText) return null;
  // Slice from "## D)" or "## D) Comp" up to "## E" or "---" terminator
  const blockMatch = reportText.match(/##\s*D\)?[^\n]*\n([\s\S]*?)(?=\n##\s*[E-Z]\)?|\n---|\n##\s*Block\s*[E-Z]|$)/);
  const blockText = blockMatch ? blockMatch[1] : reportText;

  // Match patterns like:
  //   $270,000 – $310,000 USD base
  //   $270K-$310K
  //   €100-150K base
  //   $375K-$500K+ annually
  //   $300K base
  // Strategy: find any [SYMBOL][num][-/–/to][SYMBOL?][num][SUFFIX?] sequence
  const rangeRe = /([\$£€₹])?\s*([\d.,]+)\s*([KkMm])?\s*(?:[-–—]|to)\s*([\$£€₹])?\s*([\d.,]+)\s*([KkMm])?/g;
  const candidates = [];
  let m;
  // Pre-compute the line each match falls on for source-row scoring
  const lines = blockText.split('\n');
  const lineOffsets = [];
  let cumOff = 0;
  for (const ln of lines) { lineOffsets.push(cumOff); cumOff += ln.length + 1; }
  const lineOf = (idx) => {
    let lo = 0, hi = lineOffsets.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lineOffsets[mid] <= idx) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return lines[ans] || '';
  };

  while ((m = rangeRe.exec(blockText)) !== null) {
    const sym = m[1] || m[4] || '';
    if (!sym && !/\b(USD|CAD|EUR|GBP|INR|CHF|salary|base|comp|TC|OTE)\b/i.test(blockText.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60))) continue;
    const ctx = blockText.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80);
    const line = lineOf(m.index);
    let low = parseAmount(m[2] + (m[3] || ''));
    let high = parseAmount(m[5] + (m[6] || ''));
    if (!isFinite(low) || !isFinite(high)) continue;
    if (high < low) [low, high] = [high, low];
    // Filter junk: too low (< 1K), or unrealistic spread
    if (low < 1000 || high < 1000) continue;
    if (high > low * 20) continue;
    // Filter out non-comp numbers (revenue, ARR, valuation, headcount caps).
    // No legitimate annual comp exceeds ~$5M USD-equivalent. Block anything ≥ 5M.
    if (low >= 5_000_000 || high >= 5_000_000) continue;
    const currency = sym === '£' ? 'GBP' : sym === '€' ? 'EUR' : sym === '₹' ? 'INR' : detectCurrency(ctx);
    let kind = 'base';
    const lineLow = line.toLowerCase();
    if (/total\s*comp|\btc\b|equity|rsu/i.test(line)) kind = 'tc';
    else if (/\bote\b/i.test(line)) kind = 'ote';
    else if (/\bbase\b/i.test(line) || /\bsalary\b/i.test(line)) kind = 'base';
    else if (/total\s*comp|\btc\b|equity|rsu/i.test(ctx)) kind = 'tc';
    else if (/\bote\b/i.test(ctx)) kind = 'ote';
    else if (/\bbase\b/i.test(ctx)) kind = 'base';
    else kind = 'unknown';

    // Score: HEAVILY favor the JD-stated row (the actual offer for THIS role)
    // and DOWN-weight reference rows like "Anthropic Product Manager TC", "US comparison", "Glassdoor avg"
    let score = 0;
    // Strong JD signals — this is the actual offer for THIS role
    if (/\b(jd|stated|posting|job\s*description|role\s+pays|range\s+is|advertised|listed)\b/i.test(line)) score += 8;
    if (/^\|\s*JD/i.test(line)) score += 6;  // table row starting "| JD"
    // Offer-level signals
    if (/\b(this\s+role|this\s+position|this\s+job)\b/i.test(line)) score += 5;
    // Tony's projection (often a useful summary number)
    if (/\b(estimated\s+tony|tony.{0,20}tc|realistic\s+total|tony.{0,20}target)\b/i.test(line)) score += 2;
    // Down-weight reference / market-comp rows
    if (/\b(levels\.fyi|glassdoor|payscale|6figr|himalayas|paysa|levels\b|teamblind|blind\b)\b/i.test(line)) score -= 4;
    if (/\b(comparison|reference|market|equivalent|industry|average|median|context|benchmark)\b/i.test(line)) score -= 3;
    if (/\b(other\s+role|different\s+role|product\s+manager\s+tc|engineering\s+manager\s+tc|business\s+ops\s+tc|principal\b|director\s+level|fte\b|full[- ]time\s+context)\b/i.test(line)) score -= 5;
    // Down-weight other-company anchors (e.g. report on Airtable but line says "Anthropic")
    if (company) {
      const ourCo = String(company).toLowerCase().trim();
      const otherPremium = ['anthropic','openai','nvidia','google','deepmind','stripe','databricks','meta','apple','airbnb','figma'];
      for (const oc of otherPremium) {
        if (oc !== ourCo && new RegExp('\\b' + oc + '\\b', 'i').test(line)) {
          score -= 3;
          break;
        }
      }
    }
    // Down-weight ARR / valuation / revenue / headcount mentions
    if (/\b(arr|annual\s+recurring\s+revenue|valuation|raised|funding|series\s+[a-h]\b|revenue|ipo|market\s+cap|aum\b)\b/i.test(line)) score -= 6;
    // Mild kind preferences
    if (kind === 'base') score += 2;
    if (kind === 'ote') score += 1;
    if (kind === 'tc') score += 0;
    if (currency === 'USD') score += 1;

    candidates.push({ low, high, currency, kind, score, ctx, line: line.slice(0, 80) });
  }

  if (!candidates.length) {
    // Fallback: a single number (no range), e.g., "$300K base"
    const singleRe = /([\$£€₹])\s*([\d.,]+)\s*([KkMm])?/g;
    while ((m = singleRe.exec(blockText)) !== null) {
      const ctx = blockText.slice(Math.max(0, m.index - 60), m.index + m[0].length + 80);
      const line = lineOf(m.index);
      const val = parseAmount(m[2] + (m[3] || ''));
      if (!isFinite(val) || val < 1000) continue;
      // Same upper-bound + ARR filter as the range path
      if (val >= 5_000_000) continue;
      if (/\b(arr|annual\s+recurring\s+revenue|valuation|raised|funding|series\s+[a-h]\b|revenue|ipo|market\s+cap|aum\b)\b/i.test(line)) continue;
      const currency = m[1] === '£' ? 'GBP' : m[1] === '€' ? 'EUR' : m[1] === '₹' ? 'INR' : detectCurrency(ctx);
      // Score: only keep singletons that explicitly say comp/salary/base/TC/OTE
      let score = 0;
      if (/\b(salary|base|comp|tc|ote|stipend|annual\s+pay)\b/i.test(line)) score += 3;
      else continue; // skip lone $ amounts in pure prose — too noisy
      candidates.push({ low: val, high: val, currency, kind: /base/i.test(line) ? 'base' : /\bote\b/i.test(line) ? 'ote' : /\btc\b/i.test(line) ? 'tc' : 'unknown', score, ctx });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // Display
  const fmt = (n, cur) => {
    const symMap = { USD: '$', GBP: '£', EUR: '€', INR: '₹', CAD: 'C$', CHF: 'Fr', AUD: 'A$', SGD: 'S$' };
    const sym = symMap[cur] || '$';
    if (n >= 1_000_000) return sym + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1000) return sym + Math.round(n / 1000) + 'K';
    return sym + n;
  };
  const display = best.low === best.high
    ? fmt(best.low, best.currency) + ' ' + best.kind
    : fmt(best.low, best.currency) + '-' + fmt(best.high, best.currency).replace(/^[^\d]+/, '') + ' ' + best.kind;

  const lowUSD = toUSD(best.low, best.currency);
  const highUSD = toUSD(best.high, best.currency);
  const premium = PREMIUM_COMPANIES.has((company || '').toLowerCase().trim());

  return {
    display: display.trim(),
    lowUSD, highUSD,
    currency: best.currency,
    kind: best.kind,
    premium,
  };
}

async function getCompForReport(reportLink, company) {
  if (!reportLink) {
    const premium = PREMIUM_COMPANIES.has((company || '').toLowerCase().trim());
    return premium ? { display: '—', lowUSD: 0, highUSD: 0, currency: 'USD', kind: 'unknown', premium: true } : null;
  }
  if (compCache.has(reportLink)) return compCache.get(reportLink);
  // Defense-in-depth: reportLink comes from user-controlled applications.md,
  // so confine reads to REPORTS_DIR via the path-traversal sanitizer.
  const safe = resolveSafeReportPath(reportLink);
  if (!safe) {
    compCache.set(reportLink, null);
    return null;
  }
  try {
    const text = await fs.readFile(safe, 'utf8');
    const comp = extractCompFromReport(text, company);
    compCache.set(reportLink, comp);
    return comp;
  } catch {
    compCache.set(reportLink, null);
    return null;
  }
}

// "High-paying" qualifier: >= $200K base OR >= $300K TC/OTE OR premium company
function isHighPaying(comp) {
  if (!comp) return false;
  if (comp.premium) return true;
  if (!isFinite(comp.lowUSD) || comp.lowUSD === 0) return false;
  const top = Math.max(comp.lowUSD, comp.highUSD || 0);
  if (comp.kind === 'base' && top >= 200_000) return true;
  if ((comp.kind === 'tc' || comp.kind === 'ote') && top >= 300_000) return true;
  // Unknown kind: be permissive, treat as base
  if (comp.kind === 'unknown' && top >= 200_000) return true;
  return false;
}

// Sort key for comp (descending = highest first). Premium gets a bonus.
function compSortKey(comp) {
  if (!comp) return 0;
  const top = Math.max(comp.lowUSD || 0, comp.highUSD || 0);
  return top + (comp.premium ? 50_000 : 0);
}

// ── Parse pipeline.md ─────────────────────────────────────────────────────────

function parsePipelineUrls(content) {
  const pending = [], processed = [];
  let inPending = false, inProcessed = false;
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (t === '## Pending') { inPending = true; inProcessed = false; continue; }
    if (t === '## Processed') { inPending = false; inProcessed = true; continue; }
    if (t.startsWith('## ')) { inPending = false; inProcessed = false; continue; }
    const m = t.match(/^-\s*\[(x| )\]\s*(https?:\/\/\S+)/i);
    if (!m) continue;
    const item = { url: m[2], done: m[1].toLowerCase() === 'x' };
    if (inPending) pending.push(item); else if (inProcessed) processed.push(item);
  }
  return { pending, processed };
}

// ── Load and shape application data ──────────────────────────────────────────

async function autoMergeTrackerAdditions() {
  try {
    const addDir = path.join(ROOT, 'batch', 'tracker-additions');
    const files = await fs.readdir(addDir).catch(() => []);
    const pending = files.filter(f => f.endsWith('.tsv'));
    if (pending.length === 0) return;
    await new Promise((resolve) => {
      const proc = spawn('node', [path.join(ROOT, 'merge-tracker.mjs')], { cwd: ROOT, stdio: 'ignore' });
      proc.on('close', resolve);
      proc.on('error', resolve);
    });
  } catch {}
}

async function loadData() {
  await autoMergeTrackerAdditions();
  let appsContent = '', pipelineContent = '';
  try { appsContent = await fs.readFile(path.join(DATA_DIR, 'applications.md'), 'utf8'); } catch {}
  try { pipelineContent = await fs.readFile(path.join(DATA_DIR, 'pipeline.md'), 'utf8'); } catch {}

  const rawRows = parseMarkdownTable(appsContent)
    .filter(r => { const n = r['#']||r['num']||''; return n && /\d/.test(n); })
    .map(r => {
      const num     = stripMd(r['#']||r['num']||'');
      const date    = stripMd(r['date']||'');
      const company = stripMd(r['company']||'');
      const role    = stripMd(r['role']||'');
      const score   = stripMd(r['score']||'');
      const status  = stripMd(r['status']||'').toLowerCase();
      const pdf     = r['pdf']||'';
      const report  = r['report']||'';
      const notes   = stripMd(r['notes']||'');
      const reportLink = report.match(/\[.*?\]\((.*?)\)/)?.[1] || '';
      const hasPdf  = pdf.includes('✅') || pdf.toLowerCase() === 'yes';
      const age     = daysSince(date);
      const needsFollowUp = ['applied','responded'].includes(status) && age !== null && age >= 7;
      return { num, date, company, role, score, status, hasPdf, reportLink, notes, age, needsFollowUp };
    });

  // Attach comp data — concurrent reads, but capped to avoid file-handle blowup on 800+ reports
  const CONCURRENCY = 20;
  const applications = [];
  for (let i = 0; i < rawRows.length; i += CONCURRENCY) {
    const slice = rawRows.slice(i, i + CONCURRENCY);
    const enriched = await Promise.all(slice.map(async (a) => {
      const comp = await getCompForReport(a.reportLink, a.company);
      return {
        ...a,
        comp: comp ? comp.display : null,
        compLow: comp ? comp.lowUSD : 0,
        compHigh: comp ? comp.highUSD : 0,
        compKind: comp ? comp.kind : null,
        compPremium: !!(comp && comp.premium),
        highPaying: isHighPaying(comp),
        compSort: compSortKey(comp),
      };
    }));
    applications.push(...enriched);
  }

  const pipeline = parsePipelineUrls(pipelineContent);

  // Today's activity (uses local date, not UTC)
  const today = new Date();
  const todayStr = today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');
  const todayApps = applications.filter(a => a.date === todayStr);

  const stats = {
    total:     applications.length,
    evaluated: applications.filter(a => a.status==='evaluated').length,
    applied:   applications.filter(a => a.status==='applied').length,
    responded: applications.filter(a => a.status==='responded').length,
    interview: applications.filter(a => a.status==='interview').length,
    offer:     applications.filter(a => a.status==='offer').length,
    rejected:  applications.filter(a => a.status==='rejected').length,
    discarded: applications.filter(a => a.status==='discarded').length,
    skip:      applications.filter(a => a.status==='skip').length,
    followUp:  applications.filter(a => a.needsFollowUp).length,
    pending:   pipeline.pending.filter(p => !p.done).length + pipeline.processed.filter(p => !p.done).length,
    highPaying: applications.filter(a => a.highPaying && a.status === 'evaluated').length,
    today: {
      date: todayStr,
      applied:    todayApps.filter(a => a.status === 'applied').length,
      evaluated:  todayApps.filter(a => a.status === 'evaluated').length,
      interview:  todayApps.filter(a => a.status === 'interview').length,
      total:      todayApps.length,
    },
  };

  return { applications, pipeline, stats, updatedAt: new Date().toISOString() };
}

// ── Status update: write back to applications.md ──────────────────────────────

async function updateApplicationStatus(num, newStatus) {
  const filePath = path.join(DATA_DIR, 'applications.md');
  let content;
  try { content = await fs.readFile(filePath, 'utf8'); } catch { throw new Error('applications.md not found'); }

  const lines = content.split('\n');
  let updated = false;

  const newLines = lines.map(line => {
    if (!line.trim().startsWith('|')) return line;
    const cells = line.trim().slice(1,-1).split('|').map(c => c.trim());
    if (cells[0] !== num) return line;

    // Detect column order: find status column (contains known statuses)
    const statusWords = ['evaluated','applied','responded','interview','offer','rejected','discarded','skip'];
    const statusIdx = cells.findIndex((c,i) => i > 0 && statusWords.includes(c.toLowerCase()));
    if (statusIdx < 0) return line;

    cells[statusIdx] = newStatus;
    updated = true;
    return '| ' + cells.join(' | ') + ' |';
  });

  if (!updated) throw new Error(`Row #${num} not found`);
  await fs.writeFile(filePath, newLines.join('\n'), 'utf8');
  return true;
}

// ── Gmail: HTTPS helper ───────────────────────────────────────────────────────

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
  });
}

function httpsPost(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = typeof data === 'string' ? data : new URLSearchParams(data).toString();
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname, port: 443, path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), ...headers }
    };
    const req = https.request(opts, res => {
      let rb = ''; res.on('data', c => { rb += c; }); res.on('end', () => resolve({ status: res.statusCode, body: rb }));
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ── Gmail: MIME body decoder ─────────────────────────────────────────────────

function decodeBase64Url(str) {
  if (!str) return '';
  return Buffer.from(str, 'base64url').toString('utf8');
}

function extractTextFromPayload(payload) {
  if (!payload) return '';
  if (payload.body?.data && (payload.mimeType === 'text/plain' || payload.mimeType === 'text/html')) {
    const text = decodeBase64Url(payload.body.data);
    return payload.mimeType === 'text/html' ? text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : text;
  }
  if (payload.parts) {
    const plain = payload.parts.find(p => p.mimeType === 'text/plain');
    if (plain?.body?.data) return decodeBase64Url(plain.body.data);
    const html = payload.parts.find(p => p.mimeType === 'text/html');
    if (html?.body?.data) return decodeBase64Url(html.body.data).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    for (const part of payload.parts) {
      const nested = extractTextFromPayload(part);
      if (nested) return nested;
    }
  }
  return '';
}

function extractVerificationCodes(bodyText, subject) {
  const text = (bodyText || '') + ' ' + (subject || '');
  const codes = [];
  const patterns = [
    { re: /(?:code|verification|OTP|confirm|pin|passcode)[\s:is]*(\d{4,8})/i, type: 'numeric' },
    { re: /(\d{4,8})[\s]*(?:is your|verification|code|OTP|passcode)/i, type: 'numeric' },
    { re: /(?:enter|use)[\s:]*(\d{4,8})/i, type: 'numeric' },
  ];
  for (const { re, type } of patterns) {
    const m = text.match(re);
    if (m) { codes.push({ type, value: m[1] }); break; }
  }
  if (!codes.length && /verif|confirm|code/i.test(subject)) {
    const m = text.match(/\b(\d{6})\b/);
    if (m) codes.push({ type: 'numeric', value: m[1] });
  }
  const linkRe = /https?:\/\/[^\s"'<>]+(?:verify|confirm|activate|validate)[^\s"'<>]*/i;
  const linkM = text.match(linkRe);
  if (linkM) codes.push({ type: 'link', value: linkM[0] });
  return codes;
}

// ── Gmail: Token management ───────────────────────────────────────────────────

let gmailTokens = null;

async function loadTokens() {
  try {
    const raw = await fs.readFile(TOKENS_FILE, 'utf8');
    gmailTokens = JSON.parse(raw);
  } catch { gmailTokens = null; }
}

async function saveTokens(tokens) {
  gmailTokens = { ...tokens, saved_at: Date.now() };
  await fs.writeFile(TOKENS_FILE, JSON.stringify(gmailTokens, null, 2), 'utf8');
}

async function refreshAccessToken() {
  if (!gmailTokens?.refresh_token) return null;
  const res = await httpsPost('https://oauth2.googleapis.com/token', {
    client_id: GMAIL_CLIENT_ID,
    client_secret: GMAIL_CLIENT_SECRET,
    refresh_token: gmailTokens.refresh_token,
    grant_type: 'refresh_token',
  });
  if (res.status !== 200) return null;
  const data = JSON.parse(res.body);
  gmailTokens = { ...gmailTokens, ...data, expiry: Date.now() + (data.expires_in * 1000) };
  await fs.writeFile(TOKENS_FILE, JSON.stringify(gmailTokens, null, 2), 'utf8');
  return gmailTokens.access_token;
}

async function getAccessToken() {
  if (!gmailTokens) return null;
  if (!gmailTokens.expiry || Date.now() > gmailTokens.expiry - 60000) {
    return await refreshAccessToken();
  }
  return gmailTokens.access_token;
}

function getAuthUrl(state = '') {
  const params = new URLSearchParams({
    client_id: GMAIL_CLIENT_ID,
    redirect_uri: GMAIL_REDIRECT_URI,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code) {
  const res = await httpsPost('https://oauth2.googleapis.com/token', {
    code,
    client_id: GMAIL_CLIENT_ID,
    client_secret: GMAIL_CLIENT_SECRET,
    redirect_uri: GMAIL_REDIRECT_URI,
    grant_type: 'authorization_code',
  });
  if (res.status !== 200) throw new Error('Token exchange failed: ' + res.body);
  const data = JSON.parse(res.body);
  await saveTokens({ ...data, expiry: Date.now() + (data.expires_in * 1000) });
  return data;
}

// ── Gmail: Inbox scanner ──────────────────────────────────────────────────────

const INTERVIEW_SIGNALS = ['interview','next steps','schedule a call','phone screen','video call',
  'coding challenge','technical assessment','hired','offer extended','move forward'];
const REJECTION_SIGNALS = ['unfortunately','not moving forward','position has been filled',
  'other candidates','doesn\'t meet','won\'t be moving','no longer considering',
  'decided to move in a different direction','position has been closed'];
const RECEIVED_SIGNALS  = ['received your application','thank you for applying','we\'ll be in touch',
  'application has been received','keep your application'];
const VERIFICATION_SIGNALS = ['verification code','verify your email','confirm your email',
  'one-time password','security code','your code is','enter this code',
  'otp','confirmation link','click to verify','verify your account','passcode'];

function detectSignal(subject, snippet, bodyText, from) {
  const text = (subject + ' ' + snippet + ' ' + (bodyText || '')).toLowerCase();
  if (VERIFICATION_SIGNALS.some(s => text.includes(s))) {
    const codes = extractVerificationCodes(bodyText || snippet, subject);
    if (codes.length > 0) return { type: 'verification', codes };
  }
  if (INTERVIEW_SIGNALS.some(s => text.includes(s))) return { type: 'interview' };
  if (REJECTION_SIGNALS.some(s => text.includes(s))) return { type: 'rejected' };
  if (RECEIVED_SIGNALS.some(s => text.includes(s))) return { type: 'received' };
  return { type: 'other' };
}

let gmailCache = { signals: [], scanned_at: null };
let verificationCodes = [];

async function loadGmailCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    gmailCache = JSON.parse(raw);
  } catch { gmailCache = { signals: [], scanned_at: null }; }
}

async function saveGmailCache() {
  await fs.writeFile(CACHE_FILE, JSON.stringify(gmailCache, null, 2), 'utf8');
}

async function gmailApiGet(endpoint, token) {
  const base = 'https://gmail.googleapis.com/gmail/v1/users/me/';
  return httpsGet(base + endpoint, { Authorization: 'Bearer ' + token });
}

async function scanGmailInbox() {
  const token = await getAccessToken();
  if (!token) return;

  // Load companies from applications.md to match against
  let appsContent = '';
  try { appsContent = await fs.readFile(path.join(DATA_DIR, 'applications.md'), 'utf8'); } catch { return; }
  const apps = parseMarkdownTable(appsContent)
    .filter(r => r['#'] && /\d/.test(r['#']||''))
    .map(r => ({ num: stripMd(r['#']||r['num']||''), company: stripMd(r['company']||''), status: stripMd(r['status']||'').toLowerCase() }));

  if (!apps.length) return;

  // Fetch recent messages (last 14 days, job-related senders)
  const q = encodeURIComponent('newer_than:14d');
  const listRes = await gmailApiGet(`messages?q=${q}&maxResults=100`, token);
  if (listRes.status !== 200) return;

  let messages;
  try { messages = JSON.parse(listRes.body).messages || []; } catch { return; }

  const signals = [];

  for (const msg of messages.slice(0, 50)) {
    const msgRes = await gmailApiGet(`messages/${msg.id}?format=full`, token);
    if (msgRes.status !== 200) continue;

    let parsed;
    try { parsed = JSON.parse(msgRes.body); } catch { continue; }

    const headers = parsed.payload?.headers || [];
    const from    = headers.find(h => h.name === 'From')?.value || '';
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const date    = headers.find(h => h.name === 'Date')?.value || '';
    const snippet = parsed.snippet || '';
    const bodyText = extractTextFromPayload(parsed.payload);

    // Match against companies
    const matched = apps.find(a => {
      const name = a.company.toLowerCase();
      return from.toLowerCase().includes(name) || subject.toLowerCase().includes(name);
    });
    if (!matched) continue;

    const signal = detectSignal(subject, snippet, bodyText, from);
    if (signal.type === 'other') continue;

    // Don't re-surface already-closed applications for non-status-changing signals
    const done = ['rejected','discarded','skip','offer'].includes(matched.status);
    if (done && signal.type === 'received') continue;

    const signalObj = {
      id: msg.id,
      num: matched.num,
      company: matched.company,
      currentStatus: matched.status,
      signal: signal.type,
      codes: signal.codes || [],
      subject: subject.substring(0, 120),
      snippet: snippet.substring(0, 200),
      from: from.substring(0, 80),
      date,
      suggestedStatus: signal.type === 'interview' ? 'Interview' : signal.type === 'rejected' ? 'Rejected' : signal.type === 'verification' ? null : 'Responded',
      dismissed: false,
    };
    signals.push(signalObj);

    // Store verification codes for quick access
    if (signal.type === 'verification' && signal.codes?.length) {
      const now = Date.now();
      for (const c of signal.codes) {
        if (!verificationCodes.some(v => v.value === c.value && v.messageId === msg.id)) {
          verificationCodes.push({
            value: c.value, type: c.type, company: matched.company,
            from: from.substring(0, 80), subject: subject.substring(0, 120),
            receivedAt: now, expiresAt: now + 10 * 60 * 1000, messageId: msg.id,
          });
        }
      }
      verificationCodes = verificationCodes.filter(v => v.expiresAt > now);
    }
  }

  // Merge with existing cache (keep dismissed state, avoid dups)
  const existingById = Object.fromEntries((gmailCache.signals||[]).map(s => [s.id, s]));
  const merged = signals.map(s => ({ ...s, dismissed: existingById[s.id]?.dismissed || false }));
  gmailCache = { signals: merged, scanned_at: new Date().toISOString() };
  await saveGmailCache();
}

let scanInterval = null;
let fastPollingActive = false;

function startGmailPolling(fast = false) {
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) return;
  clearInterval(scanInterval);
  fastPollingActive = fast;
  const interval = fast ? 15 * 1000 : 5 * 60 * 1000;
  scanInterval = setInterval(() => { scanGmailInbox().catch(() => {}); }, interval);
  scanGmailInbox().catch(() => {});
}

function setFastPolling(active) {
  if (fastPollingActive === active) return;
  if (gmailTokens?.refresh_token) startGmailPolling(active);
}

// ── Auto-apply: state + profile loader + Playwright orchestrator ─────────────

let autoApplyState = {
  active: false, mode: 'auto', queue: [], current: null,
  completed: [], startedAt: null, stoppable: true,
};

// Wizard PDF generation tracking — read by /api/onboard/pdf-status.
let lastPdfGenStart = 0;
let lastPdfGenError = null;

let autopilotState = {
  running: false, applied: 0, failed: 0, skipped: 0,
  currentCompany: null, currentStep: null, startedAt: null,
  threshold: 3.5,
  log: [],       // { ts, num, company, role, status, error?, url? }
  cycles: 0,
};

const AUTOPILOT_LOG_FILE = path.join(DATA_DIR, 'autopilot-log.json');
// Apps that need manual apply (CAPTCHA, no-form, Ashby, etc.) — persists across restarts
const AUTOPILOT_MANUAL_FILE = path.join(DATA_DIR, 'autopilot-manual.json');

async function loadManualSkips() {
  try {
    const raw = await fs.readFile(AUTOPILOT_MANUAL_FILE, 'utf8');
    const data = JSON.parse(raw);
    return new Set((data.nums || []).map(String));
  } catch { return new Set(); }
}

async function saveManualSkip(num, reason) {
  try {
    let data = { nums: [], reasons: {} };
    try {
      const raw = await fs.readFile(AUTOPILOT_MANUAL_FILE, 'utf8');
      data = JSON.parse(raw);
    } catch {}
    const key = String(num);
    if (!data.nums.includes(key)) data.nums.push(key);
    data.reasons = data.reasons || {};
    data.reasons[key] = reason || 'needs manual apply';
    await fs.writeFile(AUTOPILOT_MANUAL_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

async function saveAutopilotLog() {
  try {
    await fs.writeFile(AUTOPILOT_LOG_FILE, JSON.stringify({
      applied: autopilotState.applied,
      failed: autopilotState.failed,
      skipped: autopilotState.skipped,
      cycles: autopilotState.cycles,
      startedAt: autopilotState.startedAt,
      log: autopilotState.log.slice(-200),
    }, null, 2), 'utf8');
  } catch {}
}

async function loadAutopilotLog() {
  try {
    const raw = await fs.readFile(AUTOPILOT_LOG_FILE, 'utf8');
    const data = JSON.parse(raw);
    autopilotState.log = data.log || [];
  } catch {}
}

async function findChromiumPath() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    // Windows Chrome
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    path.join('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join('C:', 'Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    // Windows Edge
    path.join('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join('C:', 'Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    // Linux
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean);
  for (const p of candidates) {
    try { await fs.access(p); return p; } catch {}
  }
  return undefined;
}

async function launchBrowser() {
  const pw = await import('playwright');
  const execPath = await findChromiumPath();
  const isDocker = await fs.access('/.dockerenv').then(() => true).catch(() => false);

  // WATERFALL:
  // 1. Non-headless on Windows/Mac (visible browser, user can solve CAPTCHAs)
  // 2. Headless in Docker (fallback, CAPTCHAs will block)
  const strategies = isDocker
    ? [{ headless: true, name: 'Docker headless' }]
    : [
        { headless: false, name: 'Visible browser (CAPTCHA-ready)' },
        { headless: true, name: 'Headless fallback' },
      ];

  for (const strat of strategies) {
    try {
      console.log(`Autopilot: trying ${strat.name}...`);
      const browser = await pw.chromium.launch({
        headless: strat.headless,
        ...(execPath ? { executablePath: execPath } : {}),
        args: [
          '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1280,900',
        ],
      });
      console.log(`Autopilot: launched ${strat.name}`);
      return { pw, browser, mode: strat.name };
    } catch (err) {
      console.log(`Autopilot: ${strat.name} failed: ${err.message.substring(0, 80)}`);
    }
  }
  throw new Error('All browser launch strategies failed');
}

async function loadProfile() {
  const p = { full_name: '', email: '', phone: '', location: '', linkedin: '' };
  try {
    const yml = await fs.readFile(path.join(CONFIG_DIR, 'profile.yml'), 'utf8');
    const get = (key) => { const m = yml.match(new RegExp(`${key}:\\s*"?([^"\\n]+)"?`)); return m ? m[1].trim() : ''; };
    p.full_name = get('full_name');
    p.email = get('email');
    p.phone = get('phone');
    p.location = get('location');
    p.linkedin = get('linkedin');
  } catch {}
  return p;
}

async function runAutoApply() {
  let browser = null;
  try {
    const profile = await loadProfile();
    const launched = await launchBrowser();
    browser = launched.browser;
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    while (autoApplyState.queue.length > 0) {
      if (!autoApplyState.stoppable) break;
      const item = autoApplyState.queue.shift();
      autoApplyState.current = { ...item, step: 'Opening page' };

      try {
        const page = await context.newPage();
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        autoApplyState.current.step = 'Detecting form fields';

        // Detect platform from URL
        const url = item.url.toLowerCase();
        let filled = false;

        if (url.includes('greenhouse.io') || url.includes('boards.greenhouse')) {
          filled = await fillGreenhouseForm(page, profile);
        } else if (url.includes('lever.co') || url.includes('jobs.lever')) {
          filled = await fillLeverForm(page, profile);
        } else if (url.includes('ashbyhq.com')) {
          filled = await fillAshbyForm(page, profile);
        } else {
          filled = await fillGenericForm(page, profile);
        }

        // Check if verification code is needed (require BOTH a code input field AND explicit "sent code" language)
        autoApplyState.current.step = filled ? 'Checking for verification' : 'No form fields found';
        const pageText = await page.textContent('body').catch(() => '');
        const codeInputExists = await page.locator('input[name*="code"], input[name*="otp"], input[name*="token"], input[placeholder*="code" i], input[placeholder*="otp" i], input[maxlength="6"], input[maxlength="4"]').count();
        const sentCodeText = /we sent|sent a code|enter the code|check your email.*code|code was sent|verify your email.*code|enter.*verification code/i.test(pageText);
        if (codeInputExists > 0 && sentCodeText) {
          autoApplyState.current.step = 'Waiting for verification code...';
          const code = await waitForVerificationCode(item.company, 180000);
          if (code) {
            autoApplyState.current.step = 'Entering verification code: ' + code;
            const codeInput = page.locator('input[type="text"], input[type="number"], input[name*="code"], input[name*="otp"], input[placeholder*="code"]').first();
            await codeInput.fill(code, { timeout: 5000 }).catch(() => {});
          }
        }

        // Submit if auto mode
        if (autoApplyState.mode === 'auto' && filled) {
          autoApplyState.current.step = 'Submitting application';
          const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Apply"), button:has-text("Send")').first();
          await submitBtn.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(2000);
        }

        // Mark as Applied in tracker
        await updateApplicationStatus(item.num, 'Applied').catch(() => {});
        autoApplyState.completed.push({ num: item.num, company: item.company, status: 'success' });
        await page.close();
      } catch (err) {
        autoApplyState.completed.push({ num: item.num, company: item.company, status: 'failed', error: err.message.substring(0, 100) });
      }
    }
  } catch (err) {
    // Playwright not available or launch failed
    for (const item of autoApplyState.queue) {
      autoApplyState.completed.push({ num: item.num, company: item.company, status: 'failed', error: 'Browser error: ' + err.message.substring(0, 80) });
    }
    autoApplyState.queue = [];
  } finally {
    if (browser) await browser.close().catch(() => {});
    autoApplyState.active = false;
    autoApplyState.current = null;
    setFastPolling(false);
  }
}

async function waitForVerificationCode(company, timeoutMs) {
  const start = Date.now();
  const companyLower = company.toLowerCase();
  while (Date.now() - start < timeoutMs) {
    const now = Date.now();
    verificationCodes = verificationCodes.filter(v => v.expiresAt > now);
    const match = verificationCodes.find(v =>
      v.company.toLowerCase().includes(companyLower) && v.type === 'numeric'
    );
    if (match) return match.value;
    await new Promise(r => setTimeout(r, 10000));
    await scanGmailInbox().catch(() => {});
  }
  return null;
}

// ── Autopilot loop ──

async function runAutopilot() {
  if (autopilotState.running) return;
  autopilotState.running = true;
  autopilotState.applied = 0;
  autopilotState.failed = 0;
  autopilotState.skipped = 0;
  autopilotState.cycles = 0;
  autopilotState.log = [];
  autopilotState.startedAt = new Date().toISOString();
  setFastPolling(true);
  await loadAutopilotLog();

  const addLog = (num, company, role, status, error, url) => {
    autopilotState.log.push({ ts: new Date().toISOString(), num, company, role, status, error: error || null, url: url || null });
    if (autopilotState.log.length > 200) autopilotState.log = autopilotState.log.slice(-200);
    saveAutopilotLog().catch(() => {});
  };

  // Track apps that need manual apply — persists across restarts via file
  const manualSkips = await loadManualSkips();
  // Track apps skipped this session (in-memory) — includes manual skips loaded from file
  const sessionSkipped = new Set([...manualSkips]);

  // Outer loop: auto-restart browser on crash
  while (autopilotState.running) {
    let browser = null;
    try {
      const profile = await loadProfile();
      autopilotState.currentStep = 'Launching browser...';
      const launched = await launchBrowser();
      browser = launched.browser;
      autopilotState.currentStep = launched.mode;
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
      });
      // Hide automation flags
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      // Inner loop: process eligible roles
      while (autopilotState.running) {
        const data = await loadData();
        const eligible = data.applications.filter(a =>
          a.status === 'evaluated' &&
          parseFloat(a.score) >= autopilotState.threshold &&
          !sessionSkipped.has(String(a.num))
        );

        if (!eligible.length) {
          autopilotState.currentCompany = null;
          autopilotState.currentStep = 'Idle — waiting for new evaluated roles...';
          for (let i = 0; i < 12 && autopilotState.running; i++) {
            await new Promise(r => setTimeout(r, 5000));
          }
          continue;
        }

        autopilotState.cycles++;
        for (const app of eligible) {
          if (!autopilotState.running) break;

          // Get URL from report — use reportLink field (e.g. "reports/097-anthropic-....md")
          let url = null;
          if (app.reportLink) {
            const reportPath = path.join(ROOT, app.reportLink);
            try {
              const content = await fs.readFile(reportPath, 'utf8');
              const m = content.match(/\*\*URL[^:*]*:\*\*\s*(https?:\/\/[^\s|]+)/);
              url = m ? m[1].trim() : null;
            } catch {}
          }
          // Fallback: search by num with zero-padding
          if (!url) {
            const files = await fs.readdir(REPORTS_DIR).catch(() => []);
            const reportFile = files.find(f => f.startsWith(String(app.num).padStart(3, '0') + '-') || f.startsWith(app.num + '-'));
            if (reportFile) {
              const content = await fs.readFile(path.join(REPORTS_DIR, reportFile), 'utf8');
              const m = content.match(/\*\*URL[^:*]*:\*\*\s*(https?:\/\/[^\s|]+)/);
              url = m ? m[1].trim() : null;
            }
          }
          if (!url) {
            autopilotState.skipped++;
            addLog(app.num, app.company, app.role, 'skipped', 'No URL in report');
            continue;
          }

          autopilotState.currentCompany = app.company;
          autopilotState.currentStep = 'Opening ' + app.company;

          let page = null;
          try {
            page = await context.newPage();
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Step 1: Click the "Apply" button on the job listing to reach the form
            autopilotState.currentStep = 'Looking for Apply button at ' + app.company;
            const applyClicked = await clickApplyButton(page);
            if (applyClicked) {
              await page.waitForTimeout(2000);
              autopilotState.currentStep = 'Apply form opened at ' + app.company;
            }

            // Step 2: Fill the form
            autopilotState.currentStep = 'Filling form at ' + app.company;
            const urlLower = url.toLowerCase();
            let filled = false;
            if (urlLower.includes('greenhouse.io') || urlLower.includes('boards.greenhouse')) {
              filled = await fillGreenhouseForm(page, profile);
            } else if (urlLower.includes('lever.co') || urlLower.includes('jobs.lever')) {
              filled = await fillLeverForm(page, profile);
            } else if (urlLower.includes('ashbyhq.com')) {
              filled = await fillAshbyForm(page, profile);
            } else {
              filled = await fillGenericForm(page, profile);
            }

            // Step 3: Check for verification code (require code input field + explicit "sent code" text)
            const pageText = await page.textContent('body').catch(() => '');
            const codeInputExistsAP = await page.locator('input[name*="code"], input[name*="otp"], input[name*="token"], input[placeholder*="code" i], input[placeholder*="otp" i], input[maxlength="6"], input[maxlength="4"]').count();
            const sentCodeTextAP = /we sent|sent a code|enter the code|check your email.*code|code was sent|verify your email.*code|enter.*verification code/i.test(pageText);
            if (codeInputExistsAP > 0 && sentCodeTextAP) {
              autopilotState.currentStep = 'Waiting for code (' + app.company + ')';
              const code = await waitForVerificationCode(app.company, 120000);
              if (code) {
                autopilotState.currentStep = 'Entering code: ' + code;
                const codeInput = page.locator('input[type="text"], input[type="number"], input[name*="code"], input[name*="otp"], input[placeholder*="code"]').first();
                await codeInput.fill(code, { timeout: 5000 }).catch(() => {});
              }
            }

            // Step 4: SUPERVISOR — verify every field before submitting
            if (filled) {
              autopilotState.currentStep = 'Validating form at ' + app.company;
              const validation = await validateFormBeforeSubmit(page, profile);
              if (!validation.ok) {
                // Fields are wrong — try to fix them
                autopilotState.currentStep = 'Fixing ' + validation.issues.length + ' field(s) at ' + app.company;
                for (const issue of validation.issues) {
                  try {
                    if (issue.fix) {
                      await page.locator('#' + issue.id).click().catch(() => {});
                      await page.locator('#' + issue.id).fill('').catch(() => {});
                      await page.locator('#' + issue.id).type(issue.fix, { delay: 10 }).catch(() => {});
                    }
                  } catch {}
                }
                // Re-validate after fixes
                const recheck = await validateFormBeforeSubmit(page, profile);
                if (!recheck.ok) {
                  autopilotState.failed++;
                  sessionSkipped.add(String(app.num)); // don't retry failed apps this session
                  addLog(app.num, app.company, app.role, 'failed', 'Validation failed: ' + recheck.issues.map(i => i.field + '=' + i.value?.substring(0, 20)).join(', '), url);
                  await page.close().catch(() => {});
                  continue;
                }
              }

              autopilotState.currentStep = 'Submitting at ' + app.company;

              // Click submit
              const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
              await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
              await submitBtn.click({ timeout: 5000 }).catch(async () => {
                const altBtn = page.locator('button:has-text("Submit Application"), button:has-text("Submit"), button:has-text("Send Application")').first();
                await altBtn.click({ timeout: 3000 }).catch(() => {});
              });

              // WATERFALL: Check result → detect CAPTCHA → wait for user → verify
              let submitted = false;
              for (let attempt = 0; attempt < 3 && !submitted; attempt++) {
                await page.waitForTimeout(attempt === 0 ? 5000 : 10000);
                const currentUrl = page.url();
                const bodyText = await page.textContent('body').catch(() => '');

                // Success: redirected to thank-you or confirmation text
                if (/thank you|application.*received|successfully submitted|we.*review|your application/i.test(bodyText) &&
                    !bodyText.includes('Apply for this job')) {
                  submitted = true;
                  await updateApplicationStatus(app.num, 'Applied').catch(() => {});
                  autopilotState.applied++;
                  addLog(app.num, app.company, app.role, 'applied', 'Confirmed submitted', url);
                  break;
                }

                // Check for CAPTCHA or validation errors
                const hasCaptcha = await page.locator('iframe[src*="recaptcha"], iframe[src*="captcha"], .g-recaptcha').count().catch(() => 0);
                const hasErrors = await page.locator('[class*="error"]:visible').count().catch(() => 0);

                if (hasCaptcha > 0) {
                  if (attempt < 2) {
                    // CAPTCHA detected — wait for user to solve it in the visible browser
                    autopilotState.currentStep = 'CAPTCHA at ' + app.company + ' — solve it in the browser window';
                    // Wait up to 90s for user to solve CAPTCHA
                    for (let w = 0; w < 18 && autopilotState.running; w++) {
                      await page.waitForTimeout(5000);
                      const stillCaptcha = await page.locator('iframe[src*="recaptcha"]:visible').count().catch(() => 0);
                      const nowThankYou = /thank you|application.*received|successfully/i.test(await page.textContent('body').catch(() => ''));
                      if (nowThankYou || stillCaptcha === 0) break;
                    }
                    // Check if user solved it and form submitted
                    continue;
                  } else {
                    // CAPTCHA still unsolved on final attempt — needs manual apply
                    autopilotState.failed++;
                    sessionSkipped.add(String(app.num)); // don't retry failed apps this session
                    saveManualSkip(app.num, 'CAPTCHA required').catch(() => {}); // persist across restarts
                    addLog(app.num, app.company, app.role, 'failed', 'CAPTCHA required — needs manual apply', url);
                    submitted = true;
                    break;
                  }
                }

                if (hasErrors > 0) {
                  const errTexts = await page.locator('[class*="error"]:visible').allTextContents().catch(() => []);
                  const resumeMissing = errTexts.some(e => /resume|cv.*required/i.test(e));
                  const termsMissing = errTexts.some(e => /terms|privacy|accept|consent/i.test(e));
                  if (resumeMissing) {
                    // Re-upload resume and retry submit
                    autopilotState.currentStep = 'Re-uploading resume at ' + app.company;
                    try {
                      const cvPdf = path.join(ROOT, 'output', 'tony-walteur-cv.pdf');
                      const cvMd = path.join(ROOT, 'cv.md');
                      let rp = null;
                      try { await fs.access(cvPdf); rp = cvPdf; } catch { try { await fs.access(cvMd); rp = cvMd; } catch {} }
                      if (rp) await page.locator('#resume, input[type="file"]').first().setInputFiles(rp);
                    } catch {}
                    await page.waitForTimeout(1000);
                    await submitBtn.click({ timeout: 3000 }).catch(() => {});
                    continue;
                  }
                  if (termsMissing && attempt < 2) {
                    // Terms not accepted — force-check ALL unchecked checkboxes via JS and retry
                    autopilotState.currentStep = 'Accepting terms at ' + app.company;
                    await page.evaluate(() => {
                      document.querySelectorAll('input[type="checkbox"]:not(:checked)').forEach(cb => {
                        cb.checked = true;
                        cb.dispatchEvent(new Event('change', { bubbles: true }));
                        cb.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                        const lbl = document.querySelector(`label[for="${cb.id}"]`) || cb.closest('label');
                        if (lbl) lbl.click();
                      });
                      document.querySelectorAll('[role="checkbox"]:not([aria-checked="true"])').forEach(el => {
                        el.setAttribute('aria-checked', 'true');
                        el.click();
                      });
                    }).catch(() => {});
                    await page.waitForTimeout(800);
                    await submitBtn.click({ timeout: 3000 }).catch(() => {});
                    continue;
                  }
                  // Other validation errors — log and move on
                  autopilotState.failed++;
                  sessionSkipped.add(String(app.num)); // don't retry failed apps this session
                  addLog(app.num, app.company, app.role, 'failed', 'Validation: ' + errTexts.join('; ').substring(0, 100), url);
                  submitted = true; // exit loop
                  break;
                }

                // No CAPTCHA, no errors, no thank-you — might have silently submitted
                if (attempt === 2) {
                  // Last attempt — mark as submitted (unconfirmed)
                  await updateApplicationStatus(app.num, 'Applied').catch(() => {});
                  autopilotState.applied++;
                  addLog(app.num, app.company, app.role, 'applied', 'Submitted (unconfirmed — check email)', url);
                  submitted = true;
                }
              }
            } else {
              autopilotState.skipped++;
              sessionSkipped.add(String(app.num));
              saveManualSkip(app.num, 'No fillable form found').catch(() => {}); // persist across restarts
              addLog(app.num, app.company, app.role, 'skipped', 'No fillable form found — needs manual apply', url);
            }
          } catch (err) {
            autopilotState.failed++;
            sessionSkipped.add(String(app.num)); // don't retry failed apps this session
            addLog(app.num, app.company, app.role, 'failed', err.message?.substring(0, 120), url);
          } finally {
            if (page) await page.close().catch(() => {});
          }

          // Pause between applications
          if (autopilotState.running) {
            await new Promise(r => setTimeout(r, 3000));
          }
        }

        // Cycle done, wait before next scan
        if (autopilotState.running) {
          autopilotState.currentCompany = null;
          autopilotState.currentStep = 'Cycle ' + autopilotState.cycles + ' done. Next scan in 2 min...';
          for (let i = 0; i < 24 && autopilotState.running; i++) {
            await new Promise(r => setTimeout(r, 5000));
          }
        }
      }
    } catch (err) {
      console.error('Autopilot browser crash:', err.message);
      addLog('-', '-', '-', 'crash', 'Browser crashed: ' + err.message?.substring(0, 100));
      // Auto-restart: close browser, wait 10s, loop will relaunch
      autopilotState.currentStep = 'Browser crashed — restarting in 10s...';
    } finally {
      if (browser) await browser.close().catch(() => {});
    }

    // If still running after crash, wait then auto-restart
    if (autopilotState.running) {
      await new Promise(r => setTimeout(r, 10000));
    }
  }

  // Cleanup when stopped
  autopilotState.running = false;
  autopilotState.currentCompany = null;
  autopilotState.currentStep = null;
  setFastPolling(false);
  await saveAutopilotLog();
}

// ── Click Apply button (navigate from listing to form) ──

async function clickApplyButton(page) {
  // Try platform-specific Apply buttons, then generic patterns
  const selectors = [
    // Greenhouse
    'a#apply_button', 'a.postings-btn', 'a[href*="/application"]',
    'button#apply_button', '.application--header a',
    // Lever
    'a.postings-btn-wrapper', 'a[href*="/apply"]', '.posting-btn-submit',
    // Ashby
    'a[data-testid="apply-button"]', 'button[data-testid="apply-button"]',
    // Generic patterns
    'a:has-text("Apply for this job")', 'a:has-text("Apply Now")',
    'a:has-text("Apply now")', 'a:has-text("Apply")',
    'button:has-text("Apply for this job")', 'button:has-text("Apply Now")',
    'button:has-text("Apply now")', 'button:has-text("Apply")',
    'a:has-text("I\'m interested")', 'button:has-text("I\'m interested")',
    // Workday
    'a[data-automation-id="jobPostingApplyButton"]',
  ];

  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1000 })) {
        await btn.click();
        await page.waitForTimeout(1500);
        return true;
      }
    } catch {}
  }
  return false;
}

// ── Form validation supervisor ──

async function validateFormBeforeSubmit(page, profile) {
  const issues = [];
  const firstName = profile.full_name.split(' ')[0] || '';
  const lastName = profile.full_name.split(' ').slice(1).join(' ') || '';

  // Read back all visible field values
  const fields = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, textarea')).filter(el => el.offsetParent !== null && el.id).map(el => {
      const label = document.querySelector('label[for="' + el.id + '"]')?.textContent?.trim()?.substring(0, 80) ||
                    el.closest('label')?.textContent?.trim()?.substring(0, 80) || el.id;
      return { id: el.id, label: label.toLowerCase(), value: el.value || '', type: el.type };
    });
  });

  // Rule 1: First Name must be exactly the first name, not a paragraph
  const fnField = fields.find(f => f.id === 'first_name' || f.label.includes('first name'));
  if (fnField) {
    if (!fnField.value || fnField.value.length > 30 || fnField.value.includes('years') || fnField.value.includes('enterprise') || fnField.value !== firstName) {
      issues.push({ id: fnField.id, field: 'First Name', value: fnField.value, fix: firstName });
    }
  }

  // Rule 2: Last Name must be exactly the last name
  const lnField = fields.find(f => f.id === 'last_name' || f.label.includes('last name'));
  if (lnField) {
    if (!lnField.value || lnField.value.length > 30 || lnField.value.includes('years') || lnField.value !== lastName) {
      issues.push({ id: lnField.id, field: 'Last Name', value: lnField.value, fix: lastName });
    }
  }

  // Rule 3: Email must be a valid email, not a paragraph
  const emField = fields.find(f => f.id === 'email' || f.label.includes('email'));
  if (emField) {
    if (!emField.value || !emField.value.includes('@') || emField.value.length > 60) {
      issues.push({ id: emField.id, field: 'Email', value: emField.value, fix: profile.email });
    }
  }

  // Rule 4: Phone should look like a phone number
  const phField = fields.find(f => f.id === 'phone' || f.label.includes('phone'));
  if (phField && phField.value) {
    if (phField.value.length > 20 || !/\d{7,}/.test(phField.value.replace(/\D/g, ''))) {
      issues.push({ id: phField.id, field: 'Phone', value: phField.value, fix: profile.phone });
    }
  }

  // Rule 5: No field should contain "I bring" or "enterprise IT transformation" (catch-all leak)
  const leakPatterns = /I bring \d+|enterprise IT transformation|manager-hours|annual savings|ecosystem architecture/i;
  for (const f of fields) {
    if (['first_name', 'last_name', 'email', 'phone', 'country'].includes(f.id) && leakPatterns.test(f.value)) {
      const fix = f.id === 'first_name' ? firstName : f.id === 'last_name' ? lastName : f.id === 'email' ? profile.email : f.id === 'phone' ? profile.phone : profile.location;
      issues.push({ id: f.id, field: f.id, value: f.value.substring(0, 30), fix });
    }
  }

  // Rule 6: Resume should be attached
  const resumeField = fields.find(f => f.id === 'resume' || f.label.includes('resume') || f.label.includes('cv'));
  if (resumeField && resumeField.type === 'file') {
    const fileCount = await page.evaluate(id => document.getElementById(id)?.files?.length || 0, resumeField.id).catch(() => 0);
    if (fileCount === 0) {
      issues.push({ id: resumeField.id, field: 'Resume', value: 'no file', fix: null }); // will trigger re-upload in waterfall
    }
  }

  return { ok: issues.length === 0, issues };
}

// ── Form fillers ──

async function fillGenericForm(page, profile) {
  let filled = false;
  const tryFill = async (selector, value) => {
    if (!value) return;
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 2000 })) { await el.fill(value); filled = true; }
    } catch {}
  };

  // Name fields
  await tryFill('input[name*="name" i][name*="first" i], input[id*="first" i][id*="name" i], input[autocomplete="given-name"]', profile.full_name.split(' ')[0] || '');
  await tryFill('input[name*="name" i][name*="last" i], input[id*="last" i][id*="name" i], input[autocomplete="family-name"]', profile.full_name.split(' ').slice(1).join(' ') || '');
  await tryFill('input[name*="full" i][name*="name" i], input[id*="full" i][id*="name" i], input[autocomplete="name"]', profile.full_name);
  await tryFill('input[type="email"], input[name*="email" i], input[id*="email" i]', profile.email);
  await tryFill('input[type="tel"], input[name*="phone" i], input[id*="phone" i]', profile.phone);
  await tryFill('input[name*="linkedin" i], input[id*="linkedin" i], input[placeholder*="linkedin" i]', profile.linkedin);
  await tryFill('input[name*="location" i], input[name*="city" i], input[id*="location" i]', profile.location);

  // Resume upload
  try {
    const cvPdf = path.join(ROOT, 'output', 'cv.pdf');
    const cvMd = path.join(ROOT, 'cv.md');
    let resumePath = null;
    try { await fs.access(cvPdf); resumePath = cvPdf; } catch {
      try { await fs.access(cvMd); resumePath = cvMd; } catch {}
    }
    if (resumePath) {
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.count() > 0) { await fileInput.setInputFiles(resumePath); filled = true; }
    }
  } catch {}

  return filled;
}

async function fillGreenhouseForm(page, profile) {
  let filled = false;
  const tryFill = async (selector, value) => {
    if (!value) return;
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 2000 })) { await el.fill(value); filled = true; }
    } catch {}
  };

  // --- PHASE 1: Fill custom questions FIRST (dropdowns re-render the form) ---
  // Wait for React to fully render all custom questions
  await page.waitForTimeout(2000);
  try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}

  // Custom questions — fill by label matching (with textarea fallback scan)
  const questionMap = await page.evaluate(() => {
    const result = [];
    const seen = new Set();
    // Primary: walk all labels
    document.querySelectorAll('label').forEach(label => {
      const text = label.textContent?.trim() || '';
      const input = label.querySelector('input, textarea, select') ||
                    (label.htmlFor ? document.getElementById(label.htmlFor) : null);
      if (input && input.id && text.length > 5 && !seen.has(input.id)) {
        seen.add(input.id);
        result.push({ id: input.id, tag: input.tagName, text: text.substring(0, 200) });
      }
    });
    // Fallback: scan all question textareas/inputs not yet captured
    document.querySelectorAll('textarea[id], input[id^="question_"], input[id^="s3_"]').forEach(el => {
      if (seen.has(el.id)) return;
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      const text = lbl?.textContent?.trim() || el.placeholder || '';
      if (text.length > 5) {
        seen.add(el.id);
        result.push({ id: el.id, tag: el.tagName, text: text.substring(0, 200) });
      }
    });
    return result;
  });

  for (const q of questionMap) {
    const t = q.text.toLowerCase();
    let answer = null;

    // LinkedIn
    if (t.includes('linkedin')) answer = profile.linkedin || 'linkedin.com/in/tonywalteur';
    // Website / portfolio
    else if (t.includes('website') || t.includes('portfolio') || t.includes('github')) answer = profile.linkedin || '';
    // Visa sponsorship
    else if (t.includes('visa') || t.includes('sponsorship') || t.includes('authorized') || t.includes('employment eligibility')) answer = 'Yes, I will require visa sponsorship for US-based roles. I am a Canadian citizen/resident.';
    // Relocation
    else if (t.includes('relocation') || t.includes('relocate') || t.includes('open to')) {
      if (t.includes('relocat')) answer = 'Yes, I am open to relocation for this role.';
      else if (t.includes('in-person') || t.includes('office')) answer = 'Yes, I am open to working in-person / hybrid.';
      else answer = 'Yes';
    }
    // Start date / earliest
    else if (t.includes('start') || t.includes('earliest') || t.includes('available')) answer = 'Available immediately — can start within 2-3 weeks.';
    // Timeline / deadlines
    else if (t.includes('deadline') || t.includes('timeline') || t.includes('consideration')) answer = 'No hard deadlines. I am actively interviewing and can prioritize.';
    // Why company
    else if (t.includes('why anthropic') || t.includes('why do you want') || t.includes('interest in')) answer = 'I built Jarvis — an agentic AI management platform on the Claude API and MCP — delivering $40M+ in projected annual savings for 1,800 managers. I am deeply invested in the Anthropic ecosystem: fully certified across the Claude stack (API, MCP Advanced, Subagents, Claude Code), with production experience deploying Claude in regulated enterprise environments. I want to bring my ecosystem architecture and enterprise deployment expertise directly to Anthropic to help scale AI adoption responsibly.';
    // AI policy acknowledgment
    else if (t.includes('ai policy') || t.includes('acknowledge') || t.includes('consent')) answer = 'I acknowledge and agree to the AI policy for this application.';
    // Interviewed before
    else if (t.includes('interview') && t.includes('before')) answer = 'No, I have not interviewed at Anthropic before.';
    // How did you hear
    else if (t.includes('how did you') || t.includes('where did you') || t.includes('hear about') || t.includes('source')) answer = 'Direct research — I actively track roles as a certified Claude developer and ecosystem builder.';
    // Work address / location
    else if (t.includes('address') || (t.includes('where') && t.includes('work')) || (t.includes('plan') && t.includes('work'))) answer = 'Montreal, QC, Canada — open to relocation.';
    // Based in / currently located
    else if (t.includes('based in') || t.includes('currently based') || t.includes('currently located') || t.includes('currently live')) answer = 'I am based in Montreal, Canada. Open to relocation.';
    // Office / hybrid (broader match)
    else if (t.includes('office') || t.includes('hybrid') || t.includes('2-3 days') || t.includes('on-site') || t.includes('onsite')) answer = 'Yes, I am open to hybrid / in-office work.';
    // Experience / describe / driven adoption (open-ended questions)
    else if ((t.includes('describe') || t.includes('driven') || t.includes('experience')) && (t.includes('adoption') || t.includes('customer') || t.includes('technical') || t.includes('complex') || t.includes('expansion') || t.includes('upsell'))) answer = 'At Amaris Consulting I lead enterprise IT transformation for Fortune 500 clients, directing a 15-consultant Center of Excellence and a 10M dollar portfolio. I built Jarvis, an agentic AI platform projecting 1.35M manager-hours and over 40M in annual savings. I have driven adoption of complex platforms across 25+ enterprise accounts with 95% on-time delivery. I identified and drove a 2M+ net-new revenue expansion through co-sell motions with Microsoft, Apple, Meta, and Kelvin Zero by packaging standardized MDM/UEM offers for Fortune 500 accounts.';
    // Salary expectations
    else if (t.includes('salary') || t.includes('compensation') || t.includes('pay expectation') || t.includes('total comp')) answer = 'My target range is $150,000-250,000+ depending on the total compensation package, equity, and scope of the role. I am flexible on structure.';
    // How are you using AI / AI experiment
    else if (t.includes('using ai') || t.includes('ai today') || t.includes('ai experiment') || t.includes('last ai')) answer = 'I built Jarvis (PAC-Man), an agentic AI management platform on the Anthropic Claude API and Model Context Protocol (MCP), projecting 1.35M manager-hours and over 40M dollars in annual savings across 1,800 managers. I hold 20+ AI certifications including the full Anthropic Claude stack (API, MCP Advanced, Subagents, Claude Code). I also built career-ops, an AI-powered job search pipeline that automates offer evaluation, cover letter generation, and application tracking using Claude Code and autonomous agent orchestration.';
    // Specific example / STAR format questions
    else if (t.includes('specific example') || t.includes('tell us about a time') || t.includes('give an example') || t.includes('describe a situation')) answer = 'At Amaris Consulting, I identified that our Jamf professional services were underleveraged in the partner ecosystem. I re-engineered the delivery model for AWS Marketplace and Microsoft co-sell, built distribution frameworks across TD SYNNEX, Climb, and Ingram Micro, and established Amaris as the sole Canadian Jamf Certified Integrator. This unlocked a multi-hundred-million-dollar TAM and generated 2M+ in net-new revenue YTD through high-velocity co-sell motions with Fortune 500 accounts.';
    // Country-based eligibility / where are you based
    else if ((t.includes('country') || t.includes('countries') || t.includes('based')) && (t.includes('eligible') || t.includes('currently') || t.includes('these'))) answer = 'Canada';
    // Notice period / availability
    else if (t.includes('notice period') || t.includes('when can you start') || t.includes('availability')) answer = 'Available immediately — can start within 2-3 weeks.';
    // Motivation / why this company (generic)
    else if (t.includes('why do you want') || t.includes('what excites you') || t.includes('what interests you') || t.includes('what draws you') || t.includes('motivation')) answer = 'I am drawn to this role because it sits at the intersection of AI innovation and enterprise ecosystem architecture — the exact space where I have built my career. I bring 8+ years of enterprise IT transformation, a track record of building agentic AI platforms (Jarvis: 1.35M manager-hours projected savings), and deep experience orchestrating partnerships across Microsoft, Apple, AWS, and Meta. I want to bring this execution capability to drive real impact at scale.';
    // Cover letter / anything else
    else if (t.includes('cover letter') || t.includes('anything else') || t.includes('additional information') || t.includes('additional context')) answer = 'I bring 8+ years of enterprise IT transformation experience as sole executive for AI and Innovation across Mantu Group North America (12,000 people, 1.2B EUR). I built Jarvis, an agentic AI platform projecting 1.35M manager-hours and 40M+ in annual savings. Anthropic certified across the full Claude stack. I would welcome the opportunity to discuss how my background can contribute to your team.';
    // Right to work / authorized
    else if (t.includes('right to work') || t.includes('authorized to work') || t.includes('work permit') || t.includes('legally authorized')) answer = 'I am a Canadian citizen. I would require visa sponsorship for US-based roles. For European roles, I am open to relocation and work permit processes.';
    // Location / city — must come BEFORE catch-all to avoid enterprise-text in city fields
    else if ((t.includes('city') || (t.includes('location') && !t.includes('relocation') && !t.includes('office') && !t.includes('remote') && !t.includes('where') && !t.includes('plan'))) && q.tag === 'INPUT') answer = profile.location || 'Montreal, QC, Canada';
    // Gender / demographics (optional)
    else if (t.includes('gender') || t.includes('hispanic') || t.includes('veteran') || t.includes('disability') || t.includes('race') || t.includes('ethnicity') || t.includes('pronoun') || t.includes('personal preference')) answer = null;
    // Catch-all for required text fields — but EXCLUDE basic fields that Phase 3 handles
    else if (t.includes('*') && !t.includes('first name') && !t.includes('last name') && !t.includes('email') && !t.includes('phone') && !t.includes('country') && !t.includes('resume') && !t.includes('attach') && !t.includes('gender') && !t.includes('hispanic') && !t.includes('veteran') && !t.includes('disability')) {
      answer = 'I bring 8+ years of enterprise IT transformation, AI platform development (Jarvis: 1.35M manager-hours, 40M+ annual savings), and ecosystem architecture across Microsoft, Apple, AWS, and Meta. Happy to elaborate in an interview.';
    }
    // Optional fields without a match: skip
    else answer = null;

    if (answer && q.id) {
      if (q.tag === 'TEXTAREA') {
        await tryFill('#' + q.id, answer);
      } else if (q.tag === 'INPUT') {
        // Try fill first; if field is a Greenhouse dropdown, it'll fail — then try click+select
        const didFill = await tryFill('#' + q.id, answer);
        if (!didFill) {
          // Greenhouse Yes/No dropdowns: click the input to open, then select option
          try {
            const wrapper = page.locator('#' + q.id).locator('..');
            await wrapper.click();
            await page.waitForTimeout(200);
            const shortAnswer = answer.length > 10 ? (answer.toLowerCase().startsWith('yes') ? 'Yes' : answer.toLowerCase().startsWith('no') ? 'No' : answer.substring(0, 30)) : answer;
            await page.locator('[class*="option"]:has-text("' + shortAnswer + '"), li:has-text("' + shortAnswer + '")').first().click({ timeout: 2000 });
            filled = true;
          } catch {}
        }
      } else if (q.tag === 'SELECT') {
        try {
          const sel = page.locator('#' + q.id);
          await sel.selectOption({ label: answer }, { timeout: 2000 }).catch(async () => {
            // Try clicking the select-like div and selecting option
            await sel.click().catch(() => {});
            await page.locator('li:has-text("' + answer.substring(0, 30) + '")').first().click({ timeout: 2000 }).catch(() => {});
          });
          filled = true;
        } catch {}
      }
    }
  }

  // Handle Greenhouse React Select dropdowns (click → type-to-search → Enter)
  // Also handles native <select> elements with matching labels
  // If searchText is empty, press ArrowDown to skip placeholder before Enter
  const ghSelectByLabel = async (label, searchText) => {
    const labelLower = label.toLowerCase();

    // 1. Try React Select (.select__control variants) AND ARIA comboboxes
    const selects = page.locator('.select__control, [class*="Select-control"], [class*="select-control"], [role="combobox"], [aria-haspopup="listbox"]');
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
      const parentLabel = await selects.nth(i).evaluate(el => {
        // Walk up multiple levels to find the label
        let node = el;
        for (let tries = 0; tries < 8; tries++) {
          node = node.parentElement;
          if (!node) break;
          const lbl = node.querySelector('label');
          if (lbl) return lbl.textContent?.trim()?.substring(0, 150) || '';
        }
        // Also check previous siblings
        const prev = el.closest('[class*="field"],[class*="question"],[class*="form-group"],[class*="row"]');
        return prev?.querySelector('label')?.textContent?.trim()?.substring(0, 150) || '';
      }).catch(() => '');
      if (parentLabel.toLowerCase().includes(labelLower)) {
        try {
          await selects.nth(i).click();
          await page.waitForTimeout(400);
          if (searchText) {
            await page.keyboard.type(searchText, { delay: 30 });
            await page.waitForTimeout(600);
          }
          // Wait for dropdown menu to appear, then click first visible option
          try { await page.waitForSelector('[class*="menu"]:visible, [class*="listbox"]:visible, [class*="dropdown"][role="listbox"]', { timeout: 1800 }); } catch {}
          // Filter to only VISIBLE options (avoids stale options from previously-closed dropdowns)
          const optSel = page.locator('[class*="option"]:not([class*="disabled"]):not([class*="no-option"]), [role="option"]').filter({ visible: true });
          const optCount = await optSel.count();
          let clicked = false;
          if (optCount > 0) {
            if (searchText) {
              for (let j = 0; j < Math.min(optCount, 15); j++) {
                const optText = await optSel.nth(j).textContent().catch(() => '');
                if (optText.toLowerCase().includes(searchText.toLowerCase())) {
                  await optSel.nth(j).click().catch(() => {});
                  clicked = true;
                  break;
                }
              }
            }
            if (!clicked) {
              // First real option (index 0 when no search, or fallback when search found nothing)
              await optSel.nth(0).click().catch(() => {});
              clicked = true;
            }
          }
          if (!clicked) {
            // Fallback: keyboard navigation
            if (!searchText) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(200); }
            await page.keyboard.press('Enter');
          }
          await page.waitForTimeout(400);
          filled = true;
          return true;
        } catch {}
      }
    }

    // 2. Try native <select> elements
    const nativeSelects = page.locator('select');
    const nCount = await nativeSelects.count();
    for (let i = 0; i < nCount; i++) {
      const info = await nativeSelects.nth(i).evaluate((el, lbl) => {
        const id = el.id;
        const labelEl = id ? document.querySelector(`label[for="${id}"]`) : null;
        const fieldLabel = labelEl?.textContent?.trim() ||
          el.closest('[class*="field"],[class*="question"],[class*="form-group"]')?.querySelector('label')?.textContent?.trim() || '';
        // Get options for searchText matching
        const opts = Array.from(el.options).map(o => o.text.trim()).filter(Boolean);
        return { label: fieldLabel.substring(0, 150), opts };
      }, label).catch(() => ({ label: '', opts: [] }));
      if (info.label.toLowerCase().includes(labelLower)) {
        try {
          const sel = nativeSelects.nth(i);
          if (searchText) {
            // Find option matching searchText
            const match = info.opts.find(o => o.toLowerCase().includes(searchText.toLowerCase()));
            if (match) await sel.selectOption({ label: match });
            else await sel.selectOption({ index: 1 }); // skip placeholder at index 0
          } else {
            await sel.selectOption({ index: 1 }); // skip placeholder at index 0
          }
          await page.waitForTimeout(300);
          filled = true;
          return true;
        } catch {}
      }
    }

    return false;
  };

  try {
    await ghSelectByLabel('Country', 'Canada');
    await ghSelectByLabel('relocation', 'Yes');
    await ghSelectByLabel('in-person', 'Yes');
    await ghSelectByLabel('office', 'Yes');
    await ghSelectByLabel('AI Policy', 'Yes');
    await ghSelectByLabel('visa sponsorship', 'Yes');
    await ghSelectByLabel('future', 'Yes');
    await ghSelectByLabel('require employment', 'Yes');
    await ghSelectByLabel('interview', 'No');
    await ghSelectByLabel('interviewed', 'No');
    await ghSelectByLabel('based in', 'Yes');
    await ghSelectByLabel('currently based', 'Canada');
    await ghSelectByLabel('salary', '150');   // search for 150k range options
    await ghSelectByLabel('compensation', '150');
    await ghSelectByLabel('pay expect', '150');
    await ghSelectByLabel('eligible', 'Yes');
    await ghSelectByLabel('countries', 'Canada');
    await ghSelectByLabel('authoriz', '');  // ArrowDown → first option = "I am authorized to work..."
    await ghSelectByLabel('right to work', 'Yes');
    await ghSelectByLabel('legally', 'Yes');
    await ghSelectByLabel('work in the country', '');  // first option = authorized
    await ghSelectByLabel('country where you live', '');  // first option = authorized
    await ghSelectByLabel('notice period', '');   // picks first option (Immediately/ASAP)
    await ghSelectByLabel('when would you be available', '');
    await ghSelectByLabel('when can you start', '');
    await ghSelectByLabel('available to start', '');
    // Parloa-specific fields
    await ghSelectByLabel('work from', 'Remote');
    await ghSelectByLabel('where would you like to work', 'Remote');
    await ghSelectByLabel('preferred location', 'Remote');
    await ghSelectByLabel('english', 'Fluent');
    await ghSelectByLabel('language proficiency', 'Fluent');
    await ghSelectByLabel('proficiency in english', 'C2');
    await ghSelectByLabel('eligible to work in', 'Yes');
    await ghSelectByLabel('work permit', 'Yes');
    await ghSelectByLabel('work in germany', 'Yes');
    await ghSelectByLabel('work in the', 'Yes');
    // Consent / GDPR React Select (Parloa EU)
    await ghSelectByLabel('consent', 'Yes');
    await ghSelectByLabel('personal data', 'Yes');
    await ghSelectByLabel('processing of my personal', 'Yes');
    // Arize / SaaS experience
    await ghSelectByLabel('saas', 'Yes');
    await ghSelectByLabel('years of experience', 'Yes');
    await ghSelectByLabel('years of sales', 'Yes');
    await ghSelectByLabel('sales experience', 'Yes');
    // Parloa-specific yes/no qualification questions (ArrowDown picks Yes = 1st option)
    await ghSelectByLabel('directly owned', '');   // "Have you directly owned post-sale strategy..."
    await ghSelectByLabel('post-sale', '');        // same pattern variations
    await ghSelectByLabel('driven adoption', '');  // "Have you driven adoption and expansion..."
    await ghSelectByLabel('$500k', '');
    await ghSelectByLabel('500k+', '');
    await ghSelectByLabel('$1m', '');
    await ghSelectByLabel('enterprise account', '');
    await ghSelectByLabel('7+ years', '');
    await ghSelectByLabel('5+ years', '');
    await ghSelectByLabel('5 years', '');
    await ghSelectByLabel('channel partner', '');  // "Do you have channel partner experience?"
    await ghSelectByLabel('partner experience', '');
    // Gender / demographics — skip (pick prefer not to say)
    await ghSelectByLabel('gender', 'Prefer not to say').catch(() => {});
    await ghSelectByLabel('veteran', 'I am not a protected veteran').catch(() => {});
    await ghSelectByLabel('disability', 'No, I do not have').catch(() => {});
  } catch {}

  // --- PHASE 2.7: JS-based fallback for notice period / available-to-start (handles selects, radios, inputs) ---
  try {
    await page.evaluate(() => {
      const noticePhrases = ['notice period', 'available to start', 'when would you be available', 'when can you start', 'start date'];
      // 1. Native <select> — pick first non-empty option
      document.querySelectorAll('select').forEach(sel => {
        const lbl = (document.querySelector(`label[for="${sel.id}"]`)?.textContent || sel.closest('[class*="field"],[class*="question"]')?.querySelector('label')?.textContent || '').toLowerCase();
        if (noticePhrases.some(p => lbl.includes(p)) && sel.selectedIndex <= 0 && sel.options.length > 1) {
          sel.selectedIndex = 1;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      // 2. Radio buttons — click first option in a notice period group
      const allRadios = document.querySelectorAll('input[type="radio"]');
      const noticeGroups = new Set();
      allRadios.forEach(r => {
        const lbl = (document.querySelector(`label[for="${r.id}"]`)?.textContent || r.closest('[class*="field"],[class*="question"]')?.querySelector('label:not([for])')?.textContent || '').toLowerCase();
        if (noticePhrases.some(p => lbl.includes(p)) && !noticeGroups.has(r.name)) {
          r.checked = true;
          r.dispatchEvent(new Event('change', { bubbles: true }));
          r.click();
          noticeGroups.add(r.name);
        }
      });
      // 3. Checkbox groups in <fieldset> (Parloa EU: "What is your notice period?" as multi-checkbox)
      document.querySelectorAll('fieldset').forEach(fieldset => {
        const lbl = (fieldset.querySelector('label, legend')?.textContent || '').toLowerCase();
        if (noticePhrases.some(p => lbl.includes(p))) {
          // Pick first unchecked checkbox in the group (e.g. "1 Week")
          const cb = fieldset.querySelector('input[type="checkbox"]:not(:checked)');
          if (cb) {
            cb.checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
            cb.click();
          }
        }
      });
    });
  } catch {}

  // Phase 2.7 Playwright-native: notice period fieldset checkboxes
  // (React ignores DOM-level evaluate() clicks — this fires real browser events)
  try {
    const noticePhraseRx = /notice period|available to start|when would you be available|when can you start|start date/i;
    const fieldsets = page.locator('fieldset');
    const fsCount = await fieldsets.count();
    for (let fi = 0; fi < fsCount; fi++) {
      const fs = fieldsets.nth(fi);
      const fsText = await fs.textContent().catch(() => '');
      if (!noticePhraseRx.test(fsText)) continue;
      const checkboxes = fs.locator('input[type="checkbox"]');
      const cbCount = await checkboxes.count();
      if (cbCount === 0) continue;
      // Click the first unchecked checkbox in this notice-period group
      for (let ci = 0; ci < cbCount; ci++) {
        const cb = checkboxes.nth(ci);
        const isChecked = await cb.isChecked().catch(() => false);
        if (!isChecked) {
          await cb.click({ force: true });
          await page.waitForTimeout(400);
          filled = true;
          break;
        }
      }
    }
  } catch {}

  // Handle checkbox groups (country eligibility, etc.) — click checkbox for Canada/Yes
  try {
    await page.evaluate(() => {
      const checkboxLabels = document.querySelectorAll('label');
      for (const lbl of checkboxLabels) {
        const text = lbl.textContent?.toLowerCase() || '';
        const input = lbl.querySelector('input[type="checkbox"]') ||
                      (lbl.htmlFor ? document.getElementById(lbl.htmlFor) : null);
        if (!input || input.type !== 'checkbox') continue;
        // Check "Canada" or "Yes" options inside country/eligibility groups
        if (text === 'canada' || text === 'yes' || text.includes('canada')) {
          const groupLabel = input.closest('[class*="field"],[class*="question"]')
            ?.querySelector('label:not([for])')?.textContent?.toLowerCase() || '';
          if (groupLabel.includes('countr') || groupLabel.includes('based') || groupLabel.includes('eligible') || groupLabel.includes('locat')) {
            input.click();
          }
        }
      }
    });
  } catch {}

  // --- PHASE 2.8: Catch-all — fill any remaining empty native selects or comboboxes ---
  try {
    // Handle native <select> elements that still show index 0 (placeholder)
    await page.evaluate(() => {
      const allSelects = document.querySelectorAll('select');
      for (const sel of allSelects) {
        if (sel.selectedIndex <= 0 && sel.options.length > 1) {
          // Check if this is a required or labeled field
          const id = sel.id;
          const lbl = id ? document.querySelector(`label[for="${id}"]`)?.textContent?.toLowerCase() || '' : '';
          const val = sel.options[0]?.value || '';
          // Skip demographics
          if (lbl.includes('gender') || lbl.includes('race') || lbl.includes('veteran') || lbl.includes('disability')) continue;
          // Skip if placeholder value is not empty (has an actual value)
          if (val && val !== 'Select' && val !== '' && val !== '0') continue;
          // Pick index 1 (first real option after placeholder)
          sel.selectedIndex = 1;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });

    // Handle combobox/aria dropdowns that are still showing placeholder
    const comboboxes = page.locator('[role="combobox"], [aria-haspopup="listbox"]');
    const cbCount = await comboboxes.count();
    for (let i = 0; i < cbCount; i++) {
      const combo = comboboxes.nth(i);
      const info = await combo.evaluate(el => {
        const text = el.textContent?.trim() || el.getAttribute('aria-label') || '';
        const isPlaceholder = text === '' || text === 'Select' || text === 'Select...' || text === 'Bitte auswählen' || el.getAttribute('aria-expanded') === 'false';
        const lbl = el.closest('[class*="field"],[class*="question"],[class*="form-group"],[class*="row"]')
          ?.querySelector('label')?.textContent?.toLowerCase() || '';
        return { text, isPlaceholder, lbl };
      }).catch(() => ({ isPlaceholder: false, lbl: '' }));

      if (!info.isPlaceholder) continue;
      // Skip demographics
      if (info.lbl.includes('gender') || info.lbl.includes('race') || info.lbl.includes('veteran') || info.lbl.includes('disability') || info.lbl.includes('pronoun')) continue;
      // Skip if no label (unknown context)
      if (!info.lbl) continue;

      try {
        await combo.click({ timeout: 2000 });
        await page.waitForTimeout(300);
        // Type relevant answer based on label
        const lbl = info.lbl;
        if (lbl.includes('notice') || lbl.includes('available') || lbl.includes('start')) {
          await page.keyboard.press('ArrowDown'); await page.waitForTimeout(200);
        } else if (lbl.includes('english') || lbl.includes('language')) {
          await page.keyboard.type('Fluent', { delay: 30 }); await page.waitForTimeout(300);
        } else if (lbl.includes('salary') || lbl.includes('compensation') || lbl.includes('expectation')) {
          await page.keyboard.type('150', { delay: 30 }); await page.waitForTimeout(300);
        } else if (lbl.includes('work from') || lbl.includes('location preference') || lbl.includes('where would you like to work') || lbl.includes('where do you want to work')) {
          await page.keyboard.type('Remote', { delay: 30 }); await page.waitForTimeout(300);
        } else {
          await page.keyboard.press('ArrowDown'); await page.waitForTimeout(200);
        }
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);
        filled = true;
      } catch {}
    }
  } catch {}

  // --- PHASE 2.5: Upload resume AFTER all dropdowns (dropdowns clear file inputs) ---
  try {
    const cvPdf = path.join(ROOT, 'output', 'tony-walteur-cv.pdf');
    const cvMd = path.join(ROOT, 'cv.md');
    let resumePath = null;
    try { await fs.access(cvPdf); resumePath = cvPdf; } catch {
      try { await fs.access(cvMd); resumePath = cvMd; } catch {}
    }
    if (resumePath) {
      const fileInput = page.locator('#resume').first();
      if (await fileInput.count() > 0) { await fileInput.setInputFiles(resumePath); filled = true; }
    }
  } catch {}
  await page.waitForTimeout(500);

  // --- PHASE 3: Fill basic fields LAST (React re-renders may have cleared them) ---
  await page.waitForTimeout(500);
  const firstName = profile.full_name.split(' ')[0] || '';
  const lastName = profile.full_name.split(' ').slice(1).join(' ') || '';

  // Fill with click + type to trigger React onChange properly
  const basicFields = [
    ['#first_name', firstName, false],
    ['#last_name', lastName, false],
    ['#email', profile.email, false],
    ['#phone', profile.phone, false],
    ['#country', profile.location, false],
    // Location city (Arize and others use these) — needs Google Places trigger
    ['input[id*="location" i]:not([id*="country"]):not([id*="remote"])', profile.location, true],
    ['input[placeholder*="city" i]', profile.location, true],
    ['input[placeholder*="location" i]', profile.location, true],
    ['input[name*="location" i]:not([name*="country"])', profile.location, true],
  ];

  // Helper: fill a location field and attempt Google Places / autocomplete selection
  const fillLocationField = async (el, val) => {
    await el.click();
    await el.fill('');
    // Type slowly to trigger Google Places API (debounced at ~300ms)
    await el.type(val.split(',')[0].trim(), { delay: 60 }); // type just the city part first
    await page.waitForTimeout(1500); // wait for Places API
    const suggestion = page.locator('.pac-item, .pac-container li, [class*="suggestion"]:visible, [class*="autocomplete"] [role="option"]:visible').first();
    const hasSuggestion = await suggestion.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasSuggestion) {
      await suggestion.click().catch(() => {});
    } else {
      // Keyboard fallback: ArrowDown selects first Places suggestion, Enter confirms
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(400);
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(500);
    // Verify field has value; if empty after Places attempt, type full location directly
    const currentVal = await el.inputValue().catch(() => '');
    if (!currentVal || currentVal.trim().length < 3) {
      await el.fill(val);
    }
    filled = true;
  };

  for (const [sel, val, isLocationField] of basicFields) {
    if (!val) continue;
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 500 })) {
        if (isLocationField) {
          await fillLocationField(el, val);
        } else {
          await el.click();
          await el.fill('');
          await el.type(val, { delay: 10 });
          filled = true;
        }
      }
    } catch {}
  }

  // Phase 3 extra: explicit retry for Greenhouse's #job_application_location if still empty
  try {
    const locField = page.locator('#job_application_location, input[autocomplete*="city"], input[autocomplete*="address-level2"]').first();
    if (await locField.isVisible({ timeout: 500 }).catch(() => false)) {
      const locVal = await locField.inputValue().catch(() => '');
      if (!locVal || locVal.trim().length < 3) {
        const locTarget = profile.location || 'Montreal, QC, Canada';
        await fillLocationField(locField, locTarget);
      }
    }
  } catch {}

  // Verify and retry any empty required fields
  await page.waitForTimeout(300);
  const emptyBasics = await page.evaluate(() => {
    const checks = [
      { id: 'first_name', label: 'First Name' },
      { id: 'last_name', label: 'Last Name' },
      { id: 'email', label: 'Email' },
    ];
    return checks.filter(c => { const el = document.getElementById(c.id); return el && !el.value; });
  });

  for (const field of emptyBasics) {
    const val = field.id === 'first_name' ? firstName : field.id === 'last_name' ? lastName : profile.email;
    try {
      await page.locator('#' + field.id).click();
      await page.keyboard.type(val, { delay: 20 });
    } catch {}
  }

  // --- PHASE 4: Re-fill any question textareas that React cleared ---
  // Scan for empty required textareas by label text and re-fill
  await page.waitForTimeout(500);
  const emptyTextareas = await page.evaluate(() => {
    const result = [];
    document.querySelectorAll('textarea').forEach(ta => {
      if (ta.value && ta.value.trim()) return; // already filled
      const lbl = ta.closest('[class*="field"],[class*="question"],[class*="form"]')
        ?.querySelector('label')
        || document.querySelector(`label[for="${ta.id}"]`);
      const text = lbl?.textContent?.trim() || ta.placeholder || '';
      if (text.length > 5) result.push({ id: ta.id, text: text.substring(0, 200) });
    });
    return result;
  });

  const aiAnswer = 'I built Jarvis (PAC-Man), an agentic AI management platform on the Anthropic Claude API and Model Context Protocol (MCP), projecting 1.35M manager-hours and over 40M dollars in annual savings across 1,800 managers. My last AI experiment: I automated the full job-search pipeline (offer evaluation, CV generation, form filling, and ATS submission) using Claude Code and autonomous agent orchestration — saving 40+ hours per week. I hold 20+ AI certifications including the full Anthropic Claude stack (API, MCP Advanced, Subagents, Claude Code).';
  const experienceAnswer = 'At Amaris Consulting I lead enterprise IT transformation for Fortune 500 clients, directing a 15-consultant Center of Excellence and a 10M dollar portfolio. I built Jarvis, an agentic AI platform projecting 1.35M manager-hours and over 40M in annual savings. I have driven adoption of complex platforms across 25+ enterprise accounts with 95% on-time delivery. I identified and drove a 2M+ net-new revenue expansion through co-sell motions with Microsoft, Apple, Meta, and Kelvin Zero.';

  for (const ta of emptyTextareas) {
    const t = ta.text.toLowerCase();
    let ans = null;
    if (t.includes('using ai') || t.includes('ai today') || t.includes('ai experiment') || t.includes('last ai')) ans = aiAnswer;
    else if (t.includes('driven') || t.includes('adoption') || t.includes('expansion') || t.includes('upsell') || t.includes('post-sale') || t.includes('post sale') || t.includes('aar') || t.includes('$500k') || t.includes('500k')) ans = experienceAnswer;
    else if (t.includes('salary') || t.includes('compensation') || t.includes('expectation')) ans = 'My target range is CAD $150,000-250,000+ depending on total compensation package, equity, and role scope.';
    else if (t.includes('notice') || t.includes('available to start') || t.includes('when can you start') || t.includes('start date')) ans = 'Immediately / 2 weeks notice.';
    else if (t.includes('why') || t.includes('motivation') || t.includes('interest')) ans = 'I am drawn to this role because it sits at the intersection of AI innovation and enterprise ecosystem architecture — the exact space where I have built my career over 8+ years.';
    else if (t.includes('describe') || t.includes('example') || t.includes('tell us') || t.includes('specific')) ans = experienceAnswer;
    else if (t.includes('cover letter') || t.includes('additional') || t.includes('anything else')) ans = 'I bring 8+ years of enterprise IT transformation experience. I built Jarvis, an agentic AI platform projecting 1.35M manager-hours and 40M+ in annual savings. Anthropic certified across the full Claude stack. Would welcome the opportunity to discuss how my background can contribute to your team.';
    else if (t.includes('*')) ans = 'I bring 8+ years of enterprise IT transformation, AI platform development (Jarvis: 1.35M manager-hours, 40M+ annual savings), and ecosystem architecture across Microsoft, Apple, AWS, and Meta. Happy to elaborate in an interview.';

    if (ans && ta.id) {
      try {
        const el = page.locator('#' + ta.id);
        if (await el.isVisible({ timeout: 1000 })) {
          await el.click();
          await el.fill(ans);
          filled = true;
        }
      } catch {}
    }
  }

  // --- PHASE 4B: Re-fill empty custom question INPUTS that React cleared ---
  // Broad scan: any visible empty text input with a meaningful label (not basic fields)
  const emptyInputs = await page.evaluate(() => {
    const result = [];
    const basicIds = new Set(['first_name', 'last_name', 'email', 'phone', 'country', 'resume']);
    const basicNames = new Set(['first_name', 'last_name', 'email', 'phone']);
    document.querySelectorAll('input[type="text"], input[type="tel"], input[type="url"], input:not([type]), input[type=""]').forEach(inp => {
      if (!inp.offsetParent) return; // hidden
      if (inp.type === 'hidden' || inp.type === 'submit' || inp.type === 'button') return;
      if (inp.id && basicIds.has(inp.id)) return;
      if (inp.name && basicNames.has(inp.name)) return;
      if (inp.value && inp.value.trim().length > 2) return; // already filled
      // Get label from multiple sources
      const lbl = document.querySelector(`label[for="${inp.id}"]`)?.textContent?.trim()
        || inp.closest('[class*="field"],[class*="question"],[class*="form-group"],[class*="row"]')?.querySelector('label')?.textContent?.trim()
        || inp.placeholder?.trim()
        || inp.getAttribute('aria-label')?.trim()
        || '';
      if (lbl.length > 3) result.push({ id: inp.id || '', name: inp.name || '', text: lbl.substring(0, 200) });
    });
    return result;
  });

  for (const inp of emptyInputs) {
    const t = inp.text.toLowerCase();
    let ans = null;
    if (t.includes('salary') || t.includes('compensation') || t.includes('expectation') || t.includes('pay')) ans = '$150,000–250,000+ (flexible on structure)';
    else if (t.includes('city') || (t.includes('location') && !t.includes('relocation') && !t.includes('remote') && !t.includes('where'))) ans = profile.location || 'Montreal, QC';
    else if (t.includes('linkedin')) ans = profile.linkedin || 'linkedin.com/in/tonywalteur';
    else if (t.includes('notice') || t.includes('available to start') || t.includes('when can you start') || t.includes('start date')) ans = 'Immediately / 2 weeks notice';
    else if (t.includes('why') || t.includes('motivation')) ans = 'I am drawn to this role because it sits at the intersection of AI innovation and enterprise ecosystem architecture — the exact space where I have built my career over 8+ years.';
    else if (t.includes('portfolio') || t.includes('website') || t.includes('github')) ans = profile.linkedin || 'linkedin.com/in/tonywalteur';
    if (ans) {
      const sel = inp.id ? '#' + inp.id : (inp.name ? `input[name="${inp.name}"]` : null);
      if (!sel) continue;
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 1000 })) {
          await el.click();
          await el.fill(ans);
          filled = true;
        }
      } catch {}
    }
  }

  // --- PHASE 4C: Accept terms/privacy/consent checkboxes (required for Parloa EU Greenhouse) ---
  // Strategy: use JavaScript directly to set checked state + dispatch events (more reliable than Playwright .check() with React)
  try {
    const checkedCount = await page.evaluate(() => {
      let checked = 0;
      const keywords = ['terms', 'privacy', 'agree', 'accept', 'consent', 'datenschutz', 'bedingungen', 'dsgvo', 'gdpr'];
      document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (cb.checked) return; // skip already checked
        // Get surrounding text from label or container
        const labelEl = document.querySelector(`label[for="${cb.id}"]`) || cb.closest('label');
        const containerEl = cb.closest('[class*="check"],[class*="field"],[class*="consent"],[class*="agreement"],[class*="gdpr"],[class*="terms"]');
        const text = (labelEl?.textContent || containerEl?.textContent || cb.parentElement?.textContent || '').toLowerCase();
        if (keywords.some(k => text.includes(k))) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          cb.dispatchEvent(new Event('input', { bubbles: true }));
          cb.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          if (labelEl) labelEl.click();
          checked++;
        }
      });
      // Also try ARIA role="checkbox" elements
      document.querySelectorAll('[role="checkbox"][aria-checked="false"], [role="checkbox"]:not([aria-checked="true"])').forEach(el => {
        const text = (el.textContent || el.getAttribute('aria-label') || el.closest('[class*="field"],[class*="consent"]')?.textContent || '').toLowerCase();
        if (keywords.some(k => text.includes(k))) {
          el.setAttribute('aria-checked', 'true');
          el.click();
          checked++;
        }
      });
      return checked;
    }).catch(() => 0);
    if (checkedCount > 0) {
      filled = true;
      await page.waitForTimeout(300);
    }
  } catch {}

  // Phase 4C Playwright-native: physically click any unchecked terms/consent checkboxes
  // (backup for React components that ignore page.evaluate() manipulations)
  try {
    const termsRx = /terms|privacy|agree|accept|consent|datenschutz|dsgvo|gdpr|personal data|processing/i;
    const allCbs = page.locator('input[type="checkbox"]');
    const cbTotal = await allCbs.count();
    for (let ci = 0; ci < cbTotal; ci++) {
      const cb = allCbs.nth(ci);
      const isChecked = await cb.isChecked().catch(() => true);
      if (isChecked) continue;
      const isVis = await cb.isVisible({ timeout: 300 }).catch(() => false);
      if (!isVis) continue;
      // Get surrounding text
      const cbId = await cb.getAttribute('id').catch(() => '');
      const labelText = cbId
        ? await page.locator(`label[for="${cbId}"]`).textContent().catch(() => '')
        : '';
      const containerText = await cb.evaluate(el => {
        const c = el.closest('[class*="check"],[class*="field"],[class*="consent"],[class*="terms"],[class*="gdpr"],[class*="agreement"]');
        return c?.textContent || el.parentElement?.textContent || '';
      }).catch(() => '');
      const fullText = (labelText + ' ' + containerText).toLowerCase();
      // Only click if this is actually a consent/terms checkbox (not a qualification question)
      if (termsRx.test(fullText) && !fullText.includes('notice period') && !fullText.includes('experience')) {
        await cb.click({ force: true });
        await page.waitForTimeout(300);
        filled = true;
      }
    }
  } catch {}

  return filled;
}

async function fillLeverForm(page, profile) {
  let filled = false;
  const tryFill = async (selector, value) => {
    if (!value) return;
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 2000 })) { await el.fill(value); filled = true; }
    } catch {}
  };
  await tryFill('input[name="name"]', profile.full_name);
  await tryFill('input[name="email"]', profile.email);
  await tryFill('input[name="phone"]', profile.phone);
  await tryFill('input[name="urls[LinkedIn]"], input[name*="linkedin" i]', profile.linkedin);
  await tryFill('input[name*="location" i]', profile.location);

  try {
    const cvPdf = path.join(ROOT, 'output', 'cv.pdf');
    const cvMd = path.join(ROOT, 'cv.md');
    let resumePath = null;
    try { await fs.access(cvPdf); resumePath = cvPdf; } catch {
      try { await fs.access(cvMd); resumePath = cvMd; } catch {}
    }
    if (resumePath) {
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.count() > 0) { await fileInput.setInputFiles(resumePath); filled = true; }
    }
  } catch {}
  return filled;
}

async function fillAshbyForm(page, profile) {
  let filled = false;
  const tryFill = async (selector, value) => {
    if (!value) return;
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 2000 })) { await el.fill(value); filled = true; }
    } catch {}
  };
  await tryFill('input[name*="name" i]:not([name*="last"]):not([name*="company"])', profile.full_name);
  await tryFill('input[name*="email" i], input[type="email"]', profile.email);
  await tryFill('input[name*="phone" i], input[type="tel"]', profile.phone);
  await tryFill('input[name*="linkedin" i]', profile.linkedin);

  try {
    const cvPdf = path.join(ROOT, 'output', 'cv.pdf');
    const cvMd = path.join(ROOT, 'cv.md');
    let resumePath = null;
    try { await fs.access(cvPdf); resumePath = cvPdf; } catch {
      try { await fs.access(cvMd); resumePath = cvMd; } catch {}
    }
    if (resumePath) {
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.count() > 0) { await fileInput.setInputFiles(resumePath); filled = true; }
    }
  } catch {}
  return filled;
}

// ── Kimi extract (for onboarding) ────────────────────────────────────────────

async function callKimiExtract(resumeText) {
  const apiKey = process.env.KIMI_API_KEY || '';
  const baseUrl = (process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/$/, '');
  if (!apiKey) throw new Error('KIMI_API_KEY not configured');

  const prompt = `You are a professional resume parser. Extract structured profile information from the resume below.
Return ONLY a valid JSON object (no markdown fences) with exactly these fields:
{
  "full_name": "candidate's full name",
  "email": "email address",
  "phone": "phone number",
  "location": "city, country/province",
  "linkedin": "linkedin URL or handle",
  "headline": "one-line professional summary (max 120 chars)",
  "target_roles": ["3-5 most likely role titles this person targets"],
  "skills": ["top 10 skills"],
  "salary_target": "salary expectation if mentioned, else empty string",
  "cv_markdown": "the FULL resume converted to clean markdown (keep all detail)"
}

Resume:
${resumeText.slice(0, 12000)}`;

  const body = JSON.stringify({
    model: 'moonshot-v1-8k',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
  });

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL('/v1/chat/completions', baseUrl);
    const opts = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, r => {
      let data = '';
      r.on('data', c => { data += c; });
      r.on('end', () => {
        if (r.statusCode !== 200) { reject(new Error(`Kimi ${r.statusCode}: ${data}`)); return; }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.choices[0].message.content);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── HTML ──────────────────────────────────────────────────────────────────────

const gmailSetupRequired = !GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET;

const HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JobSeeker — Mission Control</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      color-scheme: dark;

      /* ── Surfaces (Apple "materials" over flat tints) ────────────────── */
      --bg:           #000000;
      --bg-elevated:  #0a0a0c;          /* one notch above pure black */
      --surface:      #131316;
      --surface2:     #1c1c1f;
      --surface3:     #2a2a2e;
      --surface-hover:#22222680;
      /* Translucent materials — pair with backdrop-filter on the consumer */
      --mat-thin:     rgba(20,20,22,.55);
      --mat-regular:  rgba(22,22,26,.72);
      --mat-thick:    rgba(28,28,32,.86);
      /* Hairlines (Apple-grade — never thicker than 0.5px) */
      --hairline:     rgba(255,255,255,.06);
      --hairline-2:   rgba(255,255,255,.10);
      --separator:    var(--hairline);
      --separator2:   var(--hairline-2);
      /* Inner highlight = the "edge sheen" Apple cards have on top */
      --edge-sheen:   inset 0 .5px 0 rgba(255,255,255,.07);

      /* ── Text scale ───────────────────────────────────────────────── */
      --text:         rgba(255,255,255,.96);
      --text-sec:     rgba(235,235,245,.62);
      --text-ter:     rgba(235,235,245,.38);
      --text-quad:    rgba(235,235,245,.22);

      /* ── Accent (brand-mark blue → cyan) ──────────────────────────── */
      --accent:       #28b8ff;
      --accent-2:     #30d158;
      --accent-bg:    rgba(40,184,255,.12);
      --accent-ring:  rgba(40,184,255,.30);

      /* ── Semantic status colors (Apple system palette) ────────────── */
      --green:   #30d158; --green-bg:  rgba(48,209,88,.12);
      --blue:    #28b8ff; --blue-bg:   rgba(40,184,255,.12);
      --cyan:    #64d2ff; --cyan-bg:   rgba(100,210,255,.12);
      --yellow:  #ffd60a; --yellow-bg: rgba(255,214,10,.12);
      --orange:  #ff9f0a; --orange-bg: rgba(255,159,10,.12);
      --red:     #ff453a; --red-bg:    rgba(255,69,58,.12);
      --pink:    #ff375f; --pink-bg:   rgba(255,55,95,.12);
      --purple:  #bf5af2; --purple-bg: rgba(191,90,242,.12);
      --gray:    rgba(255,255,255,.3); --gray-bg: rgba(255,255,255,.06);

      /* ── Radius scale (Apple uses 6/10/16/22 — multiples of 2 + 4) ── */
      --r-xs: 6px;
      --r-sm: 10px;
      --r-md: 14px;
      --r-lg: 20px;
      --r-xl: 26px;
      --r-pill: 999px;

      /* ── Spacing — 4px base, 8px most-used ─────────────────────────── */
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-5: 20px;
      --space-6: 24px;
      --space-7: 32px;
      --space-8: 40px;

      /* ── Typography ───────────────────────────────────────────────── */
      --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", system-ui, sans-serif;
      --font-mono: "SF Mono", "JetBrains Mono", "Fira Code", ui-monospace, monospace;
      /* Apple type scale (display | body) */
      --t-display:    34px;
      --t-title-1:    28px;
      --t-title-2:    22px;
      --t-title-3:    19px;
      --t-headline:   17px;
      --t-body:       15px;
      --t-callout:    14px;
      --t-subhead:    13px;
      --t-footnote:   12px;
      --t-caption:    11px;

      /* ── Elevation — soft, color-matched (no harsh blacks) ───────── */
      --shadow-1: 0 1px 2px rgba(0,0,0,.18);
      --shadow-2: 0 2px 8px rgba(0,0,0,.22), 0 1px 2px rgba(0,0,0,.16);
      --shadow-3: 0 8px 24px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.18);
      --shadow-4: 0 16px 48px rgba(0,0,0,.40), 0 4px 12px rgba(0,0,0,.20);
      --shadow-glow-accent: 0 0 0 1px rgba(40,184,255,.20), 0 8px 28px rgba(40,184,255,.18);

      /* Legacy alias retained for older selectors that reference these */
      --shadow-sm: var(--shadow-1);
      --shadow-md: var(--shadow-2);
      --shadow-lg: var(--shadow-3);

      /* ── Motion ───────────────────────────────────────────────────── */
      --ease-out: cubic-bezier(0.22, 1, 0.36, 1);   /* Apple "out" */
      --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* gentle spring */
      --dur-fast: 120ms;
      --dur-med:  240ms;
      --dur-slow: 380ms;
    }

    @media (prefers-reduced-motion: reduce) {
      :root { --dur-fast: 0ms; --dur-med: 0ms; --dur-slow: 0ms; }
      *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
    }

    html { height: 100%; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      font-size: 14px;
      line-height: 1.5;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Header ── translucent like macOS Sonoma sidebar */
    .header {
      background: var(--mat-thick);
      backdrop-filter: saturate(180%) blur(28px);
      -webkit-backdrop-filter: saturate(180%) blur(28px);
      border-bottom: .5px solid var(--hairline);
      box-shadow: var(--edge-sheen);
      padding: 0 var(--space-5);
      height: 56px;
      display: flex;
      align-items: center;
      gap: var(--space-3);
      position: sticky;
      top: 0;
      z-index: 200;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--t-headline);
      font-weight: 700;
      letter-spacing: -.022em;
    }
    .logo-mark {
      width: 30px; height: 30px;
      background:
        radial-gradient(circle at 30% 25%, rgba(255,255,255,.30), transparent 55%),
        linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
      border-radius: 9px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px;
      color: rgba(255,255,255,.95);
      box-shadow:
        inset 0 .5px 0 rgba(255,255,255,.30),
        inset 0 -.5px 0 rgba(0,0,0,.18),
        0 4px 14px rgba(40,184,255,.36);
      letter-spacing: 0;
    }
    .header-spacer { flex: 1; }
    .header-actions {
      display: flex; align-items: center; gap: var(--space-2);
    }
    .last-updated {
      font-size: var(--t-footnote);
      color: var(--text-ter);
      letter-spacing: -.005em;
      font-variant-numeric: tabular-nums;
    }
    /* ── Buttons — proper Apple hierarchy ─────────────────────────── */
    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      gap: 6px;
      padding: 7px 14px;
      min-height: 32px;
      font-size: var(--t-subhead); font-family: var(--font); font-weight: 590;
      letter-spacing: -.005em;
      border-radius: var(--r-sm);
      border: .5px solid transparent;
      cursor: pointer;
      transition: background var(--dur-fast) var(--ease-out),
                  transform var(--dur-fast) var(--ease-spring),
                  box-shadow var(--dur-fast) var(--ease-out),
                  color var(--dur-fast) var(--ease-out);
      white-space: nowrap;
      text-decoration: none;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .btn:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--accent-ring);
    }
    .btn:active { transform: scale(.97); }
    .btn:disabled, .btn[disabled] {
      opacity: .42; cursor: not-allowed; pointer-events: none;
    }

    /* Ghost — translucent default */
    .btn-ghost {
      background: rgba(255,255,255,.06);
      color: var(--text);
      border-color: var(--hairline-2);
    }
    .btn-ghost:hover { background: rgba(255,255,255,.10); border-color: var(--hairline-2); }
    .btn-ghost:active { background: rgba(255,255,255,.04); }

    /* Primary — accent fill */
    .btn-primary {
      background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 92%, white 8%), var(--accent));
      color: #fff;
      box-shadow: var(--edge-sheen), 0 1px 2px rgba(0,0,0,.18);
    }
    .btn-primary:hover { filter: brightness(1.06); }
    .btn-primary:active { filter: brightness(.96); }

    /* Gmail — keep iconic white treatment, tighten radii */
    .btn-gmail {
      background: #ffffff;
      color: #1f1f1f;
      font-size: var(--t-footnote);
      padding: 6px 12px;
      box-shadow: var(--shadow-1);
    }
    .btn-gmail:hover { background: #f5f5f7; }

    /* Apply — the "act now" CTA. Warmer gradient, slight glow. */
    .btn-apply-batch {
      background: linear-gradient(135deg, #ff9f0a 0%, #ff6b00 100%);
      color: #fff;
      font-weight: 700;
      letter-spacing: -.01em;
      box-shadow:
        var(--edge-sheen),
        0 4px 14px rgba(255,107,0,.30);
    }
    .btn-apply-batch:hover { filter: brightness(1.05); }
    .btn-apply-batch:active { filter: brightness(.96); }

    /* ── Apply modal ── */
    .modal-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.55);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      z-index: 5000;
      display: flex; align-items: center; justify-content: center;
      padding: var(--space-6);
      opacity: 0; pointer-events: none;
      transition: opacity var(--dur-med) var(--ease-out);
    }
    .modal-overlay.open { opacity: 1; pointer-events: all; }
    .modal-content {
      background: var(--mat-thick);
      backdrop-filter: blur(40px) saturate(180%);
      -webkit-backdrop-filter: blur(40px) saturate(180%);
      border: .5px solid var(--hairline-2);
      border-radius: var(--r-lg);
      box-shadow: var(--edge-sheen), var(--shadow-4);
      width: 100%; max-width: 720px;
      max-height: 84vh;
      display: flex; flex-direction: column;
      transform: scale(.98) translateY(16px);
      transition: transform var(--dur-med) var(--ease-spring);
    }
    .modal-overlay.open .modal-content { transform: none; }
    .modal-header {
      padding: 22px 24px 16px;
      border-bottom: .5px solid var(--hairline);
      display: flex; align-items: center; gap: var(--space-3);
      flex-shrink: 0;
    }
    .modal-title { font-size: var(--t-title-3); font-weight: 700; letter-spacing: -.022em; flex: 1; }
    .modal-close {
      background: rgba(255,255,255,.08); border: none; color: var(--text-sec);
      width: 30px; height: 30px; border-radius: 50%;
      font-size: 14px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background var(--dur-fast) var(--ease-out),
                  color var(--dur-fast) var(--ease-out),
                  transform var(--dur-fast) var(--ease-spring);
    }
    .modal-close:hover { background: rgba(255,255,255,.14); color: var(--text); }
    .modal-close:active { transform: scale(.94); }
    @media (max-width: 640px) {
      .modal-overlay { padding: 0; align-items: flex-end; }
      .modal-content { max-height: 92vh; border-radius: var(--r-lg) var(--r-lg) 0 0; }
      .modal-overlay .modal-content { transform: translateY(40px); }
      .modal-overlay.open .modal-content { transform: none; }
    }

    /* ── Gmail Setup Modal ── */
    .gsm-content {
      max-width: 480px; padding: 28px 28px 22px; position: relative;
      max-height: min(80vh, 720px); overflow-y: auto;
    }
    .gsm-content .modal-close { position: absolute; top: 16px; right: 16px; }
    .gsm-body h2 {
      font-size: 22px; font-weight: 700; letter-spacing: -.01em;
      margin: 0 0 4px;
    }
    .gsm-sub { font-size: 13px; color: var(--text-sec); margin: 0 0 20px; }
    .gsm-loading { color: var(--text-ter); font-size: 13px; padding: 12px 0; }
    .gsm-checklist {
      list-style: none; padding: 0; margin: 0 0 20px;
      background: var(--surface2); border: .5px solid var(--separator2);
      border-radius: 10px;
    }
    .gsm-checklist li {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px;
      border-bottom: .5px solid var(--separator2);
      font-size: 13px; color: var(--text);
    }
    .gsm-checklist li:last-child { border-bottom: none; }
    .gsm-checklist li em { color: var(--text-ter); font-style: normal; font-size: 11px; margin-left: 4px; }
    .gsm-dot {
      width: 10px; height: 10px; border-radius: 50%;
      flex-shrink: 0;
    }
    .gsm-dot.ok  { background: var(--green); box-shadow: 0 0 6px rgba(48,209,88,.5); }
    .gsm-dot.bad { background: var(--text-ter); }
    .gsm-meta {
      background: var(--surface2); border: .5px solid var(--separator2);
      border-radius: 10px; padding: 12px 14px;
      font-size: 12px; color: var(--text-sec);
      margin-bottom: 20px;
    }
    .gsm-meta-label {
      display: block; font-size: 10px; font-weight: 600;
      color: var(--text-ter); text-transform: uppercase; letter-spacing: .05em;
      margin-bottom: 3px;
    }
    .gsm-meta code {
      font-size: 12px; background: var(--surface3); padding: 1px 6px;
      border-radius: 4px; color: var(--text);
    }
    .gsm-copy {
      display: flex; align-items: stretch; gap: 6px; margin-top: 4px;
    }
    .gsm-copy code {
      flex: 1; padding: 7px 10px; background: var(--bg-base, #000);
      border: .5px solid var(--separator2); border-radius: 6px;
      user-select: all; word-break: break-all; font-size: 12px;
    }
    .gsm-copy-btn {
      background: rgba(40,184,255,.10); color: var(--accent);
      border: .5px solid rgba(40,184,255,.30); border-radius: 6px;
      padding: 0 12px; font-size: 12px; font-weight: 600; cursor: pointer;
      transition: background .15s;
    }
    .gsm-copy-btn:hover { background: rgba(40,184,255,.18); }
    .gsm-actions {
      display: flex; gap: 8px; flex-wrap: wrap;
    }
    .gsm-actions .btn { flex: 1; min-width: 0; justify-content: center; padding: 9px 14px; }
    .gsm-footer {
      margin-top: 18px; padding-top: 14px;
      border-top: .5px solid var(--separator2);
      display: flex; gap: 16px; flex-wrap: wrap;
    }
    .gsm-link { color: var(--accent); font-size: 12px; text-decoration: none; }
    .gsm-link:hover { text-decoration: underline; }
    .modal-threshold {
      padding: 14px 24px;
      border-bottom: .5px solid var(--separator);
      display: flex; align-items: center; gap: 12px;
      flex-shrink: 0;
      background: var(--surface2);
    }
    .threshold-label { font-size: 13px; color: var(--text-sec); white-space: nowrap; }
    .threshold-slider {
      flex: 1; accent-color: var(--orange);
      cursor: pointer; height: 4px;
    }
    .threshold-val {
      font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums;
      color: var(--orange); white-space: nowrap; min-width: 36px;
    }
    .modal-select-bar {
      padding: 8px 24px;
      display: flex; align-items: center; gap: 10px;
      border-bottom: .5px solid var(--separator);
      flex-shrink: 0;
    }
    .modal-select-count { font-size: 12px; color: var(--text-ter); flex: 1; }
    .modal-body {
      overflow-y: auto; flex: 1;
      padding: 8px 0;
    }
    .apply-item {
      display: flex; align-items: center; gap: 14px;
      padding: 10px 24px;
      border-bottom: .5px solid var(--separator);
      transition: background .1s;
      cursor: pointer;
    }
    .apply-item:last-child { border-bottom: none; }
    .apply-item:hover { background: var(--surface2); }
    .apply-item input[type="checkbox"] {
      width: 16px; height: 16px; cursor: pointer;
      accent-color: var(--orange); flex-shrink: 0;
    }
    .apply-item-info { flex: 1; min-width: 0; }
    .apply-item-company { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .apply-item-role { font-size: 12px; color: var(--text-sec); }
    .apply-item-num { font-size: 11px; color: var(--text-ter); font-family: var(--font-mono); }
    .apply-item-report { font-size: 11px; color: var(--accent); text-decoration: none; opacity: .8; }
    .apply-item-report:hover { opacity: 1; }
    .modal-footer {
      padding: 16px 24px;
      border-top: .5px solid var(--separator);
      display: flex; align-items: center; justify-content: flex-end; gap: 10px;
      flex-shrink: 0;
      background: var(--surface2);
      border-radius: 0 0 var(--r-xl) var(--r-xl);
    }
    .modal-empty {
      padding: 40px 24px; text-align: center;
      color: var(--text-ter); font-size: 13px;
    }

    /* ── Per-row apply button ── */
    .btn-row-apply {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px;
      font-size: 11px; font-weight: 600; font-family: var(--font);
      border-radius: 6px; border: .5px solid rgba(255,159,10,.4);
      background: rgba(255,159,10,.1); color: var(--orange);
      cursor: pointer; white-space: nowrap;
      transition: background .15s, opacity .15s;
    }
    .btn-row-apply:hover { background: rgba(255,159,10,.2); }

    /* ── Per-row open URL button ── */
    .btn-row-open {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 3px 8px;
      font-size: 11px; font-weight: 600; font-family: var(--font);
      border-radius: 6px; border: .5px solid rgba(10,132,255,.35);
      background: rgba(10,132,255,.1); color: var(--accent);
      cursor: pointer; white-space: nowrap;
      transition: background .15s, opacity .15s;
      text-decoration: none;
      margin-right: 4px;
    }
    .btn-row-open:hover { background: rgba(10,132,255,.2); }
    .btn-row-open.disabled { opacity: .35; cursor: not-allowed; }

    /* ── Comp cell ── */
    .td-comp {
      font-family: var(--font-mono);
      font-size: 11.5px;
      color: var(--text-sec);
      white-space: nowrap;
      letter-spacing: -.01em;
    }
    .td-comp.high {
      color: var(--green);
      font-weight: 600;
    }
    .td-comp.premium {
      color: var(--yellow);
      font-weight: 600;
    }
    .comp-tier {
      display: inline-block;
      width: 6px; height: 6px;
      border-radius: 50%;
      margin-right: 6px;
      vertical-align: 1px;
    }
    .comp-tier.premium { background: var(--yellow); box-shadow: 0 0 4px var(--yellow); }
    .comp-tier.high { background: var(--green); }
    .comp-tier.unknown { background: var(--text-ter); }

    /* ── Today's Activity panel ── */
    .today-panel {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 18px;
      padding: 14px 16px;
      background: linear-gradient(135deg, rgba(48,209,88,.06), rgba(10,132,255,.04));
      border: .5px solid var(--separator2);
      border-radius: var(--r-md);
      position: relative;
      overflow: hidden;
    }
    .today-panel::before {
      content: '';
      position: absolute; top: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg, var(--green), var(--accent));
    }
    .today-cell {
      display: flex; flex-direction: column; gap: 2px;
      padding: 0 6px;
      border-right: .5px solid var(--separator);
    }
    .today-cell:last-child { border-right: none; }
    .today-label {
      font-size: 10px; font-weight: 600;
      color: var(--text-ter);
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .today-value {
      font-size: 22px; font-weight: 700;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      color: var(--text);
      letter-spacing: -.02em;
    }
    .today-value.green   { color: var(--green); }
    .today-value.blue    { color: var(--accent); }
    .today-value.yellow  { color: var(--yellow); }
    .today-value.orange  { color: var(--orange); }
    .today-sub {
      font-size: 11px; color: var(--text-sec);
      margin-top: 2px;
    }
    .today-header {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 10px;
      grid-column: 1 / -1;
    }
    .today-title {
      font-size: 12px; font-weight: 700;
      color: var(--text-sec);
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .today-date {
      font-size: 11px; color: var(--text-ter);
      font-variant-numeric: tabular-nums;
      margin-left: auto;
    }

    /* ── Money filter pill ── tinted but not gaudy */
    .filter-pill.money {
      background: rgba(255,214,10,.10);
      border-color: rgba(255,214,10,.28);
      color: var(--yellow);
      font-weight: 700;
    }
    .filter-pill.money:hover { background: rgba(255,214,10,.16); color: var(--yellow); }
    .filter-pill.money.active {
      background: linear-gradient(180deg, color-mix(in srgb, var(--yellow) 92%, white 8%), var(--yellow));
      color: #1a1a1a;
      border-color: transparent;
      box-shadow: var(--edge-sheen), 0 4px 12px rgba(255,214,10,.30);
    }
    .gmail-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 6px var(--green);
      animation: pulse 2.5s ease-in-out infinite;
    }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }

    /* ── Layout ── */
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 340px;
      gap: 0;
      min-height: calc(100vh - 52px);
      max-width: 1680px;
      margin: 0 auto;
    }
    .main { padding: 24px; min-width: 0; }
    .sidebar {
      border-left: .5px solid var(--separator);
      display: flex; flex-direction: column;
      min-width: 0;
    }

    /* ── Stats grid ── */
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
      gap: var(--space-3);
      margin-bottom: var(--space-6);
    }
    /* Zero-state hero — shown only when no apps exist yet, replaces the
       9-card grid that would otherwise be a wall of zeros. */
    .stats-zero {
      display: none;
      margin-bottom: 24px;
      padding: 22px 26px;
      background:
        radial-gradient(circle at 0% 0%, rgba(40,184,255,.08), transparent 40%),
        radial-gradient(circle at 100% 100%, rgba(48,209,88,.06), transparent 40%),
        var(--surface);
      border: .5px solid var(--separator2);
      border-radius: var(--r-md);
      display: flex; align-items: center; gap: 22px; flex-wrap: wrap;
    }
    .stats-zero[hidden] { display: none !important; }
    .stats-zero-icon {
      flex: 0 0 auto;
      width: 48px; height: 48px;
      background: linear-gradient(135deg, #0a84ff 0%, #30d158 100%);
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px;
      box-shadow: 0 6px 18px rgba(10,132,255,.30);
    }
    .stats-zero-body { flex: 1 1 220px; min-width: 0; }
    .stats-zero-title { font-size: 16px; font-weight: 700; letter-spacing: -.01em; }
    .stats-zero-sub { font-size: 13px; color: var(--text-sec); margin-top: 4px; line-height: 1.5; }
    .stats-zero-sub code {
      font-size: 12px; padding: 1px 6px; border-radius: 4px;
      background: var(--surface3); color: var(--text);
    }
    .stats-zero-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .stat-card {
      background: var(--surface);
      border-radius: var(--r-md);
      padding: 14px 16px 16px;
      position: relative;
      overflow: hidden;
      cursor: pointer;
      transition: background var(--dur-fast) var(--ease-out),
                  transform var(--dur-fast) var(--ease-spring),
                  box-shadow var(--dur-fast) var(--ease-out);
      border: .5px solid var(--hairline);
      box-shadow: var(--edge-sheen), var(--shadow-1);
    }
    .stat-card:hover {
      background: var(--surface2);
      transform: translateY(-1px);
      box-shadow: var(--edge-sheen), var(--shadow-2);
    }
    .stat-card:active { transform: translateY(0); }
    .stat-card.active {
      background: var(--surface2);
      box-shadow:
        var(--edge-sheen),
        var(--shadow-2),
        inset 0 0 0 1px color-mix(in srgb, var(--status-color, var(--accent)) 40%, transparent);
    }
    .stat-bar {
      position: absolute; top: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg,
        color-mix(in srgb, var(--status-color, var(--accent)) 70%, transparent),
        var(--status-color, var(--accent)));
      opacity: .85;
    }
    .stat-label {
      font-size: var(--t-caption); font-weight: 600;
      color: var(--text-ter);
      text-transform: uppercase;
      letter-spacing: .045em;
      margin-bottom: var(--space-2);
    }
    .stat-value {
      font-size: 32px; font-weight: 700;
      line-height: 1;
      letter-spacing: -.025em;
      color: var(--status-color, var(--text));
      font-variant-numeric: tabular-nums;
    }

    /* ── Section ── */
    .section-header {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 12px;
    }
    .section-title {
      font-size: 13px; font-weight: 600;
      color: var(--text-sec);
      text-transform: uppercase;
      letter-spacing: .06em;
    }
    .badge-count {
      font-size: 11px; font-weight: 600;
      padding: 1px 7px; border-radius: 20px;
      background: var(--surface3);
      color: var(--text-ter);
    }

    /* ── Search + filter bar ── */
    .controls {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .search-wrap {
      position: relative; flex: 1; min-width: 180px;
    }
    .search-icon {
      position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
      color: var(--text-ter); font-size: 14px; pointer-events: none;
    }
    .search-input {
      width: 100%; padding: 7px 12px 7px 32px;
      font-size: 13px; font-family: var(--font);
      background: var(--surface);
      border: .5px solid var(--separator2);
      border-radius: var(--r-sm);
      color: var(--text);
      outline: none;
      transition: border-color .15s, box-shadow .15s;
    }
    .search-input::placeholder { color: var(--text-ter); }
    .search-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-ring);
    }
    .filter-pills {
      display: flex; gap: 6px; flex-wrap: wrap;
    }
    .filter-pill {
      padding: 6px 14px;
      font-size: var(--t-footnote); font-weight: 590; font-family: var(--font);
      border-radius: var(--r-pill);
      border: .5px solid var(--hairline-2);
      background: rgba(255,255,255,.04);
      color: var(--text-sec);
      cursor: pointer;
      transition: background var(--dur-fast) var(--ease-out),
                  color var(--dur-fast) var(--ease-out),
                  transform var(--dur-fast) var(--ease-spring),
                  box-shadow var(--dur-fast) var(--ease-out);
      letter-spacing: -.005em;
      -webkit-tap-highlight-color: transparent;
    }
    .filter-pill:hover { background: rgba(255,255,255,.08); color: var(--text); }
    .filter-pill:active { transform: scale(.96); }
    .filter-pill:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-ring); }
    .filter-pill.active {
      background: var(--accent-bg);
      border-color: transparent;
      color: var(--accent);
      box-shadow: inset 0 0 0 1px var(--accent-ring);
    }

    /* ── Table ── softer dividers, sticky head */
    .table-card {
      background: var(--surface);
      border-radius: var(--r-lg);
      border: .5px solid var(--hairline);
      overflow: hidden;
      box-shadow: var(--edge-sheen), var(--shadow-1);
    }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      padding: 11px 16px;
      text-align: left;
      font-size: var(--t-caption); font-weight: 600;
      color: var(--text-ter);
      text-transform: uppercase;
      letter-spacing: .055em;
      background: var(--mat-thick);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border-bottom: .5px solid var(--hairline);
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
      position: sticky; top: 56px; z-index: 10;
      transition: color var(--dur-fast) var(--ease-out);
    }
    thead th:hover { color: var(--text-sec); }
    thead th .sort-arrow { margin-left: 4px; opacity: .5; }
    tbody tr {
      border-bottom: .5px solid var(--hairline);
      transition: background var(--dur-fast) var(--ease-out);
      cursor: pointer;
    }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: rgba(255,255,255,.03); }
    tbody tr.followup-row { background: rgba(255,159,10,.04); box-shadow: inset 2px 0 0 var(--orange); }
    tbody tr.followup-row:hover { background: rgba(255,159,10,.08); }
    td {
      padding: 12px 16px;
      font-size: var(--t-subhead);
      vertical-align: middle;
    }
    .td-num { color: var(--text-ter); font-size: var(--t-caption); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
    .td-company { font-weight: 600; display: flex; align-items: center; gap: var(--space-2); letter-spacing: -.01em; }
    .company-avatar {
      width: 26px; height: 26px; border-radius: var(--r-xs);
      background: var(--surface3);
      display: flex; align-items: center; justify-content: center;
      font-size: var(--t-caption); font-weight: 700;
      box-shadow: var(--edge-sheen);
      flex-shrink: 0;
      color: var(--text-sec);
    }
    .td-role { color: var(--text-sec); font-size: 12px; }
    .td-date { color: var(--text-ter); font-size: 11px; font-family: var(--font-mono); white-space: nowrap; }
    .td-notes { color: var(--text-ter); font-size: 11px; max-width: 220px; line-height: 1.4; }
    .td-actions { text-align: right; }

    /* ── Status badges ── borderless capsule with leading dot */
    .status-badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 3px 10px 3px 8px; border-radius: var(--r-pill);
      font-size: var(--t-caption); font-weight: 600;
      letter-spacing: -.005em;
      white-space: nowrap;
      cursor: pointer;
      transition: filter var(--dur-fast) var(--ease-out),
                  transform var(--dur-fast) var(--ease-spring);
      position: relative;
    }
    .status-badge:hover { filter: brightness(1.15); }
    .status-badge:active { transform: scale(.96); }
    .status-badge::before {
      content: '';
      width: 5px; height: 5px; border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 6px currentColor;
    }
    .s-evaluated { color: var(--text-sec); background: rgba(255,255,255,.06); }
    .s-applied   { color: var(--blue);     background: var(--blue-bg); }
    .s-responded { color: var(--cyan);     background: var(--cyan-bg); }
    .s-interview { color: var(--yellow);   background: var(--yellow-bg); }
    .s-offer     { color: var(--green);    background: var(--green-bg); }
    .s-rejected  { color: var(--red);      background: var(--red-bg); }
    .s-discarded { color: var(--text-ter); background: rgba(255,255,255,.04); }
    .s-skip      { color: var(--purple);   background: var(--purple-bg); }

    /* ── Follow-up tag ── */
    .followup-tag {
      display: inline-flex; align-items: center; gap: 4px;
      margin-left: 6px;
      padding: 2px 6px; border-radius: 10px;
      font-size: 10px; font-weight: 700;
      color: var(--orange);
      background: var(--orange-bg);
      border: .5px solid rgba(255,159,10,.25);
      animation: pulse 2s ease-in-out infinite;
    }

    /* ── Score pill ── tighter, borderless */
    .score {
      display: inline-block;
      padding: 3px 10px; border-radius: var(--r-pill);
      font-size: var(--t-footnote); font-weight: 700;
      letter-spacing: -.01em;
      font-variant-numeric: tabular-nums;
    }
    .score-high { color: var(--green);  background: var(--green-bg); }
    .score-mid  { color: var(--yellow); background: var(--yellow-bg); }
    .score-low  { color: var(--red);    background: var(--red-bg); }

    /* ── Age badge ── */
    .age-badge {
      font-size: 11px; font-variant-numeric: tabular-nums;
      color: var(--text-ter);
    }
    .age-badge.stale { color: var(--orange); font-weight: 600; }

    /* ── Empty + loading states ── */
    .empty {
      padding: 72px 24px;
      text-align: center;
    }
    .empty-icon {
      font-size: 40px; margin-bottom: var(--space-3); opacity: .55;
      filter: drop-shadow(0 4px 10px rgba(0,0,0,.30));
    }
    .empty-title {
      font-size: var(--t-headline); font-weight: 700; letter-spacing: -.018em;
      margin-bottom: var(--space-1);
    }
    .empty-sub { font-size: var(--t-subhead); color: var(--text-sec); line-height: 1.5; }

    .loading-row td { padding: 40px; text-align: center; }
    .spinner {
      display: inline-block; width: 16px; height: 16px;
      border: 2px solid var(--separator2);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin .6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Sidebar ── */
    .sidebar-section {
      padding: var(--space-5) var(--space-4);
      border-bottom: .5px solid var(--hairline);
    }
    .sidebar-section:last-child { border-bottom: none; }
    .sidebar-title {
      font-size: var(--t-caption); font-weight: 600;
      text-transform: uppercase; letter-spacing: .055em;
      color: var(--text-ter);
      margin-bottom: var(--space-3);
      display: flex; align-items: center; justify-content: space-between;
    }
    .sidebar-refresh {
      background: rgba(40,184,255,.10);
      border: none; color: var(--accent);
      font-size: var(--t-caption); font-family: var(--font); font-weight: 590;
      cursor: pointer;
      padding: 4px 10px;
      border-radius: var(--r-pill);
      transition: background var(--dur-fast) var(--ease-out);
    }
    .sidebar-refresh:hover { background: rgba(40,184,255,.18); }

    /* ── Gmail connect card ── */
    .gmail-connect-card {
      background: var(--surface2);
      border-radius: var(--r-md);
      padding: var(--space-4);
      text-align: center;
      box-shadow: var(--edge-sheen);
    }
    .gmail-connect-card p { font-size: 12px; color: var(--text-sec); margin-bottom: 10px; line-height: 1.5; }
    .gmail-setup-notice {
      font-size: 11px; color: var(--text-ter); margin-top: 8px; line-height: 1.4;
    }
    .gmail-setup-notice code {
      font-family: var(--font-mono); background: var(--surface3);
      padding: 1px 4px; border-radius: 3px; font-size: 10px;
    }

    /* ── Gmail signals ── */
    .signal-card {
      background: var(--surface2);
      border-radius: var(--r-md);
      padding: 12px;
      margin-bottom: 8px;
      border: .5px solid var(--separator2);
      transition: background .15s;
    }
    .signal-card:hover { background: var(--surface3); }
    .signal-header {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
      margin-bottom: 6px;
    }
    .signal-company { font-size: 13px; font-weight: 600; }
    .signal-type {
      font-size: 10px; font-weight: 700;
      padding: 2px 7px; border-radius: 10px;
      flex-shrink: 0;
      border: .5px solid;
    }
    .signal-interview { color: var(--yellow); background: var(--yellow-bg); border-color: rgba(255,214,10,.25); }
    .signal-rejected  { color: var(--red);    background: var(--red-bg);    border-color: rgba(255,69,58,.25); }
    .signal-received  { color: var(--blue);   background: var(--blue-bg);   border-color: rgba(10,132,255,.25); }
    .signal-subject { font-size: 11px; color: var(--text-sec); margin-bottom: 4px; line-height: 1.4; }
    .signal-snippet { font-size: 11px; color: var(--text-ter); margin-bottom: 8px; line-height: 1.4; }
    .signal-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .signal-btn {
      padding: 4px 10px;
      font-size: 11px; font-weight: 600; font-family: var(--font);
      border-radius: 6px; border: none; cursor: pointer;
      transition: opacity .15s;
    }
    .signal-btn:hover { opacity: .8; }
    .signal-btn-confirm { background: var(--accent); color: #fff; }
    .signal-btn-dismiss { background: var(--surface3); color: var(--text-sec); }

    /* ── Verification codes ── */
    .signal-verification { color: var(--purple); background: var(--purple-bg); border-color: rgba(191,90,242,.25); }
    .vcode-card {
      background: var(--surface2); border-radius: var(--r-md);
      padding: 12px; margin-bottom: 8px;
      border: .5px solid rgba(191,90,242,.25);
      position: relative;
    }
    .vcode-company { font-size: 12px; font-weight: 600; color: var(--text); }
    .vcode-value {
      font-size: 28px; font-weight: 700; font-family: var(--font-mono);
      color: var(--purple); letter-spacing: .18em; margin: 6px 0;
    }
    .vcode-meta { font-size: 11px; color: var(--text-ter); }
    .vcode-copy {
      position: absolute; top: 10px; right: 10px;
      background: var(--surface3); border: none; color: var(--text-sec);
      padding: 4px 10px; border-radius: 6px; font-size: 11px;
      cursor: pointer; font-family: var(--font);
    }
    .vcode-copy:hover { color: var(--text); background: var(--purple-bg); }
    .vcode-copy.copied { color: var(--green); }
    .vcode-expire { font-size: 10px; color: var(--orange); font-weight: 600; }
    .vcode-link {
      font-size: 11px; color: var(--accent); word-break: break-all;
      display: block; margin-top: 4px;
    }

    /* ── Auto-apply ── */
    .btn-auto-apply {
      background: linear-gradient(135deg, #bf5af2, #8944d6);
      color: #fff; font-weight: 700; letter-spacing: -.01em;
    }
    .btn-auto-apply:hover { opacity: .9; }

    /* Autopilot toggle */
    .btn-autopilot {
      background: var(--surface3); color: var(--text-sec);
      font-weight: 600; transition: all .25s;
    }
    .btn-autopilot:hover { opacity: .85; }
    .btn-autopilot.active {
      background: linear-gradient(135deg, #30d158, #0a84ff);
      color: #fff;
      box-shadow: 0 0 14px rgba(48,209,88,.4);
      animation: autopilot-glow 2s ease-in-out infinite;
    }
    @keyframes autopilot-glow {
      0%,100% { box-shadow: 0 0 14px rgba(48,209,88,.4); }
      50% { box-shadow: 0 0 22px rgba(48,209,88,.6); }
    }
    .autopilot-bar {
      display: none;
      background: linear-gradient(90deg, rgba(48,209,88,.08), rgba(10,132,255,.08));
      border: .5px solid rgba(48,209,88,.2);
      border-radius: var(--r-lg);
      padding: 12px 18px;
      margin-bottom: 16px;
      align-items: center; gap: 12px;
    }
    .autopilot-bar.show { display: flex; }
    .autopilot-bar-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--green); flex-shrink: 0;
      box-shadow: 0 0 8px var(--green);
      animation: pulse 2s ease-in-out infinite;
    }
    .autopilot-bar-text { flex: 1; }
    .autopilot-bar-title { font-size: 13px; font-weight: 600; color: var(--green); }
    .autopilot-bar-sub { font-size: 11px; color: var(--text-sec); margin-top: 2px; }
    .autopilot-bar-stats {
      display: flex; gap: 14px; font-size: 12px; font-family: var(--font-mono);
      color: var(--text-sec);
    }
    .autopilot-bar-stats span { color: var(--green); font-weight: 700; }
    .pipeline-bar {
      display: flex; align-items: center; gap: var(--space-3);
      padding: 9px 16px; margin-bottom: var(--space-3);
      background: var(--mat-thin);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: .5px solid var(--hairline);
      border-radius: var(--r-pill);
      font-size: var(--t-footnote); color: var(--text-sec);
      box-shadow: var(--edge-sheen);
    }
    .pipeline-bar-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--blue); flex-shrink: 0;
      box-shadow: 0 0 8px currentColor;
      color: var(--blue);
    }
    .pipeline-bar-dot.idle { background: var(--text-ter); color: transparent; box-shadow: none; }
    .pipeline-bar-dot.running { animation: pulse 1.5s ease-in-out infinite; }
    .pipeline-bar-label { font-weight: 700; color: var(--blue); letter-spacing: -.005em; }
    .pipeline-bar-label.idle { color: var(--text-sec); }
    .pipeline-bar-next { margin-left: auto; color: var(--text-ter); font-family: var(--font-mono); font-size: var(--t-caption); }
    .auto-apply-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 6000;
      display: none; align-items: center; justify-content: center;
      padding: 24px;
    }
    .auto-apply-overlay.active { display: flex; }
    .auto-apply-panel {
      background: var(--bg-elevated);
      border: .5px solid var(--separator2);
      border-radius: var(--r-xl);
      box-shadow: var(--shadow-lg);
      width: 100%; max-width: 520px;
      padding: 28px;
    }
    .aa-title { font-size: 18px; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
    .aa-current {
      background: var(--surface2); border-radius: var(--r-md);
      padding: 14px; margin-bottom: 16px;
    }
    .aa-current-company { font-size: 14px; font-weight: 600; }
    .aa-current-step { font-size: 12px; color: var(--purple); margin-top: 4px; }
    .aa-progress {
      height: 4px; background: var(--surface3); border-radius: 2px;
      margin-bottom: 16px; overflow: hidden;
    }
    .aa-progress-bar {
      height: 100%; background: linear-gradient(90deg, var(--purple), var(--accent));
      border-radius: 2px; transition: width .3s;
    }
    .aa-log {
      max-height: 200px; overflow-y: auto;
      font-size: 12px; font-family: var(--font-mono);
      color: var(--text-sec); line-height: 1.6;
    }
    .aa-log-ok { color: var(--green); }
    .aa-log-err { color: var(--red); }
    .aa-log-skip { color: var(--orange); }
    .aa-actions { margin-top: 16px; display: flex; gap: 10px; justify-content: flex-end; }

    /* Autopilot activity log panel */
    .autopilot-log-panel {
      background: var(--surface);
      border: .5px solid var(--separator2);
      border-radius: var(--r-lg);
      padding: 14px 18px;
      margin-bottom: 16px;
    }
    .ap-log-entry {
      display: flex; align-items: center; gap: 10px;
      padding: 4px 0;
      border-bottom: .5px solid var(--separator);
    }
    .ap-log-entry:last-child { border-bottom: none; }
    .ap-log-ts { font-size: 10px; color: var(--text-ter); font-family: var(--font-mono); min-width: 52px; }
    .ap-log-icon { font-size: 12px; min-width: 16px; text-align: center; }
    .ap-log-company { font-size: 12px; font-weight: 600; color: var(--text); flex: 1; }
    .ap-log-role { font-size: 11px; color: var(--text-sec); flex: 2; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ap-log-status { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 8px; white-space: nowrap; }
    .ap-log-applied { color: var(--green); background: var(--green-bg); }
    .ap-log-failed { color: var(--red); background: var(--red-bg); }
    .ap-log-skipped { color: var(--orange); background: var(--orange-bg); }
    .ap-log-crash { color: var(--red); background: var(--red-bg); }

    /* ── Pipeline sidebar section ── */
    .pipeline-item {
      display: flex; align-items: center; gap: 10px;
      padding: 7px 0;
      border-bottom: .5px solid var(--separator);
    }
    .pipeline-item:last-child { border-bottom: none; }
    .pipeline-dot {
      width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
    }
    .dot-pending { background: var(--accent); box-shadow: 0 0 5px var(--accent); }
    .dot-done    { background: var(--surface3); }
    .pipeline-url {
      flex: 1; font-size: 11px; color: var(--text-ter);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* ── Manual Apply Queue sidebar section ── */
    .mq-item {
      display: flex; flex-direction: column; gap: 4px;
      padding: 8px 0;
      border-bottom: .5px solid var(--separator);
    }
    .mq-item:last-child { border-bottom: none; }
    .mq-header { display: flex; align-items: center; gap: 6px; }
    .mq-company { font-size: 13px; font-weight: 600; color: var(--text); flex: 1; }
    .mq-score { font-size: 11px; color: var(--text-ter); }
    .mq-role { font-size: 11px; color: var(--text-sec); line-height: 1.3; }
    .mq-reason {
      font-size: 10px; font-weight: 600; letter-spacing: .04em;
      color: var(--orange); text-transform: uppercase;
    }
    .mq-actions { display: flex; align-items: center; gap: 6px; margin-top: 2px; flex-wrap: wrap; }
    .mq-link {
      font-size: 11px; color: var(--accent); text-decoration: none;
      padding: 2px 6px; border-radius: 4px;
      border: .5px solid rgba(10,132,255,.25);
      white-space: nowrap;
      transition: background .15s;
    }
    .mq-link:hover { background: rgba(10,132,255,.1); }
    .mq-done-btn {
      font-size: 11px; color: var(--green); cursor: pointer;
      padding: 2px 8px; border-radius: 4px;
      border: .5px solid rgba(48,209,88,.25);
      background: none; white-space: nowrap;
      transition: background .15s;
      margin-left: auto;
    }
    .mq-done-btn:hover { background: rgba(48,209,88,.12); }
    #manual-queue-section { display: none; }

    /* ── Onboarding modal ── */
    .onboard-modal {
      display: none; position: fixed; inset: 0; z-index: 9000;
      background: radial-gradient(ellipse at center, rgba(10,132,255,.08), rgba(0,0,0,.78) 70%);
      backdrop-filter: blur(20px) saturate(140%);
      -webkit-backdrop-filter: blur(20px) saturate(140%);
      align-items: center; justify-content: center; padding: 20px;
    }
    .onboard-modal.open { display: flex; }
    .onboard-box {
      position: relative;
      /* Liquid-glass surface: translucent base + saturate boost so the backdrop
         picks up subtle color from anything behind it */
      background: linear-gradient(180deg, rgba(40,40,42,.85) 0%, rgba(28,28,30,.85) 100%);
      backdrop-filter: blur(40px) saturate(180%);
      -webkit-backdrop-filter: blur(40px) saturate(180%);
      border: .5px solid rgba(255,255,255,.12);
      border-radius: var(--r-xl);
      box-shadow:
        0 24px 60px rgba(0,0,0,.55),
        0 1px 0 rgba(255,255,255,.06) inset,
        0 0 0 1px rgba(255,255,255,.02) inset;
      width: 100%; max-width: 580px;
      max-height: 90vh; overflow-y: auto;
      padding: 28px;
      isolation: isolate;
    }
    /* Prismatic edge — a faint conic-gradient ring around the modal */
    .onboard-box::before {
      content: '';
      position: absolute; inset: -1px; border-radius: inherit;
      padding: 1px;
      background: conic-gradient(from 180deg at 50% 50%,
        rgba(10,132,255,.45),
        rgba(94,92,230,.40),
        rgba(191,90,242,.35),
        rgba(255,55,95,.35),
        rgba(255,159,10,.35),
        rgba(48,209,88,.40),
        rgba(10,132,255,.45));
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor; mask-composite: exclude;
      opacity: .55;
      pointer-events: none;
      z-index: -1;
    }
    .onboard-header {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
      margin-bottom: 20px;
    }
    .onboard-title { font-size: 20px; font-weight: 700; letter-spacing: -.02em; line-height: 1.2; }
    .onboard-sub { font-size: 13px; color: var(--text-sec); margin-top: 4px; }
    .onboard-close {
      background: var(--surface3); border: none; border-radius: 50%;
      width: 28px; height: 28px; font-size: 14px;
      color: var(--text-sec); cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .drop-zone {
      border: 1.5px dashed var(--separator2);
      border-radius: var(--r-lg);
      padding: 32px 20px;
      text-align: center;
      cursor: pointer;
      transition: border-color .15s, background .15s;
      margin-bottom: 16px;
      position: relative;
    }
    .drop-zone.drag-over { border-color: var(--accent); background: var(--accent-bg); }
    .drop-zone input[type="file"] {
      position: absolute; inset: 0; opacity: 0; cursor: pointer;
    }
    .drop-icon { font-size: 32px; margin-bottom: 10px; opacity: .5; }
    .drop-label { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
    .drop-hint { font-size: 11px; color: var(--text-ter); }
    .onboard-divider {
      display: flex; align-items: center; gap: 10px;
      font-size: 11px; color: var(--text-ter); margin: 12px 0;
    }
    .onboard-divider::before, .onboard-divider::after {
      content: ''; flex: 1; height: .5px; background: var(--separator);
    }
    .onboard-textarea {
      width: 100%; min-height: 160px; resize: vertical;
      background: var(--surface2); border: .5px solid var(--separator2);
      border-radius: var(--r-md); padding: 12px;
      color: var(--text); font-family: var(--font-mono); font-size: 12px;
      line-height: 1.6; outline: none;
      transition: border-color .15s;
    }
    .onboard-textarea:focus { border-color: var(--accent); }
    .onboard-actions { display: flex; gap: 10px; margin-top: 16px; }
    .onboard-actions .btn { flex: 1; justify-content: center; }
    .onboard-result {
      background: var(--surface2); border-radius: var(--r-md);
      padding: 16px; margin-top: 16px;
      border: .5px solid var(--separator2);
      display: none;
    }
    .onboard-result.show { display: block; }
    .onboard-result-title { font-size: 12px; font-weight: 600; margin-bottom: 10px; color: var(--green); }
    .onboard-field { font-size: 12px; color: var(--text-sec); margin-bottom: 4px; }
    .onboard-field strong { color: var(--text); }
    .onboard-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .onboard-tag {
      font-size: 10px; padding: 2px 8px; border-radius: 10px;
      background: var(--accent-bg); color: var(--accent);
      border: .5px solid rgba(10,132,255,.25);
    }
    .onboard-spinner { display: none; }
    .onboard-spinner.show { display: inline-block; }

    /* ── Wizard step machinery ──────────────────────────────────────── */
    .wiz-steps {
      display: flex; align-items: center; gap: 6px; margin: 0 0 18px;
      font-size: 11px; color: var(--text-ter);
    }
    .wiz-dot {
      width: 22px; height: 22px; border-radius: 50%;
      background: var(--surface3); color: var(--text-ter);
      display: inline-flex; align-items: center; justify-content: center;
      font-weight: 600; font-size: 11px; flex-shrink: 0;
      transition: background .25s, color .25s, box-shadow .25s, transform .2s;
      position: relative;
    }
    /* Prismatic glow on the active step */
    .wiz-dot.active {
      background: linear-gradient(135deg, #0a84ff, #5e5ce6 45%, #bf5af2);
      color: #fff;
      box-shadow:
        0 0 0 3px rgba(10,132,255,.15),
        0 0 14px rgba(94,92,230,.45),
        0 0 28px rgba(191,90,242,.18);
      transform: scale(1.08);
    }
    .wiz-dot.done {
      background: linear-gradient(135deg, #30d158, #34c759);
      color: #fff;
      box-shadow: 0 0 0 2px rgba(48,209,88,.18);
    }
    .wiz-dot-line { flex: 1; height: 1px; background: var(--separator); }
    .wiz-step { display: none; animation: wiz-fade .18s ease-out; }
    .wiz-step.active { display: block; }
    @keyframes wiz-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    .wiz-label {
      display: block; font-size: 11px; font-weight: 600;
      color: var(--text-sec); text-transform: uppercase; letter-spacing: .04em;
      margin: 14px 0 6px;
    }
    .wiz-hint {
      font-size: 11px; color: var(--text-ter); margin: 4px 0 8px;
    }
    .wiz-count {
      display: inline-block; margin-left: 8px; padding: 1px 8px;
      font-size: 10px; font-weight: 600; letter-spacing: .02em;
      color: var(--text-ter); background: var(--surface2);
      border: .5px solid var(--separator2); border-radius: 999px;
      transition: color .15s, border-color .15s, background .15s;
    }
    .wiz-count.has-selection {
      color: var(--accent); border-color: rgba(40,184,255,.45);
      background: rgba(40,184,255,.10);
    }
    .wiz-input, .wiz-textarea {
      width: 100%;
      background: var(--surface2); border: .5px solid var(--separator2);
      border-radius: var(--r-md); padding: 9px 12px;
      color: var(--text); font-size: 13px; font-family: inherit;
      outline: none; transition: border-color .15s;
    }
    .wiz-textarea { font-family: var(--font-mono); font-size: 12px; min-height: 84px; resize: vertical; line-height: 1.5; }
    .wiz-input:focus, .wiz-textarea:focus { border-color: var(--accent); }
    .wiz-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .wiz-row .wiz-input { width: 100%; }
    .wiz-chips {
      display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;
    }
    .wiz-chip {
      font-size: 12px; padding: 5px 11px; border-radius: 12px;
      background: var(--surface2); color: var(--text-sec);
      border: .5px solid var(--separator2); cursor: pointer;
      transition: background .12s, border-color .12s, color .12s;
      user-select: none;
    }
    .wiz-chip:hover { border-color: var(--separator2); color: var(--text); }
    .wiz-chip.selected {
      background: linear-gradient(180deg, rgba(10,132,255,.18), rgba(10,132,255,.10));
      color: #6cb2ff;
      border-color: rgba(10,132,255,.45);
      box-shadow: 0 0 0 1px rgba(10,132,255,.25), 0 4px 14px rgba(10,132,255,.15);
    }
    .wiz-chip.selected.deal-breaker {
      background: linear-gradient(180deg, rgba(255,69,58,.18), rgba(255,69,58,.10));
      color: #ff7a72;
      border-color: rgba(255,69,58,.45);
      box-shadow: 0 0 0 1px rgba(255,69,58,.22), 0 4px 14px rgba(255,69,58,.12);
    }

    /* Prismatic primary CTA — only when in wizard context */
    #onboard-btn {
      position: relative;
      background: linear-gradient(180deg, #0a84ff 0%, #0066cc 100%);
      border: none;
      box-shadow:
        0 0 0 .5px rgba(255,255,255,.18) inset,
        0 1px 0 rgba(255,255,255,.20) inset,
        0 6px 18px rgba(10,132,255,.30);
      transition: transform .12s ease, box-shadow .25s ease, filter .2s ease;
      overflow: hidden;
    }
    #onboard-btn::after {
      content: '';
      position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(120deg,
        transparent 0%, transparent 35%,
        rgba(255,255,255,.18) 50%,
        transparent 65%, transparent 100%);
      transform: translateX(-100%);
      transition: transform .9s ease;
    }
    #onboard-btn:hover::after { transform: translateX(100%); }
    #onboard-btn:hover {
      filter: brightness(1.08);
      box-shadow:
        0 0 0 .5px rgba(255,255,255,.22) inset,
        0 1px 0 rgba(255,255,255,.24) inset,
        0 8px 26px rgba(10,132,255,.45),
        0 0 0 4px rgba(94,92,230,.10);
    }
    #onboard-btn:active { transform: translateY(1px); }
    #onboard-btn:disabled { filter: grayscale(.4) brightness(.7); cursor: not-allowed; }
    .wiz-add-row { display: flex; gap: 6px; margin-top: 8px; }
    .wiz-add-row .wiz-input { flex: 1; }
    .wiz-add-row .wiz-add-btn {
      background: var(--surface3); border: none; border-radius: var(--r-md);
      padding: 0 14px; color: var(--text); cursor: pointer;
      font-size: 13px; font-weight: 600;
    }
    .wiz-proof {
      background: var(--surface2); border: .5px solid var(--separator2);
      border-radius: var(--r-md); padding: 10px; margin-top: 8px;
      display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 6px; align-items: center;
    }
    .wiz-proof .wiz-input { font-size: 12px; padding: 6px 9px; }
    .wiz-proof-rm {
      background: transparent; border: none; color: var(--text-ter);
      cursor: pointer; padding: 4px 8px; font-size: 16px;
    }
    .wiz-summary {
      background: var(--surface2); border: .5px solid var(--separator2);
      border-radius: var(--r-md); padding: 14px; margin-top: 4px;
      font-size: 12px; line-height: 1.7;
    }
    .wiz-summary strong { color: var(--text); }
    .wiz-summary .wiz-summary-row { color: var(--text-sec); margin-bottom: 4px; }
    .wiz-summary .wiz-summary-row em { color: var(--text-ter); font-style: normal; }
    .wiz-empty { color: var(--text-ter); font-style: italic; font-size: 11px; }

    /* Inline banners for empty-state / PDF-detected / existing-profile flows */
    .wiz-banner {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 10px 12px; margin-bottom: 14px;
      border-radius: var(--r-md); font-size: 12px; line-height: 1.45;
      border: .5px solid transparent;
    }
    .wiz-banner-info {
      background: rgba(10,132,255,.08); color: #6cb2ff;
      border-color: rgba(10,132,255,.22);
    }
    .wiz-banner-warn {
      background: rgba(255,159,10,.08); color: #ffb340;
      border-color: rgba(255,159,10,.25);
    }
    .wiz-banner-icon { font-size: 14px; line-height: 1.2; flex-shrink: 0; }
    .wiz-banner-action {
      margin-left: auto; background: transparent; border: .5px solid currentColor;
      color: inherit; padding: 3px 9px; border-radius: 6px; cursor: pointer;
      font-size: 11px; font-weight: 600;
    }
    .wiz-banner-action:hover { background: currentColor; color: var(--surface); }

    /* Mobile: stack the two-column rows */
    @media (max-width: 520px) {
      .onboard-box { padding: 18px; max-width: 96vw; }
      .wiz-row { grid-template-columns: 1fr; }
      .wiz-proof { grid-template-columns: 1fr; }
      .wiz-proof-rm { justify-self: end; }
      .onboard-actions { flex-wrap: wrap; }
    }

    /* Inline validation: red ring on invalid input + helper text below */
    .wiz-input[aria-invalid="true"], .wiz-textarea[aria-invalid="true"] {
      border-color: rgba(255,69,58,.55);
      box-shadow: 0 0 0 3px rgba(255,69,58,.10);
    }
    .wiz-field-error {
      display: none; color: #ff7a72; font-size: 11px; margin: 4px 2px 0;
    }
    .wiz-field-error.show { display: block; }

    /* Step indicator dots show their step name on hover (desktop) */
    .wiz-dot[title]:hover::after {
      content: attr(title);
      position: absolute; left: 50%; transform: translateX(-50%);
      bottom: calc(100% + 6px);
      background: var(--surface3); color: var(--text); font-size: 10px;
      padding: 3px 8px; border-radius: 4px; white-space: nowrap;
      pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,.3);
    }

    /* ── Apply banner ── */
    .apply-banner {
      display: none;
      background:
        radial-gradient(circle at 0% 50%, rgba(48,209,88,.14), transparent 50%),
        radial-gradient(circle at 100% 50%, rgba(40,184,255,.10), transparent 50%),
        var(--surface);
      border: .5px solid rgba(48,209,88,.22);
      border-radius: var(--r-lg);
      padding: 16px 20px;
      margin-bottom: var(--space-4);
      align-items: center; gap: var(--space-4);
      box-shadow: var(--edge-sheen), var(--shadow-2);
    }
    .apply-banner.show { display: flex; }
    .apply-banner-icon { font-size: 26px; flex-shrink: 0; filter: drop-shadow(0 2px 6px rgba(48,209,88,.40)); }
    .apply-banner-text { flex: 1; min-width: 0; }
    .apply-banner-title { font-size: var(--t-callout); font-weight: 700; color: var(--green); letter-spacing: -.01em; }
    .apply-banner-sub { font-size: var(--t-footnote); color: var(--text-sec); margin-top: 3px; line-height: 1.45; }
    .apply-banner .btn {
      background: linear-gradient(180deg, color-mix(in srgb, var(--green) 92%, white 8%), var(--green));
      color: #0a1d12; font-weight: 700;
      border: none; white-space: nowrap;
      box-shadow: var(--edge-sheen), 0 2px 8px rgba(48,209,88,.30);
    }
    .apply-banner .btn:hover { filter: brightness(1.05); }

    /* ── Follow-up list ── */
    .followup-item {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 0;
      border-bottom: .5px solid var(--separator);
    }
    .followup-item:last-child { border-bottom: none; }
    .followup-info { flex: 1; }
    .followup-company { font-size: 12px; font-weight: 600; }
    .followup-age { font-size: 11px; color: var(--orange); font-weight: 600; }

    /* ── Status dropdown (inline) ── */
    .status-dropdown {
      position: absolute; top: calc(100% + 4px); left: 0;
      background: var(--surface2);
      border: .5px solid var(--separator2);
      border-radius: var(--r-md);
      box-shadow: var(--shadow-lg);
      padding: 6px;
      min-width: 160px;
      z-index: 1000;
      display: none;
    }
    .status-dropdown.open { display: block; }
    .status-option {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 10px;
      border-radius: 6px;
      font-size: 12px; font-weight: 500;
      cursor: pointer;
      color: var(--text-sec);
      transition: background .1s;
    }
    .status-option:hover { background: var(--surface3); color: var(--text); }
    .status-option::before {
      content: '';
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--dot-color, var(--text-ter));
      flex-shrink: 0;
    }

    /* ── Toast ── floats above content with material backdrop */
    .toast {
      position: fixed; bottom: var(--space-6); right: var(--space-6);
      background: var(--mat-thick);
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      border: .5px solid var(--hairline-2);
      border-radius: var(--r-md);
      padding: 12px 18px;
      font-size: var(--t-subhead); font-weight: 590;
      letter-spacing: -.005em;
      color: var(--text);
      box-shadow: var(--edge-sheen), var(--shadow-3);
      opacity: 0; transform: translateY(14px) scale(.96);
      transition: opacity var(--dur-med) var(--ease-out),
                  transform var(--dur-med) var(--ease-spring);
      pointer-events: none;
      max-width: 360px;
      z-index: 9999;
    }
    .toast.show { opacity: 1; transform: none; }
    .toast-success { box-shadow: var(--edge-sheen), var(--shadow-3), inset 3px 0 0 var(--green); }
    .toast-error   { box-shadow: var(--edge-sheen), var(--shadow-3), inset 3px 0 0 var(--red); }
    .toast-info    { box-shadow: var(--edge-sheen), var(--shadow-3), inset 3px 0 0 var(--accent); }
    @media (max-width: 640px) {
      .toast { left: var(--space-3); right: var(--space-3); bottom: var(--space-3); max-width: none; }
    }

    /* ── Report viewer ── */
    .report-btn {
      display: inline-flex; align-items: center;
      color: var(--accent); font-size: 12px;
      text-decoration: none; opacity: .7;
      transition: opacity .15s;
    }
    .report-btn:hover { opacity: 1; }

    /* ── Responsive ── */
    /* Tablet: stack sidebar below main so the apps table gets full width.
       Threshold matches Apple HIG split-view collapse points. */
    @media (max-width: 1100px) {
      .layout { grid-template-columns: 1fr; }
      .sidebar { border-left: none; border-top: .5px solid var(--separator); }
    }
    /* Phone: tighten paddings and let the header wrap onto two lines. */
    @media (max-width: 640px) {
      .header { flex-wrap: wrap; height: auto; min-height: 52px; padding: 8px 14px; gap: 8px; }
      .header-spacer { display: none; }
      .header-actions { width: 100%; flex-wrap: wrap; gap: 6px; }
      .last-updated { font-size: 11px; }
      .main { padding: 14px; }
      .stats { gap: 8px; }
      .stat-card { padding: 11px 12px; }
      .stat-value { font-size: 24px; }
      /* WCAG 2.2 — bump tap targets on phones. */
      .btn { padding: 9px 14px; font-size: 13px; }
    }
  </style>
</head>
<body>

<header class="header">
  <div class="logo">
    <div class="logo-mark">✦</div>
    JobSeeker
  </div>
  <div class="header-spacer"></div>
  <div class="header-actions">
    <span class="last-updated" id="last-updated">Loading…</span>
    <div id="gmail-header-status"></div>
    <button class="btn btn-ghost" id="profile-btn" onclick="openOnboard()" title="Update profile / drop resume (⌘ ,)">⊕ Profile</button>
    <button class="btn btn-apply-batch" onclick="openApplyModal()">⚡ Apply</button>
    <button class="btn btn-autopilot" id="autopilot-btn" onclick="toggleAutopilot()">🤖 Autopilot</button>
    <button class="btn btn-ghost" onclick="refresh()">↻ Refresh</button>
  </div>
</header>

<div class="layout">
  <!-- Main content -->
  <main class="main">
    <!-- Autopilot status bar -->
    <div class="autopilot-bar" id="autopilot-bar">
      <div class="autopilot-bar-dot"></div>
      <div class="autopilot-bar-text">
        <div class="autopilot-bar-title">Autopilot Active</div>
        <div class="autopilot-bar-sub" id="autopilot-bar-sub">Applying to evaluated roles...</div>
      </div>
      <div class="autopilot-bar-stats">
        <div>Applied: <span id="ap-applied">0</span></div>
        <div>Failed: <span id="ap-failed" style="color:var(--red)">0</span></div>
        <div>Skipped: <span id="ap-skipped" style="color:var(--orange)">0</span></div>
        <div>Cycles: <span id="ap-cycles" style="color:var(--cyan)">0</span></div>
      </div>
      <button class="btn btn-ghost" onclick="toggleAutopilot()" style="color:var(--red);border-color:rgba(255,69,58,.3)">Stop</button>
    </div>
    <!-- Autopilot activity log -->
    <div class="autopilot-log-panel" id="autopilot-log-panel" style="display:none">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:11px;font-weight:600;color:var(--text-ter);text-transform:uppercase;letter-spacing:.06em">Activity Log</span>
        <span style="font-size:11px;color:var(--text-ter)" id="ap-uptime"></span>
      </div>
      <div id="ap-log-entries" style="max-height:180px;overflow-y:auto;font-size:12px;font-family:var(--font-mono);line-height:1.7"></div>
    </div>

    <!-- Pipeline status bar -->
    <div class="pipeline-bar" id="pipeline-bar" style="display:none">
      <div class="pipeline-bar-dot idle" id="pipeline-dot"></div>
      <span class="pipeline-bar-label idle" id="pipeline-label">Pipeline</span>
      <span id="pipeline-status-text">Idle</span>
      <span class="pipeline-bar-next" id="pipeline-next"></span>
    </div>

    <!-- Today's Activity panel -->
    <div class="today-panel" id="today-panel">
      <div class="today-header">
        <span class="today-title">Today's Activity</span>
        <span class="today-date" id="today-date">—</span>
      </div>
      <div class="today-cell">
        <span class="today-label">Applied today</span>
        <span class="today-value blue" id="today-applied">0</span>
        <span class="today-sub" id="today-applied-sub">submissions</span>
      </div>
      <div class="today-cell">
        <span class="today-label">Pending in queue</span>
        <span class="today-value orange" id="today-pending">0</span>
        <span class="today-sub" id="today-pending-sub">URLs to evaluate</span>
      </div>
      <div class="today-cell">
        <span class="today-label">Interviews</span>
        <span class="today-value yellow" id="today-interviews">0</span>
        <span class="today-sub" id="today-interviews-sub">scheduled</span>
      </div>
      <div class="today-cell">
        <span class="today-label">High-paying ready</span>
        <span class="today-value green" id="today-high-paying">0</span>
        <span class="today-sub" id="today-high-paying-sub">$200K+ to apply</span>
      </div>
    </div>

    <!-- Apply banner -->
    <div class="apply-banner" id="apply-banner">
      <div class="apply-banner-icon">🚀</div>
      <div class="apply-banner-text">
        <div class="apply-banner-title" id="apply-banner-title">17 roles ready to apply</div>
        <div class="apply-banner-sub" id="apply-banner-sub">Evaluated roles scoring 4.0+ — open them all in one click</div>
      </div>
      <button class="btn" onclick="openApplyModal()">⚡ Apply Now</button>
    </div>

    <!-- Zero-state hero (shown when total apps = 0) -->
    <div class="stats-zero" id="stats-zero" hidden>
      <div class="stats-zero-icon">✦</div>
      <div class="stats-zero-body">
        <div class="stats-zero-title" id="stats-zero-title">Welcome to JobSeeker</div>
        <div class="stats-zero-sub" id="stats-zero-sub">
          Drop a job URL into <code>data/pipeline.md</code> or run <code>/career-ops scan</code> to start finding offers.
          We'll score, rank, and queue them for one-click apply.
        </div>
      </div>
      <div class="stats-zero-actions">
        <button class="btn btn-ghost" onclick="openOnboard()" title="Update profile / drop resume (⌘ ,)">⊕ Profile</button>
        <button class="btn btn-apply-batch" onclick="window.scrollTo({top: document.querySelector('.table-card').offsetTop - 80, behavior: 'smooth'})">Show pipeline ↓</button>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats" id="stats-grid">
      <div class="stat-card" style="--status-color:var(--text)" onclick="setFilter('all',this)" data-filter="all">
        <div class="stat-bar"></div>
        <div class="stat-label">Total</div>
        <div class="stat-value" id="s-total">–</div>
      </div>
      <div class="stat-card" style="--status-color:var(--blue)" onclick="setFilter('applied',this)" data-filter="applied">
        <div class="stat-bar"></div>
        <div class="stat-label">Applied</div>
        <div class="stat-value" id="s-applied">–</div>
      </div>
      <div class="stat-card" style="--status-color:var(--cyan)" onclick="setFilter('responded',this)" data-filter="responded">
        <div class="stat-bar"></div>
        <div class="stat-label">Responded</div>
        <div class="stat-value" id="s-responded">–</div>
      </div>
      <div class="stat-card" style="--status-color:var(--yellow)" onclick="setFilter('interview',this)" data-filter="interview">
        <div class="stat-bar"></div>
        <div class="stat-label">Interview</div>
        <div class="stat-value" id="s-interview">–</div>
      </div>
      <div class="stat-card" style="--status-color:var(--green)" onclick="setFilter('offer',this)" data-filter="offer">
        <div class="stat-bar"></div>
        <div class="stat-label">Offer</div>
        <div class="stat-value" id="s-offer">–</div>
      </div>
      <div class="stat-card" style="--status-color:var(--orange)" onclick="setFilter('followup',this)" data-filter="followup">
        <div class="stat-bar"></div>
        <div class="stat-label">Follow-up ⚡</div>
        <div class="stat-value" id="s-followup">–</div>
      </div>
      <div class="stat-card" style="--status-color:rgba(255,255,255,.3)" onclick="setFilter('evaluated',this)" data-filter="evaluated">
        <div class="stat-bar"></div>
        <div class="stat-label">Evaluated</div>
        <div class="stat-value" id="s-evaluated">–</div>
      </div>
      <div class="stat-card" style="--status-color:var(--red)" onclick="setFilter('rejected',this)" data-filter="rejected">
        <div class="stat-bar"></div>
        <div class="stat-label">Rejected</div>
        <div class="stat-value" id="s-rejected">–</div>
      </div>
      <div class="stat-card" style="--status-color:var(--accent)" onclick="setFilter('pipeline',this)" data-filter="pipeline">
        <div class="stat-bar"></div>
        <div class="stat-label">In Pipeline</div>
        <div class="stat-value" id="s-pending">–</div>
      </div>
    </div>

    <!-- Controls -->
    <div class="controls" id="controls">
      <div class="search-wrap">
        <span class="search-icon">⌕</span>
        <input class="search-input" id="search-input" type="search" placeholder="Search company, role, notes…" oninput="applyFilter()">
      </div>
      <div class="filter-pills">
        <button class="filter-pill active" onclick="setFilter('all',this)" data-filter="all">All</button>
        <button class="filter-pill money" onclick="setFilter('high-paying',this)" data-filter="high-paying" title="$200K+ base, $300K+ TC/OTE, or premium-tier company (Anthropic, OpenAI, NVIDIA, etc.)">💰 High-Paying</button>
        <button class="filter-pill" onclick="setFilter('followup',this)" data-filter="followup">⚡ Follow-up</button>
        <button class="filter-pill" onclick="setFilter('applied',this)" data-filter="applied">Applied</button>
        <button class="filter-pill" onclick="setFilter('interview',this)" data-filter="interview">Interview</button>
        <button class="filter-pill" onclick="setFilter('offer',this)" data-filter="offer">Offer</button>
        <button class="filter-pill" onclick="setFilter('evaluated',this)" data-filter="evaluated">Evaluated</button>
        <button class="filter-pill" onclick="setFilter('rejected',this)" data-filter="rejected">Rejected</button>
      </div>
    </div>

    <!-- Applications table -->
    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th onclick="sortBy('num')">#<span class="sort-arrow" id="sort-num"></span></th>
            <th onclick="sortBy('company')">Company<span class="sort-arrow" id="sort-company"></span></th>
            <th>Role</th>
            <th onclick="sortBy('status')">Status<span class="sort-arrow" id="sort-status"></span></th>
            <th onclick="sortBy('score')">Score<span class="sort-arrow" id="sort-score"></span></th>
            <th onclick="sortBy('comp')" title="Sort by compensation (highest first)">Comp<span class="sort-arrow" id="sort-comp"></span></th>
            <th onclick="sortBy('date')">Date<span class="sort-arrow" id="sort-date">↓</span></th>
            <th>Age</th>
            <th>Notes</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="apps-tbody">
          <tr class="loading-row"><td colspan="10"><span class="spinner"></span></td></tr>
        </tbody>
      </table>
    </div>
  </main>

  <!-- Sidebar -->
  <aside class="sidebar">
    <!-- Gmail section -->
    <div class="sidebar-section" id="gmail-section">
      <div class="sidebar-title">
        Gmail Inbox Signals
        <button class="sidebar-refresh" onclick="refreshGmail()">Scan now</button>
      </div>
      <div id="gmail-content">
        <div class="gmail-connect-card">
          <p>Connect Gmail to auto-detect interviews, rejections, and responses from companies in your pipeline.</p>
          <a id="gmail-connect-btn" href="/auth/gmail" class="btn btn-gmail">🔗 Connect Gmail</a>
          ${gmailSetupRequired ? `<div class="gmail-setup-notice">
            Add <code>GMAIL_CLIENT_ID</code> and <code>GMAIL_CLIENT_SECRET</code> to your <code>.env</code> file first.
            <a href="#" style="color:var(--accent);font-size:11px" onclick="showGmailSetup()">Setup guide</a>
          </div>` : ''}
        </div>
      </div>
    </div>

    <!-- Verification Codes section -->
    <div class="sidebar-section" id="verification-section" style="display:none">
      <div class="sidebar-title">
        Verification Codes
        <span id="vcode-count" style="font-size:11px;color:var(--purple);font-weight:600"></span>
      </div>
      <div id="verification-list"></div>
    </div>

    <!-- Manual Apply Queue section -->
    <div class="sidebar-section" id="manual-queue-section">
      <div class="sidebar-title">
        <span>⚠️ Manual Apply Queue</span>
        <span id="mq-count" style="font-size:11px;color:var(--orange);font-weight:600"></span>
      </div>
      <div id="manual-queue-list"></div>
    </div>

    <!-- Follow-up section -->
    <div class="sidebar-section">
      <div class="sidebar-title">Needs Follow-up</div>
      <div id="followup-list"><span class="spinner"></span></div>
    </div>

    <!-- Pipeline section -->
    <div class="sidebar-section">
      <div class="sidebar-title">
        Pipeline Inbox
        <span id="sidebar-pipeline-count" style="font-size:11px;color:var(--text-ter);font-weight:400"></span>
      </div>
      <div id="pipeline-list"><span class="spinner"></span></div>
    </div>
  </aside>
</div>

<!-- Gmail setup modal -->
<div class="modal-overlay gsm-overlay" id="gmail-setup-modal" onclick="if(event.target===this)closeGmailSetup()">
  <div class="modal-content gsm-content" role="dialog" aria-modal="true" aria-labelledby="gsm-title">
    <button class="modal-close" onclick="closeGmailSetup()" aria-label="Close">✕</button>
    <div class="gsm-body" id="gsm-body"></div>
    <div class="gsm-footer">
      <a class="gsm-link" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console ↗</a>
      <a class="gsm-link" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">Manage permissions ↗</a>
    </div>
  </div>
</div>

<!-- Apply modal -->
<div class="modal-overlay" id="apply-modal" onclick="closeApplyModal(event)">
  <div class="modal-content">
    <div class="modal-header">
      <div class="modal-title">⚡ Apply to Evaluated Roles</div>
      <button class="modal-close" onclick="closeApplyModal()">✕</button>
    </div>
    <div class="modal-threshold">
      <span class="threshold-label">Minimum score:</span>
      <input class="threshold-slider" type="range" id="apply-threshold" min="3.0" max="5.0" step="0.1" value="4.0" oninput="updateApplyList()">
      <span class="threshold-val" id="apply-threshold-val">4.0</span>
    </div>
    <div class="modal-select-bar">
      <span class="modal-select-count" id="apply-select-count">0 roles selected</span>
      <button class="btn btn-ghost" style="font-size:12px;padding:4px 10px" onclick="applySelectAll(true)">Select all</button>
      <button class="btn btn-ghost" style="font-size:12px;padding:4px 10px" onclick="applySelectAll(false)">None</button>
    </div>
    <div class="modal-body" id="apply-list"></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeApplyModal()">Cancel</button>
      <button class="btn btn-auto-apply" id="auto-apply-btn" onclick="autoApplySelected()" title="Fill forms automatically with Playwright">🤖 Auto Apply</button>
      <button class="btn btn-apply-batch" id="apply-confirm-btn" onclick="applySelected()">Open &amp; Mark Applied</button>
    </div>
  </div>
</div>

<!-- Auto-apply progress overlay -->
<div class="auto-apply-overlay" id="auto-apply-overlay">
  <div class="auto-apply-panel">
    <div class="aa-title">🤖 Auto-Applying</div>
    <div class="aa-current" id="aa-current">
      <div class="aa-current-company" id="aa-company">Starting...</div>
      <div class="aa-current-step" id="aa-step">Initializing browser</div>
    </div>
    <div class="aa-progress">
      <div class="aa-progress-bar" id="aa-progress" style="width:0%"></div>
    </div>
    <div class="aa-log" id="aa-log"></div>
    <div class="aa-actions">
      <button class="btn btn-ghost" id="aa-stop-btn" onclick="stopAutoApply()">Stop</button>
      <button class="btn btn-ghost" id="aa-close-btn" onclick="closeAutoApply()" style="display:none">Close</button>
    </div>
  </div>
</div>

<!-- Status dropdown (shared, moved by JS) -->
<div class="status-dropdown" id="status-dropdown">
  <div class="status-option" style="--dot-color:rgba(255,255,255,.3)" onclick="applyStatus('Evaluated')">Evaluated</div>
  <div class="status-option" style="--dot-color:var(--blue)"   onclick="applyStatus('Applied')">Applied</div>
  <div class="status-option" style="--dot-color:var(--cyan)"   onclick="applyStatus('Responded')">Responded</div>
  <div class="status-option" style="--dot-color:var(--yellow)" onclick="applyStatus('Interview')">Interview</div>
  <div class="status-option" style="--dot-color:var(--green)"  onclick="applyStatus('Offer')">Offer</div>
  <div class="status-option" style="--dot-color:var(--red)"    onclick="applyStatus('Rejected')">Rejected</div>
  <div class="status-option" style="--dot-color:var(--text-ter)" onclick="applyStatus('Discarded')">Discarded</div>
  <div class="status-option" style="--dot-color:var(--purple)" onclick="applyStatus('SKIP')">SKIP</div>
</div>

<div class="toast" id="toast"></div>

<!-- Onboarding / Resume Drop modal -->
<div class="onboard-modal" id="onboard-modal" role="dialog" aria-modal="true" aria-labelledby="wiz-title" aria-describedby="wiz-subtitle">
  <div class="onboard-box">
    <div class="onboard-header">
      <div>
        <div class="onboard-title" id="wiz-title">Drop Your Resume</div>
        <div class="onboard-sub" id="wiz-subtitle">Step 1 of 6 · We'll read it and ask a few questions.</div>
      </div>
      <button class="onboard-close" onclick="closeOnboard()" aria-label="Close onboarding wizard">✕</button>
    </div>

    <div class="wiz-steps" id="wiz-steps" aria-label="Wizard progress"></div>

    <!-- Banner slot: existing profile / PDF instructions / empty-state messages -->
    <div id="wiz-banner-slot" aria-live="polite"></div>

    <!-- Step 1: Resume -->
    <div class="wiz-step active" data-step="1">
      <div class="drop-zone" id="drop-zone"
           ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)">
        <input type="file" accept=".txt,.md,.pdf" onchange="handleFileSelect(event)">
        <div class="drop-icon">📄</div>
        <div class="drop-label">Drop your CV here</div>
        <div class="drop-hint">TXT or Markdown — or click to browse</div>
      </div>
      <div class="onboard-divider">or paste text</div>
      <textarea class="onboard-textarea" id="onboard-text"
        placeholder="Paste your resume / CV text here…&#10;&#10;We'll extract your name, contact info, headline, and skills, then ask 5 quick questions to dial in your search."></textarea>
    </div>

    <!-- Step 2: Confirm basics -->
    <div class="wiz-step" data-step="2">
      <span class="wiz-label">Your basics — edit if anything is off</span>
      <div class="wiz-row" style="margin-bottom:6px">
        <div>
          <input class="wiz-input" id="wiz-full-name" placeholder="Full name" required aria-describedby="err-full-name">
          <div class="wiz-field-error" id="err-full-name">Full name required (2+ characters)</div>
        </div>
        <div>
          <input class="wiz-input" id="wiz-email" placeholder="Email" type="email" required aria-describedby="err-email">
          <div class="wiz-field-error" id="err-email">Valid email required</div>
        </div>
      </div>
      <div class="wiz-row" style="margin: 4px 0 6px">
        <input class="wiz-input" id="wiz-phone" placeholder="Phone (optional)">
        <input class="wiz-input" id="wiz-location" placeholder="City, State/Country">
      </div>
      <input class="wiz-input" id="wiz-linkedin" placeholder="LinkedIn URL or handle (linkedin.com/in/…)" style="margin-bottom:8px">
      <input class="wiz-input" id="wiz-headline" placeholder="One-line headline (e.g. 'Strategic operator turning AI into shipped systems')">
    </div>

    <!-- Step 3: Target roles + comp -->
    <div class="wiz-step" data-step="3">
      <span class="wiz-label">Roles you're optimizing for <span class="wiz-count" id="wiz-roles-count" aria-live="polite"></span></span>
      <div class="wiz-hint">Tap any that fit. You can add custom titles below.</div>
      <div class="wiz-chips" id="wiz-roles-chips"></div>
      <div class="wiz-add-row">
        <input class="wiz-input" id="wiz-role-add" placeholder="Add another role title…" onkeydown="if(event.key==='Enter'){event.preventDefault();wizAddCustom('roles');}">
        <button class="wiz-add-btn" onclick="wizAddCustom('roles')">Add</button>
      </div>
      <span class="wiz-label">Comp targets</span>
      <div class="wiz-row" style="margin-bottom:10px">
        <input class="wiz-input" id="wiz-comp-target" placeholder="Target (e.g. $200K-260K)">
        <input class="wiz-input" id="wiz-comp-min" placeholder="Walk-away minimum (e.g. $170K)">
      </div>
      <div class="wiz-row">
        <select class="wiz-input" id="wiz-comp-currency">
          <option value="USD">USD</option><option value="CAD">CAD</option>
          <option value="EUR">EUR</option><option value="GBP">GBP</option>
          <option value="CHF">CHF</option><option value="AUD">AUD</option>
        </select>
        <input class="wiz-input" id="wiz-location-pref" placeholder="Location preference (e.g. Remote, Hybrid 2d, Onsite NYC)">
      </div>
    </div>

    <!-- Step 4: Deal-breakers -->
    <div class="wiz-step" data-step="4">
      <span class="wiz-label">Deal-breakers — what would make you say no? <span class="wiz-count" id="wiz-dealbreakers-count" aria-live="polite"></span></span>
      <div class="wiz-hint">Tap to flag. We'll auto-skip postings that match these.</div>
      <div class="wiz-chips" id="wiz-dealbreakers-chips"></div>
      <div class="wiz-add-row">
        <input class="wiz-input" id="wiz-dealbreaker-add" placeholder="Anything else? (e.g. 'No on-call rotation')" onkeydown="if(event.key==='Enter'){event.preventDefault();wizAddCustom('dealbreakers');}">
        <button class="wiz-add-btn" onclick="wizAddCustom('dealbreakers')">Add</button>
      </div>
    </div>

    <!-- Step 5: Narrative (superpowers, achievement, proof) -->
    <div class="wiz-step" data-step="5">
      <span class="wiz-label">Your superpowers (3 short bullets) <em style="text-transform:none;color:var(--text-ter);font-weight:400;font-style:normal;letter-spacing:0">— optional but high-leverage</em></span>
      <div class="wiz-hint">What can you do that most people in your space typically can't? Be concrete.</div>
      <input class="wiz-input" id="wiz-super-1" placeholder="Superpower 1" style="margin-bottom:6px">
      <input class="wiz-input" id="wiz-super-2" placeholder="Superpower 2" style="margin-bottom:6px">
      <input class="wiz-input" id="wiz-super-3" placeholder="Superpower 3" style="margin-bottom:14px">

      <span class="wiz-label">Best achievement (lead with this in interviews)</span>
      <div class="wiz-hint">Situation → action → measurable result. Specific numbers beat adjectives.</div>
      <textarea class="wiz-textarea" id="wiz-best"
        placeholder="e.g. Led the AI transformation across 12,000 consultants in 60 countries; built Jarvis (agentic platform on Claude API + MCP) projecting 1.35M manager-hours and $40M+ in annual savings."></textarea>

      <span class="wiz-label">Proof points (optional but high-leverage)</span>
      <div class="wiz-hint">Public-facing things you can point to: case study, repo, talk, article, dashboard.</div>
      <div id="wiz-proof-list"></div>
      <button class="wiz-add-btn" onclick="wizAddProof()" style="margin-top:8px;width:100%">+ Add proof point</button>
    </div>

    <!-- Step 6: Review & generate -->
    <div class="wiz-step" data-step="6">
      <span class="wiz-label">Ready to ship</span>
      <div class="wiz-hint">We'll save your profile, render your CV PDF, and arm the pipeline. You can edit any field later in <code>config/profile.yml</code>.</div>
      <div class="wiz-summary" id="wiz-summary"></div>
    </div>

    <div class="onboard-actions">
      <button class="btn btn-ghost" id="wiz-back" onclick="wizBack()" style="display:none">← Back</button>
      <button class="btn btn-ghost" onclick="closeOnboard()" id="wiz-cancel">Cancel</button>
      <button class="btn btn-ghost" id="wiz-skip" onclick="wizSkip()" style="display:none" title="Skip this optional step (you can edit later in config/profile.yml)">Skip →</button>
      <button class="btn btn-apply-batch" id="onboard-btn" onclick="wizNext()">
        <span class="spinner onboard-spinner" id="onboard-spinner"></span>
        <span id="onboard-btn-label">✦ Scan &amp; Continue</span>
      </button>
    </div>
  </div>
</div>

<script>
  /* ── State ── */
  let allApps = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let sortField = 'date';
  let sortAsc = false;
  let activeDropdownNum = null;
  let refreshTimer = null;

  /* ── Helpers ── */
  function esc(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function statusClass(s) {
    const map = { evaluated:'s-evaluated', applied:'s-applied', responded:'s-responded',
                  interview:'s-interview', offer:'s-offer', rejected:'s-rejected',
                  discarded:'s-discarded', skip:'s-skip' };
    return map[(s||'').toLowerCase()] || 's-evaluated';
  }

  function scorePill(score) {
    if (!score) return '<span style="color:var(--text-ter)">—</span>';
    const n = parseFloat(score);
    const cls = isNaN(n) ? '' : n >= 4.0 ? ' score-high' : n >= 3.0 ? ' score-mid' : ' score-low';
    return '<span class="score' + cls + '">' + esc(score) + '</span>';
  }

  function ageLabel(days, needsFu) {
    if (days === null || days === undefined) return '—';
    const label = days === 0 ? 'today' : days + 'd';
    const cls = needsFu ? 'age-badge stale' : 'age-badge';
    return '<span class="' + cls + '">' + label + '</span>';
  }

  function avatarLetter(company) {
    return (company||'?').charAt(0).toUpperCase();
  }

  /* ── Comp cell rendering ── */
  function compCell(a) {
    if (!a.comp && !a.compPremium) {
      return '<td class="td-comp"><span style="color:var(--text-ter)">—</span></td>';
    }
    let cls = 'td-comp';
    let dotCls = 'unknown';
    if (a.compPremium) { cls += ' premium'; dotCls = 'premium'; }
    else if (a.highPaying) { cls += ' high'; dotCls = 'high'; }
    const dot = '<span class="comp-tier ' + dotCls + '"></span>';
    const label = a.comp || (a.compPremium ? 'premium' : '—');
    const tip = a.compPremium ? 'Premium-tier company (auto-included in High-Paying filter)' : (a.highPaying ? 'Meets high-paying threshold' : '');
    return '<td class="' + cls + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + dot + esc(label) + '</td>';
  }

  /* ── Render applications table ── */
  function renderApps(apps) {
    const tbody = document.getElementById('apps-tbody');
    if (!apps.length) {
      // Empty-state copy adapts to setup status: pre-CV vs profile-but-no-apps.
      // window.cvExists is set by checkSetupStatus() on boot.
      const filterApplied = (typeof currentFilter !== 'undefined' && currentFilter && currentFilter !== 'all');
      let icon, title, sub;
      if (filterApplied) {
        icon = '🔍'; title = 'No applications match this filter';
        sub = 'Try clearing the filter or switching to "All".';
      } else if (window.cvExists === false) {
        icon = '📄'; title = 'Drop your resume to begin';
        sub = 'Tap ⊕ Profile (or ⌘ ,) to import your CV. Takes ~2 min.';
      } else {
        icon = '🚀'; title = 'Profile is set — ready to hunt';
        sub = 'Add a job URL to <code>data/pipeline.md</code> or run <code>/career-ops scan</code> to find offers.';
      }
      tbody.innerHTML = '<tr><td colspan="10"><div class="empty"><div class="empty-icon">' + icon + '</div>' +
        '<div class="empty-title">' + title + '</div>' +
        '<div class="empty-sub">' + sub + '</div></div></td></tr>';
      return;
    }
    tbody.innerHTML = apps.map(a => {
      const fuTag = a.needsFollowUp ? '<span class="followup-tag">⚡ ' + a.age + 'd</span>' : '';
      const cls = a.needsFollowUp ? ' class="followup-row"' : '';
      const reportBtn = a.reportLink
        ? '<a class="report-btn" href="/reports/' + esc(a.reportLink) + '" target="_blank" onclick="event.stopPropagation()">📄</a> '
        : '';
      const openBtn = '<button class="btn-row-open" onclick="event.stopPropagation();openJobUrl(\\'' + esc(a.num) + '\\',this)" title="Open job posting in new tab">↗ Open</button>';
      const applyBtn = a.status === 'evaluated'
        ? '<button class="btn-row-apply" onclick="event.stopPropagation();applyOne(\\'' + esc(a.num) + '\\')" title="Open job URL and mark Applied">Apply →</button>'
        : '';
      return '<tr' + cls + ' onclick="rowClick(event,\\'' + esc(a.num) + '\\')">' +
        '<td class="td-num">' + esc(a.num) + '</td>' +
        '<td><div class="td-company"><div class="company-avatar">' + avatarLetter(a.company) + '</div>' + reportBtn + esc(a.company) + '</div></td>' +
        '<td class="td-role">' + esc(a.role) + '</td>' +
        '<td><span class="status-badge ' + statusClass(a.status) + '" onclick="event.stopPropagation();openDropdown(\\'' + esc(a.num) + '\\',this)" data-num="' + esc(a.num) + '">' + esc(a.status||'—') + '</span>' + fuTag + '</td>' +
        '<td>' + scorePill(a.score) + '</td>' +
        compCell(a) +
        '<td class="td-date">' + esc(a.date||'—') + '</td>' +
        '<td>' + ageLabel(a.age, a.needsFollowUp) + '</td>' +
        '<td class="td-notes">' + esc(a.notes) + '</td>' +
        '<td class="td-actions">' + openBtn + applyBtn + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ── Open job URL in new tab (fetches URL from report) ── */
  async function openJobUrl(num, btn) {
    if (btn) btn.classList.add('disabled');
    try {
      const res = await fetch('/api/job-url?num=' + encodeURIComponent(num));
      const data = await res.json();
      if (data.ok && data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        showToast('No URL found in report for #' + num, 'error');
      }
    } catch (err) {
      showToast('Error opening URL: ' + err.message, 'error');
    } finally {
      if (btn) setTimeout(() => btn.classList.remove('disabled'), 800);
    }
  }

  /* ── Sorting ── */
  function sortBy(field) {
    if (sortField === field) sortAsc = !sortAsc;
    // Comp, score, date all default to descending (highest/most-recent first)
    else { sortField = field; sortAsc = !(field === 'date' || field === 'score' || field === 'comp'); }
    ['num','company','status','score','comp','date'].forEach(f => {
      const el = document.getElementById('sort-' + f);
      if (el) el.textContent = '';
    });
    const el = document.getElementById('sort-' + field);
    if (el) el.textContent = sortAsc ? '↑' : '↓';
    applyFilter();
  }

  function getSortVal(app, field) {
    if (field === 'score') return parseFloat(app.score) || 0;
    if (field === 'num')   return parseInt(app.num) || 0;
    if (field === 'date')  return app.date || '';
    if (field === 'comp')  return app.compSort || 0;
    return (app[field] || '').toLowerCase();
  }

  /* ── Filter + search ── */
  function setFilter(f, el) {
    currentFilter = f;
    // Update stat cards
    document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('[data-filter="' + f + '"]').forEach(c => c.classList.add('active'));
    // Update pills
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.filter-pill[data-filter="' + f + '"]').forEach(p => p.classList.add('active'));
    applyFilter();
  }

  function applyFilter() {
    searchQuery = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    let filtered = allApps;
    if (currentFilter === 'followup')      filtered = filtered.filter(a => a.needsFollowUp);
    else if (currentFilter === 'high-paying') filtered = filtered.filter(a => a.highPaying);
    else if (currentFilter === 'pipeline') filtered = filtered; // shown in sidebar
    else if (currentFilter !== 'all')      filtered = filtered.filter(a => a.status === currentFilter);
    if (searchQuery) {
      filtered = filtered.filter(a =>
        (a.company||'').toLowerCase().includes(searchQuery) ||
        (a.role||'').toLowerCase().includes(searchQuery) ||
        (a.notes||'').toLowerCase().includes(searchQuery) ||
        (a.num||'').includes(searchQuery)
      );
    }
    // Sort
    filtered = [...filtered].sort((a, b) => {
      const av = getSortVal(a, sortField), bv = getSortVal(b, sortField);
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    document.getElementById('apps-count') && (document.getElementById('apps-count').textContent = filtered.length + ' of ' + allApps.length);
    renderApps(filtered);
  }

  /* ── Render sidebar sections ── */
  function renderFollowUps(apps) {
    const list = document.getElementById('followup-list');
    const fu = apps.filter(a => a.needsFollowUp);
    if (!fu.length) {
      list.innerHTML = '<div style="font-size:12px;color:var(--text-ter);padding:8px 0">No follow-ups needed</div>';
      return;
    }
    list.innerHTML = fu.slice(0, 10).map(a =>
      '<div class="followup-item">' +
        '<div class="followup-info">' +
          '<div class="followup-company">' + esc(a.company) + '</div>' +
          '<div class="followup-age">' + a.age + 'd — follow up now</div>' +
        '</div>' +
        '<span class="status-badge ' + statusClass(a.status) + '" style="cursor:pointer" onclick="openDropdown(\\'' + esc(a.num) + '\\',this)" data-num="' + esc(a.num) + '">' + esc(a.status||'—') + '</span>' +
      '</div>'
    ).join('');
  }

  function renderPipeline(pipeline) {
    const list = document.getElementById('pipeline-list');
    const pending = (pipeline.pending||[]).filter(p => !p.done);
    const processed = (pipeline.processed||[]).slice(0, 5);
    document.getElementById('sidebar-pipeline-count').textContent = pending.length + ' pending';

    if (!pending.length && !processed.length) {
      list.innerHTML = '<div style="font-size:12px;color:var(--text-ter);padding:8px 0">Queue empty — add URLs to data/pipeline.md</div>';
      return;
    }
    list.innerHTML = [
      ...pending.map(p => '<div class="pipeline-item"><div class="pipeline-dot dot-pending"></div><div class="pipeline-url" title="' + esc(p.url) + '">' + esc(p.url) + '</div></div>'),
      ...processed.map(p => '<div class="pipeline-item"><div class="pipeline-dot dot-done"></div><div class="pipeline-url" title="' + esc(p.url) + '" style="opacity:.4">' + esc(p.url) + '</div></div>'),
    ].join('');
  }

  /* ── Stats ── */
  function renderStats(stats) {
    // Zero-state: replace the 9-card wall-of-zeros with a friendlier hero.
    // We only swap when BOTH lifetime stats and pipeline are empty —
    // otherwise the user has signal worth showing.
    const isEmpty = (stats.total | 0) === 0 && (stats.pending | 0) === 0;
    const grid = document.getElementById('stats-grid');
    const zero = document.getElementById('stats-zero');
    if (zero && grid) {
      if (isEmpty) {
        grid.style.display = 'none';
        zero.hidden = false;
      } else {
        grid.style.display = '';
        zero.hidden = true;
      }
    }

    document.getElementById('s-total').textContent     = stats.total;
    document.getElementById('s-applied').textContent   = stats.applied;
    document.getElementById('s-responded').textContent = stats.responded;
    document.getElementById('s-interview').textContent = stats.interview;
    document.getElementById('s-offer').textContent     = stats.offer;
    document.getElementById('s-followup').textContent  = stats.followUp;
    document.getElementById('s-evaluated').textContent = stats.evaluated;
    document.getElementById('s-rejected').textContent  = stats.rejected;
    document.getElementById('s-pending').textContent   = stats.pending;

    // Today's Activity panel
    if (stats.today) {
      const t = stats.today;
      document.getElementById('today-applied').textContent    = t.applied;
      document.getElementById('today-pending').textContent    = stats.pending;
      document.getElementById('today-interviews').textContent = stats.interview;
      document.getElementById('today-high-paying').textContent = stats.highPaying || 0;
      document.getElementById('today-applied-sub').textContent = t.applied === 1 ? 'submission' : 'submissions';
      // Date in local format (e.g., "Mon May 4")
      const d = new Date(t.date + 'T00:00:00');
      const dateStr = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      document.getElementById('today-date').textContent = dateStr;
    }
  }

  function updateApplyBanner(apps) {
    const ready = apps.filter(a => a.status === 'evaluated' && parseFloat(a.score) >= 4.0);
    const banner = document.getElementById('apply-banner');
    if (ready.length > 0) {
      banner.classList.add('show');
      document.getElementById('apply-banner-title').textContent = ready.length + ' role' + (ready.length > 1 ? 's' : '') + ' ready to apply';
      const top3 = ready.sort((a,b) => parseFloat(b.score) - parseFloat(a.score)).slice(0,3).map(a => a.company).join(', ');
      document.getElementById('apply-banner-sub').textContent = 'Top: ' + top3 + ' — scored 4.0+ and waiting';
    } else {
      banner.classList.remove('show');
    }
  }

  /* ── Status dropdown ── */
  function openDropdown(num, triggerEl) {
    activeDropdownNum = num;
    const dd = document.getElementById('status-dropdown');
    dd.classList.toggle('open');
    if (dd.classList.contains('open')) {
      const rect = triggerEl.getBoundingClientRect();
      dd.style.position = 'fixed';
      dd.style.top = (rect.bottom + 4) + 'px';
      dd.style.left = rect.left + 'px';
    }
  }

  async function applyStatus(newStatus) {
    const num = activeDropdownNum;
    document.getElementById('status-dropdown').classList.remove('open');
    if (!num) return;
    try {
      const res = await fetch('/api/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ num, status: newStatus }),
      });
      const data = await res.json();
      if (data.ok) { showToast('Updated #' + num + ' → ' + newStatus, 'success'); refresh(); }
      else showToast(data.error || 'Update failed', 'error');
    } catch { showToast('Network error', 'error'); }
  }

  document.addEventListener('click', e => {
    const dd = document.getElementById('status-dropdown');
    if (dd.classList.contains('open') && !dd.contains(e.target) && !e.target.closest('.status-badge')) {
      dd.classList.remove('open');
    }
  });

  function rowClick(event, num) {
    // Row click: scroll to or highlight (future expansion)
  }

  /* ── Gmail ── */
  // Holds the latest /api/gmail/status snapshot so multiple UI bits
  // (header pill, sidebar card, modal) read from one source of truth.
  let gmailStatus = null;

  async function refreshGmail() {
    try {
      const [inboxRes, statusRes] = await Promise.all([
        fetch('/api/gmail/inbox'),
        fetch('/api/gmail/status'),
      ]);
      gmailStatus = statusRes.ok ? await statusRes.json() : null;
      if (inboxRes.status === 401) { renderGmailConnect(); return; }
      const data = await inboxRes.json();
      renderGmailSignals(data.signals || [], data.scanned_at, data.connected);
    } catch {}
  }

  function renderGmailConnect() {
    const c = document.getElementById('gmail-content');
    const btn = document.getElementById('gmail-header-status');
    const s = gmailStatus;
    // Header pill summarizes status at a glance.
    if (btn) {
      if (!s) {
        btn.innerHTML = '<a href="/auth/gmail" class="btn btn-gmail">🔗 Connect Gmail</a>';
      } else if (!s.configured) {
        btn.innerHTML = '<button class="btn btn-gmail" onclick="showGmailSetup()" title="Gmail credentials missing in .env">⚙ Gmail setup</button>';
      } else {
        btn.innerHTML = '<a href="/auth/gmail" class="btn btn-gmail">🔗 Connect Gmail</a>';
      }
    }
    // Inline sidebar card mirrors the header but with more guidance.
    if (c && s) {
      if (!s.configured) {
        c.innerHTML =
          '<div class="gmail-connect-card">' +
            '<p style="font-size:13px;color:var(--text-sec);margin-bottom:10px">Gmail credentials are <strong style="color:var(--orange)">not configured</strong> in your <code>.env</code>.</p>' +
            '<p style="font-size:11px;color:var(--text-ter);margin-bottom:14px">Missing: ' + s.missingEnv.map(m => '<code>' + esc(m) + '</code>').join(', ') + '</p>' +
            '<a class="btn btn-gmail" href="/auth/gmail" style="display:block;text-align:center">Open setup guide →</a>' +
            '<button onclick="showGmailSetup()" style="background:none;border:none;color:var(--accent);font-size:11px;cursor:pointer;margin-top:8px;padding:0;width:100%">View status &amp; diagnostic</button>' +
          '</div>';
      } else {
        c.innerHTML =
          '<div class="gmail-connect-card">' +
            '<p style="font-size:13px;color:var(--text-sec);margin-bottom:10px">Watch for recruiter replies, interview invites, and verification codes.</p>' +
            '<a id="gmail-connect-btn" href="/auth/gmail" class="btn btn-gmail" style="display:block;text-align:center">🔗 Connect Gmail</a>' +
            '<p style="font-size:11px;color:var(--text-ter);margin-top:10px">Scope: <code>gmail.readonly</code> · We never send or delete.</p>' +
          '</div>';
      }
    }
  }

  // In-app modal that surfaces the live /api/gmail/status diagnostic +
  // step-by-step setup. Replaces the prior JS alert() which was unreadable.
  async function showGmailSetup() {
    let s = gmailStatus;
    if (!s) {
      try { s = await (await fetch('/api/gmail/status')).json(); } catch { s = null; }
    }
    const overlay = document.getElementById('gmail-setup-modal');
    if (!overlay) return;
    const body = overlay.querySelector('.gsm-body');
    const dot = (ok) => '<span class="gsm-dot ' + (ok ? 'ok' : 'bad') + '"></span>';
    const steps = !s ? '<div class="gsm-loading">Loading diagnostic…</div>' : (
      '<ul class="gsm-checklist">' +
        '<li>' + dot(s.hasClientId) + 'GMAIL_CLIENT_ID</li>' +
        '<li>' + dot(s.hasClientSecret) + 'GMAIL_CLIENT_SECRET</li>' +
        '<li>' + dot(s.hasTokens) + 'OAuth tokens saved' + (s.tokenExpired ? ' <em>(expired — will auto-refresh)</em>' : '') + '</li>' +
        '<li>' + dot(s.polling) + 'Inbox polling active' + (s.fastPolling ? ' <em>(fast mode)</em>' : '') + '</li>' +
      '</ul>' +
      '<div class="gsm-meta">' +
        '<div><span class="gsm-meta-label">Redirect URI</span><div class="gsm-copy"><code id="gsm-redirect">' + esc(s.redirectUri) + '</code><button class="gsm-copy-btn" data-target="gsm-redirect">Copy</button></div></div>' +
        '<div style="margin-top:10px"><span class="gsm-meta-label">Scope</span><div><code>' + esc(s.scope) + '</code></div></div>' +
        (s.lastScannedAt ? '<div style="margin-top:10px"><span class="gsm-meta-label">Last scan</span><div>' + new Date(s.lastScannedAt).toLocaleString() + '</div></div>' : '') +
        (s.cachedSignalCount ? '<div style="margin-top:10px"><span class="gsm-meta-label">Cached signals</span><div>' + s.cachedSignalCount + ' total · ' + s.activeSignalCount + ' unread</div></div>' : '') +
      '</div>' +
      '<div class="gsm-actions">' +
        (!s.configured
          ? '<a class="btn btn-apply-batch" href="/auth/gmail">Open setup guide →</a>'
          : (s.hasTokens
            ? '<a class="btn btn-ghost" href="/auth/gmail">Re-authorize</a><button class="btn btn-ghost" style="color:var(--red);border-color:rgba(255,69,58,.3)" onclick="disconnectGmail()">Disconnect</button>'
            : '<a class="btn btn-apply-batch" href="/auth/gmail">Connect Gmail →</a>')) +
      '</div>'
    );
    body.innerHTML =
      '<h2>Gmail connection</h2>' +
      '<p class="gsm-sub">Diagnostic + setup guide. Status refreshes every time you open this dialog.</p>' +
      steps;
    overlay.classList.add('open');
    // Wire copy buttons (delegated each open)
    overlay.querySelectorAll('.gsm-copy-btn').forEach(btn => {
      btn.onclick = async () => {
        const target = document.getElementById(btn.dataset.target);
        try {
          await navigator.clipboard.writeText(target.textContent.trim());
          const orig = btn.textContent;
          btn.textContent = '✓ Copied';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        } catch { btn.textContent = 'Press ⌘C'; }
      };
    });
  }

  function closeGmailSetup() {
    const overlay = document.getElementById('gmail-setup-modal');
    if (overlay) overlay.classList.remove('open');
  }

  async function disconnectGmail() {
    if (!confirm('Disconnect Gmail? Your tokens will be wiped from this server. You can reconnect anytime.')) return;
    try {
      const res = await fetch('/api/gmail/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast('Gmail disconnected · revoke fully at myaccount.google.com/permissions', 'info', 5000);
        closeGmailSetup();
        await refreshGmail();
      } else {
        showToast('Disconnect failed', 'error');
      }
    } catch { showToast('Disconnect failed (network)', 'error'); }
  }

  function renderGmailSignals(signals, scannedAt, connected) {
    const c = document.getElementById('gmail-content');
    const btn = document.getElementById('gmail-header-status');

    if (!connected) { renderGmailConnect(); return; }

    if (btn) btn.innerHTML = '<span class="gmail-dot"></span><span style="font-size:12px;color:var(--text-sec);margin-left:6px">Gmail</span>';

    const active = signals.filter(s => !s.dismissed);
    if (!active.length) {
      c.innerHTML = '<div style="font-size:12px;color:var(--text-ter);text-align:center;padding:12px 0">' +
        (scannedAt ? 'No new signals since ' + new Date(scannedAt).toLocaleTimeString() : 'No signals detected yet.') +
        '</div>';
      return;
    }

    c.innerHTML = active.slice(0, 8).map(s => {
      const typeClass = 'signal-' + s.signal;
      const typeLabel = s.signal.charAt(0).toUpperCase() + s.signal.slice(1);
      const codeDisplay = (s.signal === 'verification' && s.codes && s.codes.length)
        ? s.codes.map(c => c.type === 'numeric'
            ? '<div class="vcode-value" style="margin:6px 0;font-size:22px">' + esc(c.value) + '</div>'
            : '<a class="vcode-link" href="' + esc(c.value) + '" target="_blank">Confirm link →</a>'
          ).join('')
        : '';
      return '<div class="signal-card" data-id="' + esc(s.id) + '">' +
        '<div class="signal-header">' +
          '<div class="signal-company">' + esc(s.company) + '</div>' +
          '<span class="signal-type ' + typeClass + '">' + typeLabel + '</span>' +
        '</div>' +
        '<div class="signal-subject">' + esc(s.subject) + '</div>' +
        codeDisplay +
        (codeDisplay ? '' : '<div class="signal-snippet">' + esc(s.snippet.substring(0,120)) + '…</div>') +
        '<div class="signal-actions">' +
          (s.suggestedStatus ? '<button class="signal-btn signal-btn-confirm" onclick="confirmSignal(\\'' + esc(s.id) + '\\',\\'' + esc(s.num) + '\\',\\'' + esc(s.suggestedStatus) + '\\')">Mark as ' + esc(s.suggestedStatus) + '</button>' : '') +
          (s.signal === 'verification' && s.codes?.length && s.codes[0].type === 'numeric' ? '<button class="signal-btn signal-btn-confirm" style="background:var(--purple)" onclick="copyCode(\\'' + esc(s.codes[0].value) + '\\',this)">Copy code</button>' : '') +
          '<button class="signal-btn signal-btn-dismiss" onclick="dismissSignal(\\'' + esc(s.id) + '\\')">Dismiss</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  async function confirmSignal(id, num, newStatus) {
    const res = await fetch('/api/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ num, status: newStatus }),
    });
    const data = await res.json();
    if (data.ok) {
      await fetch('/api/gmail/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      showToast('Updated #' + num + ' → ' + newStatus, 'success');
      refresh();
      refreshGmail();
    } else showToast(data.error || 'Update failed', 'error');
  }

  async function dismissSignal(id) {
    await fetch('/api/gmail/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    refreshGmail();
  }

  // showGmailSetup is defined above (in the Gmail block) — it now opens a
  // proper modal with live diagnostic. This stub remains only to keep older
  // event-handler references alive during partial refreshes.

  /* ── Verification Codes ── */
  async function renderVerificationCodes() {
    try {
      const res = await fetch('/api/gmail/codes');
      const { codes } = await res.json();
      const section = document.getElementById('verification-section');
      const list = document.getElementById('verification-list');
      const countEl = document.getElementById('vcode-count');
      if (!codes || !codes.length) { section.style.display = 'none'; return; }
      section.style.display = '';
      countEl.textContent = codes.length;
      const now = Date.now();
      list.innerHTML = codes.map(c => {
        const mins = Math.max(0, Math.ceil((c.expiresAt - now) / 60000));
        if (c.type === 'link') {
          return '<div class="vcode-card">' +
            '<div class="vcode-company">' + esc(c.company) + '</div>' +
            '<a class="vcode-link" href="' + esc(c.value) + '" target="_blank" rel="noopener">Confirm link →</a>' +
            '<div class="vcode-meta">' + esc(c.subject) + '</div>' +
            '<span class="vcode-expire">' + mins + 'm left</span>' +
          '</div>';
        }
        return '<div class="vcode-card">' +
          '<button class="vcode-copy" onclick="copyCode(\\'' + esc(c.value) + '\\',this)">Copy</button>' +
          '<div class="vcode-company">' + esc(c.company) + '</div>' +
          '<div class="vcode-value">' + esc(c.value) + '</div>' +
          '<div class="vcode-meta">' + esc(c.subject) + '</div>' +
          '<span class="vcode-expire">' + mins + 'm left</span>' +
        '</div>';
      }).join('');
    } catch {}
  }

  function copyCode(value, btn) {
    navigator.clipboard.writeText(value).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      showToast('Code ' + value + ' copied', 'success');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    });
  }

  /* ── Auto-Apply ── */
  let aaPolling = null;

  async function autoApplySelected() {
    const checked = [...document.querySelectorAll('.apply-checkbox:checked')];
    if (!checked.length) return;

    const nums = checked.map(cb => cb.dataset.num);
    document.getElementById('apply-modal').classList.remove('open');
    document.getElementById('auto-apply-overlay').classList.add('active');
    document.getElementById('aa-log').innerHTML = '';
    document.getElementById('aa-company').textContent = 'Starting...';
    document.getElementById('aa-step').textContent = 'Initializing browser';
    document.getElementById('aa-progress').style.width = '0%';
    document.getElementById('aa-stop-btn').style.display = '';
    document.getElementById('aa-close-btn').style.display = 'none';

    try {
      const res = await fetch('/api/auto-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nums, mode: 'auto' }),
      });
      const data = await res.json();
      if (!data.ok) { showToast(data.error || 'Failed to start', 'error'); closeAutoApply(); return; }
      aaPolling = setInterval(pollAutoApplyStatus, 2000);
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      closeAutoApply();
    }
  }

  async function pollAutoApplyStatus() {
    try {
      const res = await fetch('/api/auto-apply/status');
      const s = await res.json();
      const total = s.completed.length + s.remaining + (s.current ? 1 : 0);
      const done = s.completed.length;
      document.getElementById('aa-progress').style.width = (total > 0 ? (done / total * 100) : 0) + '%';

      if (s.current) {
        document.getElementById('aa-company').textContent = s.current.company || 'Processing...';
        document.getElementById('aa-step').textContent = s.current.step || 'Working...';
      }

      const log = document.getElementById('aa-log');
      log.innerHTML = s.completed.map(c => {
        const cls = c.status === 'success' ? 'aa-log-ok' : c.status === 'skipped' ? 'aa-log-skip' : 'aa-log-err';
        const icon = c.status === 'success' ? '✓' : c.status === 'skipped' ? '→' : '✗';
        return '<div class="' + cls + '">' + icon + ' #' + esc(c.num) + ' ' + esc(c.company || '') + (c.error ? ' — ' + esc(c.error) : '') + '</div>';
      }).join('');
      log.scrollTop = log.scrollHeight;

      if (!s.active) {
        clearInterval(aaPolling);
        aaPolling = null;
        document.getElementById('aa-company').textContent = 'Done';
        document.getElementById('aa-step').textContent = done + ' processed';
        document.getElementById('aa-progress').style.width = '100%';
        document.getElementById('aa-stop-btn').style.display = 'none';
        document.getElementById('aa-close-btn').style.display = '';
        refresh();
      }
    } catch {}
  }

  async function stopAutoApply() {
    try {
      await fetch('/api/auto-apply/stop', { method: 'POST' });
      document.getElementById('aa-step').textContent = 'Stopping...';
    } catch {}
  }

  function closeAutoApply() {
    document.getElementById('auto-apply-overlay').classList.remove('active');
    clearInterval(aaPolling);
    aaPolling = null;
    refresh();
  }

  /* ── Autopilot ── */
  let autopilotPolling = null;

  async function toggleAutopilot() {
    try {
      const res = await fetch('/api/autopilot/toggle', { method: 'POST' });
      const data = await res.json();
      updateAutopilotUI(data.running);
      if (data.running) {
        showToast('Autopilot started — applying to all eligible roles', 'success');
        autopilotPolling = setInterval(pollAutopilotStatus, 3000);
        pollAutopilotStatus();
      } else {
        showToast('Autopilot stopped', 'success');
        clearInterval(autopilotPolling);
        autopilotPolling = null;
        refresh();
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  function updateAutopilotUI(running) {
    const btn = document.getElementById('autopilot-btn');
    const bar = document.getElementById('autopilot-bar');
    const logPanel = document.getElementById('autopilot-log-panel');
    if (running) {
      btn.classList.add('active');
      btn.textContent = '🤖 Autopilot ON';
      bar.classList.add('show');
    } else {
      btn.classList.remove('active');
      btn.textContent = '🤖 Autopilot';
      bar.classList.remove('show');
      if (logPanel) logPanel.style.display = 'none';
    }
  }

  async function pollAutopilotStatus() {
    try {
      const res = await fetch('/api/autopilot/status');
      const s = await res.json();
      if (!s.running) {
        updateAutopilotUI(false);
        clearInterval(autopilotPolling);
        autopilotPolling = null;
        refresh();
        renderManualQueue(); // show any new manual-apply apps after cycle ends
        return;
      }
      document.getElementById('ap-applied').textContent = s.applied;
      document.getElementById('ap-failed').textContent = s.failed;
      const skippedEl = document.getElementById('ap-skipped');
      const cyclesEl = document.getElementById('ap-cycles');
      if (skippedEl) skippedEl.textContent = s.skipped;
      if (cyclesEl) cyclesEl.textContent = s.cycles;

      const sub = document.getElementById('autopilot-bar-sub');
      if (s.currentCompany) {
        sub.textContent = s.currentStep || ('Processing ' + s.currentCompany);
      } else if (s.currentStep) {
        sub.textContent = s.currentStep;
      } else {
        sub.textContent = 'Scanning for new roles...';
      }

      // Uptime
      if (s.startedAt) {
        const mins = Math.floor((Date.now() - new Date(s.startedAt).getTime()) / 60000);
        const hrs = Math.floor(mins / 60);
        const uptimeEl = document.getElementById('ap-uptime');
        if (uptimeEl) uptimeEl.textContent = hrs > 0 ? hrs + 'h ' + (mins % 60) + 'm uptime' : mins + 'm uptime';
      }

      // Render activity log
      const logPanel = document.getElementById('autopilot-log-panel');
      const logEntries = document.getElementById('ap-log-entries');
      if (s.log && s.log.length > 0) {
        logPanel.style.display = '';
        logEntries.innerHTML = s.log.slice().reverse().slice(0, 30).map(e => {
          const ts = new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const icon = e.status === 'applied' ? '\\u2713' : e.status === 'failed' ? '\\u2717' : e.status === 'crash' ? '\\u26A0' : '\\u2192';
          const statusCls = 'ap-log-' + e.status;
          const statusLabel = e.status.charAt(0).toUpperCase() + e.status.slice(1);
          return '<div class="ap-log-entry">' +
            '<span class="ap-log-ts">' + ts + '</span>' +
            '<span class="ap-log-company">' + esc(e.company || '-') + '</span>' +
            '<span class="ap-log-role">' + esc(e.role || '') + '</span>' +
            '<span class="ap-log-status ' + statusCls + '">' + statusLabel + '</span>' +
            (e.error ? '<span style="font-size:10px;color:var(--text-ter);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(e.error) + '">' + esc(e.error.substring(0, 40)) + '</span>' : '') +
            '</div>';
        }).join('');
      } else {
        logPanel.style.display = 'none';
      }
    } catch {}
  }

  // Check if autopilot was already running on page load
  async function checkAutopilotStatus() {
    try {
      const res = await fetch('/api/autopilot/status');
      const s = await res.json();
      if (s.running) {
        updateAutopilotUI(true);
        autopilotPolling = setInterval(pollAutopilotStatus, 3000);
        pollAutopilotStatus();
      }
    } catch {}
  }

  /* ── Manual Apply Queue ── */
  async function renderManualQueue() {
    try {
      const res = await fetch('/api/autopilot/manual');
      const { queue } = await res.json();
      const section = document.getElementById('manual-queue-section');
      const list = document.getElementById('manual-queue-list');
      const countEl = document.getElementById('mq-count');
      if (!queue || queue.length === 0) {
        section.style.display = 'none';
        return;
      }
      section.style.display = '';
      countEl.textContent = queue.length + ' app' + (queue.length !== 1 ? 's' : '');
      list.innerHTML = queue.map(item => {
        const applyLink = item.url
          ? '<a class="mq-link" href="' + esc(item.url) + '" target="_blank" rel="noopener">🔗 Apply</a>'
          : '';
        const reportLink = item.reportLink
          ? '<a class="mq-link" href="/' + esc(item.reportLink) + '" target="_blank" rel="noopener">📄 Report</a>'
          : '';
        const reasonLabel = item.reason === 'CAPTCHA required'
          ? '🔒 CAPTCHA'
          : item.reason === 'No fillable form found'
          ? '📋 No auto-form'
          : esc(item.reason);
        return '<div class="mq-item">' +
          '<div class="mq-header">' +
            '<span class="mq-company">' + esc(item.company) + '</span>' +
            '<span class="mq-score">' + esc(item.score) + '</span>' +
          '</div>' +
          '<div class="mq-role">' + esc(item.role) + '</div>' +
          '<div class="mq-reason">' + reasonLabel + '</div>' +
          '<div class="mq-actions">' +
            applyLink +
            reportLink +
            '<button class="mq-done-btn" onclick="markManualDone(' + esc(item.num) + ')">✓ Mark Applied</button>' +
          '</div>' +
        '</div>';
      }).join('');
    } catch {}
  }

  async function markManualDone(num) {
    try {
      await fetch('/api/autopilot/manual?num=' + encodeURIComponent(num), { method: 'DELETE' });
      // Also update status to Applied in tracker
      try {
        await fetch('/api/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ num: String(num), status: 'Applied' }),
        });
      } catch {}
      showToast('Marked #' + num + ' as Applied', 'success');
      renderManualQueue();
      refresh();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  /* ── Toast ── */
  let toastTimer;
  function showToast(msg, type = 'success', durationMs = 3000) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show toast-' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), durationMs);
  }

  /* ── Apply modal ── */
  function openApplyModal() {
    document.getElementById('apply-modal').classList.add('open');
    updateApplyList();
  }

  function closeApplyModal(event) {
    if (event && event.target !== document.getElementById('apply-modal')) return;
    document.getElementById('apply-modal').classList.remove('open');
  }

  function updateApplyList() {
    const slider = document.getElementById('apply-threshold');
    const threshold = parseFloat(slider.value);
    document.getElementById('apply-threshold-val').textContent = threshold.toFixed(1);

    const eligible = allApps.filter(a => {
      const s = parseFloat(a.score);
      return a.status === 'evaluated' && !isNaN(s) && s >= threshold;
    }).sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));

    const list = document.getElementById('apply-list');
    if (!eligible.length) {
      list.innerHTML = '<div class="modal-empty">No evaluated roles above ' + threshold.toFixed(1) + '/5.<br>Lower the threshold or run more evaluations.</div>';
      updateApplySelectCount();
      return;
    }

    list.innerHTML = eligible.map(a => {
      const reportHref = a.reportLink ? '/reports/' + esc(a.reportLink) : '';
      const reportLink = reportHref
        ? '<a class="apply-item-report" href="' + reportHref + '" target="_blank" onclick="event.stopPropagation()">📄 report</a>'
        : '';
      const scoreN = parseFloat(a.score);
      const scoreClass = scoreN >= 4.5 ? 'score-high' : scoreN >= 4.0 ? 'score-mid' : '';
      return '<label class="apply-item" onclick="event.stopPropagation()">' +
        '<input type="checkbox" class="apply-checkbox" data-num="' + esc(a.num) + '" checked onchange="updateApplySelectCount()">' +
        '<div class="apply-item-info">' +
          '<div class="apply-item-company">' +
            '<span class="company-avatar" style="display:inline-flex">' + avatarLetter(a.company) + '</span>' +
            esc(a.company) +
            reportLink +
          '</div>' +
          '<div class="apply-item-role">' + esc(a.role) + '</div>' +
        '</div>' +
        '<span class="score ' + scoreClass + '">' + esc(a.score) + '</span>' +
        '<span class="apply-item-num">#' + esc(a.num) + '</span>' +
        '</label>';
    }).join('');

    updateApplySelectCount();
  }

  function updateApplySelectCount() {
    const checked = document.querySelectorAll('.apply-checkbox:checked').length;
    const total   = document.querySelectorAll('.apply-checkbox').length;
    const countEl = document.getElementById('apply-select-count');
    if (countEl) countEl.textContent = checked + ' of ' + total + ' selected';
    const btn = document.getElementById('apply-confirm-btn');
    if (btn) btn.disabled = checked === 0;
  }

  function applySelectAll(state) {
    document.querySelectorAll('.apply-checkbox').forEach(cb => { cb.checked = state; });
    updateApplySelectCount();
  }

  async function applySelected() {
    const checked = [...document.querySelectorAll('.apply-checkbox:checked')];
    if (!checked.length) return;

    const btn = document.getElementById('apply-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Opening…';

    const nums = checked.map(cb => cb.dataset.num);
    let opened = 0, failed = 0;

    for (const num of nums) {
      try {
        // Get the JD URL from the report file
        const urlRes = await fetch('/api/report-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ num }),
        });
        const urlData = await urlRes.json();
        if (urlData.url) {
          window.open(urlData.url, '_blank', 'noopener');
        }

        // Mark as Applied
        const applyRes = await fetch('/api/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nums: [num] }),
        });
        const applyData = await applyRes.json();
        if (applyData.ok) opened++;
        else failed++;
      } catch { failed++; }
    }

    document.getElementById('apply-modal').classList.remove('open');
    if (opened > 0) {
      showToast(opened + ' role' + (opened > 1 ? 's' : '') + ' opened & marked Applied', 'success');
    }
    if (failed > 0) {
      showToast(failed + ' failed to update — check console', 'error');
    }
    refresh();
  }

  async function applyOne(num) {
    try {
      // Get URL from report
      const urlRes = await fetch('/api/report-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ num }),
      });
      const urlData = await urlRes.json();
      if (urlData.url) {
        window.open(urlData.url, '_blank', 'noopener');
      } else {
        showToast('No URL found in report — opening manually', 'error');
      }

      // Mark Applied
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nums: [num] }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('#' + num + ' → Applied', 'success');
        refresh();
      } else {
        showToast(data.error || 'Failed to mark Applied', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }

  /* ── Onboarding wizard ──────────────────────────────────────────────
     6 steps: resume → basics → roles+comp → dealbreakers → narrative → review.
     State lives on window.wizState. Each step has an enter/leave hook. */

  const WIZ_STEPS = 6;
  // Conversational subtitles — each step reads like the AI's next prompt to
  // the user. Keeps the "drop resume → exchange with AI → AI works" feel.
  const WIZ_TITLES = [
    null,
    { title: 'Hi — let\\'s start with your resume',
      sub: 'Step 1 of 6 · Drop a .txt / .md file or paste it. I\\'ll read everything I can so you don\\'t have to type it twice.' },
    { title: 'Did I get these right?',
      sub: 'Step 2 of 6 · Tap any field to fix. The pencil icons mark what I pulled from your resume.' },
    { title: 'What kind of role are you after?',
      sub: 'Step 3 of 6 · Pick everything that fits. I\\'ll filter postings against this list.' },
    { title: 'Anything that\\'s a hard no?',
      sub: 'Step 4 of 6 · Optional. I\\'ll auto-skip any posting that matches one of these.' },
    { title: 'Tell me what makes you, you',
      sub: 'Step 5 of 6 · Optional but high-leverage — these go into every tailored CV and cover letter.' },
    { title: 'Ready when you are',
      sub: 'Step 6 of 6 · I\\'ll save your profile, render your CV PDF, and arm the pipeline. Takes ~10s.' },
  ];
  // Steps where Skip → jump straight to step 6.
  const WIZ_SKIPPABLE = new Set([4, 5]);

  const ROLE_PRESETS = [
    'Chief of Staff', 'Head of AI', 'VP AI', 'Director of AI Innovation',
    'Director Professional Services', 'VP Customer Success', 'Solutions Engineering Director',
    'AI Practice Lead', 'Director Digital Transformation', 'Strategic Partnerships Lead',
    'Senior Backend Engineer', 'Staff ML Engineer', 'Senior Frontend Engineer',
    'Senior Data Engineer', 'Engineering Manager', 'Senior Product Manager',
  ];

  const DEALBREAKER_PRESETS = [
    'No relocation', 'Remote required', 'No on-call rotation',
    'No commission-only', 'No early-stage (<20 ppl)', 'No public-only companies',
    'No Java shops', 'No travel >25%', 'No nights/weekends',
  ];

  function defaultWizState() {
    return {
      step: 1,
      extracted: null,
      basics: { full_name: '', email: '', phone: '', location: '', linkedin: '', headline: '' },
      roles: { selected: new Set(), custom: [], comp_target: '', comp_min: '', comp_currency: 'USD', location_pref: '' },
      dealbreakers: { selected: new Set(), custom: [] },
      narrative: { superpowers: ['','',''], best_achievement: '', proof_points: [] },
    };
  }

  async function openOnboard() {
    window.wizState = defaultWizState();
    const modal = document.getElementById('onboard-modal');
    modal.classList.add('open');
    document.getElementById('onboard-text').value = '';
    document.getElementById('wiz-banner-slot').innerHTML = '';

    // Detect existing profile + saved draft in parallel — both inform what
    // banner(s) we show on step 1.
    let summary = null, draft = null;
    try {
      const [r] = await Promise.all([
        fetch('/api/onboard/profile-summary').catch(() => null),
      ]);
      if (r && r.ok) summary = await r.json();
    } catch { /* non-fatal */ }
    draft = wizLoadDraft();

    if (draft && draft.step > 1) {
      wizShowBanner({
        type: 'info',
        icon: '↺',
        html: 'You have an unfinished wizard run from <strong>' + esc(wizDraftAgeText(draft)) + '</strong> (step ' + draft.step + ' of ' + WIZ_STEPS + '). Resume?',
        actionLabel: 'Resume',
        onAction: () => {
          wizApplyDraft(draft);
          wizClearBanners();
          wizGoTo(window.wizState.step);
          wizFocusFirst();
        },
      });
    } else if (summary && summary.exists && (summary.full_name || (summary.target_roles && summary.target_roles.length))) {
      wizShowBanner({
        type: 'warn',
        icon: '⚠',
        html: 'Existing profile detected for <strong>' + esc(summary.full_name || '(no name)') + '</strong>'
            + (summary.target_roles && summary.target_roles.length ? ' · ' + summary.target_roles.length + ' target roles' : '')
            + '. Re-running the wizard will overwrite it (a backup is saved automatically).',
      });
    }

    wizGoTo(1);
    wizAttachFocusTrap();
    wizFocusFirst();
  }
  function closeOnboard() {
    document.getElementById('onboard-modal').classList.remove('open');
    wizDetachFocusTrap();
    // Don't clear draft here — closing without finalize means user might
    // come back. Draft is cleared explicitly on successful finalize.
  }

  // Inline banner helper
  function wizShowBanner({ type = 'info', icon = 'ℹ', html, actionLabel, onAction, append = false }) {
    const slot = document.getElementById('wiz-banner-slot');
    const cls = type === 'warn' ? 'wiz-banner-warn' : 'wiz-banner-info';
    const id = 'wiz-banner-' + Math.random().toString(36).slice(2, 8);
    const action = actionLabel
      ? '<button class="wiz-banner-action" id="' + id + '">' + esc(actionLabel) + '</button>'
      : '';
    const banner = '<div class="wiz-banner ' + cls + '">'
      + '<span class="wiz-banner-icon">' + esc(icon) + '</span>'
      + '<div>' + html + '</div>'
      + action + '</div>';
    if (append) slot.insertAdjacentHTML('beforeend', banner);
    else slot.innerHTML = banner;
    if (actionLabel && onAction) {
      document.getElementById(id).onclick = onAction;
    }
  }
  function wizClearBanners() {
    document.getElementById('wiz-banner-slot').innerHTML = '';
  }

  // Focus trap — tab/shift+tab cycle within the modal; Escape closes
  let _wizFocusables = [];
  let _wizKeyHandler = null;
  function wizAttachFocusTrap() {
    _wizKeyHandler = (e) => {
      const modal = document.getElementById('onboard-modal');
      if (!modal.classList.contains('open')) return;
      if (e.key === 'Escape') {
        e.preventDefault(); closeOnboard(); return;
      }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.target.matches('textarea')) {
        // Enter on an input advances unless it's the proof-point row inputs
        // (where Enter would clobber the user's row).
        if (e.target.closest('.wiz-proof')) return;
        e.preventDefault(); wizNext(); return;
      }
      if (e.key !== 'Tab') return;
      const focusables = Array.from(modal.querySelectorAll(
        'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
      )).filter(el => !el.disabled && el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', _wizKeyHandler);
  }
  function wizDetachFocusTrap() {
    if (_wizKeyHandler) document.removeEventListener('keydown', _wizKeyHandler);
    _wizKeyHandler = null;
  }
  function wizFocusFirst() {
    const modal = document.getElementById('onboard-modal');
    const target = modal.querySelector('.wiz-step.active textarea, .wiz-step.active input:not([type=hidden]), .wiz-step.active button');
    if (target) target.focus();
  }

  // ── Draft persistence (localStorage) ──────────────────────────────────────
  // Save wizard state on every step transition. If the user closes the modal
  // mid-wizard and reopens within 24h, offer to resume where they left off.

  const WIZ_DRAFT_KEY = 'careerops:wizard:draft';
  const WIZ_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

  function wizSaveDraft() {
    try {
      const s = window.wizState;
      if (!s) return;
      // Sets aren't JSON-serializable — convert to arrays
      const snapshot = {
        ts: Date.now(),
        step: s.step,
        extracted: s.extracted,
        basics: s.basics,
        roles: { ...s.roles, selected: [...s.roles.selected] },
        dealbreakers: { ...s.dealbreakers, selected: [...s.dealbreakers.selected] },
        narrative: s.narrative,
      };
      localStorage.setItem(WIZ_DRAFT_KEY, JSON.stringify(snapshot));
    } catch { /* localStorage may be disabled — non-fatal */ }
  }
  function wizLoadDraft() {
    try {
      const raw = localStorage.getItem(WIZ_DRAFT_KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (!draft || !draft.ts || (Date.now() - draft.ts) > WIZ_DRAFT_TTL_MS) {
        localStorage.removeItem(WIZ_DRAFT_KEY);
        return null;
      }
      return draft;
    } catch { return null; }
  }
  function wizClearDraft() {
    try { localStorage.removeItem(WIZ_DRAFT_KEY); } catch {}
  }
  function wizApplyDraft(draft) {
    if (!draft) return;
    window.wizState = {
      step: draft.step || 1,
      extracted: draft.extracted || null,
      basics: { ...defaultWizState().basics, ...(draft.basics || {}) },
      roles: { ...defaultWizState().roles, ...(draft.roles || {}), selected: new Set(draft.roles?.selected || []) },
      dealbreakers: { ...defaultWizState().dealbreakers, ...(draft.dealbreakers || {}), selected: new Set(draft.dealbreakers?.selected || []) },
      narrative: { ...defaultWizState().narrative, ...(draft.narrative || {}) },
    };
    // Re-populate inputs
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    setVal('wiz-full-name', window.wizState.basics.full_name);
    setVal('wiz-email',     window.wizState.basics.email);
    setVal('wiz-phone',     window.wizState.basics.phone);
    setVal('wiz-location',  window.wizState.basics.location);
    setVal('wiz-linkedin',  window.wizState.basics.linkedin);
    setVal('wiz-headline',  window.wizState.basics.headline);
    setVal('wiz-comp-target',   window.wizState.roles.comp_target);
    setVal('wiz-comp-min',      window.wizState.roles.comp_min);
    setVal('wiz-comp-currency', window.wizState.roles.comp_currency);
    setVal('wiz-location-pref', window.wizState.roles.location_pref);
    setVal('wiz-super-1', window.wizState.narrative.superpowers[0] || '');
    setVal('wiz-super-2', window.wizState.narrative.superpowers[1] || '');
    setVal('wiz-super-3', window.wizState.narrative.superpowers[2] || '');
    setVal('wiz-best',    window.wizState.narrative.best_achievement || '');
  }
  function wizDraftAgeText(draft) {
    if (!draft || !draft.ts) return '';
    const mins = Math.round((Date.now() - draft.ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    const hrs = Math.round(mins / 60);
    return hrs + ' hour' + (hrs === 1 ? '' : 's') + ' ago';
  }

  function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('drop-zone').classList.add('drag-over');
  }
  function handleDragLeave(e) {
    document.getElementById('drop-zone').classList.remove('drag-over');
  }
  async function handleDrop(e) {
    e.preventDefault();
    document.getElementById('drop-zone').classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) await readFileIntoTextarea(file);
  }
  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) await readFileIntoTextarea(file);
  }
  async function readFileIntoTextarea(file) {
    if (file.type === 'application/pdf') {
      // PDFs need a text layer — easiest path is to open the PDF in a new tab,
      // user copies (Cmd/Ctrl+A → Cmd/Ctrl+C), then pastes into the textarea.
      const isMac = /Mac|iPad|iPhone/.test(navigator.platform);
      const cmd = isMac ? '⌘' : 'Ctrl';
      const url = URL.createObjectURL(file);
      wizShowBanner({
        type: 'warn',
        icon: '📄',
        html: 'PDFs need a quick copy step. Open it, press <strong>' + cmd + '+A</strong> then <strong>' + cmd + '+C</strong>, come back here and paste below.',
        actionLabel: 'Open PDF →',
        onAction: () => window.open(url, '_blank', 'noopener'),
      });
      // Auto-detect when user pastes back: focus the textarea and watch for a paste event.
      const ta = document.getElementById('onboard-text');
      ta.focus();
      const handlePaste = () => {
        setTimeout(() => {
          if (ta.value.trim().length >= 80) {
            wizClearBanners();
            wizShowBanner({ type: 'info', icon: '✓', html: 'Looks good — click Continue when ready.' });
          }
        }, 50);
      };
      ta.addEventListener('paste', handlePaste, { once: true });
      return;
    }
    const text = await file.text();
    document.getElementById('onboard-text').value = text;
    document.getElementById('drop-zone').querySelector('.drop-label').textContent = '✓ ' + file.name;
  }

  // Short labels for the step-indicator tooltips
  const WIZ_STEP_LABELS = ['Resume', 'Basics', 'Roles & Comp', 'Deal-breakers', 'Narrative', 'Review'];

  function wizRenderSteps() {
    const el = document.getElementById('wiz-steps');
    const out = [];
    for (let i = 1; i <= WIZ_STEPS; i++) {
      const cls = i < window.wizState.step ? 'wiz-dot done' : i === window.wizState.step ? 'wiz-dot active' : 'wiz-dot';
      const status = i < window.wizState.step ? 'done' : i === window.wizState.step ? 'in progress' : 'pending';
      const label = WIZ_STEP_LABELS[i - 1];
      out.push('<span class="' + cls + '" title="Step ' + i + ': ' + label + '" aria-label="Step ' + i + ' of ' + WIZ_STEPS + ': ' + label + ' — ' + status + '">' + (i < window.wizState.step ? '✓' : i) + '</span>');
      if (i < WIZ_STEPS) out.push('<span class="wiz-dot-line" aria-hidden="true"></span>');
    }
    el.innerHTML = out.join('');
  }

  function wizGoTo(n) {
    window.wizState.step = n;
    document.querySelectorAll('.wiz-step').forEach(el => {
      el.classList.toggle('active', Number(el.dataset.step) === n);
    });
    wizRenderSteps();
    const meta = WIZ_TITLES[n];
    document.getElementById('wiz-title').textContent = meta.title;
    document.getElementById('wiz-subtitle').textContent = meta.sub;
    document.getElementById('wiz-back').style.display = n > 1 ? 'inline-flex' : 'none';
    document.getElementById('wiz-cancel').style.display = n === 1 ? 'inline-flex' : 'none';
    document.getElementById('wiz-skip').style.display = WIZ_SKIPPABLE.has(n) ? 'inline-flex' : 'none';
    const label = document.getElementById('onboard-btn-label');
    label.textContent = n === 1 ? '✦ Scan & Continue'
      : n === WIZ_STEPS ? '🚀 Generate My Pipeline'
      : 'Continue →';
    if (n === 2) wizBindFieldValidation();
    if (n === 3) wizRenderChips('roles');
    if (n === 4) wizRenderChips('dealbreakers');
    if (n === 5) wizRenderProof();
    if (n === WIZ_STEPS) wizRenderSummary();
    wizSaveDraft();
  }

  function wizBack() {
    if (window.wizState.step > 1) wizGoTo(window.wizState.step - 1);
  }

  // Skip optional step → jump straight to the review screen. We deliberately
  // don't try to "fast-forward" through intermediate optional steps; if a user
  // skips step 4 we still want to show step 5 in case they have a narrative.
  // Only step 5 → 6 is the true "skip to end" jump.
  function wizSkip() {
    const s = window.wizState.step;
    if (!WIZ_SKIPPABLE.has(s)) return;
    if (s === 4) wizGoTo(5);
    else if (s === 5) wizGoTo(WIZ_STEPS);
    // Move focus into the new step so keyboard users don't have to tab
    // through the action row again.
    wizFocusFirst();
  }

  async function wizNext() {
    const s = window.wizState.step;
    const btn = document.getElementById('onboard-btn');
    btn.disabled = true;
    try {
      if (s === 1) await wizSubmitStep1();
      else if (s === 2) wizCollectStep2();
      else if (s === 3) wizCollectStep3();
      else if (s === 4) wizCollectStep4();
      else if (s === 5) wizCollectStep5();
      else if (s === 6) { await wizFinalize(); return; }
      wizGoTo(s + 1);
    } catch (err) {
      showToast(err.message || 'Something went wrong', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function wizSubmitStep1() {
    const text = document.getElementById('onboard-text').value.trim();
    if (text.length < 80) throw new Error('Paste your full resume text first (or drop a .txt/.md file)');

    const spinner = document.getElementById('onboard-spinner');
    const label = document.getElementById('onboard-btn-label');
    spinner.classList.add('show');
    label.textContent = 'Scanning…';

    try {
      const res = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Could not parse resume');
      window.wizState.extracted = data.profile;
      // Pre-fill step 2
      const p = data.profile;
      document.getElementById('wiz-full-name').value = p.full_name || '';
      document.getElementById('wiz-email').value = p.email || '';
      document.getElementById('wiz-phone').value = p.phone || '';
      document.getElementById('wiz-location').value = p.location || '';
      document.getElementById('wiz-linkedin').value = p.linkedin || '';
      document.getElementById('wiz-headline').value = p.headline || '';
      // Empty-state messaging: if we couldn't auto-detect anything, tell the
      // user upfront so they don't think the wizard is broken.
      if ((data.extractedCount || 0) === 0) {
        wizShowBanner({
          type: 'warn',
          icon: '⚠',
          html: "We couldn't auto-detect any fields from that resume. Fill them in manually below — you can paste each piece individually.",
        });
      } else if ((data.extractedCount || 0) < 3) {
        wizShowBanner({
          type: 'info',
          icon: 'ℹ',
          html: 'Only got ' + data.extractedCount + ' field' + (data.extractedCount === 1 ? '' : 's') + ' from your resume. Fill in anything missing below.',
        });
      } else {
        wizClearBanners();
      }
    } finally {
      spinner.classList.remove('show');
    }
  }

  // Field-level validators — also drive the inline aria-invalid + error
  // text under each input. Returns true if valid.
  function wizValidateField(id) {
    const input = document.getElementById(id);
    if (!input) return true;
    const errEl = document.getElementById('err-' + id.replace('wiz-', ''));
    let ok = true;
    if (id === 'wiz-full-name') {
      ok = input.value.trim().length >= 2;
    } else if (id === 'wiz-email') {
      ok = /.+@.+\\..+/.test(input.value.trim());
    }
    input.setAttribute('aria-invalid', ok ? 'false' : 'true');
    if (errEl) errEl.classList.toggle('show', !ok);
    return ok;
  }
  function wizBindFieldValidation() {
    for (const id of ['wiz-full-name', 'wiz-email']) {
      const input = document.getElementById(id);
      if (!input || input.dataset.validated) continue;
      input.dataset.validated = '1';
      input.addEventListener('blur', () => wizValidateField(id));
      input.addEventListener('input', () => {
        // While typing, only clear errors — don't show new ones
        if (input.getAttribute('aria-invalid') === 'true') wizValidateField(id);
      });
    }
  }

  function wizCollectStep2() {
    const v = (id) => document.getElementById(id).value.trim();
    const b = window.wizState.basics;
    b.full_name = v('wiz-full-name');
    b.email     = v('wiz-email');
    b.phone     = v('wiz-phone');
    b.location  = v('wiz-location');
    b.linkedin  = v('wiz-linkedin');
    b.headline  = v('wiz-headline');
    const nameOk  = wizValidateField('wiz-full-name');
    const emailOk = wizValidateField('wiz-email');
    if (!nameOk || !emailOk) {
      // Focus the first invalid field so the user sees the inline message.
      const firstBad = !nameOk ? 'wiz-full-name' : 'wiz-email';
      document.getElementById(firstBad).focus();
      throw new Error(!nameOk ? 'Full name is required' : 'Valid email is required');
    }
  }

  function wizUpdateChipCounter(kind) {
    const counter = document.getElementById(kind === 'roles' ? 'wiz-roles-count' : 'wiz-dealbreakers-count');
    if (!counter) return;
    const n = window.wizState[kind].selected.size;
    counter.textContent = n === 0 ? 'none yet' : (n === 1 ? '1 selected' : n + ' selected');
    counter.classList.toggle('has-selection', n > 0);
  }

  function wizRenderChips(kind) {
    const presets = kind === 'roles' ? ROLE_PRESETS : DEALBREAKER_PRESETS;
    const state = window.wizState[kind];
    const containerId = kind === 'roles' ? 'wiz-roles-chips' : 'wiz-dealbreakers-chips';
    const container = document.getElementById(containerId);
    const cls = kind === 'dealbreakers' ? 'wiz-chip selected deal-breaker' : 'wiz-chip selected';
    const all = [...presets, ...state.custom];
    // Render with data-value (safely HTML-escaped) and bind clicks via
    // delegation — avoids the injection trap of inline onclick="wizToggleChip(...)".
    container.innerHTML = all.map(opt => {
      const sel = state.selected.has(opt) ? cls : 'wiz-chip';
      return '<span class="' + sel + '" data-value="' + esc(opt) + '" tabindex="0" role="button" aria-pressed="' + (state.selected.has(opt) ? 'true' : 'false') + '">' + esc(opt) + '</span>';
    }).join('');
    if (!container.dataset.bound) {
      container.addEventListener('click', (e) => {
        const chip = e.target.closest('.wiz-chip');
        if (!chip) return;
        wizToggleChip(kind, chip.dataset.value);
      });
      container.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const chip = e.target.closest('.wiz-chip');
        if (!chip) return;
        e.preventDefault();
        wizToggleChip(kind, chip.dataset.value);
      });
      container.dataset.bound = '1';
    }
    wizUpdateChipCounter(kind);
  }

  function wizToggleChip(kind, value) {
    const s = window.wizState[kind];
    const wasSelected = s.selected.has(value);
    if (wasSelected) s.selected.delete(value);
    else s.selected.add(value);
    // Selective DOM update — only the toggled chip's class + aria-pressed
    // changes. Skips re-rendering the other 15 chips on every click.
    const containerId = kind === 'roles' ? 'wiz-roles-chips' : 'wiz-dealbreakers-chips';
    const container = document.getElementById(containerId);
    const cls = kind === 'dealbreakers' ? 'wiz-chip selected deal-breaker' : 'wiz-chip selected';
    const chip = [...container.querySelectorAll('.wiz-chip')]
      .find(c => c.dataset.value === value);
    if (!chip) { wizRenderChips(kind); return; } // fallback (e.g. just-added custom)
    chip.className = wasSelected ? 'wiz-chip' : cls;
    chip.setAttribute('aria-pressed', wasSelected ? 'false' : 'true');
    wizUpdateChipCounter(kind);
    wizSaveDraft();
  }

  function wizAddCustom(kind) {
    const inputId = kind === 'roles' ? 'wiz-role-add' : 'wiz-dealbreaker-add';
    const input = document.getElementById(inputId);
    const v = input.value.trim();
    if (!v) return;
    const s = window.wizState[kind];
    if (!s.custom.includes(v)) s.custom.push(v);
    s.selected.add(v);
    input.value = '';
    wizRenderChips(kind);
  }

  function wizCollectStep3() {
    const r = window.wizState.roles;
    r.comp_target   = document.getElementById('wiz-comp-target').value.trim();
    r.comp_min      = document.getElementById('wiz-comp-min').value.trim();
    r.comp_currency = document.getElementById('wiz-comp-currency').value;
    r.location_pref = document.getElementById('wiz-location-pref').value.trim();
    if (r.selected.size === 0) throw new Error('Pick at least one target role');
  }

  function wizCollectStep4() {
    /* deal-breakers are optional — anything goes through */
  }

  function wizRenderProof() {
    const list = document.getElementById('wiz-proof-list');
    const items = window.wizState.narrative.proof_points;
    if (!items.length) {
      list.innerHTML = '<div class="wiz-empty">No proof points yet — add one if you have any.</div>';
      return;
    }
    // Use data-attributes + delegated event handlers (same pattern as chips).
    list.innerHTML = items.map((p, i) =>
      '<div class="wiz-proof" data-idx="' + i + '">' +
      '<input class="wiz-input" data-field="name"        placeholder="Name (e.g. Jarvis platform)" value="' + esc(p.name || '') + '">' +
      '<input class="wiz-input" data-field="url"         placeholder="URL (optional)"             value="' + esc(p.url || '') + '">' +
      '<input class="wiz-input" data-field="hero_metric" placeholder="Hero metric (e.g. $26M ROI)" value="' + esc(p.hero_metric || '') + '">' +
      '<button class="wiz-proof-rm" data-action="remove" aria-label="Remove proof point">×</button>' +
      '</div>').join('');
    if (!list.dataset.bound) {
      list.addEventListener('input', (e) => {
        const row = e.target.closest('.wiz-proof'); if (!row) return;
        const field = e.target.dataset.field; if (!field) return;
        wizUpdateProof(Number(row.dataset.idx), field, e.target.value);
      });
      list.addEventListener('click', (e) => {
        const row = e.target.closest('.wiz-proof'); if (!row) return;
        if (e.target.dataset.action === 'remove') wizRemoveProof(Number(row.dataset.idx));
      });
      list.dataset.bound = '1';
    }
  }

  function wizAddProof() {
    window.wizState.narrative.proof_points.push({ name: '', url: '', hero_metric: '' });
    wizRenderProof();
  }
  function wizUpdateProof(i, field, val) {
    if (window.wizState.narrative.proof_points[i]) {
      window.wizState.narrative.proof_points[i][field] = val;
    }
  }
  function wizRemoveProof(i) {
    window.wizState.narrative.proof_points.splice(i, 1);
    wizRenderProof();
  }

  function wizCollectStep5() {
    const n = window.wizState.narrative;
    n.superpowers = [
      document.getElementById('wiz-super-1').value.trim(),
      document.getElementById('wiz-super-2').value.trim(),
      document.getElementById('wiz-super-3').value.trim(),
    ].filter(Boolean);
    n.best_achievement = document.getElementById('wiz-best').value.trim();
    n.proof_points = n.proof_points.filter(p => p.name || p.url);
  }

  function wizRenderSummary() {
    const s = window.wizState;
    const rolesAll = [...s.roles.selected];
    const dbAll = [...s.dealbreakers.selected];
    const rows = [
      ['Name',         esc(s.basics.full_name) + ' · <em>' + esc(s.basics.email || '') + '</em>'],
      ['Headline',     s.basics.headline ? esc(s.basics.headline) : '<em>(none)</em>'],
      ['Location',     esc(s.basics.location || '—')],
      ['Target roles', rolesAll.length ? rolesAll.map(esc).join(' · ') : '<em>(none — pick at least one in step 3)</em>'],
      ['Comp',         (esc(s.roles.comp_target || '—')) + ' / min ' + esc(s.roles.comp_min || '—') + ' (' + esc(s.roles.comp_currency) + ')'],
      ['Deal-breakers', dbAll.length ? dbAll.map(esc).join(' · ') : '<em>none flagged</em>'],
      ['Superpowers',  s.narrative.superpowers.length ? s.narrative.superpowers.map(esc).join(' · ') : '<em>(none)</em>'],
      ['Best',         s.narrative.best_achievement ? '<em>' + esc(s.narrative.best_achievement.slice(0, 200)) + (s.narrative.best_achievement.length > 200 ? '…' : '') + '</em>' : '<em>(none)</em>'],
      ['Proof points', s.narrative.proof_points.length ? s.narrative.proof_points.map(p => esc(p.name || p.url || '?')).join(' · ') : '<em>none</em>'],
    ];
    document.getElementById('wiz-summary').innerHTML =
      rows.map(([k, v]) => '<div class="wiz-summary-row"><strong>' + k + '</strong> — ' + v + '</div>').join('');
  }

  async function wizFinalize() {
    const spinner = document.getElementById('onboard-spinner');
    const label = document.getElementById('onboard-btn-label');
    spinner.classList.add('show');
    label.textContent = 'Generating…';
    const payload = {
      basics: window.wizState.basics,
      target_roles: [...window.wizState.roles.selected],
      compensation: {
        target_range: window.wizState.roles.comp_target,
        minimum:      window.wizState.roles.comp_min,
        currency:     window.wizState.roles.comp_currency,
        location_flexibility: window.wizState.roles.location_pref,
      },
      deal_breakers: [...window.wizState.dealbreakers.selected],
      narrative: window.wizState.narrative,
    };
    try {
      const res = await fetch('/api/onboard/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'finalize failed');
      wizClearDraft();
      // Profile is now on disk → flip cvExists so empty-state + button show
      // the post-setup copy on the next render. checkSetupStatus() also
      // refreshes this on boot, but we don't want to wait for a page reload.
      window.cvExists = true;
      const profileBtn = document.getElementById('profile-btn');
      if (profileBtn) {
        profileBtn.textContent = '⊕ Profile';
        profileBtn.style.color = '';
        profileBtn.style.borderColor = '';
      }
      showToast('Profile saved · rendering your CV — I\\'ll handle it from here', 'info', 4500);
      closeOnboard();
      // Brief celebration moment so the user feels the AI "got to work"
      // before the dashboard re-renders with their fresh data.
      try { celebrateOnboarding(); } catch { /* non-fatal */ }
      // Defensive refresh: the disk write + scheduler pickup race means a
      // single setTimeout(800) sometimes lands before the file is visible.
      // Trigger refresh at 800ms AND 3s — both are no-ops if data hasn't
      // changed, but the second one catches the slow-disk case.
      setTimeout(() => refresh(), 800);
      setTimeout(() => refresh(), 3000);
      // Poll the PDF endpoint so the user gets a follow-up toast when the
      // background generation finishes (or fails). Also refreshes the
      // dashboard once the new PDF is visible on disk.
      pollPdfStatus(15);
    } finally {
      spinner.classList.remove('show');
      label.textContent = '🚀 Generate My Pipeline';
    }
  }

  // Brief, non-blocking celebration moment when the user finishes onboarding.
  // Plays a confetti-light burst from the brand mark + a one-line greeting.
  // Respects prefers-reduced-motion.
  function celebrateOnboarding() {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const root = document.body;
    const layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '9998',
      overflow: 'hidden',
    });
    const colors = ['#28b8ff', '#30d158', '#ffd60a', '#ff9f0a', '#ff375f', '#bf5af2'];
    const N = 36;
    for (let i = 0; i < N; i++) {
      const dot = document.createElement('span');
      const c = colors[i % colors.length];
      const angle = (Math.PI * 2 * i) / N;
      const dist = 220 + Math.random() * 180;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const size = 6 + Math.random() * 5;
      Object.assign(dot.style, {
        position: 'absolute', left: '50%', top: '34%',
        width: size + 'px', height: size + 'px', borderRadius: '50%',
        background: c, boxShadow: '0 0 8px ' + c,
        transform: 'translate(-50%, -50%) scale(.4)',
        opacity: '0.95',
        transition: 'transform 1100ms cubic-bezier(.22,1,.36,1), opacity 1100ms ease-out',
      });
      layer.appendChild(dot);
      requestAnimationFrame(() => {
        dot.style.transform = 'translate(calc(' + dx + 'px - 50%), calc(' + dy + 'px - 50%)) scale(1)';
        dot.style.opacity = '0';
      });
    }
    root.appendChild(layer);
    setTimeout(() => layer.remove(), 1400);
  }

  // Polls /api/onboard/pdf-status up to N times (1s apart) and updates the
  // user when the background CV PDF generation completes. On success, also
  // refreshes the dashboard so the new CV link is picked up immediately.
  async function pollPdfStatus(maxTries) {
    for (let i = 0; i < maxTries; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const r = await fetch('/api/onboard/pdf-status');
        if (!r.ok) continue;
        const s = await r.json();
        if (s.ready) {
          showToast('CV PDF ready — pipeline armed', 'success');
          refresh();
          return;
        }
        if (s.error) {
          showToast('PDF generation failed (check logs); profile saved', 'error');
          return;
        }
      } catch { /* keep polling */ }
    }
    showToast('CV PDF still generating — check output/ shortly', 'info');
  }

  // Check setup status on boot — show banner if cv.md missing.
  // Stashes the result on window.cvExists so renderApps can pick the right
  // empty-state copy (pre-CV vs profile-set-but-no-apps).
  async function checkSetupStatus() {
    try {
      const res = await fetch('/api/setup-status');
      const { cvExists } = await res.json();
      window.cvExists = !!cvExists;
      if (!cvExists) {
        const btn = document.getElementById('profile-btn');
        btn.textContent = '⚠ Setup';
        btn.style.color = 'var(--orange)';
        btn.style.borderColor = 'rgba(255,159,10,.4)';
        showToast('No CV found — drop your resume to get started', 'error');
      }
      // Re-paint the empty-state copy now that cvExists is known. No-op when
      // there ARE applications (renderApps short-circuits).
      if (typeof allApps !== 'undefined' && Array.isArray(allApps) && allApps.length === 0) {
        applyFilter();
      }
    } catch {}
  }

  /* ── Main refresh ── */
  async function refresh() {
    document.getElementById('last-updated').innerHTML = '<span class="spinner"></span>';
    try {
      const res = await fetch('/api/data');
      const data = await res.json();
      allApps = data.applications;
      renderStats(data.stats);
      updateApplyBanner(data.applications);
      applyFilter();
      renderFollowUps(data.applications);
      renderPipeline(data.pipeline);
      const d = new Date(data.updatedAt);
      document.getElementById('last-updated').textContent =
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      document.getElementById('last-updated').textContent = 'Error loading data';
      showToast('Failed to load data', 'error');
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { refresh(); scheduleRefresh(); }, 30000);
  }

  /* ── Pipeline status ── */
  function formatRelativeTime(isoString) {
    if (!isoString) return '';
    const diff = new Date(isoString) - Date.now();
    const abs = Math.abs(diff);
    if (abs < 60000) return diff < 0 ? 'just now' : 'in <1m';
    const mins = Math.round(abs / 60000);
    if (mins < 60) return diff < 0 ? mins + 'm ago' : 'in ' + mins + 'm';
    const hrs = Math.round(abs / 3600000);
    return diff < 0 ? hrs + 'h ago' : 'in ' + hrs + 'h';
  }

  async function checkPipelineStatus() {
    try {
      const res = await fetch('/api/pipeline/status');
      const s = await res.json();
      const bar = document.getElementById('pipeline-bar');
      const dot = document.getElementById('pipeline-dot');
      const label = document.getElementById('pipeline-label');
      const statusText = document.getElementById('pipeline-status-text');
      const nextEl = document.getElementById('pipeline-next');
      bar.style.display = 'flex';
      if (s.running) {
        dot.className = 'pipeline-bar-dot running';
        label.className = 'pipeline-bar-label';
        label.textContent = 'Pipeline';
        statusText.textContent = 'Running scan → eval cycle…';
        nextEl.textContent = '';
      } else {
        dot.className = 'pipeline-bar-dot idle';
        label.className = 'pipeline-bar-label idle';
        label.textContent = 'Pipeline';
        statusText.textContent = s.lastRun ? 'Last: ' + formatRelativeTime(s.lastRun) : 'Standby · first scan in ~1m';
        nextEl.textContent = s.nextRun ? 'Next: ' + formatRelativeTime(s.nextRun) : '';
      }
    } catch {}
  }

  // Global keyboard shortcuts — opens the onboarding wizard. We use comma
  // because it is the macOS-standard "preferences" hotkey and does not
  // collide with browser print (Cmd/Ctrl+P) or find (Cmd/Ctrl+F).
  // Also: bare ? opens a quick shortcuts cheat-sheet.
  document.addEventListener('keydown', (e) => {
    // Skip when typing in a field. Feature-detect matches() because the
    // event target may be the document object itself (synthetic events)
    // which has no matches() method.
    const t = e.target;
    const inField = t && typeof t.matches === 'function'
      && t.matches('input, textarea, select, [contenteditable="true"]');
    if (inField) return;

    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      const modal = document.getElementById('onboard-modal');
      if (modal && modal.classList.contains('open')) return;
      e.preventDefault();
      openOnboard();
      return;
    }
    // Shift+? (i.e. typing '?') opens the shortcuts cheat-sheet. We exclude
    // ctrl/meta to avoid colliding with browser shortcuts.
    if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === '?') {
      e.preventDefault();
      showShortcutsHelp();
    }
  });

  function showShortcutsHelp() {
    showToast(
      'Shortcuts:  ⌘ , open profile  ·  Esc close modal  ·  Tab navigate  ·  Enter advance  ·  ? this help',
      'info', 6000
    );
  }

  // Boot
  refresh().then(scheduleRefresh);
  checkSetupStatus();
  refreshGmail();
  renderVerificationCodes();
  checkAutopilotStatus();
  checkPipelineStatus();
  renderManualQueue();
  setInterval(refreshGmail, 5 * 60 * 1000);
  setInterval(renderVerificationCodes, 15 * 1000);
  setInterval(checkPipelineStatus, 30 * 1000);
  setInterval(renderManualQueue, 60 * 1000);
</script>
</body>
</html>`;

// ── Route handler ─────────────────────────────────────────────────────────────

// ── Security middleware ──────────────────────────────────────────────────────
// Applied via setHeader at the top of every request, so any subsequent
// res.writeHead(status, extraHeaders) call automatically inherits these.

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",   // dashboard uses inline <script> blocks
  "style-src 'self' 'unsafe-inline'",    // and inline style="" attributes
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",                  // Gmail API runs server-side, not browser-side
  "frame-ancestors 'none'",              // clickjacking protection
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  res.setHeader('Content-Security-Policy', CSP_DIRECTIVES);
}

// Allowed Origin values for state-changing POST requests. Empty Origin
// (same-origin fetch) is also permitted. Configurable via env for users who
// front the dashboard with a reverse proxy.
const ALLOWED_ORIGINS = new Set([
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  ...(process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : []),
]);

function isOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin fetch / curl / direct request
  return ALLOWED_ORIGINS.has(origin);
}

// Generic error responder — never leak err.message to the client.
function sendJsonError(res, status, publicMessage, err) {
  if (err) {
    console.error(`[api ${status}] ${publicMessage}:`, err.message);
  }
  if (!res.headersSent) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
  }
  res.end(JSON.stringify({ ok: false, error: publicMessage }));
}

// Path-traversal defense: bound to REPORTS_DIR. Logic in lib/path-safety.mjs
// so it can be unit-tested without booting the server.
const resolveSafeReportPath = makeSafeResolver(REPORTS_DIR);

// Onboard wizard helpers (validateOnboardPayload, serializeProfileYaml,
// extractProfileFromResume) live in ./lib/onboard.mjs so they're testable
// without booting the HTTP server.

async function handleRequest(req, res) {
  applySecurityHeaders(res);
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = urlObj.pathname;

  // Reject state-changing requests from disallowed origins (CSRF defense).
  // Methods that mutate state must come from a trusted Origin or be
  // same-origin (no Origin header).
  if (req.method !== 'GET' && req.method !== 'HEAD' && !isOriginAllowed(req)) {
    return sendJsonError(res, 403, 'origin not allowed');
  }

  // ── API: Data ──
  if (pathname === '/api/data') {
    try {
      const data = await loadData();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    } catch (err) {
      sendJsonError(res, 500, 'failed to load data', err);
    }
    return;
  }

  // ── API: Get job URL from a row's report (for one-click Open) ──
  if (pathname === '/api/job-url') {
    const num = urlObj.searchParams.get('num') || '';
    if (!/^\d{1,5}$/.test(num)) {
      return sendJsonError(res, 400, 'num required (digits only)');
    }
    try {
      const files = await fs.readdir(REPORTS_DIR).catch(() => []);
      const candidate = files.find(f => f.startsWith(String(num).padStart(3, '0') + '-') || f.startsWith(num + '-'));
      if (!candidate) {
        return sendJsonError(res, 404, 'no report');
      }
      const safePath = resolveSafeReportPath(candidate);
      if (!safePath) {
        return sendJsonError(res, 400, 'invalid report path');
      }
      const text = await fs.readFile(safePath, 'utf8');
      const m = text.match(/\*\*URL[^:*]*:\*\*\s*(https?:\/\/[^\s|]+)/);
      const url = m ? m[1].trim() : null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, url }));
    } catch (err) {
      sendJsonError(res, 500, 'failed to read report', err);
    }
    return;
  }

  // ── API: Update status ──
  if (pathname === '/api/update-status' && req.method === 'POST') {
    try {
      const { num, status } = await readJsonBody(req);
      if (!num || !status) return sendJsonError(res, 400, 'num and status required');
      if (!/^\d{1,5}$/.test(String(num))) return sendJsonError(res, 400, 'invalid num');
      const allowedStatuses = ['Evaluated','Applied','Responded','Interview','Offer','Rejected','Discarded','SKIP'];
      if (!allowedStatuses.includes(String(status))) return sendJsonError(res, 400, 'invalid status');
      await updateApplicationStatus(num, status);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      sendJsonError(res, 400, 'update failed', err);
    }
    return;
  }

  // ── API: Gmail inbox ──
  if (pathname === '/api/gmail/inbox') {
    const token = await getAccessToken();
    if (!token && !gmailTokens) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ connected: false, signals: [] }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ connected: true, signals: gmailCache.signals || [], scanned_at: gmailCache.scanned_at }));
    return;
  }

  // ── API: Gmail status (diagnostic) ──
  // Returns a structured snapshot the UI can show without leaking secrets.
  // Used by the inline "Connect Gmail" panel + the in-app setup modal.
  if (pathname === '/api/gmail/status') {
    const status = buildGmailStatus({
      clientId: GMAIL_CLIENT_ID,
      clientSecret: GMAIL_CLIENT_SECRET,
      scope: GMAIL_SCOPE,
      redirectUri: GMAIL_REDIRECT_URI,
      tokens: gmailTokens,
      polling: !!scanInterval,
      fastPolling: fastPollingActive,
      cache: gmailCache,
    });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(status));
    return;
  }

  // ── API: Gmail disconnect ──
  // Wipes the saved OAuth tokens. The user can reconnect via /auth/gmail.
  // Does NOT revoke at Google's end (privacy.google.com handles that) — but
  // documents the link so users can do a clean revocation if they want to.
  if (pathname === '/api/gmail/disconnect' && req.method === 'POST') {
    try {
      gmailTokens = null;
      try { await fs.unlink(TOKENS_FILE); } catch { /* already absent */ }
      clearInterval(scanInterval);
      scanInterval = null;
      fastPollingActive = false;
      gmailCache = { signals: [], scanned_at: null };
      try { await saveGmailCache(); } catch { /* non-fatal */ }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        revokeUrl: 'https://myaccount.google.com/permissions',
      }));
    } catch (err) {
      sendJsonError(res, 500, 'disconnect failed', err);
    }
    return;
  }

  // ── API: Gmail dismiss ──
  if (pathname === '/api/gmail/dismiss' && req.method === 'POST') {
    try {
      const { id } = await readJsonBody(req);
      if (typeof id !== 'string' || id.length > 200) return sendJsonError(res, 400, 'invalid id');
      const sig = (gmailCache.signals || []).find(s => s.id === id);
      if (sig) sig.dismissed = true;
      await saveGmailCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      sendJsonError(res, 400, 'dismiss failed', err);
    }
    return;
  }

  // ── API: Gmail verification codes ──
  if (pathname === '/api/gmail/codes') {
    const now = Date.now();
    verificationCodes = verificationCodes.filter(v => v.expiresAt > now);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ codes: verificationCodes }));
    return;
  }

  // ── API: Gmail fast-poll toggle ──
  if (pathname === '/api/gmail/fast-poll' && req.method === 'POST') {
    try {
      const { active } = await readJsonBody(req);
      setFastPolling(!!active);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, fast: fastPollingActive }));
    } catch (err) {
      sendJsonError(res, 400, 'fast-poll toggle failed', err);
    }
    return;
  }

  // ── API: Auto-apply start ──
  if (pathname === '/api/auto-apply' && req.method === 'POST') {
    try {
      if (autoApplyState.active) return sendJsonError(res, 409, 'auto-apply already running');
      const { nums, mode } = await readJsonBody(req);
      if (!Array.isArray(nums) || !nums.length) return sendJsonError(res, 400, 'nums array required');
      if (nums.length > 500) return sendJsonError(res, 400, 'too many nums (max 500)');

      const queue = [];
      const allData = await loadData();
      for (const num of nums) {
        if (!/^\d{1,5}$/.test(String(num))) continue;
        const app = allData.applications.find(a => a.num === String(num));
        if (!app) continue;
        let url = null;
        if (app.reportLink) {
          const safe = resolveSafeReportPath(app.reportLink);
          if (safe) {
            try {
              const content = await fs.readFile(safe, 'utf8');
              const m = content.match(/\*\*URL[^:*]*:\*\*\s*(https?:\/\/[^\s|]+)/);
              url = m ? m[1].trim() : null;
            } catch {}
          }
        }
        if (!url) {
          const files = await fs.readdir(REPORTS_DIR).catch(() => []);
          const reportFile = files.find(f => f.startsWith(String(num).padStart(3, '0') + '-') || f.startsWith(num + '-'));
          if (reportFile) {
            const safe = resolveSafeReportPath(reportFile);
            if (safe) {
              const content = await fs.readFile(safe, 'utf8');
              const m = content.match(/\*\*URL[^:*]*:\*\*\s*(https?:\/\/[^\s|]+)/);
              url = m ? m[1].trim() : null;
            }
          }
        }
        if (url) queue.push({ num: String(num), company: app.company, role: app.role, url });
      }
      if (!queue.length) return sendJsonError(res, 400, 'no valid URLs found in reports');

      const safeMode = mode === 'manual' ? 'manual' : 'auto';
      autoApplyState = { active: true, mode: safeMode, queue, current: null, completed: [], startedAt: new Date().toISOString(), stoppable: true };
      setFastPolling(true);

      runAutoApply().catch(err => {
        autoApplyState.active = false;
        setFastPolling(false);
        console.error('Auto-apply error:', err.message);
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, queued: queue.length }));
    } catch (err) {
      sendJsonError(res, 400, 'auto-apply failed to start', err);
    }
    return;
  }

  // ── API: Auto-apply status ──
  if (pathname === '/api/auto-apply/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      active: autoApplyState.active,
      mode: autoApplyState.mode,
      current: autoApplyState.current,
      completed: autoApplyState.completed,
      remaining: autoApplyState.queue.length,
      startedAt: autoApplyState.startedAt,
    }));
    return;
  }

  // ── API: Auto-apply stop ──
  if (pathname === '/api/auto-apply/stop' && req.method === 'POST') {
    autoApplyState.stoppable = false;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── API: Autopilot toggle ──
  if (pathname === '/api/autopilot/toggle' && req.method === 'POST') {
    if (autopilotState.running) {
      autopilotState.running = false;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, running: false }));
    } else {
      runAutopilot().catch(err => console.error('Autopilot crash:', err.message));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, running: true }));
    }
    return;
  }

  // ── API: Autopilot status ──
  if (pathname === '/api/autopilot/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      running: autopilotState.running,
      applied: autopilotState.applied,
      failed: autopilotState.failed,
      skipped: autopilotState.skipped,
      cycles: autopilotState.cycles,
      currentCompany: autopilotState.currentCompany,
      currentStep: autopilotState.currentStep,
      startedAt: autopilotState.startedAt,
      log: autopilotState.log.slice(-50),
    }));
    return;
  }

  // ── API: Manual apply queue (view + clear) ──
  if (pathname === '/api/autopilot/manual') {
    if (req.method === 'GET') {
      let manualData = { nums: [], reasons: {} };
      try {
        const raw = await fs.readFile(AUTOPILOT_MANUAL_FILE, 'utf8');
        manualData = JSON.parse(raw);
      } catch {}
      // Enrich with app info from tracker + URL from report file
      const apps = await loadData().then(d => d.applications).catch(() => []);
      const reportFiles = await fs.readdir(REPORTS_DIR).catch(() => []);
      const enriched = await Promise.all((manualData.nums || []).map(async num => {
        const app = apps.find(a => String(a.num) === String(num));
        // Extract URL from report file
        let url = null;
        let reportLink = app?.reportLink || '';
        if (!reportLink) {
          // fallback: find by num prefix
          const rf = reportFiles.find(f => f.startsWith(String(num).padStart(3, '0') + '-') || f.startsWith(num + '-'));
          reportLink = rf ? 'reports/' + rf : '';
        }
        if (reportLink) {
          try {
            const rContent = await fs.readFile(path.join(ROOT, reportLink), 'utf8');
            const m = rContent.match(/\*\*URL[^:*]*:\*\*\s*(https?:\/\/[^\s|]+)/);
            if (m) url = m[1].trim();
          } catch {}
        }
        return {
          num,
          company: app?.company || '?',
          role: app?.role || '?',
          score: app?.score || '?',
          reason: (manualData.reasons || {})[num] || 'needs manual apply',
          url,
          reportLink,
        };
      }));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ queue: enriched }));
      return;
    }
    if (req.method === 'DELETE') {
      // Clear a specific num from the manual queue: DELETE /api/autopilot/manual?num=32
      const num = urlObj.searchParams.get('num');
      if (num) {
        try {
          const raw = await fs.readFile(AUTOPILOT_MANUAL_FILE, 'utf8');
          const data = JSON.parse(raw);
          data.nums = (data.nums || []).filter(n => n !== String(num));
          if (data.reasons) delete data.reasons[String(num)];
          await fs.writeFile(AUTOPILOT_MANUAL_FILE, JSON.stringify(data, null, 2), 'utf8');
        } catch {}
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
  }

  // ── API: Pipeline status ──
  if (pathname === '/api/pipeline/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(getPipelineStatus()));
    return;
  }

  // ── Gmail OAuth: Init ──
  // If credentials are configured, redirect to Google's consent screen.
  // Otherwise, render an actually-helpful setup page (not a wall of code).
  if (pathname === '/auth/gmail') {
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
      const missing = [
        GMAIL_CLIENT_ID ? null : 'GMAIL_CLIENT_ID',
        GMAIL_CLIENT_SECRET ? null : 'GMAIL_CLIENT_SECRET',
      ].filter(Boolean);
      const redirect = GMAIL_REDIRECT_URI;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>JobSeeker — Gmail Setup</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    font: 15px/1.55 -apple-system, system-ui, "Segoe UI", sans-serif;
    background: #000; color: #f5f5f7; margin: 0;
    min-height: 100vh; display: grid; place-items: start center; padding: 48px 20px;
  }
  .card {
    width: 100%; max-width: 640px;
    background: rgba(28,28,32,.72); border: .5px solid rgba(255,255,255,.08);
    border-radius: 16px; padding: 32px;
    box-shadow: 0 10px 40px rgba(0,0,0,.4);
  }
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 6px; letter-spacing: -.01em; }
  .sub { color: #a1a1a6; font-size: 14px; margin-bottom: 24px; }
  ol { padding-left: 22px; margin: 0 0 24px; }
  ol li { margin-bottom: 14px; line-height: 1.6; }
  ol li code { background: #1c1c1f; color: #f5f5f7; padding: 2px 7px; border-radius: 5px; font-size: 13px; }
  a { color: #28b8ff; text-decoration: none; font-weight: 500; }
  a:hover { text-decoration: underline; }
  .copy-row {
    display: flex; align-items: stretch; gap: 8px; margin: 8px 0 0;
    background: #0a0a0c; border: .5px solid rgba(255,255,255,.08);
    border-radius: 8px; overflow: hidden;
  }
  .copy-val {
    flex: 1; font: 13px/1.4 ui-monospace, "SF Mono", monospace;
    padding: 10px 12px; color: #f5f5f7; user-select: all; word-break: break-all;
  }
  .copy-btn {
    border: none; background: rgba(40,184,255,.10); color: #28b8ff;
    padding: 0 14px; font-size: 13px; font-weight: 600; cursor: pointer;
    transition: background .15s;
  }
  .copy-btn:hover { background: rgba(40,184,255,.18); }
  .copy-btn.copied { background: rgba(48,209,88,.18); color: #30d158; }
  .alert {
    background: rgba(255,159,10,.08); border: .5px solid rgba(255,159,10,.30);
    border-radius: 10px; padding: 12px 14px; margin-bottom: 20px;
    font-size: 13px; color: #ffd082;
  }
  .alert strong { color: #ff9f0a; }
  pre {
    background: #0a0a0c; border: .5px solid rgba(255,255,255,.08);
    padding: 14px; border-radius: 10px;
    font: 13px/1.6 ui-monospace, "SF Mono", monospace;
    overflow-x: auto; margin: 8px 0 0;
  }
  .btn-back {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 10px 16px; border-radius: 8px;
    background: rgba(255,255,255,.06); color: #f5f5f7;
    text-decoration: none; font-size: 13px; font-weight: 500;
    transition: background .15s;
  }
  .btn-back:hover { background: rgba(255,255,255,.10); text-decoration: none; }
  .scope-pill {
    display: inline-block; padding: 2px 9px; border-radius: 999px;
    background: rgba(48,209,88,.10); color: #30d158;
    font-size: 11px; font-weight: 600; letter-spacing: .02em;
  }
</style></head><body>
<div class="card">
  <h1>Connect Gmail to JobSeeker</h1>
  <p class="sub">We watch for recruiter replies, interview invites, and verification codes — never message bodies past 7&nbsp;days.</p>

  <div class="alert"><strong>Setup required.</strong> Missing: ${missing.map(m => `<code>${m}</code>`).join(' and ')} in your <code>.env</code> file.</div>

  <ol>
    <li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console → Credentials</a> in a new tab.</li>
    <li>Create a project (or pick one) and click <strong>+ Create Credentials → OAuth client ID</strong>. App type: <strong>Web application</strong>.</li>
    <li>Under <strong>Authorized redirect URIs</strong>, add this exact value:
      <div class="copy-row">
        <div class="copy-val" id="redirect-uri">${redirect}</div>
        <button class="copy-btn" data-copy-target="redirect-uri">Copy</button>
      </div>
    </li>
    <li>Enable the Gmail API: <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener">cloud.google.com → Gmail API → Enable</a>.</li>
    <li>Copy the generated Client ID + Client Secret into your <code>.env</code> at the project root:
<pre id="env-snippet">GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REDIRECT_URI=${redirect}</pre>
      <div class="copy-row" style="margin-top:8px"><div class="copy-val">.env</div><button class="copy-btn" data-copy-target="env-snippet">Copy block</button></div>
    </li>
    <li>Restart the dashboard, then click <a href="/auth/gmail">Connect Gmail</a> again — it will redirect to Google's consent screen.</li>
  </ol>

  <p style="font-size: 12px; color: #6e6e73; margin: 16px 0 24px">
    Scope requested: <span class="scope-pill">gmail.readonly</span> · We can read messages but never send, reply, or delete from your account.
  </p>

  <a class="btn-back" href="/">← Back to dashboard</a>
</div>
<script>
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.dataset.copyTarget;
      const text = document.getElementById(targetId).textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
        const orig = btn.textContent;
        btn.textContent = '✓ Copied';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
      } catch {
        btn.textContent = 'Press ⌘C';
      }
    });
  });
</script>
</body></html>`);
      return;
    }
    const authUrl = getAuthUrl('dashboard');
    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  // ── Gmail OAuth: Callback ──
  if (pathname === '/auth/gmail/callback') {
    const code = urlObj.searchParams.get('code');
    const error = urlObj.searchParams.get('error');
    if (error || !code) {
      res.writeHead(302, { Location: '/?gmail=error' });
      res.end();
      return;
    }
    try {
      await exchangeCode(code);
      startGmailPolling();
      res.writeHead(302, { Location: '/?gmail=connected' });
    } catch {
      res.writeHead(302, { Location: '/?gmail=error' });
    }
    res.end();
    return;
  }

  // ── API: Get report URL ──
  if (pathname === '/api/report-url' && req.method === 'POST') {
    try {
      const { num } = await readJsonBody(req);
      if (!/^\d{1,5}$/.test(String(num))) return sendJsonError(res, 400, 'num required (digits only)');

      const files = await fs.readdir(REPORTS_DIR).catch(() => []);
      const reportFile = files.find(f => f.startsWith(String(num).padStart(3, '0') + '-') || f.startsWith(num + '-'));
      if (!reportFile) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, url: null, reason: 'no-report' }));
        return;
      }

      const safe = resolveSafeReportPath(reportFile);
      if (!safe) return sendJsonError(res, 400, 'invalid report path');

      const content = await fs.readFile(safe, 'utf8');
      const match = content.match(/\*\*URL[^:*]*:\*\*\s*(https?:\/\/[^\s|]+)/);
      const url = match ? match[1].trim() : null;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, url, file: reportFile }));
    } catch (err) {
      sendJsonError(res, 400, 'report-url lookup failed', err);
    }
    return;
  }

  // ── API: Apply (mark as Applied) ──
  if (pathname === '/api/apply' && req.method === 'POST') {
    try {
      const { nums } = await readJsonBody(req);
      if (!Array.isArray(nums) || !nums.length) return sendJsonError(res, 400, 'nums array required');
      if (nums.length > 500) return sendJsonError(res, 400, 'too many nums (max 500)');

      const applied = [], errors = [];
      for (const num of nums) {
        if (!/^\d{1,5}$/.test(String(num))) {
          errors.push({ num, error: 'invalid num' });
          continue;
        }
        try {
          await updateApplicationStatus(String(num), 'Applied');
          applied.push(num);
        } catch (err) {
          console.error('[api 400] apply failed:', err.message);
          errors.push({ num, error: 'update failed' });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: errors.length === 0, applied, errors }));
    } catch (err) {
      sendJsonError(res, 400, 'apply failed', err);
    }
    return;
  }

  // ── API: Health check ──
  // Lightweight liveness probe for Docker HEALTHCHECK / load balancers.
  // Never touches disk or external services; just proves the event loop
  // is alive. Returns 200 + uptime so monitors can graph it.
  if (pathname === '/api/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({
      ok: true,
      uptime: Math.round(process.uptime()),
      version: '1.3.0',
      now: new Date().toISOString(),
    }));
    return;
  }

  // ── API: Setup status ──
  if (pathname === '/api/setup-status') {
    // Parallel — two independent file-existence checks (Vercel `async-parallel`).
    const [cvExists, profileExists] = await Promise.all([
      fs.access(path.join(ROOT, 'cv.md')).then(() => true).catch(() => false),
      fs.access(path.join(CONFIG_DIR, 'profile.yml')).then(() => true).catch(() => false),
    ]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cvExists, profileExists }));
    return;
  }

  // ── API: PDF status (poll while wizard is finalizing) ──
  if (pathname === '/api/onboard/pdf-status') {
    if (lastPdfGenError) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ready: false, error: lastPdfGenError }));
      return;
    }
    // Check the candidate PDF filenames for a fresh mtime.
    const candidates = [
      path.join(ROOT, 'output', 'tony-walteur-cv.pdf'),
    ];
    // Also check kebab-case based on current profile.yml full_name
    try {
      const yml = await fs.readFile(path.join(CONFIG_DIR, 'profile.yml'), 'utf8');
      const m = yml.match(/full_name:\s*"([^"]+)"/);
      if (m) {
        const slug = m[1].toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
        if (slug) candidates.unshift(path.join(ROOT, 'output', `${slug}-cv.pdf`));
      }
    } catch {}
    let ready = false;
    for (const p of candidates) {
      try {
        const st = await fs.stat(p);
        if (st.mtimeMs >= (lastPdfGenStart || 0)) { ready = true; break; }
      } catch {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ready, since: lastPdfGenStart || null }));
    return;
  }

  // ── API: Profile summary (so wizard can detect existing data) ──
  if (pathname === '/api/onboard/profile-summary') {
    const profilePath = path.join(CONFIG_DIR, 'profile.yml');
    let yml = '';
    try { yml = await fs.readFile(profilePath, 'utf8'); } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ exists: false }));
      return;
    }
    const summary = parseProfileSummary(yml);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(summary));
    return;
  }

  // ── API: Onboard (resume drop → cv.md + profile.yml — no AI needed) ──
  if (pathname === '/api/onboard' && req.method === 'POST') {
    try {
      const { text } = await readJsonBody(req);
      if (!text || typeof text !== 'string' || text.trim().length < 80) {
        return sendJsonError(res, 400, 'Resume text too short — paste the full text.');
      }
      if (text.length > 200_000) {
        return sendJsonError(res, 400, 'Resume text too long.');
      }

      const profile = extractProfileFromResume(text);

      const cvHeader = profile.full_name ? `# ${profile.full_name}\n\n` : '# Resume\n\n';
      await fs.writeFile(path.join(ROOT, 'cv.md'), cvHeader + text.trim() + '\n', 'utf8');

      // Lightly patch existing profile.yml — the wizard will fully overwrite via
      // /api/onboard/finalize, but this keeps single-shot extraction usable.
      const profilePath = path.join(CONFIG_DIR, 'profile.yml');
      let yml = '';
      try { yml = await fs.readFile(profilePath, 'utf8'); } catch {}
      const patch = (yaml, key, val) => {
        if (!val) return yaml;
        const escaped = String(val).replace(/"/g, '\\"');
        return yaml.replace(new RegExp(`(${key}:\\s*).*`), `$1"${escaped}"`);
      };
      if (yml) {
        if (profile.full_name) yml = patch(yml, 'full_name', profile.full_name);
        if (profile.email) yml = patch(yml, 'email', profile.email);
        if (profile.phone) yml = patch(yml, 'phone', profile.phone);
        if (profile.linkedin) yml = patch(yml, 'linkedin', profile.linkedin);
        if (profile.location) yml = patch(yml, 'location', profile.location);
        await fs.writeFile(profilePath, yml, 'utf8');
      }

      // Did we get anything substantive? Tell the client so the wizard can
      // show a friendly empty-state message rather than auto-advancing into
      // a step full of blank fields.
      const extractedCount =
        (profile.full_name ? 1 : 0) + (profile.email ? 1 : 0) +
        (profile.phone ? 1 : 0) + (profile.linkedin ? 1 : 0) +
        (profile.location ? 1 : 0) + (profile.headline ? 1 : 0);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, profile, extractedCount }));
    } catch (err) {
      sendJsonError(res, 400, 'onboard failed', err);
    }
    return;
  }

  // ── API: Onboard finalize (full structured profile from wizard) ──
  if (pathname === '/api/onboard/finalize' && req.method === 'POST') {
    try {
      const payload = await readJsonBody(req);
      const errors = validateOnboardPayload(payload);
      if (errors.length) return sendJsonError(res, 400, errors[0]);

      // Track this finalize so /api/onboard/pdf-status can tell "still generating"
      // (PDF mtime older than this) from "ready" (mtime newer).
      lastPdfGenStart = Date.now();
      lastPdfGenError = null;

      const yml = serializeProfileYaml(payload);
      const profilePath = path.join(CONFIG_DIR, 'profile.yml');
      // Safety: never silently overwrite an existing profile. Snapshot to
      // profile.yml.bak.{timestamp}, then rotate older backups (keep last 10).
      try {
        const existing = await fs.readFile(profilePath, 'utf8');
        if (existing && existing.length > 0) {
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          await fs.writeFile(`${profilePath}.bak.${stamp}`, existing, 'utf8');
          // GC: keep newest 10 backups, delete older.
          try {
            const dirEntries = await fs.readdir(CONFIG_DIR);
            const baks = dirEntries
              .filter(f => f.startsWith('profile.yml.bak.'))
              .map(f => path.join(CONFIG_DIR, f));
            if (baks.length > 10) {
              const stats = await Promise.all(baks.map(async f => ({ f, m: (await fs.stat(f)).mtimeMs })));
              stats.sort((a, b) => b.m - a.m); // newest first
              for (const { f } of stats.slice(10)) await fs.unlink(f).catch(() => {});
            }
          } catch { /* GC is best-effort */ }
        }
      } catch { /* no existing file — first run */ }
      await fs.writeFile(profilePath, yml, 'utf8');

      // Kick off the resume PDF in the background — don't block the wizard.
      // Track exit code so /api/onboard/pdf-status can surface failures.
      const pdfProc = spawn('node', [path.join(ROOT, 'generate-cv-pdf.mjs')], {
        cwd: ROOT, stdio: 'pipe', detached: false,
      });
      pdfProc.on('error', (e) => { lastPdfGenError = e.message; });
      pdfProc.on('exit', (code) => {
        if (code !== 0 && code !== null) lastPdfGenError = 'generate-cv-pdf.mjs exited ' + code;
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      sendJsonError(res, 400, 'finalize failed', err);
    }
    return;
  }

  // ── Reports ──
  if (pathname.startsWith('/reports/')) {
    const rawName = decodeURIComponent(path.basename(pathname));
    const filepath = resolveSafeReportPath(rawName);
    if (!filepath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Report not found');
      return;
    }
    const filename = path.basename(filepath);
    try {
      const content = await fs.readFile(filepath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
        <title>${filename}</title>
        <style>
          :root{--bg:#000;--surface:#1c1c1e;--surface2:#2c2c2e;--border:rgba(255,255,255,.08);--text:#fff;--text-sec:rgba(255,255,255,.55);--accent:#0a84ff}
          *{box-sizing:border-box;margin:0;padding:0}
          body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;
               max-width:800px;margin:0 auto;padding:40px 24px 80px;line-height:1.7;font-size:14px;-webkit-font-smoothing:antialiased}
          h1,h2,h3{margin-top:1.8em;line-height:1.2;letter-spacing:-.01em}
          h1{font-size:22px;margin-top:0}h2{font-size:18px}h3{font-size:15px;color:var(--text-sec)}
          p{margin-top:.8em;color:var(--text-sec)}
          pre,code{font-family:"SF Mono","Fira Code",ui-monospace,monospace;font-size:13px}
          pre{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;overflow-x:auto;margin-top:1em}
          a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
          hr{border:none;border-top:.5px solid var(--border);margin:28px 0}
          table{border-collapse:collapse;width:100%;margin:1em 0}
          th,td{border:.5px solid var(--border);padding:8px 12px;text-align:left;font-size:13px}
          th{background:var(--surface);color:var(--text-sec);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
          .back{display:inline-flex;align-items:center;gap:6px;margin-bottom:24px;color:var(--accent);font-size:13px}
          strong{color:var(--text)}
        </style>
      </head><body>
        <a class="back" href="/">← Mission Control</a>
        <h1 style="margin-top:0">${filename.replace(/-/g,' ').replace('.md','')}</h1>
        <hr>
        <pre>${content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
      </body></html>`);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Report not found');
    }
    return;
  }

  // ── Main HTML ──
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
}

// ── Autonomous pipeline cycle (scan → eval → CL → assemble) ──────────────────

let pipelineRunning = false;
let pipelineLastRun = null;
let pipelineNextRun = null;
const PIPELINE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function runPipelineCycle() {
  if (pipelineRunning) {
    console.log('[pipeline] Already running — skipping cycle');
    return;
  }
  pipelineRunning = true;
  pipelineLastRun = new Date().toISOString();
  pipelineNextRun = new Date(Date.now() + PIPELINE_INTERVAL_MS).toISOString();
  console.log('[pipeline] Starting autonomous cycle (scan → eval → CL → assemble)...');
  try {
    await new Promise((resolve) => {
      const args = ['jobseeker.mjs', '--model', process.env.CAREER_OPS_MODEL || 'kimi'];
      const p = spawn('node', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      p.stdout.on('data', d => process.stdout.write('[pipeline] ' + d));
      p.stderr.on('data', d => process.stderr.write('[pipeline] ' + d));
      p.on('close', code => {
        console.log(`[pipeline] Cycle complete (exit ${code}) — next run at ${pipelineNextRun}`);
        resolve();
      });
      p.on('error', err => {
        console.error('[pipeline] Spawn error:', err.message);
        resolve();
      });
    });
  } finally {
    pipelineRunning = false;
  }
}

// Expose pipeline status for dashboard
function getPipelineStatus() {
  return { running: pipelineRunning, lastRun: pipelineLastRun, nextRun: pipelineNextRun };
}

// ── Start ─────────────────────────────────────────────────────────────────────

async function start() {
  await loadTokens();
  await loadGmailCache();
  await loadAutopilotLog();
  if (gmailTokens?.refresh_token) startGmailPolling();

  const server = http.createServer(handleRequest);
  server.listen(PORT, HOST, () => {
    const shownHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
    console.log(`JobSeeker Mission Control → http://${shownHost}:${PORT}  (bound to ${HOST})`);
    console.log(`Gmail: ${gmailTokens ? 'connected' : GMAIL_CLIENT_ID ? 'credentials set, not yet authorized' : 'not configured'}`);
    console.log(`Data: ${DATA_DIR} | Reports: ${REPORTS_DIR}`);
    console.log(`Autopilot: trying Visible browser (CAPTCHA-ready)...`);
  });

  // ── Auto-start: Autopilot (applies evaluated jobs automatically) ──
  setTimeout(() => {
    console.log('[autopilot] Auto-starting...');
    runAutopilot().catch(err => console.error('[autopilot] Crash:', err.message));
  }, 15000); // 15s delay: let browser/Playwright initialize after server is up

  // ── Auto-start: Pipeline loop (scan → eval → CL, every 6h) ──
  // Initial cycle after 60s (give the server time to fully start), then every 6h
  setTimeout(() => {
    runPipelineCycle().catch(err => console.error('[pipeline] Startup error:', err.message));
    setInterval(() => runPipelineCycle().catch(err => console.error('[pipeline] Error:', err.message)), PIPELINE_INTERVAL_MS);
  }, 60000);
}

start().catch(err => { console.error('Startup error:', err); process.exit(1); });
