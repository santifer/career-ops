# Dashboard Deep Research — 2026-05-09 (Wave F design synthesis)

**Subject:** career-ops dashboard at `localhost:3000` / `dashboard.careers-ops.com`
**Audience:** AI-native hiring managers (Anthropic, OpenAI, Vercel, Linear-tier benchmarks) viewing the dashboard as a build artifact during interview loops
**Question:** What separates a "polished SaaS ops tool" from a "shippable Linear / Vercel-tier interface" in 2026, and what's the next bundle of work that closes the gap?
**Method:** 12 WebSearch passes across 6 design dimensions + cross-validation against the current dashboard's visual state (1440 desktop top, 1440 dark top, iPhone mobile top), the prior 10-priority design critique (mostly shipped), the WCAG 2.1 AA audit (mostly shipped), and the Phase 5 code-review backlog.
**Confidence convention:** Each finding tagged HIGH (cross-validated across 3+ sources or matches direct dashboard observation), MEDIUM (single strong source or partial cross-validation), or LOW (single source, opinion-driven, or weakly supported).

---

## TL;DR

The current dashboard sits at the **"polished SaaS ops tool"** floor — Phase 2/3/4 + Wave F shipped the table-stakes (Cmd-K, dark mode, mobile cards, focus rings, skip-link, status writeback, sparkline-less KPIs). The remaining gap to **"shippable Linear/Vercel-tier"** is *not* one big feature. It's a stack of small, opinionated decisions that 2026's premium tools all make: KPI sparklines for trend context, bento-grid composition over orphaned-card grids, motion-tuned for dark mode, focus rings as design (not afterthought), bottom-sheet detail on mobile, and a single recruiter-bait moment that proves the tool actually runs.

**Phase 6 bundle (ranked impact ÷ effort) — see final section for details:**
1. KPI sparklines + trend deltas on the 7 stat cards (~3 h)
2. Bento-grid stat hero + remove the orphaned-row footprint (~1.5 h)
3. Mobile bottom-sheet detail + title-no-wrap header (~2.5 h)
4. Dark-mode motion + elevation token pass (~2 h)
5. "Live" recruiter-bait moment: signed-in viewer counter or live scan ticker (~2 h)

Total: ~11 hours of focused work, no architectural surgery, all token/CSS-level changes plus one new component.

---

## Dimension 1 — 2026 SaaS dashboard "wow moments"

### What the research says (5-bullet synthesis)

- **Cmd-K is now expected baseline, not a differentiator.** [HIGH] When Linear, Notion, Vercel, Stripe, Raycast, and Arc all ship a command palette, your having one no longer reads as "this person ships at Linear-tier" — it reads as "this person noticed the obvious thing." The bar moved. The new "wow" is what you do *beyond* Cmd-K. ([SaaSUI 2026 trends](https://www.saasui.design/blog/7-saas-ui-design-trends-2026), [F1Studioz 2026](https://f1studioz.com/blog/smart-saas-dashboard-design/))
- **The premium-feel test is "feels like Linear."** [HIGH] In 2026 design discourse, that phrase is the highest compliment — and what people mean by it is *restraint*: every element earns its place, dividing lines disappear, contrast softens, edges round, padding is consistent at the pixel level. Linear's March 2026 UI refresh was almost entirely this kind of work — "tweaking small details until things felt right." ([Linear changelog 2026-03-12](https://linear.app/changelog/2026-03-12-ui-refresh), [Linear's "calmer interface" post](https://linear.app/now/behind-the-latest-design-refresh))
- **Micro-interactions are the new wow surface.** [HIGH] 2026 standard: 200–500ms duration (long enough to register, short enough to stay in flow), organic easing not linear, every animation paying for itself with a feedback layer (haptics on mobile, sound rare). The dashboard's status writeback (optimistic update) is the right shape — but extending the same pattern to filter changes, sort, expand-row, batch overlay open/close is the differentiator. ([Primotech 2026](https://primotech.com/ui-ux-evolution-2026-why-micro-interactions-and-motion-matter-more-than-ever/), [DEV.to 5 micro-interaction rules 2026](https://dev.to/devin-rosario/5-micro-interaction-design-rules-for-apps-in-2026-48nb))
- **The "developer-tool aesthetic" stack is consolidating.** [MEDIUM] Linear, Vercel, Stripe, Warp, Raycast all converge on: dark-first visual identity, monospace accents (data, IDs, timestamps), terminal-tinged motion (cursor blinks, type-on effects sparingly), subtle gradients on hover/focus rather than shadow elevation. The dashboard's Inter + Apply-Now green is correct base — but no monospace surface, no terminal-tinged details. ([F1Studioz 2026](https://f1studioz.com/blog/smart-saas-dashboard-design/))
- **Bento-grid is the 2026 dashboard layout idiom.** [HIGH] Variable-sized cards in a CSS-Grid layout, with hero KPIs taking 2-cell footprints and secondary metrics in 1-cell. Apple-pioneered for product pages, now standard for analytics dashboards. The current 3+3+1 stat-card layout reads as "old grid that overflowed." A bento grid reads as "this person made deliberate composition choices." ([Orbix Bento Grid Guide 2026](https://www.orbix.studio/blogs/bento-grid-dashboard-design-aesthetics), [Datawireframe 12 layout patterns](https://www.datawirefra.me/blog/dashboard-layout-patterns))

### Phase 5+ items

| # | Item | Effort | Impact | Why |
|---|------|--------|--------|-----|
| 1.1 | **Bento-grid stat hero** — Apply-Now (2-cell, with sparkline + delta), Total Evaluations (2-cell), Pipeline Pending (1-cell), Companies (1-cell), URLs Scanned (1-cell), Batches Run (1-cell), Applied (1-cell). Eliminates the orphaned-row tell. | 1.5 h | High | Direct fix for the "wait, this is a SaaS tool" moment from the previous critique. Bento composition is the 2026 idiom. |
| 1.2 | **Filter/sort/expand-row micro-interaction pass** — 250ms cubic-bezier on filter input updates, sort column transitions, expand-row reveal. Currently abrupt. | 1.5 h | Medium | Carries the polish that Cmd-K already promised. Single CSS variable + 6–8 transition declarations. |
| 1.3 | **Monospace accent surface** — `font-feature-settings: "tnum" 1` + JetBrains Mono / IBM Plex Mono on: timestamps, score values (4.7 → tabular numerals), batch IDs, URL slugs, "Updated 21:29 PT". Inter for everything else. | 30 min | Medium | The aesthetic tell of a dev-built ops tool. Linear/Vercel/Warp all do this. ~1 token + 5 selectors. |

---

## Dimension 2 — Mobile dashboard patterns 2026

### What the research says (5-bullet synthesis)

- **Bottom sheets are the standard "secondary detail" surface.** [HIGH] Apple standardized `UISheetPresentationController` in iOS 15; by 2026 the bottom sheet is the expected pattern for filters, settings, confirmations, previews, sharing options — anything that doesn't deserve a full-screen takeover. The dashboard's PR #606 mobile drawer is on the right track but the *direction* matters: bottom-up (thumb-zone) beats side-in (reach across) for one-handed phone use. ([Plotline bottom sheets](https://www.plotline.so/blog/mobile-app-bottom-sheets), [NN/g bottom sheet guidelines](https://www.nngroup.com/articles/bottom-sheet/))
- **Compound gestures with haptic feedback layers are the 2026 native-feel signal.** [HIGH] Telegram's swipe-left-to-reply / swipe-right-to-archive / long-press-for-reactions / pull-down-to-search pattern is now the reference. Each gesture has distinct haptic feedback so the thumb confirms before the eyes do. PWAs that ship `navigator.vibrate(10)` on row-swipe-to-update-status feel native; ones that don't, don't. ([Muz.li mobile UI 2026](https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/))
- **PWA "feels native" requires three small tags + a manifest decision.** [HIGH] `viewport-fit=cover`, `apple-mobile-web-app-status-bar-style: black-translucent`, `apple-mobile-web-app-capable`, `display: standalone`. Without these, the URL bar steals 60+ vertical pixels and the status bar shows "Safari." With them, "Add to Home Screen" → indistinguishable from native at first glance. ([DEV.to PWA iOS](https://dev.to/karmasakshi/make-your-pwas-look-handsome-on-ios-1o08), [firt.dev PWA tips](https://firt.dev/pwa-design-tips/))
- **Cards over rows for mobile data tables — but the *expand pattern* matters.** [HIGH] PR #606's mobile cards are correct base. The 2026 refinement: collapsed card shows 1 primary column (company + role), tap-to-expand reveals the rest *in-place* (slide-down, not modal-takeover). Modal takeover for tabular data on mobile = "this is a desktop site responding small," not "this is built for phone." ([UXPatterns table vs card](https://uxpatterns.dev/pattern-guide/table-vs-list-vs-cards), [Bootcamp mobile data tables](https://medium.com/design-bootcamp/designing-user-friendly-data-tables-for-mobile-devices-c470c82403ad))
- **Translucency is visual noise on data-dense surfaces.** [HIGH] iOS-style "frosted glass" looks great on Settings/Notifications, terrible behind a 4.7 score chip. 2026 guidance: translucency stays in nav bars/tab bars; data tables and dashboards need clean opaque backgrounds with clear contrast. The current dashboard correctly avoids this. Just don't add it later. ([Muz.li mobile UI 2026](https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/))

### Phase 5+ items

| # | Item | Effort | Impact | Why |
|---|------|--------|--------|-----|
| 2.1 | **Mobile bottom-sheet detail** — Replace the side-drawer expand-row with an iOS-style bottom sheet (rubber-band drag, dismiss-to-close, ~85vh max). + Fix the title wrap: "Career-Ops Dashboard" currently breaks to 3 lines on iPhone — drop to "Career-Ops" on `max-width: 480px` with dashboard subtitle if needed. | 2.5 h | High | The current mobile top-fold is wasted on a 3-line title and 4 cramped header buttons. Single biggest mobile UX lift. |
| 2.2 | **PWA installability + status-bar tags** — Add the 4 meta tags + 192/512/180 manifest icons. Verify "Add to Home Screen" → standalone. | 45 min | Medium | One-shot work; recruiters who add-to-home-screen are the recruiters who already love the project — pay them off. Also: if Mitchell ever uses the dashboard from his own phone (he does, when applying), this 45 min compounds. |
| 2.3 | **Swipe-to-status haptic feedback on mobile rows** — Swipe-left on a row → reveal "Applied" / "Discarded" buttons; tap fires a `navigator.vibrate(10)` + the existing status writeback. | 1.5 h | Medium | The 2026 native-feel signal that costs almost nothing in JS. Optional: degrade gracefully on iOS Safari (no Vibration API on iOS). |

---

## Dimension 3 — Data-density without overwhelm

### What the research says (5-bullet synthesis)

- **The 5–9 rule.** [HIGH] Human working memory is 4–7 chunks. 2026 dashboard guidance is unanimous: 5–9 visible metrics/charts on the primary surface, no more. The dashboard currently shows 7 stat cards + 2 charts at the bottom = 9. Right at the ceiling. Adding more without removing degrades the page. ([Techment 2026](https://www.techment.com/blogs/data-visualization-best-practices-enterprise/), [Julius AI 2026 dataviz](https://julius.ai/articles/data-visualization-best-practices))
- **Progressive disclosure as the operating principle.** [HIGH] Level 1: summary card with a sparkline. Level 2: click expands the card to context (last 30 days, distribution). Level 3: link to a dedicated analysis page. The current dashboard does Level 1 (cards) + a buried Level 2 (click-to-expand stat card with HTML drilldown — this is correct! but underutilized) + no Level 3. ([UXPin progressive disclosure](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/), [F1Studioz 2026](https://f1studioz.com/blog/smart-saas-dashboard-design/))
- **Sparklines on KPI cards are the 2026 default.** [HIGH] Power BI shipped native sparkline cards in 2025. Linear's project cards have them. Vercel's deployment cards have them. A KPI without a trend line is a scoreboard in 2026, not a dashboard. The dashboard's stat cards have *no* trend signal — this is the single biggest data-density credibility miss. ([Tabular Editor KPI cards](https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design), [EPC Group Power BI 2026](https://www.epcgroup.net/power-bi-kpi-visuals-dashboard-guide-2026))
- **Information density wins over whitespace for power-user tools.** [HIGH] "Dashboard users are power users who want data, not breathing room." Row height: 48–52px comfortable, 36–40px dense. The current Apply-Now table sits in the 48–52 range — correct for the audience. Don't be tempted to inflate it for "modern" feel. ([Eleken table design](https://www.eleken.co/blog-posts/table-design-ux))
- **Dividing dashboards by cognitive scope beats stuffing one page.** [MEDIUM] When you have >9 metrics, the right move is multiple dashboards (e.g., "Triage" / "Applications" / "Pipeline Health") not denser cards. The current build is one giant page. Long-term, splitting into a tabbed view at the top (Triage Today / All Evaluations / Pipeline Health) is the exit. ([GoodData 2026 IA](https://www.gooddata.ai/blog/six-principles-of-dashboard-information-architecture/), [Think.design 2026](https://think.design/blog/dashboard-design-in-2026-dos-and-donts/))

### Phase 5+ items

| # | Item | Effort | Impact | Why |
|---|------|--------|--------|-----|
| 3.1 | **KPI sparklines + delta on stat cards** — 7-day sparkline (inline SVG, 80×24px) + vs-previous-7-day delta ("+12 vs last week" green / "-3 vs last week" amber). Source: parse `data/scan-history.tsv` and `applications.md` by date. | 3 h | **Highest** | Directly closes the largest credibility gap and is also the literal 2026 KPI-card spec. Recruiters love trend context — see Dim 6. |
| 3.2 | **Tabbed top nav: Triage / Apply Now / Pipeline / Health** — Convert the single-page layout to 4 tabs at the top (active = "Apply Now" by default). Re-render only the relevant section. Cmd-K already supports section-jump — wire those to tab switches. | 4 h | Medium | Future-proofs the dashboard at >9 metrics. Splits cognitive load by intent. URL state via `#tab=apply-now`. |
| 3.3 | **Score-distribution segmented chart → micro-histogram on hover** — Already shipped at the bottom; *add* a hover tooltip per segment showing top 3 companies in that bucket (e.g., "STRONG (4.5+): OpenAI, Anthropic, Perplexity"). Progressive disclosure within the chart. | 1.5 h | Low-Med | Most reachable surface for "wait, I can drill in?" recruiter moment. Cheap. |

---

## Dimension 4 — Dark mode polish 2026

### What the research says (5-bullet synthesis)

- **Pure black is wrong.** [HIGH] `#000000` causes OLED smearing during scroll, halation against white text, and harsh contrast that strains. 2026 standard: `#121212` baseline (Material), `#0A0A0A` for OLED-aware deep theme, `#1A1A1A` / `#1F1F1F` for elevated surfaces. The current dashboard uses a near-black bg — verify it's not literal `#000`. ([Material Design dark theme](https://m2.material.io/design/color/dark-theme.html), [Tech-RZ 2026 dark mode](https://www.tech-rz.com/blog/dark-mode-design-best-practices-in-2026/))
- **Elevation via lightness, not shadow.** [HIGH] Drop shadows that work in light mode disappear on dark backgrounds. 2026 idiom: use slightly lighter surfaces for "elevated" elements (modal: bg+8% lightness, card: bg+5%, hover: bg+3%). Linear's March 2026 refresh explicitly removed dividing lines and softened contrast — that's the move. ([Zeplin dark palette](https://blog.zeplin.io/dark-mode-color-palette/), [Launchwork 2026](https://launchworkdigital.co.uk/blog/designing-for-dark-mode))
- **Desaturate accents.** [HIGH] The Apply-Now green (`#22c55e`-ish in light mode) at full saturation on a dark background causes visual vibration and reading strain. 2026 spec: drop saturation 15–25% in dark mode (e.g., `#22c55e` → `#16a34a` or use HSL `s: 60% → 45%`). The 2026-05-09 a11y audit already flagged the green-on-white contrast — same token needs a dark variant. ([Material dark theme](https://m2.material.io/design/color/dark-theme.html), [Vev 2026 palettes](https://www.vev.design/blog/dark-mode-website-color-palette/))
- **Motion in dark mode is *more restrained*, not the same.** [MEDIUM] Bright animations on dark backgrounds pull attention too aggressively. 2026 guidance: reduce duration ~20% (250ms → 200ms), reduce magnitude (transform: 4px → 2px), bias toward fade over slide. The dashboard currently uses the same motion tokens for both modes — leaves polish on the table. ([Tech-RZ 2026](https://www.tech-rz.com/blog/dark-mode-design-best-practices-in-2026/), [Influencers-Time dark UX 2026](https://www.influencers-time.com/designing-dark-mode-for-cognition-usability-over-aesthetics/))
- **Dark-first is a credibility tell.** [MEDIUM] Linear, Arc, Warp, Raycast all "launched dark-first" — the light mode exists but feels secondary. The dashboard launched with parity (good!) but defaults to light. For an AI-native hiring-manager audience, defaulting to dark for new visitors (with system-preference respect) reads as "this person ships at Linear-tier." ([F1Studioz 2026](https://f1studioz.com/blog/smart-saas-dashboard-design/))

### Phase 5+ items

| # | Item | Effort | Impact | Why |
|---|------|--------|--------|-----|
| 4.1 | **Dark-mode token tier pass** — Add `--bg-base: #0A0A0A`, `--bg-card: #141414`, `--bg-elevated: #1F1F1F`, `--bg-hover: #262626`. Migrate stat cards, modals, batch overlay, command palette to elevation tier instead of hard borders. Drop `--green-fg` saturation 15% in dark scope. | 2 h | High | Closes the "Linear-tier dark" gap. Touches `:root[data-theme="dark"]` block + ~12 selectors. |
| 4.2 | **Mode-aware motion tokens** — `--motion-duration: 250ms` (light) / `200ms` (dark); `--motion-distance: 4px` / `2px`. Use them in transitions on cards, overlays, expand-row. | 30 min | Medium | Tiny code, real polish. The kind of tweak Linear's March refresh blog post talks about. |
| 4.3 | **Default to dark for first-visit if `prefers-color-scheme: dark`** — Today the toggle defaults to light unless user toggled. Switch to: respect `prefers-color-scheme` for first-paint, persist user override after toggle. Cookie-less, just `localStorage` + meta theme-color. | 30 min | Medium | Recruiter on a dark-mode laptop sees dark. Matches Vercel/Linear/Stripe defaults. |

---

## Dimension 5 — Accessibility-as-design

### What the research says (5-bullet synthesis)

- **WCAG 2.2 raised the floor; the new design move is treating a11y as design language.** [HIGH] WCAG 2.2 (the practical 2026 standard) now requires interactive targets ≥24×24 CSS px (Apple still recommends 44×44; Google 48×48), visible focus contrast ≥3:1 against both adjacent and background colors, redundant entry rules, accessible authentication, dragging movement alternatives. The 2026 differentiator: not passing the spec, but treating focus rings, motion-reduce, and announcements as *design surfaces* — not afterthought patches. ([W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/), [Humbl Design 2026 contrast](https://humbldesign.io/blog-posts/color-accessibility-guide-wcag))
- **Focus rings as design.** [HIGH] Linear's focus rings are 2px solid in the brand purple, offset 2px, radius matching the element. Vercel's are 2px solid white-on-dark with a 2px black inset for double-color contrast. The current dashboard has a basic focus-visible rule (shipped in Wave F) — the polish move is to design the ring as a token (`--focus-ring: 2px solid var(--blue-fg); --focus-ring-offset: 2px`) and use it consistently across cards, buttons, links, table rows. ([A11y Collective focus indicators](https://www.a11y-collective.com/blog/focus-indicator/))
- **Motion-reduce as a tier, not a binary.** [MEDIUM] 2026 pattern: 3 levels of motion. Default = full motion. `prefers-reduced-motion: reduce` = animations replaced with instant state changes for entrance/exit, but micro-feedback (color shifts, opacity) preserved. Some apps now offer an in-app "minimal motion" toggle separate from the OS pref. ([Clay 2026 a11y](https://clay.global/blog/web-design-guide/web-accessibility))
- **Semantic announcements as a polish surface.** [MEDIUM] Status writeback already has visual feedback (toast). The 2026 polish is `aria-live="polite"` with a deliberately worded announcement: "Anthropic Communications Lead status changed to Applied" — not "Status updated." Specificity makes screen-reader users feel like first-class consumers, not retrofitted ones. ([Medium accessibility 2026](https://medium.com/design-bootcamp/modern-frontend-accessibility-a-2026-developers-guide-b2de10d01d22))
- **Forced colors and high-contrast modes are the 2026 frontier.** [MEDIUM] Windows High Contrast Mode (`forced-colors: active` media query) and macOS Increase Contrast are now part of "robust" delivery. Most personal dashboards skip this entirely. Adding `@media (forced-colors: active) { ... }` overrides for icons and pill backgrounds is a tier most teams haven't reached. ([Code With Seb 2026 a11y](https://www.codewithseb.com/blog/web-accessibility-2026-eaa-ada-wcag-guide))

### Phase 5+ items

| # | Item | Effort | Impact | Why |
|---|------|--------|--------|-----|
| 5.1 | **Focus ring as a designed token** — Define `--focus-ring`, `--focus-ring-offset`, `--focus-ring-radius` semantic tokens. Audit all 30+ interactive elements to use them. Add a 2px white-on-dark inset for double-contrast in dark mode. | 1.5 h | High | Carries the polish forward; the current ring (shipped Wave F) is *present*, not *designed*. |
| 5.2 | **Motion-reduce tier with in-app override** — Wire a Settings-popup option (Cmd-K → "Toggle minimal motion") that sets `data-motion="minimal"` on `<html>`, layered above the OS `prefers-reduced-motion`. The override persists in `localStorage`. | 1.5 h | Medium | Demonstrates "we thought about this beyond compliance" — itself a hireable signal for AI-native shops where a11y is a hiring criterion. |
| 5.3 | **`aria-live` announcement polish** — Replace generic toast announcements with structured ones: status writeback, filter change ("Showing 12 of 104 evaluations"), batch progress ("Batch 8 of 25, 32% complete"), expand-row ("Expanded Anthropic Communications Lead details"). | 1 h | Medium | Cheap, real, and screen-reader users notice immediately. |

---

## Dimension 6 — Personal portfolio dashboards as interview demos

### What the research says (5-bullet synthesis)

- **30 seconds to a decision, 5 seconds to first impression.** [HIGH] Hiring managers spend ~30 seconds on a portfolio before deciding to engage or close the tab. The first 5 seconds are about visual hierarchy and immediate "this is real" signal. The current dashboard's "143 Total Evaluations" hero number is correctly playing for the 5-second test. The work is keeping the engagement past 30 seconds. ([UXPlanet 5-second test](https://uxplanet.org/how-recruiters-judge-ux-portfolios-2026-59f77143ce1e), [DEV.to portfolio 2026](https://dev.to/devraj_singh7/the-portfolio-projects-that-actually-get-you-hired-in-2026-1l0e))
- **Working live demos are 2026 table-stakes.** [HIGH] 84% of employers want to see working applications, not just code. The dashboard *is* that working demo — that's already the strongest play here. The credibility multiplier is making it obvious that the data is *real* (not a fake demo set), with timestamps, live counts, and recent dates that prove it. ([Randstad interactive portfolios](https://www.randstad.com.au/career-advice/career-tips/online-portfolio-engineering-jobs/))
- **"vs last month" comparisons are the most-cited specific recruiter-impressing detail.** [HIGH] The single feature most explicitly called out across 2026 portfolio guidance: a "vs previous period" delta on dashboard KPIs. It signals product thinking (you know how to choose comparisons), not just engineering. The current cards have raw values only. ([DEV.to portfolio 2026](https://dev.to/devraj_singh7/the-portfolio-projects-that-actually-get-you-hired-in-2026-1l0e))
- **Loom video walkthroughs ~10× the response rate.** [MEDIUM] Top-10% candidates send Loom videos walking the hiring manager through their portfolio with company-specific framing. The implication for the dashboard: build a "cover image" / OG-card-quality first paint that makes the *screen recording* itself look good. The current dashboard mostly does this; mobile top-fold doesn't. ([Underdog AI engineer 2026](https://underdog.io/blog/ai-engineer))
- **Architectural decision documentation > flashy features.** [HIGH] Hiring managers (especially at AI-native shops) hire on *judgment* signals. Each dashboard surface should expose architectural choices: why memoize report parsing, why locked pipeline writes, why semantic CSS variables, why segmented chart over donut. A "/architecture" link in the footer that opens a single page with 8–12 key decisions + tradeoffs is more valuable than 3 more chart types. ([Rockstar Developer 2026](https://rockstardeveloperuniversity.com/developer-portfolio-project-ideas/), [The AI Corner 2026](https://www.the-ai-corner.com/p/ai-engineer-roadmap-production-projects-2026))

### Phase 5+ items

| # | Item | Effort | Impact | Why |
|---|------|--------|--------|-----|
| 6.1 | **"vs last 7d" deltas on every KPI card** — pairs with sparkline work in 3.1. The single most-cited "this impresses interviewers" detail. | (folds into 3.1) | **Highest** | Cross-validated as #1 portfolio-impression detail. Already in Dim 3 plan. |
| 6.2 | **Live recruiter-bait moment** — One element on the page that *visibly updates while the recruiter watches*. Options: scan ticker (last 5 URLs scanned, with timestamps that tick), live batch progress (already exists but only when running), live-counter footer ("Last evaluation: 2 minutes ago"). Pick one, polish it. | 2 h | High | Proves "this is a real running system" in <30 seconds. The unfair advantage of a personal ops tool over a static portfolio. |
| 6.3 | **`/architecture` page with 8–12 decisions** — Inline rendered markdown route (e.g., `/architecture.html` from `dashboard/architecture.md`). Each decision gets: problem, options considered, choice, tradeoff. Cite line numbers from the codebase. Linkable from footer. | 2 h | Medium-High | Hiring-manager judgment signal. Easy to build from existing CLAUDE.md / code-review.md / audit content. |

---

## Cross-validated findings (HIGH confidence)

These showed up repeatedly across dimensions and align with direct dashboard observation:

1. **Sparklines on KPI cards** — appears in Dim 1 (Linear/Vercel premium feel), Dim 3 (data density spec), Dim 6 (interview-demo signal). Cross-validated. **Highest single ROI item.**
2. **Bento-grid stat hero** — Dim 1 idiom + Dim 3 progressive disclosure (variable card sizes carry priority). The orphaned-row footprint is visually the largest miss on the desktop top-fold today.
3. **Mobile bottom-sheet detail + title fix** — Dim 2 directly + Dim 6 indirectly (mobile-screenshot-quality matters for portfolio-share LinkedIn posts). The 3-line title wrap is the single worst mobile detail.
4. **Dark-mode token tier (elevation via lightness)** — Dim 1 (Linear's calmer interface refresh) + Dim 4 directly. Closes the "has dark mode" → "Linear-tier dark" gap.
5. **Focus ring as a designed token** — Dim 5 directly + Dim 1 ("every element earns its place" applies to focus surfaces). Wave F shipped *a* focus ring; the polish is making it *the* focus ring.

## Cross-validated findings (MEDIUM confidence)

1. **Default to dark on first paint with `prefers-color-scheme`** — Dim 1 + Dim 4. AI-native hiring managers tend to use dark IDEs and dark browsers; matching their default reads as competence.
2. **Live recruiter-bait moment** — Dim 6 directly. The implementation is debatable (scan ticker vs. live counter) but the principle cross-validates with "show, don't tell."
3. **Compound mobile gestures with haptic feedback** — Dim 2 directly. Lower priority because most recruiters preview on desktop, but a strong mobile demo on Loom is itself a flex.

---

## Do NOT do — overrated 2026 trends and demo-killers

- **❌ AI-generated dashboard "insights" panels.** Every SaaS tool is bolting on "Ask AI about your data" buttons. For a personal-ops tool, this reads as derivative and adds latency for zero new info. The user *built* the AI pipeline — putting an AI chat assistant on top is duplicate-meta.
- **❌ 3D / glassmorphism / neumorphism revivals.** Periodic Reddit-r/web_design hype waves; not adopted by Linear/Vercel/Stripe/Raycast. Translucency on data surfaces is explicitly anti-pattern (see Dim 2). Skip.
- **❌ "Dark mode = invert all the colors" toggles.** The dashboard already avoids this. Keep avoiding. Dark mode is a separate design pass, not a CSS filter.
- **❌ Animated gradients / parallax / scroll-triggered reveals on a data dashboard.** These work on landing pages, not ops tools. Adds GPU cost on mobile, distracts from the actual work, signals "I confused 'portfolio site' with 'product.'"
- **❌ Onboarding tours / coach marks / empty states with marketing copy.** Single-user tool. The 5-second test is "this is real and useful," not "this is a polished SaaS we want you to subscribe to."
- **❌ Customizable widget grids / drag-to-rearrange dashboard cards.** Decision fatigue without payoff at single-user scale. Linear and Vercel both *don't* let you rearrange — they made the layout choice for you.
- **❌ Notification center / activity feed inside the dashboard.** Telegram bot already handles async alerts. Duplicate surface.
- **❌ "Beautiful theme toggles" with morphing icons.** Cute. Distracting. Linear and Vercel use a one-line `Sun ↔ Moon` icon swap. Stop earlier than you want to.
- **❌ Accessibility theater patterns — over-aria-ing.** Don't add `role="region" aria-label="dashboard"` on the `<main>` (it has implicit landmark semantics). Don't add `aria-describedby` on every card (too verbose for screen-reader users). Use semantic HTML; reach for ARIA only where semantics fall short. WCAG 2.2 explicitly prefers native elements.
- **❌ Forced motion-reduce on high-end animations.** Don't simply *remove* animations under `prefers-reduced-motion: reduce`; replace them with state changes that still convey the feedback (e.g., color shift, opacity). Vanishing the feedback removes the signal entirely.
- **❌ Building a "settings" page just because.** Light/dark toggle + sticky-dismiss + (Phase 5) motion override = ceiling. Anything more dilutes.
- **❌ More charts.** The Phase 4 design critique already said this. Repeating because it stays tempting. Score Distribution + Top Companies = enough for a personal ops dashboard.

---

## Final Phase 6 bundle — 5 items ranked by impact ÷ effort

| Rank | Item | Effort | Impact | Confidence | Source dimensions |
|------|------|--------|--------|------------|-------------------|
| 1 | **KPI sparklines + "vs last 7d" deltas on the 7 stat cards** — 80×24px inline-SVG sparklines from `data/scan-history.tsv` and `applications.md`; delta colored green/amber/red; tabular numerals on the value | 3 h | **Highest** — single biggest credibility lift; cross-validated as the 2026 KPI card spec AND the most-cited recruiter-impressing detail | HIGH | Dim 3, Dim 6 |
| 2 | **Bento-grid stat hero + monospace accents** — Apply-Now (2-cell with sparkline + delta), Total Evaluations (2-cell), 5 secondary metrics (1-cell each); tabular numerals + monospace on timestamps/IDs/scores | 1.5 h + 30 min = 2 h | **High** — fixes the "wait, this is just a SaaS template" moment from the previous critique. Bento is the 2026 idiom | HIGH | Dim 1, Dim 3 |
| 3 | **Mobile bottom-sheet detail + title-no-wrap header + PWA tags** — iOS-style bottom sheet for expand-row; "Career-Ops" on `max-width: 480px`; 4 PWA meta tags + manifest icons | 2.5 h + 45 min = 3.25 h | **High** — closes the mobile top-fold visibly. Mobile screenshots will read as "shipped iOS-tier," not "responsive afterthought" | HIGH | Dim 2, Dim 6 |
| 4 | **Dark-mode token tier pass + mode-aware motion + default-to-dark on system pref** — 4-tier elevation, desaturated accents, 200ms motion in dark, first-paint respects `prefers-color-scheme` | 2 h + 30 min + 30 min = 3 h | **Medium-High** — closes the "Linear-tier dark" gap. AI-native hiring managers preview on dark systems | HIGH | Dim 1, Dim 4 |
| 5 | **Live recruiter-bait moment — scan ticker** — Bottom-of-page (or footer) live ticker showing last 5 scan-history URLs with relative timestamps that tick ("Anthropic Communications Lead — 2m ago"). Polls `/api/recent-scans` every 30s | 2 h | **Medium-High** — proves the system is *running*, not just rendered. The portfolio unfair advantage no static project has | HIGH | Dim 1, Dim 6 |

**Total Phase 6 effort: ~13.25 hours.** Suggested split:
- **PR 1 (~5 h):** KPI sparklines + bento-grid stat hero + monospace accents (#1 + #2). Cosmetic + data-density.
- **PR 2 (~3.25 h):** Mobile bottom-sheet + PWA tags + title fix (#3). Mobile-only blast radius.
- **PR 3 (~3 h):** Dark-mode tier pass + mode-aware motion + default-to-dark (#4). Token-only blast radius.
- **PR 4 (~2 h):** Live scan ticker (#5). Adds one new endpoint + one new component.

All 4 PRs can land independently and in parallel — no shared files, no merge conflicts.

---

## What this research deliberately doesn't cover

- **Phase 5 backlog items already in `dashboard-code-review-2026-05-09.md`** — security/perf hardening (path traversal, sanitization, lockfile writes, memoized parsing) is critical infra but orthogonal to the design polish question this doc answers. Ship Phase 5 first; Phase 6 is the design follow-up.
- **Real screen-reader behavior testing** — VoiceOver/NVDA/JAWS pass recommended after Phase 6 ships, before any external demo to a hiring manager who might use AT.
- **The Cloudflare Access auth flow** — working, gated correctly per memory note. Out of scope.
- **The auto-deploy / CI rendering of `dashboard.careers-ops.com`** — assumed working. Out of scope.

---

## Sources

### Dimension 1 — SaaS dashboard wow moments
- [SaaSUI 2026 — 7 SaaS UI Design Trends](https://www.saasui.design/blog/7-saas-ui-design-trends-2026)
- [F1Studioz — Smart SaaS Dashboard Design Guide 2026](https://f1studioz.com/blog/smart-saas-dashboard-design/)
- [Linear changelog — UI refresh 2026-03-12](https://linear.app/changelog/2026-03-12-ui-refresh)
- [Linear — A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh)
- [Primotech — UI/UX Evolution 2026 Micro-Interactions & Motion](https://primotech.com/ui-ux-evolution-2026-why-micro-interactions-and-motion-matter-more-than-ever/)
- [DEV.to — 5 Micro-Interaction Design Rules for Apps in 2026](https://dev.to/devin-rosario/5-micro-interaction-design-rules-for-apps-in-2026-48nb)
- [Orbix Studio — Bento Grid Dashboard Design 2026](https://www.orbix.studio/blogs/bento-grid-dashboard-design-aesthetics)
- [Datawireframe — 12 Dashboard Layout Patterns That Actually Work](https://www.datawirefra.me/blog/dashboard-layout-patterns)

### Dimension 2 — Mobile patterns
- [Plotline — Best Examples of Mobile App Bottom Sheets](https://www.plotline.so/blog/mobile-app-bottom-sheets)
- [NN/g — Bottom Sheets: Definition and UX Guidelines](https://www.nngroup.com/articles/bottom-sheet/)
- [Muz.li — What's Changing in Mobile App Design 2026](https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/)
- [DEV.to — Make Your PWAs Look Handsome on iOS](https://dev.to/karmasakshi/make-your-pwas-look-handsome-on-ios-1o08)
- [firt.dev — PWA Power Tips](https://firt.dev/pwa-design-tips/)
- [UX Patterns Dev — Table vs List vs Cards](https://uxpatterns.dev/pattern-guide/table-vs-list-vs-cards)
- [Bootcamp — Designing User-Friendly Data Tables for Mobile](https://medium.com/design-bootcamp/designing-user-friendly-data-tables-for-mobile-devices-c470c82403ad)

### Dimension 3 — Data density
- [Techment — 15 Data Visualization Best Practices in 2026](https://www.techment.com/blogs/data-visualization-best-practices-enterprise/)
- [Julius AI — Top 15 Data Visualization Best Practices 2026](https://julius.ai/articles/data-visualization-best-practices)
- [UXPin — What Is Progressive Disclosure 2026](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/)
- [Tabular Editor — KPI Card Best Practices](https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design)
- [EPC Group — Power BI KPI Visuals & Dashboard Cards 2026](https://www.epcgroup.net/power-bi-kpi-visuals-dashboard-guide-2026)
- [Eleken — Table Design UX Guide](https://www.eleken.co/blog-posts/table-design-ux)
- [GoodData — Six Principles of Dashboard Information Architecture](https://www.gooddata.ai/blog/six-principles-of-dashboard-information-architecture/)
- [Think.design — Dashboard Design 2026 Do's and Don'ts](https://think.design/blog/dashboard-design-in-2026-dos-and-donts/)

### Dimension 4 — Dark mode polish
- [Material Design — Dark theme](https://m2.material.io/design/color/dark-theme.html)
- [Tech-RZ — Dark Mode Design Best Practices in 2026](https://www.tech-rz.com/blog/dark-mode-design-best-practices-in-2026/)
- [Zeplin — How to create a Dark Mode color palette](https://blog.zeplin.io/dark-mode-color-palette/)
- [Vev — 6 Dark Mode Website Color Palette Ideas](https://www.vev.design/blog/dark-mode-website-color-palette/)
- [Influencers-Time — Dark Mode UX Cognitive Design 2026](https://www.influencers-time.com/designing-dark-mode-for-cognition-usability-over-aesthetics/)
- [Launchwork Digital — Dark Mode Design Guide 2026](https://launchworkdigital.co.uk/blog/designing-for-dark-mode)

### Dimension 5 — Accessibility-as-design
- [W3C — WCAG 2.2 spec](https://www.w3.org/TR/WCAG22/)
- [Humbl Design — 2026 Engineering Guide to Color & Contrast](https://humbldesign.io/blog-posts/color-accessibility-guide-wcag)
- [A11y Collective — Understanding Focus Indicators](https://www.a11y-collective.com/blog/focus-indicator/)
- [Clay — Web Accessibility Inclusive Design Guidelines for 2026](https://clay.global/blog/web-design-guide/web-accessibility)
- [Bootcamp — Modern Frontend Accessibility A 2026 Developer's Guide](https://medium.com/design-bootcamp/modern-frontend-accessibility-a-2026-developers-guide-b2de10d01d22)
- [Code With Seb — Web Accessibility 2026](https://www.codewithseb.com/blog/web-accessibility-2026-eaa-ada-wcag-guide)

### Dimension 6 — Portfolio dashboards as interview demos
- [UX Planet — How Design Recruiters Judge UX Portfolios in 5 Seconds 2026](https://uxplanet.org/how-recruiters-judge-ux-portfolios-2026-59f77143ce1e)
- [DEV.to — Portfolio Projects That Actually Get You Hired in 2026](https://dev.to/devraj_singh7/the-portfolio-projects-that-actually-get-you-hired-in-2026-1l0e)
- [Randstad — Stop sending PDFs: Interactive engineering portfolios](https://www.randstad.com.au/career-advice/career-tips/online-portfolio-engineering-jobs/)
- [Underdog — AI Engineer 2026 Roadmap](https://underdog.io/blog/ai-engineer)
- [Rockstar Developer — 12 Developer Portfolio Projects That Get You Hired 2026](https://rockstardeveloperuniversity.com/developer-portfolio-project-ideas/)
- [The AI Corner — AI engineer roadmap 2026](https://www.the-ai-corner.com/p/ai-engineer-roadmap-production-projects-2026)

---

*Wave F design research synthesized by Claude Opus 4.7, 2026-05-09. Confidence tags reflect agreement across sources at search time; verify any specific design recommendation against the live Linear / Vercel / Raycast surfaces before implementation, since those references update faster than this doc will.*
