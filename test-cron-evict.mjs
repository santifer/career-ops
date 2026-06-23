/**
 * test-cron-evict.mjs — Regression suite for the cron eviction path.
 *
 * Proof 3 (always, no network): shouldEvict() app-logic guard is correct and
 *   independent of RLS — including the SPA-safety rule that 'insufficient_content'
 *   never triggers eviction.
 *
 * Proofs 0/1/2 (only when Supabase creds are in .env):
 *   0: --dry-run writes/deletes nothing.
 *   1: a dead status='new' stub is evicted and lands in seen_urls(final_status='expired').
 *   2: a non-'new' row (status='scored') is NEVER deleted, even when its URL is "dead".
 *
 * Style mirrors test-cron-rls-negative.mjs:
 * - Hand-load .env before any module-level env reads.
 * - TAG-keyed stubs so cleanup never touches real production rows.
 * - Self-cleaning finally block using the dashboard credential.
 * - process.exit(0) on all-pass, process.exit(1) on any failure.
 */

import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Load .env before dynamic imports so supabase-client.mjs sees the env vars.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
}

// Dynamic import so supabase-client.mjs picks up the env vars we just loaded.
const { shouldEvict, evictExpiredNewStubsCron } = await import('./queue-store.mjs');

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log(`PASS: ${m}`); };
const bad = (m) => { fail++; console.log(`FAIL: ${m}`); };

// ── Proof 3: shouldEvict() app-logic guard (no network, no credentials) ───────

console.log('── Proof 3: shouldEvict() app-logic guard ──');

const pureGuardCases = [
  // Strong expired signals → evict.
  [{ status: 'new' }, { result: 'expired', code: 'http_gone'     }, true,  "new + http_gone → evict"],
  [{ status: 'new' }, { result: 'expired', code: 'expired_url'   }, true,  "new + expired_url → evict"],
  [{ status: 'new' }, { result: 'expired', code: 'expired_body'  }, true,  "new + expired_body → evict"],
  [{ status: 'new' }, { result: 'expired', code: 'listing_page'  }, false, "new + listing_page → keep (HTTP omits applyControls — could be a live board)"],
  // Non-'new' status — never evict regardless of verdict.
  [{ status: 'scored'        }, { result: 'expired', code: 'http_gone' }, false, "scored + http_gone → keep (non-new guard)"],
  [{ status: 'prepare-queued'}, { result: 'expired', code: 'http_gone' }, false, "prepare-queued + http_gone → keep (non-new guard)"],
  // Weak / uncertain / active verdicts — never evict.
  [{ status: 'new' }, { result: 'uncertain', code: 'no_apply_control'  }, false, "new + uncertain → keep"],
  [{ status: 'new' }, { result: 'active',    code: 'apply_control_visible' }, false, "new + active → keep"],
  [{ status: 'new' }, { result: 'uncertain', code: 'bot_challenge'     }, false, "new + bot_challenge → keep"],
  [{ status: 'new' }, { result: 'uncertain', code: 'fetch_error'       }, false, "new + fetch_error → keep (transient)"],
  [{ status: 'new' }, { result: 'uncertain', code: 'access_blocked'    }, false, "new + access_blocked → keep"],
  // SPA safety: insufficient_content is NOT a strong signal — live SPA shells look empty.
  [{ status: 'new' }, { result: 'expired',   code: 'insufficient_content' }, false, "new + insufficient_content → keep (SPA safety)"],
];

for (const [row, verdict, expected, label] of pureGuardCases) {
  const got = shouldEvict(row, verdict);
  if (got === expected) ok(`shouldEvict: ${label}`);
  else bad(`shouldEvict: ${label} — expected ${expected}, got ${got}`);
}

// ── Network proofs (skip cleanly if Supabase env absent) ──────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const DASH         = process.env.SUPABASE_DASHBOARD_KEY;
const CRON_APIKEY  = process.env.SUPABASE_CRON_PUBLISHABLE_KEY;
const CRON_JWT     = process.env.SUPABASE_CRON_JWT;

if (!SUPABASE_URL || !DASH || !CRON_APIKEY || !CRON_JWT) {
  console.log('\nNetwork proofs skipped — Supabase env vars not in .env (expected on fresh clone)');
  console.log(`\n${fail === 0 ? 'EVICT GUARD PROVEN' : 'EVICT GUARD BROKEN'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

const REST = `${SUPABASE_URL}/rest/v1`;
const TAG  = `evict-${Date.now()}`;

const dashHeaders = (e={}) => ({
  apikey: DASH, Authorization: `Bearer ${DASH}`,
  "Content-Type": "application/json", ...e,
});

async function req(headers, method, path, body) {
  const res = await fetch(`${REST}${path}`, {
    method,
    headers: { ...headers, Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, rows: Array.isArray(json) ? json.length : null, json };
}

// Tag-scoped check stub: marks ONLY this run's URLs as expired. Any real
// status='new' row whose URL does not contain TAG is returned as 'active' and
// therefore kept — so this test never touches production data.
const tagCheck = async (url) =>
  url.includes(TAG)
    ? { result: 'expired', code: 'http_gone',           reason: 'test stub' }
    : { result: 'active',  code: 'apply_control_visible', reason: 'not a test row' };

console.log('\n── Network proofs: eviction boundary ──');

try {
  // Seed Row A: status='new' — expected eviction candidate.
  const rowA = {
    id: randomUUID(), company: "Evict Test Co", title: TAG,
    url: `https://example.com/${TAG}-new-${randomUUID().slice(0, 8)}`,
    ats: "manual", status: "new", source: "manual",
  };
  const seedA = await req(dashHeaders(), "POST", "/active_roles", rowA);
  if (seedA.status >= 200 && seedA.status < 300 && seedA.rows > 0) {
    ok("seed: Row A inserted (status='new', expected eviction candidate)");
  } else {
    bad(`seed Row A failed (${seedA.status}): ${JSON.stringify(seedA.json)}`);
    throw new Error("seed-a");
  }

  // Seed Row B: status='scored' — must never be touched by cron eviction.
  const rowB = {
    id: randomUUID(), company: "Evict Test Co", title: TAG,
    url: `https://example.com/${TAG}-scored-${randomUUID().slice(0, 8)}`,
    ats: "manual", status: "scored", source: "manual",
  };
  const seedB = await req(dashHeaders(), "POST", "/active_roles", rowB);
  if (seedB.status >= 200 && seedB.status < 300 && seedB.rows > 0) {
    ok("seed: Row B inserted (status='scored', must never be evicted)");
  } else {
    bad(`seed Row B failed (${seedB.status}): ${JSON.stringify(seedB.json)}`);
    throw new Error("seed-b");
  }

  // ── Proof 0: dry-run writes nothing ────────────────────────────────────────
  console.log('\n── Proof 0: dry-run writes nothing ──');

  const dryResult = await evictExpiredNewStubsCron({ check: tagCheck, dryRun: true });

  if (dryResult.dryRun === true) ok("dry-run: dryRun flag echoed in result");
  else bad(`dry-run: expected dryRun=true in result, got ${JSON.stringify(dryResult)}`);

  if (dryResult.evicted >= 1) {
    ok(`dry-run: reported ${dryResult.evicted} would-evict candidate(s) (Row A)`);
  } else {
    bad(`dry-run: expected >=1 would-evict, got ${dryResult.evicted} — Row A should be a candidate`);
  }

  const afterDryNewRows = await req(dashHeaders(), "GET", `/active_roles?title=eq.${TAG}&status=eq.new`);
  if (afterDryNewRows.rows >= 1) ok("dry-run: Row A still in active_roles (no deletes performed)");
  else bad("dry-run: Row A was deleted — dry-run must not delete");

  const afterDrySeen = await req(dashHeaders(), "GET", `/seen_urls?title=eq.${TAG}`);
  if (afterDrySeen.rows === 0) ok("dry-run: seen_urls has no entry for TAG (no writes performed)");
  else bad(`dry-run: seen_urls already has ${afterDrySeen.rows} row(s) — dry-run must not write`);

  // ── Proof 1: real eviction — Row A is deleted and recorded ─────────────────
  console.log('\n── Proof 1: real eviction of status=\'new\' row ──');

  const evictResult = await evictExpiredNewStubsCron({ check: tagCheck, dryRun: false });

  if (evictResult.evicted >= 1) ok(`eviction: reported ${evictResult.evicted} evicted`);
  else bad(`eviction: expected >=1 evicted, got ${evictResult.evicted}`);

  const afterEvictNew = await req(dashHeaders(), "GET", `/active_roles?title=eq.${TAG}&status=eq.new`);
  if (afterEvictNew.rows === 0) ok("eviction: Row A gone from active_roles");
  else bad(`eviction: Row A still in active_roles (${afterEvictNew.rows} row(s)) — not evicted`);

  const afterEvictSeen = await req(dashHeaders(), "GET", `/seen_urls?title=eq.${TAG}`);
  if (afterEvictSeen.rows >= 1) ok("eviction: Row A recorded in seen_urls");
  else bad("eviction: Row A NOT in seen_urls — dedup record missing, will be re-inserted");

  if (afterEvictSeen.rows >= 1 && afterEvictSeen.json[0]?.final_status === 'expired') {
    ok("eviction: seen_urls.final_status='expired'");
  } else if (afterEvictSeen.rows >= 1) {
    bad(`eviction: seen_urls.final_status='${afterEvictSeen.json[0]?.final_status}' — expected 'expired'`);
  }

  // ── Proof 2: Row B (status='scored') is untouched ──────────────────────────
  console.log('\n── Proof 2: non-\'new\' rows are never deleted ──');

  const afterEvictScored = await req(dashHeaders(), "GET", `/active_roles?title=eq.${TAG}&status=eq.scored`);
  if (afterEvictScored.rows >= 1) {
    ok("eviction: Row B (status='scored') still in active_roles — non-new rows protected");
  } else {
    bad("eviction: Row B (status='scored') was deleted — cron must never touch non-new rows");
  }

} finally {
  // Self-cleaning: dashboard credential removes all tagged rows from both tables.
  const c1 = await req(dashHeaders(), "DELETE", `/active_roles?title=eq.${TAG}`);
  const c2 = await req(dashHeaders(), "DELETE", `/seen_urls?title=eq.${TAG}`);
  console.log(`\ncleanup: removed ${c1.rows ?? "?"} active_roles row(s), ${c2.rows ?? "?"} seen_urls row(s)`);
}

console.log(`\n${fail === 0 ? 'EVICT BOUNDARY PROVEN' : 'EVICT BOUNDARY BROKEN'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
