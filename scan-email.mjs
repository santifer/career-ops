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
 * Shares parsing + persistence with scripts/scan-email-poll.mjs (the
 * every-15-min Gmail-API variant). Pure functions live in
 * lib/gmail-alert-parser.mjs so the two paths stay in lockstep.
 *
 * Setup: see scripts/EMAIL_SETUP.md
 *
 * Usage:
 *   node scan-email.mjs                # process labelled inbox
 *   node scan-email.mjs --dry-run      # preview without writing
 *   node scan-email.mjs --label=name   # use a different label
 *   node scan-email.mjs --keep-unread  # don't mark messages read
 */

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import yaml from 'js-yaml';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { resolveUrls } from './lib/resolve-ats-url.mjs';
import {
  buildTitleFilter,
  loadSeenUrls,
  appendToPipeline,
  appendToScanHistory,
  processAlert,
  PORTALS_PATH,
} from './lib/gmail-alert-parser.mjs';

const parseYaml = yaml.load;

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
  const date = new Date().toISOString();
  let totalUrls = 0;
  let totalFiltered = 0;
  let totalDupes = 0;
  let totalExpanded = 0;
  const newOffers = [];
  const processedUids = [];

  let totalCuratorMentions = 0;
  let totalCuratorUntracked = 0;

  for (const alert of alerts) {
    const r = await processAlert(alert, { seenUrls, titleFilter, date });
    totalUrls += r.urls;
    totalFiltered += r.filtered;
    totalDupes += r.dupes;
    totalExpanded += r.expanded;
    totalCuratorMentions += r.curatorMentions;
    totalCuratorUntracked += r.curatorUntracked;
    newOffers.push(...r.offers);
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
