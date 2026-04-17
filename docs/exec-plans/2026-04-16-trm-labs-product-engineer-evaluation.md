# TRM Labs Product Engineer Evaluation

## Background

Batch worker run for report 129. The JD source is the local bridge cache at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-UXdo3MugsNVILLC3uK8p9.txt`; no PDF was requested.

## Goal

Create a durable job evaluation report and tracker addition for TRM Labs, University Grad - Product Engineer (2026) - SF Only.

## Scope

- Read local sources of truth: `cv.md`, `article-digest.md`, `config/profile.yml`, `modes/_profile.md`, and `data/scan-history.tsv`.
- Write `reports/129-trm-labs-2026-04-16.md`.
- Write `batch/tracker-additions/UXdo3MugsNVILLC3uK8p9.tsv`.
- Do not edit `cv.md`, `i18n.ts`, or `data/applications.md`.
- Do not generate a PDF because `PDF_CONFIRMED: no`.

## Assumptions

- The cached JD is sufficient for evaluation despite the short description excerpt because it includes role title, company, skill tags, recommendation tags, requirements, and responsibilities.
- The role family is best evaluated as an early-career full-stack/product engineering role, with the closest mandated AI archetype marked as weak-adjacent.
- Sponsorship is not a hard blocker in this run because the cache includes "H1B Sponsor Likely", but it remains unverified.

## Implementation Steps

1. Read repo instructions and source files.
   Verify: `cv-sync-check.mjs` passed and source files were inspected.
2. Evaluate the JD against the candidate profile.
   Verify: report includes A-G sections, score, legitimacy, and keywords.
3. Add tracker line.
   Verify: TSV has nine tab-separated columns and does not touch `data/applications.md`.
4. Confirm no PDF output.
   Verify: report header says PDF not generated and final result keeps `pdf` null.

## Verification Approach

- Validate report and tracker files exist.
- Confirm the tracker TSV has exactly nine tab-separated columns.
- Confirm no PDF was generated for this run.

## Progress Log

- 2026-04-16: Read career-ops instructions, profile, CV, article digest, JD cache, scan history, applications tracker, and state definitions.
- 2026-04-16: Ran `node update-system.mjs check`; result was offline with local version 1.3.0.
- 2026-04-16: Ran `node cv-sync-check.mjs`; all checks passed.
- 2026-04-16: Prepared report and tracker addition.

## Key Decisions

- Used the cached JD only; no WebFetch or WebSearch was needed.
- Classified the role as `AI Forward Deployed Engineer + AI Solutions Architect (weak adjacent)` because the required six-archetype taxonomy does not include plain full-stack/product engineering.
- Scored the role below auto-application-answer threshold because it is a strong new-grad engineering fit but weak on explicit AI north-star alignment and lacks official salary/sponsorship details.

## Risks and Blockers

- Salary field in the cache is not a salary range.
- Official sponsorship language is not present in the JD cache, only a "H1B Sponsor Likely" recommendation tag.
- Posting freshness and apply button state are unverified in batch mode.

## Final Outcome

Pending until report, tracker addition, and verification commands are complete.
