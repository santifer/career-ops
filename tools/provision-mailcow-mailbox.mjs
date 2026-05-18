#!/usr/bin/env node
/**
 * tools/provision-mailcow-mailbox.mjs
 *
 * Idempotent Mailcow mailbox provisioning. Reads ~/.mailcow-credentials,
 * hits the API on 127.0.0.1:8443 to bypass the public-IP ACL.
 *
 * - Verifies the requested domain is already provisioned in Mailcow.
 * - If the mailbox doesn't exist: creates it with a fresh random password and
 *   writes the credentials to a 0600 file the user owns.
 * - If the mailbox already exists: prints state and exits 0 (no destruction).
 *
 * Usage:
 *   node tools/provision-mailcow-mailbox.mjs \
 *     --mailbox you@yourdomain.com \
 *     --name "Your Name" \
 *     --quota-mb 4096 \
 *     --creds-out ~/.yourdomain-mailbox-credentials
 *
 * Flags:
 *   --mailbox      Full address (REQUIRED).
 *   --name         Display name (default: derived from local-part).
 *   --quota-mb     Quota in MB (default: 4096 = 4 GB).
 *   --creds-out    Path to write the credentials file (default: omit; print to stderr).
 *   --rotate       If mailbox exists, rotate the password (DESTRUCTIVE — requires --force).
 *   --force        Acknowledge that --rotate may break existing IMAP/SMTP sessions.
 *
 * Exit codes:
 *   0  mailbox exists (created or already present)
 *   1  config / credentials error
 *   2  argument error
 *   3  API call failed
 *   4  domain not provisioned in Mailcow (run domain-onboard first)
 */

import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from 'fs';
import { parseArgs } from 'node:util';
import { dirname, resolve } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';

// Mailcow on 127.0.0.1:8443 uses a self-signed cert by default. Since this
// script only talks to localhost, globally disabling TLS verification is the
// pragmatic choice (no MITM risk on loopback).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ── Args ───────────────────────────────────────────────────────────
let parsed;
try {
  parsed = parseArgs({
    options: {
      mailbox: { type: 'string' },
      name: { type: 'string' },
      'quota-mb': { type: 'string' },
      'creds-out': { type: 'string' },
      rotate: { type: 'boolean' },
      force: { type: 'boolean' },
    },
  });
} catch (err) {
  console.error('arg error:', err.message);
  process.exit(2);
}
const args = parsed.values;

if (!args.mailbox || !args.mailbox.includes('@')) {
  console.error('Required: --mailbox <addr@domain>');
  process.exit(2);
}
const [localPart, domain] = args.mailbox.split('@');
const name = args.name || localPart;
const quotaMb = parseInt(args['quota-mb'] || '4096', 10);
const credsOut = args['creds-out']
  ? args['creds-out'].replace(/^~/, homedir())
  : null;

if (args.rotate && !args.force) {
  console.error('--rotate requires --force (acknowledges that existing IMAP/SMTP sessions break).');
  process.exit(2);
}

// ── Credentials (~/.mailcow-credentials) ──────────────────────────
function loadMailcowCreds() {
  const path = `${homedir()}/.mailcow-credentials`;
  if (!existsSync(path)) {
    console.error(`missing ${path}`);
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  for (const k of ['MAILCOW_URL', 'MAILCOW_API_KEY']) {
    if (!env[k]) {
      console.error(`${path}: missing ${k}`);
      process.exit(1);
    }
  }
  return env;
}
const creds = loadMailcowCreds();

// Local-loopback base bypasses the public-IP API ACL (Mailcow ACLs the public IP,
// not 127.0.0.1, on default hardened installs). HTTPS on 8443; ignore self-signed cert.
const LOCAL_BASE = 'https://127.0.0.1:8443';

async function api(method, path, body) {
  const url = `${LOCAL_BASE}${path}`;
  const opts = {
    method,
    headers: {
      'X-API-Key': creds.MAILCOW_API_KEY,
      'Content-Type': 'application/json',
    },
    // Self-signed cert on localhost — use Node's fetch with rejectUnauthorized:false via Undici dispatcher.
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  // TLS verification is disabled globally at top of file (loopback only).
  const resp = await fetch(url, opts);
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { type: 'error', msg: text }; }
  return { http: resp.status, json };
}

// ── Step 1: domain exists? ─────────────────────────────────────────
console.error(`[1/4] checking domain ${domain} is provisioned in Mailcow...`);
const domResp = await api('GET', '/api/v1/get/domain/all');
if (domResp.http !== 200 || !Array.isArray(domResp.json)) {
  console.error('domain list failed:', domResp.json);
  process.exit(3);
}
const dom = domResp.json.find((d) => d.domain_name === domain);
if (!dom) {
  console.error(`✗ domain "${domain}" not found in Mailcow. Onboard the domain first.`);
  process.exit(4);
}
console.error(`  ✓ ${domain} present (active=${dom.active}, mailboxes=${dom.mboxes}/${dom.max_num_mboxes_for_domain})`);

// ── Step 2: mailbox exists? ────────────────────────────────────────
console.error(`[2/4] checking mailbox ${args.mailbox}...`);
const mbResp = await api('GET', `/api/v1/get/mailbox/all/${encodeURIComponent(domain)}`);
if (mbResp.http !== 200 || !Array.isArray(mbResp.json)) {
  console.error('mailbox list failed:', mbResp.json);
  process.exit(3);
}
const existing = mbResp.json.find((m) => m.username === args.mailbox);

function genPassword() {
  // 32 random bytes → URL-safe base64, trimmed to 24 chars. Mailcow requires
  // ≥ 6 chars and mixed-case by default; this comfortably exceeds.
  return randomBytes(32).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
}

if (existing && !args.rotate) {
  console.error(`  ✓ mailbox already exists (active=${existing.active}, quota=${existing.quota} bytes)`);
  console.error('  Use --rotate --force to reset the password (will break existing IMAP/SMTP sessions).');
  process.exit(0);
}

// ── Step 3: create or rotate ──────────────────────────────────────
const password = genPassword();
let body, action;

if (existing && args.rotate) {
  action = 'rotate-password';
  body = {
    items: [args.mailbox],
    attr: { password, password2: password },
  };
  console.error('[3/4] rotating password for existing mailbox...');
  const r = await api('POST', '/api/v1/edit/mailbox', body);
  if (r.http !== 200 || (Array.isArray(r.json) && r.json[0]?.type === 'error')) {
    console.error('rotate failed:', JSON.stringify(r.json).slice(0, 300));
    process.exit(3);
  }
  console.error('  ✓ password rotated');
} else {
  action = 'create';
  body = {
    local_part: localPart,
    domain,
    name,
    password,
    password2: password,
    quota: quotaMb,
    active: '1',
    force_pw_update: '0',
    tls_enforce_in: '1',
    tls_enforce_out: '1',
  };
  console.error('[3/4] creating mailbox...');
  const r = await api('POST', '/api/v1/add/mailbox', body);
  if (r.http !== 200 || (Array.isArray(r.json) && r.json[0]?.type === 'error')) {
    console.error('create failed:', JSON.stringify(r.json).slice(0, 300));
    process.exit(3);
  }
  console.error(`  ✓ mailbox ${args.mailbox} created (${quotaMb} MB quota, TLS enforced in+out)`);
}

// ── Step 4: write credentials file (or stderr) ────────────────────
console.error('[4/4] persisting credentials...');
const credText = [
  `# Mailcow mailbox credentials for ${args.mailbox}`,
  `# Action: ${action}`,
  `# Generated ${new Date().toISOString()}`,
  '',
  `MAILBOX_ADDRESS=${args.mailbox}`,
  `MAILBOX_PASSWORD=${password}`,
  `SMTP_HOST=${(() => { try { return new URL(creds.MAILCOW_URL).host; } catch { return 'mail.example.com'; } })()}`,
  `SMTP_PORT=587`,
  `SMTP_SECURE=false`,
  `IMAP_HOST=${(() => { try { return new URL(creds.MAILCOW_URL).host; } catch { return 'mail.example.com'; } })()}`,
  `IMAP_PORT=993`,
  `IMAP_SECURE=true`,
  '',
].join('\n');

if (credsOut) {
  mkdirSync(dirname(credsOut), { recursive: true });
  writeFileSync(credsOut, credText, { mode: 0o600 });
  chmodSync(credsOut, 0o600);
  console.error(`  ✓ wrote ${credsOut} (mode 0600)`);
} else {
  console.error('  no --creds-out specified; emitting to stdout below');
}

console.log(credText);
console.error('Done.');
