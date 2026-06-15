#!/usr/bin/env node
/**
 * notion-lib.mjs — shared Notion backend primitives for career-ops.
 *
 * The career-ops backend lives in Notion (DBs under the "Career Ops" page:
 * Applications, Pipeline, Scan History). DATA lives in Notion, CODE in git.
 * This module is the ONE place the API plumbing, DB/data-source resolution,
 * status validation, and record matching live.
 *
 * Pages use Notion's NATIVE markdown on both sides: read with
 * GET /pages/{id}/markdown, written with the `markdown` field on create and the
 * markdown append endpoint. No hand-rolled markdown<->blocks conversion.
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
// 2025-09-03 is the data-sources + native-markdown API: data_sources/{id}/query,
// data_source_id page parents, `markdown` on create, and the markdown read/append endpoints.
const HEADERS = { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json' };
const MAX = 1900; // safety margin under Notion's 2000-char rich_text limit
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function api(path, method, body) {
  if (!TOKEN) throw new Error('NOTION_ACCESS_TOKEN is not set (.env). The Notion backend needs it to read/write.');
  await sleep(360); // ~3 req/s
  const r = await fetch(`https://api.notion.com/v1/${path}`, { method, headers: HEADERS, body: body ? JSON.stringify(body) : undefined });
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

// ---------- text -> rich_text for PROPERTY values (chunk-safe under the 2000-char limit) ----------
// Property values (company/role/notes) are plain strings; markdown lives in page
// bodies, which Notion renders natively — so this only has to chunk, not parse.
export function rich(text) {
  const str = String(text ?? '');
  const out = [];
  for (let i = 0; i < str.length || out.length === 0; i += MAX) out.push({ type: 'text', text: { content: str.slice(i, i + MAX) } });
  return out;
}

// ---------- page create / append / read (native markdown both ways) ----------
/** Create a page in a data source. `markdown` (optional) becomes the page body, rendered server-side. */
export async function createPage(dataSourceId, properties, markdown) {
  const body = { parent: { type: 'data_source_id', data_source_id: dataSourceId }, properties };
  if (markdown) body.markdown = markdown;
  return api('pages', 'POST', body);
}
/** Append markdown to the end of a page's content. */
export async function appendMarkdown(pageId, markdown) {
  return api(`pages/${pageId}/markdown`, 'PATCH', { type: 'insert_content', insert_content: { content: markdown, position: { type: 'end' } } });
}
/** Native enhanced-markdown export (Notion renders tables/toggles/nesting server-side). */
export async function pageMarkdown(pageId) {
  const j = await api(`pages/${pageId}/markdown`, 'GET');
  if (j.truncated) throw new Error(`Notion truncated markdown for page ${pageId} (page too large).`);
  return j.markdown || '';
}

// ---------- DB/data-source resolution by name (container-proof, no hardcoded ids) ----------
/** Map of DB name -> primary data source id for every database under the Career Ops page. */
export async function resolveDBs() {
  if (!PARENT) throw new Error('Set NOTION_PARENT_PAGE_ID in .env (the "Career Ops" parent page id).');
  const out = {};
  let cursor;
  do {
    const j = await api(`blocks/${PARENT}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`, 'GET');
    for (const b of j.results) {
      if (b.type !== 'child_database') continue;
      const db = await api(`databases/${b.id}`, 'GET');
      out[b.child_database.title] = db.data_sources?.[0]?.id;
    }
    cursor = j.has_more ? j.next_cursor : null;
  } while (cursor);
  return out;
}

// ---------- query / match records ----------
export function plain(prop) {
  return (prop?.title || prop?.rich_text || []).map((t) => t.plain_text).join('');
}
export async function queryDB(dataSourceId) {
  let cursor, all = [];
  do {
    const j = await api(`data_sources/${dataSourceId}/query`, 'POST', { page_size: 100, start_cursor: cursor });
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
export async function findRecords(dataSourceId, match) {
  const m = String(match).toLowerCase().trim();
  return (await queryDB(dataSourceId)).map(summarize).filter((r) => {
    const hay = `${r.company} / ${r.role}`.toLowerCase();
    return hay.includes(m) || r.company.toLowerCase() === m;
  });
}
export async function getRecordById(id) {
  return summarize(await api(`pages/${id}`, 'GET'));
}
