import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTitleFilter, detectApi } from '../../scan.mjs';

test('buildTitleFilter passes positive keywords', () => {
  const filter = buildTitleFilter({
    positive: ['solutions architect', 'forward deployed'],
    negative: ['junior', 'intern'],
  });
  assert.ok(filter('Solutions Architect, AI'), 'SA should pass');
  assert.ok(filter('Forward Deployed Engineer'), 'FDE should pass');
});

test('buildTitleFilter blocks negative keywords', () => {
  const filter = buildTitleFilter({
    positive: ['engineer'],
    negative: ['junior', 'intern', 'iii'],
  });
  assert.ok(!filter('Junior Software Engineer'), 'junior should be blocked');
  assert.ok(!filter('Software Engineer III'), 'III should be blocked');
  assert.ok(filter('Software Engineer'), 'plain engineer should pass');
});

test('buildTitleFilter with empty positive accepts everything (minus negatives)', () => {
  const filter = buildTitleFilter({ positive: [], negative: ['intern'] });
  assert.ok(filter('Anything Goes'), 'no positives means accept-all');
  assert.ok(!filter('Summer Intern'), 'negatives still apply');
});

test('detectApi recognizes Greenhouse', () => {
  const res = detectApi({ api: 'https://boards-api.greenhouse.io/v1/boards/stripe/jobs' });
  assert.equal(res?.type, 'greenhouse');
});

test('detectApi recognizes Ashby from careers_url', () => {
  const res = detectApi({ careers_url: 'https://jobs.ashbyhq.com/anthropic/' });
  assert.equal(res?.type, 'ashby');
  assert.match(res.url, /api\.ashbyhq\.com/);
});

test('detectApi recognizes Lever from careers_url', () => {
  const res = detectApi({ careers_url: 'https://jobs.lever.co/coinbase/' });
  assert.equal(res?.type, 'lever');
});
