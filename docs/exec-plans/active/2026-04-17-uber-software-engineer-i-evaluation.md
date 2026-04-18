# Uber Software Engineer I Evaluation

## Background

Batch ID `gKJrc9RSreRm7_FiW8Cc3` requested a bridge MVP evaluation for Uber's `Software Engineer I` role using the cached JD file at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-gKJrc9RSreRm7_FiW8Cc3.txt`.

## Goal

Create a real Markdown evaluation report, write one tracker-addition TSV line, skip PDF generation because `PDF_CONFIRMED: no`, and return a valid JSON summary.

## Scope

- Read-only sources: `cv.md`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, `data/scan-history.tsv`, cached JD file.
- Write outputs only to `reports/`, `batch/tracker-additions/`, and this execution plan.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or portfolio files.

## Assumptions

- The cached JD is the source of truth for this run.
- The JD file does not contain YAML frontmatter delimiters, so role metadata is treated as cached plain-text metadata rather than frontmatter.
- The "H1B Sponsor Likely" tag lowers the sponsorship risk but does not remove the need to verify sponsorship during application.
- Since the cached JD salary line is not a compensation range, compensation is scored conservatively without external search.

## Implementation Steps

1. Read cached JD and candidate materials.
   Verify: confirm company, role, requirements, candidate level, and proof points are available.
2. Evaluate role using A-G blocks.
   Verify: report includes role summary, CV match, gaps, level strategy, comp, personalization, interview plan, legitimacy, score, and keywords.
3. Write tracker addition.
   Verify: TSV has exactly 9 tab-separated columns and uses next tracker number.
4. Run targeted verification.
   Verify: files exist, tracker columns parse, and final JSON fields are populated.

## Verification Approach

- `test -s reports/245-uber-2026-04-17.md`
- `awk -F '\t' '{print NF}' batch/tracker-additions/gKJrc9RSreRm7_FiW8Cc3.tsv`
- `node -e` JSON parse check for the final response payload shape before responding.

## Progress Log

- 2026-04-17: Read cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, tracker tail, states, and scan history.
- 2026-04-17: Found no exact prior appearance of this URL or Uber role in `data/scan-history.tsv`.
- 2026-04-17: Classified the role as closest to `AI Forward Deployed Engineer + Technical AI Product Manager`, with the note that it is actually a non-AI early-career product/full-stack SWE role.
- 2026-04-17: Wrote the evaluation report and tracker addition.

## Key Decisions

- No PDF was generated because the run explicitly says `PDF_CONFIRMED: no`.
- No external web search was used because the JD cache was sufficient for role fit, and the salary line was not reliable enough to justify expanding the bridge MVP run.
- Global score is held at `3.40/5` due to non-AI alignment, Go and A/B testing gaps, and limited posting freshness signals.

## Risks and Blockers

- Exact active posting state is unverified in batch mode.
- Compensation range is not available in the cached JD.
- Sponsorship is likely but not guaranteed.

## Final Outcome

Created `reports/245-uber-2026-04-17.md` and `batch/tracker-additions/gKJrc9RSreRm7_FiW8Cc3.tsv`. PDF output was skipped by design.
