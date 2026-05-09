# Dashboard Phase 3 — Weekly Worker Queue

The Phase 3 weekly worker (`scripts/dashboard-phase3-worker.sh`, fires Monday 06:00 PT via launchd) reads this file, picks the **first item with status `[pending]`**, implements it in a worktree, opens a PR, and marks the item `[in-progress]`. When the PR merges, mark it `[done]` manually (or wire the post-merge hook).

**Worker rules** (read by the agent at run time):
- Only touch `scripts/build-dashboard.mjs`, `dashboard-server.mjs`, and CSS/JS within the build script. Do NOT touch data files (`data/applications.md`, `batch/*`, `reports/*`).
- Run `node scripts/build-dashboard.mjs` and verify exit code 0 before committing.
- Open PR with title `feat(dashboard): {item title}` and body referencing this queue file.
- If the implementation requires a new dependency, STOP and surface the question — do not auto-add deps.
- Effort estimate is a guideline, not a hard cap; if a task takes >2x the estimate, leave it `[in-progress]` and surface a blocker note.
- Commit message format: `feat(dashboard): {item title}\n\nQueue item #{N}. {one-line summary}.\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

---

## Queue (priority order)

### 1. [in-progress] Mobile breakpoint + table → card view <720px (bundled with Drawer/Sheet for mobile detail)
**Effort:** L (1 full day equivalent)
**Why:** The whole point of moving to dashboard.careers-ops.com is mobile access. Without this, mobile usage fails within a week.
**Acceptance:**
- `@media (max-width: 720px)` block in build-dashboard.mjs CSS
- Each row renders as a stacked card (score chip · company · role · status pill · age · inline gap chips)
- Tap the card → slide-up drawer with the same data the desktop expand-row shows
- Apply-Now becomes the primary view on mobile (All Evaluations gets horizontal scroll fallback)
- Touch targets ≥44×44px throughout
- Verify on iPhone Safari + Android Chrome (or DevTools mobile emulator at 375×812 minimum)

### 2. [pending] Inline status writeback (Evaluated → Applied → Interview)
**Effort:** L (half day)
**Why:** Read-only dashboards rot. The action that runs the system — moving rows through the funnel — currently happens by editing data/applications.md by hand. Doing it from the dashboard removes the last reason to drop into a terminal.
**Acceptance:**
- New endpoint `POST /api/status` in dashboard-server.mjs
  - Body: `{ num: 273, status: "Applied", note?: "Submitted via Greenhouse" }`
  - Validates `status` against `templates/states.yml` canonical list
  - Atomic read-modify-write of `data/applications.md` (temp file + rename)
  - Returns updated row shape
  - Respects AGENTS.md rule: `NEVER create new entries — update only`
- Status pill in each row becomes clickable → small inline popover with canonical states
- Optimistic UI swap → POST → success or revert
- Toast confirmation on success

### 3. [pending] Expand-row visual hierarchy refactor
**Effort:** M (half day)
**Why:** Today's expand row is dense text. Reframe each section (Match / Gap / Story / Recommendation) as labeled cards with the same chip/badge language as the gap modal so users learn the system once.
**Acceptance:**
- Match: green left border, label "WHAT FITS"
- Gap: amber, label "WHAT'S MISSING", chips above prose for each named gap
- Story: purple, label "STORIES TO LEAD WITH"
- Recommendation: blue, label "ACTION", with Apply/Skip/Defer button right-aligned
- About 30 lines new CSS, ~50 lines template change in build-dashboard.mjs

### 4. [pending] Persistent batch history view
**Effort:** M (half day)
**Why:** Current overlay only shows the live batch. Lose context the moment a batch finishes.
**Acceptance:**
- New endpoint `/api/detail/batches` that groups `batch/batch-state.tsv` rows by run (using `started_at` within an N-minute window, OR add a `batch_id` column)
- New 6th stat card "Batches run" with a stat-panel showing last 10 batches: completed/failed counts, duration, average score
- Click a row to drill into that batch's results

### 5. [pending] Search across report content
**Effort:** M (couple of hours)
**Why:** Filter today only matches `data-company / data-role / data-status`. Searching report content (gaps, stories, recommendations) needs to work.
**Acceptance:**
- Modify `parseReportSummary()` to extract `tldr + recommendation + topGaps + topEdges` per row
- Expose those as a `data-search` attribute on each row
- Existing filter input becomes a real search across all fields
- Must land AFTER status writeback (queue item 2) so the search index includes latest statuses

---

## Done

(Phase 3 items move here when PR merges and the queue item is closed.)

- _none yet_
