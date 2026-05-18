/**
 * tests/unit/company-pulse.test.mjs
 *
 * Unit tests for lib/company-pulse.mjs.
 * All tests use a MOCK researcher invocation via opts.researchClient —
 * zero API calls, zero cost.
 *
 * Run: node --test tests/unit/company-pulse.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

import {
  readPulseCache,
  parsePulseReport,
  renderPulseCard,
  renderPulseSummary,
  getPulseForCompany,
  getDeltasInWindow,
} from '../../lib/company-pulse.mjs';

// ── Mock report content ─────────────────────────────────────────

const MOCK_PULSE_REPORT = `
# Researcher Report — Company Pulse: Anthropic

## Synthesized Answer

Here's what's pulsing at Anthropic in the last 24 hours.

## Hiring Signals

- **@dario_amodei** posted "We're actively hiring for AI Safety and product roles — most exciting time ever to join" on 2026-05-17 https://twitter.com/dario_amodei/status/99999
- Engineering manager posted that their Claude team is ramping hiring for TPMs https://linkedin.com/in/anthropic-eng-mgr

## Leader Media

- **Dario Amodei** published a blog post "The Importance of Speed in AI Safety" on 2026-05-17 https://anthropic.com/blog/speed-safety
- **Daniela Amodei** gave an interview on AI product strategy on the "Future of AI" podcast https://podcasts.example.com/future-ai-ep99

## Team Evidence

- Claude 3.7 API throughput improvements shipped per GitHub commits https://github.com/anthropics/anthropic-sdk-python/commits/main
- Engineering blog: "How we built sub-50ms latency for streaming" published 2026-05-16 https://anthropic.com/engineering/latency

## New

- Dario post on hiring velocity creates direct leverage — Mitchell's "ships fast" brand aligns
- Engineering latency post is direct signal for TPM / SA roles needing infra context

## Citations

- https://twitter.com/dario_amodei/status/99999 — Dario hiring tweet
- https://anthropic.com/blog/speed-safety — Dario blog post
- https://github.com/anthropics/anthropic-sdk-python/commits/main — SDK commits
`;

// ── Helpers ─────────────────────────────────────────────────────

function createMockReport(content) {
  const dir  = mkdtempSync(join(tmpdir(), 'pulse-test-'));
  const path = join(dir, 'researcher-report-pulse-test.md');
  writeFileSync(path, content, 'utf8');
  return { dir, path };
}

// ── Tests ────────────────────────────────────────────────────────

test('parsePulseReport extracts hiring signals from report', () => {
  const { path, dir } = createMockReport(MOCK_PULSE_REPORT);
  try {
    const pulse = parsePulseReport(path, 'anthropic');
    assert.ok(pulse.hiring_signals.length >= 1, 'should have at least 1 hiring signal');
    assert.ok(
      pulse.hiring_signals.some(s => s.text?.includes('hiring') || s.text?.includes('Hiring')),
      'hiring signals should mention hiring'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parsePulseReport extracts leader media and team evidence', () => {
  const { path, dir } = createMockReport(MOCK_PULSE_REPORT);
  try {
    const pulse = parsePulseReport(path, 'anthropic');
    assert.ok(pulse.leader_media.length >= 1, 'should have at least 1 leader media item');
    assert.ok(pulse.team_evidence.length >= 1, 'should have at least 1 team evidence item');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parsePulseReport returns safe empty struct for missing file', () => {
  const pulse = parsePulseReport('/nonexistent/path/report.md', 'missing-co');
  assert.equal(pulse.company_slug, 'missing-co', 'should set company_slug');
  assert.deepEqual(pulse.hiring_signals, [], 'should have empty hiring signals');
  assert.deepEqual(pulse.leader_media, [], 'should have empty leader media');
  assert.ok(pulse._parse_warnings.length > 0, 'should include parse warning');
});

test('getPulseForCompany calls mock client and writes cache', async () => {
  const { path: reportPath, dir: reportDir } = createMockReport(MOCK_PULSE_REPORT);
  let clientCalled = false;
  const mockResearchClient = async () => {
    clientCalled = true;
    return { path: reportPath, cost_estimate: 0.55 };
  };

  const SLUG = 'anthropic-test-' + Date.now();
  let writtenPath;

  try {
    const { pulse, refreshedAt } = await getPulseForCompany(SLUG, {
      researchClient: mockResearchClient,
      forceLive:      true,
      companyName:    'Anthropic',
    });

    writtenPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../data/company-pulse',
      `${SLUG}.json`
    );

    assert.ok(clientCalled, 'mock client should have been called');
    assert.ok(pulse, 'should return pulse object');
    assert.ok(refreshedAt, 'should have refreshedAt timestamp');
    assert.equal(pulse.company_slug, SLUG, 'pulse company_slug should match');
    assert.ok(pulse.cost_estimate, 'should have cost estimate');
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
    if (writtenPath && existsSync(writtenPath)) rmSync(writtenPath, { force: true });
  }
});

test('getPulseForCompany serves fresh cache without re-invoking client', async () => {
  const { path: reportPath, dir: reportDir } = createMockReport(MOCK_PULSE_REPORT);
  let callCount = 0;
  const mockResearchClient = async () => {
    callCount++;
    return { path: reportPath, cost_estimate: 0.20 };
  };

  const SLUG = 'anthropic-cache-test-' + Date.now();
  let writtenPath;

  try {
    // First call — fresh run
    await getPulseForCompany(SLUG, {
      researchClient: mockResearchClient,
      forceLive:      true,
    });
    assert.equal(callCount, 1, 'first call should invoke client once');

    // Second call — should hit cache (1 second TTL is enough for test)
    await getPulseForCompany(SLUG, {
      researchClient: mockResearchClient,
      maxAgeMs:       60_000,
    });
    assert.equal(callCount, 1, 'second call with fresh cache should NOT invoke client again');

    writtenPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../data/company-pulse',
      `${SLUG}.json`
    );
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
    if (writtenPath && existsSync(writtenPath)) rmSync(writtenPath, { force: true });
  }
});

test('getDeltasInWindow returns empty array for unknown slug', () => {
  const deltas = getDeltasInWindow('completely-unknown-company-slug-xyz-' + Date.now(), 24);
  assert.deepEqual(deltas, [], 'should return empty array for unknown company');
});

test('renderPulseCard produces HTML with expected sections and company slug', () => {
  const pulse = {
    schema_version: '1.0.0',
    company_slug:   'anthropic',
    refreshed_at:   new Date().toISOString(),
    last_pulse_at:  new Date().toISOString(),
    hiring_signals: [{ kind: 'hiring_signal', ts: null, actor: 'Dario', text: "We're hiring!", url: 'https://example.com' }],
    leader_media:   [{ kind: 'leader_media', ts: null, actor: 'Dario', title: 'Speed blog', url: null }],
    team_evidence:  [{ kind: 'team_evidence', ts: null, text: 'SDK update', url: null }],
    delta_since_last_pulse: [],
    citations:      [],
    _parse_warnings: [],
  };

  const html = renderPulseCard(pulse);

  assert.ok(html.includes('anthropic'),       'should include company slug');
  assert.ok(html.includes('Hiring Signals'),  'should have Hiring Signals section');
  assert.ok(html.includes('Leader Media'),    'should have Leader Media section');
  assert.ok(html.includes('Team Evidence'),   'should have Team Evidence section');
  assert.ok(html.includes('pulse-card'),      'should have pulse-card class');
  assert.ok(!html.includes('<script'),        'should not include script tags (XSS guard)');
});

test('renderPulseSummary produces markdown with delta items', () => {
  const deltas = [
    { _source: 'hiring_signals', kind: 'hiring_signal', text: "We're hiring TPMs!", url: 'https://x.com/test' },
    { _source: 'leader_media',   kind: 'leader_media',  text: 'Dario posted on AI Safety', url: null },
  ];

  const md = renderPulseSummary(deltas);

  assert.ok(md.includes('TPMs'),              'should include hiring signal text');
  assert.ok(md.includes('Dario'),             'should include leader media text');
  assert.ok(md.includes('Hiring Signals'),    'should have Hiring Signals label');
  assert.ok(md.includes('Leader Media'),      'should have Leader Media label');
});

test('renderPulseSummary returns empty message when no deltas', () => {
  const md = renderPulseSummary([]);
  assert.ok(md.includes('No new signals'),    'should indicate no new signals');
});
