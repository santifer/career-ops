#!/usr/bin/env node

/**
 * submit-resume.mjs — Zero-browser, zero-LLM resume upload for Greenhouse, Ashby, and Lever.
 *
 * Detects the ATS from the apply URL, POSTs the PDF to the native upload endpoint,
 * and returns the draft token / confirmation. Never auto-submits — the user finalizes.
 *
 * Usage:
 *   node submit-resume.mjs --url <apply_url> --pdf output/<cv>.pdf
 *   node submit-resume.mjs --url <apply_url> --pdf output/<cv>.pdf --dry-run
 *
 * Supported ATS:
 *   Greenhouse  greenhouse.io / boards.greenhouse.io
 *   Ashby       ashbyhq.com / jobs.ashbyhq.com
 *   Lever       jobs.lever.co / lever.co
 */

import { readFileSync, statSync, existsSync } from 'fs';
import { basename } from 'path';

const FETCH_TIMEOUT_MS = 30_000;

const ALLOWED_HOSTS = new Set([
  'boards.greenhouse.io',
  'greenhouse.io',
  'jobs.ashbyhq.com',
  'ashbyhq.com',
  'jobs.lever.co',
  'lever.co',
]);

// ── CLI args ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const DRY_RUN = args.includes('--dry-run');

const applyUrl = get('--url');
const pdfPath  = get('--pdf');

if (!applyUrl || !pdfPath) {
  console.error('Usage: node submit-resume.mjs --url <apply_url> --pdf <pdf_path> [--dry-run]');
  process.exit(1);
}

// Validate PDF: must exist and be a regular file
if (!existsSync(pdfPath)) {
  console.error(`Error: PDF not found at ${pdfPath}`);
  process.exit(1);
}
try {
  const stat = statSync(pdfPath);
  if (!stat.isFile()) {
    console.error(`Error: ${pdfPath} is not a file`);
    process.exit(1);
  }
} catch (err) {
  console.error(`Error: cannot read ${pdfPath}: ${err.message}`);
  process.exit(1);
}

// ── URL validation ──────────────────────────────────────────────────

/** @type {URL} */
let parsedUrl;
try {
  parsedUrl = new URL(applyUrl);
} catch {
  console.error(`Error: invalid URL: ${applyUrl}`);
  process.exit(1);
}

if (parsedUrl.protocol !== 'https:') {
  console.error(`Error: URL must use https (got ${parsedUrl.protocol})`);
  process.exit(1);
}

if (!ALLOWED_HOSTS.has(parsedUrl.hostname)) {
  console.error(`Error: URL hostname "${parsedUrl.hostname}" is not a supported ATS host.`);
  console.error(`Supported hosts: ${[...ALLOWED_HOSTS].join(', ')}`);
  process.exit(1);
}

// ── ATS detection ───────────────────────────────────────────────────

// Safe slug: alphanumeric, hyphens, underscores, dots only
const SAFE_SLUG = /^[a-zA-Z0-9._-]+$/;

/**
 * Detect which ATS the apply URL belongs to.
 * @param {URL} url
 * @returns {{ ats: string, companySlug: string, jobId: string } | null}
 */
function detectAts(url) {
  const path = url.pathname;

  const GH_HOSTS  = new Set(['boards.greenhouse.io', 'greenhouse.io']);
  const ASH_HOSTS = new Set(['jobs.ashbyhq.com', 'ashbyhq.com']);
  const LEV_HOSTS = new Set(['jobs.lever.co', 'lever.co']);

  // Greenhouse: /company/jobs/123
  const gh = path.match(/^\/([^/]+)\/jobs\/(\d+)/);
  if (gh && GH_HOSTS.has(url.hostname)) {
    const [, company, jobId] = gh;
    if (!SAFE_SLUG.test(company)) return null;
    return { ats: 'greenhouse', companySlug: company, jobId };
  }

  // Ashby: /company/uuid-or-slug
  const ash = path.match(/^\/([^/]+)\/([^/]+)/);
  if (ash && ASH_HOSTS.has(url.hostname)) {
    const [, company, jobId] = ash;
    if (!SAFE_SLUG.test(company) || !SAFE_SLUG.test(jobId)) return null;
    return { ats: 'ashby', companySlug: company, jobId };
  }

  // Lever: /company/posting-id (UUID or any non-slash segment)
  const lev = path.match(/^\/([^/]+)\/([^/]+)/);
  if (lev && LEV_HOSTS.has(url.hostname)) {
    const [, company, jobId] = lev;
    if (!SAFE_SLUG.test(company) || !SAFE_SLUG.test(jobId)) return null;
    return { ats: 'lever', companySlug: company, jobId };
  }

  return null;
}

// ── Fetch with timeout ──────────────────────────────────────────────

/**
 * fetch() with an AbortController timeout.
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 */
async function fetchWithTimeout(url, options, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Upload handlers ─────────────────────────────────────────────────

/**
 * Build a multipart/form-data body from fields + a file buffer.
 * Returns { body: Buffer, contentType: string }.
 */
function buildMultipart(fields, fileBuffer, fileField, fileName) {
  const boundary = `----career-ops-${Date.now()}`;
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    );
  }

  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: application/pdf\r\n\r\n`
  );

  const header  = Buffer.from(parts.join(''));
  const footer  = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body    = Buffer.concat([header, fileBuffer, footer]);

  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

/**
 * POST resume to Greenhouse.
 * Endpoint: POST https://boards-api.greenhouse.io/v1/boards/{company}/jobs/{job_id}/applications
 */
async function uploadGreenhouse(companySlug, jobId, pdfBuffer, fileName) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs/${jobId}/applications`;
  const { body, contentType } = buildMultipart(
    { first_name: '', last_name: '', email: '' },
    pdfBuffer,
    'resume',
    fileName
  );

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });

  return { status: res.status, url, body: await res.text().catch(() => '') };
}

/**
 * POST resume to Ashby.
 * Endpoint: POST https://api.ashbyhq.com/applicationForm.submitApplication
 */
async function uploadAshby(companySlug, jobId, pdfBuffer, fileName) {
  const url = 'https://api.ashbyhq.com/applicationForm.submitApplication';
  const { body, contentType } = buildMultipart(
    { jobPostingId: jobId, _orgId: companySlug },
    pdfBuffer,
    'resume',
    fileName
  );

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });

  return { status: res.status, url, body: await res.text().catch(() => '') };
}

/**
 * POST resume to Lever.
 * Endpoint: POST https://api.lever.co/v0/postings/{company}/{posting_id}/apply
 */
async function uploadLever(companySlug, jobId, pdfBuffer, fileName) {
  const url = `https://api.lever.co/v0/postings/${companySlug}/${jobId}/apply`;
  const { body, contentType } = buildMultipart(
    {},
    pdfBuffer,
    'resume',
    fileName
  );

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });

  return { status: res.status, url, body: await res.text().catch(() => '') };
}

// ── Main ─────────────────────────────────────────────────────────────

const detected = detectAts(parsedUrl);

if (!detected) {
  console.error(`Error: URL not recognized as Greenhouse, Ashby, or Lever.\n  URL: ${applyUrl}`);
  console.error('Supported patterns: greenhouse.io, ashbyhq.com, lever.co');
  process.exit(1);
}

const { ats, companySlug, jobId } = detected;
const fileName = basename(pdfPath);

let pdfBuffer;
try {
  pdfBuffer = readFileSync(pdfPath);
} catch (err) {
  console.error(`Error: could not read PDF at ${pdfPath}: ${err.message}`);
  process.exit(1);
}

console.log(`\nATS Resume Upload`);
console.log('─'.repeat(40));
console.log(`ATS:     ${ats}`);
console.log(`Company: ${companySlug}`);
console.log(`Job ID:  ${jobId}`);
console.log(`PDF:     ${fileName} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

if (DRY_RUN) {
  console.log('\n[dry-run] No request sent.');
  process.exit(0);
}

console.log('\nUploading...');

let result;
try {
  if (ats === 'greenhouse') result = await uploadGreenhouse(companySlug, jobId, pdfBuffer, fileName);
  if (ats === 'ashby')      result = await uploadAshby(companySlug, jobId, pdfBuffer, fileName);
  if (ats === 'lever')      result = await uploadLever(companySlug, jobId, pdfBuffer, fileName);
} catch (err) {
  console.error(`\nNetwork error: ${err.message}`);
  process.exit(1);
}

console.log(`\nStatus: ${result.status}`);

if (result.status >= 200 && result.status < 300) {
  console.log('✅ Resume uploaded. Open the apply URL to review and submit:');
  console.log(`   ${applyUrl}`);
  try {
    const parsed = JSON.parse(result.body);
    if (parsed.id || parsed.applicationId || parsed.token) {
      console.log(`   Token: ${parsed.id || parsed.applicationId || parsed.token}`);
    }
  } catch { /* non-JSON response is fine */ }
} else {
  console.error(`❌ Upload failed (HTTP ${result.status}).`);
  if (result.body) console.error(`   Response: ${result.body.slice(0, 300)}`);
  process.exit(1);
}
