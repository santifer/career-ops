# Qualcomm Embedded Software Evaluation

## Background

Batch worker run `hxBcJvVhh_LLrTB4s98-w` evaluates Qualcomm posting `446717134102` for Hongxi Chen. The local JD cache is the primary source, but it only contains the official URL and title.

## Goal

Create a real report under `reports/` and a tracker-addition TSV line without generating a PDF.

## Scope

- Evaluate the role against `cv.md`, `article-digest.md`, `config/profile.yml`, `data/scan-history.tsv`, and available JD fallback context.
- Write `reports/196-qualcomm-2026-04-16.md`.
- Write `batch/tracker-additions/hxBcJvVhh_LLrTB4s98-w.tsv`.
- Do not edit `cv.md`, `i18n.ts`, or `data/applications.md`.

## Assumptions

- The role is Qualcomm `Embedded Software Engineer` from the cached official URL.
- Because the cached JD has no body or frontmatter, details beyond title/URL are treated as fallback context, not as fully verified official JD text.
- PDF is skipped because `PDF_CONFIRMED: no`.
- `llms.txt` and `i18n.ts` are absent in this repo.

## Implementation Steps

1. Read local truth sources and JD cache.
   Verify: file reads complete and source limitations recorded.
2. Evaluate A-G with limited-JD caveat.
   Verify: report includes role summary, CV mapping, gaps, comp, personalization, interview plan, legitimacy, score, and keywords.
3. Add tracker line with next number from `data/applications.md`.
   Verify: TSV has exactly 9 tab-separated columns.

## Verification Approach

- Confirm report path exists.
- Confirm tracker path exists and has 9 TSV columns.
- Confirm the report does not claim PDF generation.

## Progress Log

- 2026-04-16: Read `CLAUDE.md`, the `career-ops` skill, `config/profile.yml`, `cv.md`, `article-digest.md`, `templates/states.yml`, `data/applications.md`, and `data/scan-history.tsv`.
- 2026-04-16: Confirmed JD cache is short: official URL plus title only.
- 2026-04-16: Used minimal external fallback because the local JD body was missing; official URL fetch was not available from the shell environment.
- 2026-04-16: Created report and tracker-addition files.

## Key Decisions

- Set legitimacy to `Proceed with Caution` because the official URL and scan history are strong signals, but posting freshness, live apply state, and the full official JD body are unverified in batch mode.
- Scored the role below strong-apply threshold because Hongxi has strong C++/Linux/distributed-systems adjacency but lacks direct embedded driver, RTOS, Windows driver framework, and hardware-software integration experience.
- Used `Evaluada` in the tracker line to match the batch prompt's canonical Spanish state list.

## Risks and Blockers

- Sponsorship is unknown from the available text; profile says Hongxi requires work authorization support.
- Compensation bottom of band is below the profile minimum.
- JD detail depends partly on fallback mirror content, so application decisions should confirm the official Qualcomm page before applying.

## Final Outcome

- Report written: `reports/196-qualcomm-2026-04-16.md`
- Tracker addition written: `batch/tracker-additions/hxBcJvVhh_LLrTB4s98-w.tsv`
- PDF not generated.
