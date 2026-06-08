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
| B7 | P2 | In-progress | 2026-06-05 | AutoSubmit launches browser on expired/redirect listings — `no-submit-button`×469 + `dead-listing-redirect`×57 dominate blocks; needs submit-time ATS liveness re-check |
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
**Status 2026-06-08:** Liveness check landed in `scripts/check-job-liveness.mjs` (HEAD request, 5s timeout). Both `--semi-auto` and `--live` modes now call `checkLiveness(url)` before launching any browser. Dead listings are logged to `data/dead-listings-{date}.json` and skipped. 4 test scenarios covered (404, 410, redirect-to-non-careers, 200-ok).
**Next action:** Monitor `data/dead-listings-{date}.json` for the first few live runs to calibrate the CAREERS_RE pattern if legitimate canonical redirects are being flagged as dead.
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

---

### K-2026-06-08-4 — Semi-auto bridge mode: human stays in the loop on the submit click
**What happened:** A gap existed between dry-run (no browser, pure analysis) and full-live (autonomous click). The `--semi-auto` mode fills this gap: Playwright fills the form and highlights the submit button with a red CSS overlay, but navigation doesn't happen until the human clicks. The agent logs whether the user submitted or aborted.
**Rule:** For any state-changing automation with an irreversible final action, implement a visible-browser "human completes the last step" mode before the fully autonomous mode. This proves form-fill correctness without risking the irreversible action, and builds confidence for the eventual live mode.
**Applies to:** auto-submit (`--semi-auto`), any future apply-automation that touches an external form.

---

### K-2026-06-08-5 — Lower-tier YAML guard for state-changing automation: opt-in by config file, not CLI flag alone
**What happened:** `--live` mode in auto-submit.mjs requires ALL THREE of: (a) `--allow-tier` CLI flag, (b) `config/lower-tier-test-companies.yml` with `enabled: true`, (c) company slug in the YAML list. Removing any one of the three locks causes an actionable error with instructions to fix it.
**Rule:** Defense in depth for irreversible automation: never let a single CLI flag unlock a live run. Require at least one out-of-band config change (a file you deliberately edit) so there's no "fat-finger enables live mode" path. The YAML file is a forcing function for intentional human review.
**Applies to:** Any automation with a hard cap and a whitelist (auto-submit live, linkedin-dm, bulk-apply, email-outreach).

---

### K-2026-06-08-7 — Verify bot-reported metrics against disk truth before acting

**What happened:** An 8 AM daily report claimed "256 CLs ready". Disk truth: 1 bulk .md export + 3 OneDrive cloud-only .docx files (OneDrive sync not running). The real count was effectively 0 individual CL files until the stockpile was built. The bot fabricated a count from context, not from `ls`.
**Rule:** Any metric that drives a decision (CL count, application count, template count) must be verified with a disk command before being quoted. `ls cover-letters/ | measure` beats any generated number. If a metric conflicts with what `ls` shows, the filesystem wins.
**Applies to:** Any automated report that summarizes asset counts (CLs, reports, PDFs, templates).

---

### K-2026-06-08-8 — Critical assets must live outside OneDrive; cloud-only stubs break automation

**What happened:** 3 hand-crafted CL templates (Accela, LaunchDarkly, Twilio) lived in `C:\Users\rahil\OneDrive\Documents\`. When OneDrive sync was not running, `Copy-Item` raised "The cloud file provider is not running." The files were inaccessible to the automation pipeline.
**Rule:** Any asset that automation needs at runtime (CL templates, scripts, configs) must be committed to the career-ops repo or otherwise local. OneDrive is not a reliable runtime dependency. When `extract-cls.mjs` can't copy a template, it logs and skips — it never crashes. But the better fix is to ensure the templates are in `cover-letters/` in the first place.
**How to apply:** When setting up CL templates, copy them to `cover-letters/` and commit. Do not rely on OneDrive paths in any automation script.

---

### K-2026-06-08-9 — Auto-submit state filter was hardcoded to legacy state names

**What happened:** `extractEligibleCards` (HTML path) filtered for `columnId` values `'new-hot'` and `'autosubmit-ready'` — K1 ghost column IDs from a pre-K2 naming scheme. The live K2 kanban uses canonical gen/states.js IDs (`new`, `evaluated`, etc.), so every real card was silently dropped and the dry-run always returned 0 eligible cards.
**Rule:** Any state-aware logic must consume the canonical states.yml / gen/states.js — single source of truth pattern. Never hardcode state names inline; always import from the generated module. If the canonical list changes, the automation updates automatically.
**How to apply:** Import `VALID_IDS` from `gen/states.js`; define `SUBMIT_READY_STATES` as a module-level Set derived from that import (overridable via `--ready-states` CLI flag). Both extract paths (`extractEligibleCards` HTML and `extractEligibleCardsFromJson` JSON) use the shared Set.

---

### K-2026-06-08-12 — JSON path missed the state filter that the HTML path enforces

**What happened:** The original `extractEligibleCardsFromJson` (JSON path) filtered only on grade A/B and `!isWarmReferral`, omitting the `SUBMIT_READY_STATES.has(columnId)` check that `extractEligibleCards` (HTML path) enforced. A card with `state='applied'` or `state='rejected'` and grade A/B would pass the JSON filter and be scheduled for re-submission — a re-submission risk. Defect found by manual integration test after the `--kanban-json` flag shipped; the 23 unit tests for the JSON path at the time did not include a case with a terminal state.
**Rule:** When adding a parallel data source (HTML vs JSON), copy the FILTER not just the SHAPE. Defense: derive the filter from a single function `isEligible(card)` used by both paths. Any change to eligibility criteria automatically propagates everywhere.
**How to apply:** `isEligible(card)` is now exported from `scripts/auto-submit.mjs` and called by both `extractEligibleCards` and `extractEligibleCardsFromJson`. Any future extraction path must call `isEligible` rather than re-implementing the predicate inline.

---

### K-2026-06-08-10 — K2 kanban shipped with onclick handlers referencing undefined functions

**What happened:** All six toolbar button handlers (`fetchJobs`, `runDryRun`, `exportState`, `importState`, `clearBoard`, `closeModal`) were defined inside `<script type="module">`. Module scope is NOT global scope: `onclick="fetchJobs()"` resolves against `window.fetchJobs`, which was undefined. DevTools confirmed: `Uncaught ReferenceError: fetchJobs is not defined` on every button click. Root cause: pivot under time pressure; the rebuild focused on logic correctness and skipped the window-exposure step.
**Rule:** Any HTML with `onclick="fn()"` that lives inside `<script type="module">` requires explicit `window.fn = fn` assignments. Future smoke test: launch the kanban, click every button, verify zero console errors. This should be a CI step (or a Playwright smoke test run pre-merge).
**How to apply:** After all function declarations, add a `window.xxx = xxx` block for each onclick-referenced function. Add `test/kanban-smoke.test.mjs` to the CI matrix.

---

### K-2026-06-08-11 — config/sources.yml not served by Go static server; v1 uses inline hardcoded list

**What happened:** `config/sources.yml` is the canonical list of ATS slugs, but it lives in the repo root and is not served by the kanban's static server (which serves `dashboard/` only). The kanban cannot fetch `/config/sources.yml` at runtime. For v1, the slug list is hardcoded inline inside `dashboard/job-pulse-kanban.html` as `const SOURCES = { greenhouse: [...], lever: [...] }`, which mirrors sources.yml manually.
**Rule:** Any data that must stay in sync between a file and an in-browser runtime constant is a divergence risk. Options: (a) serve `config/` as a static route from the kanban server, (b) inline the source list into the kanban and codegen it from sources.yml, (c) expose it as a `/api/sources` endpoint. Until one is chosen, the inline list in the kanban HTML must be kept in sync with `config/sources.yml` manually.
**How to apply:** When adding or removing slugs from `config/sources.yml`, also update `const SOURCES` in `dashboard/job-pulse-kanban.html`. Tracked for proper codegen or server-side serving in a future K2 iteration.

---

### K-2026-06-08-6 — Long-running code sessions accrue context cost; spin fresh sessions per logical chunk
**What happened:** The K1 implementation session hit a 1M context credit wall, requiring a manual restart. The session had accumulated context from multiple PRs, investigations, and dead ends that weren't relevant to the current task.
**Rule:** When a task is multi-PR (K1-dry-run, K1-semi-auto+live, K2-kanban, K5-slug-audit are all independent), spawn a fresh session per PR rather than continuing the same session across unrelated work. Cowork context should be scoped to the active PR, not the entire sprint.
**Applies to:** Any implementation session that spans more than 2-3 logically independent changes.
