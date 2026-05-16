#!/usr/bin/env node

/**
 * sync-notion.mjs — Push career-ops tracker to a Notion dashboard
 *
 * Parses data/applications.md and creates/updates a Notion database
 * so your pipeline is visible as a shareable Kanban board.
 *
 * Optional: links interview-prep/*.md files as sub-pages under the
 * matching application entry.
 *
 * Zero Claude tokens — pure Notion REST API via native fetch.
 *
 * Setup:
 *   1. Create an integration at https://www.notion.so/my-integrations
 *   2. Share a parent Notion page with the integration (the database
 *      will be created inside it on first run)
 *   3. Add to config/profile.yml:
 *        notion:
 *          token: secret_xxx            # required
 *          parent_page_id: <page ID>    # required — the page to host the DB
 *          database_id: <DB ID>         # auto-filled after first run
 *          sync_interview_prep: true    # also upload interview-prep/*.md (optional)
 *
 * Usage:
 *   node sync-notion.mjs              # full sync
 *   node sync-notion.mjs --dry-run    # preview — print what would be created/updated
 *   node sync-notion.mjs --since 7    # only sync entries modified in the last N days
 *   node sync-notion.mjs --auth       # test token + show accessible pages
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { load as loadYaml, dump as dumpYaml } from 'js-yaml';

// ── Constants ────────────────────────────────────────────────────────
const NOTION_VERSION    = '2022-06-28';
const NOTION_BASE       = 'https://api.notion.com/v1';
const APPLICATIONS_PATH = 'data/applications.md';
const INTERVIEW_PREP    = 'interview-prep';
const PROFILE_PATH      = 'config/profile.yml';
const TODAY             = new Date().toISOString().slice(0, 10);
const DB_NAME           = 'career-ops Pipeline';

// ── CLI flags ────────────────────────────────────────────────────────
const DRY_RUN   = process.argv.includes('--dry-run');
const AUTH_MODE = process.argv.includes('--auth');

const sinceArgIdx = process.argv.indexOf('--since');
const _sinceParsed = sinceArgIdx !== -1 ? Number(process.argv[sinceArgIdx + 1]) : NaN;
const SINCE_DAYS = Number.isFinite(_sinceParsed) && _sinceParsed > 0 ? _sinceParsed : null;

// ── Config ───────────────────────────────────────────────────────────
function loadProfile() {
  if (!existsSync(PROFILE_PATH)) {
    console.error('❌  config/profile.yml not found. Run onboarding first.');
    process.exit(1);
  }
  return loadYaml(readFileSync(PROFILE_PATH, 'utf8')) || {};
}

function loadConfig() {
  const profile = loadProfile();
  const n = profile.notion || {};
  const token = n.token || process.env.NOTION_TOKEN;

  if (!AUTH_MODE && !token) {
    console.error(
      '❌  Notion token not configured.\n' +
      '    Add to config/profile.yml:\n' +
      '      notion:\n' +
      '        token: secret_xxx\n' +
      '        parent_page_id: <page ID>\n' +
      '    Run: node sync-notion.mjs --auth   to get page IDs.'
    );
    process.exit(1);
  }

  return {
    token,
    parentPageId:      n.parent_page_id   || '',
    databaseId:        n.database_id       || '',
    syncInterviewPrep: n.sync_interview_prep !== false,
  };
}

function saveConfig(patch) {
  const profile = loadProfile();
  profile.notion = { ...(profile.notion || {}), ...patch };
  writeFileSync(PROFILE_PATH, dumpYaml(profile, { lineWidth: 120 }));
}

// ── Notion API ───────────────────────────────────────────────────────
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
    const text = await res.text();
    throw new Error(`Notion ${res.status} on ${path}: ${text}`);
  }
  return res.json();
}

// ── Tracker parser ───────────────────────────────────────────────────
const STATUS_COLORS = {
  Evaluated:  'yellow',
  Applied:    'blue',
  Responded:  'purple',
  Interview:  'orange',
  Offer:      'green',
  Rejected:   'red',
  Discarded:  'gray',
  SKIP:       'gray',
};

function parseApplicationsTable(md) {
  const lines = md.split('\n');
  const tableStart = lines.findIndex(l => l.includes('| # |') || l.includes('| # |'));
  if (tableStart === -1) return [];

  const rows = [];
  for (let i = tableStart + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) break;
    const cells = line.split('|').map(c => c.trim()).filter((_, idx) => idx > 0);
    if (cells.length < 8) continue;

    const [num, date, company, role, score, status, pdf, report, ...noteParts] = cells;
    const notes = noteParts.join(' | ').replace(/\|?\s*$/, '').trim();

    // Strip markdown from score, report
    const cleanScore = score.replace(/[^0-9.]/g, '') || '';
    const scoreNum   = parseFloat(cleanScore) || null;

    // Extract report URL from markdown link [n](reports/...)
    const reportMatch = report.match(/\[.*?\]\((.*?)\)/);
    const reportUrl   = reportMatch ? reportMatch[1] : '';

    rows.push({
      num:    parseInt(num) || 0,
      date:   date || TODAY,
      company,
      role,
      score:  scoreNum,
      status: status || 'Evaluated',
      hasPdf: pdf.includes('✅') || pdf.includes('yes'),
      reportPath: reportUrl,
      notes,
    });
  }
  return rows;
}

// ── Notion DB schema ─────────────────────────────────────────────────
function buildDatabaseSchema(parentPageId) {
  return {
    parent:    { type: 'page_id', page_id: parentPageId },
    title:     [{ type: 'text', text: { content: DB_NAME } }],
    is_inline: false,
    properties: {
      Name:      { title: {} },
      Company:   { rich_text: {} },
      Role:      { rich_text: {} },
      Score:     { number: { format: 'number' } },
      Status:    {
        select: {
          options: Object.entries(STATUS_COLORS).map(([name, color]) => ({ name, color })),
        },
      },
      Date:      { date: {} },
      'Has PDF': { checkbox: {} },
      Report:    { url: {} },
      Notes:     { rich_text: {} },
      '#':       { number: { format: 'number' } },
    },
  };
}

function buildPageProperties(app) {
  const props = {
    Name:      { title: [{ text: { content: `${app.company} — ${app.role}` } }] },
    Company:   { rich_text: [{ text: { content: app.company } }] },
    Role:      { rich_text: [{ text: { content: app.role } }] },
    Status:    { select: { name: app.status in STATUS_COLORS ? app.status : 'Evaluated' } },
    Date:      { date: { start: app.date || TODAY } },
    'Has PDF': { checkbox: app.hasPdf },
    '#':       { number: app.num },
  };
  if (app.score !== null) props.Score = { number: app.score };
  if (app.reportPath) props.Report = { url: app.reportPath };
  if (app.notes) props.Notes = { rich_text: [{ text: { content: app.notes.slice(0, 2000) } }] };
  return props;
}

// ── Existing page lookup ─────────────────────────────────────────────
async function fetchExistingPages(databaseId) {
  const pages = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const result = await notionFetch(`/databases/${databaseId}/query`, { method: 'POST', body });
    pages.push(...(result.results || []));
    cursor = result.has_more ? result.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function buildExistingIndex(pages) {
  const index = new Map();
  for (const p of pages) {
    const titleParts = p.properties?.Name?.title || [];
    const title = titleParts.map(t => t.plain_text).join('');
    if (title) index.set(title, p.id);
  }
  return index;
}

// ── Interview prep upload ─────────────────────────────────────────────
function parseMarkdownToBlocks(md) {
  const blocks = [];
  for (const line of md.split('\n').slice(0, 100)) { // Notion API limit
    if (line.startsWith('# '))  { blocks.push({ object: 'block', type: 'heading_1', heading_1: { rich_text: [{ text: { content: line.slice(2).trim() } }] } }); continue; }
    if (line.startsWith('## ')) { blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: line.slice(3).trim() } }] } }); continue; }
    if (line.startsWith('### ')){ blocks.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ text: { content: line.slice(4).trim() } }] } }); continue; }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: line.slice(2).trim() } }] } });
      continue;
    }
    const t = line.trim();
    if (t) blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: t } }] } });
  }
  return blocks;
}

async function uploadInterviewPrep(parentPageId) {
  if (!existsSync(INTERVIEW_PREP)) return 0;
  const files = readdirSync(INTERVIEW_PREP).filter(f => f.endsWith('.md') && !f.startsWith('archieved'));
  let count = 0;
  for (const file of files) {
    const md = readFileSync(`${INTERVIEW_PREP}/${file}`, 'utf8');
    const firstLine = md.split('\n').find(l => l.trim()) || file;
    const title = firstLine.replace(/^#+\s*/, '').trim().slice(0, 100);
    const blocks = parseMarkdownToBlocks(md);
    if (DRY_RUN) { console.log(`  [dry] would upload: ${file} → "${title}"`); count++; continue; }
    await notionFetch('/pages', {
      method: 'POST',
      body: {
        parent: { type: 'page_id', page_id: parentPageId },
        properties: { title: [{ type: 'text', text: { content: title } }] },
        children: blocks.slice(0, 100),
      },
    });
    console.log(`  📄  Uploaded: ${file}`);
    count++;
  }
  return count;
}

// ── Auth mode ────────────────────────────────────────────────────────
async function runAuth() {
  const cfg = loadConfig();
  if (!cfg.token) {
    console.error('❌  No token. Set notion.token in config/profile.yml or NOTION_TOKEN env var.');
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

  console.log('\nSearching for accessible pages (share a page with your integration)…');
  const res = await notionFetch('/search', {
    method: 'POST',
    body: { filter: { value: 'page', property: 'object' }, page_size: 20 },
  });
  (res.results || []).forEach(p => {
    const name = (p.properties?.title?.title || p.properties?.Name?.title || [])[0]?.plain_text || '(untitled)';
    const id   = p.id.replace(/-/g, '');
    console.log(`  📄  ${name}`);
    console.log(`      parent_page_id: ${id}`);
  });
  console.log('\nAdd parent_page_id to config/profile.yml under notion:');
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  if (AUTH_MODE) { await runAuth(); return; }

  const cfg = loadConfig();

  console.log(`\nNotion Pipeline Sync — ${TODAY}`);
  console.log('━'.repeat(44));
  if (DRY_RUN) console.log('DRY RUN — no API writes\n');

  if (!existsSync(APPLICATIONS_PATH)) {
    console.error(`❌  ${APPLICATIONS_PATH} not found.`);
    process.exit(1);
  }

  const md   = readFileSync(APPLICATIONS_PATH, 'utf8');
  let apps   = parseApplicationsTable(md);
  console.log(`Parsed ${apps.length} applications from tracker`);

  if (SINCE_DAYS !== null) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - SINCE_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    apps = apps.filter(a => (a.date || '') >= cutoffStr);
    console.log(`Filtered to last ${SINCE_DAYS} days: ${apps.length} entries (since ${cutoffStr})`);
  }

  if (!apps.length) { console.log('Nothing to sync.'); return; }

  // Ensure database exists
  let { databaseId, parentPageId } = cfg;

  if (!databaseId) {
    if (!parentPageId) {
      console.error('❌  notion.parent_page_id not set. Run --auth to find a page ID.');
      process.exit(1);
    }
    if (DRY_RUN) {
      console.log(`[dry] would create Notion database "${DB_NAME}" under parent ${parentPageId}`);
    } else {
      console.log(`Creating Notion database "${DB_NAME}"…`);
      const db = await notionFetch('/databases', {
        method: 'POST',
        body: buildDatabaseSchema(parentPageId),
      });
      databaseId = db.id;
      saveConfig({ database_id: databaseId });
      console.log(`✅  Created: ${databaseId}`);
    }
  } else {
    console.log(`Using existing database: ${databaseId}`);
  }

  if (DRY_RUN) {
    console.log(`\n[dry] would upsert ${apps.length} application(s) to Notion:`);
    apps.slice(0, 10).forEach(a => console.log(`  ${a.num}. ${a.company} — ${a.role} [${a.status}]`));
    if (apps.length > 10) console.log(`  … and ${apps.length - 10} more`);
    return;
  }

  // Load existing pages to detect create vs update
  console.log('\nFetching existing Notion pages…');
  const existingPages = await fetchExistingPages(databaseId);
  const existingIndex = buildExistingIndex(existingPages);
  console.log(`  Found ${existingPages.length} existing page(s)\n`);

  let created = 0, updated = 0, errors = 0;

  for (const app of apps) {
    const title = `${app.company} — ${app.role}`;
    const props = buildPageProperties(app);

    try {
      const existingId = existingIndex.get(title);
      if (existingId) {
        await notionFetch(`/pages/${existingId}`, { method: 'PATCH', body: { properties: props } });
        updated++;
        process.stdout.write('u');
      } else {
        await notionFetch('/pages', {
          method: 'POST',
          body: { parent: { database_id: databaseId }, properties: props },
        });
        created++;
        process.stdout.write('+');
      }
    } catch (e) {
      console.warn(`\n  ⚠️  ${title}: ${e.message}`);
      errors++;
    }
  }

  console.log('\n');
  console.log('━'.repeat(44));
  console.log(`Total synced:   ${apps.length}`);
  console.log(`  Created:      ${created}`);
  console.log(`  Updated:      ${updated}`);
  if (errors) console.log(`  Errors:       ${errors}`);

  // Interview prep upload
  if (cfg.syncInterviewPrep) {
    console.log('\nUploading interview-prep notes…');
    const prepCount = await uploadInterviewPrep(parentPageId || databaseId);
    console.log(`  ${prepCount} file(s) processed`);
  }

  console.log('\n✅  Done.');
  console.log(`\n🔗  Open in Notion and switch the database to "Board" view`);
  console.log(`    (Group by: Status) to get the Kanban pipeline.`);
}

main().catch(err => { console.error(err); process.exit(1); });
