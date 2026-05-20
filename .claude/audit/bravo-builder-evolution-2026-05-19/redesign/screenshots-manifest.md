# BRAVO Builder Evolution Redesign — Chrome MCP Verification Manifest

**Branch:** `bravo/builder-evolution-drawer-2026-05-19`
**Date:** 2026-05-19
**URL verified:** https://staging-dashboard.careers-ops.com/ (same dashboard as production, no auth)

## Why no PNG files in this folder

Chrome MCP returns screenshots inline in the conversation transcript (via the
`browser_batch` / `computer:screenshot` tool calls) — the JPEGs are not
persisted to a path on disk that an agent can attach. The screenshots ARE the
proof; they are embedded in the BRAVO conversation transcript and visible to
Mitchell when he reviews the worktree.

For an audit-folder companion, see `dom-evidence.json` next to this file: it
captures `getBoundingClientRect()` + `getComputedStyle()` for every chip and
the drawer, plus the z-index hierarchy, plus a verified-content matrix. That
JSON is the DOM-level proof per the AGENTS.md UI-Change Verification rule.

## Screenshots taken (in transcript)

| # | Viewport | State | Chrome MCP screenshot ID |
|---|----------|-------|--------------------------|
| 1 | 1440 × 664 | Chips closed, top of Builder Evolution panel | ss_16211kbxd |
| 2 | 1440 × 664 | APIs drawer open (3 Tier-A demo + 5 gaps + 4 plan phases) | ss_6692btsiz |
| 3 | 1440 × 664 | Skills drawer open (15 ranked) | ss_3865auymo |
| 4 | 1440 × 664 | APIs drawer open (re-verified after subhead fix) | ss_0607ejvyd |
| 5 | 1440 × 664 | Skills drawer open (re-verified, "5 top · 15 all") | ss_07707vzb0 |
| 6 | 1440 × 664 | Bug classes drawer open (5 ranked) | ss_0941faa7f |
| 7 | 1440 × 664 | PM signals drawer open (8 ranked) | ss_111095wop |
| 8 |  880 × 664 | Chips closed, narrow viewport (responsive) | ss_0148egv95 |
| 9 |  880 × 664 | APIs drawer open, narrow viewport | ss_0328c1jmh |
| 10 | 1440 × 664 | Final closed-state, all chips visible | ss_57460nxpe |

## Verified behaviors

- All 4 chips render as native `<button>` elements (focusable, click + Enter/Space, aria-haspopup="dialog")
- Each chip shows: label + primary big number + small hint line (no more chunky sub-text inline)
- Hover/focus reveals a `›` chevron on the right side of the value (animated)
- Click anywhere on chip opens the shared `#be-stat-modal`
- Modal renders correct content per chip (APIs has 3 sections, others 1)
- Footer of modal lists source files (clickable code spans)
- Dismiss: ✕ button, ESC, backdrop click — all PASS
- Inner-modal click does NOT close (stopPropagation verified)
- Z-index: drawer at 2000/2001, below toast at 3000 (toast remains visible)
- Build + lint: `node scripts/build-dashboard.mjs` clean, 5 inline scripts parsed OK
- Responsive: works at 1440 and 880; modal honors `min(680px, 96vw)` width cap
