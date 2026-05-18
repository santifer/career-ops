/**
 * tests/unit/story-child-page.test.mjs
 *
 * All tests use a mock llmClient so no budget is burned.
 * dryRun:true is used where we don't need to test the LLM path at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { renderStoryChildPage } from '../../lib/story-child-page.mjs';

// ---------------------------------------------------------------------------
// Shared mock LLM client
// ---------------------------------------------------------------------------

function mockLlmClient(_prompt) {
  return Promise.resolve({
    questions: [
      'How did you build alignment across stakeholders?',
      'What was the hardest tradeoff you made?',
      'How would you apply this at Anthropic?',
      'What did you learn from the failure modes?',
    ],
    frameworks: [
      '**Situation:** Led cross-functional initiative.\n**Task:** Build consensus.\n**Action:** Weekly syncs.\n**Result:** 20% faster.\n**Reflection:** Would involve eng earlier.',
      '**Situation:** Competing priorities.\n**Task:** Choose one.\n**Action:** Data-driven cut.\n**Result:** Shipped on time.\n**Reflection:** Tradeoff framework now standard.',
      '**Situation:** Similar scale.\n**Task:** Apply learnings.\n**Action:** Adapt pattern.\n**Result:** Expected velocity gain.\n**Reflection:** Context matters.',
      '**Situation:** Post-mortem revealed gaps.\n**Task:** Fix root cause.\n**Action:** Process change.\n**Result:** 0 repeat failures.\n**Reflection:** Failure is data.',
    ],
  });
}

// ---------------------------------------------------------------------------
// Minimal repo fixture
// ---------------------------------------------------------------------------

function makeTempRepo() {
  const root = join(tmpdir(), `co-test-${Date.now()}`);
  mkdirSync(join(root, 'interview-prep'), { recursive: true });
  mkdirSync(join(root, 'writing-samples'), { recursive: true });
  mkdirSync(join(root, 'data', 'hm-intel'), { recursive: true });
  mkdirSync(join(root, 'data', 'apply-packs'), { recursive: true });

  writeFileSync(join(root, 'cv.md'), [
    '# Mitchell Williams',
    '',
    '## Experience',
    '- Led Anthropic AI integration at Google',
    '- Managed $5M budget',
    '- Shipped Claude feature to 2M users',
  ].join('\n'), 'utf-8');

  writeFileSync(join(root, 'article-digest.md'), [
    '- Delivered $12M in overpay signals by launching equity benchmarking',
    '- Led cross-functional AI integration for 50-person org',
  ].join('\n'), 'utf-8');

  writeFileSync(join(root, 'interview-prep', 'story-bank.md'), [
    '## Led cross-functional AI integration',
    '**S:** Google 2024, 50-person org',
    '**T:** Deploy Claude across ops teams',
    '**A:** Weekly syncs, built consensus, trained 30 people',
    '**R:** 40% faster triage',
    '**Reflection:** Would involve legal earlier',
    '',
    '## Other Story',
    '**S:** Different context',
  ].join('\n'), 'utf-8');

  writeFileSync(join(root, 'writing-samples', 'voice-reference.md'),
    'Voice: direct, precise, editorial.', 'utf-8');

  return root;
}

function cleanupTempRepo(root) {
  try { rmSync(root, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('renderStoryChildPage throws without story.name', async () => {
  await assert.rejects(
    () => renderStoryChildPage({ story: {}, role: 'PM', company: 'Acme', rowId: 1 }),
    /story\.name is required/
  );
});

test('renderStoryChildPage throws without role', async () => {
  await assert.rejects(
    () => renderStoryChildPage({ story: { name: 'Test' }, company: 'Acme', rowId: 1 }),
    /role is required/
  );
});

test('renderStoryChildPage throws without company', async () => {
  await assert.rejects(
    () => renderStoryChildPage({ story: { name: 'Test' }, role: 'PM', rowId: 1 }),
    /company is required/
  );
});

test('renderStoryChildPage throws without rowId', async () => {
  await assert.rejects(
    () => renderStoryChildPage({ story: { name: 'Test' }, role: 'PM', company: 'Acme' }),
    /rowId is required/
  );
});

test('renderStoryChildPage returns html and path (dryRun)', async () => {
  const root = makeTempRepo();
  try {
    const { html, path, cacheHit } = await renderStoryChildPage({
      story: { name: 'Led cross-functional AI integration', context: 'Led AI work at Google.' },
      role: 'Strategic Operations Manager',
      company: 'Anthropic',
      rowId: 42,
      opts: { dryRun: true, repoRoot: root },
    });

    assert.ok(typeof html === 'string', 'html is a string');
    assert.ok(html.length > 100, 'html is non-trivial');
    assert.ok(typeof path === 'string', 'path is a string');
    assert.ok(path.includes('stories'), 'path includes stories dir');
    assert.ok(path.endsWith('.html'), 'path ends with .html');
    assert.ok(typeof cacheHit === 'boolean', 'cacheHit is boolean');
  } finally {
    cleanupTempRepo(root);
  }
});

test('renderStoryChildPage HTML has all 4 section headings', async () => {
  const root = makeTempRepo();
  try {
    const { html } = await renderStoryChildPage({
      story: { name: 'Led cross-functional AI integration' },
      role: 'PM',
      company: 'Anthropic',
      rowId: 1,
      opts: { dryRun: true, repoRoot: root },
    });

    assert.ok(html.includes('Narrative'), 'section 1: Narrative');
    assert.ok(html.includes('Predicted Questions'), 'section 2: Predicted Questions');
    assert.ok(html.includes('Voice-Anchored Answer Frameworks'), 'section 3: Frameworks');
    assert.ok(html.includes('Remix Prompts'), 'section 4: Remix Prompts');
  } finally {
    cleanupTempRepo(root);
  }
});

test('renderStoryChildPage embeds story name in title and breadcrumb', async () => {
  const root = makeTempRepo();
  try {
    const { html } = await renderStoryChildPage({
      story: { name: 'Led cross-functional AI integration' },
      role: 'PM',
      company: 'Acme',
      rowId: 7,
      opts: { dryRun: true, repoRoot: root },
    });

    assert.ok(
      html.includes('Led cross-functional AI integration'),
      'story name in page title'
    );
    assert.ok(html.includes('Row 7'), 'rowId in breadcrumb');
    assert.ok(html.includes('Acme'), 'company in breadcrumb');
  } finally {
    cleanupTempRepo(root);
  }
});

test('renderStoryChildPage includes 4 remix prompt channels', async () => {
  const root = makeTempRepo();
  try {
    const { html } = await renderStoryChildPage({
      story: { name: 'Story X' },
      role: 'PM',
      company: 'Acme',
      rowId: 1,
      opts: { dryRun: true, repoRoot: root },
    });

    assert.ok(html.includes('Cover Letter'), 'cover letter channel');
    assert.ok(html.includes('Why Statement'), 'why statement channel');
    assert.ok(html.includes('LinkedIn DM'), 'linkedin dm channel');
    assert.ok(html.includes('Loom Script'), 'loom script channel');
  } finally {
    cleanupTempRepo(root);
  }
});

test('renderStoryChildPage uses mock LLM client when provided (no budget burn)', async () => {
  const root = makeTempRepo();
  try {
    const { html } = await renderStoryChildPage({
      story: { name: 'Led cross-functional AI integration' },
      role: 'PM',
      company: 'Anthropic',
      rowId: 99,
      opts: { llmClient: mockLlmClient, repoRoot: root },
    });

    // Questions from mock client should appear
    assert.ok(
      html.includes('How did you build alignment across stakeholders?'),
      'mock question 1 in HTML'
    );
    assert.ok(
      html.includes('What was the hardest tradeoff you made?'),
      'mock question 2 in HTML'
    );
  } finally {
    cleanupTempRepo(root);
  }
});

test('renderStoryChildPage shows HM calibration note when hmIntel provided', async () => {
  const root = makeTempRepo();
  try {
    const hmIntel = { signals: ['values depth over breadth', 'prefers systems thinking'] };
    const { html } = await renderStoryChildPage({
      story: { name: 'Story X' },
      role: 'PM',
      company: 'Acme',
      rowId: 1,
      hmIntel,
      opts: { llmClient: mockLlmClient, repoRoot: root },
    });

    assert.ok(
      html.includes('Calibrated to hiring manager signal patterns'),
      'HM calibration note present when hmIntel provided'
    );
  } finally {
    cleanupTempRepo(root);
  }
});

test('renderStoryChildPage shows generic note when no hmIntel', async () => {
  const root = makeTempRepo();
  try {
    const { html } = await renderStoryChildPage({
      story: { name: 'Story X' },
      role: 'PM',
      company: 'Acme',
      rowId: 1,
      opts: { llmClient: mockLlmClient, repoRoot: root },
    });

    assert.ok(
      html.includes('no HM intel cached'),
      'generic note present when no hmIntel'
    );
  } finally {
    cleanupTempRepo(root);
  }
});

test('renderStoryChildPage output path includes rowId + company slug + story slug', async () => {
  const root = makeTempRepo();
  try {
    const { path } = await renderStoryChildPage({
      story: { name: 'Led AI Rollout' },
      role: 'PM',
      company: 'Acme Corp',
      rowId: 17,
      opts: { dryRun: true, repoRoot: root },
    });

    assert.ok(path.includes('17-acme-corp'), 'path includes rowId-companySlug');
    assert.ok(path.includes('led-ai-rollout.html'), 'path includes story slug');
  } finally {
    cleanupTempRepo(root);
  }
});

test('renderStoryChildPage caches LLM results on second call', async () => {
  const root = makeTempRepo();
  let callCount = 0;
  const countingClient = (prompt) => {
    callCount++;
    return mockLlmClient(prompt);
  };

  try {
    // First call — populates cache
    await renderStoryChildPage({
      story: { name: 'Cache Test Story' },
      role: 'PM',
      company: 'Acme',
      rowId: 55,
      opts: { llmClient: countingClient, repoRoot: root },
    });

    // Second call — should hit cache
    const { cacheHit } = await renderStoryChildPage({
      story: { name: 'Cache Test Story' },
      role: 'PM',
      company: 'Acme',
      rowId: 55,
      opts: { llmClient: countingClient, repoRoot: root },
    });

    assert.equal(callCount, 1, 'LLM called only once (second call hit cache)');
    assert.equal(cacheHit, true, 'cacheHit is true on second call');
  } finally {
    cleanupTempRepo(root);
  }
});

test('renderStoryChildPage HTML is valid (no unclosed tags in skeleton)', async () => {
  const root = makeTempRepo();
  try {
    const { html } = await renderStoryChildPage({
      story: { name: 'Test' },
      role: 'PM',
      company: 'X',
      rowId: 1,
      opts: { dryRun: true, repoRoot: root },
    });

    // Basic structural check: each major open tag has a close tag
    const opens = (html.match(/<(html|head|body|main|aside|nav|footer)\b/g) || []).length;
    const closes = (html.match(/<\/(html|head|body|main|aside|nav|footer)>/g) || []).length;
    assert.equal(opens, closes, 'structural tags are balanced');
  } finally {
    cleanupTempRepo(root);
  }
});

test('hm-intel-present: snapshot date shown in questions section', async () => {
  // When hmIntel has refreshed_at, the Predicted Questions section must include
  // "Calibrated to HM intel snapshot from {date}" with the date in a <time> element.
  const root = makeTempRepo();
  try {
    const hmIntel = {
      name: 'Jane Doe',
      refreshed_at: '2026-05-17',
      top_third_priority_keywords: ['system design', 'Python depth', 'cross-functional'],
      top_value_dimension: 'system-design',
      technical_depth_focus: ['Python', 'distributed systems'],
    };
    const { html } = await renderStoryChildPage({
      story: { name: 'Led AI system redesign' },
      role: 'Staff TPgM',
      company: 'Anthropic',
      rowId: 22,
      hmIntel,
      opts: { llmClient: mockLlmClient, repoRoot: root },
    });

    assert.ok(
      html.includes('Calibrated to HM intel snapshot from'),
      'snapshot calibration note present when refreshed_at set'
    );
    assert.ok(
      html.includes('2026-05-17'),
      'snapshot date value appears in HTML'
    );
    assert.ok(
      html.includes('<time'),
      'snapshot date wrapped in <time> element for semantics'
    );
    // Cover letter remix should reference the HM value dimension
    assert.ok(
      html.includes('system-design') || html.includes('system design'),
      'HM value dimension surfaced in remix prompt area'
    );
  } finally {
    cleanupTempRepo(root);
  }
});

test('hm-intel-absent: generic calibration note shown in questions section', async () => {
  // When no hmIntel is provided, the Predicted Questions section must show
  // "Generic role-shape calibration (no HM intel cached)" to signal the fallback path.
  const root = makeTempRepo();
  try {
    const { html } = await renderStoryChildPage({
      story: { name: 'Led AI rollout' },
      role: 'PM',
      company: 'Acme',
      rowId: 5,
      // no hmIntel passed
      opts: { llmClient: mockLlmClient, repoRoot: root },
    });

    assert.ok(
      html.includes('Generic role-shape calibration (no HM intel cached)'),
      'generic calibration note present when no hmIntel'
    );
    assert.ok(
      !html.includes('Calibrated to HM intel snapshot from'),
      'no snapshot date note when hmIntel absent'
    );
  } finally {
    cleanupTempRepo(root);
  }
});
