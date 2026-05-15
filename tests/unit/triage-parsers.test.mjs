import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePipeline, parseTriageOutput } from '../../triage.mjs';

test('parsePipeline picks up items before first tier header (regression for T43)', () => {
  // pipeline.md without explicit "## Tier 1" preamble — items appear at tier 0,
  // which previously caused them to be skipped entirely.
  const content = [
    '# Pipeline',
    '',
    '- [ ] https://example.com/job-1',
    '- [ ] https://example.com/job-2',
    '',
    '## Tier 2',
    '- [ ] https://example.com/job-3',
  ].join('\n');

  const items = parsePipeline(content);
  assert.equal(items.length, 3);
  assert.equal(items[0].url, 'https://example.com/job-1');
  assert.equal(items[0].tier, 0); // tier defaults to 0 before first header
  assert.equal(items[2].tier, 2);
});

test('parsePipeline assigns tier per section header', () => {
  const content = [
    '## Tier 1 (Anthropic / OpenAI)',
    '- [ ] https://example.com/a',
    '## Tier 2 (other AI labs)',
    '- [ ] https://example.com/b',
    '## Tier 3 (industry adjacent)',
    '- [ ] https://example.com/c',
  ].join('\n');

  const items = parsePipeline(content);
  assert.deepEqual(items.map((i) => i.tier), [1, 2, 3]);
});

test('parsePipeline ignores checked items', () => {
  const content = [
    '- [x] https://example.com/done',
    '- [ ] https://example.com/pending',
  ].join('\n');

  const items = parsePipeline(content);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://example.com/pending');
});

test('parseTriageOutput accepts valid JSON', () => {
  const raw = '{"score": 4.2, "archetype": "A2", "decision": "ADVANCE", "reason": "fits"}';
  const out = parseTriageOutput(raw);
  assert.equal(out.score, 4.2);
  assert.equal(out.archetype, 'A2');
  assert.equal(out.decision, 'ADVANCE');
  assert.equal(out.reason, 'fits');
});

test('parseTriageOutput tolerates code-fence prefix', () => {
  const raw = '```json\n{"score": 3.5, "archetype": "B", "decision": "SKIP", "reason": "off-shape"}\n```';
  const out = parseTriageOutput(raw);
  assert.equal(out.score, 3.5);
  assert.equal(out.decision, 'SKIP');
});

test('parseTriageOutput rejects invalid score', () => {
  const raw = '{"score": 7.0, "archetype": "A2", "decision": "ADVANCE", "reason": "x"}';
  const out = parseTriageOutput(raw);
  assert.ok(out.error, 'should flag out-of-range score');
});

test('parseTriageOutput rejects invalid archetype', () => {
  const raw = '{"score": 4.0, "archetype": "Z", "decision": "ADVANCE", "reason": "x"}';
  const out = parseTriageOutput(raw);
  assert.ok(out.error, 'should flag invalid archetype');
});

test('parseTriageOutput rejects non-JSON', () => {
  const out = parseTriageOutput('this is not json');
  assert.ok(out.error);
});

test('parseTriageOutput handles empty input', () => {
  const out = parseTriageOutput('');
  assert.ok(out.error);
});
