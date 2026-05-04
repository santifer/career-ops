#!/usr/bin/env node

/**
 * scan-and-notify.mjs
 *
 * Runs the zero-token portal scan, then sends an email to NOTIFY_EMAIL
 * only if new roles were added to the pipeline.
 *
 * Usage:
 *   node scan-and-notify.mjs            # scan + notify
 *   node scan-and-notify.mjs --dry-run  # preview email without sending
 *
 * Requires in .env:
 *   GMAIL_USER=you@gmail.com
 *   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   (Gmail App Password)
 *   NOTIFY_EMAIL=you@gmail.com               (defaults to GMAIL_USER)
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createTransport } from 'nodemailer';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY_RUN = process.argv.includes('--dry-run');
const SCAN_HISTORY_PATH = path.join(__dirname, 'data/scan-history.tsv');
const today = new Date().toISOString().slice(0, 10);

// ── Read "added" entries for today from scan-history.tsv ────────────

function getAddedToday() {
  if (!existsSync(SCAN_HISTORY_PATH)) return [];
  return readFileSync(SCAN_HISTORY_PATH, 'utf-8')
    .split('\n')
    .slice(1) // skip header
    .filter(line => {
      const parts = line.split('\t');
      return parts[1] === today && parts[5]?.trim() === 'added' && parts[0];
    })
    .map(line => {
      const [url, , source, title, company] = line.split('\t');
      return { url: url.trim(), title: title?.trim() || '', company: company?.trim() || '', source: source?.trim() || '' };
    });
}

// ── Run scan ─────────────────────────────────────────────────────────

const beforeCount = getAddedToday().length;

console.log(`[scan-and-notify] Starting scan at ${new Date().toLocaleTimeString()} (${today})`);
console.log(`[scan-and-notify] Roles already added today before this scan: ${beforeCount}`);

if (!DRY_RUN) {
  try {
    execSync('node scan.mjs', {
      stdio: 'inherit',
      cwd: __dirname,
    });
  } catch (err) {
    console.error('[scan-and-notify] Scan failed:', err.message);
    process.exit(1);
  }
} else {
  console.log('[scan-and-notify] --dry-run: skipping actual scan');
}

// ── Check for new entries ─────────────────────────────────────────────

const afterEntries = getAddedToday();
const newEntries = afterEntries.slice(beforeCount);

if (newEntries.length === 0) {
  console.log('[scan-and-notify] No new roles found — skipping email.');
  process.exit(0);
}

console.log(`[scan-and-notify] ${newEntries.length} new role(s) found:`);
for (const e of newEntries) {
  console.log(`  + ${e.company} | ${e.title}`);
}

// ── Build email ───────────────────────────────────────────────────────

const recipient = process.env.NOTIFY_EMAIL || process.env.GMAIL_USER;
const subject = `career-ops: ${newEntries.length} new role${newEntries.length !== 1 ? 's' : ''} found — ${today}`;

const textBody = [
  `career-ops portal scan — ${today}`,
  ``,
  `${newEntries.length} new role${newEntries.length !== 1 ? 's' : ''} added to your pipeline:`,
  ``,
  ...newEntries.map(j => `• ${j.company} — ${j.title}\n  ${j.url}`),
  ``,
  `---`,
  `Run /career-ops pipeline in Claude Code to evaluate them.`,
].join('\n');

const htmlRows = newEntries.map(j => `
  <tr>
    <td style="padding:10px 12px;border-bottom:1px solid #eee">
      <strong>${j.company}</strong><br>
      <span style="color:#555">${j.title}</span><br>
      <a href="${j.url}" style="font-size:12px;color:#0066cc">${j.url}</a>
    </td>
  </tr>`).join('');

const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;color:#222;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 4px">career-ops</h2>
  <p style="margin:0 0 20px;color:#666;font-size:14px">${today} · portal scan</p>

  <p><strong>${newEntries.length} new role${newEntries.length !== 1 ? 's' : ''}</strong> added to your pipeline:</p>

  <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:6px">
    ${htmlRows}
  </table>

  <p style="margin-top:20px;padding:12px 16px;background:#f5f5f5;border-radius:6px;font-size:13px">
    Run <code>/career-ops pipeline</code> in Claude Code to evaluate them.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="font-size:11px;color:#999">career-ops · automated scan · ${new Date().toISOString()}</p>
</body>
</html>`;

// ── Send email ────────────────────────────────────────────────────────

if (DRY_RUN) {
  console.log('\n[dry-run] Would send email:');
  console.log(`  To:      ${recipient}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Body:\n${textBody}`);
  process.exit(0);
}

if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
  console.error('[scan-and-notify] Missing GMAIL_USER or GMAIL_APP_PASSWORD in .env');
  console.error('  See .env.example for setup instructions.');
  process.exit(1);
}

const transporter = createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

try {
  await transporter.sendMail({
    from: `"career-ops 🔍" <${process.env.GMAIL_USER}>`,
    to: recipient,
    subject,
    text: textBody,
    html: htmlBody,
  });
  console.log(`[scan-and-notify] ✉️  Email sent to ${recipient}`);
} catch (err) {
  console.error('[scan-and-notify] Failed to send email:', err.message);
  process.exit(1);
}
