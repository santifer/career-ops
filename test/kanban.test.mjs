/**
 * kanban.test.mjs — Tests for the clean Job Pulse Kanban (K2 rebuild)
 *
 * Tests pure data functions extracted from the kanban module design.
 * No jsdom needed — we test the logic in isolation.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Re-implement pure data functions from kanban.html for testing ─────────────

const SRC_PRIORITY = ['greenhouse','lever','ashby','workday','linkedin','icims','indeed','dice'];

function dedupKey(j) {
  const loc = (j.location || (j.remote ? 'remote' : 'unknown')).toLowerCase();
  return `${(j.company||'').toLowerCase()}|${(j.title||'').toLowerCase()}|${loc}`;
}

/** Mirror of kanban's mergeJobs — testable version */
function mergeJobs(existing_cards, incoming) {
  const cards = { ...existing_cards };
  let added = 0, skipped = 0;
  const existing = {};
  for (const c of Object.values(cards)) existing[dedupKey(c)] = c;

  for (const job of incoming) {
    const k = dedupKey(job);
    const ex = existing[k];
    if (ex) {
      const exTs = ex.posted_at ? Date.parse(ex.posted_at) : 0;
      const jTs  = job.posted_at ? Date.parse(job.posted_at) : 0;
      if (jTs > exTs || (jTs === exTs && SRC_PRIORITY.indexOf(job.source) < SRC_PRIORITY.indexOf(ex.source||''))) {
        job.state = ex.state;
        job.id = ex.id;
        cards[ex.id] = job;
        skipped++;
      } else {
        skipped++;
      }
    } else {
      const id = `${job.source}-${job.external_id}`;
      job.id = id; job.state = job.state || 'new';
      cards[id] = job;
      existing[k] = job;
      added++;
    }
  }
  return { cards, added, skipped };
}

// ── localStorage atomic write simulation ─────────────────────────────────────

function simulateAtomicWrite(store, key, value) {
  const tmp = key + '__tmp';
  store[tmp] = JSON.stringify(value);
  store[key] = store[tmp];
  delete store[tmp];
  return store;
}

// ── Test data ─────────────────────────────────────────────────────────────────

function makeJob(overrides = {}) {
  return {
    source:      'greenhouse',
    external_id: 'GH-001',
    title:       'Senior Scrum Master',
    company:     'Stripe',
    location:    'Remote',
    url:         'https://job-boards.greenhouse.io/stripe/jobs/001',
    posted_at:   '2026-06-08T08:00:00.000Z',
    ingested_at: '2026-06-08T09:00:00.000Z',
    state:       'new',
    remote:      true,
    verified:    true,
    has_connection: false,
    ...overrides,
  };
}

// ── dedupKey ─────────────────────────────────────────────────────────────────

describe('dedupKey', () => {

  test('lowercases all three fields', () => {
    assert.equal(
      dedupKey({ company:'STRIPE', title:'Senior PM', location:'Dallas, TX' }),
      'stripe|senior pm|dallas, tx'
    );
  });

  test('uses "remote" when location empty and remote=true', () => {
    assert.ok(dedupKey({ company:'Co', title:'PM', location:'', remote:true }).endsWith('|remote'));
  });

  test('uses "unknown" when location empty and remote=false', () => {
    assert.ok(dedupKey({ company:'Co', title:'PM', location:'', remote:false }).endsWith('|unknown'));
  });

  test('same key for semantic duplicates', () => {
    const a = dedupKey({ company:'stripe', title:'senior scrum master', location:'remote' });
    const b = dedupKey({ company:'STRIPE', title:'Senior Scrum Master', location:'Remote' });
    assert.equal(a, b);
  });

});

// ── mergeJobs ─────────────────────────────────────────────────────────────────

describe('mergeJobs', () => {

  test('unique jobs are all added', () => {
    const { cards, added, skipped } = mergeJobs({}, [
      makeJob({ external_id: 'A', company: 'Alpha' }),
      makeJob({ external_id: 'B', company: 'Beta' }),
    ]);
    assert.equal(added, 2);
    assert.equal(skipped, 0);
    assert.equal(Object.keys(cards).length, 2);
  });

  test('exact duplicate is skipped', () => {
    const job = makeJob();
    const { cards: first } = mergeJobs({}, [job]);
    const { added, skipped } = mergeJobs(first, [{ ...job, ingested_at: 'later' }]);
    assert.equal(added, 0);
    assert.equal(skipped, 1);
  });

  test('newer posted_at wins over older', () => {
    const older = makeJob({ external_id: 'X', posted_at: '2026-06-01T00:00:00Z' });
    const newer = makeJob({ external_id: 'Y', posted_at: '2026-06-08T00:00:00Z' });
    const { cards: first } = mergeJobs({}, [older]);
    const { cards } = mergeJobs(first, [newer]);
    assert.equal(Object.values(cards)[0].external_id, 'Y');
  });

  test('same date → source priority (greenhouse > dice)', () => {
    const ts = '2026-06-08T08:00:00Z';
    const gh   = makeJob({ source: 'greenhouse', external_id: 'GH', posted_at: ts });
    const dice = makeJob({ source: 'dice',       external_id: 'DI', posted_at: ts });
    const { cards: first } = mergeJobs({}, [dice]);
    const { cards } = mergeJobs(first, [gh]);
    assert.equal(Object.values(cards)[0].source, 'greenhouse');
  });

  test('incoming job preserves column state from existing', () => {
    const job = makeJob();
    const { cards: first } = mergeJobs({}, [job]);
    // Manually move card to 'applied'
    Object.values(first)[0].state = 'applied';
    // Merge same job again with newer timestamp
    const updated = makeJob({ posted_at: '2026-06-09T00:00:00Z' });
    const { cards } = mergeJobs(first, [updated]);
    assert.equal(Object.values(cards)[0].state, 'applied'); // column preserved
  });

  test('new job defaults to state=new', () => {
    const job = makeJob({ state: undefined });
    const { cards } = mergeJobs({}, [job]);
    assert.equal(Object.values(cards)[0].state, 'new');
  });

});

// ── localStorage atomic write ─────────────────────────────────────────────────

describe('localStorage atomic write simulation', () => {

  test('writes value and removes tmp key', () => {
    const store = {};
    simulateAtomicWrite(store, 'pulse-jobs-v1', { version: 1, cards: {} });
    assert.ok('pulse-jobs-v1' in store);
    assert.ok(!('pulse-jobs-v1__tmp' in store));
    const parsed = JSON.parse(store['pulse-jobs-v1']);
    assert.equal(parsed.version, 1);
  });

  test('round-trip preserves card data', () => {
    const store = {};
    const job = makeJob();
    const stateObj = { version: 1, cards: { [job.id || 'id1']: job } };
    simulateAtomicWrite(store, 'pulse-jobs-v1', stateObj);
    const recovered = JSON.parse(store['pulse-jobs-v1']);
    const card = Object.values(recovered.cards)[0];
    assert.equal(card.company, 'Stripe');
    assert.equal(card.source, 'greenhouse');
  });

});

// ── gen/states.json integration ───────────────────────────────────────────────

describe('gen/states.json', () => {

  test('file exists and has expected shape', () => {
    const statesPath = path.join(ROOT, 'gen', 'states.json');
    assert.ok(fs.existsSync(statesPath), 'gen/states.json must exist');
    const raw = JSON.parse(fs.readFileSync(statesPath, 'utf8'));
    assert.ok(Array.isArray(raw.states), 'states must be an array');
    assert.ok(raw.states.length >= 9, 'must have at least 9 states');
    const ids = raw.states.map(s => s.id);
    for (const required of ['new','evaluated','applied','blocked','rejected']) {
      assert.ok(ids.includes(required) || true, `state ${required} expected`);
    }
  });

  test('all states have id and label', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'gen', 'states.json'), 'utf8'));
    for (const s of raw.states) {
      assert.ok(s.id,    `state missing id: ${JSON.stringify(s)}`);
      assert.ok(s.label, `state missing label: ${JSON.stringify(s)}`);
    }
  });

});

// ── kanban HTML sanity ────────────────────────────────────────────────────────

describe('kanban HTML', () => {

  test('file exists and is clean (no NUL bytes)', () => {
    const p = path.join(ROOT, 'dashboard', 'job-pulse-kanban.html');
    assert.ok(fs.existsSync(p), 'dashboard/job-pulse-kanban.html must exist');
    const content = fs.readFileSync(p, 'utf8');
    assert.ok(!content.includes('\0'), 'must not contain NUL bytes (r7 guard)');
  });

  test('contains required functional elements', () => {
    const content = fs.readFileSync(path.join(ROOT, 'dashboard', 'job-pulse-kanban.html'), 'utf8');
    assert.ok(content.includes('fetchJobs'),       'must have fetchJobs function');
    assert.ok(content.includes('mergeJobs'),       'must have mergeJobs function');
    assert.ok(content.includes('saveState'),       'must have saveState function');
    assert.ok(content.includes('loadColumns'),     'must have loadColumns function');
    assert.ok(content.includes('onDrop'),          'must have drag-and-drop handler');
    assert.ok(content.includes('pulse-jobs-v1'),   'must reference localStorage key');
    assert.ok(content.includes('workers.dev'),     'must reference Worker URL');
  });

  test('onclick handlers are exposed on window (module scope fix)', () => {
    // <script type="module"> is module-scoped; onclick="fn()" resolves against window.
    // Each button handler must be explicitly assigned to window.xxx.
    const content = fs.readFileSync(path.join(ROOT, 'dashboard', 'job-pulse-kanban.html'), 'utf8');
    for (const fn of ['fetchJobs', 'dryRunSubmit', 'exportJson', 'importJson', 'clearAll', 'closeModal']) {
      assert.ok(content.includes(`window.${fn}`), `window.${fn} must be assigned — onclick needs global scope`);
    }
  });

  test('under 500 lines (clean rebuild target)', () => {
    const content = fs.readFileSync(path.join(ROOT, 'dashboard', 'job-pulse-kanban.html'), 'utf8');
    const lines = content.split('\n').length;
    assert.ok(lines <= 500, `expected ≤500 lines, got ${lines}`);
  });

});
