/**
 * kanban-json-input.test.mjs — Tests for --kanban-json bridge
 *
 * Run: node --test test/kanban-json-input.test.mjs
 *
 * Validates that extractEligibleCardsFromJson correctly reads the K2 kanban
 * export shape ({ cards: { [id]: PulseJob }, version: 1 }) and applies the
 * same eligibility filter as extractEligibleCards (HTML path).
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
  extractEligibleCardsFromJson,
  pulseJobToCard,
  SUBMIT_READY_STATES,
  parseReadyStates,
  isEligible,
} from '../scripts/auto-submit.mjs';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'career-ops-json-test-'));

function writeTmpJson(name, data) {
  const p = path.join(TMP, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  return p;
}

function makeJob(overrides = {}) {
  return {
    id:          `greenhouse-GH001-${Date.now()}`,
    state:       'new',
    source:      'greenhouse',
    external_id: 'GH001',
    title:       'Senior Scrum Master',
    company:     'Stripe',
    location:    'Remote, US',
    url:         'https://job-boards.greenhouse.io/stripe/jobs/001',
    posted_at:   '2026-06-01T00:00:00.000Z',
    ingested_at: '2026-06-08T09:00:00.000Z',
    remote:       true,
    verified:     true,
    has_connection: false,
    grade:        'A',
    ...overrides,
  };
}

function makeState(cards) {
  // cards: array of PulseJob objects → convert to { [id]: job } map
  const map = {};
  for (const c of cards) map[c.id] = c;
  return { cards: map, version: 1 };
}

// ── SUBMIT_READY_STATES / parseReadyStates ────────────────────────────────────

describe('SUBMIT_READY_STATES default', () => {

  test('default includes "new" and "evaluated"', () => {
    assert.ok(SUBMIT_READY_STATES.has('evaluated'), 'evaluated must be in default set');
    assert.ok(SUBMIT_READY_STATES.has('new'), 'new must be in default set (freshly fetched from K2 kanban)');
  });

  test('default excludes all terminal states', () => {
    for (const s of ['applied', 'rejected', 'discarded', 'skip', 'offer', 'interview']) {
      assert.ok(!SUBMIT_READY_STATES.has(s), `state "${s}" should not be eligible by default`);
    }
  });

});

describe('parseReadyStates', () => {

  test('null/empty → defaults to ["new", "evaluated"]', () => {
    const s = parseReadyStates(null);
    assert.ok(s.has('evaluated'));
    assert.ok(s.has('new'));
    assert.equal(s.size, 2);
  });

  test('parses comma-separated lowercase', () => {
    const s = parseReadyStates('evaluated,responded');
    assert.ok(s.has('evaluated'));
    assert.ok(s.has('responded'));
    assert.equal(s.size, 2);
  });

  test('normalizes to lowercase', () => {
    const s = parseReadyStates('Evaluated');
    assert.ok(s.has('evaluated'));
  });

  test('trims whitespace around commas', () => {
    const s = parseReadyStates(' evaluated , responded ');
    assert.ok(s.has('evaluated'));
    assert.ok(s.has('responded'));
  });

  test('allows "new" (K2 kanban state, not in gen/states.js)', () => {
    const s = parseReadyStates('new,evaluated');
    assert.ok(s.has('new'));
    assert.ok(s.has('evaluated'));
  });

});

// ── pulseJobToCard mapping ────────────────────────────────────────────────────

describe('pulseJobToCard', () => {

  test('maps title → role', () => {
    const card = pulseJobToCard(makeJob({ title: 'Senior Scrum Master' }));
    assert.equal(card.role, 'Senior Scrum Master');
  });

  test('maps state → columnId', () => {
    const card = pulseJobToCard(makeJob({ state: 'evaluated' }));
    assert.equal(card.columnId, 'evaluated');
  });

  test('maps has_connection → hasConnection', () => {
    const card = pulseJobToCard(makeJob({ has_connection: true }));
    assert.equal(card.hasConnection, true);
  });

  test('is_warm_referral defaults to false when absent', () => {
    const job = makeJob();
    delete job.is_warm_referral;
    const card = pulseJobToCard(job);
    assert.equal(card.isWarmReferral, false);
  });

  test('preserves company, url, grade', () => {
    const card = pulseJobToCard(makeJob({ company: 'Figma', url: 'https://jobs.lever.co/figma/1', grade: 'B' }));
    assert.equal(card.company, 'Figma');
    assert.equal(card.url, 'https://jobs.lever.co/figma/1');
    assert.equal(card.grade, 'B');
  });

});

// ── extractEligibleCardsFromJson ──────────────────────────────────────────────

describe('extractEligibleCardsFromJson — happy path', () => {

  test('parses valid export and returns eligible cards', () => {
    const stripe = makeJob({ id: 'gh-stripe-1', company: 'Stripe', grade: 'A', state: 'evaluated' });
    const figma  = makeJob({ id: 'lv-figma-2',  company: 'Figma',  grade: 'B', state: 'evaluated', title: 'Technical PM', url: 'https://jobs.lever.co/figma/2' });
    const p = writeTmpJson('valid.json', makeState([stripe, figma]));
    const cards = extractEligibleCardsFromJson(p);
    assert.equal(cards.length, 2);
  });

  test('grade A card in "evaluated" state → eligible', () => {
    const job = makeJob({ grade: 'A', state: 'evaluated' });
    const p   = writeTmpJson('grade-a-eval.json', makeState([job]));
    const cards = extractEligibleCardsFromJson(p);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].grade, 'A');
  });

  test('grade B card in "evaluated" state → eligible', () => {
    const job = makeJob({ grade: 'B', state: 'evaluated' });
    const p   = writeTmpJson('grade-b-eval.json', makeState([job]));
    const cards = extractEligibleCardsFromJson(p);
    assert.equal(cards.length, 1);
  });

  test('result cards have role mapped from title', () => {
    const job = makeJob({ title: 'Staff TPM', grade: 'A', state: 'evaluated' });
    const p   = writeTmpJson('title-map.json', makeState([job]));
    const cards = extractEligibleCardsFromJson(p);
    assert.equal(cards[0].role, 'Staff TPM');
  });

});

describe('extractEligibleCardsFromJson — filtering', () => {

  test('card in "new" state + grade A → eligible (freshly fetched, grade A/B is included)', () => {
    const job = makeJob({ grade: 'A', state: 'new' });
    const p   = writeTmpJson('new-state.json', makeState([job]));
    assert.equal(extractEligibleCardsFromJson(p).length, 1,
      '"new" is in SUBMIT_READY_STATES by default');
  });

  test('grade C card → not eligible', () => {
    const job = makeJob({ grade: 'C', state: 'evaluated' });
    const p   = writeTmpJson('grade-c.json', makeState([job]));
    assert.equal(extractEligibleCardsFromJson(p).length, 0);
  });

  test('card in "applied" state → not eligible (already submitted)', () => {
    const job = makeJob({ grade: 'A', state: 'applied' });
    const p   = writeTmpJson('applied-state.json', makeState([job]));
    assert.equal(extractEligibleCardsFromJson(p).length, 0);
  });

  test('card in "rejected" state → not eligible', () => {
    const job = makeJob({ grade: 'A', state: 'rejected' });
    const p   = writeTmpJson('rejected.json', makeState([job]));
    assert.equal(extractEligibleCardsFromJson(p).length, 0);
  });

  test('is_warm_referral card → not eligible', () => {
    const job = makeJob({ grade: 'A', state: 'evaluated', is_warm_referral: true });
    const p   = writeTmpJson('warm-ref.json', makeState([job]));
    assert.equal(extractEligibleCardsFromJson(p).length, 0);
  });

  test('card with no grade → not eligible (null grade)', () => {
    const job = makeJob({ state: 'evaluated' });
    delete job.grade;
    const p = writeTmpJson('no-grade.json', makeState([job]));
    assert.equal(extractEligibleCardsFromJson(p).length, 0);
  });

  test('mixed bag: 3 eligible (evaluated A/B + new A), 3 filtered out', () => {
    const jobs = [
      makeJob({ id: '1', grade: 'A', state: 'evaluated' }),                        // ✓ evaluated A
      makeJob({ id: '2', grade: 'B', state: 'evaluated' }),                        // ✓ evaluated B
      makeJob({ id: '3', grade: 'A', state: 'new' }),                             // ✓ new A
      makeJob({ id: '4', grade: 'C', state: 'evaluated' }),                        // ✗ grade C
      makeJob({ id: '5', grade: 'A', state: 'applied' }),                          // ✗ already applied
      makeJob({ id: '6', grade: 'A', state: 'evaluated', is_warm_referral: true }), // ✗ warm referral
    ];
    const p = writeTmpJson('mixed.json', makeState(jobs));
    assert.equal(extractEligibleCardsFromJson(p).length, 3);
  });

});

describe('extractEligibleCardsFromJson — error cases', () => {

  test('missing file → throws with descriptive message', () => {
    assert.throws(
      () => extractEligibleCardsFromJson('/nonexistent/path/snapshot.json'),
      /Kanban JSON not found/,
    );
  });

  test('malformed JSON → throws with parse error message', () => {
    const p = path.join(TMP, 'bad.json');
    fs.writeFileSync(p, '{ not valid json }', 'utf8');
    assert.throws(() => extractEligibleCardsFromJson(p), /parse error/i);
  });

  test('valid JSON but missing .cards → throws with shape error', () => {
    const p = writeTmpJson('no-cards.json', { jobs: [], version: 1 });
    assert.throws(() => extractEligibleCardsFromJson(p), /cards/i);
  });

  test('empty cards object → 0 eligible, no crash', () => {
    const p = writeTmpJson('empty.json', { cards: {}, version: 1 });
    const cards = extractEligibleCardsFromJson(p);
    assert.equal(cards.length, 0);
  });

  test('.cards as array → throws (wrong shape)', () => {
    const p = writeTmpJson('array-cards.json', { cards: [], version: 1 });
    assert.throws(() => extractEligibleCardsFromJson(p), /cards/i);
  });

});

// ── isEligible — explicit defect-regression cases ────────────────────────────
// Verifies the shared predicate used by both HTML and JSON paths.
// These are the exact cases from K-2026-06-08-12: when the JSON path had no
// state filter, applied/rejected/etc. grade-A cards would incorrectly pass.

describe('isEligible — shared eligibility predicate', () => {

  function card(state, grade, warmReferral = false) {
    return { columnId: state, grade, isWarmReferral: warmReferral };
  }

  test('state="applied" grade="A" → NOT eligible (already submitted)', () => {
    assert.equal(isEligible(card('applied', 'A')), false);
  });

  test('state="rejected" grade="A" → NOT eligible (terminal state)', () => {
    assert.equal(isEligible(card('rejected', 'A')), false);
  });

  test('state="new" grade="A" → eligible (freshly fetched from K2 kanban)', () => {
    assert.equal(isEligible(card('new', 'A')), true);
  });

  test('state="evaluated" grade="A" → eligible (user-scored)', () => {
    assert.equal(isEligible(card('evaluated', 'A')), true);
  });

  test('state="evaluated" grade="C" → NOT eligible (below threshold)', () => {
    assert.equal(isEligible(card('evaluated', 'C')), false);
  });

  test('state="evaluated" grade="A" + isWarmReferral=true → NOT eligible', () => {
    assert.equal(isEligible(card('evaluated', 'A', true)), false);
  });

  test('state="discarded" grade="A" → NOT eligible', () => {
    assert.equal(isEligible(card('discarded', 'A')), false);
  });

  test('state="offer" grade="A" → NOT eligible (already at offer stage)', () => {
    assert.equal(isEligible(card('offer', 'A')), false);
  });

});

// ── Cleanup ───────────────────────────────────────────────────────────────────

import { after } from 'node:test';
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
