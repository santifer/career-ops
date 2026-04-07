/**
 * Tests for sheets-push — Google Sheets push module.
 * Only tests pure functions; functions that call execFileSync are excluded.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrackerRow, buildAppendArgs, buildUpdateArgs } from './sheets-push.mjs';

describe('parseTrackerRow', () => {
  it('returns null for header row', () => {
    const result = parseTrackerRow('| # | Date | Company | Role | Score | Status | PDF | Report | Notes |');
    assert.equal(result, null);
  });

  it('returns null for separator row', () => {
    const result = parseTrackerRow('|---|------|---------|------|-------|--------|-----|--------|-------|');
    assert.equal(result, null);
  });

  it('returns null for empty string', () => {
    assert.equal(parseTrackerRow(''), null);
  });

  it('returns null for whitespace-only string', () => {
    assert.equal(parseTrackerRow('   '), null);
  });

  it('parses a valid data row', () => {
    const line = '| 1 | 2026-04-07 | Acme Corp | Senior Engineer | 4.5/5 | Evaluated | ✅ | [1](reports/001-acme-2026-04-07.md) | Great fit |';
    const result = parseTrackerRow(line);
    assert.deepEqual(result, {
      num: '1',
      date: '2026-04-07',
      company: 'Acme Corp',
      role: 'Senior Engineer',
      score: '4.5/5',
      status: 'Evaluated',
      pdf: '✅',
      report: '[1](reports/001-acme-2026-04-07.md)',
      notes: 'Great fit',
    });
  });

  it('trims whitespace from each field', () => {
    const line = '|  2  |  2026-01-15  |  Beta Inc  |  Staff Eng  |  3.8/5  |  Applied  |  ❌  |  [2](reports/002.md)  |  Some notes  |';
    const result = parseTrackerRow(line);
    assert.equal(result.num, '2');
    assert.equal(result.company, 'Beta Inc');
    assert.equal(result.notes, 'Some notes');
  });

  it('returns null for a non-pipe line', () => {
    assert.equal(parseTrackerRow('# Applications Tracker'), null);
  });

  it('returns null for a separator with colons', () => {
    assert.equal(parseTrackerRow('|:---|:---:|---:|'), null);
  });
});

describe('buildAppendArgs', () => {
  it('returns the correct gws args array', () => {
    const row = {
      num: '1',
      date: '2026-04-07',
      company: 'Acme Corp',
      role: 'Senior Engineer',
      score: '4.5/5',
      status: 'Evaluated',
      pdf: '✅',
      report: '[1](reports/001.md)',
      notes: 'Great fit',
    };
    const args = buildAppendArgs('sheet123', row);
    assert.equal(args[0], 'sheets');
    assert.equal(args[1], '+append');
    assert.equal(args[args.indexOf('--spreadsheet') + 1], 'sheet123');
    assert.equal(args[args.indexOf('--range') + 1], 'A:I');
    const valuesIdx = args.indexOf('--values');
    assert.ok(valuesIdx !== -1);
    const values = args[valuesIdx + 1];
    assert.ok(values.includes('Acme Corp'));
    assert.ok(values.includes('4.5/5'));
    assert.ok(values.includes('Evaluated'));
  });

  it('joins values with commas', () => {
    const row = {
      num: '42',
      date: '2026-01-01',
      company: 'Foo',
      role: 'Bar',
      score: '5.0/5',
      status: 'Applied',
      pdf: '❌',
      report: '[42](reports/042.md)',
      notes: 'n/a',
    };
    const args = buildAppendArgs('sid', row);
    const values = args[args.indexOf('--values') + 1];
    assert.ok(values.split(',').length === 9);
  });
});

describe('buildUpdateArgs', () => {
  it('returns the correct gws args array for update', () => {
    const args = buildUpdateArgs('sheetABC', 'F5', 'Interview');
    assert.equal(args[0], 'sheets');
    assert.equal(args[1], '+update');
    assert.equal(args[args.indexOf('--spreadsheet') + 1], 'sheetABC');
    assert.equal(args[args.indexOf('--range') + 1], 'F5');
    assert.equal(args[args.indexOf('--values') + 1], 'Interview');
  });

  it('uses the provided range exactly', () => {
    const args = buildUpdateArgs('sid', 'G10', 'Rejected');
    assert.equal(args[args.indexOf('--range') + 1], 'G10');
    assert.equal(args[args.indexOf('--values') + 1], 'Rejected');
  });
});
