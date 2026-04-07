/**
 * Tests for docs-push — Google Docs push module.
 * Only tests pure functions; functions that call execFileSync are excluded.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatOutreachDoc, buildCreateArgs } from './docs-push.mjs';

describe('formatOutreachDoc', () => {
  it('includes company and role in title line', () => {
    const output = formatOutreachDoc({
      company: 'Acme Corp',
      role: 'Senior Engineer',
      hiringManager: 'Jane Smith',
      draft: 'Hi Jane, I am interested...',
    });
    assert.ok(output.includes('Acme Corp'));
    assert.ok(output.includes('Senior Engineer'));
  });

  it('includes To: line with hiring manager', () => {
    const output = formatOutreachDoc({
      company: 'Beta Inc',
      role: 'Staff Eng',
      hiringManager: 'John Doe',
      draft: 'Hello John...',
    });
    assert.ok(output.includes('To: John Doe'));
  });

  it('includes the draft text', () => {
    const draft = 'Dear Hiring Manager, this is my outreach message.';
    const output = formatOutreachDoc({
      company: 'Foo',
      role: 'Bar',
      hiringManager: 'Someone',
      draft,
    });
    assert.ok(output.includes(draft));
  });

  it('includes a separator line', () => {
    const output = formatOutreachDoc({
      company: 'X',
      role: 'Y',
      hiringManager: 'Z',
      draft: 'test',
    });
    assert.ok(output.includes('---'));
  });

  it('includes a generated date in the output', () => {
    const output = formatOutreachDoc({
      company: 'X',
      role: 'Y',
      hiringManager: 'Z',
      draft: 'test',
    });
    // Should contain a year (2025 or 2026 range)
    assert.ok(/20\d{2}/.test(output));
  });

  it('handles missing hiringManager gracefully', () => {
    const output = formatOutreachDoc({
      company: 'X',
      role: 'Y',
      hiringManager: '',
      draft: 'test',
    });
    assert.ok(typeof output === 'string');
    assert.ok(output.length > 0);
  });
});

describe('buildCreateArgs', () => {
  it('returns correct base args with folderId', () => {
    const args = buildCreateArgs('folder123', 'My Doc Title', 'Some content here');
    assert.equal(args[0], 'docs');
    assert.equal(args[1], '+write');
    assert.ok(args.includes('--title'));
    assert.equal(args[args.indexOf('--title') + 1], 'My Doc Title');
    assert.ok(args.includes('--content'));
    assert.equal(args[args.indexOf('--content') + 1], 'Some content here');
    assert.ok(args.includes('--parent'));
    assert.equal(args[args.indexOf('--parent') + 1], 'folder123');
  });

  it('omits --parent when folderId is falsy', () => {
    const args = buildCreateArgs('', 'Title', 'Content');
    assert.ok(!args.includes('--parent'));
  });

  it('omits --parent when folderId is null', () => {
    const args = buildCreateArgs(null, 'Title', 'Content');
    assert.ok(!args.includes('--parent'));
  });

  it('omits --parent when folderId is undefined', () => {
    const args = buildCreateArgs(undefined, 'Title', 'Content');
    assert.ok(!args.includes('--parent'));
  });

  it('always includes docs +write as first two args', () => {
    const args = buildCreateArgs(null, 'T', 'C');
    assert.equal(args[0], 'docs');
    assert.equal(args[1], '+write');
  });
});
