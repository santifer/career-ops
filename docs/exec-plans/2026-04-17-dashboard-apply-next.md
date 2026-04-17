# Dashboard Apply Next View

**Date:** 2026-04-17
**Status:** completed
**Owner:** Codex

## Background

The static dashboard at `web/index.html` exposes reports, tracker, pipeline, and scan history, but it does not give the user a clear "what should I apply to first" workflow. The user asked for a new interface that summarizes which roles to apply to first and includes a button to record whether the application has been completed.

## Goal

- Add a dedicated dashboard view that surfaces the highest-priority application targets first.
- Make the recommendation logic legible in the UI instead of requiring manual filtering.
- Add a one-click completion marker so the user can record that an application has been completed from the dashboard.

## Scope

- `web/template.html`
- `web/build-dashboard.mjs` only if the new view needs extra inlined data
- regenerated `web/index.html`

Out of scope:

- Directly mutating `data/applications.md` from the static HTML
- Building a local server or write-back API
- Changing scoring logic or tracker merge logic

## Assumptions

- The safest minimal path is to derive recommendations from existing tracker rows with `status = Evaluated`, using score thresholds already implied by project rules.
- Because `web/index.html` is a static `file://` page, the "completed application" button cannot safely write back to repo files. The first implementation will persist a local completion marker in browser `localStorage`.
- Repo truth still lives in `data/applications.md`; the local marker is only a dashboard convenience until a write-back workflow exists.

## Implementation Steps

1. Inspect the current dashboard structure and identify the smallest insertion point for a new tab.
   Verify: understand current tab/render/filter wiring and available data.
2. Add an `Apply Next` tab with prioritized sections.
   Verify: page renders a clear shortlist and distinguishes high-priority vs selective roles.
3. Add a local completion marker button for each recommended role.
   Verify: clicking toggles state and persists across reloads in the same browser.
4. Regenerate `web/index.html` and verify the new data is embedded.
   Verify: generated HTML contains the new tab and latest data.

## Verification Approach

- Regenerate the dashboard with `npm run dashboard`
- Inspect generated HTML for the new `Apply Next` elements
- Verify local completion-state logic by reviewing the rendered JS and data flow

## Progress Log

- 2026-04-17: Reviewed current scoring guidance, tracker status model, and dashboard rendering path.
- 2026-04-17: Confirmed the dashboard is static and cannot directly write to repo state from `file://`.
- 2026-04-17: Added a dedicated `Apply Next` tab to `web/template.html` and made it the default landing view.
- 2026-04-17: Implemented recommendation buckets from tracker state: `Apply now` for `Evaluated` roles at `4.0/5+`, and `Selective apply` for `3.5-3.95`.
- 2026-04-17: Added a local completion marker button backed by browser `localStorage`, with a separate `Marked Applied` section.
- 2026-04-17: Regenerated `web/index.html` with `npm run dashboard` and verified the generated file contains the new tab, localStorage key, and summary counters.

## Key Decisions

- Use a dedicated `Apply Next` view instead of telling the user to manually compose tracker filters every time.
- Keep the first completion marker local to the browser via `localStorage` instead of pretending the static page can update the repo.
- Use existing tracker/report data only; do not introduce a second recommendation datastore.

## Risks And Blockers

- A local completion marker can drift from canonical tracker state if the user later updates `data/applications.md` elsewhere.
- Recommendation quality is only as good as the current tracker notes and score thresholds.
- The local marker is browser-specific; switching browsers or clearing local storage will remove it.

## Final Outcome

Completed.

- New dashboard landing view: `Apply Next`
- Recommendation sources: `data/applications.md` + linked `reports/*.md`
- Completion marking: browser-local `localStorage`
- Verification: `npm run dashboard` plus generated-HTML checks for `apply-next`, `apply-priority-list`, `career_ops_apply_done_v1`, and `t-ready`
