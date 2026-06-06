#!/usr/bin/env node
/**
 * queue-ingest.mjs — Zero-token incremental queue ingest.
 *
 * Reads pending URLs from data/pipeline.md, diffs them against
 * the queue store and data/applications.md, fetches the JD
 * (and form questions where the ATS API exposes them) for genuinely
 * new postings, saves JDs to jds/, and appends status:new stub
 * records to the queue store.
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
  loadQueue, saveQueue, appendRole, loadQueueSeenSets,
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

// ── Login-gated ATS hosts ─────────────────────────────────────────────────────
// Portals that require a candidate account before the application form is
// accessible. Roles from these hosts get the `login-required` flag at ingest
// so the inbox session can show a 🔐 badge and the agent knows to pause for
// authentication before filling.
const LOGIN_GATED_HOSTS = new Set([
  'jobs.careers.vic.gov.au',   // Vic Gov / Victoria Legal Aid
  'careers.vic.gov.au',
  'elmotalent.com.au',         // ELMO Talent (Cater Care, etc.)
  'myworkdayjobs.com',         // Workday
  'pageuppeople.com',          // PageUp
  'taleo.net',                 // Oracle Taleo
  'smartrecruiters.com',       // SmartRecruiters
  'successfactors.com',        // SAP SuccessFactors
  'icims.com',                 // iCIMS
]);

function isLoginGated(url) {
  try {
    const { hostname } = new URL(url);
    if (LOGIN_GATED_HOSTS.has(hostname)) return true;
    for (const h of LOGIN_GATED_HOSTS) {
      if (hostname.endsWith('.' + h)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

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

function discoverySourceFor(ats) {
  if (ats === 'greenhouse') return 'greenhouse-api';
  if (ats === 'lever') return 'lever-api';
  if (ats === 'ashby') return 'ashby-api';
  return 'websearch';
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
    // Capture select options so the resolver can map an answer to an exact
    // option (Greenhouse exposes them as fields[0].values[].label).
    const options = (q.fields[0]?.values || [])
      .map((v) => (v && v.label != null ? String(v.label) : null))
      .filter(Boolean);
    formFields.push({
      key:      name,
      label:    q.label,
      type,
      required: !!q.required,
      kind,
      ...(options.length ? { options } : {}),
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

// ── KSC / cover-letter / document detection ───────────────────────────────────

const KSC_PATTERNS = [
  /key\s+selection\s+criteria/i,
  /selection\s+criteria/i,
  /address\s+the\s+(following\s+)?criteria/i,
  /\bksc\b/i,
  /respond\s+to\s+the\s+(following\s+)?criteria/i,
  /criterion\s+\d|criteria\s+\d/i,
  /demonstrate\s+how\s+you\s+meet/i,
];

const COVER_LETTER_PATTERNS = [
  /cover\s+letter/i,
  /covering\s+letter/i,
  /letter\s+of\s+application/i,
  /letter\s+of\s+motivation/i,
];

// Extract the individual KSC criterion headings from JD text
function extractKscCriteria(text) {
  const criteria = [];

  // Common patterns: "1. <criterion>", "• <criterion>", numbered lists
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Numbered "1. " or "1) " style
    const numMatch = trimmed.match(/^\d+[.)]\s+(.{10,200})$/);
    if (numMatch && criteria.length > 0) {
      // Only capture if we're in a KSC section context
      criteria.push(numMatch[1].trim());
      continue;
    }
    // Bullet point lines within a KSC section
    if (criteria.length > 0 && /^[•\-–*]\s+(.{10,200})$/.test(trimmed)) {
      criteria.push(trimmed.replace(/^[•\-–*]\s+/, ''));
    }
  }

  return criteria.slice(0, 10); // cap at 10 criteria
}

/**
 * Detect whether a JD requires Key Selection Criteria, a cover letter,
 * and extract requirements snippet (free — no model call).
 *
 * @param {string} description — plain-text JD content
 * @param {Array}  formFields  — Greenhouse/Lever form fields
 * @returns {{ kscRequired: boolean, criteria: string[], coverLetterRequired: boolean, requirementsSnippet: string }}
 */
function detectDocRequirements(description, formFields = []) {
  const kscInText = KSC_PATTERNS.some((p) => p.test(description));
  const kscInForm = formFields.some((f) => KSC_PATTERNS.some((p) => p.test(f.label)));

  const coverInText = COVER_LETTER_PATTERNS.some((p) => p.test(description));
  const coverInForm = formFields.some((f) =>
    COVER_LETTER_PATTERNS.some((p) => p.test(f.label)) && f.type === 'input_file'
  );

  const kscRequired = kscInText || kscInForm;
  const coverLetterRequired = coverInText || coverInForm;

  // Criteria extraction: find the block after a KSC heading
  const criteria = [];
  if (kscRequired) {
    const lines = description.split('\n');
    let inKsc = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (KSC_PATTERNS.some((p) => p.test(trimmed))) {
        inKsc = true;
        continue;
      }
      if (inKsc && criteria.length < 8) {
        // Accept lines that look like criteria items
        if (trimmed.length >= 15 && /[a-z]/i.test(trimmed)) {
          criteria.push(trimmed.replace(/^[\d.)•\-–*\s]+/, '').trim());
        } else if (trimmed.length === 0 && criteria.length > 0) {
          // Two blank lines = end of criteria block
          break;
        }
      }
    }
  }

  // Requirements snippet: first 300 chars of the Requirements/Qualifications section
  let requirementsSnippet = '';
  const reqMatch = description.match(/(?:requirement|qualification|what\s+we.+looking\s+for|you\s+(will|must|should)\s+have)[:\n]([^]{1,400})/i);
  if (reqMatch) {
    requirementsSnippet = reqMatch[2].replace(/\n{2,}/g, '\n').trim().slice(0, 300);
  }

  // Capture accept types for known file fields
  const uploadFields = formFields
    .filter((f) => f.type === 'input_file')
    .map((f) => ({
      label: f.label,
      kind:  COVER_LETTER_PATTERNS.some((p) => p.test(f.label)) ? 'cover_letter'
           : KSC_PATTERNS.some((p) => p.test(f.label))          ? 'ksc'
           : 'resume',
    }));

  return { kscRequired, criteria, coverLetterRequired, requirementsSnippet, uploadFields };
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
  const queueSeen = loadQueueSeenSets(queue);
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

    // Detect document requirements and requirements snippet (zero model cost)
    const docReqs = detectDocRequirements(jdData.description, jdData.formFields);

    const flags = isLoginGated(url) ? ['login-required'] : [];
    if (docReqs.kscRequired)         flags.push('ksc-required');
    if (docReqs.coverLetterRequired) flags.push('cover-letter-required');

    // Build stub
    const stub = {
      id:               roleId,
      company,
      title:            resolvedTitle,
      url,
      ats:              atsInfo.ats,
      source:           discoverySourceFor(atsInfo.ats),
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
      flags,
      ksc_criteria:         docReqs.kscRequired ? docReqs.criteria : null,
      cover_letter_required: docReqs.coverLetterRequired,
      requirements_snippet:  docReqs.requirementsSnippet || null,
      upload_fields:         docReqs.uploadFields.length ? docReqs.uploadFields : null,
      free_text_fields: jdData.formFields,
      drafts:           {},
      cv_pdf:           null,
      cover_letter_path: null,
      ksc_path:          null,
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
    const fieldsNote  = jdData.formFields.length > 0
      ? ` (${jdData.formFields.length} fields)`
      : ' (fields TBD)';
    const docNote = [
      docReqs.kscRequired         ? '📋 KSC'          : '',
      docReqs.coverLetterRequired ? '📄 cover letter' : '',
    ].filter(Boolean).join(', ');
    console.log(`    ✅ ${roleId}${fieldsNote}${docNote ? '  ' + docNote : ''}`);
  }

  if (!DRY_RUN && ingested > 0) {
    saveQueue(queue);
    console.log(`\nSaved ${ingested} new stub(s) to the queue store`);
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
