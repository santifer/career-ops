/**
 * tests/unit/hm-intel-research.test.mjs
 *
 * Unit tests for lib/hm-intel-research.mjs.
 * All tests use a MOCK researcher invocation via opts.researchClient —
 * zero API calls, zero cost.
 *
 * Run: node --test tests/unit/hm-intel-research.test.mjs
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync, mkdtempSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Import the module under test ────────────────────────────────

import {
  toSlug,
  readCache,
  parseResearcherReport,
  renderHmIntelCard,
  getHmIntelForRole,
  forceRefresh,
} from '../../lib/hm-intel-research.mjs';

// ── Test helpers ─────────────────────────────────────────────────

/**
 * Create a mock researcher report at a temp path.
 * Returns the path to the created file.
 */
function createMockReport(content) {
  const dir  = mkdtempSync(join(tmpdir(), 'hm-test-'));
  const path = join(dir, 'researcher-report-test.md');
  writeFileSync(path, content, 'utf8');
  return { dir, path };
}

const MOCK_REPORT_CONTENT = `
# Researcher Report — HM Research

## Synthesized Answer

Research on the hiring manager for Test Role at TestCo.

## HM Profile

**Jane Smith** leads the Test Team at TestCo.

- Background in AI and machine learning
- Values technical depth and shipping velocity
- Publicly advocates for cross-functional collaboration

## Recruiter Profile

**Bob Recruiter** handles technical hiring at TestCo.

- Specializes in AI/ML roles
- Known for fast response times
- Prefers structured submissions

## Engagement Style

**communication_preference**: async-first via LinkedIn
**response_time**: typically 2–3 days
**interview_format**: case study + behavioral

## Leverage Points

- Jane has publicly praised fast iteration cycles — aligns with Mitchell's "ships fast" brand
- Bob recently posted about prioritizing candidates who can demo real projects
- TestCo just launched a new AI product that overlaps with Mitchell's career-ops work

## Predicted Questions

1. Tell me about a time you shipped something in under a week
2. How do you handle ambiguous requirements at scale?
3. Describe a technical project that required cross-functional leadership
4. What's your approach to communicating technical trade-offs to non-technical stakeholders?
5. What AI tools do you currently use in your daily workflow?

## Citations

- https://linkedin.com/in/jane-smith-testco — Jane Smith LinkedIn profile
- https://twitter.com/janesmith/status/123456 — Jane Smith tweet on shipping velocity
- https://testco.com/blog/2026-05-10-ai-launch — TestCo AI product launch blog post
`;

// ── Tests ────────────────────────────────────────────────────────

test('toSlug converts company and role names to kebab slugs', () => {
  assert.equal(toSlug('ElevenLabs'), 'elevenlabs');
  assert.equal(toSlug('Communications Manager'), 'communications-manager');
  assert.equal(toSlug('AI Product Ops'), 'ai-product-ops');
  assert.equal(toSlug('OpenAI, Inc.'), 'openai-inc');
  assert.equal(toSlug('  hello world  '), 'hello-world');
});

test('parseResearcherReport extracts HM name from bold in HM Profile section', () => {
  const { path, dir } = createMockReport(MOCK_REPORT_CONTENT);
  try {
    const parsed = parseResearcherReport(path);
    assert.equal(parsed.hm_name, 'Jane Smith', 'should extract HM name');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parseResearcherReport extracts recruiter name and signals', () => {
  const { path, dir } = createMockReport(MOCK_REPORT_CONTENT);
  try {
    const parsed = parseResearcherReport(path);
    assert.equal(parsed.recruiter_name, 'Bob Recruiter', 'should extract recruiter name');
    assert.ok(parsed.recruiter_signals.length >= 1, 'should have at least 1 recruiter signal');
    assert.ok(
      parsed.recruiter_signals.some(s => s.includes('AI/ML')),
      'should include AI/ML signal for recruiter'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parseResearcherReport extracts leverage points and predicted questions', () => {
  const { path, dir } = createMockReport(MOCK_REPORT_CONTENT);
  try {
    const parsed = parseResearcherReport(path);
    assert.ok(parsed.leverage_points.length >= 2, 'should have at least 2 leverage points');
    assert.ok(parsed.questions_to_expect.length >= 3, 'should have at least 3 predicted questions');
    assert.ok(
      parsed.questions_to_expect.some(q => q.toLowerCase().includes('shipped') || q.toLowerCase().includes('ship')),
      'should include a shipping-velocity question'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parseResearcherReport returns safe empty struct for missing report', () => {
  const parsed = parseResearcherReport('/nonexistent/path/report.md');
  assert.equal(parsed.hm_name, null, 'hm_name should be null for missing file');
  assert.deepEqual(parsed.hm_signals, [], 'hm_signals should be empty array');
  assert.ok(parsed._parse_warnings.length > 0, 'should include a parse warning');
});

test('getHmIntelForRole uses injected researchClient and writes cache', async () => {
  const { path: reportPath, dir: reportDir } = createMockReport(MOCK_REPORT_CONTENT);

  let clientCalled = false;
  const mockResearchClient = async () => {
    clientCalled = true;
    return { path: reportPath, cost_estimate: 0.42 };
  };

  let result;
  try {
    result = await getHmIntelForRole({
      rowId:   99,
      company: 'TestCo',
      role:    'Test Role',
      opts:    { researchClient: mockResearchClient, forceLive: true },
    });

    assert.ok(clientCalled, 'mock research client should have been called');
    assert.ok(result.hmIntel, 'result should contain hmIntel');
    assert.ok(result.path.endsWith('.json'), 'result path should be a JSON cache file');
    assert.ok(result.refreshedAt, 'result should have refreshedAt timestamp');
    assert.equal(result.cost_estimate, 0.42, 'should propagate cost estimate');
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
    // Clean up the cache entry written to data/hm-intel
    const cacheFile = result?.path;
    if (cacheFile && existsSync(cacheFile)) rmSync(cacheFile, { force: true });
  }
});

test('getHmIntelForRole serves cache on second call without re-invoking client', async () => {
  const { path: reportPath, dir: reportDir } = createMockReport(MOCK_REPORT_CONTENT);
  let callCount = 0;
  const mockResearchClient = async () => {
    callCount++;
    return { path: reportPath, cost_estimate: 0.10 };
  };

  const COMPANY = 'CacheTestCo';
  const ROLE    = 'Cache Test Role';
  let capturedPath;

  try {
    // First call — should invoke client
    const r1 = await getHmIntelForRole({
      rowId: 1, company: COMPANY, role: ROLE,
      opts:  { researchClient: mockResearchClient, forceLive: true },
    });
    capturedPath = r1.path;
    assert.equal(callCount, 1, 'first call should invoke client once');

    // Second call with fresh cache — should NOT invoke client
    const r2 = await getHmIntelForRole({
      rowId: 1, company: COMPANY, role: ROLE,
      opts:  { researchClient: mockResearchClient, maxAgeMs: 60_000 },
    });
    assert.equal(callCount, 1, 'second call with fresh cache should not re-invoke client');
    assert.ok(r2.hmIntel, 'cached result should still have hmIntel');
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
    if (capturedPath && existsSync(capturedPath)) rmSync(capturedPath, { force: true });
  }
});

test('renderHmIntelCard produces HTML with expected sections', () => {
  const intel = {
    hm_name:         'Jane Smith',
    hm_signals:      ['Values shipping velocity', 'Cross-functional focus'],
    recruiter_name:  'Bob Recruiter',
    recruiter_signals: ['Fast responses'],
    engagement_style: { communication_preference: 'async-first' },
    leverage_points: ['Overlap on AI product work'],
    questions_to_expect: ['Tell me about a recent ship'],
    citations:       ['https://linkedin.com/in/jane-smith'],
    _parse_warnings: [],
  };

  const html = renderHmIntelCard(intel);

  assert.ok(html.includes('Jane Smith'),         'should include HM name');
  assert.ok(html.includes('Bob Recruiter'),      'should include recruiter name');
  assert.ok(html.includes('Leverage Points'),    'should include Leverage Points section');
  assert.ok(html.includes('Predicted Questions'),'should include Predicted Questions section');
  assert.ok(html.includes('hm-intel-card'),      'should have hm-intel-card class');
  assert.ok(!html.includes('<script'),           'should not contain script tags (XSS guard)');
});
