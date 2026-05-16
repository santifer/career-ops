#!/usr/bin/env node

/**
 * scan-outlook.mjs — Interview invite detection via Microsoft Graph API
 *
 * Reads Outlook email for interview invitations, extracts structured data
 * (company, role, date, meeting link), updates applications.md, creates
 * prep files, and adds calendar events.
 *
 * Zero LLM tokens — pure Microsoft Graph REST API via native fetch.
 * Works with personal outlook.com accounts and enterprise Azure AD tenants.
 *
 * Usage:
 *   node scan-outlook.mjs              # scan last 7 days
 *   node scan-outlook.mjs --dry-run    # preview without writing files
 *   node scan-outlook.mjs --days 14    # scan last N days
 *   node scan-outlook.mjs --auth       # re-run OAuth2 flow
 *
 * Setup:
 *   1. Go to portal.azure.com → App registrations → New registration
 *   2. Name: "career-ops", Supported account types: Personal Microsoft accounts
 *   3. Redirect URI: http://localhost:3001/callback (Web)
 *   4. Copy Application (client) ID → config/profile.yml microsoft.client_id
 *   5. Run: node scan-outlook.mjs --auth
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { createServer } from 'http';
import { parse as parseUrl } from 'url';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────

const PROFILE_PATH      = join(__dirname, 'config/profile.yml');
const PIPELINE_PATH     = join(__dirname, 'data/pipeline.md');
const SCAN_HISTORY_PATH = join(__dirname, 'data/scan-history.tsv');
const APPLICATIONS_PATH = join(__dirname, 'data/applications.md');
const INTERVIEW_PREP_DIR = join(__dirname, 'interview-prep');

const DRY_RUN   = process.argv.includes('--dry-run');
const AUTH_ONLY = process.argv.includes('--auth');
const TODAY     = new Date().toISOString().slice(0, 10);

const daysArg   = process.argv.indexOf('--days');
const _daysParsed = daysArg !== -1 ? parseInt(process.argv[daysArg + 1], 10) : NaN;
const DAYS      = Number.isFinite(_daysParsed) && _daysParsed > 0 ? _daysParsed : 7;
if (daysArg !== -1 && !Number.isFinite(_daysParsed)) console.warn('Warning: invalid --days value, using default 7');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const AUTH_BASE  = 'https://login.microsoftonline.com';
const REDIRECT   = 'http://localhost:3001/callback';
const SCOPES     = 'Mail.Read offline_access';

// ── Load profile config ──────────────────────────────────────────────

function loadProfile() {
  if (!existsSync(PROFILE_PATH)) {
    console.error('ERROR: config/profile.yml not found. Run onboarding first.');
    process.exit(1);
  }
  const profile = yaml.load(readFileSync(PROFILE_PATH, 'utf8'));
  const ms = profile?.microsoft || {};
  if (!ms.client_id) {
    console.error('ERROR: microsoft.client_id not set in config/profile.yml');
    console.error('See setup instructions: node scan-outlook.mjs --help');
    process.exit(1);
  }
  return {
    clientId:  ms.client_id,
    tenant:    ms.tenant || 'common',
    tokenPath: join(__dirname, ms.token_path || 'calendar/ms-token.json'),
    scanDays:  ms.outlook_scan_days || DAYS,
  };
}

// ── OAuth2 token management ──────────────────────────────────────────

function loadToken(tokenPath) {
  if (!existsSync(tokenPath)) return null;
  try { return JSON.parse(readFileSync(tokenPath, 'utf8')); } catch { return null; }
}

function saveToken(tokenPath, token) {
  const dir = dirname(tokenPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(tokenPath, JSON.stringify(token, null, 2));
}

async function refreshToken(cfg, token) {
  const body = new URLSearchParams({
    client_id:     cfg.clientId,
    grant_type:    'refresh_token',
    refresh_token: token.refresh_token,
    scope:         SCOPES,
  });
  const res  = await fetch(`${AUTH_BASE}/${cfg.tenant}/oauth2/v2.0/token`, { method: 'POST', body });
  const data = await res.json();
  if (data.error) throw new Error(`Token refresh failed: ${data.error_description}`);
  const updated = { ...token, ...data, expires_at: Date.now() + data.expires_in * 1000 };
  saveToken(cfg.tokenPath, updated);
  return updated;
}

async function runAuthFlow(cfg) {
  const authUrl = `${AUTH_BASE}/${cfg.tenant}/oauth2/v2.0/authorize?` + new URLSearchParams({
    client_id:     cfg.clientId,
    response_type: 'code',
    redirect_uri:  REDIRECT,
    scope:         SCOPES,
    response_mode: 'query',
  });

  console.log('\nOpening browser for Microsoft authentication...');
  console.log('If browser does not open, visit:\n' + authUrl + '\n');
  try {
    if (process.platform === 'win32') spawn('cmd.exe', ['/c', 'start', '', authUrl], { shell: false, detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [authUrl], { shell: false, detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [authUrl], { shell: false, detached: true, stdio: 'ignore' }).unref();
  } catch { /* browser open is best-effort */ }

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const { query } = parseUrl(req.url, true);
      if (!query.code) { res.end('No code received.'); return; }

      res.end('<html><body><h2>Authentication successful — you can close this tab.</h2></body></html>');
      server.close();

      const body = new URLSearchParams({
        client_id:    cfg.clientId,
        grant_type:   'authorization_code',
        code:         query.code,
        redirect_uri: REDIRECT,
        scope:        SCOPES,
      });

      const tokenRes  = await fetch(`${AUTH_BASE}/${cfg.tenant}/oauth2/v2.0/token`, { method: 'POST', body });
      const tokenData = await tokenRes.json();
      if (tokenData.error) { reject(new Error(tokenData.error_description)); return; }

      const token = { ...tokenData, expires_at: Date.now() + tokenData.expires_in * 1000 };
      saveToken(cfg.tokenPath, token);
      console.log('✅ Authentication successful. Token saved to', cfg.tokenPath);
      resolve(token);
    });
    server.listen(3001);
  });
}

async function getAccessToken(cfg) {
  let token = loadToken(cfg.tokenPath);
  if (!token) {
    console.log('No token found. Starting OAuth2 flow...');
    token = await runAuthFlow(cfg);
  } else if (Date.now() > token.expires_at - 60000) {
    token = await refreshToken(cfg, token);
  }
  return token.access_token;
}

// ── Microsoft Graph API calls ────────────────────────────────────────

async function graphGet(accessToken, path, params = {}) {
  const url = new URL(GRAPH_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Graph API error ${res.status}: ${err?.error?.message || res.statusText}`);
  }
  return res.json();
}

// ── Interview detection ──────────────────────────────────────────────

const INTERVIEW_KEYWORDS = [
  'interview', 'prescreen', 'phone screen', 'meet with', 'calendar invite',
  'zoom invite', 'teams meeting', 'hiring', 'video call', 'virtual interview',
  'recruitment', 'hiring manager', 'we would like to speak',
];

const SUBJECT_FILTER = INTERVIEW_KEYWORDS.map(k => `contains(subject,'${k}')`).join(' or ');

function extractMeetingLink(body) {
  const patterns = [
    /https:\/\/teams\.microsoft\.com\/[^\s"<>)]+/,
    /https:\/\/[a-z0-9]+\.zoom\.us\/[^\s"<>)]+/,
    /https:\/\/meet\.google\.com\/[^\s"<>)]+/,
    /https:\/\/whereby\.com\/[^\s"<>)]+/,
  ];
  for (const p of patterns) {
    const m = body.match(p);
    if (m) return m[0].split('"')[0].split(')')[0];
  }
  return null;
}

function extractCompany(sender) {
  // Try display name first (e.g. "Marie Jansa (Royal Conservatory)")
  const parenMatch = sender.match(/\(([^)]+)\)/);
  if (parenMatch) return parenMatch[1].trim();

  // Fall back to domain
  const emailMatch = sender.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  if (!emailMatch) return sender;
  const domain = emailMatch[1].toLowerCase();
  const skip = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'greenhouse.io', 'lever.co', 'ashby.io', 'workday.com'];
  if (skip.includes(domain)) return sender.split('@')[0].replace(/[<>]/g, '').trim();
  return domain.replace(/\.(com|ca|io|org|net)$/, '').replace(/-/g, ' ');
}

function extractRole(subject) {
  const patterns = [
    /interview.*?(?:for|re:|:)\s*(.+?)(?:\s*[-–|@]|$)/i,
    /(?:role|position|opportunity):\s*(.+?)(?:\s*[-–|@]|$)/i,
    /(?:hiring|recruiting).*?for\s+(.+?)(?:\s*[-–|@]|$)/i,
    /^(.+?)\s+interview/i,
  ];
  for (const p of patterns) {
    const m = subject.match(p);
    if (m && m[1].length < 80) return m[1].trim();
  }
  return subject.replace(/interview|prescreen|phone screen/gi, '').trim().slice(0, 60) || 'Role TBD';
}

function extractDateTime(bodyPreview) {
  // Common date/time patterns in recruiter emails
  const patterns = [
    /(\w+ \d{1,2},?\s+\d{4})\s+(?:at\s+)?(\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*[A-Z]{2,4})?)/i,
    /(\d{1,2}\/\d{1,2}\/\d{4})\s+(?:at\s+)?(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
    /(\w+day,?\s+\w+ \d{1,2})\s+(?:at\s+)?(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
  ];
  for (const p of patterns) {
    const m = bodyPreview.match(p);
    if (m) return `${m[1]} ${m[2]}`.trim();
  }
  return null;
}

// ── Tracker helpers ──────────────────────────────────────────────────

function loadSeenCompanyRoles() {
  const seen = new Set();
  if (!existsSync(APPLICATIONS_PATH)) return seen;
  const lines = readFileSync(APPLICATIONS_PATH, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.startsWith('|') || line.includes('---')) continue;
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length >= 3) seen.add(`${cols[2].toLowerCase()}::${cols[3]?.toLowerCase() || ''}`);
  }
  return seen;
}

function updateTrackerStatus(company, role) {
  if (!existsSync(APPLICATIONS_PATH)) return false;
  const content = readFileSync(APPLICATIONS_PATH, 'utf8');
  const companyLower = company.toLowerCase();
  const lines = content.split('\n');
  let updated = false;
  const newLines = lines.map(line => {
    if (!line.startsWith('|') || line.includes('---')) return line;
    if (line.toLowerCase().includes(companyLower) && !line.includes('Interview')) {
      updated = true;
      return line.replace(/\|\s*(Applied|Evaluated|Responded)\s*\|/, '| Interview |');
    }
    return line;
  });
  if (updated && !DRY_RUN) writeFileSync(APPLICATIONS_PATH, newLines.join('\n'));
  return updated;
}

function createPrepFile(company, role, dateTime, meetingLink, sender) {
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const roleSlug = role.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const filename = join(INTERVIEW_PREP_DIR, `${slug}-${roleSlug}.md`);

  if (existsSync(filename)) return filename; // don't overwrite existing prep

  const safeCompany = company.replace(/'/g, "''");
  const safeRole    = role.replace(/'/g, "''");
  const content = `---
title: '${safeCompany} — ${safeRole}'
date: ${TODAY}
type: prescreen
company: '${safeCompany}'
role: '${safeRole}'
status: upcoming
tags:
  - Interview
  - prescreen
  - 求职
---

# ${company} — ${role}

**Date:** ${dateTime || 'TBD'}
**Meeting:** ${meetingLink || 'TBD'}
**Contact:** ${sender}

---

## Role Overview

<!-- Add role summary here -->

## Key Prep Points

- [ ] Research company background
- [ ] Prepare STAR stories
- [ ] Review job description requirements

## Questions to Ask

1. What does success look like in the first 90 days?
2. What are the biggest challenges in this role?
3. What does the team structure look like?
`;

  if (!DRY_RUN) {
    if (!existsSync(INTERVIEW_PREP_DIR)) mkdirSync(INTERVIEW_PREP_DIR, { recursive: true });
    writeFileSync(filename, content);
  }
  return filename;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nOutlook Interview Scan — ${TODAY}`);
  console.log('━'.repeat(40));
  if (DRY_RUN) console.log('DRY RUN — no files will be written\n');

  const cfg = loadProfile();

  if (AUTH_ONLY) {
    await runAuthFlow(cfg);
    return;
  }

  const accessToken = await getAccessToken(cfg);

  const since = new Date();
  since.setDate(since.getDate() - (cfg.scanDays || DAYS));
  const sinceISO = since.toISOString();

  console.log(`Scanning last ${cfg.scanDays || DAYS} days (since ${sinceISO.slice(0, 10)})...\n`);

  const data = await graphGet(accessToken, '/me/messages', {
    '$filter':  `receivedDateTime ge ${sinceISO} and (${SUBJECT_FILTER})`,
    '$select':  'subject,from,receivedDateTime,bodyPreview,webLink',
    '$orderby': 'receivedDateTime desc',
    '$top':     '50',
  });

  const messages = data.value || [];
  console.log(`Found ${messages.length} potential interview emails\n`);

  if (!messages.length) {
    console.log('No interview emails found.');
    return;
  }

  const seenRoles   = loadSeenCompanyRoles();
  const historyRows = [];
  let detected = 0, skipped = 0;

  for (const msg of messages) {
    const subject    = msg.subject || '';
    const sender     = msg.from?.emailAddress?.address || '';
    const senderName = msg.from?.emailAddress?.name || sender;
    const body       = msg.bodyPreview || '';
    const receivedAt = msg.receivedDateTime;

    const company     = extractCompany(senderName + ' <' + sender + '>');
    const role        = extractRole(subject);
    const dateTime    = extractDateTime(body);
    const meetingLink = extractMeetingLink(body);
    const key         = `${company.toLowerCase()}::${role.toLowerCase()}`;

    process.stdout.write(`  [${new Date(receivedAt).toLocaleDateString()}] ${subject.slice(0, 55)}...\n`);
    process.stdout.write(`    → Company: ${company} | Role: ${role}\n`);

    if (seenRoles.has(key)) {
      process.stdout.write(`    → SKIP: already in tracker\n\n`);
      skipped++;
      historyRows.push(`${key}\t${TODAY}\tOutlook\t${role}\t${company}\tskipped_dup`);
      continue;
    }

    if (dateTime) process.stdout.write(`    → Date: ${dateTime}\n`);
    if (meetingLink) process.stdout.write(`    → Link: ${meetingLink}\n`);

    // Update tracker status
    const trackerUpdated = updateTrackerStatus(company, role);
    if (trackerUpdated) process.stdout.write(`    → Tracker: status updated to Interview\n`);

    // Create prep file
    const prepFile = createPrepFile(company, role, dateTime, meetingLink, senderName);
    if (!DRY_RUN) process.stdout.write(`    → Prep file: ${prepFile}\n`);

    historyRows.push(`${key}\t${TODAY}\tOutlook\t${role}\t${company}\tdetected`);
    seenRoles.add(key);
    detected++;
    console.log('');
  }

  // Summary
  console.log('━'.repeat(40));
  console.log(`Emails scanned:   ${messages.length}`);
  console.log(`Interviews found: ${detected}`);
  console.log(`Duplicates:       ${skipped}`);

  if (!DRY_RUN && historyRows.length > 0) {
    const historyDir = dirname(SCAN_HISTORY_PATH);
    if (!existsSync(historyDir)) mkdirSync(historyDir, { recursive: true });
    if (!existsSync(SCAN_HISTORY_PATH)) {
      writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n');
    }
    appendFileSync(SCAN_HISTORY_PATH, historyRows.join('\n') + '\n');
    console.log('\n✅ Done.');
  } else if (DRY_RUN) {
    console.log('\n[dry-run] No files written.');
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
