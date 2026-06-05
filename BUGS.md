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
| B1 | P2 | In-progress | 2026-06-04 | `auto-submit.mjs` exit-code contract not enforced at call-site — callers treat any non-zero as "blocked" |
| B4 | P3 | New | 2026-06-04 | `data/last-refresh.json` `ran_at` timezone is local system time; cross-timezone Cowork runs produce ambiguous timestamps |
| r8 | P2 | In-progress | 2026-06-04 | State model triplication: `states.yml`, `normalize-statuses.mjs`, `dashboard/internal/data/career.go` diverge — codegen scaffold live, migration pending |
| r9 | P3 | Closed | 2026-06-04 | Uncommitted work sitting on local main — no branch, no PR; closed by `chore/safe-edit-kit` PR |
| B2 | P3 | New | 2026-06-04 | `scan-linkedin.mjs` HTTP-999 / authwall rate-limit not adaptive — no backoff, always skips entire query on first 999 |
| GoVerify | P2 | Blocked | 2026-06-04 | `dashboard/internal/data/career.go` state list hand-coded and out-of-sync with `states.yml` — no compile-time check. `go build` blocked: Go binary not on PATH after winget install (session boundary issue). |
| B6 | P2 | In-progress | 2026-06-05 | Pulse Engine MVP runs in browser; MCPs only callable from Claude sessions — ingestion must happen scheduled-task-side and write to a fetchable store |
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
**Status:** BLOCKED — `go build` failed because Go binary is not on PATH after winget install on 2026-06-05. Likely a session-boundary PATH issue (winget MSI updated system PATH but the running shell pre-dates it). `gen/states.go` generated and committed; migration to `career.go` pending build verification.
**Next action:** Open a fresh terminal. Run `go version`. If found: `cd dashboard && go build ./... && go vet ./...`. If clean, close GoVerify. If not found: winget likely failed silently — install via https://go.dev/dl/ manually.
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

---

### B6 — MCP calls only callable from Claude sessions, not browser
**Repro:** The Pulse Engine MVP (`dashboard/job-pulse-kanban.html`) runs in a browser. The Indeed MCP and Dice MCP are only callable from within a Claude/AI session. The `fetchIndeedRSS()` UI button in the Kanban is a stub — it cannot call the MCP directly from a browser context.
**Impact:** Secondary MCP ingestion MUST happen on the scheduled-task side (inside the 1am Claude session), write to `data/jobs-incoming-{date}.json`, and the SKILL then reads that file to inject cards into the Kanban. The browser UI cannot drive ingestion.
**Status:** Ingestion scaffolding built (`adapter-indeed.mjs`, `adapter-dice.mjs`, `ingest-runner.mjs`). 1am SKILL Step 1.5 (MCP call instructions) added. Pending: live test on tomorrow's 6am run.
**Next action:** Validate read path — confirm 1am SKILL can write `data/jobs-incoming-{date}.json` and the resulting Kanban injection works end-to-end.
**Owner:** Rahil

---

## Kaizens

### K-2026-06-05-1 — Always grep available MCPs before building new integrations
**What happened:** The session considered building an Indeed Publisher API integration while Indeed MCP was already installed and idle in the same session.
**Rule:** Before implementing any new data-source integration, call `ToolSearch` or list available MCPs and verify none of them already cover the source. Two minutes of inspection saved hours of implementation.
**Applies to:** Any new external data source (LinkedIn, Glassdoor, ZipRecruiter, etc.).
