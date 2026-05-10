# Sunday Morning Briefing — 2026-05-10

**Window:** Saturday 4pm PST → Sunday morning. Total session arc this weekend: Friday + Saturday + Sunday early morning.
**Sunday spend:** ~$45 in API tonight.
**Total weekend spend:** ~$145 of ~$235 budget. ~$90 remaining.

---

## ⚡ FIRST FIVE MINUTES OF YOUR DAY

1. **Open `data/APPLY-NOW.md`** — recalibrated rankings ready. Top 3: **OpenAI AI Deployment Engineer (88) · OpenAI Onboarding & Enablement PgM FDE (86) · Anthropic Strategic Ops Mgr Marketplace (80)**. Composite scoring (40 base + 25 equity + 20 freshness + 15 tier).
2. **Refresh `dashboard.careers-ops.com` on phone** — OTP once, then good for 30 days. The "dangerous site" warning has likely cleared (Google's authoritative list confirmed clean).
3. **Open `dashboard/assets/demo/desktop-1440-top.png`** — see the new bento grid + KPI sparklines + live scan ticker + monospace tabular numerals. Then `desktop-1440-dark-top.png` for the OLED polish.
4. **Skim this brief** for what shipped + what's flagged for your action.

---

## What shipped overnight (Wave F + Wave G + recovery)

### Wave F (5 PRs) — Saturday 9-11pm
- **[#31](https://github.com/mitwilli-create/career-ops/pull/31)** OLED-aware dark mode + AAA contrast + tinted card surfaces + focus-ring polish
- **[#32](https://github.com/mitwilli-create/career-ops/pull/32)** Per-row notes + activity log v2 (resolves the conflict that closed the original)
- **[#33](https://github.com/mitwilli-create/career-ops/pull/33)** Email-template launcher v2 — 3 templates, mailto: pre-fill, localStorage usage tracking
- **[#34](https://github.com/mitwilli-create/career-ops/pull/34)** Phase 5 code-cleanup — consolidated entity decoders, js-yaml for canonical statuses, removed dead code
- **[#35](https://github.com/mitwilli-create/career-ops/pull/35)** Mobile-native gestures — swipe-to-dismiss + long-press multi-select + safe-area-inset + PWA splash images

### Wave G (5 PRs from deep design research) — Sunday 12-2am
- **[#36](https://github.com/mitwilli-create/career-ops/pull/36)** **Bento-grid stat hero** — eliminated the orphaned-row tell. 2-cell heroes (Apply-Now + Total Evals) + 5 single-cell secondaries. Linear-tier composition.
- **[#37](https://github.com/mitwilli-create/career-ops/pull/37)** **KPI sparklines + 7-day trend deltas** on every stat card. The single biggest credibility upgrade per the research. ("A KPI without a trend line is a scoreboard, not a dashboard." — Power BI 2026 spec.)
- **[#38](https://github.com/mitwilli-create/career-ops/pull/38)** **Mobile bottom-sheet detail** — iOS-style rubber-band drag, dismiss-to-close. Plus title-no-wrap fix ("Career-Ops" on phone instead of 3-line wrap).
- **[#39](https://github.com/mitwilli-create/career-ops/pull/39)** **Live scan ticker** — recruiter-bait proof of liveness. Pulsing dot + rolling last-5 scan events in the toolbar. The "this thing actually runs" moment.
- **[#40](https://github.com/mitwilli-create/career-ops/pull/40)** **Filter/sort/expand-row micro-interactions** + monospace accent surface (IBM Plex Mono on scores, timestamps, IDs — the dev-tool aesthetic tell).

### Recovery fix
- **`57f3952`** fix: cleaned up #37 sparklines merge — defined `kpiSpark` variable + removed duplicate cards. (One conflict was missed by the keep-both Python script and shipped to main with markers; recovered within 2 minutes.)

---

## Pipeline processing results

- **64 pending pipeline items** triaged
- **6 advanced** to batch evaluation (passed archetype + location + dedup + blocklist filters)
- **58 filtered out** per freshness rules — wrong archetype, wrong location, or already in tracker
- **Batch eval submitted** to Anthropic batches API; results will land via Sunday's normal merge cycle (existing in-progress batch from May 9 still processing — 40 requests, in_progress)
- **0 conflicts** with the recalibration — the 6 newly-advanced items will join the 25 already in Apply-Now once they're evaluated

---

## ⭐ Apply-Now Recalibration — top 25 ready in `data/APPLY-NOW.md`

**Methodology:** composite score (0-100) = base eval (40) + equity/IPO upside (25) + freshness (20) + tier match (15). Late-stage warning flag for postings >45 days old (none triggered tonight).

**Top 3:**
1. **OpenAI — AI Deployment Engineer · score 88**
2. **OpenAI — Onboarding & Enablement Program Manager FDE · score 86**
3. **Anthropic — Strategic Operations Manager, Claude Marketplace · score 80**

**Equity data caveat:** `data/overpay-signals/CURRENT.md` hasn't been seeded yet (first scheduled run is Wednesday 03:00 PT). Recalibration used best-knowledge May 2026 defaults per company. Re-running after Wednesday's overpay-signals will sharpen the equity-component scoring.

**Files updated:**
- `data/APPLY-NOW.md` — human-readable top 25 with reasoning
- `data/apply-now-queue.json` — machine-readable full ranked array (dashboard reads this)
- `data/apply-now-recalibration-2026-05-10.md` — methodology + per-row breakdown + flagged items

---

## What's now LIVE in your dashboard (cumulative state — Sunday morning)

### Visual (post-Wave-G)
- Bento-grid stat hero (Linear-tier composition, no orphaned cards)
- KPI sparklines + delta indicators on every card (7-day trend with vs-last-week comparison)
- Live scan ticker (pulsing dot + rolling events in toolbar — proof of liveness)
- Tinted card surfaces in dark mode (OLED black + AAA contrast on text)
- IBM Plex Mono on data/timestamps/IDs (dev-tool aesthetic)
- Micro-interactions on filter/sort/expand (250ms cubic-bezier, reduced-motion-aware)

### Functional
- Cmd-K command palette with all actions
- Bulk operations (multi-row select + bulk status writeback)
- Drag-and-drop priority on Apply-Now
- Saved filter views
- Per-row notes + activity log
- Per-row email-template launcher (3 templates, mailto: pre-fill)
- Quick-add role from dashboard
- Status writeback (no terminal needed)
- Search across report content (gaps + stories + recommendations indexed)
- PWA install + iOS splash images
- Mobile bottom-sheet detail with rubber-band drag
- Long-press multi-select on mobile
- Swipe-to-dismiss gestures
- Read-only share link with demo mode
- Demo mode toggle (`?demo=1`)
- Lighthouse CI budget enforced
- Playwright test suite (8 critical flows)

### Intel
- Equity / IPO posture column on every row
- Comp analytics widget (distribution + floor-gap + top earners)
- Trend graphs (apps/week + score/week + funnel)
- Persistent batch history view

### Infra
- Cloudflare Tunnel + Access (1-month session — no more daily OTP)
- 14 launchd jobs (3 new this weekend: dashboard-phase3 / overpay-signals / career-library)
- Cache report extracts (1,397+ disk reads eliminated per build)
- Single-source parseApplications + statusKey
- Fork-only PR enforcement in worker scripts

---

## Pending for your action / decision

| Item | Why it's pending | Quick recommendation |
|------|------------------|----------------------|
| **`mitchellwilliams.com` domain swap** | Requires GoDaddy login (only you can do); runbook at `data/cloudflare-domain-swap-runbook.md`. The `dashboard.careers-ops.com` Chrome heuristic warning has likely cleared, but mitchellwilliams.com is the demo-grade move. | Do when convenient — not blocking. Personal-name domain reads stronger to recruiters than careers-ops.com. |
| **Storytellermitch Squarespace live execution** | Static preview at `data/storytellermitch-preview/index.html` ready for visual review before touching live site. | Open the index.html in browser. If approved, schedule a focused 2-hour Chrome MCP session. |
| **Monolith refactor of `build-dashboard.mjs`** | Now **7,285 lines** (was 974 Friday). Code-review flagged this as 🔴 must-fix. Too risky overnight; needs daylight focus. | Schedule as a Wave H next weekend. The split: `dashboard/index.html.mjs` (template) + `dashboard/style.css` + `dashboard/app.js` + `lib/report-extract.mjs`. ~2-3 days of focused work. |
| **Wednesday's overpay-signals run** | First scheduled fire of the Wednesday 03:00 PT job. Will populate `data/overpay-signals/CURRENT.md`. | After it fires, re-run the recalibration script for sharper equity-component scoring. |
| **CodeRabbit follow-up** | The Saturday cross-fork PR exposure was cleaned up; walkthroughs on closed PRs remain visible (file names + descriptions only, no content). | Path 3 accepted earlier; revisit if you ever want a fully clean record. |
| **In-flight batch from May 9 13:41Z** | Anthropic batches API queue — 40 requests, status in_progress. Not blocking; results merge into tracker when complete. | Check Sunday afternoon if not yet completed. |

---

## Spend summary (weekend total)

| Phase | Spend |
|-------|-------|
| Friday session (12 PRs) | ~$45 |
| Saturday Wave A-D (14 PRs) | ~$55 |
| Sunday Wave F (5 PRs + research doc) | ~$25 |
| Sunday Wave G (5 PRs) | ~$15 |
| Recovery + screenshots + briefing | ~$5 |
| **Total weekend** | **~$145** |
| **Remaining API budget** | **~$90** |

Plenty for next week's work — Wednesday's overpay-signals run + recalibration + any urgent dashboard fixes will fit comfortably.

---

## Reference docs created this weekend

- `data/dashboard-strategy-2026-05-09.md` — original 4-phase plan
- `data/dashboard-design-critique-2026-05-09.md` — Phase 4 design priorities
- `data/dashboard-accessibility-audit-2026-05-09.md` — WCAG 2.1 AA findings
- `data/dashboard-code-review-2026-05-09.md` — Phase 5 backlog
- `data/dashboard-deep-research-2026-05-09.md` — Phase 6 bundle (most shipped via Wave G)
- `data/dashboard-domain-research-2026-05-09.md` — domain options analysis
- `data/cloudflare-domain-swap-runbook.md` — when ready to move to mitchellwilliams.com
- `data/storytellermitch-strategy-merged-2026-05-09.md` — portfolio rebuild plan
- `data/storytellermitch-preview/` — static HTML mock of the 7-page rebuild
- `data/session-report-2026-05-09.md` — Friday night session report
- `data/session-report-2026-05-09-saturday.md` — Saturday session report
- `data/sunday-briefing-2026-05-10.md` — this doc
- `data/APPLY-NOW.md` — fresh ranked queue (just regenerated)
- `data/apply-now-recalibration-2026-05-10.md` — full methodology + per-row breakdown

---

## End-of-weekend state

- **Open PRs:** 0
- **Build:** clean (7,285 lines, 1,397 cache hits, 757 reports rendered)
- **Dashboard live:** dashboard.careers-ops.com (auth-gated, 1-month session)
- **Scheduled jobs:** all 14 loaded, next firings: Mon 06:00 (dashboard-phase3) / Wed 03:00 (overpay-signals) / Sun 04:00 (career-library)
- **Confidential data exposure on santifer:** zero (closed PRs from Saturday remain with file-list-only walkthroughs; accepted per Path 3 decision)
- **Pipeline:** 64 → 6 advanced → batch eval submitted → results sync via normal flow
- **Apply-Now queue:** recalibrated and ready for triage
- **Demo screenshots:** fresh, 4 viewports × 3 variants each = 12 PNGs

You're in a great position to wake up, glance at APPLY-NOW.md, see what's most worth your time today, and start applying. Nothing requires immediate action. Sleep well.

🌅
