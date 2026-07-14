#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseLinkedInSearchResults } from './providers/linkedin.mjs';
import { parseJobindexSearchPage } from './providers/jobindex.mjs';
import { parseJobbankFeed } from './providers/jobbank.mjs';
import { parseJobnetSearchResponse } from './providers/jobnet.mjs';
import { parseJobdanmarkSearchResponse } from './providers/jobdanmark.mjs';

const read = (name) => readFileSync(new URL(`./tests/fixtures/ai-job-search/${name}`, import.meta.url), 'utf8');

{
  const jobs = parseLinkedInSearchResults(read('linkedin-search.html'));
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Senior AI Engineer');
  assert.equal(jobs[0].company, 'Acme AI');
  assert.equal(jobs[0].location, 'Copenhagen, Capital Region, Denmark');
  assert.equal(jobs[0].url, 'https://www.linkedin.com/jobs/view/senior-ai-engineer-4426311357');
  assert.equal(jobs[0].postedAt, Date.parse('2026-07-07'));
}

{
  const jobs = parseJobindexSearchPage(read('jobindex-stash.html'));
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Data Engineer');
  assert.equal(jobs[0].company, 'Nordic Data');
  assert.equal(jobs[0].location, 'København');
  assert.equal(jobs[0].url, 'https://www.jobindex.dk/jobannonce/h1647303');
}

{
  const jobs = parseJobbankFeed(read('jobbank.xml'));
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Machine Learning Specialist');
  assert.equal(jobs[0].company, 'DTU');
  assert.equal(jobs[0].location, 'Kongens Lyngby');
  assert.equal(jobs[0].url, 'https://jobbank.dk/job/123456/dtu/ml-specialist');
}

{
  const jobs = parseJobnetSearchResponse(JSON.parse(read('jobnet.json')));
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'AI Consultant');
  assert.equal(jobs[0].company, 'Kommune Tech');
  assert.equal(jobs[0].location, 'Aarhus, Danmark');
  assert.equal(jobs[0].url, 'https://job.jobnet.dk/CV/FindWork/Details/abc-123');
}

{
  const jobs = parseJobdanmarkSearchResponse(JSON.parse(read('jobdanmark.json')));
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Full Stack Developer');
  assert.equal(jobs[0].company, 'Startup DK');
  assert.equal(jobs[0].location, 'Odense');
  assert.equal(jobs[0].url, 'https://jobdanmark.dk/job/full-stack-developer');
}

console.log('ai-job-search provider tests OK');
