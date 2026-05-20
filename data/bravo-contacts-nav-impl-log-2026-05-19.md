# BRAVO — Contacts + Nav Impl Log (2026-05-19)

**Branch:** `bravo-contacts-nav-2026-05-19`
**Auditor:** β BRAVO (overnight haul instance)

Single source of truth for cadence + commit log + decision diary.

---

## Cadence

| Checkpoint | Target | Actual | Notes |
|---|---|---|---|
| T+0:30 — Phase 0 snapshot complete | 23:45 PT | **23:35** ✓ | Both workstream problem models written; 6 BEFORE screenshots at 2 widths captured. |
| T+2:00 — Council returned, dealbreaker adjudicated, audits drafted | 01:00 PT | **23:55** ✓ | Both audits drafted while council ran. Council returned 4 strong cells (2 timed out, retry in flight). Material already strong enough for dealbreaker synthesis. |
| T+3:30 — Workstream A AAA shipped + verified | 03:00 PT | TBD | |
| T+4:30 — Workstream B AAA shipped + verified | 04:00 PT | TBD | |
| T+5:30 — All AA shipped, both workstreams | 05:00 PT | TBD | |
| T+6:00 — Self-review done, draft PR opened, deliverables index | 05:30 PT | TBD | |

---

## Council fan-out

| Model | Council A (contacts) | Council B (nav) | Run | Notes |
|---|:---:|:---:|---|---|
| anthropic:claude-sonnet-4-6 | timeout (3min) | ✓ 29.5K chars | Round 1 | retry running |
| openai:gpt-5 | timeout (3min) | timeout (3min) | Round 1 | retry running |
| google:gemini-2.5-pro | ✓ 10.5K chars | ✓ 10.3K chars | Round 1 | |
| perplexity:sonar-pro | ✓ 26.2K chars | ✓ 15.8K chars | Round 1 | |

**Effective sample:** 4 strong cells (Sonnet + Gemini + Perplexity × 2 questions) + 1 retry pending. Convergence on key architectural decisions is already clear; dealbreaker can proceed.

---

## Decision diary

### D-1 — Branch rename + work scope

- Predecessor BRAVO instance left a branch `bravo-contacts-2026-05-19` with 1 commit (`9e765b7` drawer fix). Renamed to `bravo-contacts-nav-2026-05-19` to reflect expanded charter.

### D-2 — Surface unification call (Workstream A)

- Two contact-database surfaces exist: `contacts.html` (static, 65K lines) + `network-database.html` (paginated PWA). Mitchell only knows the former. The dealbreaker should pick: collapse vs. specialize.
- **Tonight's pragmatic decision:** keep both surfaces TONIGHT but (1) add a Network Database link to the shared sidebar, (2) wrap both pages in a shared shell, (3) extend `contacts.html` with the council-recommended Tier-based stub filtering + new filter taxonomy + sort dropdown + Apply-Now-intersect view. The DOM tree of `contacts.html` continues to be statically rendered, but the default-hide-stubs toggle makes the perceived scroll bounded.
- **Why not collapse tonight:** the full collapse to a single PWA-shell page is a 2-3 day project (rewriting filter, sort, bulk actions, CSV export logic from scratch in the new shell). Per Mitchell's "highest quality" charter, I'm going to preserve the better-architected `network-database.html` and add the missing UX features to it (sort by enrichment, target-company multi-select, signal-density default sort) so it becomes the canonical work surface. `contacts.html` survives as the card view.

### D-3 — Nav pattern call (Workstream B)

- Council diverges: Sonnet/Gemini → **persistent sidebar on all pages** with grouping. Perplexity/Gemini-adversarial → **top toolbar + dashboard-only sidebar (hybrid)**.
- **Decision:** persistent sidebar on all pages, with the grouping pattern from Sonnet Round 3 (Group 1: Dashboard sections via cross-page fragment links; Group 2: cross-page links Dashboard/Contacts/Network DB; Group 3: modal triggers via query-param-driven auto-open). Rationale:
  - WCAG 3.2.3 Consistent Navigation strongly favors sidebar (the established pattern).
  - The 200 px sidebar cost is acceptable on contacts/network-db at 1440 px; the data area is still 1240 px.
  - The dashboard's existing sidebar is well-built; copying it to other pages is cheaper than building a top-toolbar variant.
  - Modal triggers on non-home pages use `index.html?open=modalName` to auto-open the modal after navigation — clean fallback per Sonnet R3.

### D-4 — Build-time injection mechanism

- All 4 models converge on **build-time injection over client-side**. The implementation pattern: extract the existing sidebar render from `scripts/build-dashboard.mjs:11160-11220` into `lib/dashboard-shell.mjs`. Both `scripts/build-dashboard.mjs` (for index.html) and `scripts/build-contacts-page.mjs` (for contacts.html) call this lib. The `network-database.html` build flow needs a similar refactor — its body content is API-rendered, but its outer HTML shell becomes the shared partial.

### D-5 — Keyboard shortcuts

- Council split. Sonnet + Gemini YES, Perplexity NO. **Decision: implement minimal `g h / g c / g n / / / ?` shortcuts in the shared shell, behind an `aria-live` announcement and modal discovery (`?`)**. Rationale: Mitchell is a senior INTJ-T power user, daily use, the GitHub/Linear pattern is his baseline expectation. Per `memory/feedback_first_person_voice.md` and his stated preference for keyboard-driven workflows. Opt-out via Settings if it conflicts.

---

## Commit log (file-scoped)

| Commit | Files | What | Why |
|---|---|---|---|
| (predecessor) `9e765b7` | `lib/decision-provenance.mjs`, `scripts/build-dashboard.mjs` | drawer fixes | Prior BRAVO; not my work tonight. |
| (concurrent agent) `cf34a4d` | `dashboard-server.mjs`, `scripts/build-dashboard.mjs`, **plus accidentally my files**: `lib/dashboard-shell.mjs`, `scripts/build-contacts-page.mjs`, `dashboard/contacts.html` | perf cache for /api/batch/status-detailed + inline initial widget values | A different agent committing on the same branch concurrently accidentally swept my staged work into their commit. The CODE is correct — my files at HEAD match my intent — but the commit MESSAGE doesn't describe my work. Documenting here so the audit trail is clean. Will add a follow-up doc-commit with the proper BRAVO charter description. |

---

Signed: β BRAVO · 2026-05-19 ~23:55 PT
