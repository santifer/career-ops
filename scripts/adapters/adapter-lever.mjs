/**
 * adapter-lever.mjs — Maps pulse-jobs-proxy Worker /lever response to PulseJob[]
 *
 * Input: the JSON object returned by the live Worker:
 *   { source: "lever", company: "figma", count: N, jobs: [...PulseJob] }
 *
 * Same thin pass-through pattern as adapter-greenhouse.mjs.
 *
 * Usage:
 *   import { parseLeverWorkerResponse } from './adapter-lever.mjs';
 *   const jobs = parseLeverWorkerResponse(workerJson, 'figma');
 */

/**
 * Validate and stamp a PulseJob from the Lever Worker response.
 */
function validateJob(job, company, now) {
  if (!job || !job.external_id || !job.title || !job.url) return null;
  return {
    source:           'lever',
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
    summary:          job.summary ? (job.summary.length > 499 ? job.summary.slice(0, 499) + '…' : job.summary) : null,
    company_logo_url: job.company_logo_url ?? null,
    easy_apply:       job.easy_apply ?? null,
    score:            job.score ?? null,
    has_connection:   false,
    verified:         true, // Worker fetched from Lever API = verified live
  };
}

/**
 * Parse the Worker /lever/:company JSON response into PulseJob[].
 */
export function parseLeverWorkerResponse(workerResponse, companySlug = '', ingestedAt) {
  const now = ingestedAt || new Date().toISOString();
  if (!workerResponse || workerResponse.error) return [];
  const jobs = workerResponse.jobs || [];
  return jobs
    .map(j => validateJob(j, workerResponse.company || companySlug, now))
    .filter(Boolean);
}

/**
 * Fetch from the live Worker and parse to PulseJob[].
 */
export async function fetchLever(workerBase, company, ingestedAt) {
  const url = `${workerBase}/lever/${company}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Worker /lever/${company} returned ${res.status}`);
  const data = await res.json();
  return parseLeverWorkerResponse(data, company, ingestedAt);
}
