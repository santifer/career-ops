/**
 * invite-match.test.mjs — regression tests for invite-match.mjs's ambiguous-
 * match ranking, which is the part most likely to silently regress: a wrong
 * top candidate is worse than no candidate at all. Also covers the #2098
 * rejection-classification and --apply-to-Rejected additions.
 *
 * Run: node invite-match.test.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { matchInvite, normalizeCompanyName, classifyEmail, analyzeInvite, applyRejectionStatus } from './invite-match.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.log(`  FAIL: ${label}`);
    console.log(`    expected: ${e}`);
    console.log(`    actual:   ${a}`);
  }
}

const rows = [
  { num: 201, company: 'Northwind Traders', role: 'Ops Coordinator', status: 'Applied', date: '2026-05-01', notes: '' },
  { num: 202, company: 'Northwind Traders', role: 'HR Assistant', status: 'Interview', date: '2026-05-15', notes: '' },
  { num: 203, company: 'Northwind Traders', role: 'Analyst', status: 'Rejected', date: '2026-04-10', notes: 'Rejected 2026-04-20' },
];

// Three tracker rows for the same company at three different statuses — the
// Interview row must outrank both Applied and Rejected, since an in-progress
// interview is the most likely thing a new invite email is about.
const result = matchInvite({ company: 'Northwind Traders', date: null, reqId: null }, rows);
eq('all three same-company candidates are returned, not just the top one', result.length, 3);
eq('Interview-status row ranks first among same-name candidates', result[0].appNumber, 202);
eq('Rejected-status row ranks last among same-name candidates', result[result.length - 1].appNumber, 203);

// A company name that only partially overlaps (e.g. recruiter drops a
// division name) must still resolve, but must not outrank an exact match
// when both are present in the tracker.
const mixedRows = [
  ...rows,
  { num: 204, company: 'Northwind', role: 'Coordinator', status: 'Applied', date: '2026-06-01', notes: '' },
];
const partial = matchInvite({ company: 'Northwind', date: null, reqId: null }, mixedRows);
eq('exact "Northwind" match outranks the longer "Northwind Traders" partial matches', partial[0].appNumber, 204);

// normalizeCompanyName must be idempotent — normalizing an already-normalized
// string must return it unchanged, otherwise repeated normalization could
// drift the matching key across call sites.
const once = normalizeCompanyName('Acme Technologies Inc.');
eq('normalizeCompanyName is idempotent', normalizeCompanyName(once), once);

// A req ID that appears verbatim in a row's notes must outrank a same-name
// row without it, even though both have identical name similarity — this is
// the strongest disambiguation signal the matcher has, so it must actually
// move the ranking, not just add a negligible tiebreaker.
const reqIdRows = [
  { num: 301, company: 'Fabrikam', role: 'Engineer', status: 'Applied', date: '2026-05-01', notes: '' },
  { num: 302, company: 'Fabrikam', role: 'Engineer II', status: 'Applied', date: '2026-05-02', notes: 'req R-4821 mentioned' },
];
const reqIdResult = matchInvite({ company: 'Fabrikam', date: null, reqId: 'R-4821' }, reqIdRows);
eq('row with matching reqId in notes outranks identical-name row without it', reqIdResult[0].appNumber, 302);

// The req-ID boost must be case-insensitive: the invite and the tracker
// notes may case the same ID differently ("r-4821" vs "R-4821"), and a
// casing mismatch silently dropping the strongest signal is exactly the
// kind of regression this suite exists to catch.
const reqIdCaseResult = matchInvite({ company: 'Fabrikam', date: null, reqId: 'r-4821' }, reqIdRows);
eq('reqId boost still applies when invite cases the ID differently than the notes', reqIdCaseResult[0].appNumber, 302);

// Two distinct companies that each end in a *different pair* of chained
// generic descriptor words must not erode down to the same root — this is
// the actual over-stripping bug raised on PR #1497: chaining generic-word
// removal (not just legal-suffix removal) let "X Solutions Group" and
// "X Technologies Holdings" both collapse all the way to "x". Limiting
// generic-descriptor stripping to a single, non-chained pass stops at the
// first strip instead of eating through both words.
eq(
  'chained generic descriptors ("Solutions Group" vs "Technologies Holdings") do not erode to the same key',
  normalizeCompanyName('Northwind Solutions Group') === normalizeCompanyName('Northwind Technologies Holdings'),
  false
);

// --- #2098: rejection classification is unaffected-invite-classification regression check ---

eq('invite-phrased text still classifies as "invite" (no regression)', classifyEmail('Looking forward to interviewing with you next week for the Analyst role.'), 'invite');
eq('rejection-phrased text classifies as "rejection"', classifyEmail('Unfortunately, we have decided to move forward with other candidates.'), 'rejection');
eq('unrelated text classifies as "unknown"', classifyEmail('Your order has shipped.'), 'unknown');

const invitePastRows = [
  { num: 401, company: 'Fabrikam', role: 'Engineer', status: 'Applied', date: '2026-06-01', notes: '' },
];
const inviteAnalysis = analyzeInvite('Schedule Your Phone Screen – Fabrikam Opportunity', invitePastRows);
eq('analyzeInvite classification for an invite email is "invite" (matching behavior unchanged from before #2098)', inviteAnalysis.classification, 'invite');
eq('analyzeInvite still returns the same candidates for an invite email as before #2098', inviteAnalysis.candidates.length, 1);

// --- #2098: --apply-to-Rejected path (applyRejectionStatus, real sandboxed tracker) ---

function makeSandboxTracker(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'co-invitematch-unit-'));
  const tracker = join(dir, 'applications.md');
  writeFileSync(tracker, [
    '# Applications Tracker',
    '',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    ...rows,
    '',
  ].join('\n'));
  return { dir, tracker };
}

{
  const sb = makeSandboxTracker([
    '| 1 | 2026-06-01 | Fabrikam | Engineer | 4.0/5 | Applied | ❌ | — | — |',
  ]);
  const applied = applyRejectionStatus(1, { appsFile: sb.tracker });
  eq('applyRejectionStatus (single confident match) reports the Rejected transition', applied.newStatus, 'Rejected');
  eq('applyRejectionStatus (single confident match) reports changed:true', applied.changed, true);
  const content = readFileSync(sb.tracker, 'utf-8');
  eq('applyRejectionStatus actually writes Rejected to the tracker on disk', /\|\s*Rejected\s*\|/.test(content), true);
  rmSync(sb.dir, { recursive: true, force: true });
}

{
  // Re-running against an already-Rejected row must be a safe no-op, not an error.
  const sb = makeSandboxTracker([
    '| 1 | 2026-06-01 | Fabrikam | Engineer | 4.0/5 | Rejected | ❌ | — | — |',
  ]);
  const applied = applyRejectionStatus(1, { appsFile: sb.tracker });
  eq('applyRejectionStatus is idempotent — no-op re-run reports changed:false', applied.changed, false);
  eq('applyRejectionStatus idempotent re-run still reports newStatus Rejected', applied.newStatus, 'Rejected');
  rmSync(sb.dir, { recursive: true, force: true });
}

{
  // A tracker # that doesn't exist must fail structured, not throw uncaught.
  const sb = makeSandboxTracker([
    '| 1 | 2026-06-01 | Fabrikam | Engineer | 4.0/5 | Applied | ❌ | — | — |',
  ]);
  const applied = applyRejectionStatus(999, { appsFile: sb.tracker });
  eq('applyRejectionStatus on a nonexistent tracker # reports a structured error, not a thrown exception', typeof applied.error, 'string');
  rmSync(sb.dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failures:', failures.join(', '));
  process.exit(1);
}
