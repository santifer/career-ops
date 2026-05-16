#!/usr/bin/env node

/**
 * scan-gmail.mjs — Zero-LLM Gmail scanner for interview invitations.
 *
 * Authenticates via OAuth2 (token persisted to calendar/token.json).
 * Queries Gmail for interview-related emails, extracts company/role/date/meeting
 * details, deduplicates against applications.md, updates tracker, creates
 * interview prep files, and adds Google Calendar events.
 *
 * Usage:
 *   node scan-gmail.mjs                  # scan last 7 days (default)
 *   node scan-gmail.mjs --days 14        # scan last N days
 *   node scan-gmail.mjs --dry-run        # preview without writing files
 *   node scan-gmail.mjs --no-calendar    # skip calendar event creation
 */

import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createServer } from 'http';
import { execFile } from 'child_process';
import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_CREDENTIALS_PATH = path.join(__dirname, 'calendar/credentials.json');
const DEFAULT_TOKEN_PATH = path.join(__dirname, 'calendar/token.json');
const PROFILE_PATH = path.join(__dirname, 'config/profile.yml');
const APPLICATIONS_PATH = path.join(__dirname, 'data/applications.md');
const ADDITIONS_DIR = path.join(__dirname, 'batch/tracker-additions');
const PREP_DIR = path.join(__dirname, 'interview-prep');

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const INTERVIEW_QUERY =
  'subject:(interview OR prescreen OR "phone screen" OR "meet with" OR "calendar invite" OR "zoom invite" OR "teams meeting" OR "google meet") newer_than:';

// Patterns for extracting meeting links from email body
const MEETING_LINK_RE =
  /https?:\/\/(?:[\w-]+\.zoom\.us\/[jw]\/[\w?=&]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]+|meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3})/i;

// Patterns for extracting date+time from email body
const DATE_RE =
  /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}[^.]*?(?:\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*[A-Z]{2,4})?)?/i;

// Patterns to extract role from subject line
const ROLE_FROM_SUBJECT_RE = [
  /interview\s+(?:for|re:|regarding)\s+(?:the\s+)?(.+?)(?:\s+(?:role|position|opportunity))?(?:\s+at\s+|\s*$)/i,
  /(?:for\s+the\s+)?(.+?)\s+(?:role|position)\s+(?:interview|at)/i,
  /re:\s*(.+?)\s+interview/i,
];

// Patterns to extract company from subject/sender
const COMPANY_FROM_SUBJECT_RE = [
  /(?:interview|at|with)\s+([A-Z][a-zA-Z0-9\s&.,-]{1,40})(?:\s+(?:for|regarding|re:|-)|\s*$)/,
  /invitation\s+(?:from|with)\s+([A-Z][a-zA-Z0-9\s&.,-]{1,40})/i,
];

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noCalendar = args.includes('--no-calendar');

const daysIdx = args.indexOf('--days');
let scanDays = null;
if (daysIdx !== -1) {
  const parsed = parseInt(args[daysIdx + 1], 10);
  if (!args[daysIdx + 1] || isNaN(parsed) || parsed <= 0) {
    console.error('Error: --days requires a positive integer (e.g. --days 14)');
    process.exit(1);
  }
  scanDays = parsed;
}

// ── Profile ───────────────────────────────────────────────────────────────────

function loadProfile() {
  if (!existsSync(PROFILE_PATH)) return {};
  try {
    return yaml.load(readFileSync(PROFILE_PATH, 'utf-8')) || {};
  } catch {
    return {};
  }
}

// Resolve credential/token paths — profile overrides defaults
function resolveGooglePaths(profile) {
  const credPath = profile?.google?.credentials_path
    ? path.resolve(__dirname, profile.google.credentials_path)
    : DEFAULT_CREDENTIALS_PATH;
  const tokenPath = profile?.google?.token_path
    ? path.resolve(__dirname, profile.google.token_path)
    : DEFAULT_TOKEN_PATH;
  return { credPath, tokenPath };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function loadCredentials(credPath) {
  if (!existsSync(credPath)) {
    console.error(`Error: credentials not found at ${credPath}`);
    console.error('');
    console.error('Setup steps:');
    console.error('  1. Go to https://console.cloud.google.com/apis/credentials');
    console.error('  2. Create OAuth 2.0 Client ID (Desktop app)');
    console.error('  3. Download JSON and save as calendar/credentials.json');
    console.error('  4. Enable Gmail API and Google Calendar API in your project');
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(credPath, 'utf-8'));
  const creds = raw.installed || raw.web;
  if (!creds) {
    console.error('Error: credentials.json must contain "installed" or "web" key');
    process.exit(1);
  }
  return creds;
}

function buildOAuth2Client(creds) {
  return new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    'http://localhost:3000/oauth2callback'
  );
}

async function authorize(credPath, tokenPath, scopes) {
  const creds = loadCredentials(credPath);
  const oAuth2Client = buildOAuth2Client(creds);

  if (existsSync(tokenPath)) {
    const token = JSON.parse(readFileSync(tokenPath, 'utf-8'));
    oAuth2Client.setCredentials(token);
    if (token.expiry_date && token.expiry_date < Date.now()) {
      const { credentials } = await oAuth2Client.refreshAccessToken();
      oAuth2Client.setCredentials(credentials);
      if (!dryRun) {
        mkdirSync(path.dirname(tokenPath), { recursive: true });
        writeFileSync(tokenPath, JSON.stringify(credentials, null, 2));
      }
    }
    return oAuth2Client;
  }

  return runAuthFlow(oAuth2Client, tokenPath, scopes);
}

function openBrowser(url) {
  const opener =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const openerArgs =
    process.platform === 'win32' ? ['/c', 'start', '', url] : [url];

  return new Promise((resolve) => {
    execFile(opener, openerArgs, { stdio: 'ignore' }, () => resolve());
  });
}

function runAuthFlow(oAuth2Client, tokenPath, scopes) {
  return new Promise((resolve, reject) => {
    // CSRF protection: generate a random state and verify it in the callback
    const oauthState = randomBytes(16).toString('hex');

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: oauthState,
    });

    console.log('\nOpening browser for Google OAuth authorization...');
    console.log(`If browser does not open, visit:\n  ${authUrl}\n`);

    openBrowser(authUrl).catch(() => {
      // Browser open failed — user will use printed URL
    });

    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost:3000');
      if (url.pathname !== '/oauth2callback') {
        res.end('Not found');
        return;
      }

      const error = url.searchParams.get('error');
      if (error) {
        res.end(`<h1>Authorization denied: ${error}</h1>`);
        server.close();
        reject(new Error(`OAuth denied: ${error}`));
        return;
      }

      // Verify CSRF state
      const returnedState = url.searchParams.get('state');
      if (returnedState !== oauthState) {
        res.end('<h1>Invalid state parameter. Possible CSRF attack.</h1>');
        server.close();
        reject(new Error('OAuth state mismatch — request may have been tampered with'));
        return;
      }

      const code = url.searchParams.get('code');
      try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        if (!dryRun) {
          mkdirSync(path.dirname(tokenPath), { recursive: true });
          writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
        } else {
          console.log('(dry run — token not saved to disk)');
        }
        res.end('<h1>Authorization successful! You can close this tab.</h1>');
        server.close();
        resolve(oAuth2Client);
      } catch (err) {
        res.end(`<h1>Error: ${err.message}</h1>`);
        server.close();
        reject(err);
      }
    });

    server.listen(3000, () => {
      console.log('Waiting for OAuth callback on http://localhost:3000 ...');
    });

    server.on('error', (err) => {
      reject(new Error(`Could not start callback server: ${err.message}. Is port 3000 in use?`));
    });
  });
}

// ── Email parsing ─────────────────────────────────────────────────────────────

function decodeBase64(str) {
  if (!str) return '';
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) return decodeBase64(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  return '';
}

function getHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function extractSenderDomain(from) {
  const match = from.match(/@([\w.-]+)/);
  if (!match) return null;
  const domain = match[1].toLowerCase();
  const platformDomains = ['greenhouse.io', 'workday.com', 'lever.co', 'ashbyhq.com',
    'recruitingbypaycor.com', 'icims.com', 'smartrecruiters.com', 'breezy.hr',
    'jobvite.com', 'taleo.net', 'successfactors.com', 'gmail.com', 'outlook.com'];
  if (platformDomains.some(p => domain.endsWith(p))) return null;
  return domain.split('.').slice(-2, -1)[0];
}

function extractSenderName(from) {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : null;
}

function guessCompany(from, subject) {
  const senderName = extractSenderName(from);
  if (senderName && !senderName.toLowerCase().includes('no-reply') &&
      !senderName.toLowerCase().includes('noreply') &&
      !senderName.toLowerCase().includes('careers') &&
      !senderName.toLowerCase().includes('recruiting')) {
    const nameFromMatch = senderName.match(/(?:from|at|@)\s+([A-Z][a-zA-Z0-9\s&.,-]{1,30})/i);
    if (nameFromMatch) return nameFromMatch[1].trim();
  }

  for (const re of COMPANY_FROM_SUBJECT_RE) {
    const m = subject.match(re);
    if (m) return m[1].trim();
  }

  const domain = extractSenderDomain(from);
  if (domain) return domain.charAt(0).toUpperCase() + domain.slice(1);

  return 'Unknown';
}

function guessRole(subject) {
  for (const re of ROLE_FROM_SUBJECT_RE) {
    const m = subject.match(re);
    if (m) return m[1].trim();
  }
  return subject
    .replace(/re:\s*/i, '')
    .replace(/interview\s+(?:invitation|invite|request|confirmation)?/i, '')
    .replace(/\s+at\s+.+$/, '')
    .trim() || 'Unknown Role';
}

function extractDate(body) {
  const m = body.match(DATE_RE);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

function extractMeetingLink(body) {
  const m = body.match(MEETING_LINK_RE);
  return m ? m[0] : null;
}

function extractInterviewer(from, body) {
  const senderName = extractSenderName(from);
  if (senderName && !senderName.toLowerCase().includes('no-reply') &&
      !senderName.toLowerCase().includes('noreply')) {
    return senderName;
  }
  const bodyMatch = body.match(/(?:you(?:'ll| will) be (?:meeting|speaking) with|interviewer[:\s]+|with\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/);
  return bodyMatch ? bodyMatch[1].trim() : null;
}

function parseEmail(message) {
  const headers = message.payload?.headers || [];
  const subject = getHeader(headers, 'subject');
  const from = getHeader(headers, 'from');
  const date = getHeader(headers, 'date');
  const body = extractBody(message.payload);
  const snippet = message.snippet || '';
  const searchText = body || snippet;

  return {
    id: message.id,
    subject,
    from,
    receivedDate: date,
    company: guessCompany(from, subject),
    role: guessRole(subject),
    interviewDate: extractDate(searchText),
    meetingLink: extractMeetingLink(searchText),
    interviewer: extractInterviewer(from, searchText),
    snippet,
  };
}

// ── Dedup ─────────────────────────────────────────────────────────────────────

function loadExistingInterviews() {
  const interviews = new Set();
  if (!existsSync(APPLICATIONS_PATH)) return interviews;
  const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
  for (const match of text.matchAll(/\|[^|]+\|[^|]+\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|[^|]*\|\s*([^|]+)\s*\|/g)) {
    const company = match[1].trim().toLowerCase();
    const role = match[2].trim().toLowerCase();
    const status = match[3].trim();
    if (company && company !== 'company') {
      interviews.add(`${company}::${role}::${status.toLowerCase()}`);
    }
  }
  return interviews;
}

function alreadyAtOrPastInterview(existingSet, company, role) {
  const key = company.toLowerCase();
  const roleKey = role.toLowerCase();
  for (const status of ['interview', 'offer', 'rejected']) {
    if (existingSet.has(`${key}::${roleKey}::${status}`)) return true;
  }
  return false;
}

function nextTrackerNum() {
  if (!existsSync(APPLICATIONS_PATH)) return 1;
  const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
  const nums = [...text.matchAll(/^\|\s*(\d+)\s*\|/gm)].map(m => parseInt(m[1], 10));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

// ── Writers ───────────────────────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function writeTsvAddition(interview, num) {
  mkdirSync(ADDITIONS_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(interview.company);
  const filePath = path.join(ADDITIONS_DIR, `${String(num).padStart(3, '0')}-${slug}.tsv`);
  const meetNote = interview.meetingLink ? 'has meeting link' : 'no link yet';
  const interviewNote = interview.interviewDate
    ? interview.interviewDate.slice(0, 50)
    : meetNote;
  const row = [
    num, date, interview.company, interview.role,
    'Interview', '', '', '',
    `Gmail scan: ${interviewNote}`,
  ].join('\t');
  writeFileSync(filePath, row + '\n', 'utf-8');
  return filePath;
}

function writePrepFile(interview) {
  mkdirSync(PREP_DIR, { recursive: true });
  const slug = `${slugify(interview.company)}-${slugify(interview.role)}`;
  const filePath = path.join(PREP_DIR, `${slug}.md`);

  if (existsSync(filePath)) return filePath;

  const content = `# Interview Prep: ${interview.company} — ${interview.role}

**Date:** ${interview.interviewDate || 'TBD'}
**Interviewer:** ${interview.interviewer || 'TBD'}
**Meeting:** ${interview.meetingLink || 'TBD'}
**Detected from:** ${interview.subject}

---

## Company Research

<!-- Run /career-ops deep to fill this section -->

## Role Analysis

<!-- What does this role require? What are the key priorities? -->

## Your STAR Stories

<!-- Pull from interview-prep/story-bank.md the most relevant stories -->

## Questions to Ask

- What does success look like in the first 90 days?
- What are the biggest challenges the team is facing?
- How does this role interact with other teams?

## Notes

`;
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// ── Calendar ──────────────────────────────────────────────────────────────────

async function addCalendarEvent(auth, interview, profile) {
  if (!interview.interviewDate) return null;

  const calendarId = profile?.google?.calendar_id || 'primary';
  const calendar = google.calendar({ version: 'v3', auth });

  let startDateTime, endDateTime, allDay = false;

  if (interview.interviewDate) {
    // Date string was extracted from email — try to parse it
    const parsed = new Date(interview.interviewDate);
    if (isNaN(parsed.getTime())) {
      // Present but unparseable: don't create a misleading event
      throw new Error(`Could not parse interview date: "${interview.interviewDate}"`);
    }
    startDateTime = parsed.toISOString();
    endDateTime = new Date(parsed.getTime() + 60 * 60 * 1000).toISOString();
  } else {
    // No date detected in email — fall back to all-day placeholder on today
    // Note: Google Calendar end date is exclusive, so end must be tomorrow
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    allDay = true;
    startDateTime = today.toISOString().slice(0, 10);
    endDateTime = tomorrow.toISOString().slice(0, 10);
  }

  const event = {
    summary: `Interview: ${interview.company} - ${interview.role}`,
    description: [
      `Company: ${interview.company}`,
      `Role: ${interview.role}`,
      interview.interviewer ? `Interviewer: ${interview.interviewer}` : '',
      interview.meetingLink ? `Meeting: ${interview.meetingLink}` : '',
      'Detected via scan-gmail',
    ].filter(Boolean).join('\n'),
    ...(allDay
      ? { start: { date: startDateTime }, end: { date: endDateTime } }
      : { start: { dateTime: startDateTime }, end: { dateTime: endDateTime } }),
    ...(interview.meetingLink ? { location: interview.meetingLink } : {}),
  };

  const res = await calendar.events.insert({ calendarId, requestBody: event });
  return res.data.htmlLink;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n📧 Gmail Interview Scanner\n');

  const profile = loadProfile();
  const { credPath, tokenPath } = resolveGooglePaths(profile);

  // Validate days: CLI flag already validated above; validate profile value here
  let configuredDays = 7;
  const profileDays = profile?.google?.gmail_scan_days;
  if (profileDays !== undefined && profileDays !== null) {
    const parsed = parseInt(String(profileDays), 10);
    if (isNaN(parsed) || parsed <= 0 || parsed !== Number(profileDays)) {
      console.error(`Error: google.gmail_scan_days in profile.yml must be a positive integer (got: ${profileDays})`);
      process.exit(1);
    }
    configuredDays = parsed;
  }
  const days = scanDays ?? configuredDays;

  // Build scopes based on whether calendar will be used
  const scopes = noCalendar
    ? [GMAIL_SCOPE]
    : [GMAIL_SCOPE, CALENDAR_SCOPE];

  if (dryRun) console.log('(dry run — no files will be written)\n');

  let auth;
  try {
    auth = await authorize(credPath, tokenPath, scopes);
  } catch (err) {
    console.error(`Auth failed: ${err.message}`);
    process.exit(1);
  }

  const gmail = google.gmail({ version: 'v1', auth });

  console.log(`Scanning Gmail for interview emails (last ${days} days)...`);
  const query = `${INTERVIEW_QUERY}${days}d`;

  let messages = [];
  try {
    const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 50 });
    messages = res.data.messages || [];
  } catch (err) {
    console.error(`Gmail API error: ${err.message}`);
    process.exit(1);
  }

  console.log(`Found ${messages.length} candidate emails\n`);

  if (messages.length === 0) {
    console.log('No interview emails found.');
    console.log(`Query used: ${query}`);
    return;
  }

  const existingInterviews = loadExistingInterviews();
  let trackerNum = nextTrackerNum();

  const results = { processed: [], skipped: [], errors: [] };

  for (const msg of messages) {
    let full;
    try {
      const res = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      full = res.data;
    } catch (err) {
      results.errors.push({ id: msg.id, error: err.message });
      continue;
    }

    const interview = parseEmail(full);

    if (alreadyAtOrPastInterview(existingInterviews, interview.company, interview.role)) {
      results.skipped.push({ ...interview, reason: 'already tracked' });
      continue;
    }

    existingInterviews.add(
      `${interview.company.toLowerCase()}::${interview.role.toLowerCase()}::interview`
    );
    results.processed.push(interview);

    if (!dryRun) {
      writeTsvAddition(interview, trackerNum);
      trackerNum++;
      writePrepFile(interview);

      if (!noCalendar && interview.interviewDate) {
        try {
          interview.calendarLink = await addCalendarEvent(auth, interview, profile);
        } catch (err) {
          interview.calendarError = err.message;
        }
      }
    }
  }

  console.log('━'.repeat(50));
  console.log(`Gmail Scan — ${new Date().toISOString().slice(0, 10)}`);
  console.log('━'.repeat(50));
  console.log(`Emails scanned:       ${messages.length}`);
  console.log(`Interviews detected:  ${results.processed.length}`);
  console.log(`Already tracked:      ${results.skipped.length}`);
  console.log(`Errors:               ${results.errors.length}`);

  if (results.processed.length > 0) {
    console.log('\nNew interviews detected:');
    for (const iv of results.processed) {
      console.log(`  + ${iv.company} | ${iv.role}`);
      if (iv.interviewDate) console.log(`    Date: ${iv.interviewDate}`);
      if (iv.meetingLink)   console.log(`    Meet: ${iv.meetingLink}`);
      if (iv.calendarLink)  console.log(`    Cal:  ${iv.calendarLink}`);
      if (iv.calendarError) console.log(`    Cal error: ${iv.calendarError}`);
    }

    if (!dryRun) {
      console.log('\nNext steps:');
      console.log('  node merge-tracker.mjs');
      console.log('  Review interview-prep/ and run /career-ops interview-prep for deep research');
    }
  }

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    for (const e of results.errors) console.log(`  x ${e.id}: ${e.error}`);
  }

  if (dryRun && results.processed.length > 0) {
    console.log('\n(dry run — run without --dry-run to write files)');
  }

  console.log('\n→ Share feedback: https://discord.gg/8pRpHETxa4');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
