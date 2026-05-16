# Design Spec: `/career-ops compass` — Career Discovery Mode

**Date:** 2026-05-13  
**Status:** Approved  
**PR scope:** `modes/compass.md` (new) + `AGENTS.md` (modified) + `.agents/skills/career-ops/SKILL.md` (modified, symlinked from `.claude/`)  
**Follow-on PR:** `/career-ops polish` — CV enhancement for target archetypes (out of scope here)

---

## Problem

The current onboarding flow (AGENTS.md Step 2) assumes the user already knows their target roles and archetypes. Users who don't know what they want — or who are at a career crossroads — have no guided path. They land in a system built for clarity before they have it.

---

## Goal

Give users who don't know their direction a structured, conversational path to figure it out — and end up with a working `profile.yml` and `_profile.md` without having to fill in blanks themselves.

---

## Design

### Overview

A single new mode, `compass`, that combines:
1. Silent CV analysis (what your background implies)
2. Adaptive discovery questions (what you actually want)
3. An ikigai-style reveal comparing the two
4. Interactive profile file drafting with section-by-section approval

The mode is standalone (`/career-ops compass`) and reachable from onboarding when the user is unclear on target roles.

---

### Files Changed

| File | Change |
|------|--------|
| `modes/compass.md` | New mode file — all discovery logic |
| `AGENTS.md` | Step 2 onboarding: add offramp for users who don't know their target roles |
| `.agents/skills/career-ops/SKILL.md` | Add `compass` to routing table and discovery menu (symlinked from `.claude/`) |

---

### Compass Flow

#### Phase 0 — Profile Check

Read `config/profile.yml` and `modes/_profile.md`.

- If both are missing or contain only example/placeholder data → proceed to Phase 1 directly
- If real data exists → ask: *"I see you already have a profile set up. Do you want to revisit your direction, or start fresh?"*
  - "Revisit" → run full compass, frame questions around what's changed
  - "Start fresh" → run full compass as if no profile exists
  - Either path ends at Phase 4 with a new draft

**Placeholder detection:** profile is considered a placeholder if `candidate.full_name` is `"Jane Smith"` or `candidate.email` contains `"example.com"`.

---

#### Phase 1 — Silent CV Analysis

Read `cv.md` if it exists. Do not show output to the user. Internally derive:

If `cv.md` is absent, skip the analysis and proceed to Phase 2. Archetype detection becomes discovery-only; the Phase 3 reveal will omit the CV-derived baseline and present discovery findings directly.

- **Domains** — what fields/industries the candidate has worked in
- **Functions** — what they've actually done (build, consult, manage, train, sell, deploy, support)
- **Seniority signals** — years of experience, titles held, scope of responsibility
- **Candidate archetypes** — 2–3 best-fit archetypes from `_shared.md` with internal rationale notes

Store all of this. It will surface only in Phase 3.

---

#### Phase 2 — Adaptive Discovery Questions

Ask questions conversationally, one at a time. Never present a form or numbered list.

**Core questions (always asked, in this order):**

1. *"What kind of work energizes you most — building things, helping people solve problems, leading strategy, something else?"*
2. *"What would you want more of in your next role that you don't have enough of now?"*
3. *"What would be a hard no — work that would drain you, or conditions you'd walk away from?"*

**Adaptive follow-ups** — ask when signals warrant it:

| Signal | Follow-up |
|--------|-----------|
| Vague or "I don't know" answer | *"Tell me about a time at work when you felt most in your element. What were you doing?"* |
| Mentions a crossroads or transition | *"What's changed for you recently that's making you rethink your direction?"* |
| Clear direction but two competing options | *"If you had to pick one to optimize for in the next 2 years, which would it be — [A] or [B]?"* |
| No mention of environment preferences | *"What kind of company environment fits you best — early-stage startup, growth-stage, enterprise, or something else?"* |
| No signal on IC vs leadership | *"Do you want to go deeper as an individual contributor, or are you drawn to building and leading a team?"* |
| Ambiguous on remote/location | *"Any constraints on location or travel?"* |

**Stopping rule:** stop asking when archetypes have converged and deal-breakers are clear. Minimum 3 questions, maximum 10. If the user is consistently uncertain after 7 questions, surface a "here's what I'm hearing" summary and ask them to react rather than asking more questions.

---

#### Phase 3 — Ikigai Reveal

This is the moment where the two threads come together.

Present in three parts:

**Part 1 — What your background says:**
> *"Based on your CV alone, before you told me anything, here's where I would have pointed you..."*

Show the 2–3 CV-derived archetype candidates with a one-sentence rationale for each (e.g., "9 years of client-facing technical work at enterprise software companies is a strong signal for Solutions Architect or Forward Deployed Engineer").

**Part 2 — What you told me:**
> *"Here's what I heard from your answers..."*

A brief synthesis of the discovery questions: what energizes them, what they want more of, their deal-breakers, and any strong directional signals.

**Part 3 — Where they overlap (and where they don't):**
> *"Here's where your background and your answers point to the same place — that's your strongest signal..."*

Highlight archetype(s) that appear in both the CV analysis and the discovery answers. If there's a gap — e.g., CV points to Solutions Architect but the user said they want to stop being client-facing — name it explicitly and let them react.

End with:
- **Primary archetype(s):** strongest fit, both from background and stated preferences
- **Secondary archetype(s):** good fit, one dimension may be a stretch
- **Notable gap (if any):** where background and preferences diverge, with a note on what bridging it would take

Ask: *"Does this feel right, or does something land wrong?"* Adjust before moving to Phase 4.

---

#### Phase 4 — Profile Draft & Approval

Draft both files. Present section by section. Write only after the user approves.

**`config/profile.yml` sections (presented in order):**

1. `candidate` block — populate from CV (name, email, phone, location, LinkedIn, GitHub)
2. `target_roles` block — populate from Phase 3 archetype recommendations
3. `narrative` block — headline, superpowers, and proof points derived from CV + discovery
4. `compensation` block — ask directly if not surfaced in discovery: *"What's your target comp range and your walk-away number?"*
5. `location` block — populate from CV + any constraints surfaced in discovery

For each section: show the draft, ask *"Does this look right?"*, accept edits or approval, move on.

**`modes/_profile.md` sections (presented after profile.yml is approved):**

1. Target roles table — archetypes from Phase 3 with fit levels
2. Adaptive framing table — how to position CV for each archetype
3. Exit narrative — drafted from the discovery answers and CV summary
4. Comp targets and negotiation scripts — populated from profile.yml comp block
5. Location policy — populated from profile.yml location block

Same section-by-section approval flow.

**Write gate:** only write files after the user has approved all sections. Write both files atomically. Confirm with: *"Profile saved. You're ready to start evaluating roles — paste a job description or URL to run the full pipeline."*

---

### Onboarding Integration (AGENTS.md)

In Step 2 (Profile setup), after asking for target roles, add:

> If the user says "I don't know", "not sure", "exploring", or otherwise signals uncertainty about target roles → respond:
> *"No problem — run `/career-ops compass` and I'll help you figure it out. It takes about 5–10 minutes and ends with your profile fully set up."*

Do not attempt to run compass inline during onboarding. Route to it as a standalone follow-up.

---

### Router Changes (`.agents/skills/career-ops/SKILL.md`)

Add to routing table:

```md
| `compass` | `compass` |
```

Add to discovery menu:

```md
/career-ops compass  → Career discovery: figure out what you want + set up your profile
```

Position it near the top of the menu, before `scan` — it's the first thing a new user without a clear direction needs.

---

## Success Criteria

- A user with no `profile.yml` and no idea what they want can run `/career-ops compass` and end up with a complete, personalized `profile.yml` and `_profile.md` that they feel good about
- A user who already has a profile can re-run compass when their direction changes, and update their profile without losing data they want to keep
- The ikigai reveal moment surfaces at least one insight the user hadn't considered — either an archetype they didn't know existed, or a gap between what their background says and what they actually want
- The adaptive question count stays between 3–10; no user should feel interrogated or bored

---

## Out of Scope

- CV rewriting or enhancement (→ `/career-ops polish`, future PR)
- Comp market research during compass (Block D in `oferta.md` covers this per-job; compass uses user-provided comp targets only)
- Multi-language compass modes (DE/FR/JA) — can follow once English version is stable

---

## Follow-on PR

**`/career-ops polish`** — given a finalized profile with target archetypes, analyze `cv.md` and produce a prioritized list of improvements to strengthen the CV for those archetypes. Operates on the baseline CV, not a job-specific tailoring (that's already handled by `modes/pdf.md`).
