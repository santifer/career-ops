/**
 * Tests for sheets-pull — Google Sheets pull/reconcile module.
 * Only tests pure functions; functions that call execFileSync are excluded.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheetRow, detectManualEdits, reconcileRow } from './sheets-pull.mjs';

describe('parseSheetRow', () => {
  it('returns null when fewer than 8 cells', () => {
    assert.equal(parseSheetRow(['1', '2026-04-07', 'Acme', 'Eng']), null);
    assert.equal(parseSheetRow([]), null);
    assert.equal(parseSheetRow(['a', 'b', 'c', 'd', 'e', 'f', 'g']), null);
  });

  it('parses exactly 8 cells (no notes)', () => {
    const cells = ['1', '2026-04-07', 'Acme Corp', 'Senior Engineer', '4.5/5', 'Evaluated', '✅', '[1](reports/001.md)'];
    const result = parseSheetRow(cells);
    assert.deepEqual(result, {
      num: '1',
      date: '2026-04-07',
      company: 'Acme Corp',
      role: 'Senior Engineer',
      score: '4.5/5',
      status: 'Evaluated',
      pdf: '✅',
      report: '[1](reports/001.md)',
      notes: undefined,
    });
  });

  it('parses 9 cells (with notes)', () => {
    const cells = ['2', '2026-01-15', 'Beta Inc', 'Staff Eng', '3.8/5', 'Applied', '❌', '[2](reports/002.md)', 'Good fit'];
    const result = parseSheetRow(cells);
    assert.deepEqual(result, {
      num: '2',
      date: '2026-01-15',
      company: 'Beta Inc',
      role: 'Staff Eng',
      score: '3.8/5',
      status: 'Applied',
      pdf: '❌',
      report: '[2](reports/002.md)',
      notes: 'Good fit',
    });
  });

  it('returns null for undefined input', () => {
    assert.equal(parseSheetRow(undefined), null);
  });

  it('returns null for null input', () => {
    assert.equal(parseSheetRow(null), null);
  });

  it('passes through extra cells beyond index 8 (only first 9 used)', () => {
    const cells = ['3', '2026-02-01', 'Corp', 'Dev', '5.0/5', 'Offer', '✅', '[3](r.md)', 'Top choice', 'extra', 'ignored'];
    const result = parseSheetRow(cells);
    assert.equal(result.notes, 'Top choice');
    assert.equal(result.num, '3');
  });
});

describe('detectManualEdits', () => {
  const sheetRows = [
    { num: '1', status: 'Interview', notes: 'Called me back' },
    { num: '2', status: 'Evaluated', notes: 'Good match' },
    { num: '3', status: 'Applied', notes: '' },
  ];

  const trackerRows = [
    { num: '1', status: 'Evaluated', notes: '' },
    { num: '2', status: 'Evaluated', notes: 'Good match' },
    { num: '3', status: 'Applied', notes: '' },
  ];

  it('detects changed status', () => {
    const edits = detectManualEdits(sheetRows, trackerRows);
    const edit1 = edits.find(e => e.num === '1');
    assert.ok(edit1);
    assert.equal(edit1.newStatus, 'Interview');
  });

  it('detects changed notes', () => {
    const edits = detectManualEdits(sheetRows, trackerRows);
    const edit1 = edits.find(e => e.num === '1');
    assert.ok(edit1);
    assert.equal(edit1.newNotes, 'Called me back');
  });

  it('does not flag unchanged rows', () => {
    const edits = detectManualEdits(sheetRows, trackerRows);
    assert.ok(!edits.find(e => e.num === '2'));
    assert.ok(!edits.find(e => e.num === '3'));
  });

  it('returns empty array when no edits', () => {
    const edits = detectManualEdits(trackerRows, trackerRows);
    assert.deepEqual(edits, []);
  });

  it('ignores sheet rows with no matching tracker row', () => {
    const sheetWithExtra = [...sheetRows, { num: '99', status: 'Offer', notes: 'Surprise' }];
    const edits = detectManualEdits(sheetWithExtra, trackerRows);
    assert.ok(!edits.find(e => e.num === '99'));
  });

  it('returns array of objects with num, newStatus, newNotes', () => {
    const edits = detectManualEdits(sheetRows, trackerRows);
    for (const edit of edits) {
      assert.ok('num' in edit);
      assert.ok('newStatus' in edit);
      assert.ok('newNotes' in edit);
    }
  });

  it('detects only notes change when status is same', () => {
    const sheetOnlyNotes = [{ num: '2', status: 'Evaluated', notes: 'Updated notes' }];
    const trackerOnlyNotes = [{ num: '2', status: 'Evaluated', notes: 'Good match' }];
    const edits = detectManualEdits(sheetOnlyNotes, trackerOnlyNotes);
    assert.equal(edits.length, 1);
    assert.equal(edits[0].num, '2');
    assert.equal(edits[0].newNotes, 'Updated notes');
  });
});

describe('reconcileRow', () => {
  const trackerRow = {
    num: '1',
    date: '2026-04-07',
    company: 'Acme Corp',
    role: 'Senior Engineer',
    score: '4.5/5',
    status: 'Evaluated',
    pdf: '✅',
    report: '[1](reports/001.md)',
    notes: '',
  };

  it('overrides status from edit', () => {
    const edit = { num: '1', newStatus: 'Interview', newNotes: 'Called me' };
    const result = reconcileRow(trackerRow, edit);
    assert.equal(result.status, 'Interview');
  });

  it('overrides notes from edit', () => {
    const edit = { num: '1', newStatus: 'Interview', newNotes: 'Called me' };
    const result = reconcileRow(trackerRow, edit);
    assert.equal(result.notes, 'Called me');
  });

  it('preserves other fields from trackerRow', () => {
    const edit = { num: '1', newStatus: 'Interview', newNotes: 'Called me' };
    const result = reconcileRow(trackerRow, edit);
    assert.equal(result.num, '1');
    assert.equal(result.company, 'Acme Corp');
    assert.equal(result.score, '4.5/5');
    assert.equal(result.pdf, '✅');
  });

  it('uses trackerRow status as fallback when edit newStatus is undefined', () => {
    const edit = { num: '1', newStatus: undefined, newNotes: 'New note' };
    const result = reconcileRow(trackerRow, edit);
    assert.equal(result.status, 'Evaluated');
  });

  it('uses trackerRow notes as fallback when edit newNotes is undefined', () => {
    const edit = { num: '1', newStatus: 'Applied', newNotes: undefined };
    const result = reconcileRow(trackerRow, edit);
    assert.equal(result.notes, '');
  });

  it('does not mutate original trackerRow', () => {
    const edit = { num: '1', newStatus: 'Offer', newNotes: 'Great offer' };
    reconcileRow(trackerRow, edit);
    assert.equal(trackerRow.status, 'Evaluated');
    assert.equal(trackerRow.notes, '');
  });
});
