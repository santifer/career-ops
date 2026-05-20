#!/usr/bin/env node

/**
 * scan-email-poll.mjs — Real-time Gmail-alert ingestion via Gmail API
 *
 * Companion to scan-email.mjs (the IMAP-based daily batch). This script
 * is designed to run every 15 minutes via launchd
 * (com.mitchell.career-ops.scan-email-poll.plist) so email-arriving roles
 * appear in the pipeline within 15 min of receipt instead of waiting for
 * the 02:00 PT IMAP sweep.
 *
 * How it works:
 *   1. Refresh the Gmail OAuth access token (POST /oauth2/v4/token).
 *   2. Read data/gmail-history-state.json for the last-seen historyId.
 *      - First run / missing file: bootstrap by querying recent messages
 *        with newer_than:1h, then snapshot current historyId.
 *      - Stale historyId (>~7 days, returns 404): same bootstrap path.
 *   3. GET /users/me/history?startHistoryId=X&labelId=Y&historyTypes=messageAdded
 *      Returns a list of messageAdded events since X.
 *   4. For each new message id, GET /users/me/messages/{id}?format=full
 *      to retrieve the body, decode base64url, hand to processAlert().
 *   5. Persist new historyId from the GET-history response (or
 *      getProfile() if no events were returned).
 *
 * Dedup overlap with scan-email.mjs is handled by the URL set in
 * data/scan-history.tsv + data/pipeline.md — the IMAP daily sweep can
 * re-process the same messages without creating duplicate pipeline rows.
 *
 * SDK-free on purpose: imports nothing from googleapis, so the script
 * survives upstream syncs that drop the dep from package.json. Uses
 * built-in fetch (Node 18+).
 *
 * Prereq: gmail-oauth-init.mjs must have been run once to populate
 *   ~/.career-ops-secrets with:
 *     GMAIL_OAUTH_CLIENT_ID
 *     GMAIL_OAUTH_CLIENT_SECRET
 *     GMAIL_OAUTH_REFRESH_TOKEN
 *   ...with a scope set that includes gmail.readonly (or gmail.modify).
 *
 * Usage:
 *   node scripts/scan-email-poll.mjs                # poll + write
 *   node scripts/scan-email-poll.mjs --dry-run      # poll + log, no writes
 *   node scripts/scan-email-poll.mjs --label=name   # default career-ops/alerts
 *   node scripts/scan-email-poll.mjs --reset        # ignore saved historyId, re-bootstrap
 *   node scripts/scan-email-poll.mjs --bootstrap-window=1h  # bootstrap window (default 1h)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { resolveUrls } from '../lib/resolve-ats-url.mjs';
import {
  buildTitleFilter,
  loadSeenUrls,
  appendToPipeline,
  appendToScanHistory,
  processAlert,
  PORTALS_PATH,
} from '../lib/gmail-alert-parser.mjs';

const parseYaml = yaml.load;

const SECRETS_PATH = join(homedir(), '.career-ops-secrets');
const STATE_PATH = 'data/gmail-history-state.json';
const LOG_DIR = 'data/logs';

mkdirSync('data', { recursive: true });
mkdirSync(LOG_DIR, { recursive: true });

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
  const required = [
    'GMAIL_USER',
    'GMAIL_OAUTH_CLIENT_ID',
    'GMAIL_OAUTH_CLIENT_SECRET',
    'GMAIL_OAUTH_REFRESH_TOKEN',
  ];
  for (const k of required) {
    if (!out[k]) {
      throw new Error(
        `Missing ${k} in ${SECRETS_PATH}.\n` +
        `Run scripts/gmail-oauth-init.mjs once to grant OAuth access.\n` +
        `(The poll script needs scope gmail.readonly; the init script provisions it.)`
      );
    }
  }
  return out;
}

// ── OAuth refresh ──────────────────────────────────────────────────

async function fetchAccessToken(secrets) {
  const params = new URLSearchParams({
    client_id: secrets.GMAIL_OAUTH_CLIENT_ID,
    client_secret: secrets.GMAIL_OAUTH_CLIENT_SECRET,
    refresh_token: secrets.GMAIL_OAUTH_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const body = await res.text();
    if (!res.ok) {
      throw new Error(`OAuth refresh failed (HTTP ${res.status}): ${body}`);
    }
    const data = JSON.parse(body);
    if (!data.access_token) throw new Error('OAuth refresh: no access_token in response');
    return data.access_token;
  } finally {
    clearTimeout(timer);
  }
}

// ── Gmail REST helpers ─────────────────────────────────────────────

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function gmailGet(accessToken, path, { acceptStatus = [200] } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${GMAIL_BASE}${path}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const text = await res.text();
    if (!acceptStatus.includes(res.status)) {
      const err = new Error(`Gmail ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return { status: res.status, body: text ? JSON.parse(text) : {} };
  } finally {
    clearTimeout(timer);
  }
}

async function getProfile(accessToken) {
  const { body } = await gmailGet(accessToken, '/profile');
  return body;
}

async function resolveLabelId(accessToken, labelName) {
  const { body } = await gmailGet(accessToken, '/labels');
  const labels = body.labels || [];
  const found = labels.find(l => l.name === labelName);
  if (!found) {
    const sample = labels.slice(0, 20).map(l => `  - ${l.name}`).join('\n');
    throw new Error(
      `Label "${labelName}" not found in Gmail.\n` +
      `Set up the filter first — see scripts/EMAIL_SETUP.md.\n\nAvailable labels (top 20):\n${sample}`
    );
  }
  return found.id;
}

// users.history.list — incremental fetch since startHistoryId. Returns
// the full list of new message ids (deduped) and the new historyId.
// 404 ⇒ historyId expired (Gmail ~7-day retention), caller bootstraps.
//
// historyTypes includes BOTH messageAdded and labelAdded so we catch
// messages that arrive without the label and then get labeled by a
// Gmail filter (the filter latency is sub-second but there's still a
// race window). URL dedup in lib/gmail-alert-parser catches duplicates
// if the same id surfaces via both event types.
async function listHistory(accessToken, { startHistoryId, labelId, maxPages = 10 }) {
  const newMessageIds = new Set();
  let pageToken = null;
  let latestHistoryId = startHistoryId;
  let pages = 0;
  while (true) {
    const params = new URLSearchParams();
    params.set('startHistoryId', String(startHistoryId));
    params.set('labelId', labelId);
    params.append('historyTypes', 'messageAdded');
    params.append('historyTypes', 'labelAdded');
    params.set('maxResults', '500');
    if (pageToken) params.set('pageToken', pageToken);
    const { body } = await gmailGet(accessToken, `/history?${params}`);
    if (body.historyId) latestHistoryId = body.historyId;
    for (const h of body.history || []) {
      for (const m of h.messagesAdded || []) {
        if (m.message?.id) newMessageIds.add(m.message.id);
      }
      for (const m of h.labelsAdded || []) {
        if (m.message?.id) newMessageIds.add(m.message.id);
      }
    }
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
    pages += 1;
    if (pages >= maxPages) break;  // safety cap
  }
  return { messageIds: [...newMessageIds], historyId: latestHistoryId };
}

// Bootstrap path — used on first run, when state file is missing, when
// --reset is passed, or when history.list returns 404 (expired
// historyId). Queries recent messages via users.messages.list filtered
// by labelIds, then the caller snapshots current historyId via
// getProfile() so the next poll picks up where we left off.
async function bootstrapMessageIds(accessToken, { labelId, windowQ }) {
  const ids = new Set();
  let pageToken = null;
  let pages = 0;
  while (true) {
    const params = new URLSearchParams();
    params.set('labelIds', labelId);
    if (windowQ) params.set('q', `${windowQ} -in:trash`);
    params.set('maxResults', '500');
    if (pageToken) params.set('pageToken', pageToken);
    const { body } = await gmailGet(accessToken, `/messages?${params}`);
    for (const m of body.messages || []) ids.add(m.id);
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
    pages += 1;
    if (pages >= 10) break;
  }
  return [...ids];
}

// Decode base64url (Gmail's encoding for raw message parts).
function decodeBase64Url(s) {
  if (!s) return '';
  const fixed = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(fixed, 'base64').toString('utf-8');
}

// Walk a Gmail message payload tree and return { html, text, subject,
// from }. Prefers text/html parts; falls back to text/plain.
function extractMessage(messageBody) {
  const headers = messageBody.payload?.headers || [];
  const get = (name) => (headers.find(h => h.name?.toLowerCase() === name.toLowerCase()) || {}).value || '';
  const subject = get('Subject');
  const from = get('From');

  let html = '';
  let text = '';

  function walk(part) {
    if (!part) return;
    const mime = (part.mimeType || '').toLowerCase();
    const data = part.body?.data || '';
    if (data) {
      const decoded = decodeBase64Url(data);
      if (mime === 'text/html' && !html) html = decoded;
      else if (mime === 'text/plain' && !text) text = decoded;
    }
    if (part.parts) for (const sub of part.parts) walk(sub);
  }
  walk(messageBody.payload);

  const body = html || text || '';
  return { subject, from, body };
}

async function fetchMessage(accessToken, id) {
  const { body } = await gmailGet(accessToken, `/messages/${id}?format=full`);
  return extractMessage(body);
}

// ── State persistence ──────────────────────────────────────────────

function loadState() {
  if (!existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const resetState = args.includes('--reset');
  const label = args.find(a => a.startsWith('--label='))?.split('=')[1] || 'career-ops/alerts';
  const bootstrapWindow = args.find(a => a.startsWith('--bootstrap-window='))?.split('=')[1] || 'newer_than:1h';

  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found.');
    process.exit(1);
  }

  const startedAt = new Date();
  const date = startedAt.toISOString();

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const titleFilter = buildTitleFilter(config.title_filter);
  const secrets = loadSecrets();

  console.log(`[${new Date().toISOString()}] scan-email-poll starting (label=${label}${dryRun ? ', dry-run' : ''}${resetState ? ', reset' : ''})`);

  const accessToken = await fetchAccessToken(secrets);
  const labelId = await resolveLabelId(accessToken, label);

  let state = resetState ? null : loadState();
  let messageIds = [];
  let nextHistoryId;
  let usedBootstrap = false;

  if (state?.historyId) {
    try {
      const r = await listHistory(accessToken, { startHistoryId: state.historyId, labelId });
      messageIds = r.messageIds;
      nextHistoryId = r.historyId || state.historyId;
    } catch (err) {
      if (err.status === 404) {
        // Saved historyId expired (>~7 days) — bootstrap
        console.warn(`Saved historyId ${state.historyId} expired; bootstrapping from ${bootstrapWindow}.`);
        usedBootstrap = true;
      } else {
        throw err;
      }
    }
  } else {
    usedBootstrap = true;
  }

  if (usedBootstrap) {
    messageIds = await bootstrapMessageIds(accessToken, { labelId, windowQ: bootstrapWindow });
    const profile = await getProfile(accessToken);
    nextHistoryId = profile.historyId;
  }

  // Cap messages processed per poll. At 15-min cadence the realistic max
  // is ~20-50 messages; cap at 200 to avoid runaway batches if the user
  // imports a backlog. Older messages will be picked up by the next
  // poll (or by the daily IMAP sweep, which is the safety net).
  const MAX_PER_POLL = 200;
  if (messageIds.length > MAX_PER_POLL) {
    console.warn(`Capping ${messageIds.length} message ids → ${MAX_PER_POLL}.`);
    messageIds = messageIds.slice(0, MAX_PER_POLL);
  }

  console.log(`Mode: ${usedBootstrap ? `bootstrap (${bootstrapWindow})` : 'history.list'}`);
  console.log(`Messages to process: ${messageIds.length}`);

  // De-dup against previously-processed messages so re-running this
  // script doesn't re-fetch bodies already ingested today.
  if (state?.processedMessageIds) {
    const seen = new Set(state.processedMessageIds);
    messageIds = messageIds.filter(id => !seen.has(id));
    if (messageIds.length === 0) {
      console.log(`All ${state.processedMessageIds.length} previously-processed ids re-confirmed; nothing new.`);
    }
  }

  const seenUrls = loadSeenUrls();
  const newOffers = [];
  let totalUrls = 0;
  let totalFiltered = 0;
  let totalDupes = 0;
  let totalExpanded = 0;
  let totalCuratorMentions = 0;
  let totalCuratorUntracked = 0;
  const processedIds = [];

  for (const id of messageIds) {
    let msg;
    try {
      const fetched = await fetchMessage(accessToken, id);
      msg = { uid: id, subject: fetched.subject, from: fetched.from, body: fetched.body };
    } catch (err) {
      console.warn(`  skip ${id}: ${err.message}`);
      continue;
    }
    const r = await processAlert(msg, { seenUrls, titleFilter, date });
    totalUrls += r.urls;
    totalFiltered += r.filtered;
    totalDupes += r.dupes;
    totalExpanded += r.expanded;
    totalCuratorMentions += r.curatorMentions;
    totalCuratorUntracked += r.curatorUntracked;
    newOffers.push(...r.offers);
    processedIds.push(id);
  }

  console.log('');
  console.log('━'.repeat(45));
  console.log(`Email Poll — ${date} ${startedAt.toISOString().slice(11, 19)}Z`);
  console.log('━'.repeat(45));
  console.log(`Messages processed:  ${processedIds.length}`);
  console.log(`URLs extracted:      ${totalUrls}`);
  console.log(`LinkedIn URLs followed:  ${totalExpanded} (post / lnkd.in redirects expanded)`);
  console.log(`Curator mentions logged: ${totalCuratorMentions} (${totalCuratorUntracked} at companies NOT in portals.yml)`);
  console.log(`Filtered by title:   ${totalFiltered} removed`);
  console.log(`Duplicates:          ${totalDupes} skipped`);
  console.log(`New offers added:    ${newOffers.length}`);

  if (newOffers.length > 0) {
    console.log('\nNew offers:');
    for (const o of newOffers.slice(0, 30)) {
      console.log(`  + [${o.source}] ${o.title} — ${o.url}`);
    }
    if (newOffers.length > 30) console.log(`  ... and ${newOffers.length - 30} more`);
  }

  if (!dryRun && newOffers.length > 0) {
    // Resolve LinkedIn jobs/view URLs → canonical ATS URLs before persisting.
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

  if (!dryRun) {
    // Persist the new historyId + a rolling window of recently-processed
    // message ids (so a 15-min poll that lands during the same minute as
    // the previous one doesn't double-process the same message).
    const recentIds = [
      ...(state?.processedMessageIds || []).slice(-200),
      ...processedIds,
    ].slice(-300);
    saveState({
      historyId: nextHistoryId,
      labelId,
      label,
      lastPollAt: startedAt.toISOString(),
      processedMessageIds: recentIds,
    });
    console.log(`State saved: historyId=${nextHistoryId}`);
  } else {
    console.log('\n(dry run — no files written, state not updated)');
  }
}

main().catch(err => {
  console.error('scan-email-poll error:', err.message);
  if (err.status) console.error('  HTTP status:', err.status);
  process.exit(1);
});
