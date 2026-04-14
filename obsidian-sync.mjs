#!/usr/bin/env node
/**
 * obsidian-sync.mjs
 *
 * Writes an application note to the _jobSeeking Obsidian vault
 * via the Obsidian Local REST API plugin (port 27124).
 *
 * Usage:
 *   node obsidian-sync.mjs \
 *     --file "001 - Company Name.md" \
 *     --content reports/001-company-2026-04-12.md \
 *     --folder "UK Applications" \
 *     --company "Company Name" \
 *     --role "Role Title" \
 *     --score "4.2/5" \
 *     --status "Evaluated" \
 *     --archetype "Technical AI PM" \
 *     --url "https://..." \
 *     --pdf false \
 *     --geo UK
 *
 * Requires: OBSIDIAN_API_KEY in .env
 * Safe to run if Obsidian is closed — logs a warning and exits 0.
 */

import https from 'https';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// -- Load .env (no dotenv dependency) --
function loadEnv() {
  const envPath = resolve('.env');
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split('\n')
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => {
        const idx = l.indexOf('=');
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      })
  );
}

const env = loadEnv();
const API_KEY = process.env.OBSIDIAN_API_KEY ?? env.OBSIDIAN_API_KEY;
const PORT = 27124;

if (!API_KEY) {
  console.warn('⚠  OBSIDIAN_API_KEY not set — skipping vault sync');
  process.exit(0);
}

// -- Parse args --
const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const file    = get('--file');
const content = get('--content');
const folder  = get('--folder') ?? 'UK Applications';

if (!file || !content) {
  console.error('Usage: node obsidian-sync.mjs --file "001 - Company.md" --content reports/001-slug.md [--folder "UK Applications"] [options]');
  process.exit(1);
}

if (!existsSync(content)) {
  console.error(`Content file not found: ${content}`);
  process.exit(1);
}

// -- Build frontmatter --
const date      = get('--date')      ?? new Date().toISOString().split('T')[0];
const company   = get('--company')   ?? '';
const role      = get('--role')      ?? '';
const score     = get('--score')     ?? '';
const status    = get('--status')    ?? 'Evaluated';
const archetype = get('--archetype') ?? '';
const url       = get('--url')       ?? '';
const pdf       = get('--pdf')       ?? 'false';
const geo       = get('--geo')       ?? (folder.startsWith('UK') ? 'UK' : 'US');
const location  = get('--location')  ?? '';
const remote    = get('--remote')    ?? '';

const statusTagMap = {
  'Evaluated': 'evaluated',
  'Applied': 'applied',
  'SKIP': 'skip',
  'Rejected': 'rejected',
  'Discarded': 'discarded',
  'Interview': 'interview',
  'Offer': 'offer',
};
const statusTag = statusTagMap[status] ?? 'evaluated';

const frontmatter = [
  '---',
  'tags:',
  '  - application',
  `  - ${statusTag}`,
  `  - geo-${geo.toLowerCase()}`,
  ...(remote ? [`  - ${remote.toLowerCase().replace(/[^a-z]/g, '-')}`] : []),
  `date: ${date}`,
  `geo: ${geo}`,
  `company: ${company}`,
  `role: ${role}`,
  `score: ${score}`,
  `status: ${status}`,
  `pdf: ${pdf}`,
  `archetype: ${archetype}`,
  `url: ${url}`,
  ...(location ? [`location: "${location}"`] : []),
  ...(remote   ? [`remote: ${remote}`]        : []),
  '---',
  '',
].join('\n');

const reportContent = readFileSync(content, 'utf8');
const noteContent = frontmatter + reportContent;

// -- PUT to vault --
const encodedPath = `${folder}/${file}`.split('/').map(encodeURIComponent).join('/');
const body = Buffer.from(noteContent, 'utf8');

const options = {
  hostname: 'localhost',
  port: PORT,
  path: `/vault/${encodedPath}`,
  method: 'PUT',
  rejectUnauthorized: false, // self-signed cert
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'text/markdown',
    'Content-Length': body.length,
  },
};

const req = https.request(options, (res) => {
  if (res.statusCode >= 200 && res.statusCode < 300) {
    console.log(`✓ Obsidian: ${folder}/${file}`);
  } else {
    console.warn(`⚠  Obsidian sync returned ${res.statusCode} — skipping`);
  }
});

req.on('error', (e) => {
  console.warn(`⚠  Obsidian vault unreachable (is Obsidian open?): ${e.message}`);
});

req.write(body);
req.end();
