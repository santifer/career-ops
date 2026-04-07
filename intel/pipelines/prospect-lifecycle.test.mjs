import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseProspects,
  expireProspects,
  compactProspects,
  serializeProspects,
} from './prospect-lifecycle.mjs';

const SAMPLE_MD = `# Prospects

## New

| # | Found | Company | Role | Why | Angle | Source | URL |
|---|-------|---------|------|-----|-------|--------|-----|
| 1 | 2026-03-01 | Acme Corp | ML Engineer | Strong fit | AI focus | LinkedIn | https://acme.com/jobs/1 |
| 2 | 2026-03-15 | Beta Inc | Data Scientist | Good match | Analytics | Indeed | https://beta.com/jobs/2 |

## Reviewed

| # | Found | Company | Role | Why | Angle | Source | URL |
|---|-------|---------|------|-----|-------|--------|-----|
| 3 | 2026-02-10 | Gamma Ltd | AI Lead | Great fit | Leadership | Referral | https://gamma.com/jobs/3 |

## Dismissed

| # | Found | Company | Role | Why | Angle | Source | URL |
|---|-------|---------|------|-----|-------|--------|-----|

## Expired

| # | Found | Company | Role | Why | Angle | Source | URL |
|---|-------|---------|------|-----|-------|--------|-----|
| 4 | 2025-12-01 | Old Co | Dev | Stale | None | Web | https://old.com/jobs/4 |
`;

describe('parseProspects', () => {
  it('parses markdown with New/Reviewed/Dismissed/Expired sections', () => {
    const sections = parseProspects(SAMPLE_MD);

    assert.equal(sections.New.length, 2);
    assert.equal(sections.Reviewed.length, 1);
    assert.equal(sections.Dismissed.length, 0);
    assert.equal(sections.Expired.length, 1);
  });

  it('extracts table rows into objects with correct fields', () => {
    const sections = parseProspects(SAMPLE_MD);
    const first = sections.New[0];

    assert.equal(first.num, '1');
    assert.equal(first.found, '2026-03-01');
    assert.equal(first.company, 'Acme Corp');
    assert.equal(first.role, 'ML Engineer');
    assert.equal(first.why, 'Strong fit');
    assert.equal(first.angle, 'AI focus');
    assert.equal(first.source, 'LinkedIn');
    assert.equal(first.url, 'https://acme.com/jobs/1');
  });

  it('handles empty/null input', () => {
    const sections = parseProspects('');
    assert.equal(sections.New.length, 0);
    assert.equal(sections.Reviewed.length, 0);

    const sections2 = parseProspects(null);
    assert.equal(sections2.New.length, 0);
  });
});

describe('expireProspects', () => {
  it('moves prospects older than 30 days from New to Expired', () => {
    const sections = parseProspects(SAMPLE_MD);
    // Set "now" to 2026-04-06, so 2026-03-01 is 36 days old (expired), 2026-03-15 is 22 days (keep)
    const now = new Date('2026-04-06');
    expireProspects(sections, 30, now);

    assert.equal(sections.New.length, 1);
    assert.equal(sections.New[0].company, 'Beta Inc');
    // Old expired + newly expired
    assert.equal(sections.Expired.length, 2);
    assert.equal(sections.Expired[1].company, 'Acme Corp');
  });

  it('keeps prospects within cutoff in New', () => {
    const sections = parseProspects(SAMPLE_MD);
    const now = new Date('2026-03-20');
    expireProspects(sections, 30, now);

    // Both are within 30 days of 2026-03-20
    assert.equal(sections.New.length, 2);
  });
});

describe('compactProspects', () => {
  it('removes expired entries older than 90 days', () => {
    const sections = parseProspects(SAMPLE_MD);
    // 2025-12-01 is ~126 days before 2026-04-06, should be removed
    const now = new Date('2026-04-06');
    compactProspects(sections, 90, now);

    assert.equal(sections.Expired.length, 0);
  });

  it('keeps expired entries within retention period', () => {
    const sections = parseProspects(SAMPLE_MD);
    // 2025-12-01 is ~36 days before 2026-01-06, should be kept with 90 day retention
    const now = new Date('2026-01-06');
    compactProspects(sections, 90, now);

    assert.equal(sections.Expired.length, 1);
  });
});

describe('serializeProspects', () => {
  it('round-trips through parse and serialize', () => {
    const sections = parseProspects(SAMPLE_MD);
    const output = serializeProspects(sections);
    const reparsed = parseProspects(output);

    assert.equal(reparsed.New.length, 2);
    assert.equal(reparsed.Reviewed.length, 1);
    assert.equal(reparsed.Dismissed.length, 0);
    assert.equal(reparsed.Expired.length, 1);

    // Verify data integrity
    assert.deepEqual(reparsed.New[0], sections.New[0]);
    assert.deepEqual(reparsed.Reviewed[0], sections.Reviewed[0]);
    assert.deepEqual(reparsed.Expired[0], sections.Expired[0]);
  });
});
