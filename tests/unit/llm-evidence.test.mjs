/**
 * tests/unit/llm-evidence.test.mjs
 *
 * Unit tests for lib/llm-evidence.mjs
 * Runs via: node --test tests/unit/llm-evidence.test.mjs
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const KNOWLEDGE_PATH = join(REPO_ROOT, 'data', 'llm-usage-knowledge.json');

// ── Fixture: minimal valid knowledge base ─────────────────────────────────────

const MINIMAL_KB = {
  schema_version: '1.0.0',
  generated_at: new Date().toISOString(),
  providers: {
    claude_code: {
      evidence_count: 0,
      first_use_date: null,
      latest_use_date: null,
      advanced_patterns: [],
      use_cases: [],
      compounding_signals: [],
    },
    anthropic_api: {
      evidence_count: 0,
      first_use_date: null,
      latest_use_date: null,
      advanced_patterns: [],
      use_cases: [],
      compounding_signals: [],
    },
  },
  skill_compounding: {
    first_observed: null,
    patterns_in_use_now: [],
    patterns_acquired_last_30d: [],
  },
};

// Rich fixture with real career-ops evidence
const RICH_KB = {
  schema_version: '1.0.0',
  generated_at: new Date().toISOString(),
  providers: {
    claude_code: {
      evidence_count: 87,
      first_use_date: '2026-04-01T00:00:00.000Z',
      latest_use_date: '2026-05-17T00:00:00.000Z',
      advanced_patterns: [
        'multi-agent fan-out',
        'sub-agent parallelization',
        'worktree isolation',
        'MCP tool integration',
        'council-of-models framework',
        'agent-attributed commits',
        'autonomous build sessions',
      ],
      use_cases: [
        {
          name: 'agent-commit workflow',
          evidence: '87 agent-attributed commits in git log',
          ref: 'git:abc12345',
        },
        {
          name: 'Council-of-models run',
          evidence: 'council-20260517-084457.json',
          ref: '~/.claude/agents/runs/council-20260517-084457.json',
        },
        {
          name: 'Career-ops project usage',
          evidence: '3516 transcripts in career-ops project',
          ref: '~/.claude/projects/career-ops/',
        },
        {
          name: 'MCP tool usage',
          evidence: 'MCPs invoked: gmail, calendar, notion',
          ref: '~/.claude/projects/',
        },
        {
          name: 'sub-agent fan-out',
          evidence: 'worktree isolated sub-agent fan-out',
          ref: 'git:def67890',
        },
      ],
      compounding_signals: [
        { date: '2026-05-17T00:00:00.000Z', pattern: 'multi-LLM council invocation' },
        { date: '2026-05-17T00:00:00.000Z', pattern: '3516 career-ops sessions in Claude Code' },
        { date: '2026-05-17T00:00:00.000Z', pattern: 'worktree-isolated sub-agent execution' },
      ],
    },
    anthropic_api: {
      evidence_count: 45,
      first_use_date: '2026-04-15T00:00:00.000Z',
      latest_use_date: '2026-05-17T00:00:00.000Z',
      advanced_patterns: [
        'Batch API usage',
        'prompt caching (cache_control)',
        'provider circuit breaker',
        'multi-provider routing',
        'temperature tuning',
      ],
      use_cases: [
        {
          name: 'Anthropic Batch API',
          evidence: 'batch-runner-batches.mjs uses Batch API',
          ref: 'batch-runner-batches.mjs',
        },
        {
          name: 'Prompt caching (cache_control)',
          evidence: 'cache_control in static prompt block',
          ref: 'triage.mjs',
        },
        {
          name: 'Cost-logged API runs',
          evidence: '142 runs tracked, ~$31.50 total logged',
          ref: 'data/cost-log.tsv',
        },
      ],
      compounding_signals: [
        { date: '2026-05-10T00:00:00.000Z', pattern: 'cache_control in batch evaluation' },
        { date: '2026-05-10T00:00:00.000Z', pattern: 'budget guard + cost-log integration' },
        { date: '2026-05-17T00:00:00.000Z', pattern: '142 cost-logged API runs' },
      ],
    },
    gemini: {
      evidence_count: 12,
      first_use_date: '2026-05-07T00:00:00.000Z',
      latest_use_date: '2026-05-17T00:00:00.000Z',
      advanced_patterns: ['Gemini Flash fallback routing', 'thinkingBudget=0 for cost control'],
      use_cases: [
        {
          name: 'Triage fallback routing',
          evidence: 'Gemini Flash as triage fallback',
          ref: 'triage.mjs',
        },
      ],
      compounding_signals: [],
    },
    ollama: {
      evidence_count: 8,
      first_use_date: '2026-05-08T00:00:00.000Z',
      latest_use_date: '2026-05-10T00:00:00.000Z',
      advanced_patterns: ['Local Ollama M2 inference', 'qwen3 chain (14B→8B→3B)'],
      use_cases: [
        {
          name: 'Local Ollama triage',
          evidence: 'triage-local.mjs uses Ollama /api/chat',
          ref: 'triage-local.mjs',
        },
      ],
      compounding_signals: [],
    },
    grok: {
      evidence_count: 6,
      first_use_date: '2026-05-07T00:00:00.000Z',
      latest_use_date: '2026-05-15T00:00:00.000Z',
      advanced_patterns: ['Grok research automation'],
      use_cases: [
        {
          name: 'Grok research automation',
          evidence: 'scripts/grok-research.mjs',
          ref: 'scripts/grok-research.mjs',
        },
      ],
      compounding_signals: [],
    },
  },
  skill_compounding: {
    first_observed: '2026-04-01T00:00:00.000Z',
    patterns_in_use_now: [
      'multi-LLM council invocation',
      'worktree-isolated sub-agent execution',
      'cache_control in batch evaluation',
      'budget guard + cost-log integration',
    ],
    patterns_acquired_last_30d: [
      'multi-LLM council invocation',
      'cache_control in batch evaluation',
      '142 cost-logged API runs',
    ],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function writeKB(data) {
  if (!existsSync(join(REPO_ROOT, 'data'))) {
    mkdirSync(join(REPO_ROOT, 'data'), { recursive: true });
  }
  writeFileSync(KNOWLEDGE_PATH, JSON.stringify(data, null, 2));
}

function removeKB() {
  try { unlinkSync(KNOWLEDGE_PATH); } catch { /* ok */ }
}

// Import after test setup so cache is clean
import {
  loadKnowledgeBase,
  clearCache,
  checkGap,
  renderEvidenceCard,
  surfaceCompoundingFor,
  getProviderSummary,
} from '../../lib/llm-evidence.mjs';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('llm-evidence: schema validation', () => {
  afterEach(() => { clearCache(); removeKB(); });

  test('loadKnowledgeBase returns null when file missing', () => {
    removeKB();
    clearCache();
    const kb = loadKnowledgeBase();
    assert.equal(kb, null, 'Should return null when knowledge base file does not exist');
  });

  test('loadKnowledgeBase validates schema_version and providers fields', () => {
    writeKB({ schema_version: '1.0.0', providers: {} });
    clearCache();
    const kb = loadKnowledgeBase();
    assert.ok(kb !== null, 'Should load valid KB');
    assert.equal(kb.schema_version, '1.0.0');
    assert.ok(typeof kb.providers === 'object');
  });

  test('loadKnowledgeBase returns null for invalid schema', () => {
    writeKB({ broken: true });
    clearCache();
    const kb = loadKnowledgeBase();
    assert.equal(kb, null, 'Should return null for KB missing required fields');
  });

  test('loadKnowledgeBase caches result in-memory (second call returns same object)', () => {
    writeKB(MINIMAL_KB);
    clearCache();
    const first = loadKnowledgeBase();
    const second = loadKnowledgeBase();
    assert.strictEqual(first, second, 'Second load should return cached object reference');
  });
});

describe('llm-evidence: Claude Code specific usage gap', () => {
  afterEach(() => { clearCache(); removeKB(); });

  test('checkGap returns contradicts=true for "Claude Code specific usage" gap given career-ops evidence', () => {
    writeKB(RICH_KB);
    clearCache();
    const result = checkGap('Claude Code specific usage');
    assert.equal(result.contradicts, true, 'Should contradict the Claude Code specific usage gap');
    assert.ok(result.evidence_summary.length > 0, 'Should provide evidence summary');
    assert.ok(result.draft_response.length > 0, 'Should provide a draft response');
    assert.ok(Array.isArray(result.citations), 'Citations should be an array');
    assert.ok(result.citations.length > 0, 'Should have at least one citation');
  });

  test('checkGap handles "MCP integration" gap variant', () => {
    writeKB(RICH_KB);
    clearCache();
    const result = checkGap('MCP integration depth');
    assert.equal(result.contradicts, true);
  });

  test('checkGap returns contradicts=false when claude_code provider has zero evidence', () => {
    writeKB(MINIMAL_KB);
    clearCache();
    const result = checkGap('Claude Code specific usage');
    assert.equal(result.contradicts, false);
  });
});

describe('llm-evidence: Python/JS depth gap', () => {
  afterEach(() => { clearCache(); removeKB(); });

  test('checkGap returns contradicts=true for "Python depth" gap given API coding evidence', () => {
    writeKB(RICH_KB);
    clearCache();
    const result = checkGap('Python API coding depth');
    // Node.js + API evidence should partially contradict a "coding depth" gap
    assert.equal(result.contradicts, true);
    assert.ok(result.evidence_summary.length > 0);
  });
});

describe('llm-evidence: compounding signals', () => {
  afterEach(() => { clearCache(); removeKB(); });

  test('surfaceCompoundingFor returns signals with required fields', () => {
    writeKB(RICH_KB);
    clearCache();
    const signals = surfaceCompoundingFor({ title: 'AI Platform Engineer', company: 'Anthropic' });
    assert.ok(Array.isArray(signals), 'Should return an array');
    assert.ok(signals.length > 0, 'Should return at least one compounding signal');
    for (const sig of signals.slice(0, 3)) {
      assert.ok(typeof sig.pattern === 'string', 'Signal should have pattern string');
      assert.ok(typeof sig.provider === 'string', 'Signal should have provider string');
    }
  });

  test('surfaceCompoundingFor returns empty array when KB is missing', () => {
    removeKB();
    clearCache();
    const signals = surfaceCompoundingFor({ title: 'AI PM', company: 'OpenAI' });
    assert.deepEqual(signals, []);
  });

  test('skill_compounding.patterns_in_use_now is non-empty in rich KB', () => {
    writeKB(RICH_KB);
    clearCache();
    const kb = loadKnowledgeBase();
    assert.ok(kb.skill_compounding.patterns_in_use_now.length > 0, 'Should have active compounding patterns');
  });
});

describe('llm-evidence: renderEvidenceCard', () => {
  afterEach(() => { clearCache(); removeKB(); });

  test('renderEvidenceCard returns empty string when contradicts=false', () => {
    const html = renderEvidenceCard({ contradicts: false, evidence_summary: '', draft_response: '', citations: [] });
    assert.equal(html, '');
  });

  test('renderEvidenceCard returns valid HTML when contradicts=true', () => {
    writeKB(RICH_KB);
    clearCache();
    const result = checkGap('Claude Code specific usage');
    const html = renderEvidenceCard(result);
    assert.ok(html.length > 0, 'Should return non-empty HTML');
    assert.ok(html.includes('evidence-card'), 'Should include evidence-card class');
    assert.ok(html.includes('contradicts'), 'Should include contradicts modifier class');
    // Must not contain raw < > from user data (XSS check)
    const evidenceInserted = result.evidence_summary;
    assert.ok(!html.includes('<script'), 'Should not contain script tags from user data');
  });

  test('renderEvidenceCard escapes HTML entities in evidence_summary', () => {
    const maliciousResult = {
      contradicts: true,
      evidence_summary: '<script>alert("xss")</script>',
      draft_response: 'safe response',
      citations: [],
      confidence: 'high',
    };
    const html = renderEvidenceCard(maliciousResult);
    assert.ok(!html.includes('<script>'), 'Script tags must be escaped');
    assert.ok(html.includes('&lt;script&gt;'), 'Should contain escaped version');
  });
});

describe('llm-evidence: getProviderSummary', () => {
  afterEach(() => { clearCache(); removeKB(); });

  test('getProviderSummary returns object with provider keys', () => {
    writeKB(RICH_KB);
    clearCache();
    const summary = getProviderSummary();
    assert.ok(typeof summary === 'object');
    assert.ok('claude_code' in summary, 'Should have claude_code key');
    assert.ok('anthropic_api' in summary, 'Should have anthropic_api key');
  });

  test('getProviderSummary returns empty object when KB missing', () => {
    removeKB();
    clearCache();
    const summary = getProviderSummary();
    assert.deepEqual(summary, {});
  });

  test('getProviderSummary claude_code shows high evidence_count from rich KB', () => {
    writeKB(RICH_KB);
    clearCache();
    const summary = getProviderSummary();
    assert.ok(summary.claude_code.evidence_count > 0, 'Claude Code should have positive evidence count');
    assert.ok(Array.isArray(summary.claude_code.top_use_cases), 'top_use_cases should be an array');
  });
});
