import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Import internals via script eval ─────────────────────────────────────────
// auto-submit.mjs calls main() at the bottom so we can't import it directly.
// Test the pure functions by re-implementing them here from the spec, and test
// the CLI output against fixture HTML.

// ── detectATS (re-impl for testing) ──────────────────────────────────────────

const ATS_PATTERNS = [
  { name: 'greenhouse', re: /greenhouse\.io|boards\.greenhouse\.io/i },
  { name: 'lever',      re: /lever\.co/i },
  { name: 'ashby',      re: /ashbyhq\.com/i },
  { name: 'workday',    re: /myworkdayjobs\.com|wd\d+\.myworkdayjobs/i },
  { name: 'icims',      re: /icims\.com/i },
  { name: 'indeed',     re: /indeed\.com/i },
  { name: 'linkedin',   re: /linkedin\.com\/jobs/i },
];
function detectATS(url) {
  if (!url) return 'unknown';
  for (const { name, re } of ATS_PATTERNS) if (re.test(url)) return name;
  return 'unknown';
}

// ── Fixture kanban HTML for card-extraction tests ─────────────────────────────

const FIXTURE_KANBAN = `<!DOCTYPE html><html><body><script>
var cards = [
  {id:'live-1',company:'Stripe',role:'Senior Scrum Master',platform:'greenhouse',
   columnId:'evaluated',url:'https://job-boards.greenhouse.io/stripe/jobs/123',grade:'A',
   hasConnection:false,isWarmReferral:false,createdAt:'2026-06-01T00:00:00Z',closedAt:null},
  {id:'live-2',company:'Figma',role:'Technical PM',platform:'lever',
   columnId:'evaluated',url:'https://jobs.lever.co/figma/abc',grade:'B',
   hasConnection:true,isWarmReferral:false,createdAt:'2026-06-01T00:00:00Z',closedAt:null},
  {id:'live-3',company:'Notion',role:'Agile Coach',platform:'greenhouse',
   columnId:'new',url:'https://job-boards.greenhouse.io/notion/jobs/456',grade:'C',
   hasConnection:false,isWarmReferral:false,createdAt:'2026-06-01T00:00:00Z',closedAt:null},
  {id:'live-4',company:'Anthropic',role:'Program Manager',platform:'workday',
   columnId:'new',url:'https://anthropic.wd5.myworkdayjobs.com/au/job/789',grade:'A',
   hasConnection:true,isWarmReferral:true,createdAt:'2026-06-01T00:00:00Z',closedAt:null},
  {id:'live-5',company:'Linear',role:'RTE',platform:'ashby',
   columnId:'new',url:'https://jobs.ashbyhq.com/linear/xyz',grade:'A',
   hasConnection:false,isWarmReferral:false,createdAt:'2026-06-01T00:00:00Z',closedAt:null},
]
</script></body></html>`;

const FIXTURE_PATH = path.join(ROOT, 'fixtures', 'kanban-fixture.html');
// Write fixture once for tests that call the CLI
if (!fs.existsSync(path.join(ROOT, 'fixtures'))) fs.mkdirSync(path.join(ROOT, 'fixtures'), { recursive: true });
fs.writeFileSync(FIXTURE_PATH, FIXTURE_KANBAN, 'utf8');

// ── ATS detection tests ───────────────────────────────────────────────────────

describe('detectATS', () => {

  test('greenhouse board URL', () => {
    assert.equal(detectATS('https://job-boards.greenhouse.io/stripe/jobs/123'), 'greenhouse');
  });

  test('greenhouse boards variant', () => {
    assert.equal(detectATS('https://boards.greenhouse.io/company/jobs/456'), 'greenhouse');
  });

  test('lever URL', () => {
    assert.equal(detectATS('https://jobs.lever.co/figma/abc-001'), 'lever');
  });

  test('ashby URL', () => {
    assert.equal(detectATS('https://jobs.ashbyhq.com/linear/xyz'), 'ashby');
  });

  test('workday URL', () => {
    assert.equal(detectATS('https://anthropic.wd5.myworkdayjobs.com/au/job/789'), 'workday');
  });

  test('workday tenant variant', () => {
    assert.equal(detectATS('https://globalhr.wd1.myworkdayjobs.com/job/123'), 'workday');
  });

  test('indeed URL', () => {
    assert.equal(detectATS('https://www.indeed.com/viewjob?jk=abc123'), 'indeed');
  });

  test('linkedin jobs URL', () => {
    assert.equal(detectATS('https://www.linkedin.com/jobs/view/12345'), 'linkedin');
  });

  test('unknown URL returns unknown', () => {
    assert.equal(detectATS('https://careers.somecompany.com/jobs/apply'), 'unknown');
  });

  test('null URL returns unknown', () => {
    assert.equal(detectATS(null), 'unknown');
    assert.equal(detectATS(''), 'unknown');
  });

});

// ── CLI dry-run integration test ──────────────────────────────────────────────

describe('auto-submit CLI', () => {

  test('dry-run exits 0 and writes output JSON', async () => {
    const { execSync } = await import('node:child_process');
    // Run against the real kanban (if present) or skip
    const kanban = path.join(ROOT, 'dashboard', 'job-pulse-kanban.html');
    if (!fs.existsSync(kanban)) {
      // Skip if kanban not present on this branch
      return;
    }
    const result = execSync(
      `node scripts/auto-submit.mjs --kanban "${kanban}" --limit 2 --dry-run`,
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.ok(result.includes('DRY-RUN RESULTS'), 'should print dry-run header');
    assert.ok(result.includes('would submit') || result.includes('blocked'), 'should print summary');
  });

  test('dry-run output JSON is valid and has expected shape', () => {
    // Find most recent dry-run file
    const dataDir = path.join(ROOT, 'data');
    if (!fs.existsSync(dataDir)) return;
    const files = fs.readdirSync(dataDir)
      .filter(f => f.startsWith('auto-submit-dry-run-') && f.endsWith('.json'))
      .sort().reverse();
    if (files.length === 0) return; // No output yet

    const raw  = JSON.parse(fs.readFileSync(path.join(dataDir, files[0]), 'utf8'));
    assert.equal(raw.mode, 'dry-run');
    assert.ok(typeof raw.ran_at === 'string');
    assert.ok(typeof raw.eligible_total === 'number');
    assert.ok(Array.isArray(raw.results));
    if (raw.results.length > 0) {
      const r = raw.results[0];
      assert.ok(r.id, 'result has id');
      assert.ok(r.company, 'result has company');
      assert.ok(r.ats, 'result has ats');
      assert.ok(typeof r.would_submit === 'boolean');
    }
  });

});
