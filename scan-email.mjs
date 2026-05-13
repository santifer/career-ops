#!/usr/bin/env node

/**
 * scan-email.mjs — Zero-token job-alert ingestion via Gmail IMAP
 *
 * Reads job-alert emails forwarded to a Gmail label (default
 * "career-ops/alerts"), extracts job posting URLs from the message
 * bodies, applies the same title filter and dedup as scan.mjs, and
 * appends new offers to data/pipeline.md.
 *
 * Designed for platforms that block direct scraping: LinkedIn,
 * BuiltIn, Wellfound (AngelList), Otta. The user sets up email
 * alerts on each platform and a Gmail filter that labels incoming
 * alert messages — this script does the rest.
 *
 * Setup: see scripts/EMAIL_SETUP.md
 *
 * Usage:
 *   node scan-email.mjs                # process labelled inbox
 *   node scan-email.mjs --dry-run      # preview without writing
 *   node scan-email.mjs --label=name   # use a different label
 *   node scan-email.mjs --keep-unread  # don't mark messages read
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { resolveUrls } from './lib/resolve-ats-url.mjs';

const parseYaml = yaml.load;

const PORTALS_PATH = 'portals.yml';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';
const SECRETS_PATH = join(homedir(), '.career-ops-secrets');

mkdirSync('data', { recursive: true });

// ── Secrets ────────────────────────────────────────────────────────

function loadSecrets() {
  if (!existsSync(SECRETS_PATH)) {
    throw new Error(`Secrets file missing: ${SECRETS_PATH} — see scripts/EMAIL_SETUP.md`);
  }
  const out = {};
  for (const line of readFileSync(SECRETS_PATH, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  for (const k of ['GMAIL_USER', 'GMAIL_APP_PASSWORD']) {
    if (!out[k]) throw new Error(`Missing key in secrets: ${k}`);
  }
  return out;
}

// ── Email body → job URLs ──────────────────────────────────────────

// LinkedIn post URLs and link shorteners. When these appear in an alert
// email (e.g., when you follow Noah G with bell notifications and he
// shares a job posting), we follow them to discover the underlying ATS
// URL. Posts hide their JD links behind LinkedIn's tracking redirects.
const LINKEDIN_REDIRECT_PATTERNS = [
  /https?:\/\/(?:www\.)?lnkd\.in\/[\w-]+/i,
  /https?:\/\/(?:www\.)?linkedin\.com\/redir\/redirect\?url=[^"'\s<>]+/i,
];

const LINKEDIN_POST_PATTERNS = [
  /https?:\/\/(?:www\.)?linkedin\.com\/posts\/[\w_-]+/i,
  /https?:\/\/(?:www\.)?linkedin\.com\/feed\/update\/urn:li:activity:\d+/i,
];

// Recognized job-board URL patterns. Generic — catches most platforms
// without requiring per-platform parsers. Add new patterns here as
// platforms surface. Each pattern is matched case-insensitively.
//
// Coverage map (kept in sync with scripts/gmail-filters.xml):
//   Tier 1 mainstream: LinkedIn, Indeed, Glassdoor, ZipRecruiter
//   Tier 2 AI/startup: BuiltIn, Wellfound, Otta, Welcome to the Jungle
//   Niche comms/editorial: Mediabistro, WorkingInContent, PRSA, Ragan,
//                           IABC, JournalismJobs, MarketingHire,
//                           Communications Network, Idealist
//   Gig/freelance: Upwork, Fiverr, Contra, Freelancer
//   ATS direct (when alerts embed ATS URLs): Greenhouse, Ashby, Lever,
//                                              Workable, Amazon Jobs
const JOB_URL_PATTERNS = [
  // ── Mainstream ─────────────────────────────────────────────────
  /linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i,
  /indeed\.com\/(?:viewjob|cmp\/[\w.-]+\/jobs\/[\w-]+|rc\/clk\?jk=[\w]+)/i,
  /indeed\.com\/q-[\w-]+-l-[\w%,-]+\/jobs/i,
  // Glassdoor removed: 403 bot-detection blocks all automated fetches — URLs enter
  // the pipeline but fail liveness every time, wasting triage slots. See 2026-05-09.
  // /glassdoor\.com\/(?:job-listing|partner\/jobListing\.htm|Job\/)/i,
  /ziprecruiter\.com\/(?:jobs|c\/[\w-]+\/Job)\/[\w-]+/i,

  // ── AI / startup ──────────────────────────────────────────────
  /builtin(?:la|nyc|sf|seattle|chicago|austin|boston)?\.com\/job\/[\w-]+/i,
  /wellfound\.com\/jobs\/[\w-]+/i,
  /angel\.co\/company\/[\w-]+\/jobs\/[\w-]+/i,
  /otta\.com\/jobs\/[\w-]+/i,
  /welcometothejungle\.com\/[\w-/]+\/jobs\/[\w-]+/i,
  /hired\.com\/jobs\/[\w-]+/i,

  // ── Niche comms / editorial / journalism / content ────────────
  /mediabistro\.com\/jobs\/(?:job-detail|description|view)\/[\w-]+/i,
  /workingincontent\.com\/jobs\/[\w-]+/i,
  /jobs\.prsa\.org\/(?:jobseeker|jobs)\/[\w-]+/i,
  /careers\.ragan\.com\/jobseeker\/job\/[\w-]+/i,
  /talenthub\.ragan\.com\/[\w-]+/i,
  /jobs\.iabc\.com\/(?:jobseeker|jobs)\/[\w-]+/i,
  /journalismjobs\.com\/[\w-]+\/[\w-]+/i,
  /marketinghire\.com\/(?:jobs|job)\/[\w-]+/i,
  /jobs\.comnetwork\.org\/[\w-]+/i,
  /idealist\.org\/(?:en\/)?(?:nonprofit-job|job|jobs)\/[\w-]+/i,

  // ── Gig / freelance ───────────────────────────────────────────
  /upwork\.com\/(?:jobs|freelance-jobs|job)\/[\w~-]+/i,
  /fiverr\.com\/(?:[\w-]+\/[\w-]+|gig\/[\w-]+)/i,
  /contra\.com\/projects?\/[\w-]+/i,
  /freelancer\.com\/(?:projects|jobs)\/[\w-]+/i,

  // ── ATS direct (alerts often embed; dedup handles overlap) ────
  /(?:job-boards|boards)\.greenhouse\.io\/[\w-]+\/jobs\/\d+/i,
  /jobs\.ashbyhq\.com\/[\w-]+\/[\w-]+/i,
  /jobs\.lever\.co\/[\w-]+\/[\w-]+/i,
  /(?:apply|jobs)\.workable\.com\/[\w-]+\/[\w-]+/i,
  /amazon\.jobs\/(?:en\/)?jobs\/\d+/i,
  /[\w-]+\.wd\d+\.myworkdayjobs\.com\/[\w-/]+/i,
];

// URL canonicalization — strip tracking params so the same job seen via
// multiple emails dedupes correctly. Platform-specific normalization for
// IDs that should fully specify the posting.
function canonicalize(url) {
  // LinkedIn: keep /jobs/view/{id}
  const liMatch = url.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i);
  if (liMatch) return `https://www.linkedin.com/jobs/view/${liMatch[1]}`;

  // Indeed: keep ?jk={id} which is the canonical job key, drop other params
  const indeedJk = url.match(/indeed\.com\/[^?]*\?[^#]*\bjk=([\w]+)/i);
  if (indeedJk) return `https://www.indeed.com/viewjob?jk=${indeedJk[1]}`;

  // Glassdoor: disabled — 403 bot-detection, see JOB_URL_PATTERNS comment above

  // Greenhouse: keep board + numeric id; strip everything else
  const ghMatch = url.match(/(?:job-boards|boards)\.greenhouse\.io\/([\w-]+)\/jobs\/(\d+)/i);
  if (ghMatch) return `https://job-boards.greenhouse.io/${ghMatch[1]}/jobs/${ghMatch[2]}`;

  // Default: drop query string + fragment (most tracking lives there)
  return url.split('?')[0].split('#')[0];
}

function extractJobUrls(body) {
  // Pull every href and every bare URL, filter to job-like patterns.
  const urls = new Set();

  // <a href="..."> from HTML bodies
  for (const m of body.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const url = decodeUrl(m[1]);
    if (JOB_URL_PATTERNS.some(p => p.test(url))) urls.add(canonicalize(url));
  }

  // Bare URLs in plaintext bodies
  for (const m of body.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    const url = decodeUrl(m[0]);
    if (JOB_URL_PATTERNS.some(p => p.test(url))) urls.add(canonicalize(url));
  }

  return [...urls];
}

// Extract LinkedIn-redirect URLs (lnkd.in shorteners + linkedin.com/redir
// + linkedin.com/posts pages). These need follow-through to surface the
// real ATS URL. Returns array of unique URLs.
function extractLinkedInRedirectUrls(body) {
  const urls = new Set();
  const allPatterns = [...LINKEDIN_REDIRECT_PATTERNS, ...LINKEDIN_POST_PATTERNS];
  for (const m of body.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const url = decodeUrl(m[1]);
    if (allPatterns.some(p => p.test(url))) urls.add(url.split('?utm_')[0]);
  }
  for (const m of body.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    const url = decodeUrl(m[0]);
    if (allPatterns.some(p => p.test(url))) urls.add(url.split('?utm_')[0]);
  }
  return [...urls];
}

// Curator-mentions log — append-only record of "Role @ Company" pairs
// surfaced from LinkedIn post-style emails. Useful when a curator (e.g.,
// Noah Greenberg @ Stacker) posts a list of editorial / content / comms
// roles by name. Lets us track which mentions are already covered by a
// portals.yml entry vs. which point at companies we haven't added yet.
const CURATOR_LOG_PATH = 'data/curator-mentions.md';

// Senders worth scanning for curator-style "Role @ Company" lists. Add
// more as you start following more curators with bell notifications.
const CURATOR_SENDERS = [
  /noahg/i,                   // Noah Greenberg posts (Stacker / cited2026.com)
  /commsjobs/i,               // Leah Rosenfeld's #commsjobs digest
  /content-?strategy/i,
];

// Parse "Role @ Company" pairs from a LinkedIn-post style body. The
// pattern matches lines like:
//   "Managing Editor @ Coinbase"                                    (bare)
//   "Editorial Manager @ NVIDIA ($136k - $218k / year)"             (with comp)
//   "Editorial Manager @ NVIDIA ($136k - $218k / year) - https://…" (with comp + URL)
//   "Executive Editorial Lead @ Plaid ($193k - $268k / year)"
//     "- https://lnkd.in/ezZzPrD8"                                  (URL on next line)
// Tolerant of HTML tags, decorative emoji, and bullet markers.
// Returns: [{ role, company, comp?, url? }, ...]
function extractCuratorMentions(textOrHtml) {
  if (!textOrHtml) return [];
  // Strip HTML tags, decode entities, drop zero-width chars
  const text = textOrHtml
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[​-‍﻿]/g, '');
  const lines = text.split('\n');
  const out = [];
  // Capture: role @ company, optional (salary), optional - URL.
  //   group 1: role
  //   group 2: company (terminates at first '(' or ' -' or EOL)
  //   group 3: comp inside parens (optional)
  //   group 4: URL (optional, same-line)
  const re = /^[\s•*\-–—]*([A-Z][A-Za-z0-9 ,&/.'’\-]{5,}?)\s+@\s+([A-Z][A-Za-z0-9 &./'’\-]+?)(?:\s*\(([^)]+)\))?(?:\s*[-–—]\s*(https?:\/\/\S+))?\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    const role = m[1].trim();
    const company = m[2].trim();
    const comp = m[3] ? m[3].trim() : '';
    let url = m[4] ? m[4].trim().replace(/[.,]$/, '') : '';
    // Sanity guards
    if (role.length < 6 || company.length < 2) continue;
    if (/^https?:/.test(role) || /^https?:/.test(company)) continue;
    if (/[@,]$/.test(company)) continue;
    // If URL not on same line, look one or two lines down for a leading-dash
    // URL line ("- https://lnkd.in/...") — Noah Greenberg's format.
    if (!url) {
      for (let look = 1; look <= 2; look++) {
        const next = (lines[i + look] || '').trim();
        const nextMatch = next.match(/^[-–—]\s*(https?:\/\/\S+)/);
        if (nextMatch) { url = nextMatch[1].replace(/[.,]$/, ''); break; }
        if (next.length > 0 && !next.startsWith('-')) break;
      }
    }
    out.push({ role, company, comp, url });
  }
  return out;
}

// Check if a company is already tracked in portals.yml (case-insensitive
// substring match against the company.name field).
let _portalsCompanyCache = null;
function isCompanyTracked(companyName) {
  if (_portalsCompanyCache === null) {
    try {
      const raw = readFileSync(PORTALS_PATH, 'utf-8');
      const cfg = parseYaml(raw);
      _portalsCompanyCache = (cfg.tracked_companies || [])
        .filter(c => c.enabled !== false)
        .map(c => (c.name || '').toLowerCase());
    } catch { _portalsCompanyCache = []; }
  }
  const target = companyName.toLowerCase().trim();
  return _portalsCompanyCache.some(name =>
    name === target || name.includes(target) || target.includes(name)
  );
}

// Append curator mentions to data/curator-mentions.md. Idempotent —
// existing rows with same (date, curator, company, role) are deduped.
function appendCuratorMentions(curator, mentions, date, postUrl) {
  if (mentions.length === 0) return;

  // Read existing log to dedup
  let existing = '';
  if (existsSync(CURATOR_LOG_PATH)) {
    existing = readFileSync(CURATOR_LOG_PATH, 'utf-8');
  } else {
    existing = `# Curator Mentions Log\n\nAppend-only record of "Role @ Company" pairs surfaced from LinkedIn-style alert emails (Noah Greenberg, Leah Rosenfeld's #commsjobs, etc.). Companies marked NOT-TRACKED need to be added to portals.yml for full scanning coverage. Comp and URL columns populated when the curator's post format includes them inline.\n\n| Date | Curator | Company | Role | Comp | Tracked? | Direct URL | Source post |\n|------|---------|---------|------|------|----------|------------|-------------|\n`;
  }

  const lines = [];
  for (const m of mentions) {
    const tracked = isCompanyTracked(m.company);
    const key = `| ${date} | ${escapeMd(curator)} | ${escapeMd(m.company)} | ${escapeMd(m.role)} |`;
    if (existing.includes(key)) continue;  // dedupe
    const trackedCell = tracked ? '✅ tracked' : '⚠️ **not tracked — add to portals.yml**';
    const compCell = m.comp ? escapeMd(m.comp) : '—';
    const directUrlCell = m.url ? `[apply](${m.url})` : '—';
    const sourceCell = postUrl ? `[link](${postUrl})` : '—';
    lines.push(`${key} ${compCell} | ${trackedCell} | ${directUrlCell} | ${sourceCell} |`);
  }
  if (lines.length === 0) return;
  appendFileSync(CURATOR_LOG_PATH, lines.join('\n') + '\n');
}

function escapeMd(s) {
  return (s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// Follow a LinkedIn shortener / post URL and return any ATS-style URLs
// found at the destination. For lnkd.in shorteners this is just an HTTP
// redirect chain — we GET and check res.url. For post URLs we attempt to
// fetch the public-rendered HTML (works for some posts; LinkedIn auth-walls
// many) and pattern-match against ATS hosts in the body. Failures return
// an empty array silently — the post URL stays in the email and the user
// can inspect manually if needed.
async function expandLinkedInUrl(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timer);

    const finalUrl = res.url || url;
    const found = new Set();
    let html = '';

    // Case 1: redirect resolved directly to an ATS URL (most common for lnkd.in)
    if (JOB_URL_PATTERNS.some(p => p.test(finalUrl))) {
      found.add(canonicalize(finalUrl));
    }

    // Case 2: page body contains ATS URLs (LinkedIn post that embeds links)
    if (res.ok) {
      html = await res.text();
      for (const pattern of JOB_URL_PATTERNS) {
        const re = new RegExp(pattern.source, 'gi');
        for (const m of html.matchAll(re)) {
          found.add(canonicalize(m[0]));
        }
      }
    }
    // Return richer shape so callers can also run curator-mention
    // extraction on the page body HTML (e.g., parsing "Role @ Company"
    // lists out of a public LinkedIn post that we successfully fetched).
    return { urls: [...found], html };
  } catch {
    return { urls: [], html: '' };
  }
}

function decodeUrl(url) {
  // Many email clients HTML-encode ampersands. Decode them so URLs match.
  return url
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/');
}

// Extract the title that's nearest to a given URL match in HTML, by
// scanning the surrounding anchor + sibling text. Best-effort — when
// it fails, the title falls back to the URL slug or "(unknown)".
function extractTitleNear(body, url) {
  // Search for <a href="<url>">...</a> and capture the inner text
  const safeUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<a\\b[^>]*\\bhref=["'][^"']*${safeUrl.split('://')[1].slice(0, 40)}[^"']*["'][^>]*>([\\s\\S]{0,300}?)<\\/a>`, 'i');
  const m = body.match(re);
  if (m) {
    // Strip nested HTML, collapse whitespace
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text && text.length > 3 && !/^https?:/.test(text)) return text;
  }
  // Fallback: slug-based guess from URL
  const slugMatch = url.match(/\/(?:jobs?|view)\/([\w-]+)/i);
  if (slugMatch) return slugMatch[1].replace(/[-_]/g, ' ');
  return '(unknown)';
}

// Identify the platform (used for source attribution) from a URL.
function platformOf(url) {
  if (/linkedin\.com/i.test(url)) return 'LinkedIn';
  if (/indeed\.com/i.test(url)) return 'Indeed';
  if (/glassdoor\.com/i.test(url)) return 'Glassdoor';
  if (/ziprecruiter\.com/i.test(url)) return 'ZipRecruiter';
  if (/builtin/i.test(url)) return 'BuiltIn';
  if (/wellfound|angel\.co/i.test(url)) return 'Wellfound';
  if (/otta\.com/i.test(url)) return 'Otta';
  if (/welcometothejungle/i.test(url)) return 'WelcomeToTheJungle';
  if (/mediabistro/i.test(url)) return 'Mediabistro';
  if (/workingincontent/i.test(url)) return 'WorkingInContent';
  if (/prsa\.org/i.test(url)) return 'PRSA';
  if (/ragan/i.test(url)) return 'Ragan';
  if (/iabc\.com/i.test(url)) return 'IABC';
  if (/journalismjobs\.com/i.test(url)) return 'JournalismJobs';
  if (/marketinghire/i.test(url)) return 'MarketingHire';
  if (/comnetwork\.org/i.test(url)) return 'ComNetwork';
  if (/idealist\.org/i.test(url)) return 'Idealist';
  if (/upwork\.com/i.test(url)) return 'Upwork';
  if (/fiverr\.com/i.test(url)) return 'Fiverr';
  if (/contra\.com/i.test(url)) return 'Contra';
  if (/freelancer\.com/i.test(url)) return 'Freelancer';
  if (/greenhouse|ashbyhq|lever|workable|amazon\.jobs|workdayjobs/i.test(url)) return 'ATS';
  return 'email';
}

// ── Title filter (email variant — softer than scan.mjs/scan-rss.mjs) ──

// Email alerts make the title unreliable: anchor text is often generic
// ("View job", "Apply now"), tracking redirects mask the real title, and
// HTML-table layouts split the role title across multiple cells. The
// downstream batch evaluator fetches the real JD via WebFetch + Playwright,
// so we trust the URL+sender combo here and only apply NEGATIVE matches
// (junior/intern/etc.) as a fast reject. Positive title-pattern filtering
// happens at evaluation time, not ingestion time.
function buildTitleFilter(titleFilter) {
  const negative = (titleFilter?.negative || []).map(k => k.toLowerCase());
  return (title) => {
    const lower = (title || '').toLowerCase();
    const hasNegative = negative.some(k => lower.includes(k));
    return !hasNegative;
  };
}

// ── Dedup ──────────────────────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();
  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }
  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const m of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(m[1]);
    }
  }
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const m of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(m[0]);
    }
  }
  return seen;
}

// ── Pipeline / history writers ─────────────────────────────────────

function appendToPipeline(offers) {
  if (offers.length === 0) return;
  let text = readFileSync(PIPELINE_PATH, 'utf-8');
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    const procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block = `\n${marker}\n\n` + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title} | ${new Date().toISOString().slice(0, 10)}`
    ).join('\n') + '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;
    const block = '\n' + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title} | ${new Date().toISOString().slice(0, 10)}`
    ).join('\n') + '\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }
  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(offers, date) {
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n', 'utf-8');
  }
  const lines = offers.map(o =>
    `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded`
  ).join('\n') + '\n';
  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── IMAP ───────────────────────────────────────────────────────────

async function connectImap(secrets) {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: secrets.GMAIL_USER, pass: secrets.GMAIL_APP_PASSWORD },
    logger: false,
  });
  await client.connect();
  return client;
}

async function fetchAlerts(client, label) {
  // Gmail labels appear as folders over IMAP.
  const lock = await client.getMailboxLock(label);
  try {
    // Search for unseen messages only
    const uids = await client.search({ seen: false }, { uid: true });
    if (!uids || uids.length === 0) return [];

    const messages = [];
    for await (const msg of client.fetch(uids, { source: true, envelope: true, uid: true })) {
      // Parse the MIME message so quoted-printable / base64-encoded bodies
      // get decoded. Without this, hrefs come back as `href=3D"..."` and
      // the URL regex extracts zero matches.
      const parsed = await simpleParser(msg.source);
      const body = parsed.html || parsed.textAsHtml || parsed.text || '';
      messages.push({
        uid: msg.uid,
        subject: msg.envelope?.subject || parsed.subject || '',
        from: (msg.envelope?.from || []).map(f => `${f.name || ''} <${f.address || ''}>`).join(', '),
        body,
      });
    }
    return messages;
  } finally {
    lock.release();
  }
}

async function markRead(client, label, uids) {
  if (uids.length === 0) return;
  const lock = await client.getMailboxLock(label);
  try {
    await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
  } finally {
    lock.release();
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const keepUnread = args.includes('--keep-unread');
  const label = args.find(a => a.startsWith('--label='))?.split('=')[1] || 'career-ops/alerts';

  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found.');
    process.exit(1);
  }

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const titleFilter = buildTitleFilter(config.title_filter);
  const secrets = loadSecrets();

  console.log(`Connecting to Gmail IMAP as ${secrets.GMAIL_USER}…`);
  const client = await connectImap(secrets);

  let alerts;
  try {
    alerts = await fetchAlerts(client, label);
  } catch (err) {
    // imapflow raises a generic "Command failed" on missing mailbox.
    // Verify the label exists and show available ones to help debug.
    const folders = await client.list();
    const exists = folders.some(f => f.path === label || f.name === label);
    if (!exists) {
      console.error(`\nLabel "${label}" not found in Gmail.`);
      console.error('Set up the filter first — see scripts/EMAIL_SETUP.md.');
      console.error('\nAvailable labels (top 20):');
      for (const f of folders.slice(0, 20)) {
        console.error(`  - ${f.path}`);
      }
      await client.logout();
      process.exit(1);
    }
    throw err;
  }

  console.log(`Found ${alerts.length} unread message${alerts.length === 1 ? '' : 's'} under label "${label}".`);
  if (dryRun) console.log('(dry run — no files will be written, no messages marked read)\n');

  const seenUrls = loadSeenUrls();
  const date = new Date().toISOString().slice(0, 10);
  let totalUrls = 0;
  let totalFiltered = 0;
  let totalDupes = 0;
  let totalExpanded = 0;
  const newOffers = [];
  const processedUids = [];

  let totalCuratorMentions = 0;
  let totalCuratorUntracked = 0;

  for (const alert of alerts) {
    // First: directly-extractable job URLs from the email
    const directUrls = extractJobUrls(alert.body);

    // Second: LinkedIn redirect / post URLs that hide the real ATS URL —
    // follow them and pull out the underlying job links. Useful for
    // accounts you follow with bell-on (e.g., curators like Noah G).
    const linkedinUrls = extractLinkedInRedirectUrls(alert.body);
    const expandedUrls = [];
    let postBodyHtml = '';
    for (const li of linkedinUrls) {
      const result = await expandLinkedInUrl(li);
      if (Array.isArray(result)) {
        if (result.length > 0) totalExpanded++;
        expandedUrls.push(...result);
      } else if (result && typeof result === 'object') {
        if (result.urls.length > 0) totalExpanded++;
        expandedUrls.push(...result.urls);
        if (result.html) postBodyHtml += result.html;
      }
    }

    // Third: parse curator-style "Role @ Company" mention lists from
    // LinkedIn-post-flavored emails (Noah Greenberg, Leah Rosenfeld, etc.).
    // Try both the email body (excerpt is usually included) AND any
    // post-page HTML we successfully fetched.
    const isCuratorEmail = CURATOR_SENDERS.some(re => re.test(alert.from || ''))
      || CURATOR_SENDERS.some(re => re.test(alert.subject || ''))
      || linkedinUrls.length > 0;
    if (isCuratorEmail) {
      const mentions = [
        ...extractCuratorMentions(alert.body),
        ...extractCuratorMentions(postBodyHtml),
      ];
      // Dedup mentions within this alert
      const seen = new Set();
      const unique = mentions.filter(m => {
        const k = `${m.company.toLowerCase()}::${m.role.toLowerCase()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (unique.length > 0) {
        const curatorName = (alert.from || '').replace(/.*<|>.*/g, '').split('@')[0] || 'unknown';
        const postUrl = linkedinUrls[0] || '';
        appendCuratorMentions(curatorName, unique, date, postUrl);
        totalCuratorMentions += unique.length;
        for (const m of unique) {
          if (!isCompanyTracked(m.company)) totalCuratorUntracked++;
        }
      }
    }

    const allUrls = [...new Set([...directUrls, ...expandedUrls])];
    totalUrls += allUrls.length;

    for (const url of allUrls) {
      const title = extractTitleNear(alert.body, url);
      if (!titleFilter(title)) {
        totalFiltered++;
        continue;
      }
      if (seenUrls.has(url)) {
        totalDupes++;
        continue;
      }
      seenUrls.add(url);
      newOffers.push({
        title,
        url,
        company: '(from email)',
        location: '',
        source: platformOf(url),
      });
    }
    processedUids.push(alert.uid);
  }

  console.log('');
  console.log('━'.repeat(45));
  console.log(`Email Scan — ${date}`);
  console.log('━'.repeat(45));
  console.log(`Messages processed:  ${alerts.length}`);
  console.log(`URLs extracted:      ${totalUrls}`);
  console.log(`LinkedIn URLs followed:  ${totalExpanded} (post / lnkd.in redirects expanded to job URLs)`);
  console.log(`Curator mentions logged: ${totalCuratorMentions} (${totalCuratorUntracked} at companies NOT yet in portals.yml)`);
  console.log(`Filtered by title:   ${totalFiltered} removed`);
  console.log(`Duplicates:          ${totalDupes} skipped`);
  console.log(`New offers added:    ${newOffers.length}`);

  if (newOffers.length > 0) {
    console.log('\nNew offers:');
    for (const o of newOffers.slice(0, 30)) {
      console.log(`  + [${o.source}] ${o.title} — ${o.url}`);
    }
    if (newOffers.length > 30) {
      console.log(`  ... and ${newOffers.length - 30} more`);
    }
  }

  if (!dryRun && newOffers.length > 0) {
    // Resolve LinkedIn jobs/view URLs → canonical ATS URLs before persisting.
    // Non-LinkedIn URLs pass through unchanged. Results are cached in
    // data/url-resolve-cache.tsv so subsequent scans are instant for known IDs.
    const linkedInOffers = newOffers.filter(o => /linkedin\.com\/jobs\/view\//i.test(o.url));
    if (linkedInOffers.length > 0) {
      console.log(`\nResolving ${linkedInOffers.length} LinkedIn URL(s) to canonical ATS URLs...`);
      const urlMap = new Map();
      for await (const { url, resolved, changed } of resolveUrls(linkedInOffers.map(o => o.url), { root: process.cwd(), delayMs: 400 })) {
        urlMap.set(url, resolved);
        if (changed) console.log(`  ✓ ${url.match(/\/(\d+)$/)?.[1]} → ${resolved}`);
      }
      for (const offer of newOffers) {
        if (urlMap.has(offer.url)) offer.url = urlMap.get(offer.url);
      }
    }
    appendToPipeline(newOffers);
    appendToScanHistory(newOffers, date);
    console.log('\nResults saved to data/pipeline.md and data/scan-history.tsv');
  }

  if (!dryRun && !keepUnread && processedUids.length > 0) {
    await markRead(client, label, processedUids);
    console.log(`Marked ${processedUids.length} message${processedUids.length === 1 ? '' : 's'} read.`);
  } else if (dryRun) {
    console.log('\n(dry run — run without --dry-run to save results and mark messages read)');
  }

  await client.logout();
}

main().catch(err => {
  console.error('scan-email error:', err.message);
  process.exit(1);
});
