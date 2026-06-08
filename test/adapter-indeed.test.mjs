import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseIndeedMD } from '../scripts/adapters/adapter-indeed.mjs';

describe('adapter-indeed', () => {

  test('parses a full valid job block', () => {
    const md = `
**Job Title:** Senior Scrum Master
**Job Id:** JOBSEARCH_1001
**Company:** Acme Corp
**Location:** Dallas, TX
**Posted on:** June 04, 2026
**Job Type:** Full-time
**Compensation:** $120,000 - $150,000 a year
**View Job URL:** https://to.indeed.com/abc123
`.trim();

    const jobs = parseIndeedMD(md);
    assert.equal(jobs.length, 1);
    const j = jobs[0];
    assert.equal(j.source, 'indeed');
    assert.equal(j.external_id, 'JOBSEARCH_1001');
    assert.equal(j.title, 'Senior Scrum Master');
    assert.equal(j.company, 'Acme Corp');
    assert.equal(j.location, 'Dallas, TX');
    assert.equal(j.url, 'https://to.indeed.com/abc123');
    assert.equal(j.employment_type, 'Full-time');
    assert.equal(j.salary_min, 120000);
    assert.equal(j.salary_max, 150000);
    assert.equal(j.state, 'new');
    assert.equal(j.has_connection, false);
    assert.equal(j.verified, false);
    assert.equal(j.remote, false);
  });

  test('salary: N/A → null/null', () => {
    const md = `
**Job Title:** PM
**Job Id:** JOB001
**Company:** Co
**Location:** Dallas, TX
**Posted on:** June 01, 2026
**Job Type:** N/A
**Compensation:** N/A
**View Job URL:** https://to.indeed.com/x1
`.trim();
    const [j] = parseIndeedMD(md);
    assert.equal(j.salary_min, null);
    assert.equal(j.salary_max, null);
    assert.equal(j.employment_type, null);
  });

  test('salary: single value', () => {
    const md = `
**Job Title:** PM
**Job Id:** JOB002
**Company:** Co
**Location:** Remote
**Posted on:** June 02, 2026
**Job Type:** Full-time
**Compensation:** $130,000 a year
**View Job URL:** https://to.indeed.com/x2
`.trim();
    const [j] = parseIndeedMD(md);
    assert.equal(j.salary_min, 130000);
    assert.equal(j.salary_max, null);
  });

  test('salary: decimal range ($74,081.75 - $109,476.32)', () => {
    const md = `
**Job Title:** PM
**Job Id:** JOB003
**Company:** Co
**Location:** Irving, TX
**Posted on:** June 03, 2026
**Job Type:** Contract
**Compensation:** $74,081.75 - $109,476.32 a year
**View Job URL:** https://to.indeed.com/x3
`.trim();
    const [j] = parseIndeedMD(md);
    assert.equal(j.salary_min, 74081.75);
    assert.equal(j.salary_max, 109476.32);
  });

  test('location: Remote → remote=true', () => {
    const md = `
**Job Title:** Agile Coach
**Job Id:** JOB004
**Company:** Co
**Location:** Remote
**Posted on:** June 04, 2026
**Job Type:** Full-time
**Compensation:** N/A
**View Job URL:** https://to.indeed.com/x4
`.trim();
    const [j] = parseIndeedMD(md);
    assert.equal(j.remote, true);
    assert.equal(j.location, 'Remote');
  });

  test('date: "February 27, 2026" parses correctly', () => {
    const md = `
**Job Title:** PM
**Job Id:** JOB005
**Company:** Co
**Location:** Dallas, TX
**Posted on:** February 27, 2026
**Job Type:** Full-time
**Compensation:** N/A
**View Job URL:** https://to.indeed.com/x5
`.trim();
    const [j] = parseIndeedMD(md);
    assert.ok(j.posted_at.startsWith('2026-02-27'));
  });

  test('parses multiple job blocks', () => {
    const md = `
**Job Title:** Job One
**Job Id:** JOB_A
**Company:** Company A
**Location:** Dallas, TX
**Posted on:** June 01, 2026
**Job Type:** Full-time
**Compensation:** N/A
**View Job URL:** https://to.indeed.com/a1

**Job Title:** Job Two
**Job Id:** JOB_B
**Company:** Company B
**Location:** Remote
**Posted on:** June 02, 2026
**Job Type:** Contract
**Compensation:** $100,000 - $120,000 a year
**View Job URL:** https://to.indeed.com/b2
`.trim();
    const jobs = parseIndeedMD(md);
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0].external_id, 'JOB_A');
    assert.equal(jobs[1].external_id, 'JOB_B');
  });

  test('skips block missing required fields', () => {
    const md = `
**Job Title:** Incomplete Job
**Company:** Co
**Location:** Dallas, TX
**Posted on:** June 01, 2026
**Job Type:** Full-time
**Compensation:** N/A
`.trim();
    // Missing Job Id AND View Job URL
    const jobs = parseIndeedMD(md);
    assert.equal(jobs.length, 0);
  });

  test('empty input returns empty array', () => {
    assert.deepEqual(parseIndeedMD(''), []);
    assert.deepEqual(parseIndeedMD(null), []);
    assert.deepEqual(parseIndeedMD(undefined), []);
  });

});
