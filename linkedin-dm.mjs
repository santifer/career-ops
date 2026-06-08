/**
 * linkedin-dm.mjs
 * LinkedIn DM automation for Rahil Nathani career-ops pipeline.
 *
 * Usage:
 *   node linkedin-dm.mjs [--dry-run]
 *
 * Exit codes:
 *   0 = completed
 *   1 = unhandled error
 *   2 = 2FA timed out
 *   3 = no new events today
 */

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createContext as vmCreateContext, runInContext as vmRunInContext } from 'vm';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROFILE_PATH      = join(__dirname, 'config', 'profile.yml');
const DM_LOG_PATH       = join(__dirname, 'data', 'linkedin-dm-log.json');
const SESSION_DIR       = join(__dirname, 'data', 'linkedin-session');
const KANBAN_PATH       = join(__dirname, 'dashboard', 'job-pulse-kanban.html');
const CONNECTIONS_PATH  = join(__dirname, 'config', 'linkedin-connections.json');

const DRY_RUN          = process.argv.includes('--dry-run');
const CONNECTIONS_ONLY = process.argv.includes('--connections-only');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function firstName(name) { return (name || '').split(/\s+/)[0] || 'there'; }

function loadLinkedInCreds() {
  // Kaizen 4 (2026-05-22): env vars take precedence over profile.yml.
  // Set via: setx LINKEDIN_EMAIL "your@email.com" && setx LINKEDIN_PASSWORD "..."
  // (or run set-credentials.bat as a one-time setup on Windows)
  const envEmail    = process.env.LINKEDIN_EMAIL;
  const envPassword = process.env.LINKEDIN_PASSWORD;
  if (envEmail && envPassword) return { email: envEmail, password: envPassword };

  const defaults = { email: '', password: '' };
  try {
    const raw = readFileSync(PROFILE_PATH, 'utf8');
    const blockMatch = raw.match(/^linkedin:\s*\n((?:[ \t]+[^\n]+\n?)*)/m);
    if (!blockMatch) return defaults;
    const block = blockMatch[1];
    const get = (key) => {
      const m = block.match(new RegExp('^[ \\t]+' + key + ':\\s*"?([^"\\n]+)"?', 'm'));
      return m ? m[1].trim() : '';
    };
    return {
      email:    envEmail    || get('email'),
      password: envPassword || get('password'),
    };
  } catch { return defaults; }
}

function loadLog() {
  if (!existsSync(DM_LOG_PATH)) return { version: '1.0', entries: [], messaged: [] };
  try { return JSON.parse(readFileSync(DM_LOG_PATH, 'utf8')); }
  catch { return { version: '1.0', entries: [], messaged: [] }; }
}

function saveLog(log) {
  mkdirSync(join(__dirname, 'data'), { recursive: true });
  // Atomic write — prevents truncation if process is interrupted (Kaizen 2026-05-22)
  const tmp = DM_LOG_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(log, null, 2), 'utf8');
  renameSync(tmp, DM_LOG_PATH);
}

function alreadyMessaged(log, profileUrl, eventType) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return log.messaged.some(m =>
    m.profileUrl === profileUrl &&
    m.eventType === eventType &&
    new Date(m.messaged_at).getTime() > cutoff
  );
}

function generateMessage(event) {
  const fn = firstName(event.name);
  const co = event.company || 'your last place';
  switch (event.eventType) {
    case 'new_job':
      return pick([
        'Hey ' + fn + ', saw the news about ' + (event.company || 'the new role') + ' — congrats! Well deserved.',
        'Hey ' + fn + ', just saw you are at ' + (event.company || 'a new place') + ' now. Exciting move!',
      ]);
    case 'promotion':
      return pick([
        'Hey ' + fn + ', saw the promotion — congrats! That is a big one.',
        'Hey ' + fn + ', just noticed the new title. Well earned — congrats!',
      ]);
    case 'work_anniversary': {
      const m = (event.detail || '').match(/(\d+)\s*year/i);
      const n = m ? m[1] : null;
      return n
        ? 'Hey ' + fn + ', ' + n + ' years — that is a run! Hope it has been as good as it looks from the outside.'
        : 'Hey ' + fn + ', work anniversary! Hope it has been a great ride.';
    }
    case 'certification':
      return pick([
        'Hey ' + fn + ', saw the new cert — nice work. That is the kind of thing that stands out.',
        'Hey ' + fn + ', just noticed the certification. Solid investment — congrats!',
      ]);
    case 'article':
      return 'Hey ' + fn + ', saw the article — nice work. That is the kind of thing that stands out.';
    case 'departure_voluntary':
      return pick([
        'Hey ' + fn + ', saw you made a move from ' + co + '. Exciting chapter — hope it is everything you are looking for.',
        'Hey ' + fn + ', noticed you are off to something new. Big moves! Hope it is a great one.',
      ]);
    case 'departure_layoff':
      return 'Hey ' + fn + ', saw you are exploring what is next. If there is anything I can do to help — intros, a reference, whatever — just say the word.';
    case 'birthday':
      return pick([
        'Hey ' + fn + ', happy birthday! Hope it is a good one.',
        'Hey ' + fn + ', happy birthday! Make it count.',
      ]);
    default:
      return 'Hey ' + fn + ', saw the update — exciting stuff. Hope everything is going well!';
  }
}

function classifyDeparture(text) {
  const lower = (text || '').toLowerCase();
  const layoffSignals = ['open to work','exploring new opportunities','open to new opportunities','was laid off','impacted by','looking for new opportunities'];
  return layoffSignals.some(s => lower.includes(s)) ? 'departure_layoff' : 'departure_voluntary';
}

// ── Referral Queue (Kanban warm-connection cards) ────────────────────────────
// Parses the Kanban HTML for cards in 'referral-review' that have a real
// connectionLinkedinUrl, and converts them into DM events so they flow
// through the same sendDM() / dedup / log pipeline as notification events.

function generateReferralMessage(card) {
  const fn = firstName(card.connectionName);
  const company = card.company || 'the company';
  const role    = card.role    || 'the role';
  return [
    `Hey ${fn} — hope you're doing well.`,
    '',
    `Saw ${company} is hiring a ${role} and thought of you. Would love a quick word on what the team's like and how the process works — even 10 min would be huge.`,
    '',
    `Happy to return the favor anytime.`,
    '',
    `— Rahil`,
  ].join('\n');
}

function parseKanbanCards(html) {
  try {
    const fnMatch = html.match(/function makeSamples\(\)\s*\{([\s\S]*?)\n\}/);
    if (!fnMatch) return null;
    const sandbox = { result: null };
    vmCreateContext(sandbox);
    vmRunInContext(
      `function makeSamples() { ${fnMatch[1]} } result = makeSamples();`,
      sandbox,
      { timeout: 5000 }
    );
    return sandbox.result || [];
  } catch (err) {
    console.warn('[kanban] Parse error: ' + err.message);
    return null;
  }
}

function loadReferralQueue() {
  if (!existsSync(KANBAN_PATH)) {
    console.warn('[referral-queue] Kanban not found at ' + KANBAN_PATH);
    return [];
  }
  const cards = parseKanbanCards(readFileSync(KANBAN_PATH, 'utf8'));
  if (!cards) {
    console.warn('[referral-queue] makeSamples() not found or parse error — skipping Kanban queue');
    return [];
  }
  return cards
    .filter(c =>
      c.hasConnection === true &&
      c.connectionLinkedinUrl &&
      c.connectionLinkedinUrl.includes('linkedin.com/in/') &&
      c.connectionName
    )
    .map(c => ({
      name:       c.connectionName,
      profileUrl: c.connectionLinkedinUrl,
      eventType:  'warm_referral',
      company:    c.company,
      role:       c.role,
      detail:     `${c.company} — ${c.role}`,
      messageUrl: '',
      cardId:     c.id,
      _message:   generateReferralMessage(c),
    }));
}

// ── Connections file (config/linkedin-connections.json) ──────────────────────

function loadConnectionsFile() {
  if (!existsSync(CONNECTIONS_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(CONNECTIONS_PATH, 'utf8'));
    // Filter out template/example entries
    return (Array.isArray(data.connections) ? data.connections : [])
      .filter(c => !c._example && c.name && c.profileUrl && c.company);
  } catch { return []; }
}

function loadAllActiveKanbanCards() {
  if (!existsSync(KANBAN_PATH)) return [];
  const cards = parseKanbanCards(readFileSync(KANBAN_PATH, 'utf8'));
  if (!cards) return [];
  const TERMINAL = new Set(['submitted', 'blocked', 'cold-backlog', 'discarded']);
  return cards.filter(c =>
    c.grade && ['A', 'B'].includes(c.grade) &&
    c.columnId && !TERMINAL.has(c.columnId)
  );
}

function toSlug(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function generateConnectionMatchMessage(connection, card) {
  const fn      = (connection.name || '').split(/\s+/)[0] || 'there';
  const company = card.company || connection.company || 'the company';
  const role    = card.role    || 'the role';
  return `Hi ${fn}, noticed ${company} has a ${role} opening — would love to get your perspective on the team before I apply. Happy to keep it brief!`;
}

function buildConnectionMatchEvents(connections, cards) {
  const events = [];
  for (const conn of connections) {
    if (!conn.profileUrl || !conn.company) continue;
    const connSlug = toSlug(conn.company);
    for (const card of cards) {
      const cardSlug = toSlug(card.company);
      if (!cardSlug || !connSlug) continue;
      const isMatch = cardSlug === connSlug ||
        cardSlug.includes(connSlug) ||
        connSlug.includes(cardSlug);
      if (!isMatch) continue;
      events.push({
        name:       conn.name,
        profileUrl: conn.profileUrl,
        eventType:  'connection_match',
        company:    card.company,
        role:       card.role,
        detail:     `${card.company} — ${card.role} (grade ${card.grade}, ${card.columnId})`,
        messageUrl: '',
        cardId:     card.id,
        _message:   generateConnectionMatchMessage(conn, card),
      });
    }
  }
  return events;
}

async function scrapeNotifications(page) {
  const events = [];
  try {
    await page.waitForSelector('li.nt-card-list__item, [data-urn*="urn:li:notification"]', { timeout: 10000 }).catch(() => {});
    const cards = await page.$$('li.nt-card-list__item, [data-urn*="urn:li:notification"]');
    for (const card of cards) {
      try {
        const text = (await card.innerText().catch(() => '')).trim();
        if (!text) continue;
        const lower = text.toLowerCase();

        const linkEl = await card.$('a[href*="/in/"]');
        const profileUrl = linkEl ? (await linkEl.getAttribute('href') || '').split('?')[0] : '';
        const msgLinkEl = await card.$('a[href*="/messaging/"], a[href*="messageType"]');
        const messageUrl = msgLinkEl ? (await msgLinkEl.getAttribute('href') || '') : '';
        const nameEl = await card.$('a[href*="/in/"] span, .nt-card__text--bold, strong');
        const name = nameEl ? (await nameEl.innerText().catch(() => '')).trim() : '';

        if (!name || !profileUrl) continue;

        let eventType = null;
        let company = '';
        const detail = text;

        if (lower.includes('started a new position') || lower.includes('started a new job') || lower.includes('joined') || (lower.includes('is now') && !lower.includes('is no longer'))) {
          eventType = 'new_job';
          const cm = text.match(/(?:at|joined)\s+([A-Z][^\n.!?]+?)(?:\s+as|\s+—|\.|$)/);
          company = cm ? cm[1].trim() : '';
        } else if (lower.includes('was promoted') || lower.includes('promoted to') || lower.includes('new title')) {
          eventType = 'promotion';
        } else if (lower.includes('work anniversary') || (lower.includes('celebrating') && lower.includes('year'))) {
          eventType = 'work_anniversary';
        } else if (lower.includes('earned a certificate') || lower.includes('earned a badge') || lower.includes('completed a course') || lower.includes('new certification')) {
          eventType = 'certification';
        } else if (lower.includes('published an article') || lower.includes('published a post') || lower.includes('wrote an article')) {
          eventType = 'article';
        } else if (lower.includes('is no longer at') || lower.includes('open to work') || lower.includes('exploring new opportunities')) {
          eventType = classifyDeparture(text);
          const cm = text.match(/(?:left|no longer at)\s+([A-Z][^\n.!?]+?)(?:\s+|\.|\n|$)/);
          company = cm ? cm[1].trim() : '';
        } else if (lower.includes('birthday') || (lower.includes('celebrate') && lower.includes('\u{1F382}'))) {
          eventType = 'birthday';
        }

        if (!eventType) continue;
        events.push({ name, eventType, company, detail, profileUrl, messageUrl });
      } catch { /* skip malformed */ }
    }
  } catch (err) {
    console.warn('[scraper] Warning:', err.message);
  }
  return events;
}

async function sendDM(page, event, message) {
  const profileUrl = event.profileUrl.startsWith('http') ? event.profileUrl : 'https://www.linkedin.com' + event.profileUrl;
  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(rand(1200, 2500));

  let messagingOpened = false;
  const msgBtn = await page.$('button:has-text("Message"), a:has-text("Message")');
  if (msgBtn) { await msgBtn.click(); await sleep(rand(800, 1500)); messagingOpened = true; }

  if (!messagingOpened && event.messageUrl) {
    const url = event.messageUrl.startsWith('http') ? event.messageUrl : 'https://www.linkedin.com' + event.messageUrl;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(rand(1000, 2000));
    messagingOpened = true;
  }
  if (!messagingOpened) throw new Error('Could not open messaging interface');

  const inputSelectors = [
    'div.msg-form__contenteditable[contenteditable="true"]',
    'div[aria-label="Write a message…"]',
    'div[data-placeholder="Write a message…"]',
    '.msg-form__msg-content-container [contenteditable="true"]',
    'textarea[name="message"]',
  ];
  let inputEl = null;
  for (const sel of inputSelectors) { inputEl = await page.$(sel); if (inputEl) break; }
  if (!inputEl) throw new Error('Message input not found');

  await inputEl.click();
  await sleep(rand(300, 600));
  await page.keyboard.type(message, { delay: rand(50, 80) });
  await sleep(rand(800, 2000));

  const sendSelectors = [
    'button.msg-form__send-button',
    'button[type="submit"]:has-text("Send")',
    'button:has-text("Send"):not([disabled])',
  ];
  let sendBtn = null;
  for (const sel of sendSelectors) { sendBtn = await page.$(sel); if (sendBtn) break; }
  if (!sendBtn) throw new Error('Send button not found');

  await sleep(rand(400, 900));
  await sendBtn.click();
  await sleep(rand(1000, 2000));
}

async function isLoggedIn(page) {
  return !!(await page.$('.global-nav__primary-link, .feed-identity-module, #voyager-feed, [data-control-name="nav.home"]'));
}

async function ensureLoggedIn(page, creds) {
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(rand(800, 1500));

  if (await isLoggedIn(page)) { console.log('[login] Session active — skipping login.'); return; }

  if (!creds.email || !creds.password) {
    console.error('[login] No credentials in config/profile.yml under linkedin: section.');
    process.exit(1);
  }

  console.log('[login] No active session — logging in...');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(rand(600, 1200));
  await page.fill('#username', creds.email);
  await sleep(rand(300, 700));
  await page.fill('#password', creds.password);
  await sleep(rand(400, 800));
  await page.click('[type="submit"], button:has-text("Sign in")');
  await sleep(rand(2000, 4000));

  const twoFaSelectors = [
    '#input__phone_verification_pin', 'input[name="pin"]', '#two-step-challenge',
    '[data-testid="two-step-challenge"]', 'form[action*="checkpoint"]', 'input[autocomplete="one-time-code"]',
  ];
  let needs2FA = false;
  for (const sel of twoFaSelectors) { if (await page.$(sel)) { needs2FA = true; break; } }

  if (needs2FA) {
    console.log('');
    console.log('---------------------------------------------------');
    console.log('  LinkedIn needs verification (2FA / CAPTCHA).');
    console.log('  Complete it in the browser window that opened.');
    console.log('  Script will continue automatically once done.');
    console.log('  Waiting up to 2 minutes...');
    console.log('---------------------------------------------------');
    const deadline = Date.now() + 120_000;
    let verified = false;
    while (Date.now() < deadline) {
      await sleep(3000);
      if (await isLoggedIn(page)) { verified = true; break; }
    }
    if (!verified) { console.error('[login] Timed out waiting for 2FA. Re-run when ready.'); process.exit(2); }
    console.log('[login] Verification complete. Session saved for future runs.');
    return;
  }

  if (!(await isLoggedIn(page))) {
    console.error('[login] Login did not land on feed. Wrong password?');
    process.exit(1);
  }
  console.log('[login] Logged in. Session saved for future runs.');
}

async function main() {
  const modeTag = CONNECTIONS_ONLY ? '(CONNECTIONS ONLY) ' : '';
  console.log('[linkedin-dm] Starting ' + modeTag + (DRY_RUN ? '(DRY RUN) ' : '') + '— ' + new Date().toISOString());
  const creds = loadLinkedInCreds();
  const log   = loadLog();
  const dailyCap = Math.floor(Math.random() * 6) + 5;
  console.log('[linkedin-dm] Daily cap: ' + dailyCap + ' DMs');

  // ── Connections-only mode — no browser, no notifications ────────────────
  if (CONNECTIONS_ONLY) {
    const connections = loadConnectionsFile();
    const activeCards = loadAllActiveKanbanCards();
    const connEvents  = buildConnectionMatchEvents(connections, activeCards);
    console.log('[linkedin-dm] Connections: ' + connections.length + ' loaded. Active A/B cards: ' + activeCards.length + '. Matches: ' + connEvents.length + '.');

    if (connEvents.length === 0) {
      console.log('[linkedin-dm] No connection matches against current Kanban A/B cards.');
      process.exit(3);
    }

    console.log('[linkedin-dm] Connection matches:');
    for (const ev of connEvents) {
      console.log('  ' + ev.name + ' @ ' + ev.company + ' (' + ev.role + ')');
      console.log('    URL:     ' + ev.profileUrl);
      console.log('    Message: ' + ev._message.slice(0, 80) + (ev._message.length > 80 ? '...' : ''));
    }

    if (DRY_RUN) {
      console.log('[linkedin-dm] [DRY RUN] Would send ' + connEvents.length + ' message(s).');
      process.exit(0);
    }

    // Launch browser only for sending
    mkdirSync(SESSION_DIR, { recursive: true });
    const ctx  = await chromium.launchPersistentContext(SESSION_DIR, {
      headless: false,
      args: ['--disable-blink-features=AutomationControlled'],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    });
    await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
    const pg = await ctx.newPage();
    const runAt = new Date().toISOString();
    const today = runAt.slice(0, 10);
    const results = [];
    let sentCount = 0;
    try {
      await ensureLoggedIn(pg, creds);
      const candidates = connEvents.filter(ev => !alreadyMessaged(log, ev.profileUrl, ev.eventType)).slice(0, dailyCap);
      console.log('[linkedin-dm] ' + candidates.length + ' new (not messaged in 30 days).');
      for (const ev of candidates) {
        try {
          await sendDM(pg, ev, ev._message);
          results.push({ name: ev.name, profileUrl: ev.profileUrl, eventType: ev.eventType, detail: ev.detail, message: ev._message, sent_at: new Date().toISOString(), status: 'sent' });
          log.messaged.push({ name: ev.name, profileUrl: ev.profileUrl, eventType: ev.eventType, messaged_at: new Date().toISOString() });
          sentCount++;
          console.log('[linkedin-dm]   OK Sent to ' + ev.name + '.');
          if (candidates.indexOf(ev) < candidates.length - 1) await sleep(rand(3000, 8000));
        } catch (err) {
          console.error('[linkedin-dm]   FAILED for ' + ev.name + ': ' + err.message);
          results.push({ name: ev.name, profileUrl: ev.profileUrl, eventType: ev.eventType, detail: ev.detail, message: ev._message, sent_at: new Date().toISOString(), status: 'error', error: err.message });
        }
      }
    } finally {
      await ctx.close().catch(() => {});
    }
    const entry = { date: today, ran_at: runAt, sent: sentCount, skipped: 0, referral_sent: 0, connection_sent: sentCount, dry_run: DRY_RUN, messages: results };
    log.entries.push(entry);
    saveLog(log);
    console.log('[linkedin-dm] Done. Sent: ' + sentCount);
    process.exit(0);
  }

  // ── Normal mode ──────────────────────────────────────────────────────────
  mkdirSync(SESSION_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();
  const runAt = new Date().toISOString();
  const today = runAt.slice(0, 10);
  const results = [];
  let sentCount = 0;
  let skippedCount = 0;

  try {
    await ensureLoggedIn(page, creds);
    await sleep(rand(1000, 2000));

    console.log('[linkedin-dm] Navigating to notifications...');
    await page.goto('https://www.linkedin.com/notifications/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(1500, 3000));

    const rawEvents = await scrapeNotifications(page);
    console.log('[linkedin-dm] Found ' + rawEvents.length + ' notification event(s).');

    // Merge Kanban referral-review warm connections into the queue
    const referralQueue = loadReferralQueue();
    console.log('[linkedin-dm] Referral queue (Kanban): ' + referralQueue.length + ' warm connection(s).');

    // Merge connections file matches against active A/B Kanban cards
    const connections = loadConnectionsFile();
    const activeCards = loadAllActiveKanbanCards();
    const connEvents  = buildConnectionMatchEvents(connections, activeCards);
    console.log('[linkedin-dm] Connection matches (connections file × Kanban A/B): ' + connEvents.length + '.');

    const allEvents = [...rawEvents, ...referralQueue, ...connEvents];

    if (allEvents.length === 0) {
      console.log('[linkedin-dm] No events or referral queue entries today.');
      await context.close();
      process.exit(3);
    }

    const candidates = allEvents
      .filter(ev => ev.profileUrl && !alreadyMessaged(log, ev.profileUrl, ev.eventType))
      .slice(0, dailyCap);

    skippedCount = allEvents.length - candidates.length;
    console.log('[linkedin-dm] ' + candidates.length + ' candidate(s) after dedup (cap: ' + dailyCap + ').');

    if (candidates.length === 0) {
      console.log('[linkedin-dm] All events already messaged within 30 days.');
      await context.close();
      process.exit(3);
    }

    for (const event of candidates) {
      // warm_referral events carry a pre-generated voice message; others use generateMessage()
      const message = event._message || generateMessage(event);
      const preview = message.length > 60 ? message.slice(0, 60) + '...' : message;
      console.log('[linkedin-dm] -> ' + event.name + ' (' + event.eventType + '): "' + preview + '"');

      if (DRY_RUN) {
        console.log('[linkedin-dm]   [DRY RUN] Not sending.');
        results.push({ name: event.name, profileUrl: event.profileUrl, eventType: event.eventType, detail: event.detail, message, sent_at: new Date().toISOString(), status: 'dry_run' });
        sentCount++;
      } else {
        try {
          await sendDM(page, event, message);
          results.push({ name: event.name, profileUrl: event.profileUrl, eventType: event.eventType, detail: event.detail, message, sent_at: new Date().toISOString(), status: 'sent' });
          log.messaged.push({ name: event.name, profileUrl: event.profileUrl, eventType: event.eventType, messaged_at: new Date().toISOString() });
          sentCount++;
          console.log('[linkedin-dm]   OK Sent.');
          if (candidates.indexOf(event) < candidates.length - 1) {
            const pause = rand(3000, 8000);
            console.log('[linkedin-dm]   Pausing ' + (pause / 1000).toFixed(1) + 's...');
            await sleep(pause);
          }
        } catch (err) {
          console.error('[linkedin-dm]   FAILED for ' + event.name + ': ' + err.message);
          results.push({ name: event.name, profileUrl: event.profileUrl, eventType: event.eventType, detail: event.detail, message, sent_at: new Date().toISOString(), status: 'error', error: err.message });
        }
      }
    }

  } catch (err) {
    console.error('[linkedin-dm] Fatal error: ' + err.message);
    await context.close().catch(() => {});
    process.exit(1);
  }

  await context.close();

  const referralSent    = results.filter(r => r.eventType === 'warm_referral'    && r.status === 'sent').length;
  const connectionSent  = results.filter(r => r.eventType === 'connection_match' && r.status === 'sent').length;
  const entry = { date: today, ran_at: runAt, sent: sentCount, skipped: skippedCount, referral_sent: referralSent, connection_sent: connectionSent, dry_run: DRY_RUN, messages: results };
  log.entries.push(entry);
  saveLog(log);

  console.log('[linkedin-dm] Done. Sent: ' + sentCount + ' | Skipped: ' + skippedCount);
  console.log('[linkedin-dm] Log -> data/linkedin-dm-log.json');
  process.exit(0);
}

main().catch(err => {
  console.error('[linkedin-dm] Unhandled error:', err);
  process.exit(1);
});
