/**
 * adapter-greenhouse.mjs — Maps pulse-jobs-proxy Worker /greenhouse response to PulseJob[]
 *
 * Input: the JSON object returned by the live Worker:
 *   { source: "greenhouse", company: "stripe", count: N, jobs: [...PulseJob] }
 *
 * Since the Worker already normalizes to PulseJob shape, this adapter is a
 * thin pass-through with validation and ingested_at stamping.
 *
 * Usage:
 *   import { parseGreenhouseWorkerResponse } from './adapter-greenhouse.mjs';
 *   const jobs = parseGreenhouseWorkerResponse(workerJson, 'stripe');
 */

/**
 * Validate and stamp a PulseJob coming from the Worker.
 * @param {object} job - Raw job from Worker response
 * @param {string} company - Company slug (fallback if job.company is blank)
 * @param {string} now - ISO ingestion timestamp
 * @returns {object|null}
 */
function validateJob(job, company, now) {
  if (!job || !job.external_id || !job.title || !job.url) return null;
  return {
    source:           'greenhouse',
    external_id:      String(job.external_id),
    title:            String(job.title),
    company:          job.company || company,
    location:         job.location || 'Remote',
    url:              String(job.url),
    posted_at:        job.posted_at || now,
    ingested_at:      now,
    state:            'new',
    salary_min:       job.salary_min ?? null,
    salary_max:       job.salary_max ?? null,
    employment_type:  job.employment_type ?? null,
    remote:           job.remote ?? /\bremote\b/i.test(job.location || ''),
    summary:          job.summary ?? null,
    company_logo_url: job.company_logo_url ?? null,
    easy_apply:       job.easy_apply ?? null,
    score:            job.score ?? null,
    has_connection:   false,
    verified:         true, // Worker fetched from Greenhouse API = verified live
  };
}

/**
 * Parse the Worker /greenhouse/:company JSON response into PulseJob[].
 * @param {object} workerResponse
 * @param {string} [companySlug]
 * @param {string} [ingestedAt]
 * @returns {object[]}
 */
export function parseGreenhouseWorkerResponse(workerResponse, companySlug = '', ingestedAt) {
  const now = ingestedAt || new Date().toISOString();
  if (!workerResponse || workerResponse.error) return [];
  const jobs = workerResponse.jobs || [];
  return jobs
    .map(j => validateJob(j, workerResponse.company || companySlug, now))
    .filter(Boolean);
}

/**
 * Fetch from the live Worker and parse to PulseJob[].
 * Only used when running ingest-runner in live mode (not fixture mode).
 * @param {string} workerBase - e.g. "https://pulse-jobs-proxy.rahilnathanipulse.workers.dev"
 * @param {string} company
 * @param {string} [ingestedAt]
 */
export async function fetchGreenhouse(workerBase, company, ingestedAt) {
  const url = `${workerBase}/greenhouse/${company}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Worker /greenhouse/${company} returned ${res.status}`);
  const data = await res.json();
  return parseGreenhouseWorkerResponse(data, company, ingestedAt);
}
