/**
 * Tests for calendar-push — Google Calendar push module.
 * Only tests pure functions; functions that call execFileSync are excluded.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatEventDescription, buildInsertArgs } from './calendar-push.mjs';

describe('formatEventDescription', () => {
  it('includes company and role', () => {
    const desc = formatEventDescription({
      company: 'Acme Corp',
      role: 'Senior Engineer',
      score: '4.5/5',
      reportLink: 'reports/001.md',
      notes: 'Great fit',
    });
    assert.ok(desc.includes('Acme Corp'));
    assert.ok(desc.includes('Senior Engineer'));
  });

  it('includes score', () => {
    const desc = formatEventDescription({
      company: 'X',
      role: 'Y',
      score: '3.8/5',
      reportLink: '',
      notes: '',
    });
    assert.ok(desc.includes('3.8/5'));
  });

  it('includes report link when provided', () => {
    const desc = formatEventDescription({
      company: 'X',
      role: 'Y',
      score: '4.0/5',
      reportLink: 'reports/042-x-2026-04-07.md',
      notes: '',
    });
    assert.ok(desc.includes('reports/042-x-2026-04-07.md'));
  });

  it('includes notes when provided', () => {
    const desc = formatEventDescription({
      company: 'X',
      role: 'Y',
      score: '4.0/5',
      reportLink: '',
      notes: 'Ask about remote policy',
    });
    assert.ok(desc.includes('Ask about remote policy'));
  });

  it('returns a multi-line string', () => {
    const desc = formatEventDescription({
      company: 'X',
      role: 'Y',
      score: '4.0/5',
      reportLink: 'r.md',
      notes: 'n',
    });
    assert.ok(desc.includes('\n'));
  });

  it('handles empty optional fields gracefully', () => {
    const desc = formatEventDescription({
      company: 'X',
      role: 'Y',
      score: '',
      reportLink: '',
      notes: '',
    });
    assert.ok(typeof desc === 'string');
    assert.ok(desc.length > 0);
  });
});

describe('buildInsertArgs', () => {
  it('returns correct base args', () => {
    const args = buildInsertArgs({
      title: 'Interview: Acme - Senior Eng',
      start: '2026-04-10T14:00:00',
      end: '2026-04-10T15:00:00',
      description: 'Some desc',
      location: 'Remote',
    });
    assert.equal(args[0], 'calendar');
    assert.equal(args[1], '+insert');
    assert.ok(args.includes('--title'));
    assert.equal(args[args.indexOf('--title') + 1], 'Interview: Acme - Senior Eng');
    assert.ok(args.includes('--start'));
    assert.equal(args[args.indexOf('--start') + 1], '2026-04-10T14:00:00');
  });

  it('includes --end when provided', () => {
    const args = buildInsertArgs({
      title: 'T',
      start: '2026-04-10T10:00:00',
      end: '2026-04-10T11:00:00',
      description: '',
      location: '',
    });
    assert.ok(args.includes('--end'));
    assert.equal(args[args.indexOf('--end') + 1], '2026-04-10T11:00:00');
  });

  it('omits --end when not provided', () => {
    const args = buildInsertArgs({
      title: 'T',
      start: '2026-04-10T10:00:00',
    });
    assert.ok(!args.includes('--end'));
  });

  it('includes --description when provided', () => {
    const args = buildInsertArgs({
      title: 'T',
      start: '2026-04-10T10:00:00',
      description: 'My description',
    });
    assert.ok(args.includes('--description'));
    assert.equal(args[args.indexOf('--description') + 1], 'My description');
  });

  it('omits --description when falsy', () => {
    const args = buildInsertArgs({ title: 'T', start: 's', description: '' });
    assert.ok(!args.includes('--description'));
  });

  it('includes --location when provided', () => {
    const args = buildInsertArgs({
      title: 'T',
      start: 's',
      location: 'Remote',
    });
    assert.ok(args.includes('--location'));
    assert.equal(args[args.indexOf('--location') + 1], 'Remote');
  });

  it('omits --location when falsy', () => {
    const args = buildInsertArgs({ title: 'T', start: 's', location: null });
    assert.ok(!args.includes('--location'));
  });

  it('always has calendar +insert as first two args', () => {
    const args = buildInsertArgs({ title: 'T', start: 's' });
    assert.equal(args[0], 'calendar');
    assert.equal(args[1], '+insert');
  });
});
