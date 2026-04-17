# ByteDance Inference Infrastructure Evaluation

## Background

Batch job `DCXJVH3Xs5aHHVrzXZuJa` requests a career-ops evaluation for ByteDance's `Software Engineer Graduate (Inference Infrastructure) - 2026 Start (PhD)` role. The bridge JD file under `/var/folders/.../career-ops-bridge-jd-DCXJVH3Xs5aHHVrzXZuJa.txt` contains only the URL and title, so the direct ByteDance posting is needed to recover the full JD.

## Goal

Produce a real evaluation report and tracker addition for report number 166 without generating a PDF.

## Scope

- Read the cached JD, `cv.md`, `article-digest.md`, optional `llms.txt`, profile data, tracker state, and scan history.
- Use the direct ByteDance posting to fill the missing responsibilities, qualifications, location, job code, and compensation.
- Generate `reports/166-bytedance-2026-04-16.md`.
- Generate `batch/tracker-additions/DCXJVH3Xs5aHHVrzXZuJa.tsv`.
- Do not edit `cv.md`, `i18n.ts`, or `data/applications.md`.
- Do not generate a PDF because `PDF_CONFIRMED: no`.

## Assumptions

- The official ByteDance posting provides enough JD detail for scoring; no broader web search is needed.
- The cached JD file has no YAML frontmatter, so `used_frontmatter` is false.
- The candidate requires sponsorship based on `config/profile.yml`; the JD does not explicitly deny sponsorship, so sponsorship is a verification risk rather than a hard blocker.
- The PhD-only minimum qualification is a candidate-specific hard blocker unless a recruiter confirms MS candidates are accepted.
- The role is best classified as `AI Platform / LLMOps Engineer` because it buys LLM inference infrastructure, Kubernetes-native orchestration, GPU-optimized scheduling, and production ML platform work.

## Implementation Steps

1. Parse local and direct-posting role facts.
   Verify: company, role, location, salary, responsibilities, qualifications, and blocker signals are known.
2. Evaluate A-G against the CV and article proof points.
   Verify: every major JD requirement maps to a CV line, article proof point, or stated gap.
3. Write report markdown.
   Verify: report exists at the requested path and contains A-G plus keywords.
4. Write tracker addition.
   Verify: TSV has one line and exactly 9 tab-separated columns.
5. Skip PDF.
   Verify: final JSON reports `pdf: null`.

## Verification Approach

- `test -s` for report and tracker files.
- `awk -F'\t' 'NF != 9 { exit 1 }'` on the tracker addition.
- Header grep for score, legitimacy, URL, batch ID, and PDF status in the report.

## Progress Log

- 2026-04-16: Read the career-ops skill, `CLAUDE.md`, shared/profile context, cached JD, CV, article digest, tracker state, and scan history.
- 2026-04-16: Confirmed `llms.txt` is absent and PDF generation is explicitly disabled.
- 2026-04-16: Opened the direct ByteDance posting because the bridge JD cache only contained URL/title; recovered Seattle location, job code `A106384`, full responsibilities/qualifications, and `$148,200-$300,960` base salary range.

## Key Decisions

- Use the official ByteDance posting as the full JD source because the cached bridge file was too short for a real evaluation.
- Do not do broader company or market research because the official posting provides compensation, team, requirements, and legitimacy signals.
- Treat the PhD requirement as the decisive blocker, not a minor gap.
- Omit application-answer drafts because the expected global score is below the `>= 4.5` threshold.

## Risks and Blockers

- The role explicitly targets PhD graduates; Hongxi is completing an MS in Software Engineering.
- The JD expects direct GPU orchestration, inference engines, CUDA, and large-scale cluster management experience not shown in the CV.
- Sponsorship support is not stated in the posting and must be confirmed separately.
- Batch mode cannot verify exact posting freshness beyond the official page and local scan history.

## Final Outcome

Pending.
