#!/usr/bin/env node

/**
 * apply-ats.mjs — Submit job applications via ATS public APIs
 *
 * Supports: Greenhouse, Lever, Ashby
 * These are the same public APIs their "Apply" buttons use.
 *
 * Usage:
 *   node apply-ats.mjs --url <job-url> --resume <path.pdf> [--cover-letter <text>]
 *   node apply-ats.mjs --batch <applications.json>
 *   node apply-ats.mjs --dry-run --url <job-url>   # preview without submitting
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { basename } from 'path';
import yaml from 'js-yaml';

// ── Load candidate profile ─────────────────────────────────────
function loadProfile() {
  const profilePath = 'config/profile.yml';
  if (!existsSync(profilePath)) {
    throw new Error('config/profile.yml not found. Run onboarding first.');
  }
  return yaml.load(readFileSync(profilePath, 'utf-8'));
}

// ── Detect ATS type from URL ────────────────────────────────────
function detectATS(url) {
  if (url.includes('greenhouse.io')) {
    const match = url.match(/greenhouse\.io\/([^/]+)\/jobs\/(\d+)/);
    if (match) return { type: 'greenhouse', board: match[1], jobId: match[2] };
  }
  if (url.includes('lever.co')) {
    const match = url.match(/jobs\.lever\.co\/([^/]+)\/([a-f0-9-]+)/);
    if (match) return { type: 'lever', company: match[1], postingId: match[2] };
  }
  if (url.includes('ashbyhq.com')) {
    const match = url.match(/jobs\.ashbyhq\.com\/([^/]+)\/([a-f0-9-]+)/);
    if (match) return { type: 'ashby', org: match[1], jobId: match[2] };
  }
  return null;
}

// ── Greenhouse Application API ──────────────────────────────────
// Docs: https://developers.greenhouse.io/job-board.html#submit-application
async function applyGreenhouse({ board, jobId, profile, resumePath, coverLetter, dryRun }) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${jobId}`;

  // First, get the job to find application fields
  const jobRes = await fetch(url);
  if (!jobRes.ok) throw new Error(`Greenhouse job fetch failed: HTTP ${jobRes.status}`);
  const jobData = await jobRes.json();

  const nameParts = profile.candidate.full_name.split(' ');
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');

  // Build multipart form data
  const formData = new FormData();
  formData.append('first_name', firstName);
  formData.append('last_name', lastName);
  formData.append('email', profile.candidate.email);
  if (profile.candidate.phone) formData.append('phone', profile.candidate.phone);

  // Resume upload
  if (resumePath && existsSync(resumePath)) {
    const resumeBlob = new Blob([readFileSync(resumePath)], { type: 'application/pdf' });
    formData.append('resume', resumeBlob, basename(resumePath));
  }

  // Cover letter
  if (coverLetter) {
    formData.append('cover_letter', coverLetter);
  }

  if (dryRun) {
    return {
      status: 'dry-run',
      ats: 'greenhouse',
      endpoint: url,
      fields: { firstName, lastName, email: profile.candidate.email, resume: resumePath ? 'attached' : 'none' },
      jobTitle: jobData.title || 'Unknown',
    };
  }

  // Submit application
  const submitRes = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (submitRes.ok || submitRes.status === 201) {
    return { status: 'applied', ats: 'greenhouse', jobTitle: jobData.title };
  } else {
    const errText = await submitRes.text();
    return { status: 'failed', ats: 'greenhouse', error: `HTTP ${submitRes.status}: ${errText}`, jobTitle: jobData.title };
  }
}

// ── Lever Application API ───────────────────────────────────────
// Docs: https://github.com/lever/postings-api/blob/master/README.md
async function applyLever({ company, postingId, profile, resumePath, coverLetter, dryRun }) {
  const url = `https://api.lever.co/v0/postings/${company}/${postingId}/apply`;

  const formData = new FormData();
  formData.append('name', profile.candidate.full_name);
  formData.append('email', profile.candidate.email);
  if (profile.candidate.phone) formData.append('phone', profile.candidate.phone);

  // LinkedIn
  if (profile.candidate.linkedin) {
    formData.append('urls[LinkedIn]', `https://${profile.candidate.linkedin}`);
  }

  // Resume
  if (resumePath && existsSync(resumePath)) {
    const resumeBlob = new Blob([readFileSync(resumePath)], { type: 'application/pdf' });
    formData.append('resume', resumeBlob, basename(resumePath));
  }

  // Cover letter / comments
  if (coverLetter) {
    formData.append('comments', coverLetter);
  }

  if (dryRun) {
    return {
      status: 'dry-run',
      ats: 'lever',
      endpoint: url,
      fields: { name: profile.candidate.full_name, email: profile.candidate.email, resume: resumePath ? 'attached' : 'none' },
    };
  }

  const submitRes = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (submitRes.ok) {
    const result = await submitRes.json();
    return { status: 'applied', ats: 'lever', applicationId: result.applicationId };
  } else {
    const errText = await submitRes.text();
    return { status: 'failed', ats: 'lever', error: `HTTP ${submitRes.status}: ${errText}` };
  }
}

// ── Ashby Application API ───────────────────────────────────────
// Docs: https://developers.ashbyhq.com/reference/applicationformsubmit
async function applyAshby({ org, jobId, profile, resumePath, coverLetter, dryRun }) {
  // Step 1: Get the application form definition
  const formRes = await fetch('https://api.ashbyhq.com/posting-api/job-board/' + org, {
    method: 'GET',
  });

  const nameParts = profile.candidate.full_name.split(' ');
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');

  // Step 2: Submit via multipart
  const formData = new FormData();
  formData.append('jobPostingId', jobId);
  formData.append('firstName', firstName);
  formData.append('lastName', lastName);
  formData.append('email', profile.candidate.email);
  if (profile.candidate.phone) formData.append('phone', profile.candidate.phone);
  if (profile.candidate.linkedin) {
    formData.append('linkedInUrl', `https://${profile.candidate.linkedin}`);
  }

  // Resume
  if (resumePath && existsSync(resumePath)) {
    const resumeBlob = new Blob([readFileSync(resumePath)], { type: 'application/pdf' });
    formData.append('resume', resumeBlob, basename(resumePath));
  }

  if (dryRun) {
    return {
      status: 'dry-run',
      ats: 'ashby',
      endpoint: `https://api.ashbyhq.com/posting-api/job-board/${org}/application`,
      fields: { firstName, lastName, email: profile.candidate.email, resume: resumePath ? 'attached' : 'none' },
    };
  }

  const submitRes = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${org}/application`, {
    method: 'POST',
    body: formData,
  });

  if (submitRes.ok) {
    const result = await submitRes.json();
    return { status: 'applied', ats: 'ashby', applicationId: result.id || result.applicationId };
  } else {
    const errText = await submitRes.text();
    return { status: 'failed', ats: 'ashby', error: `HTTP ${submitRes.status}: ${errText}` };
  }
}

// ── Main dispatcher ─────────────────────────────────────────────
export async function submitApplication({ url, resumePath, coverLetter, dryRun = false }) {
  const profile = loadProfile();
  const ats = detectATS(url);

  if (!ats) {
    return {
      status: 'unsupported',
      error: `Cannot detect ATS from URL: ${url}. Manual application required.`,
      url,
    };
  }

  const opts = { ...ats, profile, resumePath, coverLetter, dryRun };

  switch (ats.type) {
    case 'greenhouse': return applyGreenhouse(opts);
    case 'lever': return applyLever(opts);
    case 'ashby': return applyAshby(opts);
    default:
      return { status: 'unsupported', error: `Unknown ATS type: ${ats.type}` };
  }
}

// ── Batch mode ──────────────────────────────────────────────────
export async function submitBatch(applications, dryRun = false) {
  const results = [];
  for (const app of applications) {
    try {
      const result = await submitApplication({
        url: app.url,
        resumePath: app.resumePath,
        coverLetter: app.coverLetter,
        dryRun,
      });
      results.push({ ...result, company: app.company, role: app.role, url: app.url });
    } catch (err) {
      results.push({
        status: 'error',
        company: app.company,
        role: app.role,
        url: app.url,
        error: err.message,
      });
    }
    // Small delay between submissions to be respectful
    if (!dryRun) await new Promise(r => setTimeout(r, 2000));
  }
  return results;
}

// ── CLI mode ────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('apply-ats.mjs')) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const urlIdx = args.indexOf('--url');
  const resumeIdx = args.indexOf('--resume');
  const batchIdx = args.indexOf('--batch');

  if (batchIdx !== -1) {
    const batchFile = args[batchIdx + 1];
    const applications = JSON.parse(readFileSync(batchFile, 'utf-8'));
    submitBatch(applications, dryRun).then(results => {
      console.log(JSON.stringify(results, null, 2));
    });
  } else if (urlIdx !== -1) {
    const url = args[urlIdx + 1];
    const resumePath = resumeIdx !== -1 ? args[resumeIdx + 1] : null;
    submitApplication({ url, resumePath, dryRun }).then(result => {
      console.log(JSON.stringify(result, null, 2));
    });
  } else {
    console.log('Usage: node apply-ats.mjs --url <job-url> [--resume <path>] [--dry-run]');
    console.log('       node apply-ats.mjs --batch <applications.json> [--dry-run]');
  }
}
