# Amazon SDE 2026 Evaluation

**Date:** 2026-04-16
**Status:** in progress
**Owner:** Codex

## Background

The bridge worker received a short cached JD file for Amazon job `3177934`, `Software Development Engineer - 2026 (US)`, under batch ID `Ty78hu9pYcg6_N-Eu9CSH`.
The repository is the source of truth for candidate data, proof points, tracker state, and generated reports.

## Goal

Generate a complete A-G evaluation report for the Amazon SDE 2026 role, write one tracker-addition TSV row, skip PDF generation because `PDF_CONFIRMED: no`, and return a schema-valid JSON summary.

## Scope

- Read the bridge JD file, `cv.md`, `article-digest.md`, `config/profile.yml`, `modes/_profile.md`, `data/applications.md`, `data/scan-history.tsv`, and `templates/states.yml`.
- Use the official Amazon page only because the cached JD contained no full body text.
- Write `reports/176-amazon-2026-04-16.md`.
- Write `batch/tracker-additions/Ty78hu9pYcg6_N-Eu9CSH.tsv`.
- Do not edit `cv.md`, `i18n.ts`, portfolio files, or `data/applications.md`.

## Assumptions

- The official Amazon page is the complete JD source because the local bridge cache only contained URL/title metadata and explicitly said no captured page text was available.
- The role is an early-career SDE-I/new-grad style position, not a senior role.
- The candidate requires sponsorship/work authorization support. The official JD does not explicitly confirm sponsorship, so this remains a possible blocker to verify.
- No active security clearance requirement appears in the JD.
- Because the role is a broad SDE pipeline with specialty preference capture, exact team placement is unknown.

## Uncertainties

- Role-specific sponsorship policy is not visible in the official JD.
- Exact final location is preference-based and not guaranteed.
- Team placement could land in ML, distributed systems, databases, mobile, embedded, or another SDE area, which changes fit quality.
- Posting freshness and apply-button state are not verified with Playwright in batch mode.

## Simplest Viable Path

Use the official Amazon JD plus repository evidence, evaluate the role as a strong early-career general SWE target with AI/platform optionality, write the required report and TSV row, and verify both files mechanically.

## Implementation Steps

1. Read local sources and complete the JD from the official Amazon page.
   Verify: JD source contains title, job ID, responsibilities, qualifications, locations, and salary range.
2. Evaluate Blocks A-G and global score.
   Verify: each major requirement maps to exact CV or article evidence, with gaps and blockers separated.
3. Write the report and tracker-addition row.
   Verify: files exist at the expected paths.
4. Validate output shape and generated artifacts.
   Verify: report header exists, tracker row has 9 TSV columns, and no PDF path is created.

## Verification Approach

- Run `sed` on the generated report header and key sections.
- Run `awk -F '\t'` on the tracker addition to confirm 9 columns.
- Run a file existence check for the report and tracker.

## Progress Log

- 2026-04-16: Read `CLAUDE.md`, `docs/CODEX.md`, the `career-ops` skill router, `_shared.md`, and `modes/auto-pipeline.md`.
- 2026-04-16: Ran `node update-system.mjs check`; result was offline with local version `1.3.0`.
- 2026-04-16: Ran `node cv-sync-check.mjs`; all checks passed.
- 2026-04-16: Read `config/profile.yml`, `modes/_profile.md`, `cv.md`, and `article-digest.md`; `llms.txt` was absent.
- 2026-04-16: Read the bridge JD file; it contained URL/title metadata and no full JD body.
- 2026-04-16: Completed the JD from the official Amazon page and search results for job `3177934`.
- 2026-04-16: Found one matching scan-history row for `Software Development Engineer - 2026 (US)` on 2026-04-16 marked `promoted`.
- 2026-04-16: Calculated next tracker number as `115` from `data/applications.md`.

## Key Decisions

- Classify the role as `AI Platform / LLMOps Engineer` only as the closest required taxonomy label; the actual role is broad early-career software engineering with distributed systems, cloud-native, and optional ML/AI placement signals.
- Score below 4.5, so omit draft application answers and do not generate a tailored PDF.
- Use `Evaluada` in the tracker addition because the worker prompt lists it as canonical and `templates/states.yml` accepts `evaluada` as an alias.

## Risks and Blockers

- Sponsorship/work authorization support is not stated in the official JD.
- Team placement is broad and not guaranteed, so the AI/platform fit could be strong or weak depending on assignment.
- Amazon's high-volume new-grad process may create long response times and limited placement control.
- Seattle base salary low end is below the candidate's stated $120K minimum, although total compensation and higher locations may still clear the target.

## Final Outcome

Pending.
