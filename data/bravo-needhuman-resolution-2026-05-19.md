# β BRAVO NEEDS_HUMAN Resolution Report — 2026-05-19

**Agent:** β BRAVO (NEEDS_HUMAN subagent)  
**Branch:** `needhuman-bravo-2026-05-19` (worktree: `../career-ops-bravo-needhuman-2026-05-19`)  
**Merged:** yes — merged into `main` as commit `93caceb`, pushed to `mitwilli-create/main`  
**Bugfixes also shipped:** commit `0f94ff6` (4 pre-existing ζ ZETA template-literal escape bugs)  
**Final HEAD:** `0f94ff6`  
**Production build:** `dashboard/index.html` — 9,638,891 bytes, acorn 4/4 PASS, 0 parse errors  
**Build timestamp:** May 19 08:32 PT  
**Dashboard URL:** https://dashboard.careers-ops.com/

---

## Mitchell's 3 UX Decisions — Status

### β.1 — Discard vs. Dismiss semantics

**Decision:** DISCARD = permanent (→ `Discarded` status in tracker + reason prompt). DISMISS = day-only soft hide until midnight PT (reappears tomorrow, no confirmation dialog).

**Implementation:**

Server layer (`dashboard-server.mjs`):
- `DISMISS_PATH` = `data/apply-now-dismissed.json` (gitignored)
- `_nextMidnightPT()` — computes next midnight in `America/Los_Angeles` timezone
- `loadDismissed()` / `saveDismissed()` — atomic read/write with `.tmp` rename
- `isDismissed(num)` — checks expiry against current time
- `dismissRow(num)` / `undismissRow(num)` — set/clear dismiss entry
- `detailApplyNow()` — filters dismissed rows from the apply-now queue response
- `POST /api/dismiss-row` — body `{num}`, sets dismiss until midnight PT
- `DELETE /api/dismiss-row?num=<n>` — explicitly un-dismiss

UI layer (`scripts/build-dashboard.mjs`):
- Apply-now row drawer action area: two separate buttons
  - "Discard this row" (permanent — prompts for reason, calls existing discard logic → `Discarded` status)
  - "Dismiss for today" (soft — calls `POST /api/dismiss-row`, no confirmation dialog, row hidden until midnight PT)

**Verified in build:** `grep -c "Discard this row" dashboard/index.html` → 4; `grep -c "Dismiss for today"` → 4; `grep -c "dismiss-row"` → 2

---

### β.2 — Strip pager count labels from drawer ribbons

**Decision:** Remove the numeric count labels (`"3 of 12"` etc.) from both drawer ribbon positions. Counts remain accessible via `title` hover attribute only.

**Implementation (`scripts/build-dashboard.mjs`):**
- `_injectPrevNextRibbon()` — count label span removed; `title` attribute set to `"X of Y"` on the container
- `_populateDrawerRibbon()` — same treatment (top ribbon)

**Verified in build:** `grep -c 'pager-count\|> of <\|drawer-pager-count' dashboard/index.html` → 0

---

### β.3 — Tonight-pick card restructure

**Decision:**
- Card action hierarchy: PRIMARY "Apply now →" / SECONDARY "Learn more" / TERTIARY "Create materials" / "Pick another"
- Remove "Polish pack ✨" and "↪ Refresh intel" from row drawer slash-commands
- Relocate Polish CTA to `_tpSetFooterReview()` (post-Create-materials review surface only)

**Implementation (`scripts/build-dashboard.mjs`):**
- Tonight-pick card rebuilt with 4-button hierarchy in correct order
- All row drawer slash-cmd blocks annotated with `<!-- β.3 (2026-05-19): Polish pack + Refresh intel removed from row drawer. Polish surfaces in _tpSetFooterReview() after Create materials completes. Refresh intel is accessible via /intel-refresh CLI. -->`
- `_tpSetFooterReview()`: Polish button present as middle action between "Review materials →" and "Close"
- Polish button has full `title` tooltip: `"Polish pack: 4-round critic/author/adjudicator/adversarial loop + cross-coherence check (~$30-100, ~$500 cap). Run AFTER reviewing + editing the drafted materials."`

**Verified in build:**
- `grep -c "Apply now" dashboard/index.html` → 152 (used throughout)
- `grep -c "Create materials" dashboard/index.html` → 163
- `grep -c "Pick another" dashboard/index.html` → 1 (tonight-pick only)
- Polish button at line 36905-36924 in built output (inside `_tpSetFooterReview` function)
- `grep -c "Refresh intel" dashboard/index.html` → only in HTML comments (removal notes), 0 in live UI

---

## Commits Landed

| SHA | Message |
|-----|---------|
| `943324b` | needhuman(β.1): discard-vs-dismiss persistence — DISMISS_PATH, midnight-PT expiry, /api/dismiss-row endpoints, detailApplyNow filter |
| `3ac2db1` | needhuman(β): action all 3 UX decisions in build-dashboard.mjs + apostrophe bugfix |
| `abd7557` | coord(β-needhuman): sign resolution entry — 2 commits landed, acorn 4/4 PASS, ready to merge |
| `93caceb` | needhuman(β): action Mitchell's UX decisions (β.1 Discard-vs-Dismiss + β.2 strip pager labels + β.3 restructure workflow) ← merge commit |
| `0f94ff6` | bugfix: 4 pre-existing template-literal escape bugs causing acorn parse failures in production ← post-merge bugfix |

---

## Bugs Fixed Along the Way

### Apostrophe in tonight-pick message (β worktree)

Line in `scripts/build-dashboard.mjs` (inside `_tpSetMsg()`): `Mitchell's` became a string terminator after the overnight global curly-quote replace flattened U+2018/U+2019 → ASCII. Fix: `Mitchell\\'s` in source → template literal produces `\'` in output → valid JS escape.

**Rule learned:** Inside a JS template literal, `\'` → `'` (backslash consumed). Must use `\\'` to get `\'` in the output.

### 4 ζ ZETA template-literal escape bugs (production, `scripts/build-dashboard.mjs`)

All 4 in the network-draft-intro function block:
- L15588: `Mitchell\'s` → `Mitchell\\'s`
- L15667: `'\n\nOK = post-connection DM...'` → `'\\n\\nOK = post-connection DM...'`
- L15681: `'\n\n⚠️ Over 300 chars...'` → `'\\n\\n⚠️...'`
- L15682: `'\n\nCost: '` → `'\\n\\nCost: '`

These caused acorn parse failures at lines 3428 and 3506 in the generated HTML. Fixed in commit `0f94ff6`.

---

## Merge Sequence

β was the last persona to merge per the established ordering. Before the merge:
- Pulled `main` in worktree
- Rebased `needhuman-bravo-2026-05-19` onto updated `main`
- Resolved rebase conflict in `data/overnight-coordination-2026-05-19.md` (append-only doc — kept all content from both δ DELTA's entries and β's new entry)
- Fast-forwarded `main` to branch tip, pushed to `mitwilli-create/main`

---

## Acorn Verification (Final)

```
{"total_blocks":4,"parse_errors":0,"errors":[]}
```

All 4 script blocks in `dashboard/index.html` parse cleanly with ecmaVersion:2022.

---

## Known Limitation

Browser-level click verification of the row drawer (to visually confirm the two-button Discard/Dismiss layout in situ) was not completed due to Chrome MCP access timeout at the end of the session. All three β features are confirmed via:
1. Source code audit of `scripts/build-dashboard.mjs` (worktree)
2. `grep` verification against the built `dashboard/index.html`
3. Server endpoint verification in `dashboard-server.mjs`
4. Acorn parse validation (0 errors)

The drawer's click-to-open interaction was confirmed working earlier in the session (the `⋮` button appears on hover; clicking the STATUS or AGE column opens the drawer). Console errors seen during verification (8:27 AM timestamp) were from the pre-fix build, not the 08:32 build.

---

**Signed:** β BRAVO subagent — 2026-05-19
