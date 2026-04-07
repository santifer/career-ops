/**
 * Phase 2 Integration Tests
 *
 * End-to-end tests validating all Phase 2 modules work together:
 * Infrastructure → strategy → pipeline → self-improvement chain.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Infrastructure
import { acquireLock, releaseLock } from './lock.mjs';
import { BudgetTracker } from './budget.mjs';
import { dedup, normalizeCompany, normalizeTitle } from './dedup.mjs';

// Strategy + Eval + Exemplars
import {
  parseLedger,
  addCalibrationEntry,
  serializeLedger,
} from './self-improve/strategy-engine.mjs';
import {
  buildTestSet,
  scoreEvaluation,
  CRITERIA,
} from './self-improve/eval-loop.mjs';
import {
  loadExemplars,
  addExemplar,
  saveExemplars,
  getBestExemplars,
} from './self-improve/exemplar-manager.mjs';

// Pipelines
import {
  detectEmailPattern,
  generateEmail,
  scoreEmailConfidence,
  PATTERNS,
} from './pipelines/email-inference.mjs';
import {
  parseProspects,
  expireProspects,
  serializeProspects,
} from './pipelines/prospect-lifecycle.mjs';

// Gemma Runner
import {
  buildOllamaUrl,
  buildRequestBody,
  parseOllamaResponse,
} from './self-improve/gemma-runner.mjs';

// Schema + PII
import { extractSchemaVersion, checkCompatibility } from './schema-version.mjs';
import { findPIITags, isOlderThan } from './purge-pii.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'p2-integration-'));
});

after(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Phase 2 Integration: Infrastructure
// ---------------------------------------------------------------------------

describe('Phase 2 Integration: Infrastructure', () => {
  it('lock + budget + dedup work together', () => {
    const lockPath = join(tmpDir, 'infra.lock');
    const usagePath = join(tmpDir, 'infra-usage.json');

    // 1. Acquire lock
    const acquired = acquireLock(lockPath);
    assert.equal(acquired, true, 'should acquire lock');

    // Second acquire should fail (lock held)
    const second = acquireLock(lockPath);
    assert.equal(second, false, 'should not acquire lock while held');

    // Release
    releaseLock(lockPath);

    // 2. Create BudgetTracker and perform reserve+commit
    const tracker = new BudgetTracker(usagePath, lockPath, {
      ollama: 5.0,
      gemini: 10.0,
    });

    const reserved = tracker.reserveBudget('ollama', 1.5);
    assert.equal(reserved, true, 'should reserve budget');
    assert.equal(tracker.getRemaining('ollama'), 3.5);

    tracker.commitBudget('ollama', 1.2);
    // After commit: spent=1.2, reserved back to 0 → remaining = 5.0 - 1.2 = 3.8
    assert.equal(tracker.getRemaining('ollama'), 3.8);

    // 3. Dedup some items
    const items = [
      { company: 'Acme Inc', title: 'Senior Engineer', url: 'https://acme.com/jobs/1' },
      { company: 'Acme', title: 'Engineer', url: 'https://acme.com/jobs/2' },
      { company: 'Acme Inc.', title: 'Senior Engineer', url: 'https://acme.com/jobs/3' },
      { company: 'Beta Corp', title: 'PM', url: 'https://beta.com/jobs/1' },
    ];

    const unique = dedup(items);
    // Acme Inc Senior Engineer and Acme Inc. Senior Engineer normalize the same
    assert.ok(unique.length < items.length, 'dedup should remove duplicates');
    assert.ok(unique.length >= 2, 'should keep at least Acme + Beta entries');

    // Verify remaining budget is still consistent after all operations
    const status = tracker.getStatus('ollama');
    assert.equal(status.warning, false, 'should not be at warning threshold');
    assert.ok(status.remaining > 0, 'should have remaining budget');
  });
});

// ---------------------------------------------------------------------------
// Phase 2 Integration: Strategy → Eval Loop → Exemplars
// ---------------------------------------------------------------------------

describe('Phase 2 Integration: Strategy → Eval Loop → Exemplars', () => {
  it('parse empty ledger, add calibration, build test set, score, exemplars round-trip', async () => {
    // 1. Parse empty ledger
    const ledger = parseLedger('');
    assert.deepEqual(ledger.guidingPrinciples, []);
    assert.deepEqual(ledger.calibrationLog, []);

    // 2. Add calibration entry
    const entry = {
      date: '2026-04-01',
      company: 'NovaTech',
      role: 'Head of AI',
      score: '4.2',
      action: 'Applied',
      delta: '+0.3',
      lesson: 'Strong proof-point match on AI ops',
    };
    addCalibrationEntry(ledger, entry);
    assert.equal(ledger.calibrationLog.length, 1);

    // 3. Build test set from calibration
    const testSet = buildTestSet(ledger.calibrationLog);
    assert.equal(testSet.length, 1);
    assert.equal(testSet[0].company, 'NovaTech');
    assert.equal(testSet[0].expectedAction, 'Applied');

    // 4. Score a perfect evaluation
    const result = scoreEvaluation({
      score: 4.2,
      expectedScore: 4.2,
      dealBreakersFound: true,
      proofPointsCited: true,
      actionMatched: true,
      archetypeCorrect: true,
      signalsReflected: true,
    });
    assert.equal(result.passed, CRITERIA.length);
    assert.equal(result.passRate, 1.0);
    assert.deepEqual(result.failures, []);

    // 5. Add to exemplars
    const exemplarDir = join(tmpDir, 'exemplars');
    let exemplars = await loadExemplars(exemplarDir);
    assert.deepEqual(exemplars.highFit, []);

    exemplars = addExemplar(exemplars, 'highFit', {
      company: 'NovaTech',
      role: 'Head of AI',
      score: 4.2,
      jdSummary: 'AI leadership role focused on ops',
    });
    assert.equal(exemplars.highFit.length, 1);

    // 6. Save + reload exemplars
    await saveExemplars(exemplars, exemplarDir);
    const reloaded = await loadExemplars(exemplarDir);
    assert.equal(reloaded.highFit.length, 1);
    assert.equal(reloaded.highFit[0].company, 'NovaTech');

    // Retrieve by keyword
    const best = getBestExemplars(reloaded, 'AI', 3);
    assert.ok(best.length >= 1);
    assert.equal(best[0].company, 'NovaTech');

    // 7. Round-trip ledger serialization
    const serialized = serializeLedger(ledger);
    const reparsed = parseLedger(serialized);
    assert.equal(reparsed.calibrationLog.length, 1);
    assert.equal(reparsed.calibrationLog[0].company, 'NovaTech');
  });
});

// ---------------------------------------------------------------------------
// Phase 2 Integration: Email Inference + Prospect Lifecycle
// ---------------------------------------------------------------------------

describe('Phase 2 Integration: Email Inference + Prospect Lifecycle', () => {
  it('detect pattern, generate email, score confidence, prospect lifecycle', () => {
    // 1. Detect email pattern
    const pattern = detectEmailPattern(['john.doe@acme.com', 'jane.smith@acme.com']);
    assert.equal(pattern, PATTERNS.FIRST_DOT_LAST);

    // 2. Generate email
    const email = generateEmail('Alice', 'Johnson', 'acme.com', pattern);
    assert.equal(email, 'alice.johnson@acme.com');

    // 3. Score confidence
    const confidence = scoreEmailConfidence({
      patternSource: 'team_page',
      nameCommonality: 'unique',
      patternConfirmed: true,
    });
    assert.equal(confidence, 'HIGH');

    // 4. Parse prospects markdown
    const md = `# Prospects

## New

| # | Found | Company | Role | Why | Angle | Source | URL |
|---|-------|---------|------|-----|-------|--------|-----|
| 1 | 2026-03-20 | Acme | Engineer | Good fit | Direct | LinkedIn | https://acme.com/j/1 |
| 2 | 2026-01-15 | Beta | PM | Culture | Referral | Indeed | https://beta.com/j/2 |

## Reviewed

| # | Found | Company | Role | Why | Angle | Source | URL |
|---|-------|---------|------|-----|-------|--------|-----|

## Dismissed

| # | Found | Company | Role | Why | Angle | Source | URL |
|---|-------|---------|------|-----|-------|--------|-----|

## Expired

| # | Found | Company | Role | Why | Angle | Source | URL |
|---|-------|---------|------|-----|-------|--------|-----|
`;

    const sections = parseProspects(md);
    assert.equal(sections.New.length, 2);
    assert.equal(sections.Expired.length, 0);

    // 5. Expire old prospects (use a "now" that makes the Jan entry old)
    const now = new Date('2026-04-06');
    const expired = expireProspects(sections, 30, now);
    // Jan 15 is >30 days before Apr 6
    assert.equal(expired.New.length, 1);
    assert.equal(expired.Expired.length, 1);
    assert.equal(expired.Expired[0].company, 'Beta');

    // 6. Verify serialization round-trip
    const serialized = serializeProspects(expired);
    const reparsed = parseProspects(serialized);
    assert.equal(reparsed.New.length, 1);
    assert.equal(reparsed.Expired.length, 1);
    assert.equal(reparsed.New[0].company, 'Acme');
  });
});

// ---------------------------------------------------------------------------
// Phase 2 Integration: Gemma Runner
// ---------------------------------------------------------------------------

describe('Phase 2 Integration: Gemma Runner', () => {
  it('build valid Ollama URL, request body, parse response', () => {
    // 1. Build URL
    const url = buildOllamaUrl('http://192.168.1.100:11434', '/api/generate');
    assert.equal(url, 'http://192.168.1.100:11434/api/generate');

    // Trailing slash stripped
    const url2 = buildOllamaUrl('http://host:11434/', '/api/generate');
    assert.equal(url2, 'http://host:11434/api/generate');

    // 2. Request body with system prompt + temperature
    const body = buildRequestBody('gemma4-opus-distill:q8_0', 'Evaluate this JD', {
      system: 'You are an evaluation assistant.',
      temperature: 0.3,
    });
    assert.equal(body.model, 'gemma4-opus-distill:q8_0');
    assert.equal(body.prompt, 'Evaluate this JD');
    assert.equal(body.system, 'You are an evaluation assistant.');
    assert.equal(body.options.temperature, 0.3);
    assert.equal(body.stream, false);

    // 3. Parse response
    const parsed = parseOllamaResponse({ response: 'Score: 4.2/5' });
    assert.equal(parsed, 'Score: 4.2/5');

    // Edge cases
    assert.equal(parseOllamaResponse(null), '');
    assert.equal(parseOllamaResponse({}), '');
    assert.equal(parseOllamaResponse({ response: '' }), '');
  });
});

// ---------------------------------------------------------------------------
// Phase 2 Integration: Schema + PII
// ---------------------------------------------------------------------------

describe('Phase 2 Integration: Schema + PII', () => {
  it('extract schema version, check compatibility, find PII tags, check age', () => {
    // 1. Extract schema version
    const md = '<!-- SCHEMA_VERSION: 3 -->\n# Prospects\n\nSome content here.';
    const version = extractSchemaVersion(md);
    assert.equal(version, 3);

    // Missing version
    assert.equal(extractSchemaVersion('# No version'), null);

    // 2. Check compatibility
    const compat = checkCompatibility(3, 3);
    assert.equal(compat.compatible, true);

    const incompat = checkCompatibility(2, 3);
    assert.equal(incompat.compatible, false);
    assert.ok(incompat.message.includes('v2'));
    assert.ok(incompat.message.includes('v3'));

    // null treated as v1
    const nullCompat = checkCompatibility(null, 1);
    assert.equal(nullCompat.compatible, true);

    // 3. Find PII tags
    const piiMd = `
Some content
<!-- PII: John Doe, LinkedIn, 2026-01-15 -->
Contact: john@example.com
<!-- END PII -->
More content
<!-- PII: Jane Smith, Referral, 2026-03-20 -->
Phone: 555-0123
<!-- END PII -->
`;
    const tags = findPIITags(piiMd);
    assert.equal(tags.length, 2);
    assert.equal(tags[0].name, 'John Doe');
    assert.equal(tags[0].source, 'LinkedIn');
    assert.equal(tags[0].date, '2026-01-15');
    assert.equal(tags[1].name, 'Jane Smith');

    // 4. Check age
    const now = new Date('2026-04-06');
    assert.equal(isOlderThan('2026-01-15', 60, now), true, 'Jan 15 is >60 days before Apr 6');
    assert.equal(isOlderThan('2026-03-20', 60, now), false, 'Mar 20 is <60 days before Apr 6');
    assert.equal(isOlderThan('2026-04-01', 30, now), false, 'Apr 1 is <30 days before Apr 6');
  });
});
