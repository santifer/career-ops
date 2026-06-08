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
| r7 | P1 | In-progress | 2026-06-04 | OneDrive file-corruption (trailing null bytes / mid-token truncation) silently breaks .mjs files |
| B4 | P3 | New | 2026-06-04 | `data/last-refresh.json` `ran_at` timezone is local system time; cross-timezone Cowork runs produce ambiguous timestamps |
| r8 | P2 | In-progress | 2026-06-04 | State model triplication: `states.yml`, `normalize-statuses.mjs`, `dashboard/internal/data/career.go` diverge — codegen scaffold live, migration pending |
| B2 | P3 | New | 2026-06-04 | `scan-linkedin.mjs` HTTP-999 / authwall rate-limit not adaptive — no backoff, always skips entire query on first 999 |
| B6 | P2 | In-progress | 2026-06-05 | Pulse Engine MVP runs in browser; MCPs only callable from Claude sessions — ingestion must happen scheduled-task-side and write to a fetchable store |
| B7 | P2 | New | 2026-06-05 | AutoSubmit launches browser on expired/redirect listings — `no-submit-button`×469 + `dead-listing-redirect`×57 dominate blocks; needs submit-time ATS liveness re-check |
| B8 | P1 | New | 2026-06-08 | Kanban HTML missing 7 functions lost to r7 truncation (`getGoldBadge`, `calcGoldScore`, `isHappyPath`, `isReferralPath`, `cardSortTier`, `buildReferralMessage`, `autoApplyCard`) — reconstructed in K2 PR but need audit |
| B3 | P3 | New | 2026-06-04 | `dedup-tracker.mjs` role-match overlap floor (`Math.min(2, smaller)`) still misses single-word roles with different suffixes (e.g. "Engineer" vs "Engineering") |
| r10 | P4 | New | 2026-06-04 | `batch/tracker-additions/*.tsv` files accumulate without cleanup — no archival or max-age policy |

---

## Closed

| ID | Sev | Closed | Title | Resolution |
|----|-----|--------|-------|------------|
| B0 | P2 | 2026-06-05 | `check-syntax.mjs` critical-file list not exhaustive | Rewritten to glob 39 root `.mjs` + validate 7 critical JSON + NUL scan; caught live `last-refresh.json` corruption |
| GoVerify | P2 | 2026-06-08 | `career.go` state list hand-coded, no compile-time check vs `states.yml` | `go build ./...` verified clean on Rahil's Windows host (go1.26.4). `gen/states.go` committed. Dashboard builds. |
| B1 | P2 | 2026-06-08 | exit-code contract not enforced at call-site | Ingestion pipeline (Phase 1+2) supersedes the single-script exit-code contract. Bat-level handling tracked separately. |
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
**Status 2026-06-08:** New incident — 5 scripts confirmed truncated overnight (`auto-submit.mjs`, `build-autosubmit-queue.mjs`, `merge-bat-results.mjs`, `dedup-tracker.mjs`, `linkedin-dm.mjs`) in Cowork session files. The Cowork session lives on OneDrive; guardrails are on career-ops but NOT on the Pulse Referral Engine / Cowork session folder. Additionally, the kanban HTML was missing 7 function definitions — likely a truncation event on the artifact during writing.
**Next action:** (1) Deploy `scripts/safe-edit.mjs` + `scripts/pre-commit.sh` to the Cowork project folder (OneDrive write-blocked from sandbox — Rahil must copy manually). (2) Add `node scripts/safe-edit.mjs --selftest` to the 1am SKILL as a pre-flight check.
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
**CLOSED 2026-06-08** — Rahil ran `cd dashboard && go build ./...` on Windows host (go1.26.4). Zero errors. All dashboard packages built clean with the `career.go` edits and `gen/states.go` committed by `chore/safe-edit-kit`. The earlier `Blocked` status was a sandbox PATH issue (winget MSI updated system PATH but the shell predated it) — not an actual code defect.
**Remaining work (tracked as r8):** Full migration of `career.go`'s hand-coded state switch to import from `gen/states.go` is still pending — but the build is proven safe for now.

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
**Missing files (as of 2026-06-08):** `data/jobs-incoming-{date}.json` is not yet written by any live run. The 1am SKILL Step 1.5 has been defined but not executed. The Kanban's Worker integration (`fetchIndeedRSS`) now calls the Cloudflare Worker directly from the browser — this IS working (1,780 live jobs fetched in K2 verification). The MCP-to-json path is still pending live test.
**Status:** In-progress. Worker integration live in browser (K2). MCP → ingest-runner → json path defined (Phase 2) but not live-tested.
**Next action:** Run the 1am SKILL manually once to confirm Step 1.5 can write `data/jobs-incoming-{date}.json` without errors.
**Owner:** Rahil

---

### B7 — AutoSubmit launches browser on expired/redirect listings
**Repro:** `auto-submit.mjs` blocks on `no-submit-button` (×469) and `dead-listing-redirect` (×57) — job pages that have expired and redirect to a marketing page or careers home. The submit-time ATS API verification gate fires at Kanban injection time, but pages can expire AFTER being injected. AutoSubmit wastes a full Playwright launch per dead URL.
**Next action:** Add a lightweight submit-time liveness check in `auto-submit.mjs` before launching Playwright: re-verify Greenhouse/Lever via their APIs (`boards-api.greenhouse.io` / `api.lever.co`). If 404 → exit 3 with `dead-listing` flag, skip browser launch entirely.
**Owner:** Rahil

---

### B8 — Kanban HTML missing 7 functions from r7 truncation
**Repro:** `dashboard/job-pulse-kanban.html` was missing `getGoldBadge`, `calcGoldScore`, `isHappyPath`, `isReferralPath`, `cardSortTier`, `buildReferralMessage`, `autoApplyCard`. Discovered when `importWorkerJob()` triggered `render()` which called them. The source kanban (pending-uploads artifact) was likely truncated during a Cowork write event.
**Status:** All 7 functions reconstructed from call-site context and CSS class names in K2 PR. Verified: Worker import works, no console errors.
**Concern:** The reconstructed logic is best-effort (especially `calcGoldScore` weights and `isHappyPath` column set). Rahil should review these functions against the original intent when convenient.
**Next action:** When a full kanban source is available (Cowork session with the original), diff against the reconstructed versions. Add unit tests for `calcGoldScore` and `isHappyPath`.
**Owner:** Rahil

---

## Kaizens

### K-2026-06-05-1 — Always grep available MCPs before building new integrations
**What happened:** The session considered building an Indeed Publisher API integration while Indeed MCP was already installed and idle in the same session.
**Rule:** Before implementing any new data-source integration, call `ToolSearch` or list available MCPs and verify none of them already cover the source. Two minutes of inspection saved hours of implementation.
**Applies to:** Any new external data source (LinkedIn, Glassdoor, ZipRecruiter, etc.).

---

### K-2026-06-05-2 — Use CLI OAuth flows over web signups when possible
**What happened:** Cloudflare Worker deployment was blocked on a dashboard signup step. `wrangler login` OAuth (via PowerShell background task) bypassed this entirely — same model that worked for `gh auth login`. Cloudflare auto-created a free account on first OAuth.
**Rule:** When a service offers a CLI OAuth flow, use it before reaching for the web dashboard. Free-tier accounts are auto-created on first OAuth for most major platforms (Cloudflare, Vercel, Fly, Render, Netlify, Supabase). Where OAuth requires localhost redirect (wrangler, gcloud, etc.), use an API token if the sandbox can't reach localhost.
**Note:** Company source lists for Greenhouse/Lever are currently hardcoded in `SKILL_UPDATE_PHASE1.md`. They should migrate to `config/sources.yml` so they're version-controlled and code-reviewable.

---

### K-2026-06-08-1 — Source-of-truth conflict: Pulse Referral Engine HTML vs career-ops
**What happened:** The kanban HTML existed as a floating artifact in the Claude pending-uploads folder, not version-controlled. K2 collapsed this by copying it into `dashboard/job-pulse-kanban.html`. The two sources (Cowork agent edits vs career-ops git history) will diverge unless all future kanban edits go through career-ops.
**Rule:** Any artifact that the 1am agent writes to must live in a version-controlled path. If the agent needs to edit the Kanban, it should edit `career-ops/dashboard/job-pulse-kanban.html` and commit, not a floating Cowork upload. When the Cowork session diverges, reconcile into career-ops, don't let two sources of truth grow.
**Applies to:** All scheduled-task output files that have structural importance.

---

### K-2026-06-08-2 — Auto-submit dry-run-first as deploy hygiene for any state-changing automation
**What happened:** The auto-submit script was built with `--live` flag as an explicit opt-in. The actual click-to-submit is intentionally left as a stub (see `auto-submit.mjs` live mode). This enforces a review gate: Rahil sees the dry-run JSON before any real application is sent.
**Rule:** Any automation that creates irreversible external state (job applications, emails, Slack messages, Jira tickets) must have: (1) a dry-run mode that logs intent without executing, (2) an explicit flag to enable live mode, (3) a hard per-run cap. Never ship state-changing automation where the first real run IS the live run.
**Applies to:** auto-submit, linkedin-dm, any future outreach or apply automation.
