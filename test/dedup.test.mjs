import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dedup, dedupKey } from '../scripts/dedup.mjs';

function makeJob(overrides = {}) {
  return {
    source:      'greenhouse',
    external_id: 'ID-1',
    title:       'Senior Scrum Master',
    company:     'Acme',
    location:    'Dallas, TX',
    url:         'https://example.com/job/1',
    posted_at:   '2026-06-04T08:00:00.000Z',
    ingested_at: '2026-06-04T09:00:00.000Z',
    state:       'new',
    remote:      false,
    has_connection: false,
    verified:    false,
    ...overrides,
  };
}

describe('dedupKey', () => {
  test('lowercases company, title, location', () => {
    const key = dedupKey(makeJob({ company: 'ACME', title: 'Senior Scrum Master', location: 'Dallas, TX' }));
    assert.equal(key, 'acme|senior scrum master|dallas, tx');
  });

  test('uses "remote" when location is empty and remote=true', () => {
    const key = dedupKey(makeJob({ location: '', remote: true }));
    assert.ok(key.endsWith('|remote'));
  });

  test('uses "unknown" when location is empty and remote=false', () => {
    const key = dedupKey(makeJob({ location: '', remote: false }));
    assert.ok(key.endsWith('|unknown'));
  });
});

describe('dedup', () => {
  test('unique jobs all kept', () => {
    const jobs = [
      makeJob({ external_id: 'A', company: 'Alpha', title: 'PM' }),
      makeJob({ external_id: 'B', company: 'Beta',  title: 'PM' }),
    ];
    const { kept, discarded } = dedup(jobs);
    assert.equal(kept.length, 2);
    assert.equal(discarded.length, 0);
  });

  test('duplicate: keeps newer posted_at', () => {
    const older = makeJob({ source: 'indeed', external_id: 'OLD', posted_at: '2026-06-01T00:00:00.000Z' });
    const newer = makeJob({ source: 'indeed', external_id: 'NEW', posted_at: '2026-06-04T00:00:00.000Z' });
    const { kept, discarded } = dedup([older, newer]);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].external_id, 'NEW');
    assert.equal(discarded[0].external_id, 'OLD');
  });

  test('same date: source priority (greenhouse > indeed > dice)', () => {
    const ts = '2026-06-04T08:00:00.000Z';
    const gh   = makeJob({ source: 'greenhouse', external_id: 'GH',  posted_at: ts });
    const ind  = makeJob({ source: 'indeed',     external_id: 'IND', posted_at: ts });
    const dice = makeJob({ source: 'dice',        external_id: 'DI',  posted_at: ts });

    // indeed vs dice — indeed wins
    const { kept: k1, discarded: d1 } = dedup([dice, ind]);
    assert.equal(k1[0].source, 'indeed');
    assert.equal(d1[0].source, 'dice');

    // greenhouse vs indeed — greenhouse wins
    const { kept: k2, discarded: d2 } = dedup([ind, gh]);
    assert.equal(k2[0].source, 'greenhouse');
    assert.equal(d2[0].source, 'indeed');
  });

  test('same date, same source: first seen wins', () => {
    const ts = '2026-06-04T08:00:00.000Z';
    const a = makeJob({ source: 'indeed', external_id: 'A', posted_at: ts });
    const b = makeJob({ source: 'indeed', external_id: 'B', posted_at: ts });
    const { kept } = dedup([a, b]);
    assert.equal(kept[0].external_id, 'A');
  });

  test('case-insensitive dedup key (company + title)', () => {
    const a = makeJob({ company: 'ACME', title: 'Senior Scrum Master', posted_at: '2026-06-01T00:00:00.000Z' });
    const b = makeJob({ company: 'acme', title: 'senior scrum master', posted_at: '2026-06-04T00:00:00.000Z' });
    const { kept, discarded } = dedup([a, b]);
    assert.equal(kept.length, 1);
    assert.equal(discarded.length, 1);
    // newer wins
    assert.equal(kept[0].posted_at, '2026-06-04T00:00:00.000Z');
  });

  test('empty array returns empty kept/discarded', () => {
    const { kept, discarded } = dedup([]);
    assert.equal(kept.length, 0);
    assert.equal(discarded.length, 0);
  });

  test('fixture: Inclusion Cloud Scrum Master (indeed vs dice same company+title+location)', () => {
    // Indeed JOBSEARCH_1001 and Dice DICE-2005 are the same job
    const ind  = makeJob({ source: 'indeed', external_id: 'JOBSEARCH_1001', company: 'Inclusion Cloud', title: 'Senior Scrum Master', location: 'Dallas, TX', posted_at: '2026-06-04T08:00:00.000Z' });
    const dice = makeJob({ source: 'dice',   external_id: 'DICE-2005',      company: 'Inclusion Cloud', title: 'Senior Scrum Master', location: 'Dallas, TX', posted_at: '2026-06-04T08:00:00.000Z' });
    const { kept, discarded } = dedup([ind, dice]);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].source, 'indeed'); // indeed > dice in source priority
    assert.equal(discarded[0].source, 'dice');
  });
});
