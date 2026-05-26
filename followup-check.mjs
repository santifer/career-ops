#!/usr/bin/env node

/**
 * followup-check.mjs — Check for applications needing follow-up
 *
 * Scans data/applications.md for "Applied" rows older than N business days
 * without a status change. Sends Telegram notification for each.
 *
 * Usage:
 *   node followup-check.mjs              # check and notify (default: 5 business days)
 *   node followup-check.mjs --days 7     # custom threshold
 *   node followup-check.mjs --dry-run    # show what would notify, don't send
 *
 * Designed to run daily via cron on CT 203 (after the scanner).
 * Wire into telegram-listener.mjs for "follow up" / "status" replies.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { loadTelegramConfig, sendMessage } from './lib/telegram.mjs';

const PROJECT_DIR = resolve(import.meta.dirname || '.');
const TRACKER_FILE = join(PROJECT_DIR, 'data/applications.md');
const FOLLOWUP_FILE = join(PROJECT_DIR, 'data/follow-ups.md');

// ── Parse args ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const daysIdx = args.indexOf('--days');
const THRESHOLD_DAYS = daysIdx !== -1 ? parseInt(args[daysIdx + 1]) : 5;

// ── Business day calculator ───────────────────────────────────────────

function businessDaysBetween(startDate, endDate) {
  let count = 0;
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

// ── Tracker parser ────────────────────────────────────────────────────

function getAppliedRows() {
  if (!existsSync(TRACKER_FILE)) return [];

  const content = readFileSync(TRACKER_FILE, 'utf-8');
  const rows = [];

  for (const line of content.split('\n')) {
    if (!line.startsWith('|') || line.includes('---') || line.includes('Date')) continue;

    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 9) continue;

    const [num, date, company, role, score, status, , , notes] = cells;
    if (status !== 'Applied') continue;

    // Extract application date from notes (e.g., "Applied 2026-05-25 via...")
    const appDateMatch = notes?.match(/Applied (\d{4}-\d{2}-\d{2})/);
    const appliedDate = appDateMatch ? appDateMatch[1] : date;

    rows.push({ num, date: appliedDate, company, role, score, notes });
  }

  return rows;
}

// ── Follow-up history ─────────────────────────────────────────────────

function getFollowUpHistory() {
  if (!existsSync(FOLLOWUP_FILE)) return {};
  const content = readFileSync(FOLLOWUP_FILE, 'utf-8');
  const history = {};

  for (const line of content.split('\n')) {
    const m = line.match(/^\| (\d+) \| (.+?) \| (.+?) \| (.+?) \| (.+?) \|$/);
    if (m) {
      const [, num, date, company, , action] = m;
      if (!history[num]) history[num] = [];
      history[num].push({ date, company, action });
    }
  }
  return history;
}

function recordFollowUp(num, company, role, action) {
  const today = new Date().toISOString().slice(0, 10);
  mkdirSync(join(PROJECT_DIR, 'data'), { recursive: true });

  let content = '';
  if (existsSync(FOLLOWUP_FILE)) {
    content = readFileSync(FOLLOWUP_FILE, 'utf-8');
  } else {
    content = `# Follow-Up History\n\n| # | Date | Company | Role | Action |\n|---|------|---------|------|--------|\n`;
  }

  content += `| ${num} | ${today} | ${company} | ${role} | ${action} |\n`;
  writeFileSync(FOLLOWUP_FILE, content);
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const applied = getAppliedRows();
  const history = getFollowUpHistory();

  if (applied.length === 0) {
    console.log('No "Applied" rows in tracker.');
    return;
  }

  console.log(`📋 Checking ${applied.length} applied roles (threshold: ${THRESHOLD_DAYS} business days)\n`);

  const needsFollowUp = [];

  for (const row of applied) {
    const daysSince = businessDaysBetween(row.date, today);
    const prevFollowUps = history[row.num] || [];
    const lastFollowUp = prevFollowUps[prevFollowUps.length - 1];

    // Check if we've already notified recently (within 3 business days of last notification)
    if (lastFollowUp) {
      const daysSinceLastFollowUp = businessDaysBetween(lastFollowUp.date, today);
      if (daysSinceLastFollowUp < 3) {
        console.log(`  ⏭️ #${row.num} ${row.company} — followed up ${daysSinceLastFollowUp}d ago, skipping`);
        continue;
      }
    }

    if (daysSince >= THRESHOLD_DAYS) {
      needsFollowUp.push({ ...row, daysSince, followUpCount: prevFollowUps.length });
      console.log(`  ⏰ #${row.num} ${row.company} — ${row.role} (${daysSince} business days, ${prevFollowUps.length} prior follow-ups)`);
    } else {
      console.log(`  ✅ #${row.num} ${row.company} — ${daysSince}/${THRESHOLD_DAYS} days (not yet)`);
    }
  }

  if (needsFollowUp.length === 0) {
    console.log('\n✅ No applications need follow-up yet.');
    return;
  }

  // Build Telegram message
  let msg = `<b>📬 Follow-up reminder</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `${needsFollowUp.length} application${needsFollowUp.length !== 1 ? 's' : ''} with no response:\n\n`;

  for (const row of needsFollowUp) {
    msg += `<b>#${row.num} ${row.company}</b> — ${row.role}\n`;
    msg += `  Applied ${row.daysSince} business days ago`;
    if (row.followUpCount > 0) msg += ` (${row.followUpCount} prior follow-up${row.followUpCount !== 1 ? 's' : ''})`;
    msg += '\n';
  }

  msg += `\n<i>Reply "follow up #N" to send a follow-up, or "wait #N" to snooze.</i>`;

  if (dryRun) {
    console.log('\n── DRY RUN ──\n');
    console.log(msg);
    return;
  }

  // Send notification
  const config = loadTelegramConfig(join(PROJECT_DIR, '.env'));
  if (!config.token || !config.chatId) {
    console.log('No Telegram credentials — printing instead:');
    console.log(msg);
    return;
  }

  try {
    await sendMessage(config, config.chatId, msg);
    console.log(`\n✅ Follow-up reminder sent to Telegram (${needsFollowUp.length} roles)`);

    // Record that we notified
    for (const row of needsFollowUp) {
      recordFollowUp(row.num, row.company, row.role, 'reminder-sent');
    }
  } catch (err) {
    console.error(`❌ Telegram send failed: ${err.message}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
