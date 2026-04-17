# TikTok C++ SDK Performance Evaluation

## Background

Batch job `SnzfLV9hsEPR5AfH_EMqX` requests a career-ops evaluation for TikTok's `Software Engineer, C/C++ SDK Performance Optimization` role. The primary JD source is the cached bridge file under `/var/folders/.../career-ops-bridge-jd-SnzfLV9hsEPR5AfH_EMqX.txt`.

## Goal

Produce a real evaluation report and tracker addition for report number 139 without generating a PDF.

## Scope

- Read the cached JD, `cv.md`, `article-digest.md`, optional `llms.txt`, profile data, tracker state, and scan history.
- Generate `reports/139-tiktok-2026-04-16.md`.
- Generate `batch/tracker-additions/SnzfLV9hsEPR5AfH_EMqX.tsv`.
- Do not edit `cv.md`, `i18n.ts`, or `data/applications.md`.
- Do not generate a PDF because `PDF_CONFIRMED: no`.

## Assumptions

- The bridge JD file is sufficient for evaluation; no web fetch or web search is needed.
- The JD file has structured field labels but not YAML frontmatter, so `used_frontmatter` is false.
- The candidate requires sponsorship based on `config/profile.yml`; the JobRight cache says "H1B Sponsor Likely", so sponsorship is not treated as a hard blocker.
- The role is outside the six AI-first archetypes, so it is classified as an adjacent AI Platform / LLMOps-style systems performance role rather than forced into a perfect AI match.

## Implementation Steps

1. Read local sources and parse JD metadata.
   Verify: company, role, sponsorship signal, requirements, and responsibilities are present.
2. Evaluate A-G against the CV and article proof points.
   Verify: every major JD requirement maps to a CV line or a stated gap.
3. Write report markdown.
   Verify: report exists at the requested path and contains A-G plus keywords.
4. Write tracker addition.
   Verify: TSV has one line and exactly 9 tab-separated columns.
5. Skip PDF.
   Verify: final JSON reports `pdf: null`.

## Verification Approach

- `test -s` for report and tracker files.
- `awk -F'\t' 'NF != 9 { exit 1 }'` on the tracker addition.
- Header grep for score, legitimacy, URL, and batch ID in the report.

## Progress Log

- 2026-04-16: Read the career-ops skill, `CLAUDE.md`, cached JD, CV, article digest, profile, scan history, canonical states, and current tracker.
- 2026-04-16: Confirmed `llms.txt` is absent and PDF generation is explicitly disabled.
- 2026-04-16: Evaluated the role as a specialized mobile C++/SDK performance role with partial systems-performance fit but major graphics/camera/mobile profiling gaps.
- 2026-04-16: Wrote the report and tracker addition.

## Key Decisions

- No external research was performed because the cached JD includes enough role detail for scoring, and salary absence can be handled explicitly.
- Legitimacy is `Proceed with Caution`: the JD is specific and the exact URL appears in scan history, but batch mode cannot verify the apply button or posting freshness.
- Global score is 3.15/5: no hard blocker, strong C++/systems proof, but the role is much more mobile graphics/performance-specialized than the candidate's strongest AI/full-stack track.

## Risks and Blockers

- Compensation is not transparent in the cached JD.
- The role likely expects real mobile graphics, camera pipeline, GPU profiling, and shader/API experience that is not present in the CV.
- Batch mode cannot verify live posting freshness.

## Final Outcome

Completed. Report and tracker addition were created. PDF was not generated.
