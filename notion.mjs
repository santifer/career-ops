#!/usr/bin/env node
/**
 * notion.mjs — career-ops Notion backend CLI.
 *
 * The Notion-native replacement for the file-based tracker tooling. The block
 * converter, DB resolution, status validation, and record matching all live in
 * notion-lib.mjs. The usual caller is an LLM agent running one stable command.
 *
 *   node notion.mjs add    --company "X" --role "Y" [--status Evaluated --score 4.2 --bucket Serious --gate-location pass --gate-level pass --gate-lane pass --url ... --report file.md --notes ... --connections ... --date YYYY-MM-DD --pdf] [--force]
 *   node notion.mjs update <match>|--id ID  [--status ... --score ... --bucket ... --gate-location ... --gate-level ... --gate-lane ... --notes ... --connections ... --url ... --company ... --role ... --date ... --pdf]
 *   node notion.mjs log    <match>|--id ID  --date YYYY-MM-DD --summary "..." [--detail "..."]
 *   node notion.mjs get    <match>|--id ID
 *   node notion.mjs list   [--status X] [--company Y]
 *   node notion.mjs help
 *
 * Add --json to any verb for machine-readable output.
 */
import { readFileSync, existsSync } from 'fs';
import {
  resolveDBs, findRecords, getRecordById, queryDB, plain,
  createPage, appendBlocks, api, rich, mdToBlocks, pageMarkdown,
  canonicalStatus, statusLabels,
} from './notion-lib.mjs';

// ---------- arg parsing ----------
const argv = process.argv.slice(2);
const verb = argv[0];
const positionals = [];
const flags = {};
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const eq = a.indexOf('=');
    if (eq !== -1) { flags[a.slice(2, eq)] = a.slice(eq + 1); }
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { flags[a.slice(2)] = argv[++i]; }
    else { flags[a.slice(2)] = true; }
  } else positionals.push(a);
}
const JSON_OUT = !!flags.json;
const out = (human, data) => { if (JSON_OUT) console.log(JSON.stringify(data, null, 2)); else console.log(human); };
const die = (msg, data) => { if (JSON_OUT) console.log(JSON.stringify({ error: msg, ...data }, null, 2)); else console.error('✗ ' + msg); process.exit(1); };

// ---------- helpers ----------
function checkStatus(raw) {
  if (raw === undefined) return undefined;
  const c = canonicalStatus(raw);
  if (!c) die(`"${raw}" is not a canonical status. Valid: ${statusLabels().join(', ')}`);
  return c;
}
const BUCKETS = ['Serious', 'Practice', 'Skip'];
function checkBucket(raw) {
  const hit = BUCKETS.find((b) => b.toLowerCase() === String(raw).trim().toLowerCase());
  if (!hit) die(`"${raw}" is not a valid bucket. Valid: ${BUCKETS.join(', ')}`);
  return hit;
}
function gateBool(raw) {
  const v = String(raw).trim().toLowerCase();
  if (v === 'pass' || v === 'true') return true;
  if (v === 'fail' || v === 'false') return false;
  die(`"${raw}" is not a valid gate value. Use pass or fail.`);
}
// Maps a record's gate checkboxes to a compact "Location:PASS Level:PASS Lane:FAIL" string.
const GATE_PROPS = { Location: 'Gate: Location', Level: 'Gate: Level', Lane: 'Gate: Lane' };
function gatesOf(props) {
  return Object.entries(GATE_PROPS)
    .filter(([, p]) => props[p]?.checkbox !== undefined)
    .map(([label, p]) => `${label}:${props[p].checkbox ? 'PASS' : 'FAIL'}`)
    .join(' ');
}
async function resolveTarget(dbId) {
  if (flags.id) return getRecordById(flags.id);
  const match = positionals[0];
  if (!match) die('Provide a match string or --id. e.g. update "Acme/Staff Engineer" --status Interview');
  const hits = await findRecords(dbId, match);
  if (hits.length === 0) die(`No record matches "${match}".`);
  if (hits.length > 1) die(`"${match}" is ambiguous (${hits.length} matches). Narrow it or use --id.`,
    { candidates: hits.map((h) => ({ id: h.id, company: h.company, role: h.role })) });
  return hits[0];
}

// ---------- verbs ----------
async function cmdAdd(apps) {
  const company = flags.company, role = flags.role;
  if (!company || !role) die('add requires --company and --role.');
  const status = checkStatus(flags.status || 'Evaluated');

  // dedup: never create a second record for the same company+role
  const dupes = (await findRecords(apps, `${company} / ${role}`))
    .filter((h) => h.company.toLowerCase() === company.toLowerCase() && h.role.toLowerCase() === role.toLowerCase());
  if (dupes.length && !flags.force) {
    die(`A record for "${company} — ${role}" already exists (${dupes[0].id}). Use \`update\` instead, or pass --force.`,
      { existing: dupes[0].id });
  }

  let url = flags.url, body = [];
  if (flags.report) {
    if (!existsSync(flags.report)) die(`Report file not found: ${flags.report}`);
    const md = readFileSync(flags.report, 'utf-8');
    if (!url) url = (md.match(/^\*\*URL:\*\*\s*(\S+)/m) || [])[1];
    body = mdToBlocks(md);
  }

  const props = { Role: { title: rich(role) }, Company: { rich_text: rich(company) }, Status: { select: { name: status } }, PDF: { checkbox: !!flags.pdf } };
  if (flags.score !== undefined) props.Score = { number: parseFloat(flags.score) };
  if (url) props.URL = { url };
  if (flags.date) props.Date = { date: { start: flags.date } };
  if (flags.notes) props.Notes = { rich_text: rich(flags.notes) };
  if (flags.connections) props.Connections = { rich_text: rich(flags.connections) };
  if (flags.bucket) props.Bucket = { select: { name: checkBucket(flags.bucket) } };
  if (flags['gate-location'] !== undefined) props['Gate: Location'] = { checkbox: gateBool(flags['gate-location']) };
  if (flags['gate-level'] !== undefined) props['Gate: Level'] = { checkbox: gateBool(flags['gate-level']) };
  if (flags['gate-lane'] !== undefined) props['Gate: Lane'] = { checkbox: gateBool(flags['gate-lane']) };

  const page = await createPage(apps, props, body);
  out(`✓ Added: ${company} — ${role} [${status}]${body.length ? ` (+${body.length} body blocks)` : ''}\n  id:  ${page.id}\n  url: ${page.url}`,
    { id: page.id, url: page.url, company, role, status, blocks: body.length });
}

async function cmdUpdate(apps) {
  const rec = await resolveTarget(apps);
  const status = checkStatus(flags.status);
  const props = {};
  if (status) props.Status = { select: { name: status } };
  if (flags.score !== undefined) props.Score = { number: parseFloat(flags.score) };
  if (flags.url) props.URL = { url: flags.url };
  if (flags.date) props.Date = { date: { start: flags.date } };
  if (flags.company) props.Company = { rich_text: rich(flags.company) };
  if (flags.role) props.Role = { title: rich(flags.role) };
  if (flags.notes) props.Notes = { rich_text: rich(flags.notes) };
  if (flags.connections) props.Connections = { rich_text: rich(flags.connections) };
  if (flags.pdf !== undefined) props.PDF = { checkbox: flags.pdf === true || flags.pdf === 'true' };
  if (flags.bucket) props.Bucket = { select: { name: checkBucket(flags.bucket) } };
  if (flags['gate-location'] !== undefined) props['Gate: Location'] = { checkbox: gateBool(flags['gate-location']) };
  if (flags['gate-level'] !== undefined) props['Gate: Level'] = { checkbox: gateBool(flags['gate-level']) };
  if (flags['gate-lane'] !== undefined) props['Gate: Lane'] = { checkbox: gateBool(flags['gate-lane']) };
  if (!Object.keys(props).length) die('Nothing to update. Pass at least one of --status/--score/--bucket/--gate-location/--gate-level/--gate-lane/--url/--date/--company/--role/--notes/--connections/--pdf.');
  await api(`pages/${rec.id}`, 'PATCH', { properties: props });
  out(`✓ Updated: ${rec.company} — ${rec.role} (${Object.keys(props).join(', ')})\n  id: ${rec.id}`,
    { id: rec.id, updated: Object.keys(props) });
}

async function cmdLog(apps) {
  const rec = await resolveTarget(apps);
  if (!flags.date || !flags.summary) die('log requires --date and --summary (and optionally --detail).');
  const head = { type: 'heading_3', heading_3: { rich_text: rich(`🗓️ ${flags.date}`) } };
  const summary = String(flags.summary).split('\n').filter(Boolean)
    .map((s) => ({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: rich(s) } }));
  const blocks = [head, ...summary];
  if (flags.detail) {
    blocks.push({ type: 'toggle', toggle: { rich_text: rich('Detail'),
      children: String(flags.detail).split('\n').filter(Boolean).map((s) => ({ type: 'paragraph', paragraph: { rich_text: rich(s) } })) } });
  }
  await appendBlocks(rec.id, blocks);
  out(`✓ Logged ${flags.date} on ${rec.company} — ${rec.role}\n  id: ${rec.id}`, { id: rec.id, date: flags.date });
}

async function cmdGet(apps) {
  const rec = await resolveTarget(apps);
  const md = await pageMarkdown(rec.id);
  const bucket = rec.raw.properties.Bucket?.select?.name || null;
  const gates = gatesOf(rec.raw.properties);
  if (JSON_OUT) {
    console.log(JSON.stringify({ company: rec.company, role: rec.role, status: rec.status, score: rec.score,
      bucket, gates: gates || null,
      notes: plain(rec.raw.properties.Notes), connections: plain(rec.raw.properties.Connections),
      id: rec.id, url: rec.raw.properties.URL?.url || null, body: md }, null, 2));
    return;
  }
  console.log(`# ${rec.company} — ${rec.role}`);
  console.log(`Status: ${rec.status} | Score: ${rec.score ?? '—'} | Bucket: ${bucket || '—'} | URL: ${rec.raw.properties.URL?.url || '—'}`);
  if (gates) console.log(`Gates: ${gates}`);
  console.log(`id: ${rec.id}\n`);
  console.log(md || '(empty body)');
}

async function cmdList(apps) {
  let rows = (await queryDB(apps)).map((r) => ({ company: plain(r.properties.Company), role: plain(r.properties.Role),
    status: r.properties.Status?.select?.name || '', score: r.properties.Score?.number ?? null,
    bucket: r.properties.Bucket?.select?.name || null, id: r.id }));
  if (flags.status) { const s = checkStatus(flags.status); rows = rows.filter((r) => r.status === s); }
  if (flags.bucket) { const b = checkBucket(flags.bucket); rows = rows.filter((r) => r.bucket === b); }
  if (flags.company) rows = rows.filter((r) => r.company.toLowerCase().includes(String(flags.company).toLowerCase()));
  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  if (JSON_OUT) { console.log(JSON.stringify(rows, null, 2)); return; }
  console.log(`${rows.length} record(s):`);
  for (const r of rows) console.log(`  ${(r.score ?? '—').toString().padStart(3)} | ${(r.bucket || '—').padEnd(8)} | ${(r.status || '').padEnd(10)} | ${r.company} — ${r.role}`);
}

function cmdHelp() {
  console.log(`career-ops Notion backend CLI

  add    --company X --role Y [--status Evaluated --score 4.2 --bucket Serious --gate-location pass --gate-level pass --gate-lane pass --url U --report f.md --notes N --connections C --date YYYY-MM-DD --pdf] [--force]
  update <match>|--id ID  [--status ... --score ... --bucket ... --gate-location pass|fail --gate-level pass|fail --gate-lane pass|fail --url ... --date ... --company ... --role ... --notes ... --connections ... --pdf]
  log    <match>|--id ID  --date YYYY-MM-DD --summary "..." [--detail "..."]
  get    <match>|--id ID
  list   [--status X] [--bucket Y] [--company Z]

  <match> = substring of "Company / Role" (case-insensitive). Ambiguous matches fail loudly; use --id to pin.
  Score = Substance (1-5, role on its merits). Gates (Location/Level/Lane) are hard pass/fail. Bucket: ${BUCKETS.join(', ')}.
  Add --json for machine-readable output. Statuses validated against templates/states.yml: ${statusLabels().join(', ')}.`);
}

// ---------- dispatch ----------
(async () => {
  if (!verb || verb === 'help' || flags.help) return cmdHelp();
  const dbs = await resolveDBs();
  const apps = dbs['Applications'];
  if (!apps) die('Could not resolve the "Applications" database under the Career Ops page. Is the integration shared with it?');
  switch (verb) {
    case 'add': return cmdAdd(apps);
    case 'update': return cmdUpdate(apps);
    case 'log': return cmdLog(apps);
    case 'get': return cmdGet(apps);
    case 'list': return cmdList(apps);
    default: die(`Unknown verb "${verb}". Run \`node notion.mjs help\`.`);
  }
})().catch((e) => die(e.message));
