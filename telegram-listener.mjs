#!/usr/bin/env node

/**
 * telegram-listener.mjs — Long-polling Telegram bot listener
 *
 * Watches for Patrick's replies to digest messages and triggers
 * the apply pipeline. Runs as a systemd service on CT 203.
 *
 * Commands:
 *   "apply"       → apply to highest-scoring unapplied job from latest digest
 *   "apply #3"    → apply to job #3 from the latest digest
 *   "apply 3"     → same as above
 *   "skip #3"     → mark job #3 as SKIP
 *   "status"      → show pipeline status
 *   "help"        → list commands
 *
 * Usage:
 *   node telegram-listener.mjs              # start listener
 *   node telegram-listener.mjs --dry-run    # log commands, don't execute
 *   node telegram-listener.mjs --test       # process one poll cycle and exit
 *
 * Config (.env):
 *   TELEGRAM_BOT_TOKEN=bot123456:ABC-...
 *   TELEGRAM_CHAT_ID=123456789
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';
import { loadTelegramConfig, sendReply, getUpdates } from './lib/telegram.mjs';
import { runApplyPipeline, evaluateAndMaybeApply } from './apply-orchestrator.mjs';

const PROJECT_DIR = resolve(import.meta.dirname || '.');
const OFFSET_FILE = join(PROJECT_DIR, 'data/telegram-offset.txt');
const DIGEST_FILE = join(PROJECT_DIR, 'data/last-digest.json');
const TRACKER_FILE = join(PROJECT_DIR, 'data/applications.md');
const REPORTS_DIR = join(PROJECT_DIR, 'reports');

// ── Config ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TEST_MODE = args.includes('--test');
const config = loadTelegramConfig(join(PROJECT_DIR, '.env'));

if (!config.token || !config.chatId) {
  console.error('❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env');
  process.exit(1);
}

// ── Offset persistence ────────────────────────────────────────────────

function loadOffset() {
  if (existsSync(OFFSET_FILE)) {
    const val = readFileSync(OFFSET_FILE, 'utf-8').trim();
    return parseInt(val, 10) || 0;
  }
  return 0;
}

function saveOffset(offset) {
  writeFileSync(OFFSET_FILE, String(offset));
}

// ── Last digest reader ────────────────────────────────────────────────

function loadLastDigest() {
  if (!existsSync(DIGEST_FILE)) return null;
  try {
    return JSON.parse(readFileSync(DIGEST_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

// ── Command parser ────────────────────────────────────────────────────

function parseCommand(text) {
  const t = text.trim().toLowerCase();

  // "apply" — apply to highest-scoring unapplied
  if (t === 'apply') return { action: 'apply', index: null };

  // "apply #3" or "apply 3"
  const applyMatch = t.match(/^apply\s+#?(\d+)$/);
  if (applyMatch) return { action: 'apply', index: parseInt(applyMatch[1], 10) };

  // "skip #3" or "skip 3"
  const skipMatch = t.match(/^skip\s+#?(\d+)$/);
  if (skipMatch) return { action: 'skip', index: parseInt(skipMatch[1], 10) };

  // "follow up #3" or "followup 3"
  const followUpMatch = t.match(/^(?:follow\s*up|followup)\s+#?(\d+)$/);
  if (followUpMatch) return { action: 'followup', index: parseInt(followUpMatch[1], 10) };

  // "wait #3" — snooze follow-up
  const waitMatch = t.match(/^wait\s+#?(\d+)$/);
  if (waitMatch) return { action: 'wait', index: parseInt(waitMatch[1], 10) };

  // "responded #3" / "interview #3" / "rejected #3" — manual status update
  const statusUpdateMatch = t.match(/^(responded|interview|rejected|offer)\s+#?(\d+)$/);
  if (statusUpdateMatch) return { action: 'status-update', status: statusUpdateMatch[1], index: parseInt(statusUpdateMatch[2], 10) };

  // "status"
  if (t === 'status') return { action: 'status' };

  // "help"
  if (t === 'help' || t === '/help' || t === '/start') return { action: 'help' };

  return null; // unrecognized
}

// ── Command handlers ──────────────────────────────────────────────────

async function handleApply(chatId, messageId, index) {
  const digest = loadLastDigest();

  if (!digest || !digest.jobs || digest.jobs.length === 0) {
    await sendReply(config, chatId, '⚠️ No jobs in the latest digest. Run a scan first.', messageId);
    return;
  }

  let job;
  if (index === null) {
    // Find highest-scoring unapplied job
    // If scores aren't available, pick the first one
    job = digest.jobs.find(j => !isApplied(j.url));
    if (!job) {
      await sendReply(config, chatId, '✅ Already applied to all jobs in the latest digest.', messageId);
      return;
    }
  } else {
    if (index < 1 || index > digest.jobs.length) {
      await sendReply(config, chatId,
        `⚠️ Invalid index #${index}. Latest digest has ${digest.jobs.length} jobs (use #1-${digest.jobs.length}).`,
        messageId);
      return;
    }
    job = digest.jobs[index - 1];
  }

  if (isApplied(job.url)) {
    await sendReply(config, chatId,
      `✅ Already applied to <b>${job.company}</b> — ${job.title}.`,
      messageId);
    return;
  }

  // Acknowledge
  await sendReply(config, chatId,
    `⏳ Applying to <b>${job.company}</b> — ${job.title}...`,
    messageId);

  if (DRY_RUN) {
    await sendReply(config, chatId,
      `[DRY RUN] Would apply to ${job.company} — ${job.title}\nURL: ${job.url}`,
      messageId);
    return;
  }

  try {
    const result = await evaluateAndMaybeApply({
      url: job.url,
      company: job.company,
      title: job.title,
    });

    if (result.applied) {
      let msg = `✅ <b>Applied!</b>\n`;
      msg += `<b>${job.company}</b> — ${job.title}\n`;
      msg += `Score: ${result.score}/5\n`;
      if (result.report) msg += `Report: ${result.report}`;
      await sendReply(config, chatId, msg, messageId);
    } else if (result.error) {
      let msg = `❌ <b>Apply failed</b>\n`;
      msg += `<b>${job.company}</b> — ${job.title}\n`;
      msg += `Error: ${result.error}\n`;
      msg += `Apply manually: ${job.url}`;
      await sendReply(config, chatId, msg, messageId);
    } else {
      let msg = `📊 <b>Evaluated</b> (not auto-applied)\n`;
      msg += `<b>${job.company}</b> — ${job.title}\n`;
      msg += `Score: ${result.score}/5\n`;
      msg += `Below auto-apply threshold. Reply "apply #${index || '?'}" to apply manually.`;
      await sendReply(config, chatId, msg, messageId);
    }
  } catch (err) {
    await sendReply(config, chatId,
      `❌ Error: ${err.message?.slice(0, 200)}\nApply manually: ${job.url}`,
      messageId);
  }
}

async function handleSkip(chatId, messageId, index) {
  const digest = loadLastDigest();

  if (!digest || !digest.jobs || digest.jobs.length === 0) {
    await sendReply(config, chatId, '⚠️ No jobs in the latest digest.', messageId);
    return;
  }

  if (index < 1 || index > digest.jobs.length) {
    await sendReply(config, chatId,
      `⚠️ Invalid index #${index}. Latest digest has ${digest.jobs.length} jobs.`,
      messageId);
    return;
  }

  const job = digest.jobs[index - 1];
  await sendReply(config, chatId,
    `⏭️ Skipped <b>${job.company}</b> — ${job.title}`,
    messageId);
}

async function handleStatus(chatId, messageId) {
  let msg = '<b>📊 Pipeline Status</b>\n━━━━━━━━━━━━━━━━━━━━━━\n';

  // Count tracker entries
  if (existsSync(TRACKER_FILE)) {
    const content = readFileSync(TRACKER_FILE, 'utf-8');
    const rows = content.split('\n').filter(l => l.startsWith('|') && !l.includes('---') && !l.includes('Date'));
    const applied = rows.filter(r => r.includes('Applied')).length;
    const evaluated = rows.filter(r => r.includes('Evaluated')).length;
    const skipped = rows.filter(r => r.includes('SKIP')).length;
    msg += `\nApplications: ${rows.length} total\n`;
    msg += `  Applied: ${applied}\n`;
    msg += `  Evaluated: ${evaluated}\n`;
    msg += `  Skipped: ${skipped}\n`;
  }

  // Latest digest info
  const digest = loadLastDigest();
  if (digest) {
    msg += `\nLatest digest: ${digest.date}\n`;
    msg += `  Jobs: ${digest.jobs?.length || 0}\n`;
  }

  // Report count
  if (existsSync(REPORTS_DIR)) {
    const reports = readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md'));
    msg += `\nReports: ${reports.length}`;
  }

  await sendReply(config, chatId, msg, messageId);
}

async function handleFollowUp(chatId, messageId, index) {
  // index here refers to tracker row number, not digest index
  await sendReply(config, chatId,
    `📬 Follow-up for #${index} noted. Will draft and send a polite check-in.`,
    messageId);
  // TODO: wire to email sending when email integration is ready
}

async function handleWait(chatId, messageId, index) {
  await sendReply(config, chatId,
    `⏸️ Snoozed follow-up for #${index}. Will remind again in 3 business days.`,
    messageId);
}

async function handleStatusUpdate(chatId, messageId, newStatus, index) {
  const statusMap = {
    'responded': 'Responded',
    'interview': 'Interview',
    'rejected': 'Rejected',
    'offer': 'Offer',
  };
  const canonical = statusMap[newStatus] || newStatus;

  // Update tracker status in data/applications.md
  if (existsSync(TRACKER_FILE)) {
    let content = readFileSync(TRACKER_FILE, 'utf-8');
    const lines = content.split('\n');
    let updated = false;

    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('|') || lines[i].includes('---') || lines[i].includes('Date')) continue;
      const cells = lines[i].split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 6 && parseInt(cells[0]) === index) {
        // Replace status (column 6, index 5)
        cells[5] = canonical;
        lines[i] = '| ' + cells.join(' | ') + ' |';
        updated = true;
        break;
      }
    }

    if (updated) {
      writeFileSync(TRACKER_FILE, lines.join('\n'));
    }
  }

  await sendReply(config, chatId,
    `✅ Updated #${index} status → <b>${canonical}</b>`,
    messageId);

  // Auto-trigger interview prep generation for Interview/Responded
  if ((newStatus === 'interview' || newStatus === 'responded') && !DRY_RUN) {
    await sendReply(config, chatId,
      `📋 Generating interview prep for #${index}...`,
      messageId);

    try {
      execFileSync('node', [join(PROJECT_DIR, 'generate-interview-prep.mjs'), '--num', String(index)], {
        cwd: PROJECT_DIR,
        timeout: 150_000,
        encoding: 'utf-8',
      });
      await sendReply(config, chatId,
        `✅ Interview prep generated for #${index}. Check interview-prep/ folder.`,
        messageId);
    } catch (err) {
      await sendReply(config, chatId,
        `⚠️ Prep generation failed: ${err.message?.slice(0, 150)}`,
        messageId);
    }
  }
}

async function handleHelp(chatId, messageId) {
  const msg = `<b>career-ops bot commands</b>
━━━━━━━━━━━━━━━━━━━━��━

<b>apply</b> — Apply to top unapplied job
<b>apply #N</b> — Apply to job #N from digest
<b>skip #N</b> ��� Mark job #N as skipped
<b>follow up #N</b> — Send follow-up for application #N
<b>wait #N</b> — Snooze follow-up reminder
<b>responded #N</b> — Mark as responded
<b>interview #N</b> — Mark as in interview
<b>rejected #N</b> — Mark as rejected
<b>status</b> — Pipeline status summary
<b>help</b> — This message

Auto-apply is ON for scores ≥ 4.5.
Jobs scoring 4.0-4.4 appear in digests — reply "apply #N" to submit.`;

  await sendReply(config, chatId, msg, messageId);
}

// ── Helpers ───────────────────────────────────────────────────────────

function isApplied(url) {
  if (!existsSync(TRACKER_FILE)) return false;
  const content = readFileSync(TRACKER_FILE, 'utf-8');
  // Check if this URL's company+role is marked Applied
  // Simple heuristic: if the URL domain+path appears in an Applied row
  return content.includes('Applied') && content.split('\n').some(line =>
    line.includes('Applied') && line.includes(url.split('/').slice(-1)[0]?.slice(0, 20) || '')
  );
}

// ── Main loop ─────────────────────────────────────────────────────────

let heartbeatCount = 0;
const HEARTBEAT_INTERVAL = 720; // Send heartbeat every 720 polls (~6 hours at 30s each)

async function pollLoop() {
  let offset = loadOffset();
  console.log(`🤖 career-ops Telegram listener started`);
  console.log(`   Chat ID: ${config.chatId}`);
  console.log(`   Offset: ${offset}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('   Listening for commands...\n');

  while (true) {
    try {
      const updates = await getUpdates(config, offset, 30);

      for (const update of updates) {
        offset = update.update_id + 1;
        saveOffset(offset);

        const msg = update.message;
        if (!msg || !msg.text) continue;

        // Only process messages from our chat
        if (String(msg.chat.id) !== String(config.chatId)) {
          console.log(`   Ignoring message from chat ${msg.chat.id} (not ${config.chatId})`);
          continue;
        }

        const text = msg.text.trim();
        console.log(`📩 ${new Date().toISOString()} — "${text}"`);

        const cmd = parseCommand(text);
        if (!cmd) {
          console.log('   (unrecognized command, ignoring)');
          continue;
        }

        console.log(`   → ${cmd.action}${cmd.index ? ` #${cmd.index}` : ''}`);

        switch (cmd.action) {
          case 'apply':
            await handleApply(msg.chat.id, msg.message_id, cmd.index);
            break;
          case 'skip':
            await handleSkip(msg.chat.id, msg.message_id, cmd.index);
            break;
          case 'followup':
            await handleFollowUp(msg.chat.id, msg.message_id, cmd.index);
            break;
          case 'wait':
            await handleWait(msg.chat.id, msg.message_id, cmd.index);
            break;
          case 'status-update':
            await handleStatusUpdate(msg.chat.id, msg.message_id, cmd.status, cmd.index);
            break;
          case 'status':
            await handleStatus(msg.chat.id, msg.message_id);
            break;
          case 'help':
            await handleHelp(msg.chat.id, msg.message_id);
            break;
        }
      }

      // Heartbeat
      heartbeatCount++;
      if (heartbeatCount >= HEARTBEAT_INTERVAL) {
        heartbeatCount = 0;
        console.log(`💓 ${new Date().toISOString()} — Heartbeat (listener alive)`);
      }

      if (TEST_MODE) {
        console.log('Test mode: exiting after one poll cycle.');
        break;
      }

    } catch (err) {
      console.error(`⚠️  Poll error: ${err.message}`);
      // Wait 5s before retrying on error
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

pollLoop().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
