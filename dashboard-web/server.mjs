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

const PORT = Number(process.env.PORT || 4747);
// Bind to loopback by default; opt-in to LAN exposure via HOST=0.0.0.0
const HOST = process.env.HOST || '127.0.0.1';
const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dir, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const REPORTS_DIR = process.env.REPORTS_DIR || path.join(ROOT, 'reports');
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
    const yml = await fs.readFile(path.join(ROOT, 'config', 'profile.yml'), 'utf8');
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
      /* Apple dark mode palette */
      --bg:           #000000;
      --bg-elevated:  #1c1c1e;
      --surface:      #1c1c1e;
      --surface2:     #2c2c2e;
      --surface3:     #3a3a3c;
      --separator:    rgba(255,255,255,.08);
      --separator2:   rgba(255,255,255,.12);
      --text:         #ffffff;
      --text-sec:     rgba(255,255,255,.55);
      --text-ter:     rgba(255,255,255,.35);
      --accent:       #0a84ff;
      --accent-bg:    rgba(10,132,255,.12);
      --accent-ring:  rgba(10,132,255,.35);

      /* Semantic status colors (Apple system palette) */
      --green:   #30d158; --green-bg:  rgba(48,209,88,.1);
      --blue:    #0a84ff; --blue-bg:   rgba(10,132,255,.1);
      --cyan:    #64d2ff; --cyan-bg:   rgba(100,210,255,.1);
      --yellow:  #ffd60a; --yellow-bg: rgba(255,214,10,.1);
      --orange:  #ff9f0a; --orange-bg: rgba(255,159,10,.1);
      --red:     #ff453a; --red-bg:    rgba(255,69,58,.1);
      --purple:  #bf5af2; --purple-bg: rgba(191,90,242,.1);
      --gray:    rgba(255,255,255,.3); --gray-bg: rgba(255,255,255,.06);

      /* Radius */
      --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-xl: 20px;

      /* Typography */
      --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", system-ui, sans-serif;
      --font-mono: "SF Mono", "JetBrains Mono", "Fira Code", ui-monospace, monospace;

      /* Elevation shadows */
      --shadow-sm: 0 1px 3px rgba(0,0,0,.5), 0 1px 2px rgba(0,0,0,.3);
      --shadow-md: 0 4px 16px rgba(0,0,0,.4), 0 1px 3px rgba(0,0,0,.3);
      --shadow-lg: 0 8px 32px rgba(0,0,0,.5);
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

    /* ── Header ── */
    .header {
      background: rgba(28,28,30,.8);
      backdrop-filter: saturate(180%) blur(20px);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      border-bottom: .5px solid var(--separator);
      padding: 0 20px;
      height: 52px;
      display: flex;
      align-items: center;
      gap: 14px;
      position: sticky;
      top: 0;
      z-index: 200;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -.02em;
    }
    .logo-mark {
      width: 26px; height: 26px;
      background: linear-gradient(135deg, #0a84ff, #30d158);
      border-radius: 7px;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(10,132,255,.4);
    }
    .header-spacer { flex: 1; }
    .header-actions {
      display: flex; align-items: center; gap: 10px;
    }
    .last-updated {
      font-size: 12px;
      color: var(--text-ter);
      letter-spacing: -.01em;
    }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px;
      font-size: 13px; font-family: var(--font); font-weight: 500;
      border-radius: var(--r-sm);
      border: none; cursor: pointer;
      transition: opacity .15s, transform .1s;
      white-space: nowrap;
    }
    .btn:active { transform: scale(.97); }
    .btn-ghost {
      background: var(--surface3);
      color: var(--text-sec);
    }
    .btn-ghost:hover { opacity: .8; }
    .btn-primary {
      background: var(--accent);
      color: #fff;
    }
    .btn-primary:hover { opacity: .9; }
    .btn-gmail {
      background: #ffffff;
      color: #1f1f1f;
      font-size: 12px;
      padding: 5px 10px;
    }
    .btn-gmail:hover { opacity: .9; }
    .btn-apply-batch {
      background: linear-gradient(135deg, #ff9f0a, #ff6b00);
      color: #fff;
      font-weight: 700;
      letter-spacing: -.01em;
    }
    .btn-apply-batch:hover { opacity: .9; }

    /* ── Apply modal ── */
    .modal-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.7);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 5000;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
      opacity: 0; pointer-events: none;
      transition: opacity .2s;
    }
    .modal-overlay.open { opacity: 1; pointer-events: all; }
    .modal-content {
      background: var(--bg-elevated);
      border: .5px solid var(--separator2);
      border-radius: var(--r-xl);
      box-shadow: var(--shadow-lg);
      width: 100%; max-width: 700px;
      max-height: 80vh;
      display: flex; flex-direction: column;
      transform: scale(.97) translateY(12px);
      transition: transform .2s;
    }
    .modal-overlay.open .modal-content { transform: none; }
    .modal-header {
      padding: 20px 24px 16px;
      border-bottom: .5px solid var(--separator);
      display: flex; align-items: center; gap: 12px;
      flex-shrink: 0;
    }
    .modal-title { font-size: 17px; font-weight: 700; letter-spacing: -.02em; flex: 1; }
    .modal-close {
      background: var(--surface3); border: none; color: var(--text-sec);
      width: 28px; height: 28px; border-radius: 50%;
      font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .modal-close:hover { color: var(--text); }
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

    /* ── Money filter pill ── */
    .filter-pill.money {
      background: linear-gradient(135deg, rgba(255,214,10,.14), rgba(48,209,88,.10));
      border: .5px solid rgba(255,214,10,.35);
      color: var(--yellow);
      font-weight: 600;
    }
    .filter-pill.money:hover { background: linear-gradient(135deg, rgba(255,214,10,.22), rgba(48,209,88,.16)); }
    .filter-pill.money.active {
      background: linear-gradient(135deg, var(--yellow), #ffaa00);
      color: #1a1a1a;
      border-color: var(--yellow);
      box-shadow: 0 2px 8px rgba(255,214,10,.3);
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
      grid-template-columns: 1fr 340px;
      gap: 0;
      min-height: calc(100vh - 52px);
    }
    .main { padding: 24px; min-width: 0; }
    .sidebar {
      border-left: .5px solid var(--separator);
      display: flex; flex-direction: column;
    }

    /* ── Stats grid ── */
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 10px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--surface);
      border-radius: var(--r-md);
      padding: 14px 16px;
      position: relative;
      overflow: hidden;
      cursor: pointer;
      transition: background .15s;
      border: .5px solid var(--separator2);
    }
    .stat-card:hover { background: var(--surface2); }
    .stat-card.active { background: var(--surface2); border-color: var(--status-color, var(--accent)); }
    .stat-bar {
      position: absolute; top: 0; left: 0; right: 0; height: 2px;
      background: var(--status-color, var(--accent));
      opacity: .8;
    }
    .stat-label {
      font-size: 11px; font-weight: 500;
      color: var(--text-sec);
      text-transform: uppercase;
      letter-spacing: .05em;
      margin-bottom: 6px;
    }
    .stat-value {
      font-size: 30px; font-weight: 700;
      line-height: 1;
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
      padding: 5px 12px;
      font-size: 12px; font-weight: 500; font-family: var(--font);
      border-radius: 20px;
      border: .5px solid var(--separator2);
      background: transparent;
      color: var(--text-sec);
      cursor: pointer;
      transition: all .15s;
    }
    .filter-pill:hover { background: var(--surface2); color: var(--text); }
    .filter-pill.active {
      background: var(--accent-bg);
      border-color: var(--accent-ring);
      color: var(--accent);
    }

    /* ── Table ── */
    .table-card {
      background: var(--surface);
      border-radius: var(--r-lg);
      border: .5px solid var(--separator2);
      overflow: hidden;
      box-shadow: var(--shadow-sm);
    }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      padding: 10px 16px;
      text-align: left;
      font-size: 11px; font-weight: 600;
      color: var(--text-ter);
      text-transform: uppercase;
      letter-spacing: .06em;
      background: var(--surface2);
      border-bottom: .5px solid var(--separator);
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
    }
    thead th:hover { color: var(--text-sec); }
    thead th .sort-arrow { margin-left: 4px; opacity: .5; }
    tbody tr {
      border-bottom: .5px solid var(--separator);
      transition: background .1s;
      cursor: pointer;
    }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: var(--surface2); }
    tbody tr.followup-row { background: rgba(255,159,10,.04); }
    tbody tr.followup-row:hover { background: rgba(255,159,10,.08); }
    td {
      padding: 11px 16px;
      font-size: 13px;
      vertical-align: middle;
    }
    .td-num { color: var(--text-ter); font-size: 11px; font-family: var(--font-mono); }
    .td-company { font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .company-avatar {
      width: 24px; height: 24px; border-radius: 6px;
      background: var(--surface3);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700;
      flex-shrink: 0;
      color: var(--text-sec);
    }
    .td-role { color: var(--text-sec); font-size: 12px; }
    .td-date { color: var(--text-ter); font-size: 11px; font-family: var(--font-mono); white-space: nowrap; }
    .td-notes { color: var(--text-ter); font-size: 11px; max-width: 220px; line-height: 1.4; }
    .td-actions { text-align: right; }

    /* ── Status badges ── */
    .status-badge {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 9px; border-radius: 20px;
      font-size: 11px; font-weight: 600;
      border: .5px solid;
      white-space: nowrap;
      cursor: pointer;
      transition: opacity .15s;
      position: relative;
    }
    .status-badge:hover { opacity: .8; }
    .status-badge::before {
      content: '';
      width: 4px; height: 4px; border-radius: 50%;
      background: currentColor;
    }
    .s-evaluated { color: var(--gray);  background: var(--gray-bg);   border-color: rgba(255,255,255,.15); }
    .s-applied   { color: var(--blue);  background: var(--blue-bg);   border-color: rgba(10,132,255,.25); }
    .s-responded { color: var(--cyan);  background: var(--cyan-bg);   border-color: rgba(100,210,255,.25); }
    .s-interview { color: var(--yellow);background: var(--yellow-bg); border-color: rgba(255,214,10,.25); }
    .s-offer     { color: var(--green); background: var(--green-bg);  border-color: rgba(48,209,88,.25); }
    .s-rejected  { color: var(--red);   background: var(--red-bg);    border-color: rgba(255,69,58,.25); }
    .s-discarded { color: var(--text-ter); background: var(--gray-bg); border-color: var(--separator2); }
    .s-skip      { color: var(--purple);background: var(--purple-bg); border-color: rgba(191,90,242,.25); }

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

    /* ── Score pill ── */
    .score {
      display: inline-block;
      padding: 2px 8px; border-radius: 10px;
      font-size: 12px; font-weight: 700;
      font-variant-numeric: tabular-nums;
      border: .5px solid;
    }
    .score-high { color: var(--green); background: var(--green-bg); border-color: rgba(48,209,88,.25); }
    .score-mid  { color: var(--yellow);background: var(--yellow-bg);border-color: rgba(255,214,10,.25); }
    .score-low  { color: var(--red);   background: var(--red-bg);   border-color: rgba(255,69,58,.25); }

    /* ── Age badge ── */
    .age-badge {
      font-size: 11px; font-variant-numeric: tabular-nums;
      color: var(--text-ter);
    }
    .age-badge.stale { color: var(--orange); font-weight: 600; }

    /* ── Empty + loading states ── */
    .empty {
      padding: 60px 24px;
      text-align: center;
    }
    .empty-icon { font-size: 32px; margin-bottom: 12px; opacity: .4; }
    .empty-title { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
    .empty-sub { font-size: 13px; color: var(--text-sec); }

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
      padding: 18px 16px;
      border-bottom: .5px solid var(--separator);
    }
    .sidebar-section:last-child { border-bottom: none; }
    .sidebar-title {
      font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: .08em;
      color: var(--text-ter);
      margin-bottom: 12px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .sidebar-refresh {
      background: none; border: none; color: var(--accent);
      font-size: 11px; font-family: var(--font);
      cursor: pointer; padding: 0;
    }

    /* ── Gmail connect card ── */
    .gmail-connect-card {
      background: var(--surface2);
      border-radius: var(--r-md);
      padding: 16px;
      text-align: center;
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
      display: flex; align-items: center; gap: 10px;
      padding: 8px 14px; margin-bottom: 8px;
      background: rgba(10,132,255,.06);
      border: .5px solid rgba(10,132,255,.18);
      border-radius: var(--r-lg);
      font-size: 11px; color: var(--text-sec);
    }
    .pipeline-bar-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--blue); flex-shrink: 0;
    }
    .pipeline-bar-dot.idle { background: var(--text-ter); }
    .pipeline-bar-dot.running { animation: pulse 1.5s ease-in-out infinite; }
    .pipeline-bar-label { font-weight: 600; color: var(--blue); margin-right: 2px; }
    .pipeline-bar-label.idle { color: var(--text-ter); }
    .pipeline-bar-next { margin-left: auto; color: var(--text-ter); font-family: var(--font-mono); }
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
      background: rgba(0,0,0,.7); backdrop-filter: blur(12px);
      align-items: center; justify-content: center; padding: 20px;
    }
    .onboard-modal.open { display: flex; }
    .onboard-box {
      background: var(--surface);
      border: .5px solid var(--separator2);
      border-radius: var(--r-xl);
      box-shadow: var(--shadow-lg);
      width: 100%; max-width: 560px;
      max-height: 90vh; overflow-y: auto;
      padding: 28px;
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

    /* ── Apply banner ── */
    .apply-banner {
      display: none;
      background: linear-gradient(135deg, rgba(48,209,88,.08), rgba(10,132,255,.08));
      border: .5px solid rgba(48,209,88,.2);
      border-radius: var(--r-lg);
      padding: 14px 18px;
      margin-bottom: 16px;
      align-items: center; gap: 14px;
    }
    .apply-banner.show { display: flex; }
    .apply-banner-icon { font-size: 24px; flex-shrink: 0; }
    .apply-banner-text { flex: 1; }
    .apply-banner-title { font-size: 14px; font-weight: 700; color: var(--green); letter-spacing: -.01em; }
    .apply-banner-sub { font-size: 12px; color: var(--text-sec); margin-top: 2px; }
    .apply-banner .btn {
      background: var(--green); color: #000; font-weight: 700;
      border: none; white-space: nowrap;
    }
    .apply-banner .btn:hover { opacity: .85; }

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

    /* ── Toast ── */
    .toast {
      position: fixed; bottom: 24px; right: 24px;
      background: var(--surface2);
      border: .5px solid var(--separator2);
      border-radius: var(--r-md);
      padding: 12px 18px;
      font-size: 13px; font-weight: 500;
      box-shadow: var(--shadow-md);
      opacity: 0; transform: translateY(12px) scale(.97);
      transition: opacity .2s, transform .2s;
      pointer-events: none;
      max-width: 300px;
      z-index: 9999;
    }
    .toast.show { opacity: 1; transform: none; }
    .toast-success { border-color: rgba(48,209,88,.3); color: var(--green); }
    .toast-error   { border-color: rgba(255,69,58,.3); color: var(--red); }

    /* ── Report viewer ── */
    .report-btn {
      display: inline-flex; align-items: center;
      color: var(--accent); font-size: 12px;
      text-decoration: none; opacity: .7;
      transition: opacity .15s;
    }
    .report-btn:hover { opacity: 1; }

    /* ── Responsive ── */
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
      .sidebar { border-left: none; border-top: .5px solid var(--separator); }
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
    <button class="btn btn-ghost" id="profile-btn" onclick="openOnboard()" title="Update profile / drop resume">⊕ Profile</button>
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
<div class="onboard-modal" id="onboard-modal">
  <div class="onboard-box">
    <div class="onboard-header">
      <div>
        <div class="onboard-title">Drop Your Resume</div>
        <div class="onboard-sub">AI will scan it, understand who you are, and get to work.</div>
      </div>
      <button class="onboard-close" onclick="closeOnboard()">✕</button>
    </div>

    <!-- Drop zone -->
    <div class="drop-zone" id="drop-zone"
         ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)">
      <input type="file" accept=".txt,.md,.pdf" onchange="handleFileSelect(event)">
      <div class="drop-icon">📄</div>
      <div class="drop-label">Drop your CV here</div>
      <div class="drop-hint">TXT or Markdown — or click to browse</div>
    </div>

    <div class="onboard-divider">or paste text</div>

    <textarea class="onboard-textarea" id="onboard-text"
      placeholder="Paste your resume / CV text here…&#10;&#10;The AI will extract your name, contact info, headline, target roles, skills, and build a clean cv.md for the pipeline."></textarea>

    <div class="onboard-actions">
      <button class="btn btn-ghost" onclick="closeOnboard()">Cancel</button>
      <button class="btn btn-apply-batch" id="onboard-btn" onclick="submitOnboard()">
        <span class="spinner onboard-spinner" id="onboard-spinner"></span>
        <span id="onboard-btn-label">✦ Scan &amp; Setup</span>
      </button>
    </div>

    <div class="onboard-result" id="onboard-result">
      <div class="onboard-result-title">✓ Profile extracted &amp; saved</div>
      <div id="onboard-result-content"></div>
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
      tbody.innerHTML = '<tr><td colspan="10"><div class="empty"><div class="empty-icon">📭</div>' +
        '<div class="empty-title">No applications found</div>' +
        '<div class="empty-sub">Adjust your filters or add URLs to data/pipeline.md</div></div></td></tr>';
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
  async function refreshGmail() {
    try {
      const res = await fetch('/api/gmail/inbox');
      if (res.status === 401) { renderGmailConnect(); return; }
      const data = await res.json();
      renderGmailSignals(data.signals || [], data.scanned_at, data.connected);
    } catch {}
  }

  function renderGmailConnect() {
    const c = document.getElementById('gmail-content');
    const btn = document.getElementById('gmail-header-status');
    if (btn) btn.innerHTML = '<a href="/auth/gmail" class="btn btn-gmail">🔗 Connect Gmail</a>';
    // Keep the connect card visible
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

  function showGmailSetup() {
    alert('Gmail Setup:\\n\\n1. Go to console.cloud.google.com\\n2. Create project → Enable Gmail API\\n3. Create OAuth 2.0 credentials (Web Application)\\n4. Add redirect URI: http://localhost:4747/auth/gmail/callback\\n5. Copy Client ID + Secret to your .env:\\n   GMAIL_CLIENT_ID=...\\n   GMAIL_CLIENT_SECRET=...\\n6. Restart the dashboard container');
  }

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
  function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show toast-' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
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

  /* ── Onboarding / Resume Drop ── */
  function openOnboard() {
    document.getElementById('onboard-modal').classList.add('open');
    document.getElementById('onboard-result').classList.remove('show');
    document.getElementById('onboard-text').value = '';
  }
  function closeOnboard() {
    document.getElementById('onboard-modal').classList.remove('open');
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
      showToast('PDF detected — paste text manually (Ctrl+A, Ctrl+C from your PDF viewer)', 'error');
      return;
    }
    const text = await file.text();
    document.getElementById('onboard-text').value = text;
    document.getElementById('drop-zone').querySelector('.drop-label').textContent = '✓ ' + file.name;
  }

  async function submitOnboard() {
    const text = document.getElementById('onboard-text').value.trim();
    if (text.length < 80) { showToast('Paste your full resume text first', 'error'); return; }

    const btn = document.getElementById('onboard-btn');
    const spinner = document.getElementById('onboard-spinner');
    const label = document.getElementById('onboard-btn-label');
    btn.disabled = true;
    spinner.classList.add('show');
    label.textContent = 'Scanning…';

    try {
      const res = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();

      if (!data.ok) throw new Error(data.error || 'Unknown error');

      const p = data.profile;
      const resultEl = document.getElementById('onboard-result');
      const contentEl = document.getElementById('onboard-result-content');

      contentEl.innerHTML = \`
        <div class="onboard-field"><strong>\${esc(p.full_name || '')}</strong> · \${esc(p.email || '')} · \${esc(p.location || '')}</div>
        <div class="onboard-field" style="margin-top:6px;font-style:italic;color:var(--text-sec)">\${esc(p.headline || '')}</div>
        \${p.target_roles?.length ? \`<div class="onboard-tags" style="margin-top:10px">\${p.target_roles.map(r => \`<span class="onboard-tag">\${esc(r)}</span>\`).join('')}</div>\` : ''}
        \${p.skills?.length ? \`<div class="onboard-tags" style="margin-top:6px">\${p.skills.map(s => \`<span class="onboard-tag" style="background:rgba(48,209,88,.08);color:var(--green);border-color:rgba(48,209,88,.2)">\${esc(s)}</span>\`).join('')}</div>\` : ''}
        <div class="onboard-field" style="margin-top:12px;font-size:11px;color:var(--text-ter)">cv.md and config/profile.yml updated — the pipeline is ready.</div>
      \`;
      resultEl.classList.add('show');
      showToast('Profile saved — pipeline ready!', 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      spinner.classList.remove('show');
      label.textContent = '✦ Scan & Setup';
    }
  }

  // Check setup status on boot — show banner if cv.md missing
  async function checkSetupStatus() {
    try {
      const res = await fetch('/api/setup-status');
      const { cvExists } = await res.json();
      if (!cvExists) {
        const btn = document.getElementById('profile-btn');
        btn.textContent = '⚠ Setup';
        btn.style.color = 'var(--orange)';
        btn.style.borderColor = 'rgba(255,159,10,.4)';
        showToast('No CV found — drop your resume to get started', 'error');
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
        statusText.textContent = s.lastRun ? 'Last: ' + formatRelativeTime(s.lastRun) : 'Idle — starts in ~1m';
        nextEl.textContent = s.nextRun ? 'Next: ' + formatRelativeTime(s.nextRun) : '';
      }
    } catch {}
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

// Bounded body reader for POST endpoints. Aborts at MAX_BODY_BYTES to prevent
// memory exhaustion via unbounded request bodies.
const MAX_BODY_BYTES = 256 * 1024; // 256 KiB — generous for our payloads

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', chunk => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
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

// Path-traversal defense: resolve a report-relative path and verify it stays
// inside REPORTS_DIR. Returns null on traversal attempt or invalid input.
function resolveSafeReportPath(reportRelOrAbs) {
  if (!reportRelOrAbs || typeof reportRelOrAbs !== 'string') return null;
  // Strip URL fragments / query strings users might paste from markdown links
  const clean = reportRelOrAbs.split(/[#?]/)[0];
  // If the input already includes "reports/", strip it for a uniform basename
  const basename = path.basename(clean);
  if (!basename || basename === '.' || basename === '..') return null;
  if (!/^[A-Za-z0-9._-]+$/.test(basename)) return null;
  if (!basename.endsWith('.md')) return null;
  const resolved = path.resolve(REPORTS_DIR, basename);
  const reportsDirResolved = path.resolve(REPORTS_DIR);
  if (!resolved.startsWith(reportsDirResolved + path.sep) && resolved !== reportsDirResolved) {
    return null;
  }
  return resolved;
}

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
  if (pathname === '/auth/gmail') {
    if (!GMAIL_CLIENT_ID) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body style="font-family:system-ui;background:#000;color:#fff;padding:40px;max-width:600px;margin:0 auto">' +
        '<h2>Gmail Setup Required</h2>' +
        '<p style="color:rgba(255,255,255,.6);margin:16px 0">Add these to your <code style="background:#2c2c2e;padding:2px 6px;border-radius:4px">.env</code> file:</p>' +
        '<pre style="background:#1c1c1e;padding:16px;border-radius:8px;font-size:13px;line-height:1.6">' +
        'GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com\n' +
        'GMAIL_CLIENT_SECRET=your-client-secret\n' +
        'GMAIL_REDIRECT_URI=http://localhost:4747/auth/gmail/callback</pre>' +
        '<p style="color:rgba(255,255,255,.4);font-size:13px;margin-top:16px">Then restart the dashboard container.</p>' +
        '<a href="/" style="color:#0a84ff;font-size:13px">← Back to dashboard</a>' +
        '</body></html>');
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

  // ── API: Setup status ──
  if (pathname === '/api/setup-status') {
    const cvExists = await fs.access(path.join(ROOT, 'cv.md')).then(() => true).catch(() => false);
    const profileExists = await fs.access(path.join(ROOT, 'config', 'profile.yml')).then(() => true).catch(() => false);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cvExists, profileExists }));
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

      const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      const linkedinMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);

      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      let fullName = '';
      for (const line of lines.slice(0, 5)) {
        const clean = line.replace(/^#+\s*/, '').replace(/\*+/g, '').trim();
        if (clean.length > 2 && clean.length < 60 && /^[A-Z]/.test(clean) && !clean.includes('@') && !clean.includes('http')) {
          fullName = clean; break;
        }
      }

      let headline = '';
      const headlineKw = /director|head|manager|engineer|architect|lead|chief|vp|president|consultant|strategist/i;
      for (const line of lines.slice(0, 10)) {
        const clean = line.replace(/^#+\s*/, '').replace(/\*+/g, '').trim();
        if (clean !== fullName && headlineKw.test(clean) && clean.length < 120) {
          headline = clean; break;
        }
      }

      const profile = {
        full_name: fullName,
        email: emailMatch ? emailMatch[0] : '',
        phone: phoneMatch ? phoneMatch[0] : '',
        linkedin: linkedinMatch ? linkedinMatch[0] : '',
        headline,
      };

      const cvHeader = fullName ? `# ${fullName}\n\n` : '# Resume\n\n';
      await fs.writeFile(path.join(ROOT, 'cv.md'), cvHeader + text.trim() + '\n', 'utf8');

      const profilePath = path.join(ROOT, 'config', 'profile.yml');
      let yml = '';
      try { yml = await fs.readFile(profilePath, 'utf8'); } catch {}

      const patch = (yaml, key, val) => {
        if (!val) return yaml;
        const escaped = val.replace(/"/g, '\\"');
        return yaml.replace(new RegExp(`(${key}:\\s*).*`), `$1"${escaped}"`);
      };

      if (yml) {
        if (profile.full_name) yml = patch(yml, 'full_name', profile.full_name);
        if (profile.email) yml = patch(yml, 'email', profile.email);
        if (profile.phone) yml = patch(yml, 'phone', profile.phone);
        if (profile.linkedin) yml = patch(yml, 'linkedin', profile.linkedin);
        await fs.writeFile(profilePath, yml, 'utf8');
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        profile: {
          full_name: profile.full_name,
          email: profile.email,
          headline: profile.headline,
          location: '',
        },
      }));
    } catch (err) {
      sendJsonError(res, 400, 'onboard failed', err);
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
