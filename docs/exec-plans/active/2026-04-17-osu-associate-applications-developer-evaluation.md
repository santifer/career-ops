# OSU Associate Applications Developer Evaluation

## Background

Bridge batch run for report 248, batch ID `2REATfM3UgFrfDUKcmuA_`, using the cached JD file at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-2REATfM3UgFrfDUKcmuA_.txt`.

## Goal

Produce a repository-backed evaluation report and one tracker-addition TSV line for The Ohio State University Associate Applications Developer role.

## Scope

- Read local truth sources: `cv.md`, `article-digest.md`, `llms.txt` if present, `config/profile.yml`, `data/applications.md`, and `data/scan-history.tsv`.
- Write `reports/248-the-ohio-state-university-2026-04-17.md`.
- Write `batch/tracker-additions/2REATfM3UgFrfDUKcmuA_.tsv`.
- Do not generate a PDF because `PDF_CONFIRMED: no`.
- Do not edit `cv.md`, `i18n.ts`, or `data/applications.md`.

## Assumptions

- The cached JD is the primary source of the role details.
- The scraped `Salary: Turbo for Students: Get Hired Faster!` value is not a real salary.
- Candidate requires sponsorship/work authorization support, per `config/profile.yml`.
- The Workday URL and cached JD are enough to evaluate role fit; external research is limited to compensation context because the JD lacks usable salary data.

## Implementation Steps

1. Read repository sources and cached JD.
   Verify: required files are readable and JD has company, title, requirements, responsibilities, and tags.
2. Score A-G evaluation and identify archetype.
   Verify: every major JD requirement maps to CV or article-digest evidence, with gaps called out.
3. Write report markdown.
   Verify: report path exists and includes required sections and header metadata.
4. Write tracker addition.
   Verify: TSV has exactly 9 columns and uses next tracker number from `data/applications.md`.

## Verification Approach

- Validate report exists and contains the expected company, role, score, legitimacy, batch ID, and keywords.
- Validate tracker line has 9 tab-separated columns.
- Confirm no PDF was generated.

## Progress Log

- 2026-04-17: Read cached JD, repo instructions, CV, profile, article digest, scan history, and tracker.
- 2026-04-17: Found no prior matching scan-history entry for this exact OSU Workday posting.
- 2026-04-17: Ran one minimal web search for compensation context because the JD salary field is a scrape artifact.

## Key Decisions

- Archetype: `AI Platform / LLMOps Engineer + AI Forward Deployed Engineer` because the role is research software delivery with applied AI/ML, data pipeline, Linux, and multi-environment deployment signals.
- Compensation score is low because available OSU application developer salary signals sit materially below the candidate's configured minimum target.
- Legitimacy is High Confidence as a real institutional Workday role, with posting freshness still unverified in batch mode.

## Risks and Blockers

- Exact live posting status and apply-button state are unverified in batch mode.
- Sponsorship is marked likely in the cached JD, but this needs confirmation before investing heavy application effort.
- Compensation could be below the candidate's walk-away number.

## Final Outcome

Pending report and tracker writes.
