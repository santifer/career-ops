#!/usr/bin/env node

/**
 * One-time Gmail OAuth initialization.
 *
 * Reads ~/.career-ops-gmail-oauth.json (your downloaded OAuth client
 * credentials) → opens an auth URL → you paste the code back → script
 * writes the refresh token to ~/.career-ops-secrets so subsequent
 * scripts can use the Gmail API headlessly.
 *
 * Required scopes:
 *   gmail.settings.basic   — manage filters (create/list/delete)
 *   gmail.labels           — manage labels (create/list/delete)
 *   gmail.readonly         — read message bodies for the 15-min poll
 *                            (scripts/scan-email-poll.mjs)
 *
 * If you ran this script before the gmail.readonly scope was added,
 * re-run it — Google requires re-consent when scope set changes.
 *
 * Setup before running:
 *   1. https://console.cloud.google.com/ → create project "career-ops-gmail"
 *   2. APIs & Services → Library → "Gmail API" → Enable
 *   3. APIs & Services → OAuth consent screen → External → App name "career-ops"
 *      User support email = mitwilli@gmail.com → add yourself as test user
 *   4. APIs & Services → Credentials → "Create credentials" → "OAuth client ID"
 *      Application type = "Desktop app" → name "career-ops-cli"
 *   5. Download the JSON → save to ~/.career-ops-gmail-oauth.json
 *   6. Run: node scripts/gmail-oauth-init.mjs
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline';
import { google } from 'googleapis';

const OAUTH_PATH = join(homedir(), '.career-ops-gmail-oauth.json');
const SECRETS_PATH = join(homedir(), '.career-ops-secrets');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.readonly',
];

if (!existsSync(OAUTH_PATH)) {
  console.error(`❌ OAuth credentials not found at ${OAUTH_PATH}`);
  console.error('');
  console.error('Setup steps:');
  console.error('  1. https://console.cloud.google.com/ → create project "career-ops-gmail"');
  console.error('  2. APIs & Services → Library → search "Gmail API" → Enable');
  console.error('  3. APIs & Services → OAuth consent screen → External → fill in basics');
  console.error('     Add yourself as a test user (mitwilli@gmail.com)');
  console.error('  4. APIs & Services → Credentials → Create credentials → OAuth client ID');
  console.error('     Type: Desktop app, name: career-ops-cli');
  console.error('  5. Download JSON → save as ~/.career-ops-gmail-oauth.json');
  console.error('  6. Re-run this script.');
  process.exit(1);
}

const creds = JSON.parse(readFileSync(OAUTH_PATH, 'utf-8'));
const config = creds.installed || creds.web;
if (!config) {
  console.error('❌ OAuth JSON is missing "installed" or "web" key. Re-download from Console.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  config.client_id,
  config.client_secret,
  // Use loopback redirect (manual copy-paste flow) — works for desktop apps
  'urn:ietf:wg:oauth:2.0:oob'
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent', // force refresh token issuance
});

console.log('');
console.log('━'.repeat(60));
console.log('Step 1: Authorize career-ops to manage Gmail filters');
console.log('━'.repeat(60));
console.log('');
console.log('Open this URL in your browser:');
console.log('');
console.log('  ' + authUrl);
console.log('');
console.log('Sign in as mitwilli@gmail.com → Approve.');
console.log('Google will display an authorization code. Copy it.');
console.log('');

const rl = createInterface({ input: process.stdin, output: process.stdout });

const code = await new Promise(resolve => rl.question('Paste the code here: ', resolve));
rl.close();

if (!code || code.trim().length < 10) {
  console.error('❌ No code received. Aborting.');
  process.exit(1);
}

const { tokens } = await oauth2Client.getToken(code.trim());
if (!tokens.refresh_token) {
  console.error('❌ Google did not return a refresh_token.');
  console.error('Revoke prior auth at https://myaccount.google.com/permissions and re-run.');
  process.exit(1);
}

// Append refresh token to ~/.career-ops-secrets
const existing = existsSync(SECRETS_PATH) ? readFileSync(SECRETS_PATH, 'utf-8') : '';
const cleaned = existing
  .split('\n')
  .filter(l => !/^GMAIL_OAUTH_/.test(l))
  .join('\n')
  .trim();

const block = [
  cleaned,
  '',
  `GMAIL_OAUTH_CLIENT_ID=${config.client_id}`,
  `GMAIL_OAUTH_CLIENT_SECRET=${config.client_secret}`,
  `GMAIL_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`,
  '',
].join('\n');

writeFileSync(SECRETS_PATH, block, { mode: 0o600 });
console.log('');
console.log('✓ Saved OAuth credentials to ' + SECRETS_PATH);
console.log('  Permissions set to 0600 (user read/write only).');
console.log('');
console.log('Next step:');
console.log('  node scripts/gmail-create-filters.mjs');
