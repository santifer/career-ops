# Mode: compass — Career Discovery

Help users who don't know their target roles figure out what they want.
Combines silent CV analysis, adaptive discovery questions, an ikigai-style
reveal, and interactive profile drafting.

This mode is standalone (`/career-ops compass`) and reachable from onboarding
when the user signals uncertainty about target roles.

---

## Phase 0 — Profile Check

Read `config/profile.yml` and `modes/_profile.md`.

**Placeholder detection:** a profile is considered unconfigured if
`candidate.full_name` is `"Jane Smith"` OR `candidate.email` contains
`"example.com"` OR either file does not exist.

- If unconfigured → proceed to Phase 1 directly, no prompt needed.
- If real data exists → ask:
  > "I see you already have a profile set up. Do you want to revisit your
  > direction, or start fresh?"
  - "Revisit" → run full compass, frame questions around what has changed
  - "Start fresh" → discard the existing profile data from your working
    context and run full compass as if no profile exists; do not surface
    existing profile content during Phase 2 or Phase 3
  - Either path ends at Phase 4 with a new draft

---

## Phase 1 — Silent CV Analysis

Read `cv.md` if it exists. **Do not show this analysis to the user yet.**

If `cv.md` does not exist, skip the analysis and proceed to Phase 2.
Archetype detection will be discovery-only; the ikigai reveal in Phase 3
will present discovery findings only, without a CV-derived baseline.

Internally derive and store:

- **Domains** — what fields/industries the candidate has worked in
- **Functions** — what they have actually done: build, consult, manage,
  train, sell, deploy, support (can be multiple)
- **Seniority signals** — years of experience, titles held, scope of
  responsibility described in role bullets
- **Candidate archetypes** — 2–3 best-fit archetypes from the table in
  `modes/_shared.md`, each with a one-sentence rationale note

Store all of this. It surfaces only in Phase 3.

---

## Phase 2 — Adaptive Discovery Questions

Ask questions one at a time, conversationally. Never present a numbered
list or a form. Maintain the tone of a thoughtful career coach, not a
survey.

### Core questions (always asked, in this order)

1. *"What kind of work energizes you most — building things, helping people
   solve problems, leading strategy, something else entirely?"*

2. *"What would you want more of in your next role that you don't have
   enough of now?"*

3. *"What would be a hard no — work that would drain you, or conditions
   you'd walk away from?"*

### Adaptive follow-ups

After each answer, assess whether more depth is needed. Use this table:

| Signal in the answer | Follow-up to ask |
|----------------------|-----------------|
| Vague, "I don't know", or very short | *"Tell me about a time at work when you felt most in your element. What were you doing?"* |
| Mentions a transition, crossroads, or feeling stuck | *"What's changed recently that's making you rethink your direction?"* |
| Two competing directions mentioned | *"If you had to pick one to optimize for over the next two years — [A] or [B] — which would it be?"* |
| No mention of environment or company type | *"What kind of company fits you best — early-stage startup, growth-stage, enterprise, or something else?"* |
| No signal on IC vs. leadership | *"Do you want to go deeper as an individual contributor, or are you drawn to building and leading a team?"* |
| No signal on remote/location | *"Any constraints on location or travel?"* |

### Stopping rule

- **Minimum:** 3 questions (the core set)
- **Maximum:** 10 questions total
- **Stop early** when archetypes have converged and deal-breakers are clear
- **If still uncertain after 7 questions:** surface a summary instead of
  asking more:
  > *"Here's what I'm hearing so far: [2–3 sentence synthesis]. Does that
  > resonate, or does something feel off?"*
  Use their reaction to finalize the picture.

---

## Phase 3 — Ikigai Reveal

Present the three-part reveal. This is the moment where the two threads
— what the CV shows and what the user said — come together.

### Part 1: What your background says

If `cv.md` was present in Phase 1:

> *"Before you told me anything, here's where your CV alone would have
> pointed me..."*

List the 2–3 CV-derived archetype candidates from Phase 1. For each,
give the one-sentence rationale stored in Phase 1.

Example:
> *"9 years of client-facing pre-sales work at enterprise software
> companies is a strong signal for Solutions Architect or Forward
> Deployed Engineer."*

If `cv.md` was absent in Phase 1, skip Part 1 entirely and proceed
directly to Part 2. The reveal will present discovery findings only.

### Part 2: What you told me

> *"Here's what I heard from your answers..."*

Write a 3–5 sentence synthesis: what energizes them, what they want
more of, their deal-breakers, and any strong directional signals.

### Part 3: Where they overlap — and where they don't

If `cv.md` was present in Phase 1:

> *"Here's where your background and your answers point to the same
> place. That's your strongest signal."*

- **Overlap** — archetype(s) that appear in both the CV analysis and
  the discovery answers: lead with these as primary recommendations
- **Gap (if any)** — where background and stated preferences diverge:
  name it explicitly and invite a reaction before moving on
  > *"Your CV points strongly toward [X], but you said [Y]. That's
  > worth pausing on — is [X] something you'd want to lean into, or
  > are you actively moving away from it?"*

If `cv.md` was absent in Phase 1, skip the overlap/gap framing and
present discovery-derived archetype(s) directly:

> *"Based on what you've told me, here are the directions that fit
> you best..."*

End with clear recommendations in either case:

| Fit | Archetype(s) | Why |
|-----|-------------|-----|
| Primary | ... | Both CV and stated preference point here |
| Secondary | ... | Strong from one signal, partial from the other |

Ask: *"Does this feel right, or does something land wrong?"*

Adjust based on the response before proceeding to Phase 4. Do not
move forward until the user confirms the recommendations feel accurate.

---

## Phase 4 — Profile Draft & Approval

Draft both `config/profile.yml` and `modes/_profile.md`. Present each
section, get approval, then move to the next. Write files only after
all sections are approved.

### profile.yml — section by section

Present each block as a formatted preview. Ask *"Does this look right?"*
after each one. If the user requests edits, apply them and re-present
the updated block for confirmation before moving on.

**Block 1: candidate**
If `cv.md` exists, populate from it (name, email, phone, location, LinkedIn, GitHub).
If `cv.md` is absent, show the block with empty string placeholders and ask
the user to fill in any blank fields before approving:
```yaml
candidate:
  full_name: ""
  email: ""
  phone: ""
  location: ""
  linkedin: ""
  github: ""
```
Show as a YAML preview.

**Block 2: target_roles**
Populate from Phase 3 archetype recommendations.
- `primary`: archetype names with fit = primary
- `archetypes`: full list with fit levels from Phase 3 table

**Block 3: narrative**
- `headline`: one-line professional identity, drafted from CV summary
  and Phase 2 discovery
- `superpowers`: 3–5 bullets derived from the functions identified in
  Phase 1 and the "energizes you" answers from Phase 2
- `proof_points`: notable projects or achievements from `cv.md`, each
  with a `hero_metric` if one can be derived

**Block 4: compensation**
If a comp range surfaced during Phase 2 discovery, use it.
If not, ask directly:
> *"What's your target comp range and your walk-away number?"*

**Block 5: location**
Populate from `cv.md` location and any constraints surfaced in Phase 2.

### _profile.md — section by section

Present each section after `profile.yml` is fully approved.

**Section 1: Target roles table**
Archetypes from Phase 3, same fit levels. Follow the table format from
`modes/_profile.template.md`.

**Section 2: Adaptive framing table**
For each archetype, a brief note on which parts of the candidate's
background to emphasize. Derived from Phase 1 functions and Phase 2
answers.

**Section 3: Exit narrative**
A 2–3 sentence professional narrative bridging past experience to
target direction. Draws from CV summary + Phase 2 discovery.

**Section 4: Comp targets and negotiation scripts**
Populated from the compensation block approved in profile.yml.
Use the "Your Negotiation Scripts" section of `modes/_profile.template.md`
as the script structure, replacing bracketed placeholders with real numbers
from the approved compensation block.

**Section 5: Location policy**
Populated from profile.yml location block and any remote/travel
preferences from Phase 2.

### Write gate

Write files only after the user has either approved or explicitly skipped
each section of both files. Approval and skip are distinct:
- **Approved** — user confirmed the drafted content is correct
- **Skipped** — user said to leave it blank or move on; the corresponding
  section in the written file will remain as the template placeholder

Write both files in sequence: `config/profile.yml` first, then
`modes/_profile.md`.

Confirm:
> *"Profile saved. You're ready to start evaluating roles — paste a
> job description or URL to run the full pipeline."*
