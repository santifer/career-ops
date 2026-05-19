# Recent Evaluations Parity Audit — BRAVO Phase A.10 (2026-05-19)

**Auditor:** β BRAVO (Visual UX & Interaction Researcher-Implementer — Opus 4.7)
**Method:** Chrome MCP live inspection at `https://staging-dashboard.careers-ops.com/` (1440×900 viewport) + source diff between Apply-Now table and Recent Evals renderer.
**Reference table:** `#apply-now-tbody` (rendered at `scripts/build-dashboard.mjs:11704-11722`)
**Subject table:** Recent Evals — rendered inside `renderStatPanel('evaluations', …)` at `scripts/build-dashboard.mjs:19114-19158` and surfaced via `toggleStatPanel('evaluations')` at line 18934.

---

## Side-by-side affordance audit

| Affordance | Apply-Now | Recent Evals (before) | Citation diff |
|---|---|---|---|
| `th.sortable` + `data-col-key` + `data-col-type` + `data-default-dir` | All 9 data columns | None — plain `<th>` | `build-dashboard.mjs:11707-11717` vs `:19154` |
| `aria-sort="none"` + `.sort-indicator` (↕ → ↑ / ↓) | Per sortable col | Absent | `:11707` |
| `onclick="sortTable('apply-now-tbody', N, type, this, event)"` | Wired | Absent — no click handler on `<th>` | `:11707-11717` |
| `.col-resize-handle` (5px right-edge drag zone) | Auto-injected by `applyUniversalTableBaseline()` after render | NOT injected — `panel.innerHTML = renderStatPanel(...)` at `:18978` skips the baseline call | `:12382-12522` vs `:18978` |
| `td.role-cell` ellipsis with `title=` hover-reveal | `:3094` — `<td class="role-cell" title="...">` + CSS overflow:hidden | `:19132` — `<td class="role-cell">` (no title attr; `whiteSpace:"normal"` and `overflow:"visible"` per DOM probe) | computed style probe confirms |
| Row click → expand detail | `tr.row onclick="..." toggleDetail()` | Already present: `tr.row onclick="toggleDetail('sp-${panelId}-${i}')"` | `:19129` |
| Detail row with metadata + rec banner + JD link | Drawer-style RHS (Apply-Now uses right-rail) | Inline `tr.detail-row` already present at `:19138-19148` | Equivalent functionality |
| Resize persistence across reloads (`localStorage["careerops.colwidth.<tableId>.<colKey>"]`) | Yes (`:12394-12402`) | No — baseline not invoked | Implementation gap |

**Bottom line:** the Recent Evals table is functional but lacks every Apply-Now affordance EXCEPT row-click-to-expand. The mismatch is jarring once a user has navigated the Apply-Now table and trained their hands on its sort/resize muscles.

---

## Severity rubric (Mitchell-lens)

**AAA** — Mitchell-lens "muscle-memory consistency" hit + low effort (S) + no territorial overlap → **ship tonight**.
**AA** — Real friction, higher effort → batch-pass after AAA.
**A** — Nice-to-have, documented, not shipped tonight.
**B** — Declined with rationale.

---

## Findings

### AAA — shipping tonight (Phase A.10.3)

| ID | Rec | File:line | Effort |
|---|---|---|---|
| **A.10-AAA-1** | Add `th.sortable` + `data-col-key` + `data-col-type` + `aria-sort="none"` + `.sort-indicator` + `onclick="sortTable(...)"` to the 7 Recent Evals headers (Score / Company / Role / Status / Eval Date / Age — skip "Action" as it's not sortable, same as Apply-Now). The legacy non-`all-tbody` sortTable path at `:18454+` already supports any tbody id — no engine change needed. | `scripts/build-dashboard.mjs:19152-19156` | S |
| **A.10-AAA-2** | Add unique `id="recent-evals-tbody-${panelId}"` to the tbody so sortTable has a target. (Multiple stat-panels can render `buildTable()` — bucket modals use it too — so the id must be derived from `panelId` to stay unique across modals.) | `:19156` | XS |
| **A.10-AAA-3** | Invoke `window.applyUniversalTableBaseline({ root: panel })` after `panel.innerHTML = renderStatPanel(key, data)` at `:18978`. This auto-injects `.col-resize-handle` on every `<th>` of every freshly-rendered table inside the stat-panel — mirrors the existing batch-status-modal pattern at `:19899` and process-all-modal at `:20107`. | `:18978` | XS |
| **A.10-AAA-4** | Add `title="${esc(r.role)}"` to `td.role-cell` at `:19132` so hover reveals the full role title when the column is narrowed (matches Apply-Now `:3094`). Also add `title="${esc(r.company)}"` to the company `<td>` at `:19131` (also mirrors `:3093`). | `:19131-19132` | XS |
| **A.10-AAA-5** | Tag `td.role-cell` with `data-fulltext="${esc(r.role)}"` so the universal-baseline's tooltip retrofit (`:12376`) picks it up when JS-only truncation happens. Already a no-op cost if cell isn't truncating. | `:19132` | XS |

### AA — same pass, slightly more invasive

| ID | Rec | File:line | Effort |
|---|---|---|---|
| **A.10-AA-1** | Add a default sort indication on first render. Apply-Now defaults to "score desc, then date desc" via the row-pre-sort. Recent Evals comes pre-sorted by date (newest-first) per `data.recent` from the server — surface that by setting `aria-sort="descending"` on the Eval Date column and dropping the initial ↕ indicator there. | `:19154` (Eval Date `<th>`) | S |

### A — backlog (deferred)

- Per-column initial widths for Recent Evals via the `applyUniversalTableBaseline` width-hinting path. Currently the table will get default-content-fit widths. Acceptable for v1; revisit if users complain about Role column jitter.
- Drawer-style expansion (full eval drawer like Apply-Now's right-rail) instead of inline `tr.detail-row`. Bigger lift — touches `openRightRailForDetail` lifecycle. Inline expansion already exists and works; tab-to-deep-drawer is a v2 feature.

### B — declined

- Bulk-checkbox column. Recent Evals is a 5-row read-only snapshot of the latest. Bulk actions belong on the All-Evaluations table (which already has them). Adding bulk to Recent Evals duplicates UX without unlocking a workflow.
- People / Equity / Health / Location columns. Recent Evals is intentionally narrower (Score / Company / Role / Status / Date / Age / Action). Bringing all 13 Apply-Now columns over inflates the modal and dilutes the "what did I just evaluate" snapshot job-to-be-done.

---

## DOM-level proof (Chrome MCP, 2026-05-19 23:xx PT)

```js
// Before fix — recorded via mcp__Claude_in_Chrome__javascript_tool on staging-dashboard.careers-ops.com
{
  "wrap_present": true,
  "headers_count": 7,
  "headers": [
    "<th>Score</th>",
    "<th>Company</th>",
    "<th>Role</th>",
    "<th>Status</th>",
    "<th>Eval Date</th>",
    "<th>Age</th>",
    "<th>Action</th>"
  ],
  "role_overflow": "visible",
  "role_white_space": "normal",
  "role_has_title": false
}
```

Plain `<th>` × 7. Zero sortable. Zero resize handle. Zero ellipsis.

**Expected after fix:**
- 6/7 `<th>` carry `class="sortable"` + `aria-sort` + `data-col-key` + `data-col-type` (Action col exempt — never sortable).
- 6 `.col-resize-handle` injected by universal baseline.
- `td.role-cell` carries `title="<full role>"` + `td.company-cell` carries `title="<full company>"`.

---

## Why this matters (Mitchell-lens)

Mitchell uses Apply-Now as his primary daily-driver table — column-resize and multi-sort are baked into his muscle memory after the 2026-05-17 dragging + 2026-05-18 saved-views work. Recent Evals is a smaller widget he opens via the KPI tile to confirm what just landed in the pipeline.

The current asymmetry forces him to **mode-switch**: in Apply-Now he can yank Role wider, sort by Age ascending, etc. In Recent Evals he can't. The Mitchell-lens failure mode is "inconsistent affordance language across tables" — same shape (HTML table), same row shape (one role per row), wildly different interaction grammar. The fix is a one-modal-render hook (universal baseline) + a header markup swap.

Signed: β BRAVO · 2026-05-19
