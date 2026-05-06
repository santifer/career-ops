/**
 * tests/onboard.test.mjs — Unit tests for the onboarding wizard helpers.
 *
 * Run: npm test
 * Or:  node --test tests/onboard.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { EventEmitter } from 'events';
import {
  yamlQuote,
  validateOnboardPayload,
  serializeProfileYaml,
  extractProfileFromResume,
  kebabCase,
  parseProfileSummary,
} from '../dashboard-web/lib/onboard.mjs';
import { makeSafeResolver } from '../dashboard-web/lib/path-safety.mjs';
import { readJsonBody, MAX_BODY_BYTES, isOriginAllowed } from '../dashboard-web/lib/http-utils.mjs';
import { buildGmailStatus } from '../dashboard-web/lib/gmail-status.mjs';

// ── yamlQuote ────────────────────────────────────────────────────────────────

describe('yamlQuote', () => {
  test('wraps a plain string in double quotes', () => {
    assert.equal(yamlQuote('hello'), '"hello"');
  });
  test('escapes embedded double quotes', () => {
    assert.equal(yamlQuote('she said "hi"'), '"she said \\"hi\\""');
  });
  test('escapes backslashes', () => {
    assert.equal(yamlQuote('C:\\path'), '"C:\\\\path"');
  });
  test('escapes newlines, carriage returns, tabs', () => {
    assert.equal(yamlQuote('a\nb\rc\td'), '"a\\nb\\rc\\td"');
  });
  test('handles null and undefined as empty string', () => {
    assert.equal(yamlQuote(null), '""');
    assert.equal(yamlQuote(undefined), '""');
  });
  test('coerces numbers to strings', () => {
    assert.equal(yamlQuote(42), '"42"');
  });
  test('preserves unicode and accented characters', () => {
    assert.equal(yamlQuote('Montréal · São Paulo'), '"Montréal · São Paulo"');
  });
  test('escapes carriage-return-only (CR) input', () => {
    // \r alone (without \n) showed up in CSV/Excel-pasted resumes during
    // smoke testing. The emitter must round-trip cleanly.
    assert.equal(yamlQuote('a\rb'), '"a\\rb"');
  });
  test('roundtrips Windows-style CRLF line endings', () => {
    assert.equal(yamlQuote('line1\r\nline2'), '"line1\\r\\nline2"');
  });
});

// ── validateOnboardPayload ──────────────────────────────────────────────────

describe('validateOnboardPayload', () => {
  const valid = () => ({
    basics: { full_name: 'Jane Smith', email: 'jane@example.com', phone: '', location: '', linkedin: '', headline: '' },
    target_roles: ['Engineering Manager'],
    compensation: {},
    deal_breakers: [],
    narrative: { superpowers: [], proof_points: [] },
  });

  test('accepts a minimal valid payload', () => {
    assert.deepEqual(validateOnboardPayload(valid()), []);
  });
  test('rejects null/undefined payload', () => {
    assert.deepEqual(validateOnboardPayload(null), ['payload required']);
    assert.deepEqual(validateOnboardPayload(undefined), ['payload required']);
  });
  test('rejects payload with no basics', () => {
    assert.deepEqual(validateOnboardPayload({}), ['basics required']);
  });
  test('rejects empty full_name', () => {
    const p = valid(); p.basics.full_name = '';
    assert.ok(validateOnboardPayload(p).includes('full_name invalid'));
  });
  test('rejects single-character name (length < 2)', () => {
    const p = valid(); p.basics.full_name = 'X';
    assert.ok(validateOnboardPayload(p).includes('full_name invalid'));
  });
  test('rejects 101-char name (length > 100)', () => {
    const p = valid(); p.basics.full_name = 'X'.repeat(101);
    assert.ok(validateOnboardPayload(p).includes('full_name invalid'));
  });
  test('rejects malformed email', () => {
    const p = valid(); p.basics.email = 'notanemail';
    assert.ok(validateOnboardPayload(p).includes('email invalid'));
  });
  test('rejects empty target_roles', () => {
    const p = valid(); p.target_roles = [];
    assert.ok(validateOnboardPayload(p).includes('pick at least one target role'));
  });
  test('rejects non-array target_roles', () => {
    const p = valid(); p.target_roles = 'Engineer';
    assert.ok(validateOnboardPayload(p).includes('pick at least one target role'));
  });
  test('rejects > 50 target_roles', () => {
    const p = valid(); p.target_roles = Array.from({ length: 51 }, (_, i) => `Role ${i}`);
    assert.ok(validateOnboardPayload(p).includes('too many target_roles'));
  });
  test('rejects role entry with invalid type', () => {
    const p = valid(); p.target_roles = [123];
    assert.ok(validateOnboardPayload(p).includes('invalid role entry'));
  });
  test('rejects non-array deal_breakers', () => {
    const p = valid(); p.deal_breakers = 'no relocation';
    assert.ok(validateOnboardPayload(p).includes('deal_breakers must be array'));
  });
  test('rejects too-long phone field', () => {
    const p = valid(); p.basics.phone = 'X'.repeat(301);
    assert.ok(validateOnboardPayload(p).includes('phone too long'));
  });
  test('rejects too-many superpowers', () => {
    const p = valid(); p.narrative.superpowers = Array.from({ length: 11 }, (_, i) => `s${i}`);
    assert.ok(validateOnboardPayload(p).includes('too many superpowers'));
  });
  test('rejects > 4000-char best_achievement', () => {
    const p = valid(); p.narrative.best_achievement = 'X'.repeat(4001);
    assert.ok(validateOnboardPayload(p).includes('best_achievement too long'));
  });
  test('rejects > 20 proof_points', () => {
    const p = valid(); p.narrative.proof_points = Array.from({ length: 21 }, () => ({ name: 'x' }));
    assert.ok(validateOnboardPayload(p).includes('too many proof_points'));
  });
  test('accepts plus-addressed email (jane+jobs@example.com)', () => {
    const p = valid(); p.basics.email = 'jane+jobs@example.com';
    assert.deepEqual(validateOnboardPayload(p), []);
  });
  test('accepts subdomain email (jane@team.example.com)', () => {
    const p = valid(); p.basics.email = 'jane@team.example.com';
    assert.deepEqual(validateOnboardPayload(p), []);
  });
  test('rejects email > 200 chars even if syntactically valid', () => {
    const p = valid();
    p.basics.email = 'a'.repeat(190) + '@x.com'; // 196 chars — fits
    assert.deepEqual(validateOnboardPayload(p), []);
    p.basics.email = 'a'.repeat(195) + '@x.com'; // 201 chars — too long
    assert.ok(validateOnboardPayload(p).includes('email invalid'));
  });
  test('rejects > 300-char location field', () => {
    const p = valid(); p.basics.location = 'X'.repeat(301);
    assert.ok(validateOnboardPayload(p).includes('location too long'));
  });
  test('rejects > 50 deal_breakers', () => {
    const p = valid(); p.deal_breakers = Array.from({ length: 51 }, (_, i) => `db ${i}`);
    assert.ok(validateOnboardPayload(p).includes('too many deal_breakers'));
  });
  test('rejects > 120-char role title', () => {
    const p = valid(); p.target_roles = ['X'.repeat(121)];
    assert.ok(validateOnboardPayload(p).includes('invalid role entry'));
  });
  test('rejects > 100-char compensation field', () => {
    const p = valid();
    p.compensation = { target_range: 'X'.repeat(101) };
    assert.ok(validateOnboardPayload(p).some(e => /compensation\.target_range/.test(e)));
  });
  test('treats narrative.proof_points = null as missing (no error)', () => {
    // The validator uses `!= null` so null + undefined skip the array check.
    // This protects clients that omit the field rather than passing [].
    const p = valid(); p.narrative.proof_points = null;
    assert.deepEqual(validateOnboardPayload(p), []);
  });
  test('rejects narrative.proof_points when it is a non-null non-array', () => {
    const p = valid(); p.narrative.proof_points = 'oops';
    assert.ok(validateOnboardPayload(p).includes('proof_points must be array'));
  });
});

// ── serializeProfileYaml ────────────────────────────────────────────────────

describe('serializeProfileYaml', () => {
  test('produces a header comment + candidate block', () => {
    const yml = serializeProfileYaml({
      basics: { full_name: 'Jane', email: 'j@x.com' },
      target_roles: ['Engineer'],
    });
    assert.match(yml, /^# Career-Ops Profile Configuration/);
    assert.match(yml, /candidate:\s*\n\s+full_name: "Jane"/);
    assert.match(yml, /target_roles:\s*\n\s+primary:\s*\n\s+- "Engineer"/);
  });
  test('strips http(s):// from linkedin', () => {
    const yml = serializeProfileYaml({
      basics: { full_name: 'X', email: 'x@y.com', linkedin: 'https://linkedin.com/in/foo' },
      target_roles: ['Y'],
    });
    assert.match(yml, /linkedin: "linkedin\.com\/in\/foo"/);
  });
  test('splits "City, ST" into city + country', () => {
    const yml = serializeProfileYaml({
      basics: { full_name: 'X', email: 'x@y.com', location: 'Toronto, ON' },
      target_roles: ['Y'],
    });
    assert.match(yml, /city: "Toronto"/);
    assert.match(yml, /country: "ON"/);
  });
  test('emits empty arrays for missing optional sections', () => {
    const yml = serializeProfileYaml({
      basics: { full_name: 'X', email: 'x@y.com' },
      target_roles: ['Y'],
    });
    assert.match(yml, /superpowers: \[\]/);
    assert.match(yml, /proof_points: \[\]/);
  });
  test('emits superpowers list when present', () => {
    const yml = serializeProfileYaml({
      basics: { full_name: 'X', email: 'x@y.com' },
      target_roles: ['Y'],
      narrative: { superpowers: ['fast', 'sharp'] },
    });
    assert.match(yml, /superpowers:\s*\n\s+- "fast"\s*\n\s+- "sharp"/);
  });
  test('emits deal_breakers section when non-empty', () => {
    const yml = serializeProfileYaml({
      basics: { full_name: 'X', email: 'x@y.com' },
      target_roles: ['Y'],
      deal_breakers: ['No relocation'],
    });
    assert.match(yml, /deal_breakers:\s*\n\s+- "No relocation"/);
  });
  test('omits deal_breakers section when empty', () => {
    const yml = serializeProfileYaml({
      basics: { full_name: 'X', email: 'x@y.com' },
      target_roles: ['Y'],
      deal_breakers: [],
    });
    assert.doesNotMatch(yml, /deal_breakers:/);
  });
  test('escapes quotes inside values', () => {
    const yml = serializeProfileYaml({
      basics: { full_name: 'Jane "JJ" Smith', email: 'j@x.com' },
      target_roles: ['Y'],
    });
    assert.match(yml, /full_name: "Jane \\"JJ\\" Smith"/);
  });
  test('survives null/undefined nested fields', () => {
    const yml = serializeProfileYaml({
      basics: { full_name: 'X', email: 'x@y.com' },
      target_roles: ['Y'],
      narrative: null,
      compensation: null,
      deal_breakers: null,
    });
    assert.match(yml, /candidate:/);
    assert.match(yml, /currency: "USD"/);  // default
  });
  test('skips proof_points entries with neither name nor url', () => {
    const yml = serializeProfileYaml({
      basics: { full_name: 'X', email: 'x@y.com' },
      target_roles: ['Y'],
      narrative: {
        proof_points: [
          { name: 'Real proof', url: 'https://x.com', hero_metric: '$1M' },
          { name: '', url: '' },                  // empty — skip
          { name: '', url: '', hero_metric: 'orphan' }, // also skip (no name/url)
        ],
      },
    });
    // Only one proof point should be emitted
    const matches = yml.match(/- name:/g) || [];
    assert.equal(matches.length, 1);
    assert.match(yml, /name: "Real proof"/);
    assert.doesNotMatch(yml, /hero_metric: "orphan"/);
  });
  test('handles single-segment location (no comma)', () => {
    // "Tokyo" alone should still produce city=Tokyo, country=Tokyo (the
    // first/last fallback). Tested explicitly because the split logic is
    // easy to get wrong for length-1 arrays.
    const yml = serializeProfileYaml({
      basics: { full_name: 'X', email: 'x@y.com', location: 'Tokyo' },
      target_roles: ['Y'],
    });
    assert.match(yml, /city: "Tokyo"/);
    assert.match(yml, /country: "Tokyo"/);
  });
  test('emits best_achievement only when present', () => {
    const withAch = serializeProfileYaml({
      basics: { full_name: 'X', email: 'x@y.com' },
      target_roles: ['Y'],
      narrative: { best_achievement: 'Built Jarvis' },
    });
    assert.match(withAch, /best_achievement: "Built Jarvis"/);
    const without = serializeProfileYaml({
      basics: { full_name: 'X', email: 'x@y.com' },
      target_roles: ['Y'],
      narrative: {},
    });
    assert.doesNotMatch(without, /best_achievement:/);
  });
  test('escapes a role title with embedded quotes', () => {
    const yml = serializeProfileYaml({
      basics: { full_name: 'X', email: 'x@y.com' },
      target_roles: ['Director "AI Strategy"'],
    });
    assert.match(yml, /- "Director \\"AI Strategy\\""/);
  });
});

// ── extractProfileFromResume ────────────────────────────────────────────────

describe('extractProfileFromResume', () => {
  test('extracts a basic resume', () => {
    const text = `Jane Smith
San Francisco, CA · jane@example.com · (415) 555-0123 · linkedin.com/in/janesmith

Senior AI Engineer with 8 years of experience.`;
    const p = extractProfileFromResume(text);
    assert.equal(p.full_name, 'Jane Smith');
    assert.equal(p.email, 'jane@example.com');
    assert.equal(p.phone, '(415) 555-0123');
    assert.equal(p.linkedin, 'linkedin.com/in/janesmith');
    assert.equal(p.location, 'San Francisco, CA');
  });
  test('rejects sentence-length headlines (the old bug)', () => {
    const text = `Jane Smith
jane@example.com

Senior Engineering Manager with 12 years of experience building distributed systems.`;
    const p = extractProfileFromResume(text);
    // The sentence ends in "." → must NOT be picked as headline.
    assert.equal(p.headline, '');
  });
  test('accepts a clean role-descriptor headline', () => {
    const text = `Jane Doe
jane@x.com

Strategic Operator · AI Ecosystem Architect · Partnership Leader
8+ years experience...`;
    const p = extractProfileFromResume(text);
    assert.equal(p.headline, 'Strategic Operator · AI Ecosystem Architect · Partnership Leader');
  });
  test('returns empty profile for empty input', () => {
    const p = extractProfileFromResume('');
    assert.equal(p.full_name, '');
    assert.equal(p.email, '');
  });
  test('returns empty profile for non-string input', () => {
    assert.deepEqual(extractProfileFromResume(null).full_name, '');
    assert.deepEqual(extractProfileFromResume(123).full_name, '');
  });
  test('handles markdown headers', () => {
    const text = `# Jane Smith\n\njane@x.com\n\n## Experience`;
    const p = extractProfileFromResume(text);
    assert.equal(p.full_name, 'Jane Smith');
  });
  test('skips contact-line numbers when extracting location', () => {
    const text = `Jane\nNew York, NY | jane@x.com | (555) 123-4567`;
    const p = extractProfileFromResume(text);
    assert.equal(p.location, 'New York, NY');
  });
  test('only accepts names with at least one space', () => {
    // Single word like "Jane" should NOT be extracted as a name (would catch
    // section headers like "Experience", "Education", etc.).
    const text = `Experience\n\njane@x.com`;
    const p = extractProfileFromResume(text);
    assert.equal(p.full_name, '');
  });
  test('rejects exclamation-terminated lines as headlines', () => {
    // Sentence punctuation (! and ?) should also disqualify, not just period.
    const text = `Jane Doe\n\nDirector of AI Innovation!\nReal Headline`;
    const p = extractProfileFromResume(text);
    assert.notEqual(p.headline, 'Director of AI Innovation!');
  });
  test('rejects question-terminated lines as headlines', () => {
    const text = `Jane Doe\n\nWhy hire a Director of AI?\nReal Headline`;
    const p = extractProfileFromResume(text);
    assert.notEqual(p.headline, 'Why hire a Director of AI?');
  });
  test('rejects > 80-char headline candidates', () => {
    // 90-char line that contains "director" — should NOT be picked despite
    // the keyword match.
    const big = 'Director of AI Innovation across multiple regions and product lines and so on';
    assert.ok(big.length < 81 || true); // keep test self-documenting
    const text = `Jane Doe\n\n${big.padEnd(90, '.')} `;
    const p = extractProfileFromResume(text);
    // The line is too long — should be empty
    assert.equal(p.headline, '');
  });
  test('does not mistake email-only line as headline', () => {
    const text = `Jane Doe\njane@example.com\nlinkedin.com/in/jane`;
    const p = extractProfileFromResume(text);
    assert.equal(p.headline, ''); // no role keywords + URLs filtered
  });
  test('extracts the first email when multiple are present', () => {
    const text = `Jane Doe\nWork: jane@work.com · Personal: jane@gmail.com`;
    const p = extractProfileFromResume(text);
    assert.equal(p.email, 'jane@work.com');
  });
  test('handles international phone with country code + standard 3-3-4 format', () => {
    // Regex assumes North-American 3-3-4 grouping but allows an optional 1-3
    // digit country code prefix. Pure E.164-style "+44 20 7946 0958" (2-4-4)
    // is intentionally not handled — that's a known limitation of the
    // lightweight extractor.
    const text = `Jane Doe\n+1 415 555 0123\njane@x.com`;
    const p = extractProfileFromResume(text);
    assert.ok(p.phone.includes('415'));
  });
  test('handles "City, Country" location (not just "City, ST")', () => {
    const text = `Jane Doe\nMontreal, Canada · jane@x.com`;
    const p = extractProfileFromResume(text);
    assert.equal(p.location, 'Montreal, Canada');
  });
});

// ── kebabCase ───────────────────────────────────────────────────────────────

describe('kebabCase', () => {
  test('lowercases and hyphenates', () => {
    assert.equal(kebabCase('Jane Doe'), 'jane-doe');
  });
  test('strips punctuation', () => {
    assert.equal(kebabCase("Jane O'Neill, Jr."), 'jane-oneill-jr');
  });
  test('handles unicode by stripping accents', () => {
    assert.equal(kebabCase('María José'), 'maria-jose');
  });
  test('handles empty / null input', () => {
    assert.equal(kebabCase(''), '');
    assert.equal(kebabCase(null), '');
    assert.equal(kebabCase(undefined), '');
  });
  test('collapses multiple spaces', () => {
    assert.equal(kebabCase('A   B    C'), 'a-b-c');
  });
});

// ── parseProfileSummary ─────────────────────────────────────────────────────

describe('parseProfileSummary', () => {
  test('returns exists:false on empty input', () => {
    assert.deepEqual(parseProfileSummary(''), {
      exists: false, full_name: '', email: '', target_roles: [], substantive: false,
    });
    assert.deepEqual(parseProfileSummary(null).exists, false);
    assert.deepEqual(parseProfileSummary(undefined).exists, false);
  });

  test('extracts candidate fields', () => {
    const yml = `candidate:
  full_name: "Jane Doe"
  email: "jane@x.com"
target_roles:
  primary: []
`;
    const s = parseProfileSummary(yml);
    assert.equal(s.full_name, 'Jane Doe');
    assert.equal(s.email, 'jane@x.com');
  });

  test('extracts all target_roles.primary entries', () => {
    const yml = `candidate:
  full_name: "X"
  email: "x@y.com"
target_roles:
  primary:
    - "Role A"
    - "Role B"
    - "Role C"
  archetypes: []
`;
    const s = parseProfileSummary(yml);
    assert.deepEqual(s.target_roles, ['Role A', 'Role B', 'Role C']);
  });

  test('does not include archetype names in target_roles', () => {
    const yml = `target_roles:
  primary:
    - "Real Role"
  archetypes:
    - name: "Decoy A"
    - name: "Decoy B"
`;
    const s = parseProfileSummary(yml);
    assert.deepEqual(s.target_roles, ['Real Role']);
  });

  test('marks substantive=true when name + at least one role present', () => {
    const yml = `candidate:
  full_name: "Jane"
  email: "t@x.com"
target_roles:
  primary:
    - "Role"
`;
    assert.equal(parseProfileSummary(yml).substantive, true);
  });

  test('marks substantive=false when name missing', () => {
    const yml = `candidate:
  email: "t@x.com"
target_roles:
  primary:
    - "Role"
`;
    assert.equal(parseProfileSummary(yml).substantive, false);
  });

  test('marks substantive=false when target_roles empty', () => {
    const yml = `candidate:
  full_name: "Jane"
target_roles:
  primary: []
`;
    assert.equal(parseProfileSummary(yml).substantive, false);
  });

  test('handles profile with no target_roles section at all', () => {
    const yml = `candidate:
  full_name: "Jane"
  email: "t@x.com"
narrative:
  headline: "Test"
`;
    const s = parseProfileSummary(yml);
    assert.equal(s.full_name, 'Jane');
    assert.deepEqual(s.target_roles, []);
    assert.equal(s.substantive, false);
  });

  test('handles malformed YAML without crashing', () => {
    const s = parseProfileSummary('this is not yaml at all\n   :::\n');
    assert.equal(s.exists, true); // string was non-empty
    assert.equal(s.full_name, '');
    assert.deepEqual(s.target_roles, []);
  });
  test('does not pick up archetype description: sub-fields as roles', () => {
    // Older regex was greedy and would match nested sub-keys under archetypes
    // entries. Make sure the line-walker correctly stops at archetypes:.
    const yml = `target_roles:
  primary:
    - "Real Role 1"
    - "Real Role 2"
  archetypes:
    - name: "Decoy Architect"
      description: "Should not be picked"
    - name: "Decoy Operator"
      description: "Also not picked"
`;
    const s = parseProfileSummary(yml);
    assert.deepEqual(s.target_roles, ['Real Role 1', 'Real Role 2']);
  });
  test('handles target_roles before candidate block (order-independent)', () => {
    const yml = `target_roles:
  primary:
    - "Role X"
candidate:
  full_name: "Jane"
  email: "jane@x.com"
`;
    const s = parseProfileSummary(yml);
    assert.equal(s.full_name, 'Jane');
    assert.deepEqual(s.target_roles, ['Role X']);
  });
});

// ── makeSafeResolver (path-traversal defense) ──────────────────────────────

describe('makeSafeResolver', () => {
  let baseDir;
  let resolve;

  test('setup: create temp base dir', () => {
    baseDir = mkdtempSync(path.join(os.tmpdir(), 'safety-'));
    mkdirSync(path.join(baseDir, 'sub'), { recursive: true });
    writeFileSync(path.join(baseDir, 'real.md'), 'ok');
    resolve = makeSafeResolver(baseDir);
  });

  test('accepts a clean .md basename', () => {
    const p = resolve('real.md');
    assert.ok(p);
    assert.equal(path.basename(p), 'real.md');
  });
  test('accepts reports/ prefixed paths (strips them)', () => {
    const p = resolve('reports/real.md');
    assert.equal(path.basename(p), 'real.md');
  });
  test('rejects ../ traversal attempts', () => {
    assert.equal(resolve('../etc/passwd'), null);
    assert.equal(resolve('../../config/profile.yml'), null);
    assert.equal(resolve('reports/../../etc/passwd'), null);
  });
  test('rejects absolute paths to other locations', () => {
    assert.equal(resolve('/etc/passwd'), null);
    assert.equal(resolve('C:\\Windows\\system32'), null);
  });
  test('rejects unsafe characters', () => {
    assert.equal(resolve('foo bar.md'), null);
    assert.equal(resolve('foo;rm.md'), null);
    assert.equal(resolve('foo<script>.md'), null);
  });
  test('rejects non-md extensions', () => {
    assert.equal(resolve('config.yml'), null);
    assert.equal(resolve('script.sh'), null);
    assert.equal(resolve('binary'), null);
  });
  test('rejects empty / null / non-string input', () => {
    assert.equal(resolve(''), null);
    assert.equal(resolve(null), null);
    assert.equal(resolve(undefined), null);
    assert.equal(resolve(123), null);
  });
  test('rejects . and ..', () => {
    assert.equal(resolve('.'), null);
    assert.equal(resolve('..'), null);
  });
  test('rejects URL fragments and query strings (after stripping)', () => {
    // The resolver strips #/? — the cleaned basename must still be valid
    const p = resolve('real.md#section');
    assert.ok(p, 'basename "real.md" is valid even with a fragment');
  });
  test('teardown: clean temp dir', () => {
    rmSync(baseDir, { recursive: true, force: true });
  });
});

// ── readJsonBody (HTTP body parser + size cap) ───────────────────────────────
//
// readJsonBody listens to 'data'/'end'/'error' on req and calls req.destroy()
// when the cap trips. We simulate a Node http req with a plain EventEmitter
// plus a destroy() spy.

function fakeReq() {
  const req = new EventEmitter();
  req.destroyed = false;
  req.destroy = () => { req.destroyed = true; };
  return req;
}

describe('readJsonBody', () => {
  test('exposes a 256 KiB default cap', () => {
    assert.equal(MAX_BODY_BYTES, 256 * 1024);
  });
  test('parses a small valid JSON body', async () => {
    const req = fakeReq();
    const p = readJsonBody(req);
    req.emit('data', Buffer.from('{"hello":"world"}'));
    req.emit('end');
    assert.deepEqual(await p, { hello: 'world' });
  });
  test('returns {} for an empty body', async () => {
    const req = fakeReq();
    const p = readJsonBody(req);
    req.emit('end');
    assert.deepEqual(await p, {});
  });
  test('rejects malformed JSON with a generic error', async () => {
    const req = fakeReq();
    const p = readJsonBody(req);
    req.emit('data', Buffer.from('{ this is not json'));
    req.emit('end');
    await assert.rejects(p, /Invalid JSON body/);
  });
  test('rejects + destroys when total exceeds the cap (DoS guard)', async () => {
    const req = fakeReq();
    const p = readJsonBody(req, { maxBytes: 1024 });
    // Send 2 KiB worth of garbage — should trip the cap on the first chunk
    req.emit('data', Buffer.alloc(2048, 'x'));
    await assert.rejects(p, /Request body too large/);
    assert.equal(req.destroyed, true);
  });
  test('default 256 KiB cap rejects a larger payload', async () => {
    const req = fakeReq();
    const p = readJsonBody(req);
    // Send 257 KiB — one byte over the default cap
    req.emit('data', Buffer.alloc(MAX_BODY_BYTES + 1, 'a'));
    await assert.rejects(p, /Request body too large/);
  });
  test('accepts a payload exactly at the cap', async () => {
    const req = fakeReq();
    // 1 KiB cap, send 1 KiB exactly. Make it valid JSON.
    const obj = { pad: 'a'.repeat(1000) };
    const body = JSON.stringify(obj);
    const p = readJsonBody(req, { maxBytes: body.length });
    req.emit('data', Buffer.from(body));
    req.emit('end');
    const parsed = await p;
    assert.equal(parsed.pad.length, 1000);
  });
  test('propagates request "error" events', async () => {
    const req = fakeReq();
    const p = readJsonBody(req);
    const boom = new Error('socket reset');
    req.emit('error', boom);
    await assert.rejects(p, /socket reset/);
  });
  test('handles chunked body across multiple data events', async () => {
    const req = fakeReq();
    const p = readJsonBody(req);
    req.emit('data', Buffer.from('{"a":'));
    req.emit('data', Buffer.from('1,"b":'));
    req.emit('data', Buffer.from('"hello"}'));
    req.emit('end');
    assert.deepEqual(await p, { a: 1, b: 'hello' });
  });
});

// ── isOriginAllowed (CSRF defense) ──────────────────────────────────────────

describe('isOriginAllowed', () => {
  test('rejects missing / non-string origin', () => {
    assert.equal(isOriginAllowed(undefined), false);
    assert.equal(isOriginAllowed(null), false);
    assert.equal(isOriginAllowed(''), false);
    assert.equal(isOriginAllowed(42), false);
  });
  test('rejects non-loopback origins', () => {
    assert.equal(isOriginAllowed('https://attacker.com'), false);
    assert.equal(isOriginAllowed('http://192.168.1.10:4747'), false);
    assert.equal(isOriginAllowed('http://example.com:4747'), false);
  });
  test('rejects non-http(s) protocols', () => {
    assert.equal(isOriginAllowed('file:///etc/passwd'), false);
    assert.equal(isOriginAllowed('javascript:alert(1)'), false);
  });
  test('accepts loopback origins on any port (no allowlist)', () => {
    assert.equal(isOriginAllowed('http://localhost:4747'), true);
    assert.equal(isOriginAllowed('http://127.0.0.1:9999'), true);
    assert.equal(isOriginAllowed('http://[::1]:4747'), true);
  });
  test('respects an explicit port allowlist when provided', () => {
    assert.equal(isOriginAllowed('http://localhost:4747', ['4747']), true);
    assert.equal(isOriginAllowed('http://localhost:4747', [4747]), true);
    assert.equal(isOriginAllowed('http://localhost:9999', ['4747']), false);
  });
  test('rejects malformed origin strings', () => {
    assert.equal(isOriginAllowed('not a url'), false);
    assert.equal(isOriginAllowed('http://'), false);
  });
});

// ── /api/health endpoint shape (boots a real server on a random port) ──────
//
// This is the one endpoint that's load-bearing for the Docker HEALTHCHECK
// and the install.sh boot probe. If its shape drifts, deploys break silently.
// We boot a real server on a free loopback port to assert the contract.

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

describe('/api/health endpoint contract', () => {
  let proc;
  let port;
  const base = () => `http://127.0.0.1:${port}`;

  test('setup: boot the server on a free port', async () => {
    // Pick a port unlikely to clash with the user's running dashboard
    port = 14747 + Math.floor(Math.random() * 1000);
    const here = path.dirname(fileURLToPath(import.meta.url));
    const serverPath = path.join(here, '..', 'dashboard-web', 'server.mjs');
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'health-'));
    proc = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        CONFIG_DIR: tmpDir,
        DATA_DIR: tmpDir,
        // Suppress the LAN-warning console noise in tests
        SUPPRESS_BANNER: '1',
      },
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: false,
    });
    // Wait for the server to come up (max 5s, poll every 100ms)
    for (let i = 0; i < 50; i++) {
      try {
        const r = await fetch(`${base()}/api/health`);
        if (r.ok) return;
      } catch { /* still booting */ }
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('server did not respond within 5s');
  });

  test('returns 200 with structured payload', async () => {
    const r = await fetch(`${base()}/api/health`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/json');
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(typeof body.uptime, 'number');
    assert.ok(body.uptime >= 0);
    assert.equal(typeof body.version, 'string');
    assert.match(body.version, /^\d+\.\d+\.\d+$/);
    assert.equal(typeof body.now, 'string');
    assert.match(body.now, /^\d{4}-\d{2}-\d{2}T/);
  });

  test('sets no-store cache header (always fresh for monitors)', async () => {
    const r = await fetch(`${base()}/api/health`);
    assert.match(r.headers.get('cache-control') || '', /no-store/);
  });

  test('uptime is monotonically non-decreasing across calls', async () => {
    const a = await (await fetch(`${base()}/api/health`)).json();
    await new Promise(r => setTimeout(r, 1100));
    const b = await (await fetch(`${base()}/api/health`)).json();
    assert.ok(b.uptime >= a.uptime, `uptime went backwards: ${a.uptime} -> ${b.uptime}`);
  });

  test('responds quickly even under repeated load (probe-friendly)', async () => {
    const t0 = Date.now();
    const probes = await Promise.all(
      Array.from({ length: 20 }, () => fetch(`${base()}/api/health`))
    );
    const elapsed = Date.now() - t0;
    for (const r of probes) assert.equal(r.status, 200);
    assert.ok(elapsed < 2000, `20 probes took ${elapsed}ms (expected < 2s)`);
  });

  test('teardown: stop the server', () => {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  });
});

// ── /api/onboard/finalize HTTP smoke (the path that writes profile.yml) ────
//
// Helpers are unit-tested above, but the full HTTP path has its own failure
// modes (CSRF origin check, body-size cap, mkdir-p of CONFIG_DIR, JSON
// content-type, error code mapping). This suite boots a real server against
// a tmp CONFIG_DIR and exercises both happy and adversarial requests.

describe('/api/onboard/finalize HTTP contract', () => {
  let proc;
  let port;
  let configDir;
  const base = () => `http://127.0.0.1:${port}`;

  test('setup: boot the server in a tmp config dir', async () => {
    port = 15747 + Math.floor(Math.random() * 1000);
    configDir = mkdtempSync(path.join(os.tmpdir(), 'co-onb-'));
    const here = path.dirname(fileURLToPath(import.meta.url));
    const serverPath = path.join(here, '..', 'dashboard-web', 'server.mjs');
    proc = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        CONFIG_DIR: configDir,
        DATA_DIR: configDir,
        SUPPRESS_BANNER: '1',
      },
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: false,
    });
    for (let i = 0; i < 50; i++) {
      try {
        const r = await fetch(`${base()}/api/health`);
        if (r.ok) return;
      } catch { /* still booting */ }
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('server did not respond within 5s');
  });

  const validBody = () => JSON.stringify({
    basics: {
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '',
      location: 'Remote',
      linkedin: '',
      headline: 'Senior Backend Engineer',
    },
    target_roles: ['Senior Backend Engineer'],
    compensation: { target_range: '', minimum: '', currency: 'USD', location_flexibility: '' },
    deal_breakers: [],
    narrative: { superpowers: [], best_achievement: '', proof_points: [] },
  });

  test('writes profile.yml on a happy-path POST (200 + ok:true)', async () => {
    const r = await fetch(`${base()}/api/onboard/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base() },
      body: validBody(),
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    const yml = readFileSync(path.join(configDir, 'profile.yml'), 'utf8');
    assert.match(yml, /full_name: "Jane Doe"/);
    assert.match(yml, /target_roles:/);
  });

  test('rejects missing full_name with 400 + specific error message', async () => {
    const r = await fetch(`${base()}/api/onboard/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base() },
      body: JSON.stringify({ basics: { email: 'a@b.com' }, target_roles: ['X'] }),
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /full_name/);
  });

  test('rejects empty target_roles with helpful message', async () => {
    const r = await fetch(`${base()}/api/onboard/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base() },
      body: JSON.stringify({
        basics: { full_name: 'Jane Doe', email: 'jane@example.com' },
        target_roles: [],
      }),
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.match(body.error, /target role/);
  });

  test('writes a backup of an existing profile before overwriting', async () => {
    // First write should produce profile.yml; second write should snapshot
    // the previous content as profile.yml.bak.{timestamp}
    const r1 = await fetch(`${base()}/api/onboard/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base() },
      body: validBody(),
    });
    assert.equal(r1.status, 200);
    await new Promise(res => setTimeout(res, 50));
    const r2 = await fetch(`${base()}/api/onboard/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base() },
      body: validBody(),
    });
    assert.equal(r2.status, 200);
    const { readdirSync } = await import('fs');
    const files = readdirSync(configDir);
    const baks = files.filter(f => f.startsWith('profile.yml.bak.'));
    assert.ok(baks.length >= 1, `expected at least one .bak.* file, got: ${files.join(', ')}`);
  });

  test('unknown /api/* route returns JSON 404 (not HTML fallback)', async () => {
    const r = await fetch(`${base()}/api/this-endpoint-does-not-exist`);
    assert.equal(r.status, 404);
    assert.equal(r.headers.get('content-type'), 'application/json');
    const body = await r.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, 'not found');
  });

  test('teardown: stop the server', () => {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  });
});

// ── buildGmailStatus (Gmail diagnostic shape) ───────────────────────────────

describe('buildGmailStatus', () => {
  const baseInput = (overrides = {}) => ({
    clientId: 'CID',
    clientSecret: 'CSE',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    redirectUri: 'http://localhost:4747/auth/gmail/callback',
    tokens: null,
    polling: false,
    fastPolling: false,
    cache: { signals: [], scanned_at: null },
    ...overrides,
  });

  test('reports unconfigured when client id missing', () => {
    const s = buildGmailStatus(baseInput({ clientId: '' }));
    assert.equal(s.configured, false);
    assert.equal(s.hasClientId, false);
    assert.deepEqual(s.missingEnv, ['GMAIL_CLIENT_ID']);
  });

  test('reports unconfigured when client secret missing', () => {
    const s = buildGmailStatus(baseInput({ clientSecret: '' }));
    assert.equal(s.configured, false);
    assert.equal(s.hasClientSecret, false);
    assert.deepEqual(s.missingEnv, ['GMAIL_CLIENT_SECRET']);
  });

  test('reports configured but no tokens for fresh setup', () => {
    const s = buildGmailStatus(baseInput());
    assert.equal(s.configured, true);
    assert.equal(s.hasTokens, false);
    assert.equal(s.tokenExpired, null);
    assert.equal(s.tokenExpiresIn, null);
    assert.deepEqual(s.missingEnv, []);
  });

  test('reports tokens present and not expired', () => {
    const now = 1000_000_000;
    const expiry = now + 60_000;
    const s = buildGmailStatus(baseInput({
      tokens: { refresh_token: 'r', access_token: 'a', expiry },
      now,
    }));
    assert.equal(s.hasTokens, true);
    assert.equal(s.tokenExpired, false);
    assert.equal(s.tokenExpiresIn, 60);
  });

  test('reports tokens expired when past expiry', () => {
    const now = 2000;
    const s = buildGmailStatus(baseInput({
      tokens: { refresh_token: 'r', expiry: 1000 },
      now,
    }));
    assert.equal(s.tokenExpired, true);
    assert.equal(s.tokenExpiresIn, 0);
  });

  test('treats access_token without refresh_token as no-tokens', () => {
    // refresh_token is the long-lived credential; without it we can't recover
    // a session, so the diagnostic should treat the user as disconnected.
    const s = buildGmailStatus(baseInput({
      tokens: { access_token: 'a' },
    }));
    assert.equal(s.hasTokens, false);
  });

  test('counts cached signals split into total + active', () => {
    const cache = {
      signals: [
        { id: '1', dismissed: false },
        { id: '2', dismissed: true },
        { id: '3', dismissed: false },
      ],
      scanned_at: '2026-05-01T12:00:00Z',
    };
    const s = buildGmailStatus(baseInput({ cache }));
    assert.equal(s.cachedSignalCount, 3);
    assert.equal(s.activeSignalCount, 2);
    assert.equal(s.lastScannedAt, '2026-05-01T12:00:00Z');
  });

  test('handles missing cache gracefully', () => {
    const s = buildGmailStatus(baseInput({ cache: {} }));
    assert.equal(s.cachedSignalCount, 0);
    assert.equal(s.activeSignalCount, 0);
    assert.equal(s.lastScannedAt, null);
  });

  test('passes polling + fastPolling flags through', () => {
    const s = buildGmailStatus(baseInput({ polling: true, fastPolling: true }));
    assert.equal(s.polling, true);
    assert.equal(s.fastPolling, true);
  });

  test('never leaks the actual client id or secret values', () => {
    const s = buildGmailStatus(baseInput({ clientId: 'super-secret-client-id', clientSecret: 'super-secret' }));
    const json = JSON.stringify(s);
    assert.ok(!json.includes('super-secret-client-id'), 'client id leaked');
    assert.ok(!json.includes('super-secret'), 'client secret leaked');
  });

  test('emits both missing env names when both unset', () => {
    const s = buildGmailStatus(baseInput({ clientId: '', clientSecret: '' }));
    assert.deepEqual(s.missingEnv, ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET']);
  });

  test('coerces undefined polling/fastPolling to false', () => {
    const s = buildGmailStatus(baseInput({ polling: undefined, fastPolling: undefined }));
    assert.equal(s.polling, false);
    assert.equal(s.fastPolling, false);
  });
});
