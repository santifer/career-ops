/**
 * Unit tests for lib/export-core.mjs — CSV/JSON serialization.
 * Run with: npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { csvEscape, toCsv, toJson, EXPORT_FIELDS } from '../lib/export-core.mjs';

const sampleRows = [
  {
    num: 1, date: '2025-01-02', company: 'Acme', role: 'Senior Engineer',
    score: '4.25/5', status: 'Aplicado', pdf: 'cv.pdf', report: 'r1.md',
    notes: 'strong match', raw: '| ... |',
  },
  {
    num: 2, date: '2025-01-03', company: 'Foo, Inc.', role: 'Dev "II"',
    score: 'N/A', status: 'Evaluada', pdf: '', report: '',
    notes: 'line1\nline2', raw: '| ... |',
  },
];

test('csvEscape: plain values pass through', () => {
  assert.equal(csvEscape('Acme'), 'Acme');
  assert.equal(csvEscape(42), '42');
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
});

test('csvEscape: quotes values containing comma, quote, or newline', () => {
  assert.equal(csvEscape('Foo, Inc.'), '"Foo, Inc."');
  assert.equal(csvEscape('Dev "II"'), '"Dev ""II"""');
  assert.equal(csvEscape('a\nb'), '"a\nb"');
});

test('toCsv: emits a header row with friendly labels', () => {
  const csv = toCsv([]);
  assert.equal(csv, '#,Date,Company,Role,Score,Status,PDF,Report,Notes\r\n');
});

test('toCsv: serializes rows with correct escaping and CRLF', () => {
  const csv = toCsv(sampleRows);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], '#,Date,Company,Role,Score,Status,PDF,Report,Notes');
  assert.equal(lines[1], '1,2025-01-02,Acme,Senior Engineer,4.25/5,Aplicado,cv.pdf,r1.md,strong match');
  // Row 2 has comma, embedded quotes, and a newline → all quoted.
  assert.ok(lines[2].includes('"Foo, Inc."'));
  assert.ok(lines[2].includes('"Dev ""II"""'));
  assert.ok(csv.includes('"line1\nline2"'));
});

test('toJson: drops raw and keeps only export fields', () => {
  const parsed = JSON.parse(toJson(sampleRows));
  assert.equal(parsed.length, 2);
  assert.deepEqual(Object.keys(parsed[0]), EXPORT_FIELDS);
  assert.equal(parsed[0].company, 'Acme');
  assert.equal(parsed[1].notes, 'line1\nline2');
  assert.ok(!('raw' in parsed[0]));
});

test('toJson: missing fields default to empty string', () => {
  const parsed = JSON.parse(toJson([{ num: 9 }]));
  assert.equal(parsed[0].num, 9);
  assert.equal(parsed[0].company, '');
  assert.equal(parsed[0].notes, '');
});
