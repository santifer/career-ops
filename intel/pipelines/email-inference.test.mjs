import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PATTERNS,
  extractDomain,
  detectEmailPattern,
  generateEmail,
  scoreEmailConfidence,
} from './email-inference.mjs';

describe('extractDomain', () => {
  it('extracts domain from a standard URL', () => {
    assert.equal(extractDomain('https://stripe.com/careers'), 'stripe.com');
  });

  it('strips www prefix', () => {
    assert.equal(extractDomain('https://www.anthropic.com'), 'anthropic.com');
  });

  it('extracts company from job board URL path', () => {
    assert.equal(extractDomain('https://jobs.lever.co/stripe'), 'stripe.com');
  });

  it('guesses domain from company name when URL is null', () => {
    assert.equal(extractDomain(null, 'Stripe'), 'stripe.com');
  });

  it('collapses spaces in company name', () => {
    assert.equal(extractDomain(null, 'Open AI'), 'openai.com');
  });
});

describe('detectEmailPattern', () => {
  it('detects FIRST_DOT_LAST from multiple examples', () => {
    assert.equal(
      detectEmailPattern(['jane.doe@stripe.com', 'john.smith@stripe.com']),
      PATTERNS.FIRST_DOT_LAST,
    );
  });

  it('detects FIRSTLAST from a single example', () => {
    assert.equal(
      detectEmailPattern(['janedoe@acme.com']),
      PATTERNS.FIRSTLAST,
    );
  });

  it('detects FLAST from multiple examples', () => {
    assert.equal(
      detectEmailPattern(['jdoe@acme.com', 'bsmith@acme.com']),
      PATTERNS.FLAST,
    );
  });

  it('detects FIRST from short first-name-only emails', () => {
    assert.equal(
      detectEmailPattern(['jane@startup.io', 'bob@startup.io']),
      PATTERNS.FIRST,
    );
  });

  it('returns null for empty array', () => {
    assert.equal(detectEmailPattern([]), null);
  });

  it('returns null for unrecognizable patterns', () => {
    assert.equal(detectEmailPattern(['random123@acme.com']), null);
  });
});

describe('generateEmail', () => {
  it('generates FIRST_DOT_LAST email', () => {
    assert.equal(
      generateEmail('Jane', 'Doe', 'stripe.com', PATTERNS.FIRST_DOT_LAST),
      'jane.doe@stripe.com',
    );
  });

  it('generates FLAST email', () => {
    assert.equal(
      generateEmail('Jane', 'Doe', 'stripe.com', PATTERNS.FLAST),
      'jdoe@stripe.com',
    );
  });

  it('generates FIRST email', () => {
    assert.equal(
      generateEmail('Jane', 'Doe', 'startup.io', PATTERNS.FIRST),
      'jane@startup.io',
    );
  });

  it('generates FIRSTLAST email', () => {
    assert.equal(
      generateEmail('Jane', 'Doe', 'acme.com', PATTERNS.FIRSTLAST),
      'janedoe@acme.com',
    );
  });

  it('handles hyphenated last names', () => {
    assert.equal(
      generateEmail('Jane', 'Doe-Smith', 'stripe.com', PATTERNS.FIRST_DOT_LAST),
      'jane.doe-smith@stripe.com',
    );
  });
});

describe('scoreEmailConfidence', () => {
  it('returns HIGH for team_page + unique + confirmed', () => {
    assert.equal(
      scoreEmailConfidence({
        patternSource: 'team_page',
        nameCommonality: 'unique',
        patternConfirmed: true,
      }),
      'HIGH',
    );
  });

  it('returns MEDIUM for inferred + common + confirmed', () => {
    assert.equal(
      scoreEmailConfidence({
        patternSource: 'inferred',
        nameCommonality: 'common',
        patternConfirmed: true,
      }),
      'MEDIUM',
    );
  });

  it('returns LOW for guess + common + unconfirmed', () => {
    assert.equal(
      scoreEmailConfidence({
        patternSource: 'guess',
        nameCommonality: 'common',
        patternConfirmed: false,
      }),
      'LOW',
    );
  });
});
