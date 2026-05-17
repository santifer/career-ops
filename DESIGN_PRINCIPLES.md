# Career-Ops Design Principles — the North Star

Authored 2026-05-17 after Mitchell explicitly named the theme behind every UX request from the 2026-05-16 calibration onward: *"providing the user important and relevant information in visually accessible ways to help them action more quickly and understand their limitations and their strengths for this role while also knowing what's running in the background, what i could possibly run with all the info i need."*

This document is the WHY behind every system decision in `DASHBOARD_INVARIANTS.md`, `AGENTS.md`, the modes/ scoring rubrics, the agent system prompts, the heartbeat email, and every script that surfaces information to the user. When a design decision is ambiguous, default to whichever option scores highest against the 5 pillars below.

---

## The North Star

> **Surface decision-grade information in a scannable, action-paired, transparent way — so Mitchell can act fast, understand both fit and risk for each role, see what's running in the background, and know what he could trigger next with full cost/time/outcome visibility.**

That sentence is load-bearing. Memorize it. Every screen, every section, every prompt, every email gets evaluated against it.

---

## The 5 Pillars

### Pillar 1 — Scannability over comprehensiveness

**Default to structure, not prose.** A wall of text is a failure regardless of how detailed it is. The user's eye should bounce across the page picking up signals without parsing sentences.

**In practice:**
- Bullets, tables, two-column comparisons — never paragraph-blocks for decision data
- Color + icon + text together (never color alone) for status / urgency / health verdicts (WCAG 1.4.1)
- 4-8px spacing rhythm; clear dividers between conceptually distinct sections
- Font ≥12.5px for body, ≥10px for meta — line-height 1.5; weight 500+ on interactive labels
- Truncate aggressively in tables, reveal in drawer / hover / cell-expand (per `DASHBOARD_INVARIANTS.md` §8b)

**Anti-pattern:** the original "Tradeoffs vs Google xGE" rendering as one `<p>` clump.
**Pattern that landed:** two-column grid with bulleted pros/cons per side.

### Pillar 2 — Action proximity

**Every piece of information must have its next-action button within thumb's reach.** If the user reads a fact and has to navigate away to act on it, the design failed. Decision and action live next to each other.

**In practice:**
- Per-row Apply / Skip / Defer in every queue
- Discard prompts capture the WHY at the moment of discarding (not retrospectively)
- Outreach cards get Snooze / Cancel / Log Touch / Open Chat inline on the card
- Cost-preview modals show the action (Run / Force Override / Cancel) on the same screen as the cost number
- Stale-pipeline alerts and bucket counts are clickable → popout with per-row actions

**Anti-pattern:** stats that show counts but require navigating elsewhere to see what's in them.
**Pattern that landed:** the new bucket-modal popouts where clicking "83 DISCARDED" opens a table of the 83 items with per-row Report / Apply / Reactivate actions.

### Pillar 3 — Strengths AND limitations, balanced

**For every role: show both why it fits AND why it might not, with quantified deltas where possible.** Career decisions live in the trade-off space; surfacing only the bright side breeds bad calls.

**In practice:**
- Drawer's "What Fits" + "Gaps Analysis" + "Tradeoffs vs current Google xGE" side by side
- Role-at-a-glance enrichment (next session): % alignment to skills, % likelihood of interview, % likelihood of HM noticing — every "yes" signal paired with the "but"
- Toxicity flags (FLAG-REVIEW) and TTO concerns surfaced AT the same level of prominence as fit-score
- Council intel surfaces dissent prominently (Block I in council-eval reports) — not buried
- Auto-trash on hard exclusions (defense contractors); flag-for-review on softer concerns (toxicity score 50+) — never silent

**Anti-pattern:** a 4.7/5 score with no view into what's at risk.
**Pattern that landed:** every drawer shows "What Fits" + gaps + tradeoffs + rejection cooldown banner where applicable, and the new bucket popouts include status (Discarded, Skip) rows so user sees what didn't make it AND why.

### Pillar 4 — Background transparency

**The user must always be able to see what's running, what it's costing, and when it'll finish.** Silent background processes that the user can't introspect breed distrust and accidentally-redundant clicks.

**In practice:**
- Sidebar Batch box shows real-time completed / failed / running / pending — click to expand to full live detail (per-batch durations, costs, recent failures)
- System-status banner in heartbeat email reports which Tier 5 features are active
- Runway-density widget surfaces pipeline health verdict (healthy / stretched / critical) with the underlying metrics in click-to-expand detail
- Process All modal shows running progress + per-company status during the orchestrator run
- Background subagent runs report progress to logs the user can tail
- Every long-running script writes a `_summary.md` artifact + appends to `data/cost-log.tsv`

**Anti-pattern:** a "Run Batch" button with no way to see what's actually running underneath.
**Pattern that landed:** the new clickable Batch box popout streams real-time status; the Process All v2 modal has per-company progress; the heartbeat email's system-status banner reports active features.

### Pillar 5 — Future-action awareness with full cost/time/outcome preview

**Before any action that spends money, takes time, or changes state — show what it costs, how long it takes, what'll happen, and let the user choose.** Surprise spend or surprise side-effects are unacceptable.

**In practice:**
- Run Batch / Process All modals show cost preview + cap status + force-override checkbox before firing
- Per-run caps default to safe values; burst mode requires explicit env-var opt-in
- Create Materials confirm dialog states "~$2-5, ~3-5 min, outputs to apply-pack/{N}-{slug}/"
- Apply-pack pre-gen for high-confidence items is automatic only when explicitly enabled — otherwise it's a button the user clicks
- Discard / snooze / cancel actions show the consequence (next-fire date, what's removed) before committing
- Heartbeat email lists what's *available* to fire (`/council`, `/dealbreaker`, `/github-readiness`, etc.) with cost ranges

**Anti-pattern:** clicking a button and an opaque "running…" indicator with no insight into spend or duration.
**Pattern that landed:** every spend-incurring action ships with a cost + time + outcome preview that the user explicitly confirms.

---

## Cross-checking new work against the principles

When designing a new dashboard feature, new agent, new modal, or new email section, score it 0–5 against each pillar:

| Pillar | Question |
|---|---|
| 1 — Scannability | Can the user understand the key takeaway in <3 seconds without reading sentences? |
| 2 — Action proximity | Is the next-action button visible without scrolling or navigating? |
| 3 — Strengths + limitations | Does this surface both the fit AND the risk, both the gain AND the cost? |
| 4 — Background transparency | If something runs because of this, can the user see it running + see what it spent? |
| 5 — Future-action awareness | Are the user's potential next moves visible with cost/time/outcome attached? |

Any score < 3 on any pillar → the design needs rework before shipping.

---

## Anti-patterns to actively reject

- **Walls of paragraph text where bullets/tables would surface signal faster** (e.g., the original drawer Team-gaps / Comp-intel / Provider-disagreements clumps)
- **Color-alone signals** without icon or text (WCAG 1.4.1 violation) — fixed by the Outreach Pulse v3 icon-badge work
- **Static counts that don't drill in** — fixed by the clickable bucket counts + clickable stale-pipeline alert
- **Silent automation** — every script writes a summary, every spend logs to `cost-log.tsv`, every background process is surfaced somewhere in the UI
- **Spend without preview** — every council, every batch, every apply-pack pre-gen confirms cost before firing
- **One-sided role views** — never just "what fits" without "what's missing"; never just "high score" without "what's the risk"
- **Inline-blocked alerts the user can't escape** — Snooze + Cancel on outreach cards is the canonical pattern
- **Dead-end labels** — every count, every status pill, every tag should reveal its underlying rows on click

---

## Relationship to other docs

- **`DASHBOARD_INVARIANTS.md`** — the *table-specific* instantiation of these principles. Invariant #8 (Universal table baseline) is Pillar 1 + Pillar 2 applied to tables.
- **`AGENTS.md`** — corpus auto-edit + agent attribution patterns. Pillar 4 (transparency) lives here — git log is the audit trail.
- **`modes/_shared.md`** — scoring rubric weights. Pillar 3 lives here — wealth + TTO + bridge-to-AI-PM + comp + toxicity are all weighted alongside fit.
- **`data/career-calibration-20260516-190152.md`** — the calibration brief Mitchell defined. This file derives from that calibration's UX implications.

---

## When the principles conflict

Rare, but it happens. Defaults for resolving:

- **Scannability vs detail** → scannability wins; details live one click away (drawer, popout, expand-row)
- **Action proximity vs visual cleanliness** → action proximity wins; absorb the visual cost
- **Strengths vs limitations** → BOTH are surfaced, never just one; limitations get equal visual weight (color + size + position)
- **Background transparency vs noise** → transparency wins UNTIL it becomes noise; then move detail to a click-to-expand
- **Future-action awareness vs cognitive load** → preview the cost/time/outcome but don't pre-decide; user always picks

When you can't decide which way to default, **ask Mitchell — the principles are his**, not the system's.
