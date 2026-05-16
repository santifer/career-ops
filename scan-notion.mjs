#!/usr/bin/env node

/**
 * scan-notion.mjs — Notion job database scanner for career-ops
 *
 * Reads job postings from a Notion database, extracts URLs,
 * deduplicates against tracker + history, and appends new ones to pipeline.md.
 *
 * Zero Claude tokens — pure Notion REST API via native fetch.
 *
 * Setup:
 *   1. Create an integration at https://www.notion.so/my-integrations
 *   2. Share your job-postings database with the integration
 *   3. Add to config/profile.yml:
 *        notion:
 *          token: secret_xxx                  # required
 *          database_id: <32-char hex or UUID> # required
 *          status_property: Status            # select/status property (default: Status)
 *          status_unreviewed: To Review       # value to scan (default: To Review)
 *          status_queued: Queued              # mark pages this after scan (optional — leave blank to skip)
 *          url_property: URL                  # URL property name (default: URL)
 *          title_property: Name               # title property (default: Name)
 *          company_property: Company          # company property — text/select (optional)
 *
 * Usage:
 *   node scan-notion.mjs              # scan all "To Review" entries
 *   node scan-notion.mjs --dry-run    # preview without writing files
 *   node scan-notion.mjs --days 14    # only pages created in last N days
 *   node scan-notion.mjs --auth       # test token + list accessible databases
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { load as loadYaml } from 'js-yaml';

// ── Constants ────────────────────────────────────────────────────────
const NOTION_VERSION    = '2022-06-28';
const NOTION_BASE       = 'https://api.notion.com/v1';
const PIPELINE_PATH     = 'data/pipeline.md';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const APPLICATIONS_PATH = 'data/applications.md';
const PROFILE_PATH      = 'config/profile.yml';
const TODAY             = new Date().toISOString().slice(0, 10);

// ── CLI flags ────────────────────────────────────────────────────────
const DRY_RUN  = process.argv.includes('--dry-run');
const AUTH_MODE = process.argv.includes('--auth');

const daysArgIdx = process.argv.indexOf('--days');
const _daysParsed = daysArgIdx !== -1 ? Number(process.argv[daysArgIdx + 1]) : NaN;
const DAYS = Number.isFinite(_daysParsed) && _daysParsed > 0 ? _daysParsed : null;

// ── Config ───────────────────────────────────────────────────────────
function loadConfig() {
  if (!existsSync(PROFILE_PATH)) {
    console.error(`❌  config/profile.yml not found. Run onboarding first.`);
    process.exit(1);
  }
  const profile = loadYaml(readFileSync(PROFILE_PATH, 'utf8')) || {};
  const n = profile.notion || {};

  const token       = n.token       || process.env.NOTION_TOKEN;
  const databaseId  = n.database_id || process.env.NOTION_DATABASE_ID;

  if (!AUTH_MODE && (!token || !databaseId)) {
    console.error(
      '❌  Notion not configured.\n' +
      '    Add to config/profile.yml:\n' +
      '      notion:\n' +
      '        token: secret_xxx\n' +
      '        database_id: <32-char hex or UUID>\n' +
      '    Or set NOTION_TOKEN + NOTION_DATABASE_ID env vars.\n' +
      '    Run: node scan-notion.mjs --auth   to verify the token.'
    );
    process.exit(1);
  }

  return {
    token,
    databaseId,
    statusProperty:    n.status_property   || 'Status',
    statusUnreviewed:  n.status_unreviewed  || 'To Review',
    statusQueued:      n.status_queued      || '',
    urlProperty:       n.url_property       || 'URL',
    titleProperty:     n.title_property     || 'Name',
    companyProperty:   n.company_property   || '',
  };
}

// ── Notion API helpers ───────────────────────────────────────────────
async function notionFetch(path, opts = {}) {
  const cfg = loadConfig();
  const res = await fetch(`${NOTION_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      Authorization:    `Bearer ${cfg.token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type':   'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API ${res.status}: ${err}`);
  }
  return res.json();
}

async function queryDatabase(databaseId, filter, cursor) {
  const body = { page_size: 100 };
  if (filter)  body.filter        = filter;
  if (cursor)  body.start_cursor  = cursor;
  return notionFetch(`/databases/${databaseId}/query`, { method: 'POST', body });
}

async function updatePageStatus(pageId, propertyName, statusValue) {
  return notionFetch(`/pages/${pageId}`, {
    method: 'PATCH',
    body: {
      properties: {
        [propertyName]: { select: { name: statusValue } },
      },
    },
  });
}

// ── Property extractors ──────────────────────────────────────────────
function extractTitle(page, propName) {
  const prop = page.properties?.[propName];
  if (!prop) return '';
  // title type
  if (prop.type === 'title' && prop.title?.length) {
    return prop.title.map(t => t.plain_text).join('');
  }
  // rich_text type (some DBs use it for Name)
  if (prop.type === 'rich_text' && prop.rich_text?.length) {
    return prop.rich_text.map(t => t.plain_text).join('');
  }
  return '';
}

function extractUrl(page, propName) {
  const prop = page.properties?.[propName];
  if (!prop) return '';
  if (prop.type === 'url')       return prop.url || '';
  if (prop.type === 'rich_text') return prop.rich_text?.[0]?.plain_text || '';
  return '';
}

function extractText(page, propName) {
  if (!propName) return '';
  const prop = page.properties?.[propName];
  if (!prop) return '';
  if (prop.type === 'select')    return prop.select?.name || '';
  if (prop.type === 'rich_text') return prop.rich_text?.[0]?.plain_text || '';
  if (prop.type === 'title')     return extractTitle(page, propName);
  return '';
}

function extractStatusValue(page, propName) {
  const prop = page.properties?.[propName];
  if (!prop) return '';
  if (prop.type === 'select') return prop.select?.name || '';
  if (prop.type === 'status') return prop.status?.name || '';
  return '';
}

// ── Title filter ─────────────────────────────────────────────────────
const POSITIVE_KW = [
  'instructional designer', 'instructional design', 'learning experience designer',
  'lxd', 'curriculum designer', 'curriculum developer', 'elearning', 'e-learning',
  'edtech', 'learning technology', 'learning technologist',
  'lms specialist', 'lms administrator', 'learning systems',
  'learning and development', 'l&d specialist', 'l&d designer',
  'training designer', 'training developer', 'training specialist', 'training coordinator',
  'ai learning', 'ai trainer', 'ai implementation', 'learning specialist',
  'ai enablement', 'ai adoption', 'enablement specialist', 'automation specialist',
  'digital adoption', 'implementation specialist',
  'hr coordinator', 'hr administrator', 'human resources coordinator',
  'payroll coordinator', 'people operations', 'people coordinator',
  'hr generalist', 'people ops', 'retention specialist',
];

const NEGATIVE_KW = [
  'junior', 'intern', 'internship', 'sales', 'insurance', 'underwriter',
  'actuary', 'accountant', 'finance', 'banking', 'blockchain', 'web3',
];

function passesFilter(title) {
  const t = title.toLowerCase();
  return POSITIVE_KW.some(k => t.includes(k)) && !NEGATIVE_KW.some(k => t.includes(k));
}

function classifyBucket(title) {
  const t = title.toLowerCase();
  if (['hr coordinator', 'hr administrator', 'people operations', 'payroll',
       'hr generalist', 'people coordinator', 'training coordinator', 'human resources',
       'retention specialist'].some(k => t.includes(k))) {
    return 'HR / People Ops — GTA';
  }
  if (['ai enablement', 'ai adoption', 'implementation specialist',
       'digital adoption', 'ai implementation'].some(k => t.includes(k))) {
    return 'AI Enablement — Canada';
  }
  return 'Instructional Design / LXD — Canada';
}

// ── Dedup ────────────────────────────────────────────────────────────
function loadSeenUrls() {
  const seen = new Set();
  [SCAN_HISTORY_PATH, APPLICATIONS_PATH, PIPELINE_PATH].forEach(f => {
    if (!existsSync(f)) return;
    const urls = readFileSync(f, 'utf8').match(/https?:\/\/[^\s)|\]"<>]+/g) || [];
    urls.forEach(u => seen.add(u.trim().split('?')[0]));
  });
  return seen;
}

// ── Writers ──────────────────────────────────────────────────────────
function appendPipeline(items) {
  const lines = ['\n## Notion Job Database — ' + TODAY + '\n'];
  const buckets = {};
  items.forEach(item => {
    buckets[item.bucket] = buckets[item.bucket] || [];
    buckets[item.bucket].push(item);
  });
  for (const [bucket, entries] of Object.entries(buckets)) {
    lines.push(`\n### ${bucket}\n`);
    entries.forEach(e => {
      const company = e.company ? ` | ${e.company}` : '';
      lines.push(`- [ ] ${e.url} | (Notion)${company} | ${e.title}`);
    });
  }
  if (!existsSync(PIPELINE_PATH)) writeFileSync(PIPELINE_PATH, '# Pipeline — Pending Evaluation\n');
  appendFileSync(PIPELINE_PATH, lines.join('\n') + '\n');
}

function appendHistory(rows) {
  const dir = dirname(SCAN_HISTORY_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n');
  }
  appendFileSync(SCAN_HISTORY_PATH, rows.join('\n') + '\n');
}

// ── Auth mode ────────────────────────────────────────────────────────
async function runAuth() {
  const cfg = loadConfig();
  if (!cfg.token) {
    console.error('❌  No token found. Set notion.token in config/profile.yml or NOTION_TOKEN env var.');
    process.exit(1);
  }
  console.log('\nTesting Notion token…');
  try {
    const me = await notionFetch('/users/me');
    console.log(`✅  Authenticated as: ${me.name || me.id}`);
  } catch (e) {
    console.error(`❌  Auth failed: ${e.message}`);
    process.exit(1);
  }

  console.log('\nSearching for accessible databases…');
  const results = await notionFetch('/search', {
    method: 'POST',
    body: { filter: { value: 'database', property: 'object' }, page_size: 20 },
  });
  if (!results.results?.length) {
    console.log('  No databases found. Share a database with your integration.');
    return;
  }
  results.results.forEach(db => {
    const name = db.title?.[0]?.plain_text || '(untitled)';
    const id   = db.id.replace(/-/g, '');
    console.log(`  📋  ${name}`);
    console.log(`      database_id: ${id}`);
  });
  console.log('\nAdd database_id to config/profile.yml under notion:');
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  if (AUTH_MODE) {
    await runAuth();
    return;
  }

  const cfg = loadConfig();
  console.log(`\nNotion Job Database Scan — ${TODAY}`);
  console.log('━'.repeat(44));
  if (DRY_RUN) console.log('DRY RUN — no files will be written\n');

  // Build filter
  let filter = {
    property: cfg.statusProperty,
    select: { equals: cfg.statusUnreviewed },
  };

  if (DAYS !== null) {
    const since = new Date();
    since.setDate(since.getDate() - DAYS);
    filter = {
      and: [
        filter,
        { timestamp: 'created_time', created_time: { after: since.toISOString() } },
      ],
    };
    console.log(`Filtering to last ${DAYS} days (since ${since.toISOString().slice(0, 10)})`);
  }

  console.log(`Status filter: "${cfg.statusUnreviewed}" on property "${cfg.statusProperty}"\n`);

  // Paginate through all results
  const pages = [];
  let cursor = undefined;
  do {
    const result = await queryDatabase(cfg.databaseId, filter, cursor);
    pages.push(...(result.results || []));
    cursor = result.has_more ? result.next_cursor : undefined;
  } while (cursor);

  if (!pages.length) {
    console.log(`No pages found with status "${cfg.statusUnreviewed}".`);
    console.log('Run with --auth to verify the database is accessible.');
    return;
  }

  console.log(`Found ${pages.length} page(s) to process\n`);

  const seenUrls    = loadSeenUrls();
  const historyRows = [];
  const newItems    = [];
  const toMarkQueued = [];

  let totalSkippedDup = 0, totalSkippedFilter = 0, totalSkippedNoUrl = 0;

  for (const page of pages) {
    const title   = extractTitle(page, cfg.titleProperty);
    const url     = extractUrl(page, cfg.urlProperty);
    const company = extractText(page, cfg.companyProperty);
    const label   = title || company || page.id;

    process.stdout.write(`  ${label.slice(0, 55).padEnd(55)} `);

    if (!url) {
      process.stdout.write('(no URL — skipped)\n');
      totalSkippedNoUrl++;
      continue;
    }

    const normalUrl = url.split('?')[0];

    if (seenUrls.has(normalUrl)) {
      process.stdout.write('dup\n');
      totalSkippedDup++;
      historyRows.push(`${normalUrl}\t${TODAY}\tNotion\t${title}\t${company}\tskipped_dup`);
      continue;
    }

    if (title && !passesFilter(title)) {
      process.stdout.write('filtered\n');
      totalSkippedFilter++;
      historyRows.push(`${normalUrl}\t${TODAY}\tNotion\t${title}\t${company}\tskipped_title`);
      seenUrls.add(normalUrl);
      continue;
    }

    process.stdout.write('✓ added\n');
    seenUrls.add(normalUrl);
    newItems.push({ url: normalUrl, title, company, bucket: classifyBucket(title) });
    historyRows.push(`${normalUrl}\t${TODAY}\tNotion\t${title}\t${company}\tadded`);
    if (cfg.statusQueued) toMarkQueued.push(page.id);
  }

  // Summary
  console.log('\n' + '━'.repeat(44));
  console.log(`Pages processed:   ${pages.length}`);
  console.log(`No URL:            ${totalSkippedNoUrl}`);
  console.log(`Duplicates:        ${totalSkippedDup}`);
  console.log(`Title filtered:    ${totalSkippedFilter}`);
  console.log(`New in pipeline:   ${newItems.length}`);

  if (newItems.length > 0) {
    const buckets = {};
    newItems.forEach(i => { buckets[i.bucket] = (buckets[i.bucket] || 0) + 1; });
    Object.entries(buckets).forEach(([b, n]) => console.log(`  ${b}: ${n}`));
    console.log('');
    newItems.forEach(i => {
      const co = i.company ? ` (${i.company})` : '';
      console.log(`  + ${i.title}${co} | ${i.url}`);
    });
  }

  if (!DRY_RUN) {
    if (newItems.length > 0) appendPipeline(newItems);
    if (historyRows.length > 0) appendHistory(historyRows);

    if (cfg.statusQueued && toMarkQueued.length > 0) {
      console.log(`\nMarking ${toMarkQueued.length} page(s) as "${cfg.statusQueued}" in Notion…`);
      let marked = 0;
      for (const pageId of toMarkQueued) {
        try {
          await updatePageStatus(pageId, cfg.statusProperty, cfg.statusQueued);
          marked++;
        } catch (e) {
          console.warn(`  ⚠️  Could not update page ${pageId}: ${e.message}`);
        }
      }
      console.log(`  ✅  ${marked}/${toMarkQueued.length} pages updated`);
    }

    console.log('\n✅  Done.');
  } else {
    console.log('\n[dry-run] No files written.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
