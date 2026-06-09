#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('output');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function latestQueuePath() {
  const file = path.join(OUTPUT_DIR, `company-review-queue-${today()}.md`);
  if (!existsSync(file)) throw new Error(`Queue not found: ${file}`);
  return file;
}

function parseArgs(argv) {
  const args = {
    limit: 10,
    verify: true,
    section: 'first-pass',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--limit') args.limit = Number(argv[++i] || 10);
    else if (arg === '--no-verify') args.verify = false;
    else if (arg === '--section') args.section = argv[++i] || 'first-pass';
  }
  return args;
}

function parseQueue(md) {
  const lines = md.split('\n');
  const items = [];
  let section = '';
  for (const line of lines) {
    if (line.startsWith('## ')) {
      section = line.replace('## ', '').trim().toLowerCase();
      continue;
    }
    if (!line.startsWith('- [ ] ')) continue;
    const body = line.replace('- [ ] ', '');
    const parts = body.split(' | ').map(x => x.trim());
    items.push({
      section,
      name: parts[0] || '',
      roleHint: parts[1] || '',
      extraRoleHint: parts[2] || '',
      hintUrl: parts[parts.length - 2] || '',
      location: parts[parts.length - 1] || '',
    });
  }
  return items;
}

function sectionMatches(item, sectionArg) {
  if (sectionArg === 'all') return true;
  if (sectionArg === 'first-pass') return item.section === 'first pass';
  if (sectionArg === 'second-pass') return item.section === 'second pass';
  return true;
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.href;
  } catch {
    return '';
  }
}

function scoreCandidate(url, companyName) {
  const lower = url.toLowerCase();
  const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  let score = 0;
  if (lower.includes('careers') || lower.includes('jobs') || lower.includes('join')) score += 5;
  if (lower.includes(slug)) score += 3;
  if (lower.includes('linkedin.com')) score -= 3;
  if (lower.includes('join.com')) score -= 1;
  if (lower.includes('greenhouse') || lower.includes('lever') || lower.includes('ashby')) score += 2;
  return score;
}

function fallbackCandidates(item) {
  const candidates = [];
  if (item.hintUrl) {
    candidates.push({ url: item.hintUrl, score: 0 });
    if (item.hintUrl.includes('linkedin.com/company/')) {
      const linkedInJobs = item.hintUrl.replace(/\/$/, '') + '/jobs/';
      candidates.push({ url: linkedInJobs, score: 1 });
    }
  }
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(`${item.name} careers jobs`)}`;
  candidates.push({ url: searchUrl, score: -1 });
  return candidates;
}

async function searchCompany(page, companyName) {
  const query = encodeURIComponent(`${companyName} careers jobs company`);
  const url = `https://www.bing.com/search?q=${query}`;
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1200);
  const rawLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('li.b_algo h2 a[href]')).map(a => a.href)
  );

  const unique = [];
  const seen = new Set();
  for (const link of rawLinks.map(normalizeUrl)) {
    const lower = link.toLowerCase();
    if (!link) continue;
    if (seen.has(link)) continue;
    if (lower.includes('bing.com')) continue;
    if (lower.includes('microsoft.com')) continue;
    seen.add(link);
    unique.push(link);
  }

  return unique
    .map(link => ({ url: link, score: scoreCandidate(link, companyName) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

async function verifyUrl(page, url) {
  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1200);
    const bodyText = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 3000));
    const title = await page.title();
    const lower = `${title} ${bodyText}`.toLowerCase();
    const lowerUrl = url.toLowerCase();
    if ((response && response.status() >= 400) || lower.includes('404') || lower.includes('not found')) {
      return { status: 'dead', note: `HTTP ${response?.status?.() || 'n/a'}` };
    }
    if (lowerUrl.includes('bing.com/search')) {
      return { status: 'search-results', note: title };
    }
    if (lowerUrl.includes('linkedin.com/company/') && !lowerUrl.includes('/jobs')) {
      return { status: 'linkedin-company', note: title };
    }
    if (lowerUrl.includes('linkedin.com/company/') && lowerUrl.includes('/jobs')) {
      return { status: 'linkedin-jobs', note: title };
    }
    if (/(career|careers|jobs|open roles|open positions|join us|work with us)/i.test(lower)) {
      return { status: 'careers-page', note: title };
    }
    if (/(contact|about us|team|company)/i.test(lower)) {
      return { status: 'company-page', note: title };
    }
    return { status: 'uncertain', note: title };
  } catch (err) {
    return { status: 'error', note: err.message };
  }
}

function renderMarkdown(results) {
  const lines = [];
  lines.push(`# Company Review Enrichment — ${today()}`);
  lines.push('');
  for (const item of results) {
    lines.push(`## ${item.name}`);
    lines.push('');
    lines.push(`- Queue section: ${item.section}`);
    if (item.roleHint) lines.push(`- Role hint: ${item.roleHint}`);
    if (item.location) lines.push(`- Location: ${item.location}`);
    if (item.hintUrl) lines.push(`- Original hint: ${item.hintUrl}`);
    for (const candidate of item.candidates) {
      const verify = candidate.verify ? ` | verify: ${candidate.verify.status} (${candidate.verify.note})` : '';
      lines.push(`- Candidate: ${candidate.url} | score: ${candidate.score}${verify}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const queue = parseQueue(readFileSync(latestQueuePath(), 'utf-8'))
    .filter(item => sectionMatches(item, args.section))
    .slice(0, args.limit);

  const browser = await (await import('playwright')).chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const results = [];
  try {
    for (const item of queue) {
      let candidates = await searchCompany(page, item.name);
      if (candidates.length === 0) {
        candidates = fallbackCandidates(item);
      }
      for (const candidate of candidates) {
        if (args.verify && page) {
          candidate.verify = await verifyUrl(page, candidate.url);
        }
      }
      results.push({ ...item, candidates });
    }
  } finally {
    if (browser) await browser.close();
  }

  const outPath = path.join(OUTPUT_DIR, `company-review-enriched-${today()}.md`);
  writeFileSync(outPath, renderMarkdown(results), 'utf-8');
  console.log(`Wrote ${outPath}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
