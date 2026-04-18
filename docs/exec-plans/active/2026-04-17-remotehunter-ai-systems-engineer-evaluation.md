# RemoteHunter AI Systems Engineer Evaluation

## Background

Batch bridge run `TcJCEkfVd8y-OVnjT6d8m` requested a complete A-G evaluation for report `250` using the local JD cache as the primary source. PDF generation was explicitly disabled with `PDF_CONFIRMED: no`.

## Goal

Create a real markdown evaluation report and tracker-addition TSV for the RemoteHunter AI Systems Engineer role without modifying `cv.md`, `i18n.ts`, or `data/applications.md`.

## Scope

- Read local source-of-truth files: `cv.md`, `article-digest.md`, `llms.txt` if present, `config/profile.yml`, `data/scan-history.tsv`, `data/applications.md`, and the local JD cache.
- Write `reports/250-remotehunter-2026-04-17.md`.
- Write `batch/tracker-additions/TcJCEkfVd8y-OVnjT6d8m.tsv`.
- Do not generate a PDF.

## Assumptions

- The JD cache is sufficient for evaluation despite being short.
- The `Salary: Turbo for Students: Get Hired Faster!` field is not valid compensation data.
- Since no frontmatter YAML delimiters exist in the JD cache, `used_frontmatter` is false even though the file contains structured plain-text fields.
- Candidate visa status in `config/profile.yml` means unknown sponsorship is a material risk.

## Implementation Steps

1. Read local JD cache and candidate materials.
   Verify: JD company, role, requirements, and responsibilities are available from local files.
2. Evaluate A-G against the CV and article proof points.
   Verify: report maps JD requirements to exact `cv.md` line references and known proof points.
3. Write report and tracker addition.
   Verify: report exists, tracker TSV has exactly 9 tab-separated columns, and no PDF is generated.

## Verification Approach

- Check report file exists and is non-empty.
- Check tracker-addition file exists and has one TSV line with 9 fields.
- Confirm `output/` has no new PDF for this run.

## Progress Log

- 2026-04-17: Read `CLAUDE.md`, career-ops router, local JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- 2026-04-17: Found prior RemoteHunter scan appearances, including this AI Systems Engineer title on 2026-04-16.
- 2026-04-17: Calculated next tracker number as `175`.
- 2026-04-17: Completed report and tracker addition; PDF intentionally skipped.

## Key Decisions

- Archetype: `Agentic Workflows / Automation`, with `AI Forward Deployed Engineer` as secondary, because the JD centers on internal AI workflows, APIs, Slack integration, automation, and leadership-facing delivery.
- Score: `3.85/5`; strong technical match but capped by unknown sponsorship, invalid salary data, short JD, and unverified posting freshness.
- Legitimacy: `Proceed with Caution`; the JD is coherent but sparse, compensation is not transparent, and batch mode cannot verify live page state.

## Risks and Blockers

- Sponsorship is not confirmed and may be a hard blocker for the candidate.
- Salary is unavailable, so compensation score is conservative.
- The posting is surfaced through RemoteHunter/Jobright-style aggregator data and may not represent a direct employer listing.

## Final Outcome

Required artifacts were generated:

- `reports/250-remotehunter-2026-04-17.md`
- `batch/tracker-additions/TcJCEkfVd8y-OVnjT6d8m.tsv`

No PDF was generated because the run explicitly disabled it.
