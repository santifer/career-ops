/**
 * cl-matching.test.mjs — Tests for index-based CL matching in auto-submit
 *
 * Run: node --test test/cl-matching.test.mjs
 *
 * Tests findCoverLetterForCard, loadClIndex, extractRoleFamily, slugifyCompany.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import path   from 'node:path';
import os     from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

import {
  slugifyCompany,
  extractRoleFamily,
  loadClIndex,
  findCoverLetterForCard,
} from '../scripts/auto-submit.mjs';

// ── Minimal index fixture ─────────────────────────────────────────────────────

const SAMPLE_INDEX = {
  templates: [
    { file: 'stripe.md',   company: 'stripe',   roles: ['scrum master', 'senior scrum master', 'agile coach'], tier: 'f500',    source: 'bulk-export-2026-04-29' },
    { file: 'defcon.md',   company: 'defcon',   roles: ['scrum master', 'senior scrum master', 'agile coach'], tier: 'unknown', source: 'bulk-export-2026-04-29' },
    { file: 'tala.md',     company: 'tala',     roles: ['technical program manager', 'tpm', 'program manager'], tier: 'unknown', source: 'bulk-export-2026-04-29' },
    { file: 'pinterest.md',company: 'pinterest', roles: ['technical program manager', 'tpm', 'program manager'], tier: 'f500',    source: 'bulk-export-2026-04-29' },
    { file: 'samsara.md',  company: 'samsara',  roles: ['program manager', 'technical pm', 'senior pm'],       tier: 'f500',    source: 'bulk-export-2026-04-29' },
  ],
};

// ── slugifyCompany ────────────────────────────────────────────────────────────

describe('slugifyCompany', () => {

  test('lowercase and hyphenate spaces', () => {
    assert.equal(slugifyCompany('Equal Experts'), 'equal-experts');
  });

  test('strips parens and degree symbol', () => {
    assert.equal(slugifyCompany('84.51°'), '84-51');
  });

  test('collapses multiple separators', () => {
    assert.equal(slugifyCompany('aPriori Technologies'), 'apriori-technologies');
  });

  test('empty/null input returns empty string', () => {
    assert.equal(slugifyCompany(''), '');
    assert.equal(slugifyCompany(null), '');
  });

});

// ── extractRoleFamily ─────────────────────────────────────────────────────────

describe('extractRoleFamily', () => {

  test('scrum master in title → includes "scrum master"', () => {
    const families = extractRoleFamily('Senior Scrum Master');
    assert.ok(families.includes('scrum master'));
  });

  test('program manager in title → includes "program manager"', () => {
    const families = extractRoleFamily('Senior Program Manager');
    assert.ok(families.includes('program manager'));
  });

  test('technical program manager → includes "technical program manager"', () => {
    const families = extractRoleFamily('Staff Technical Program Manager');
    assert.ok(families.includes('technical program manager'));
  });

  test('delivery manager → includes "agile coach"', () => {
    const families = extractRoleFamily('Agile Delivery Manager');
    assert.ok(families.includes('agile coach'));
  });

  test('unknown role returns empty array', () => {
    const families = extractRoleFamily('Chief Happiness Officer');
    assert.deepEqual(families, []);
  });

});

// ── findCoverLetterForCard ────────────────────────────────────────────────────

describe('findCoverLetterForCard — exact company match', () => {

  test('exact match on company slug returns correct file', () => {
    const card = { company: 'Stripe', role: 'Senior Scrum Master' };
    const result = findCoverLetterForCard(card, SAMPLE_INDEX);
    assert.ok(result, 'should return a path');
    assert.ok(result.endsWith('stripe.md'), `expected stripe.md, got ${result}`);
  });

  test('exact match is case-insensitive (company field)', () => {
    const card = { company: 'DEFCON', role: 'Something Unrelated' };
    const result = findCoverLetterForCard(card, SAMPLE_INDEX);
    assert.ok(result?.endsWith('defcon.md'), `expected defcon.md, got ${result}`);
  });

  test('exact match with special chars in company name', () => {
    const index = { templates: [{ file: '84-51.md', company: '84-51', roles: ['agile coach'], tier: 'unknown' }] };
    const card  = { company: '84.51°', role: 'Director' };
    const result = findCoverLetterForCard(card, index);
    assert.ok(result?.endsWith('84-51.md'), `expected 84-51.md, got ${result}`);
  });

});

describe('findCoverLetterForCard — role family match', () => {

  test('no exact company → role family fallback', () => {
    // "Anthropic" has no exact match in SAMPLE_INDEX
    const card   = { company: 'Anthropic', role: 'Senior Scrum Master' };
    const result = findCoverLetterForCard(card, SAMPLE_INDEX);
    // Should find stripe.md or defcon.md (both have scrum master)
    assert.ok(result, 'should find a CL via role family');
    assert.ok(result.includes('.md'), 'result should be a .md path');
  });

  test('program manager role → finds PM template', () => {
    const card   = { company: 'SomeCompany', role: 'Senior Program Manager' };
    const result = findCoverLetterForCard(card, SAMPLE_INDEX);
    assert.ok(result, 'should find a PM CL');
    assert.ok(
      result.includes('tala') || result.includes('pinterest') || result.includes('samsara'),
      `expected a PM-family CL, got ${result}`,
    );
  });

  test('TPM role → finds TPM template', () => {
    const card   = { company: 'UnknownCo', role: 'Technical Program Manager' };
    const result = findCoverLetterForCard(card, SAMPLE_INDEX);
    assert.ok(result, 'should find a TPM CL');
    assert.ok(
      result.includes('tala') || result.includes('pinterest'),
      `expected a TPM-family CL, got ${result}`,
    );
  });

});

describe('findCoverLetterForCard — tier fallback', () => {

  test('F500 tier fallback when no exact or role match', () => {
    const card  = { company: 'RandomF500Co', role: 'Chief Happiness Officer', tier: 'f500' };
    const result = findCoverLetterForCard(card, SAMPLE_INDEX);
    assert.ok(result, 'F500 tier fallback should return a CL');
    // Should be any f500 template (stripe, pinterest, or samsara)
    assert.ok(
      result.includes('stripe') || result.includes('pinterest') || result.includes('samsara'),
      `expected an f500 template, got ${result}`,
    );
  });

  test('no match when tier does not exist in index', () => {
    const card   = { company: 'RandomStartup', role: 'Chief Happiness Officer', tier: 'startup' };
    const result = findCoverLetterForCard(card, SAMPLE_INDEX);
    assert.equal(result, null, 'unknown tier should not match');
  });

  test('returns null when no tier on card and no company/role match', () => {
    const card   = { company: 'RandomStartup', role: 'Chief Happiness Officer' };
    const result = findCoverLetterForCard(card, SAMPLE_INDEX);
    assert.equal(result, null, 'no tier on card + no matches → null');
  });

});

describe('findCoverLetterForCard — edge cases', () => {

  test('null index → returns null (no throw)', () => {
    assert.equal(findCoverLetterForCard({ company: 'Stripe', role: 'PM' }, null), null);
  });

  test('missing templates array → returns null (no throw)', () => {
    assert.equal(findCoverLetterForCard({ company: 'Stripe', role: 'PM' }, {}), null);
  });

  test('empty index templates → returns null', () => {
    assert.equal(findCoverLetterForCard({ company: 'Stripe', role: 'PM' }, { templates: [] }), null);
  });

  test('result path includes "cover-letters" directory', () => {
    const card       = { company: 'Stripe', role: 'PM' };
    const result     = findCoverLetterForCard(card, SAMPLE_INDEX);
    const normalized = result?.replace(/\\/g, '/');
    assert.ok(normalized?.startsWith('cover-letters/'), `expected cover-letters/ prefix, got ${result}`);
  });

});

// ── loadClIndex ───────────────────────────────────────────────────────────────

describe('loadClIndex', () => {

  test('returns null for non-existent path', () => {
    const result = loadClIndex('/nonexistent/path/index.yml');
    assert.equal(result, null);
  });

  test('loads real cover-letters/index.yml if it exists', () => {
    const indexPath = path.join(ROOT, 'cover-letters', 'index.yml');
    if (!fs.existsSync(indexPath)) return; // skip if not present
    const idx = loadClIndex(indexPath);
    assert.ok(idx, 'index should parse');
    assert.ok(Array.isArray(idx.templates), 'templates should be array');
    assert.ok(idx.templates.length > 0, 'should have at least one template');
  });

  test('real index entries have required fields', () => {
    const indexPath = path.join(ROOT, 'cover-letters', 'index.yml');
    if (!fs.existsSync(indexPath)) return;
    const idx = loadClIndex(indexPath);
    for (const t of idx.templates) {
      assert.ok(t.file,    `template missing file: ${JSON.stringify(t)}`);
      assert.ok(t.company, `template missing company: ${JSON.stringify(t)}`);
      assert.ok(Array.isArray(t.roles), `template missing roles array: ${JSON.stringify(t)}`);
    }
  });

});
