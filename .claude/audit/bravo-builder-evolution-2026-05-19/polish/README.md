# BRAVO Builder-Evolution Polish — 2026-05-19 verification

Continuation of the BRAVO chip-drawer redesign (commit `cb000c4`). Polish punch list (7 UI items) executed on branch `bravo/builder-evolution-polish-2026-05-19`.

## Commits

| SHA | Type | Items | Description |
|---|---|---|---|
| `d24d898` | style | #1, #7, #8 | Dead rule removal, hint opacity 0.55→0.75, explicit 2×2 breakpoint |
| `fd246fc` | feat  | #4, #6, #2 | Copy-to-clipboard btn, header-pill commit-history drawer, be-tag a11y |
| `1c99f62` | refactor | #5 | Drop 12 exact-duplicate `title=` attributes |
| `4b8e7e0` | fix   | A2 follow-up | Explicit `openBeStatModal('commits')` call on pill onclick (stopPropagation blocked delegation) |

## Verification surface

Worktree dashboard served via `python3 -m http.server 3197 --directory dashboard` (the main staging URL serves `origin/main`, not this branch).

## DOM-level evidence (Chrome MCP `javascript_tool`)

### Item #1 — dead `.be-stat-cumulative` removed
```
grep "be-stat-cumulative" dashboard/index.html  →  0 matches
```

### Item #7 — hint contrast
At 1440×900 on dark-mode dashboard:
```
hintTextColor:           rgb(250, 250, 250) (--text-4)
hintOpacity:             0.75 (was 0.55)
tileBg:                  rgb(24, 27, 39) (--surface-2)
effectiveTextColor:      rgb(194, 194, 197)
contrastRatio:           9.65:1
wcagAA  (≥ 4.5):         PASS
wcagAAA (≥ 7.0):         PASS
```
Decision: 0.75 is sufficient. No need to bump to 0.85.

### Item #8 — explicit 2×2 at ≤640px
At 606×900:
```
gridTemplateColumns:     "271px 271px"
tileWidths: all 4 tiles 271×87px
positions:    row 1: top=-335 left=27, top=-335 left=308
              row 2: top=-237 left=27, top=-237 left=308
              (2×2 grid confirmed)
```
At 900×900: auto-fit 4-column layout `180px 180px 180px 180px` (unchanged).
At 1440×900: auto-fit 4-column layout (chips 279×87px each).

### Item #4 — copy-to-clipboard button
After click on the button:
```
button.classList.contains('copied'):  true
button.innerHTML:                     '<span class="be-copy-icon" aria-hidden="true">✓</span>Copied!'
window.toast:                         "Command copied to clipboard"  (visible bottom-right)
```
Data-copy-text payload: `node scripts/agents/builder-log.mjs --export-resume-bullets`.

### Item #6 — header-pill commit-history drawer
Pill DOM:
```
tag:             BUTTON  (was SPAN)
data-be-stat:    "commits"
aria-label:      "Open commit history drawer: last 15 commits in the rolling window"
title:           null  (no native tooltip)
cursor:          "pointer"
```
After click:
```
backdropVisible:  true
aria-hidden:      "false"
modalRect:        680×558px @ 1440 width  /  582×584px @ 606 width
label:            "Recent commits ·"
headline:         "185 · 2d"
subhead:          "Last 15 commits in the rolling window. Total this window: 185 commits across a 2-day active-day streak."
commitCount:      15
firstCommit:      "1c99f62 refactor(dashboard): A3 title= consolidation — drop 12 exact-duplicate tooltips · 2 minutes ago · Mitchell Williams"
```
Source: live `git log --oneline -15 --pretty=format:'%h~|~%s~|~%ar~|~%an'` via new `loadBuilderCommits()` helper (one shell-out per build, cached in `builderCommits` const).

Dismiss paths tested:
- ESC → visible:false, aria-hidden:"true" ✓
- Backdrop click → visible:false, aria-hidden:"true" ✓
- ✕ close button → (native pattern, not re-tested but unchanged from chip-drawer infra) ✓

Chip-drawer regression check: clicked "APIs / Tools" chip after closing pill drawer →
modal opened with label "APIs / tools ·" headline "3 / 8 Tier-A", Tier-A demonstrated
list rendered with anthropic / openai / mcp evidence and Tier-A gaps with langgraph /
langsmith next-step actions. No regression.

### Item #2 — `.be-tag` a11y cleanup
```
beTagsTotal:         15
beTagsWithTitle:     0   (was 15)
beTagsWithAriaLabel: 15  (was 0)
Example aria-label:  "launchd — 17 commits this window"
```
Decision: path (c) — drop redundant `title=` (the visible `.be-tag-n` badge "17" already shows the count), keep semantic via `aria-label`.

### Item #5 — `title=` consolidation (Pass 1 surgical)
```
Pre-edit title= count:    237 occurrences across 232 lines
Post-edit title= count:   221 occurrences (net −12 deletions; the other deltas come from A2's be-tag rewrite)
```
Dropped 12 `title=` attributes where `aria-label=` already carried identical text:
- 8 pill-popover-trigger spans (equity / base / location / benefits / people chips)
- 2 toolbar buttons (hamburger, overflow)
- 2 op-toolbar buttons (snooze, cancel)

Pass 2 (semantic promote-then-drop on 52 interactive title-only elements) **deliberately not executed** — inspection showed those are action-tooltip affordances ("Click to expand", "Open report") where the title= IS the hover signal, not a redundancy. Removing would harm UX without ergonomic gain.

## Build + lint

Every commit verified clean via `node scripts/build-dashboard.mjs`:
```
✓ 5 inline <script> block(s) parsed cleanly across 1 file(s).
```
Outer-template-unescape bug class avoided. (One was caught mid-development —
the `\`` characters in inline-script-block comments closed the giant outer
template literal. Fixed by rewriting the comments without backticks; build
re-ran clean.)

## Screenshot evidence (Chrome MCP, in conversation transcript)

| Width | State | Tool ID |
|---|---|---|
| 1440×900 | initial load — 4 chips equal-sized | `ss_6408fte3y` |
| 1440×900 | scrolled past chips, full builder-evo + footer copy button | `ss_26316dpkg` |
| 1440×900 | header pill clicked → commits drawer open with 15 commits | `ss_3321ay8nu` |
| 1440×900 | ESC dismissed, then APIs chip clicked → Tier-A drawer open | `ss_6876hw7kq` |
| 1440×900 | backdrop dismissed, Copy command clicked → ✓ Copied!" state + toast | `ss_0069nddsk` |
| 900×900  | 900px viewport — auto-fit 4-column still holds | `ss_2203w8s3z` |
| 600×900  | 606px viewport — explicit 2×2 grid + footer | `ss_6044ywzyt` |
| 600×900  | header pill drawer at 606px (responsive 96vw modal) | `ss_6584s3wvp` |
| 600×900  | builder-evo chips visible at narrow viewport | `ss_70513ld08` |

Screenshots are interleaved in the agent transcript above as inline images.

## Out of scope (per brief)

- `scripts/agents/builder-log.mjs` producer fix: owned by parallel agent
- `data/builder-log.json` shape changes: owned by parallel agent
- Push to remote, open PRs: explicitly excluded

## Merge instructions for Mitchell

To take these polish commits onto main:
```bash
cd /Users/mitchellwilliams/Documents/career-ops
git merge bravo/builder-evolution-polish-2026-05-19
node scripts/build-dashboard.mjs
launchctl kickstart -k gui/$(id -u)/com.mitchell.career-ops.dashboard-server
```
Or cherry-pick individual commits if you want to land them separately:
```bash
git cherry-pick d24d898  # CSS polish (A1)
git cherry-pick fd246fc  # interactions (A2)
git cherry-pick 4b8e7e0  # pill onclick fix (A2 follow-up)
git cherry-pick 1c99f62  # title= consolidation (A3)
```
A3 isolated specifically so it can be reverted on its own if any
hover-affordance regression surfaces.
