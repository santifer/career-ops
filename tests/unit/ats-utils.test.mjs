import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessCompany, normalizeCompany } from '../../lib/ats-utils.mjs';

test('normalizeCompany strips suffixes and punctuation', () => {
  assert.equal(normalizeCompany('OpenAI, Inc.'), 'openai');
  assert.equal(normalizeCompany('Open AI'), 'openai');
  assert.equal(normalizeCompany('open-ai'), 'openai');
  assert.equal(normalizeCompany('Stripe LLC'), 'stripe');
  assert.equal(normalizeCompany('Acme Corp'), 'acme');
});

test('normalizeCompany handles falsy input', () => {
  assert.equal(normalizeCompany(''), '');
  assert.equal(normalizeCompany(null), '');
  assert.equal(normalizeCompany(undefined), '');
});

test('guessCompany extracts Greenhouse slug', () => {
  assert.equal(guessCompany('https://boards.greenhouse.io/stripe/jobs/4567'), 'stripe');
  assert.equal(guessCompany('https://boards.greenhouse.io/open-ai/jobs/123'), 'open ai');
});

test('guessCompany extracts Ashby slug', () => {
  assert.equal(guessCompany('https://jobs.ashbyhq.com/anthropic/abc-123'), 'anthropic');
});

test('guessCompany extracts Lever slug', () => {
  assert.equal(guessCompany('https://jobs.lever.co/coinbase/some-role'), 'coinbase');
});

test('guessCompany handles Amazon and Workday', () => {
  assert.equal(guessCompany('https://amazon.jobs/en/jobs/12345'), 'amazon');
  assert.equal(guessCompany('https://nvidia.wd5.myworkdayjobs.com/External/job/X'), 'nvidia');
});

test('guessCompany falls back to hostname brand', () => {
  assert.equal(guessCompany('https://careers.stripe.com/job/123'), 'careers.stripe');
});

test('guessCompany handles invalid URLs', () => {
  assert.equal(guessCompany('not-a-url'), 'unknown');
  assert.equal(guessCompany(''), 'unknown');
});
