// services/telegram-listener.mjs
// Telegram long-poll listener daemon.
//
// Exports:
//   ALLOWLIST_REJECT — Symbol returned when update.message.from.id is not in the allowlist.
//   parseCommand(text) — { cmd, args } parser.
//   handleUpdate({ update, db, allowlist, notifyChatId, send }) — async dispatcher.
//   main() — daemon entry point; long-poll loop.
//
// Env (used by main() only):
//   TELEGRAM_BOT_TOKEN         — required
//   TELEGRAM_ALLOWLIST         — CSV of integer user IDs (required, or exit 5)
//   TELEGRAM_NOTIFY_CHAT_ID    — numeric chat ID for outbound notifications (required, or exit 5)

import crypto from 'node:crypto';
import { validateUrl } from './url-validate.mjs';
import { checkDuplicate } from './dedup.mjs';
import { insertQueueRow, requestCancel, selectQueueLen, upsertTelegramOffset, selectTelegramOffset } from './queue.mjs';

// ── Public sentinel ─────────────────────────────────────────────────────────

export const ALLOWLIST_REJECT = Symbol('ALLOWLIST_REJECT');

// ── parseCommand ────────────────────────────────────────────────────────────

/**
 * Parse a Telegram message text into { cmd, args }.
 * If the text starts with '/', cmd is the command word (without '/'); otherwise cmd is ''.
 * args is the remainder (trimmed).
 *
 * @param {string} text
 * @returns {{ cmd: string, args: string }}
 */
export function parseCommand(text) {
  if (!text || !text.startsWith('/')) return { cmd: '', args: (text || '').trim() };
  const [head, ...rest] = text.trim().split(/\s+/);
  const cmd = head.slice(1).toLowerCase();   // strip leading '/'
  const args = rest.join(' ').trim();
  return { cmd, args };
}

// ── handleUpdate ────────────────────────────────────────────────────────────

/**
 * Dispatch a single Telegram update.
 *
 * @param {{ update: object, db: object, allowlist: Set<number>, notifyChatId: number, send: function }} opts
 * @returns {Promise<symbol|null|object>} ALLOWLIST_REJECT | null (no-message update) | dispatch result
 */
export async function handleUpdate({ update, db, allowlist, notifyChatId, send }) {
  const message = update.message;

  // Updates with no message object at all → ignore silently.
  if (!message) return null;

  // §8.3 check 1: per-message user allowlist check fires BEFORE text guard.
  // Not replying to non-allowlisted senders — replying would confirm the bot to scanners.
  const fromId = message.from && message.from.id;
  if (!allowlist.has(fromId)) {
    console.warn(`[telegram-listener] WARN: update from non-allowlisted user ${fromId} — ignored`);
    return ALLOWLIST_REJECT;
  }

  // Updates with no text body (e.g. photos, stickers, edited_message) → ignore.
  if (!message.text) return null;

  const chatId = message.chat && message.chat.id;
  const { cmd, args } = parseCommand(message.text);

  switch (cmd) {
    case 'start':
      await send('👋 Hi! Send /help for a list of commands.');
      return { cmd };

    case 'help':
      await send(
        '📋 Commands:\n' +
        '/add <url>    — Queue a job URL for processing\n' +
        '/status       — Show current pipeline status\n' +
        '/queue        — List up to 10 queued URLs\n' +
        '/cancel <id>  — Cancel a queued or running job\n' +
        '/help         — Show this message'
      );
      return { cmd };

    case 'status': {
      const waiting = selectQueueLen(db, 'queued');
      const running = selectQueueLen(db, 'running');
      await send(`📊 Status\nQueue: ${waiting} waiting · ${running} running`);
      return { cmd };
    }

    case 'queue': {
      const rows = db.prepare(
        `SELECT id, url, added_at FROM queue WHERE status='queued' ORDER BY id LIMIT 10`
      ).all();
      if (rows.length === 0) {
        await send('📭 Queue is empty.');
      } else {
        const lines = rows.map(r => {
          let host = r.url;
          try { host = new URL(r.url).hostname; } catch { /* keep raw */ }
          return `#${r.id}  ${host}`;
        });
        await send('📋 Next in queue:\n' + lines.join('\n'));
      }
      return { cmd };
    }

    case 'add': {
      const url = args.trim();
      if (!url) {
        await send('❌ Usage: /add <url>');
        return { cmd, error: 'missing_url' };
      }

      // Validate URL (SSRF-safe).
      const validation = validateUrl(url);
      if (!validation.ok) {
        await send(`❌ Invalid URL: ${validation.error}`);
        return { cmd, error: validation.error };
      }

      // Dedup check (single logical txn via dedup.mjs).
      const urlHash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
      const dup = checkDuplicate(db, url);
      if (dup.type === 'in_queue') {
        await send(`ℹ️ Already in queue as #${dup.existingId}`);
        return { cmd, dedup: dup.type };
      }
      if (dup.type === 'recent_success') {
        await send(`ℹ️ Already done in last 24h (run #${dup.runId}). Send /readd <queue_id> to force.`);
        return { cmd, dedup: dup.type };
      }

      // Insert.
      const queueId = insertQueueRow(db, {
        url,
        urlHash,
        addedBy:      fromId,
        telegramMsgId: message.message_id,
      });

      // Update Telegram offset state in the same logical operation.
      // (The real long-poll loop does this in a single txn; here we do it post-insert.)
      if (chatId && update.update_id) {
        upsertTelegramOffset(db, chatId, update.update_id);
      }

      let host = url;
      try { host = new URL(url).hostname; } catch { /* keep raw */ }
      const waiting = selectQueueLen(db, 'queued');
      await send(`✅ Queued #${queueId}: ${host} (position ${waiting})`);
      return { cmd, queueId };
    }

    case 'cancel': {
      const id = parseInt(args.trim(), 10);
      if (!Number.isFinite(id) || id <= 0) {
        await send('❌ Usage: /cancel <queue_id>');
        return { cmd, error: 'invalid_id' };
      }
      requestCancel(db, id);
      await send(`🛑 Cancel requested for #${id}; takes effect at next phase boundary.`);
      return { cmd, queueId: id };
    }

    default: {
      // Unknown command — give a hint.
      if (cmd) {
        await send(`❓ Unknown command /${cmd}. Send /help for a list of commands.`);
      }
      return { cmd: cmd || null };
    }
  }
}

// ── main (daemon) ────────────────────────────────────────────────────────────

/**
 * Long-poll daemon.  Reads env, builds allowlist, opens DB, loops.
 * Exits with code 5 if TELEGRAM_ALLOWLIST or TELEGRAM_NOTIFY_CHAT_ID is missing.
 */
export async function main() {
  // Hard-coded allowlist enforcement — defense in depth.
  const allowlistEnv  = process.env.TELEGRAM_ALLOWLIST  || '';
  const notifyChatEnv = process.env.TELEGRAM_NOTIFY_CHAT_ID || '';

  if (!allowlistEnv.trim() || !notifyChatEnv.trim()) {
    console.error('[telegram-listener] FATAL: TELEGRAM_ALLOWLIST and TELEGRAM_NOTIFY_CHAT_ID must both be set. Exiting with code 5.');
    process.exit(5);
  }

  const allowlist = new Set(
    allowlistEnv.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0)
  );
  if (allowlist.size === 0) {
    console.error('[telegram-listener] FATAL: TELEGRAM_ALLOWLIST parsed to an empty set. Exiting with code 5.');
    process.exit(5);
  }
  const notifyChatId = parseInt(notifyChatEnv.trim(), 10);

  // Lazy-import DB + telegram-client so unit tests can import this module without them.
  const { initDb } = await import('./db.mjs');
  const { getUpdates, sendMessage } = await import('./telegram-client.mjs');

  const projectRoot = process.env.PROJECT_ROOT || process.cwd();
  const { join } = await import('node:path');
  const dbPath = join(projectRoot, 'ops', 'work-queue.db');
  const db = initDb(dbPath);

  const send = (text) => sendMessage(text, { chatId: notifyChatId });

  console.log(`[telegram-listener] Started. Allowlist: ${[...allowlist].join(',')}. Notify chat: ${notifyChatId}`);

  let offset = selectTelegramOffset(db, notifyChatId);
  let backoffMs = 0;

  // Long-poll loop.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (backoffMs > 0) {
      await new Promise(r => setTimeout(r, backoffMs));
    }

    let updates;
    try {
      updates = await getUpdates({ offset, timeout: 30 });
      backoffMs = 0;   // reset on success
    } catch (err) {
      const nextBackoff = Math.min((backoffMs || 5_000) * 3, 15 * 60_000);
      console.error(`[telegram-listener] getUpdates error: ${err.message}. Backing off ${nextBackoff}ms.`);
      backoffMs = nextBackoff;
      continue;
    }

    for (const update of updates) {
      try {
        await handleUpdate({ update, db, allowlist, notifyChatId, send });
      } catch (err) {
        console.error(`[telegram-listener] handleUpdate error for update_id=${update.update_id}: ${err.message}`);
      }

      // Advance offset (Telegram: offset = last update_id + 1).
      offset = update.update_id + 1;
      upsertTelegramOffset(db, notifyChatId, update.update_id);
    }
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

// Run main() when executed directly (not when imported by tests).
const isMain = process.argv[1] && process.argv[1].endsWith('telegram-listener.mjs');
if (isMain) {
  main().catch(err => {
    console.error('[telegram-listener] Unhandled error in main():', err);
    process.exit(1);
  });
}
