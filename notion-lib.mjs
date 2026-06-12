#!/usr/bin/env node
/**
 * notion-lib.mjs — shared Notion backend primitives for career-ops.
 *
 * The career-ops backend lives in Notion (3 DBs under the "Career Ops" page:
 * Applications, Pipeline, Scan History). DATA lives in Notion, CODE in git.
 * This module is the ONE place the API plumbing, markdown<->blocks conversion,
 * DB-resolution-by-name, status validation, and record matching live.
 *
 * Consumed by notion.mjs (the CLI) and importable by other scripts (e.g. scan.mjs).
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const DIR = dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.NOTION_ACCESS_TOKEN;
// Parent "Career Ops" page id — supplied via env so no workspace identifier lives in the repo.
export const PARENT = process.env.NOTION_PARENT_PAGE_ID || '';
const HEADERS = { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
const MAX = 1900; // safety margin under Notion's 2000-char rich_text limit
// Native page-markdown export needs >= this API version. Kept separate from the
// default 2022-06-28 used elsewhere so resolveDBs/queryDB are unaffected by the
// databases->data-sources split that 2025-09-03 also introduced.
const MD_VERSION = '2025-09-03';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function api(path, method, body, version) {
  if (!TOKEN) throw new Error('NOTION_ACCESS_TOKEN is not set (.env). The Notion backend needs it to read/write.');
  await sleep(360); // ~3 req/s
  const headers = version ? { ...HEADERS, 'Notion-Version': version } : HEADERS;
  const r = await fetch(`https://api.notion.com/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(`Notion ${method} ${path} -> ${j.code}: ${j.message}`);
  return j;
}

// ---------- canonical states (templates/states.yml is the source of truth) ----------
let _states;
function loadStates() {
  if (_states) return _states;
  const doc = yaml.load(readFileSync(join(DIR, 'templates/states.yml'), 'utf-8'));
  const labels = [], aliasMap = {};
  for (const s of doc.states) {
    labels.push(s.label);
    aliasMap[s.label.toLowerCase()] = s.label;
    for (const a of (s.aliases || [])) aliasMap[String(a).toLowerCase()] = s.label;
  }
  _states = { labels, aliasMap };
  return _states;
}
/** Return the canonical label for a status (case-insensitive, alias-aware), or null if unknown. */
export function canonicalStatus(raw) {
  if (!raw) return null;
  const key = String(raw).replace(/\*\*/g, '').trim().toLowerCase();
  return loadStates().aliasMap[key] || null;
}
export function statusLabels() { return loadStates().labels.slice(); }

// ---------- text chunking (never exceed the per-rich_text 2000-char limit) ----------
function splitContent(str) {
  const out = [];
  for (let i = 0; i < str.length; i += MAX) out.push(str.slice(i, i + MAX));
  return out.length ? out : [''];
}
function splitRuns(runs) {
  const out = [];
  for (const run of runs) {
    const content = run.text?.content ?? '';
    if (content.length <= MAX) { out.push(run); continue; }
    for (const piece of splitContent(content)) {
      out.push({ type: 'text', text: { content: piece, link: run.text.link || null }, annotations: run.annotations });
    }
  }
  return out;
}

// ---------- inline markdown -> rich_text (links, bold, inline code), always chunk-safe ----------
export function rich(text) {
  if (!text) return [{ type: 'text', text: { content: '' } }];
  const out = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0, m;
  const push = (content, ann, link) => { if (content) out.push({ type: 'text', text: { content, link: link ? { url: link } : null }, annotations: ann }); };
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index));
    if (m[1]) push(m[1], undefined, m[2]);
    else if (m[3]) push(m[3], { bold: true });
    else if (m[4]) push(m[4], { code: true });
    last = re.lastIndex;
  }
  push(text.slice(last));
  return splitRuns(out.length ? out : [{ type: 'text', text: { content: text } }]);
}
const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
function codeRich(buf) {
  // never truncate code: split into <=MAX-char rich_text items
  return splitContent(buf).map((piece) => ({ type: 'text', text: { content: piece } }));
}

// ---------- markdown -> Notion blocks ----------
export function mdToBlocks(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || 'plain text';
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      blocks.push({ type: 'code', code: { rich_text: codeRich(buf.join('\n')), language: ['yaml', 'json', 'javascript', 'bash', 'markdown', 'ruby', 'python'].includes(lang) ? lang : 'plain text' } });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const header = cells(line);
      const rows = [header];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      i--;
      const width = header.length;
      blocks.push({ type: 'table', table: { table_width: width, has_column_header: true, has_row_header: false,
        children: rows.map((r) => ({ type: 'table_row', table_row: { cells: Array.from({ length: width }, (_, c) => rich(r[c] || '')) } })) } });
      continue;
    }
    if (line.startsWith('### ')) { blocks.push({ type: 'heading_3', heading_3: { rich_text: rich(line.slice(4)) } }); continue; }
    if (line.startsWith('## ')) { blocks.push({ type: 'heading_2', heading_2: { rich_text: rich(line.slice(3)) } }); continue; }
    if (line.startsWith('# ')) { blocks.push({ type: 'heading_1', heading_1: { rich_text: rich(line.slice(2)) } }); continue; }
    if (line.trim() === '---') { blocks.push({ type: 'divider', divider: {} }); continue; }
    if (/^\s*\d+\.\s/.test(line)) { blocks.push({ type: 'numbered_list_item', numbered_list_item: { rich_text: rich(line.replace(/^\s*\d+\.\s/, '')) } }); continue; }
    if (/^\s*[-*] /.test(line)) { blocks.push({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: rich(line.replace(/^\s*[-*] /, '')) } }); continue; }
    if (line.startsWith('> ')) { blocks.push({ type: 'quote', quote: { rich_text: rich(line.slice(2)) } }); continue; }
    blocks.push({ type: 'paragraph', paragraph: { rich_text: rich(line) } });
  }
  return blocks;
}

// ---------- page create / append / read ----------
export async function createPage(dbId, properties, blocks = []) {
  const page = await api('pages', 'POST', { parent: { database_id: dbId }, properties, children: blocks.slice(0, 100) });
  for (let i = 100; i < blocks.length; i += 100) await api(`blocks/${page.id}/children`, 'PATCH', { children: blocks.slice(i, i + 100) });
  return page;
}
export async function appendBlocks(pageId, blocks) {
  for (let i = 0; i < blocks.length; i += 100) await api(`blocks/${pageId}/children`, 'PATCH', { children: blocks.slice(i, i + 100) });
}
// Native enhanced-markdown export (Notion renders tables/toggles/nesting server-side).
export async function pageMarkdown(pageId) {
  const j = await api(`pages/${pageId}/markdown`, 'GET', undefined, MD_VERSION);
  if (j.truncated) throw new Error(`Notion truncated markdown for page ${pageId} (page too large).`);
  return j.markdown || '';
}

// ---------- DB resolution by name (container-proof, no hardcoded DB ids) ----------
export async function resolveDBs() {
  if (!PARENT) throw new Error('Set NOTION_PARENT_PAGE_ID in .env (the "Career Ops" parent page id).');
  const out = {};
  let cursor;
  do {
    const j = await api(`blocks/${PARENT}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`, 'GET');
    for (const b of j.results) if (b.type === 'child_database') out[b.child_database.title] = b.id;
    cursor = j.has_more ? j.next_cursor : null;
  } while (cursor);
  return out;
}

// ---------- query / match records ----------
export function plain(prop) {
  return (prop?.title || prop?.rich_text || []).map((t) => t.plain_text).join('');
}
export async function queryDB(dbId) {
  let cursor, all = [];
  do {
    const j = await api(`databases/${dbId}/query`, 'POST', { page_size: 100, start_cursor: cursor });
    all.push(...j.results);
    cursor = j.has_more ? j.next_cursor : null;
  } while (cursor);
  return all;
}
function summarize(r) {
  return {
    id: r.id,
    company: plain(r.properties.Company),
    role: plain(r.properties.Role),
    status: r.properties.Status?.select?.name || '',
    score: r.properties.Score?.number ?? null,
    url: r.url,
    raw: r,
  };
}
/** Match against "<company> / <role>" (substring, case-insensitive) or exact company. Returns summaries. */
export async function findRecords(dbId, match) {
  const m = String(match).toLowerCase().trim();
  return (await queryDB(dbId)).map(summarize).filter((r) => {
    const hay = `${r.company} / ${r.role}`.toLowerCase();
    return hay.includes(m) || r.company.toLowerCase() === m;
  });
}
export async function getRecordById(id) {
  return summarize(await api(`pages/${id}`, 'GET'));
}
