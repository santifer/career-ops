#!/usr/bin/env node
/**
 * tools/send-application-mail.mjs — send a careerops email with PDF attachments
 *
 * Designed for the career-ops apply workflow: rate-screen messages, cover-letter
 * submissions, and recruiter follow-ups. Provider-agnostic via .env.mail —
 * works with Gmail (App Password), Mailcow, any SMTP relay.
 *
 * Usage:
 *   node tools/send-application-mail.mjs \
 *     --to "Recruiter Name <recruiter@example.com>" \
 *     --subject "Senior AI Engineer — rate-band screen" \
 *     --body batch/apply-docs/000-rate-screen-emails.md \
 *     --section "## Email 1" \
 *     --attach output/NNN-company-role-cv-YYYY-MM-DD.pdf \
 *     [--dry-run]
 *
 * Flags:
 *   --to        Recipient. Accepts "Name <addr>" or bare "addr".
 *   --subject   Subject line.
 *   --body      Path to a markdown file holding the body.
 *   --section   (optional) Heading inside --body to extract verbatim. Useful
 *               when the markdown file holds multiple emails. Matches the
 *               line beginning "## <section>" and stops at the next "##".
 *               If omitted, the entire --body file is sent.
 *   --attach    File path to attach. Repeatable.
 *   --cc        CC recipient. Repeatable.
 *   --bcc       BCC recipient. Repeatable.
 *   --reply-to  Reply-To header.
 *   --from      Override From header (default: SMTP_FROM in .env.mail).
 *   --html      If set, send body as HTML instead of plain text.
 *   --dry-run   Print what would be sent, don't actually send.
 *
 * Required environment (loaded from .env.mail at repo root):
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * Exit codes:
 *   0  sent (or dry-run completed)
 *   1  config error
 *   2  argument error
 *   3  SMTP send failure
 */

import nodemailer from 'nodemailer';
import { readFileSync, existsSync } from 'fs';
import { parseArgs } from 'node:util';
import { resolve, basename } from 'path';
import dotenv from 'dotenv';

// ── Config ─────────────────────────────────────────────────────────
const ENV_FILE = '.env.mail';
if (!existsSync(ENV_FILE)) {
  console.error(`ERROR: ${ENV_FILE} not found at repo root.`);
  console.error(`Copy ${ENV_FILE}.example to ${ENV_FILE} and fill in your SMTP credentials.`);
  process.exit(1);
}
dotenv.config({ path: ENV_FILE });

for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']) {
  if (!process.env[k]) {
    console.error(`ERROR: ${k} missing from ${ENV_FILE}`);
    process.exit(1);
  }
}

// ── CLI args ───────────────────────────────────────────────────────
let parsed;
try {
  parsed = parseArgs({
    options: {
      to: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
      section: { type: 'string' },
      attach: { type: 'string', multiple: true },
      cc: { type: 'string', multiple: true },
      bcc: { type: 'string', multiple: true },
      'reply-to': { type: 'string' },
      from: { type: 'string' },
      html: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
    allowPositionals: false,
  });
} catch (err) {
  console.error(`Argument error: ${err.message}`);
  process.exit(2);
}
const args = parsed.values;

if (!args.to || !args.subject || !args.body) {
  console.error('Required: --to <addr> --subject <text> --body <path>');
  process.exit(2);
}
if (!existsSync(args.body)) {
  console.error(`Body file not found: ${args.body}`);
  process.exit(2);
}

// ── Body extraction ────────────────────────────────────────────────
let body = readFileSync(args.body, 'utf8');
if (args.section) {
  const startRe = new RegExp(`^${args.section}.*$`, 'm');
  const startMatch = body.match(startRe);
  if (!startMatch) {
    console.error(`Section not found in ${args.body}: "${args.section}"`);
    process.exit(2);
  }
  const startIdx = startMatch.index + startMatch[0].length;
  const tail = body.slice(startIdx);
  // Stop at the next "## " header OR at "---" horizontal rule OR end of file.
  const endMatch = tail.match(/^(##\s|---\s*$)/m);
  body = endMatch ? tail.slice(0, endMatch.index).trim() : tail.trim();

  // Strip leading metadata-style lines: **To:** ..., **Subject:** ..., **Cc:** ...
  // These are author-facing instructions in the markdown, not email body content.
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length) {
    if (/^\*\*[A-Z][a-z-]+:\*\*/.test(lines[i])) { i++; continue; }
    if (lines[i].trim() === '') { i++; continue; }
    break;
  }
  body = lines.slice(i).join('\n').trim();
}

// ── Attachments ────────────────────────────────────────────────────
const attachments = (args.attach || []).map((p) => {
  const abs = resolve(p);
  if (!existsSync(abs)) {
    console.error(`Attachment not found: ${p}`);
    process.exit(2);
  }
  return { filename: basename(abs), path: abs };
});

// ── Build envelope ─────────────────────────────────────────────────
const mail = {
  from: args.from || process.env.SMTP_FROM,
  to: args.to,
  subject: args.subject,
  ...(args['reply-to'] ? { replyTo: args['reply-to'] } : {}),
  ...(args.cc?.length ? { cc: args.cc } : {}),
  ...(args.bcc?.length ? { bcc: args.bcc } : {}),
  ...(args.html ? { html: body } : { text: body }),
  attachments,
};

if (args['dry-run']) {
  console.log('— DRY RUN — would send the following:');
  console.log('From    :', mail.from);
  console.log('To      :', mail.to);
  if (mail.cc) console.log('Cc      :', mail.cc.join(', '));
  if (mail.bcc) console.log('Bcc     :', mail.bcc.join(', '));
  if (mail.replyTo) console.log('Reply-To:', mail.replyTo);
  console.log('Subject :', mail.subject);
  console.log('Attach  :', attachments.length ? attachments.map((a) => a.filename).join(', ') : '(none)');
  console.log('Body length:', body.length, 'chars');
  console.log('— first 30 lines of body —');
  console.log(body.split('\n').slice(0, 30).join('\n'));
  console.log('— end —');
  process.exit(0);
}

// ── Send ───────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  // Set SMTP_TLS_INSECURE=true to accept self-signed certs on submission.
  // Acceptable when the SMTP host is on your own infra (e.g. Mailcow on a
  // host you control) — outbound recipient-leg TLS is unaffected.
  ...(process.env.SMTP_TLS_INSECURE === 'true' ? { tls: { rejectUnauthorized: false } } : {}),
});

try {
  // Verify connection first — catches auth/DNS errors with a clean message.
  await transporter.verify();
} catch (err) {
  console.error('SMTP connection / auth failed:', err.message);
  process.exit(3);
}

try {
  const info = await transporter.sendMail(mail);
  console.log('✅ sent:', info.messageId);
  if (info.accepted?.length) console.log('  accepted:', info.accepted.join(', '));
  if (info.rejected?.length) console.log('  rejected:', info.rejected.join(', '));
  if (info.response) console.log('  response:', info.response);
} catch (err) {
  console.error('SMTP send failed:', err.message);
  process.exit(3);
}
