#!/usr/bin/env node
/**
 * queue-ingest.mjs — Zero-token incremental queue ingest.
 *
 * Reads pending URLs from data/pipeline.md, diffs them against
 * data/apply-queue.json and data/applications.md, fetches the JD
 * (and form questions where the ATS API exposes them) for genuinely
 * new postings, saves JDs to jds/, and appends status:new stub
 * records to data/apply-queue.json.
 *
 * Zero model tokens — pure HTTP + JSON + file I/O.
 *
 * Usage:
 *   node queue-ingest.mjs             # ingest all pending
 *   node queue-ingest.mjs --dry-run   # preview without writing
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

import {
  loadQueue, saveQueue, appendRole, buildQueueSeenSets,
} from './queue-store.mjs';
import { fetchJson, fetchText } from './providers/_http.mjs';

const ROOT        = dirname(fileURLToPath(import.meta.url));
const PIPELINE    = join(ROOT, 'data', 'pipeline.md');
const SCAN_HIST   = join(ROOT, 'data', 'scan-history.tsv');
const APPS_FILE   = join(ROOT, 'data', 'applications.md');
const JDS_DIR     = join(ROOT, 'jds');

const DRY_RUN = process.argv.includes('--dry-run');

// ── Greenhouse ────────────────────────────────────────────────────────────────
// Allowed hostnames (mirrors providers/greenhouse.mjs allowlist)
const GH_HOSTS = new Set([
  'boards-api.greenhouse.io',
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'job-boards.eu.greenhouse.io',
]);

function detectAts(url) {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname === 'jobs.lever.co') {
      const [, slug, id] = pathname.split('/');
      return id ? { ats: 'lever', slug, id } : null;
    }
    if (hostname === 'jobs.ashbyhq.com') {
      const [, slug, id] = pathname.split('/');
      return id ? { ats: 'ashby', slug, id } : null;
    }
    if (GH_HOSTS.has(hostname)) {
      // /easygo/jobs/5103303007
      const m = pathname.match(/\/([^/]+)\/jobs\/(\d+)/);
      if (m) return { ats: 'greenhouse', slug: m[1], id: m[2] };
    }
    return { ats: 'custom', slug: null, id: null };
  } catch {
    return null;
  }
}

function stableId(url, { ats, slug, id }) {
  if (ats === 'greenhouse') return `greenhouse:${slug}:${id}`;
  if (ats === 'lever')      return `lever:${slug}:${id}`;
  if (ats === 'ashby')      return `ashby:${slug}:${id}`;
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
  return `custom:${hash}`;
}

// ── JD fetch ──────────────────────────────────────────────────────────────────

async function fetchGreenhouseJob(slug, id) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${id}?questions=true`;
  const json = await fetchJson(url);

  const description = stripHtml(json.content || '');
  const title   = json.title || '';
  const location = json.location?.name || '';

  const formFields = [];
  for (const q of (json.questions || [])) {
    if (!q.label || !q.fields?.length) continue;
    const type    = q.fields[0]?.type || 'input_text';
    const name    = q.fields[0]?.name || q.label;
    const kind    = classifyGreenhouseField(q.label, type);
    formFields.push({
      key:      name,
      label:    q.label,
      type,
      required: !!q.required,
      kind,
    });
  }

  return { title, location, description, formFields, source: 'api' };
}

async function fetchLeverJob(slug, id) {
  const url = `https://api.lever.co/v0/postings/${slug}/${id}`;
  const json = await fetchJson(url);

  const parts = [];
  if (json.description)   parts.push(stripHtml(json.description));
  for (const list of (json.lists || [])) {
    if (list.text) parts.push(`\n## ${stripHtml(list.text)}`);
    if (list.content) parts.push(stripHtml(list.content));
  }
  if (json.additional)    parts.push(stripHtml(json.additional));

  const title    = json.text || '';
  const location = json.categories?.location || '';

  // Lever public API does not expose form questions; mark as TBD
  return { title, location, description: parts.join('\n'), formFields: [], source: 'api' };
}

async function fetchAshbyJob(slug, id) {
  // Get the job from the board listing (description is included)
  const boardUrl = `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`;
  const board = await fetchJson(boardUrl);
  const job = (board.jobs || []).find(j => j.id === id || j.jobUrl?.includes(id));

  if (!job) throw new Error(`ashby: job ${id} not found in board ${slug}`);

  const title    = job.title || '';
  const location = job.location || '';

  // Build description from available text fields
  const parts = [];
  if (job.descriptionHtml) parts.push(stripHtml(job.descriptionHtml));
  else if (job.description) parts.push(job.description);

  // Ashby public API does not reliably expose form questions
  return { title, location, description: parts.join('\n'), formFields: [], source: 'api' };
}

async function fetchCustomJob(url) {
  try {
    const html = await fetchText(url);
    return {
      title:    '',
      location: '',
      description: stripHtml(html).slice(0, 8000),
      formFields: [],
      source: 'webfetch',
    };
  } catch {
    return { title: '', location: '', description: '', formFields: [], source: 'failed' };
  }
}

// ── Greenhouse field classification ──────────────────────────────────────────

function classifyGreenhouseField(label, type) {
  const l = label.toLowerCase();
  if (/resume|cv|curriculum/.test(l) && type === 'input_file') return 'resume';
  if (/cover.?letter/.test(l))   return 'standard';
  if (/first.?name|given.?name/.test(l)) return 'standard';
  if (/last.?name|family.?name|surname/.test(l)) return 'standard';
  if (/\bname\b/.test(l))        return 'standard';
  if (/email/.test(l))           return 'standard';
  if (/phone|mobile/.test(l))    return 'standard';
  if (/linkedin/.test(l))        return 'standard';
  if (/github/.test(l))          return 'standard';
  if (/location|city|where.+based/.test(l)) return 'standard';
  if (/visa|work.?auth|right.?to.?work|authoris|authoriz/.test(l)) return 'standard';
  if (/sponsor/.test(l))         return 'standard';
  if (/salary|compensation|pay|remuneration/.test(l)) return 'standard';
  if (/notice.?period|available|availability|start.?date/.test(l)) return 'standard';
  if (/why.+(company|role|us)|cover|motivation|tell.+us.+about/.test(l)) return 'standard';
  if (/hours.?(per|a|\/)\s*week|weekly.?hours/.test(l)) return 'standard';
  // Anything unrecognised is custom — will be surfaced as needs-input or manual-field
  return 'custom';
}

// ── HTML strip ───────────────────────────────────────────────────────────────

function stripHtml(html = '') {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Slug helpers ─────────────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

// ── Pipeline.md parser ───────────────────────────────────────────────────────

function parsePipeline() {
  if (!existsSync(PIPELINE)) return [];
  const text = readFileSync(PIPELINE, 'utf-8');
  const results = [];

  for (const line of text.split('\n')) {
    // Match: - [ ] <url> | <company> | <title>
    const m = line.match(/^-\s+\[\s\]\s+(https?:\/\/\S+)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/);
    if (!m) continue;
    results.push({ url: m[1], company: m[2].trim(), title: m[3].trim() });
  }
  return results;
}

// ── Seen sets from applications.md ──────────────────────────────────────────

function loadApplicationsSeenSets() {
  const urls = new Set();
  const companyRoles = new Set();
  if (!existsSync(APPS_FILE)) return { urls, companyRoles };
  const text = readFileSync(APPS_FILE, 'utf-8');
  for (const m of text.matchAll(/https?:\/\/[^\s|)]+/g)) urls.add(m[0]);
  for (const m of text.matchAll(/\|[^|]+\|[^|]+\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g)) {
    const company = m[1].trim().toLowerCase();
    const role    = m[2].trim().toLowerCase();
    if (company && role && company !== 'company') companyRoles.add(`${company}::${role}`);
  }
  return { urls, companyRoles };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(JDS_DIR, { recursive: true });

  const queue    = loadQueue();
  const queueSeen = buildQueueSeenSets(queue);
  const appSeen   = loadApplicationsSeenSets();

  const pending = parsePipeline();
  if (pending.length === 0) {
    console.log('No pending URLs in data/pipeline.md.');
    return;
  }

  console.log(`Found ${pending.length} pending URL(s) in pipeline.md`);
  if (DRY_RUN) console.log('(dry run — no files will be written)\n');

  let skipped = 0;
  let ingested = 0;
  const errors = [];

  for (const item of pending) {
    const { url, company, title } = item;

    // Dedup: skip if already in queue (any status) or already in applications.md
    if (queueSeen.urls.has(url) || appSeen.urls.has(url)) {
      skipped++;
      continue;
    }
    const crKey = `${company.toLowerCase()}::${title.toLowerCase()}`;
    if (queueSeen.companyRoles.has(crKey) || appSeen.companyRoles.has(crKey)) {
      skipped++;
      continue;
    }

    const atsInfo = detectAts(url);
    if (!atsInfo) {
      errors.push({ url, error: 'could not parse URL' });
      continue;
    }

    const roleId = stableId(url, atsInfo);

    // Double-check against ID set
    if (queueSeen.ids.has(roleId)) {
      skipped++;
      continue;
    }

    console.log(`  + Fetching: ${company} | ${title}`);

    let jdData;
    try {
      if (atsInfo.ats === 'greenhouse') {
        jdData = await fetchGreenhouseJob(atsInfo.slug, atsInfo.id);
      } else if (atsInfo.ats === 'lever') {
        jdData = await fetchLeverJob(atsInfo.slug, atsInfo.id);
      } else if (atsInfo.ats === 'ashby') {
        jdData = await fetchAshbyJob(atsInfo.slug, atsInfo.id);
      } else {
        jdData = await fetchCustomJob(url);
      }
    } catch (err) {
      errors.push({ url, error: err.message });
      console.log(`    ⚠️  fetch failed: ${err.message}`);
      continue;
    }

    // Use API title/location if richer than pipeline.md
    const resolvedTitle    = jdData.title || title;
    const resolvedLocation = jdData.location || '';

    // Save JD to jds/
    const jdSlug    = `${slugify(company)}-${slugify(resolvedTitle)}`;
    const jdPath    = join(JDS_DIR, `${jdSlug}.md`);
    const jdRelPath = `jds/${jdSlug}.md`;

    const jdContent = [
      `# ${resolvedTitle} — ${company}`,
      '',
      `**URL:** ${url}`,
      `**Source:** ${jdData.source}`,
      `**Location:** ${resolvedLocation}`,
      '',
      jdData.description || '(description not available — fetch manually)',
    ].join('\n');

    if (!DRY_RUN) writeFileSync(jdPath, jdContent, 'utf-8');

    // Build stub
    const stub = {
      id:               roleId,
      company,
      title:            resolvedTitle,
      url,
      ats:              atsInfo.ats,
      location:         resolvedLocation,
      jd_path:          jdRelPath,
      size_bucket:      null,
      score_raw:        null,
      score:            null,
      reason:           null,
      eligibility:      null,
      employment_type:  null,
      visa_answer:      null,
      confidence:       null,
      flags:            [],
      free_text_fields: jdData.formFields,
      drafts:           {},
      cv_pdf:           null,
      status:           'new',
    };

    if (!DRY_RUN) {
      appendRole(queue, stub);
      // Mark as seen within this run to avoid intra-run dupes
      queueSeen.ids.add(roleId);
      queueSeen.urls.add(url);
      queueSeen.companyRoles.add(crKey);
    }

    ingested++;
    const fieldsNote = jdData.formFields.length > 0
      ? ` (${jdData.formFields.length} form fields detected)`
      : ' (form fields TBD — confirmed at fill time)';
    console.log(`    ✅ ${roleId}${fieldsNote}`);
  }

  if (!DRY_RUN && ingested > 0) {
    saveQueue(queue);
    console.log(`\nSaved ${ingested} new stub(s) to data/apply-queue.json`);
  }

  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Queue Ingest — ${new Date().toISOString().slice(0, 10)}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Pending in pipeline.md:  ${pending.length}`);
  console.log(`Already seen (skipped):  ${skipped}`);
  console.log(`New stubs ingested:      ${ingested}`);
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  ✗ ${e.url}: ${e.error}`);
  }
  console.log(`\n→ Next: /career-ops queue   to score the ${ingested} new stub(s).`);
  if (DRY_RUN) console.log('(dry run — re-run without --dry-run to save)');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
