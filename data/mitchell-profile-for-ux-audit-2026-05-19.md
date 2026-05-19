# Mitchell Williams — UX Audit Lens (2026-05-19)

**Purpose:** This file is the single authoritative persona-lens for evaluating every dashboard surface tonight (BRAVO) AND for any future UX / content / ATS / detection audit. Anchor every recommendation back to this profile.

**Sources:**
- `cv.md` — canonical 2-page CV @ 1,289w
- `article-digest.md` — 18 proof points, archetype-tagged
- `interview-prep/story-bank.md`
- Memory (compensation priority, decision-maximization, dashboard-public-URL guardrail)
- `AGENTS.md` + `CLAUDE.md` (operating rules)

---

## 1. Who Mitchell is (snapshot)

- 14 years of operational experience: 8 at Google (xGE + Corp Eng / TechStop), 6 prior in network newsrooms (AJ+, HuffPost Live, Fusion, CCTV, Al Jazeera English).
- At Google xGE, shipped **three production LLM agents** serving ~1,000 Principal/Distinguished/Fellow ICs (top 0.5% of Google's ~180K-person eng org):
  1. Autonomous Comms Triage Agent (3-prompt: triage/revise/escalate; >90% classification accuracy; ~160 hrs/year recaptured)
  2. Executive RAG pipeline — "Voice DNA" + "Kill List" (90% drafting-latency reduction; 99% stylistic fidelity)
  3. AI-driven mentorship platform (3.5 hrs → <20 min per match; 300%+ active-deployment capacity scaling for H1 2026)
- Built a 50M-view AJ+ production line; coached three real-time producers (Mara Van Ells, Yara Elmjouie, Sana Saeed) into on-camera principals with their own shows + Emmy/Webby wins — talent pipeline as a system-design outcome.
- Recent operational recency: Ahmed Shihab-Eldin Kuwait coalition (Apr 2026) — 52-day detention → release in 11 days post-CPJ. Crisis comms + OPSEC + multi-stakeholder coordination.
- Anthropic Skill Builder certified (May 2026, claude-opus-4-7 cohort).
- Personal infrastructure: career-ops fork (this repo) — agentic pipeline w/ parallel workers, zero-token portal scanning, dashboard at `https://dashboard.careers-ops.com/` (Cloudflare Tunnel → localhost).

## 2. Target archetypes (canonical priority order)

| Tier | Archetype | Notes |
|---|---|---|
| **A2 primary** | AI Forward Deployed Engineer (FDE) | Client-facing, fast delivery, prototype-to-prod |
| **A2 primary** | AI Solutions Architect | Enterprise integrations, end-to-end design |
| **A2 primary** | Agent Builder | Multi-prompt orchestration, RAG, HITL |
| **A2 primary** | AI Program Manager (PgM) | Governance, intake, metrics, portfolio |
| **A2 primary** | AI Enablement | Adoption, change management, training |
| **B secondary** | Communications Manager (Research / Editorial / Tech) at AI-native | Frontier-lab comms — Anthropic, OpenAI Editorial Lead, etc. |
| **A1 tertiary** | AI Residency / Fellowship | Only fires on residency/fellowship JDs |

**Hybrid sweet spot:** roles requiring both production-AI capability AND executive-comms-under-litigation fluency — e.g., Anthropic Communications Manager Research, Developer Education Lead, Technical Enablement Lead (Claude Code), OpenAI AI Deployment Engineer (Media Partnerships).

## 3. The North Star filter (memory-confirmed, load-bearing)

> **"Compensation + pre-IPO equity is the primary filter. Above all: total comp, pre-IPO timing, RSU value at vest. Open to any role needing his expertise or aligned with goals."**

Translation for UX: Every dashboard surface that shows a role MUST make comp + equity + IPO-window visible at a glance. Burying it behind a drawer click or a JSON expander is a hallucinated priority hierarchy.

## 4. Decision-maximization pattern (memory-confirmed)

> **"I almost always choose the most robust, quality, and costly option — despite time needed to complete or spend."**

Translation for UX:
- "Quick win" buttons should not crowd out the high-effort high-confidence path.
- The dashboard should default to the council-of-7 + dealbreaker route, not a Haiku-only "save money" path.
- Surface confidence bands wherever a metric is computed. Quality decisions need confidence.
- Speed and cost are reportable, not the primary CTA.

## 5. Voice + tone preferences (writing-side, surfaces narrow to UX implication)

- First-person voice in all assistant responses. **"My repo," not "your repo."**
- No marketing copy. No exclamation marks. No emoji unless asked.
- Smart Brevity discipline (from the Comms Triage Agent design).
- Acronyms must resolve on hover or in-line, never assumed.

## 6. UX signal preferences (the lens itself)

### What Mitchell VALUES on a dashboard

- **Dense actionable signal.** Tile that shows "12 days runway / $3.2M target / Anthropic 4.8 score" beats three separate widgets each showing one number.
- **Zero cost of thinking.** If I have to compute "what does 4.8/5 mean for this row," the design failed. Show "ship-ready (top 8%)" not "4.8/5".
- **Clear next moves.** Don't show me data — show me the next action and what answering it unlocks.
- **Honest empty states.** When a metric has no data, say so with reason ("no hm-intel cached; run intel-refresh") — never show 0% confidently.
- **Provenance.** Every computed number must trace back to source data + when it was last computed. GAMMA audit overlaps here.
- **Compounded views.** A single row should expose: comp, equity, IPO window, ship-readiness, gaps, warm-path leverage, days-since-applied, last-touch, next-touch — all on one drawer expand.

### What Mitchell IS ANNOYED BY

- **Marketing copy.** "Polish your pack to perfection" → wrong. "Polish: 99% confidence target, $0.92 last run" → right.
- **Unexplained acronyms.** FDE / AAA / SSE / HM / KB on first appearance with no tooltip = friction.
- **Dimmed-out modals that don't tell me what to do.** A grayed CTA with no "you need X" hint is dead weight.
- **Hidden data.** Anything behind a click that could have lived on the tile.
- **Asking without showing the unlock.** "Re-run HM research?" without telling me it costs $5–$30 and refreshes 4 caches is a half-question.
- **0% scores with no provenance.** Looks confident, isn't.
- **Auto-reopening dismissed UI.** Closed/minimized should stay dismissed for the session (memory-confirmed).

## 7. Deal-breakers + hard constraints (UX implications)

- **No on-site-only** roles. The dashboard's location chip should make remote vs hybrid vs onsite visible at the tile level, not buried.
- **No startups <20 people.** Headcount visibility wanted.
- **No "must be in PT during AAA hours"** — Seattle PT-aligned, no flex needed.
- **OPSEC discipline** carries over: don't surface personal emails / contact info in screenshots I'd share. Dashboard sits behind Cloudflare Access — confirmed.
- **Personal data stays in fork only** — UI should never offer a "share to santifer/upstream" button.

## 8. Failure modes the lens detects

Apply these literal tests to every surface tonight:

1. **The 6-second scan test.** Can a recruiter / hiring manager read this row in 6 seconds and know if it's worth opening? If not, the row label is failing.
2. **The "data unavailable" test.** When hm-intel/positioning/toxicity is missing, does the surface degrade gracefully or show a fake 0%?
3. **The "what does this number mean" test.** Click into any metric. Does the surface explain its band (top 5% / top 20% / etc.) and its computation?
4. **The "next move" test.** After reading the surface, do I know the next action? Or am I left to figure it out?
5. **The "marketing copy" test.** Re-read every CTA + label. Anything that sounds like a SaaS landing page is a hit.
6. **The acronym test.** Any 3+-letter abbreviation visible to a first-time reader without an inline definition is a hit.
7. **The dismissal-respect test.** If I close a modal / collapse a section, does it stay closed on poll / refresh / SSE tick? (Memory-confirmed prior incident.)
8. **The provenance test.** Every computed number must show: source, last computed, confidence (where applicable). Missing = hit.
9. **The comp/equity visibility test.** Every role tile must show comp + equity + IPO window without a click — this is THE primary filter.
10. **The 4-month-job-hunt-fatigue test.** I've been searching since approximately Feb 2026. Every extra click compounds. The dashboard MUST minimize click-cost.

## 9. Surfaces in scope tonight (BRAVO territory)

Per coordination doc, BRAVO is auditing/implementing:

- ✅ Sidebar tiles (all except network-leverage — ZETA owns that)
- ✅ Apply-now queue (top + bottom, sort/filter/score chips)
- ✅ Drawer popouts (except apply-pack-polish drawer surface — ALPHA territory)
- ✅ Score popout, gap chips
- ✅ Settings / config surfaces if any
- ✅ Live-ticker / heartbeat / KPI strip
- ❌ Run Batch + Process All modals (just shipped tonight in 6f44a6e/4a04f4f — Instance #3 territory)
- ❌ network-leverage drillIn (ZETA replaces ~line 14755)
- ❌ apply-pack drawer "Polish pack ✨" surface (ALPHA territory)
- ❌ Editing Priority callout (DELTA territory)

## 10. The implementer's prime directive

For every recommendation tonight:

1. **File:line citation.** No "tighten the visual design" — name the renderer function and the line.
2. **Current vs desired behavior.** Concrete diff, not vibes.
3. **Effort estimate.** XS (<10 min), S (10–30 min), M (30–90 min), L (half-day), XL (multi-day).
4. **Mitchell-lens "why-it-matters."** Tie back to a numbered failure mode in §8.
5. **Implement AAA tonight. AA in batch pass. A → backlog. B → declined with rationale.**
6. **DEFER any rec touching ALPHA/ZETA/DELTA territory** — coordinate via the coordination doc, do not silently overlap.

Signed: β BRAVO · 2026-05-18 23:40 PT
