# Twitch Commerce Engineering Evaluation

## Background

Batch ID `BwHcNWi-WRh__c5jQ2rx8` asks for a complete A-G evaluation of Twitch's `Software Engineer I, Commerce Engineering` role, a tracker-addition TSV line, and no PDF unless explicitly confirmed.

## Goal

Produce a durable report at `reports/149-twitch-2026-04-16.md` and a tracker addition at `batch/tracker-additions/BwHcNWi-WRh__c5jQ2rx8.tsv`.

## Scope

- Read the local JD cache, `cv.md`, `article-digest.md`, `config/profile.yml`, and tracker data.
- Use external indexed job pages only to fill gaps in the short local JD.
- Do not modify `cv.md`, `article-digest.md`, `i18n.ts`, or `data/applications.md`.
- Do not generate a PDF because `PDF_CONFIRMED: no`.

## Assumptions

- The report date and report number come from the batch prompt: `2026-04-16` and `149`.
- The local JD cache is primary, but it is short enough to justify a minimal web lookup for salary, location, and full role context.
- The candidate requires sponsorship/work authorization support, per `config/profile.yml`.

## Implementation Steps

1. Read source documents and JD cache.
   Verify: source files and JD content are available.
2. Complete A-G evaluation and score.
   Verify: report includes all required sections and no Block H unless score is at least 4.5.
3. Write tracker-addition TSV.
   Verify: one tab-separated line with nine fields and canonical status.
4. Run targeted checks.
   Verify: files exist, TSV has nine fields, report header contains required metadata.

## Verification Approach

- `node cv-sync-check.mjs`
- Shell checks for report existence, tracker existence, and TSV field count.
- Manual review of score, hard blockers, and PDF skip behavior.

## Progress Log

- 2026-04-16: Read repository instructions, career-ops mode guidance, profile, CV, article digest, local JD cache, application tracker, scan history, and states.
- 2026-04-16: Ran `node cv-sync-check.mjs`; all checks passed.
- 2026-04-16: Used minimal external indexed pages to fill missing salary/location/context because the local JD cache had only a short excerpt.

## Key Decisions

- No PDF will be generated because the batch prompt explicitly says `PDF_CONFIRMED: no`.
- The closest archetype is `Founding / Startup Full-Stack Engineer + Software Engineer, Backend / Distributed Systems`, mapped to the prompt taxonomy as `AI Forward Deployed Engineer + AI Solutions Architect` only by closest available labels; the role itself is a non-AI consumer commerce SWE I role.
- Sponsorship is a process risk, not a confirmed hard blocker, because local and indexed signals say `H1B Sponsor Likely` but do not guarantee this role.

## Risks and Blockers

- Official Greenhouse page could not be directly fetched in this environment; indexed copies were used for salary/location/full JD confirmation.
- Batch mode cannot verify current apply-button state.

## Final Outcome

Pending.
