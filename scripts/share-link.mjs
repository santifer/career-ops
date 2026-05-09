#!/usr/bin/env node
// share-link.mjs — request a 24-hr read-only dashboard share link.
//
// Usage:
//   node scripts/share-link.mjs                # default http://localhost:3000
//   node scripts/share-link.mjs --port=4000
//   node scripts/share-link.mjs --host=localhost:4000
//
// Calls GET /api/share/create on a running dashboard-server, then prints
// the recruiter-facing URL and expiry. Tokens live in data/share-tokens.json
// (gitignored) and auto-expire after 24h — server returns 410 Gone when stale.

const args = process.argv.slice(2);
const portArg = args.find(a => a.startsWith('--port='))?.split('=')[1];
const hostArg = args.find(a => a.startsWith('--host='))?.split('=')[1];
const host = hostArg || `localhost:${portArg || process.env.DASHBOARD_PORT || 3000}`;
const proto = args.includes('--https') ? 'https' : 'http';
const endpoint = `${proto}://${host}/api/share/create`;

try {
  const res = await fetch(endpoint);
  if (!res.ok) {
    console.error(`Share-create failed: HTTP ${res.status}`);
    console.error(await res.text().catch(() => ''));
    process.exit(1);
  }
  const data = await res.json();
  console.log('Share link created.');
  console.log('');
  console.log(`  URL:      ${data.url}`);
  console.log(`  Token:    ${data.token}`);
  console.log(`  Expires:  ${data.expires}`);
  console.log('');
  console.log('Hand the URL to a recruiter. The dashboard opens in read-only');
  console.log('demo mode (company names redacted). Token expires in 24h.');
} catch (err) {
  console.error(`Could not reach ${endpoint}: ${err.message}`);
  console.error('Start the dashboard server first: node dashboard-server.mjs');
  process.exit(1);
}
