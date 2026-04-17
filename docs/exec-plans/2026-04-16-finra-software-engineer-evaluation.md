# FINRA Software Engineer Evaluation

**Date:** 2026-04-16
**Status:** in progress
**Owner:** Codex

## Background

The bridge worker received a cached JD for FINRA's `Software Engineer` role under batch ID `djOJ0hbIGBtmG3XKlhAPZ`.
The repository is the source of truth for candidate data, proof points, tracker state, and report output.

## Goal

Generate a complete A-G evaluation report for FINRA, write one tracker-addition TSV row, skip PDF generation because `PDF_CONFIRMED: no`, and return a schema-valid JSON summary.

## Scope

- Read the cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, `modes/_profile.md`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- Write `reports/142-finra-2026-04-16.md`.
- Write `batch/tracker-additions/djOJ0hbIGBtmG3XKlhAPZ.tsv`.
- Do not edit `cv.md`, `i18n.ts`, portfolio files, or `data/applications.md`.

## Assumptions

- The cached bridge JD is sufficient for the bridge MVP because it includes company, role, skill tags, requirements, responsibilities, H1B signal, taxonomy, applicant count, and source URL.
- The JD has no salary field and only a Rockville, Maryland signal in the Workday URL, so compensation and exact modality must be marked unverified.
- The role is a general early-career software engineering role, not an AI role. Among the worker's six required archetypes, the closest fit is `AI Platform / LLMOps Engineer` only because the role buys software fundamentals, delivery discipline, CI/CD, and systems thinking.
- The candidate requires sponsorship. The cached `H1B Sponsor Likely` signal reduces but does not eliminate work-authorization risk.

## Implementation Steps

1. Read local sources and extract candidate/JD evidence.
   Verify: local files are readable and JD source is `cache`.
2. Evaluate Blocks A-G and global score from the cached JD plus repository proof points.
   Verify: each major requirement maps to CV or article evidence, with gaps identified.
3. Write the report and tracker-addition row.
   Verify: files exist at the expected paths.
4. Validate output shape.
   Verify: report header exists, tracker row has 9 TSV columns, and final JSON uses the required schema.

## Verification Approach

- Inspect generated report header and key sections with `sed`.
- Count TSV columns with `awk -F '\t'`.
- Confirm no PDF was generated for this run.

## Progress Log

- 2026-04-16: Read `CLAUDE.md`, the `career-ops` skill router, `_shared.md`, `auto-pipeline.md`, cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, `modes/_profile.md`, tracker files, states, and scan history.
- 2026-04-16: Confirmed `llms.txt` is absent, `i18n.ts` is absent, `cv-sync-check.mjs` passes, and no PDF confirmation was provided.
- 2026-04-16: Found one FINRA scan-history appearance on 2026-04-17 marked `promoted`.
- 2026-04-16: Calculated next tracker number as `91` from `data/applications.md`.

## Key Decisions

- Use no WebFetch/WebSearch because the local JD is available and external research is not necessary for the minimum bridge outcome.
- Treat exact posting freshness and apply-button state as unverified in batch mode.
- Use `Evaluada` in the tracker addition because the worker prompt's valid-state list explicitly allows it.
- Omit Block H because the global score is below 4.5.

## Risks and Blockers

- Exact salary, remote policy, live apply state, and full Workday body are unavailable from the cached JD.
- The cached description excerpt is thin, so detailed role scope relies on structured JD fields rather than a long-form description.
- `H1B Sponsor Likely` is favorable but not a binding sponsorship commitment.

## Final Outcome

Pending.
