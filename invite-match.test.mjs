/**
 * invite-match.test.mjs — regression tests for invite-match.mjs's ambiguous-
 * match ranking, which is the part most likely to silently regress: a wrong
 * top candidate is worse than no candidate at all.
 *
 * Run: node invite-match.test.mjs
 */

import { matchInvite, normalizeCompanyName } from './invite-match.mjs';

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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('Failures:', failures.join(', '));
  process.exit(1);
}
