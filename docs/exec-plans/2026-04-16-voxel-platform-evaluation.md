# Voxel Platform Evaluation

**Date:** 2026-04-16
**Status:** in progress
**Owner:** Codex

## Background

The bridge worker received a cached JD for Voxel's Software Engineer - Platform role under batch ID `YrrAifMNZw31W-_-CWdon`.
The repository is the source of truth for candidate data, proof points, tracker state, and report output.

## Goal

Generate a complete A-G evaluation report for Voxel, write one tracker-addition TSV row, skip PDF generation because `PDF_CONFIRMED: no`, and return a schema-valid JSON summary.

## Scope

- Read the cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- Write `reports/133-voxel-2026-04-16.md`.
- Write `batch/tracker-additions/YrrAifMNZw31W-_-CWdon.tsv`.
- Do not edit `cv.md`, `i18n.ts`, portfolio files, or `data/applications.md`.

## Assumptions

- The cached bridge JD is sufficient for the full evaluation because it includes company, role, skill tags, requirements, responsibilities, H1B signal, and taxonomy.
- The JD has no salary or location field, so compensation scoring should use explicit local data only and mark exact comp/location as unverified.
- The role is best classified as AI Platform / LLMOps Engineer with a backend/distributed-systems emphasis.
- The candidate requires sponsorship, and the cached JD's `H1B Sponsor Likely` signal reduces but does not eliminate work-authorization risk.

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

- 2026-04-16: Read `CLAUDE.md`, the `career-ops` skill router, cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, tracker files, states, and scan history.
- 2026-04-16: Confirmed `llms.txt` is absent, `i18n.ts` is absent, and no PDF confirmation was provided.
- 2026-04-16: Found one Voxel scan-history appearance on 2026-04-17 marked `promoted`.
- 2026-04-16: Calculated next tracker number as `85` from `data/applications.md`.

## Key Decisions

- Use no WebFetch/WebSearch because the local JD is available and external research is not necessary for the minimum bridge outcome.
- Treat exact posting freshness and apply-button state as unverified in batch mode.
- Use `Evaluada` in the tracker addition because the worker prompt's valid-state list explicitly allows it.

## Risks and Blockers

- Exact salary, location, and live apply state are unavailable from the cached JD.
- The cached description excerpt is thin, so legitimacy relies on structured JD fields plus internal scan-history evidence.
- Voxel's H1B signal is favorable but not a binding sponsorship commitment.

## Final Outcome

Pending.
