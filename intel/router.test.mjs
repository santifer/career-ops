import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUERY_TYPES,
  classifyQuery,
  getRoutingChain,
  getAvailableAPIs,
  formatRoutingInstructions,
} from './router.mjs';

// ─── classifyQuery ──────────────────────────────────────────────────────────

describe('classifyQuery', () => {
  it('classifies person lookup: "Who is the VP of Engineering at Stripe?"', () => {
    assert.equal(classifyQuery('Who is the VP of Engineering at Stripe?'), QUERY_TYPES.FIND_PERSON);
  });

  it('classifies person lookup: "Find the hiring manager for ML Engineer at Anthropic"', () => {
    assert.equal(
      classifyQuery('Find the hiring manager for ML Engineer at Anthropic'),
      QUERY_TYPES.FIND_PERSON,
    );
  });

  it('classifies email discovery: "What is jane.doe@stripe.com email?"', () => {
    assert.equal(
      classifyQuery('What is jane.doe@stripe.com email?'),
      QUERY_TYPES.FIND_EMAIL,
    );
  });

  it('classifies email discovery: "Find email for John Smith at Acme"', () => {
    assert.equal(
      classifyQuery('Find email for John Smith at Acme'),
      QUERY_TYPES.FIND_EMAIL,
    );
  });

  it('classifies job discovery: "Find ML engineering roles similar to this one"', () => {
    assert.equal(
      classifyQuery('Find ML engineering roles similar to this one'),
      QUERY_TYPES.DISCOVER_JOBS,
    );
  });

  it('classifies job discovery: "Search for AI engineer positions in SF"', () => {
    assert.equal(
      classifyQuery('Search for AI engineer positions in SF'),
      QUERY_TYPES.DISCOVER_JOBS,
    );
  });

  it('classifies URL scraping: "Extract JD from https://jobs.lever.co/company/role-id"', () => {
    assert.equal(
      classifyQuery('Extract JD from https://jobs.lever.co/company/role-id'),
      QUERY_TYPES.SCRAPE_URL,
    );
  });

  it('classifies company intel quick: "Tell me about Anthropic funding and tech stack"', () => {
    assert.equal(
      classifyQuery('Tell me about Anthropic funding and tech stack'),
      QUERY_TYPES.COMPANY_INTEL_QUICK,
    );
  });

  it('classifies company intel deep: "Deep research on Stripe financial health and market position"', () => {
    assert.equal(
      classifyQuery('Deep research on Stripe financial health and market position'),
      QUERY_TYPES.COMPANY_INTEL_DEEP,
    );
  });

  it('classifies similar companies: "Find companies similar to Stripe that are hiring"', () => {
    assert.equal(
      classifyQuery('Find companies similar to Stripe that are hiring'),
      QUERY_TYPES.SIMILAR_COMPANIES,
    );
  });

  it('classifies LinkedIn profile: "Get LinkedIn profile for Jane Doe at Stripe"', () => {
    assert.equal(
      classifyQuery('Get LinkedIn profile for Jane Doe at Stripe'),
      QUERY_TYPES.LINKEDIN_PROFILE,
    );
  });

  it('classifies market trends: "What are hiring trends for AI engineers in 2026?"', () => {
    assert.equal(
      classifyQuery('What are hiring trends for AI engineers in 2026?'),
      QUERY_TYPES.MARKET_TRENDS,
    );
  });
});

// ─── classifyQuery edge cases ───────────────────────────────────────────────

describe('classifyQuery edge cases', () => {
  it('"Find email for the VP of Engineering at Stripe" → FIND_EMAIL (not FIND_PERSON)', () => {
    assert.equal(
      classifyQuery('Find email for the VP of Engineering at Stripe'),
      QUERY_TYPES.FIND_EMAIL,
    );
  });

  it('"Find the hiring manager from https://jobs.lever.co/stripe/123" → SCRAPE_URL (URL wins)', () => {
    assert.equal(
      classifyQuery('Find the hiring manager from https://jobs.lever.co/stripe/123'),
      QUERY_TYPES.SCRAPE_URL,
    );
  });

  it('"Stripe financial health and regulatory filings" → COMPANY_INTEL_DEEP', () => {
    assert.equal(
      classifyQuery('Stripe financial health and regulatory filings'),
      QUERY_TYPES.COMPANY_INTEL_DEEP,
    );
  });
});

// ─── getRoutingChain ────────────────────────────────────────────────────────

describe('getRoutingChain', () => {
  const ALL_KEYS = {
    EXA_API_KEY: 'test',
    FIRECRAWL_API_KEY: 'test',
    BRIGHTDATA_API_KEY: 'test',
    VALYU_API_KEY: 'test',
    TAVILY_API_KEY: 'test',
  };

  let savedEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(ALL_KEYS)) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  it('FIND_PERSON with all APIs → exa first, parallel second, brightdata third', () => {
    Object.assign(process.env, ALL_KEYS);
    const chain = getRoutingChain(QUERY_TYPES.FIND_PERSON);
    assert.ok(chain.length >= 3, `expected at least 3 sources, got ${chain.length}`);
    assert.equal(chain[0].source, 'exa');
    assert.equal(chain[1].source, 'parallel');
    assert.equal(chain[2].source, 'brightdata');
  });

  it('skips unavailable APIs', () => {
    // Only set EXA key
    for (const key of Object.keys(ALL_KEYS)) delete process.env[key];
    process.env.EXA_API_KEY = 'test';
    const chain = getRoutingChain(QUERY_TYPES.FIND_PERSON);
    const sources = chain.map((s) => s.source);
    assert.ok(!sources.includes('brightdata'), 'brightdata should be skipped without key');
  });

  it('builtin fallback with no APIs', () => {
    for (const key of Object.keys(ALL_KEYS)) delete process.env[key];
    const chain = getRoutingChain(QUERY_TYPES.FIND_PERSON);
    assert.ok(chain.length >= 1, 'should have at least builtin fallback');
    assert.equal(chain[chain.length - 1].source, 'builtin');
  });

  it('SCRAPE_URL → firecrawl first', () => {
    Object.assign(process.env, ALL_KEYS);
    const chain = getRoutingChain(QUERY_TYPES.SCRAPE_URL);
    assert.equal(chain[0].source, 'firecrawl');
  });

  it('LINKEDIN_PROFILE → brightdata only (length 1)', () => {
    Object.assign(process.env, ALL_KEYS);
    const chain = getRoutingChain(QUERY_TYPES.LINKEDIN_PROFILE);
    // Should have brightdata as the only non-builtin source when available
    const nonBuiltin = chain.filter((s) => s.source !== 'builtin');
    assert.equal(nonBuiltin.length, 1, `expected 1 non-builtin source, got ${nonBuiltin.length}`);
    assert.equal(nonBuiltin[0].source, 'brightdata');
  });

  it('COMPANY_INTEL_DEEP → valyu first', () => {
    Object.assign(process.env, ALL_KEYS);
    const chain = getRoutingChain(QUERY_TYPES.COMPANY_INTEL_DEEP);
    assert.equal(chain[0].source, 'valyu');
  });
});
