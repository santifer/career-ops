<!-- KB stub. Refresh cadence: quarterly via researcher agent. Last refreshed: 2026-05-19 -->

# Operational-Dashboard Criteria

**Two-stage rubric — first verify the email is operational, then score its quality against six action-conversion criteria.**

## Why it matters for operational-dashboard emails

The analyzer scores quality, but quality criteria differ by email category. Marketing emails optimize for click-through and discovery; operational emails optimize for return-to-known-state and action-conversion. Applying marketing rubrics to operational emails inflates "engaging" findings (animated headers, surprise) and ignores the friction-points that actually matter (CTA hierarchy, empty-state grace, density-vs-overwhelm tradeoff). This file separates the two stages.

## Stage 1 — Classification (is this an ops-dashboard email?)

Answer each question Yes or No. **5-6 Yes → proceed to Stage 2. 3-4 Yes → ambiguous, flag for researcher. 0-2 Yes → not in scope, return "marketing email."**

1. **Primary CTA is a dashboard/system action**, not a product purchase, download, or external sign-up. (Yes: "Open Apply Pack." No: "Buy Pro Plan.")
2. **Email contains structured system state** — tables, counts, role IDs, status labels. (Yes: a queue with 16 ranked roles. No: a narrative paragraph.)
3. **Audience is the operator** — known user of the dashboard, not a cold prospect.
4. **Email assumes system literacy** — references "your queue" without explaining what a queue is.
5. **Tone is calm and informational** — not urgent, playful, or promotional. ("3 roles ready to apply" not "🎉 You're crushing it!")
6. **Reader's intent is to stay on top of ongoing work**, not to make a purchase decision.

## Stage 2 — Quality scoring (the six action-conversion criteria)

Once classified, score the email's quality on these six questions. Each is a binary Pass/Fail with a finding emitted on Fail. **This is the ORCHESTRATOR's referenced scoring rubric.**

1. **Does it surface today's highest-leverage action in under 3 seconds of reading?**
   - Pass: the primary CTA (e.g., "Open Apply Pack for Anthropic") is visible above the fold on a 375px phone viewport in the first scroll position.
   - Fail: the reader has to scroll past system status, runway alert, or stats tiles before seeing the action.

2. **Does it preserve information density without overwhelming?**
   - Pass: density is high but every section earns its place; the reader can scan past a section without losing the thread.
   - Fail: dense and overwhelming (everything is bold), OR sparse and condescending (lots of whitespace but little info per section).

3. **Does it gracefully handle empty states?**
   - Pass: zero-ready-to-apply or zero-outreach-due collapses to a muted heading + lighter padding; framing is "breathing room" not "you failed today."
   - Fail: empty state occupies the same visual weight as a populated one, OR uses anxiety-triggering language ("You have 0 leads today!").

4. **Does it differentiate urgent from routine?**
   - Pass: RUNWAY ALERT (urgent — runway-critical state) is visually distinct from SYSTEM STATUS (routine — feature flags). Distinct color, distinct heading weight, distinct position.
   - Fail: urgent and routine are rendered at similar weight; the reader has to read both fully to determine which deserves action.

5. **Does it minimize cognitive load while remaining truthful about scope?**
   - Pass: the email surfaces what's actionable today and archives what isn't. System health is summarized in a one-line banner, not a full block.
   - Fail: the email tries to be a complete system audit (everything that's true) instead of an action driver (what to do next). Cognitive load index >7.

6. **Does it pass the "one email or two" test?**
   - Pass: action-driver content (NEXT MOVES, TONIGHT'S APPLY, DUE TODAY) is clearly the email's primary job. System health (Tier 5 features, runway numbers, error logs) is summarized but visually subordinated.
   - Fail: action-driver and system-health content compete for top attention. The email is doing two jobs that should be two emails — or one email with two-tier visual hierarchy enforced.

## Output mapping to findings

Each Stage 2 Fail produces a finding:

| Quality Q | Finding `analyzer` | Default `severity` | Default `runway_impact` |
|---|---|---|---|
| Q1 (above-fold action) | action | critical | accelerates_action |
| Q2 (density vs. overwhelm) | cognitive-load | high | reduces_friction |
| Q3 (empty state grace) | cognitive-load + design | medium | reduces_friction |
| Q4 (urgent vs. routine) | design + action | high | accelerates_action |
| Q5 (cognitive load) | cognitive-load | high | reduces_friction |
| Q6 (one-email-or-two) | cognitive-load + action | critical (if both jobs compete equally) / high (if only minor competition) | reduces_friction |

## Common failure mode

Analyzers that skip Stage 1 apply Stage 2 quality criteria to marketing emails, producing findings that don't apply ("urgency framing is too calm" is a marketing concern, not an operational one). Analyzers that skip Stage 2 produce only classification verdicts ("this is operational") without surfacing the quality friction that matters. Both stages are required.

## Source

NN/g research on internal-tools UX; WCAG 2.2 AA standards; Fogg Behavior Model (Behavior = Motivation × Ability × Trigger). Empty-state and RSD-aware framing patterns: [citation needed — researcher refresh on operational-email taxonomies and rejection-sensitive design].
