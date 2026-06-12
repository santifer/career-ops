# Mode: patterns -- Rejection Pattern Detector

## Purpose

Analyze all tracked applications to find patterns in outcomes and surface actionable insights. Identifies what's working (archetypes, remote policies, score ranges) and what's wasting time (geo-restricted roles, stack mismatches, low-score applications).

When interview transcripts are available, it also reads *what the candidate actually says in the room* — a higher-resolution, lower-noise signal of role-fit than win/loss — to detect role **misfit**: when the candidate's strongest, most fluent answers point at a different role-type than the one they keep applying to (Step 1b).

## Inputs

- `data/applications.md` — Application tracker
- `reports/` — Individual evaluation reports
- `config/profile.yml` — User profile (for recommendation context)
- `modes/_profile.md` — User archetypes and framing
- `portals.yml` — Portal config (for filter update recommendations)
- `interview-prep/transcripts/*.md` — Interview transcripts (optional; drives Step 1b). Drop real-interview recordings/transcripts here.
- `interview-prep/sessions/*` — Mock-interview sessions (optional; also consumed by Step 1b if present)

## Minimum Threshold

Before running analysis, check: does `data/applications.md` have at least 5 entries with status beyond "Evaluated" (i.e., Applied, Responded, Interview, Offer, Rejected, Discarded, SKIP)?

If not, tell the user:
> "Not enough data yet -- {N}/5 applications have progressed beyond evaluation. Keep applying and come back when you have more outcomes to analyze."

Exit gracefully.

## Step 1 — Run Analysis Script

Execute:

```bash
node analyze-patterns.mjs
```

Parse the JSON output. It contains:

| Key | Contents |
|-----|----------|
| `metadata` | Total entries, date range, analysis date, counts by outcome |
| `funnel` | Count per status stage (evaluated, applied, interview, offer, etc.) |
| `scoreComparison` | Avg/min/max score per outcome group (positive, negative, self_filtered, pending) |
| `archetypeBreakdown` | Per-archetype: total, positive, negative, self_filtered, conversion rate |
| `blockerAnalysis` | Most frequent hard blockers: geo-restriction, stack-mismatch, seniority, onsite |
| `remotePolicy` | Per-policy bucket: total, positive, negative, conversion rate |
| `companySizeBreakdown` | Per-size bucket: startup, scaleup, enterprise |
| `scoreThreshold` | Recommended minimum score + reasoning |
| `techStackGaps` | Most frequent tech gaps in negative outcomes |
| `recommendations` | Top 5 actionable items with reasoning and impact level |

If the script returns `error`, display the error message and exit.

## Step 1b — Transcript-Content Targeting Signal (optional)

Outcome data (Step 1) tells you *whether* you're winning. Interview transcripts tell you *what role you're actually selling* in the room — a higher-resolution, lower-noise signal of role-fit than win/loss, which is confounded by comp, timing, headcount, and a dozen reasons unrelated to fit.

**Run this step only if transcript data exists.** Check, in order:
- `interview-prep/transcripts/*.md` — this mode's canonical input
- `interview-prep/sessions/*` — mock-interview sessions, if present

If neither directory contains a transcript, **skip this step silently** and proceed with outcome-only analysis. This step is purely additive — the mode works fully without it, and gains resolution once transcripts accumulate.

If transcripts exist, for each one:
1. Separate the candidate's answers from the interviewer's questions. If speaker labels are missing, infer them.
2. Determine the competency / role-signal each substantive answer demonstrates (e.g. *instructional-design*, *systems-architecture*, *data-analysis*, *stakeholder-management*, *people-leadership*). **Tags first, inference as fallback:** if the answer already carries an explicit competency tag — `<!-- competency: ... -->` per the convention in `interview-prep/transcripts/README.md`, whether written by hand or emitted by a debrief tool (e.g. `interview/debrief`, #686) — use it directly. Only infer the competency yourself when no tag is present.
3. Mark whether the answer is **fluent and specific** (concrete metrics, named tools, real decisions) or **flat and generic** (hedged, vague, textbook).

Then aggregate across all transcripts:
- **Where do the fluent/specific answers cluster?** That competency cluster is the role-type the candidate is *actually* strongest at — regardless of the title on their résumé.
- Compare that cluster against (a) the archetypes in `modes/_profile.md` and (b) the distribution of roles actually applied to in `data/applications.md`.
- **Surface the misfit:** if the strongest cluster (X) is under-represented in the roles applied to (Y), that is a targeting-correction signal:
  > "Your answers consistently light up around **X**, but you're mostly applying to **Y**. Consider adding archetype X and reweighting `portals.yml` `title_filter.positive` toward it."

This is the difference between *"you're losing"* (Step 1, outcomes) and *"you're aiming at the wrong target"* (Step 1b, content). Feed the result into the Step 2 report and Step 4 recommendations.

**Privacy:** transcripts contain real interviewer names and companies. Read them locally only; **never quote a real name or company into a committed report.** Summarize the signal (competency clusters), never the content.

## Step 2 — Generate Report

Write the report to `reports/pattern-analysis-{YYYY-MM-DD}.md`.

### Report Structure

```markdown
# Pattern Analysis -- {YYYY-MM-DD}

**Applications analyzed:** {total}
**Date range:** {from} to {to}
**Outcomes:** {positive} positive, {negative} negative, {self_filtered} self-filtered, {pending} pending

---

## Conversion Funnel

Show each status with count and percentage of total. Use a simple table:

| Stage | Count | % |
|-------|-------|---|
| Evaluated | X | X% |
| Applied | X | X% |
| ... | | |

## Score vs Outcome

| Outcome | Avg Score | Min | Max | Count |
|---------|-----------|-----|-----|-------|
| Positive | X.X/5 | X.X | X.X | X |
| Negative | ... | | | |
| Self-filtered | ... | | | |
| Pending | ... | | | |

## Archetype Performance

Table with each archetype, total applications, positive outcomes, conversion rate.
Highlight the best-performing archetype and the worst.

## Top Blockers

Frequency table of recurring hard blockers (geo-restriction, stack-mismatch, etc.).
Note the percentage of all applications affected by each.

## Remote Policy Patterns

Table showing conversion rate by remote policy bucket (global, regional, geo-restricted, hybrid/onsite).

## Tech Stack Gaps

List of most common missing skills in negative/self-filtered outcomes with frequency.

## Recommended Score Threshold

State the data-driven minimum score and reasoning.

## Targeting Signal (interview transcripts)

*Include this section only if Step 1b ran.* Summarize, in competency terms only (no real names/companies):
- Which competency cluster the candidate's answers are strongest at (X)
- Which role-types they're actually applying to (Y)
- The misfit gap and the suggested realignment (add archetype X / reweight `portals.yml`)

## Recommendations

Number the top recommendations (from the script output). For each:
1. **[IMPACT]** Action to take
   Reasoning behind the recommendation.
```

## Step 3 — Present Summary

Show the user a condensed version with:
1. One-line stat summary (X applications, Y% applied, Z% positive outcome)
2. Top 3 findings (most impactful patterns)
3. Link to full report

Example:
> **Pattern Analysis Complete** (24 applications, Apr 7-8)
>
> Key findings:
> - Geo-restricted roles are 0% conversion (7 of 24) -- stop evaluating US/Canada-only postings
> - Regional/global remote roles convert at 57-67% -- these are your sweet spot
> - No positive outcomes below 4.2/5 -- consider this your score floor
>
> Full report: `reports/pattern-analysis-2026-04-08.md`

## Step 4 — Offer to Apply Recommendations

Ask the user if they want to act on any recommendations:

> "Want me to apply any of these recommendations? I can:
> - Update `portals.yml` to filter out geo-restricted roles
> - Set a score threshold in `_profile.md` for PDF generation
> - Adjust archetype targeting based on what's converting
> - Realign targeting from the transcript signal — add the under-targeted archetype X to `modes/_profile.md` and reweight `portals.yml` `title_filter.positive` (if Step 1b ran)
>
> Just say which ones, or 'all' to apply everything."

If the user agrees:
- For portal filter changes: edit `portals.yml`
- For profile/archetype changes: edit `modes/_profile.md` (NEVER `_shared.md`)
- For score threshold: add to `config/profile.yml` under a `patterns` key

## Outcome Classification

For reference, outcomes are classified as:

| Status | Outcome |
|--------|---------|
| Interview, Offer, Responded, Applied | **Positive** (invested effort or got traction) |
| Rejected, Discarded | **Negative** (company said no or offer closed) |
| SKIP, NO APLICAR | **Self-filtered** (user decided not to apply) |
| Evaluated | **Pending** (no action taken yet) |
