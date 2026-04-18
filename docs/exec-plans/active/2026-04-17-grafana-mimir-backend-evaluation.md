# Grafana Mimir Backend Evaluation

## Background

Bridge batch ID `UIJkp-CIsO-gD9f69rkzv` requested report `249` for the Greenhouse posting at `https://boards.greenhouse.io/embed/job_app?token=5796104004`.

The cached JD file was available at `/var/folders/ly/sdg_pj9x6xb8b89q5yytyhdw0000gn/T/career-ops-bridge-jd-UIJkp-CIsO-gD9f69rkzv.txt`. It did not include YAML frontmatter, but it did include extracted company, role, URL, requirements, responsibilities, tags, and taxonomy.

## Goal

Create a real evaluation report and tracker-addition TSV for Grafana Labs without generating a PDF.

## Scope

- Read local candidate sources: `cv.md`, `llms.txt` if present, `article-digest.md`, and `config/profile.yml`.
- Read local tracker and scan history.
- Write `reports/249-grafana-labs-2026-04-17.md`.
- Write `batch/tracker-additions/UIJkp-CIsO-gD9f69rkzv.tsv`.
- Do not edit `cv.md`, `i18n.ts`, or `data/applications.md`.

## Assumptions

- `PDF_CONFIRMED: no` means no PDF should be generated.
- The JD cache is the source of truth for this batch run because it exists and is non-empty.
- The salary field in the JD cache is not a real compensation range, so comp scoring should be conservative and marked as unverified.
- "H1B Sponsor Likely" from the scanner cache is a positive signal but not proof of sponsorship.

## Implementation Steps

1. Read JD and candidate sources.
   Verify: local JD, CV, profile, article digest, tracker, states, and scan history were read.
2. Score the role against candidate evidence.
   Verify: report includes Blocks A-G, global score, legitimacy, and ATS keywords.
3. Write tracker-addition line.
   Verify: TSV has exactly 9 tab-separated fields and uses the next tracker number.
4. Run file-level verification.
   Verify: report and TSV exist; TSV field count is 9.

## Verification Approach

- Use local file checks rather than web research.
- Validate the tracker TSV with `awk -F '\t' '{print NF}'`.
- Confirm the report has the required title and key sections.

## Progress Log

- 2026-04-17: Read repository instructions and career-ops context.
- 2026-04-17: Read cached JD, `cv.md`, `article-digest.md`, `config/profile.yml`, `templates/states.yml`, `data/applications.md`, and `data/scan-history.tsv`.
- 2026-04-17: Determined cached JD is sufficient; no WebFetch or WebSearch needed.
- 2026-04-17: Wrote report and tracker-addition files.

## Key Decisions

- Classified the role as `AI Platform / LLMOps Engineer` because it is primarily backend observability infrastructure with reliability, cloud, metrics, logs, traces, and distributed systems signals. It is not an AI role, so the report frames this as platform/backend alignment rather than agentic-AI alignment.
- Set legitimacy to `High Confidence` because the source is an official Greenhouse embed URL and the JD content is coherent, but marked freshness and apply-button state as unverified in batch mode.
- Set global score to `3.75/5`: technically strong for distributed systems and cloud backend, weaker for AI north-star alignment and unverified comp/sponsorship.

## Risks and Blockers

- No live posting freshness check was performed.
- Compensation was not available from the JD cache.
- Sponsorship is only scanner-inferred, not explicitly confirmed in the posting text.
- The candidate lacks explicit Go production experience, though Python/C/C++/Java/TypeScript systems experience is adjacent.

## Final Outcome

Report and tracker-addition were written. PDF generation was intentionally skipped because this run did not include explicit PDF confirmation.
