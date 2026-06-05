# BUGS.md — Career-Ops Bug & Tech-Debt Tracker

Single source of truth for open defects and tech debt in the career-ops + AutoSubmit stack.
The 8am report's 🔧 section reads from CLAUDE.md's Tech Debt Log for resolved items;
this file tracks **open** work.

**Severity:** P1 = data-loss / silent failure | P2 = blocks automation | P3 = degrades quality | P4 = hygiene
**Status:** New | In-progress | Blocked | Closed

---

## Open

| ID | Sev | Status | Opened | Title |
|----|-----|--------|--------|-------|
| B0 | P2 | New | 2026-06-04 | `check-syntax.mjs` critical-file list not exhaustive — new .mjs files added after TD-35 not auto-enrolled |
| r7 | P1 | In-progress | 2026-06-04 | OneDrive file-corruption (trailing null bytes / mid-token truncation) silently breaks .mjs files |
| B1 | P2 | New | 2026-06-04 | `auto-submit.mjs` exit-code contract not enforced at call-site — callers treat any non-zero as "blocked" |
| B4 | P3 | New | 2026-06-04 | `data/last-refresh.json` `ran_at` timezone is local system time; cross-timezone Cowork runs produce ambiguous timestamps |
| r8 | P2 | In-progress | 2026-06-04 | State model triplication: `states.yml`, `normalize-statuses.mjs`, `dashboard/internal/data/career.go` diverge — codegen scaffold live, migration pending |
| r9 | P3 | Closed | 2026-06-04 | Uncommitted work sitting on local main — no branch, no PR; closed by `chore/safe-edit-kit` PR |
| B2 | P3 | New | 2026-06-04 | `scan-linkedin.mjs` HTTP-999 / authwall rate-limit not adaptive — no backoff, always skips entire query on first 999 |
| GoVerify | P2 | New | 2026-06-04 | `dashboard/internal/data/career.go` state list hand-coded and out-of-sync with `states.yml` — no compile-time check |
| B3 | P3 | New | 2026-06-04 | `dedup-tracker.mjs` role-match overlap floor (`Math.min(2, smaller)`) still misses single-word roles with different suffixes (e.g. "Engineer" vs "Engineering") |
| r10 | P4 | New | 2026-06-04 | `batch/tracker-additions/*.tsv` files accumulate without cleanup — no archival or max-age policy |

---

## Closed

| ID | Sev | Closed | Title | Resolution |
|----|-----|--------|-------|------------|
| B5 | P1 | 2026-06-02 | Pre-auth Workday sessions not persisted — every run hits auth wall | `workday-login.mjs` implemented; cookie/localStorage saved per tenant |
| r9 | P3 | 2026-06-04 | Uncommitted work on local main, no branch/PR | Closed by `chore/safe-edit-kit` PR |

---

## Detail

### B0 — check-syntax.mjs critical-file list not exhaustive
**Repro:** Add a new .mjs file (e.g. `process-autosubmit-queue.mjs`). It is NOT in the 11-file list in `check-syntax.mjs`. A truncation on this file goes undetected by TD-35 gate.
**Next action:** Rewrite `check-syntax.mjs` to glob `*.mjs` at root instead of using a hardcoded list.
**Owner:** Rahil

---

### r7 — OneDrive file-corruption pattern
**Repro:** Files saved via OneDrive sync on Windows can receive trailing `\0` bytes or be truncated mid-token, particularly during concurrent writes. Root cause is OneDrive cloud-sync racing with write completion. The safe-edit kit (this PR) adds the guardrail; moving the repo off OneDrive is the permanent fix.
**Status:** Guardrails live (`scripts/safe-edit.mjs`, `scripts/pre-commit.sh`). Repo already on `C:\Users\rahil\career-ops` (NOT OneDrive — good). Monitor for recurrence.
**Next action:** Verify repo path is not under any OneDrive-managed folder tree. If so, move it.
**Owner:** Rahil

---

### B1 — exit-code contract not enforced
**Repro:** `run-autosubmit.bat` calls `auto-submit.mjs` and checks `%ERRORLEVEL%` but treats 1, 2, and 3 identically as "failed". Exit code 2 = SuS-blocked (new company), 3 = form-blocked — these are qualitatively different and should route to different columns.
**Next action:** Add exit-code enum to `docs/autosubmit-exit-codes.md`; update bat to handle each code distinctly.
**Owner:** Rahil

---

### B4 — last-refresh.json timezone ambiguity
**Repro:** `ran_at` is written with `new Date().toISOString()` which uses UTC. But display in 8am report converts to local time via system locale. If the Cowork VM is in a different timezone than the Windows bat, `ran_at` comparisons are off by several hours.
**Next action:** Standardize `ran_at` to always UTC; document in schema comment.
**Owner:** Rahil

---

### r8 — state model triplication
**Repro:** Add a new state. Must update `templates/states.yml` AND `normalize-statuses.mjs` AND `dashboard/internal/data/career.go`. Any one being missed causes silent state-mismatch bugs.
**Status:** `scripts/codegen-states.mjs` generates `gen/states.json|.js|.go`. Full migration (replacing hand-coded lists in normalize-statuses.mjs and career.go) is pending.
**Next action:** Wire `gen/states.js` into `normalize-statuses.mjs`; wire `gen/states.go` into dashboard package.
**Owner:** Rahil

---

### B2 — LinkedIn 999 no backoff
**Repro:** Run `scan-linkedin.mjs` during peak hours. LinkedIn returns HTTP 999 on first request; the script logs "authwall — skipping" and moves to the next query with no delay. Entire session may 999 on all queries.
**Next action:** Add exponential backoff (1s, 2s, 4s cap 30s) on 999; retry up to 3 times per query before skipping.
**Owner:** Rahil

---

### GoVerify — dashboard state list out of sync
**Repro:** `dashboard/internal/data/career.go` contains a hand-coded `validStates` map that mirrors `states.yml`. Adding `Blocked` to states.yml (done) without updating career.go causes the dashboard to fail on `Blocked` rows.
**Status:** `gen/states.go` now generated by codegen. Migration: replace `validStates` in career.go with import from gen package.
**Next action:** Update `dashboard/internal/data/career.go` to use `gen.NormalizeState()`.
**Owner:** Rahil

---

### B3 — dedup role-match misses suffix variants
**Repro:** `dedup-tracker.mjs` will not deduplicate "Software Engineer" vs "Software Engineering" because after stop-word removal both reduce to the same token but overlap check requires `Math.min(2, smaller)` words to match, and single-word match is blocked by the floor.
**Next action:** Lower floor to 1 for exact single-token matches after normalization.
**Owner:** Rahil

---

### r10 — tracker-additions TSV accumulation
**Repro:** `batch/tracker-additions/` grows unbounded; after `merge-tracker.mjs` runs, the TSV files are no longer needed but remain in the directory. On a large batch this is hundreds of files.
**Next action:** Add archive step to `merge-tracker.mjs` — move processed TSVs to `batch/tracker-additions/archive/YYYY-MM/`.
**Owner:** Rahil
