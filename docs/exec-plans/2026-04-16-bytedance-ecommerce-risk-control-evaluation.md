# ByteDance E-Commerce Risk Control Evaluation

## Background

Batch job `nhTAtNymMrUl1RHR_Fm_P` requests a career-ops evaluation for ByteDance's `Machine Learning Engineer Graduate (E-Commerce Risk Control)- 2026 Start (Phd)` role. The bridge JD cache at `/var/folders/.../career-ops-bridge-jd-nhTAtNymMrUl1RHR_Fm_P.txt` only contains the URL and title, so the official ByteDance posting is needed to recover the complete JD.

## Goal

Produce a real evaluation report and tracker addition for report number `197` without generating a PDF.

## Scope

- Read `cv.md`, `article-digest.md`, optional `llms.txt`, `config/profile.yml`, `modes/_profile.md`, tracker state, scan history, and the cached JD.
- Use the official ByteDance URL to fill the missing responsibilities, qualifications, location, job code, and compensation.
- Generate `reports/197-bytedance-2026-04-16.md`.
- Generate `batch/tracker-additions/nhTAtNymMrUl1RHR_Fm_P.tsv`.
- Do not edit `cv.md`, `i18n.ts`, portfolio files, or `data/applications.md`.
- Do not generate a PDF because `PDF_CONFIRMED: no`.

## Assumptions

- The official ByteDance posting is sufficient for evaluation; no broader web search is needed.
- The cached JD file has no YAML frontmatter, so `used_frontmatter` is false.
- The candidate requires sponsorship based on `config/profile.yml`; the posting does not state sponsorship support, so this is a verification risk rather than a confirmed hard blocker.
- The closest required archetype is `AI Platform / LLMOps Engineer + Technical AI Product Manager` because the role buys production ML/risk systems, experimentation, data infrastructure, and metric alignment with product and technology teams.

## Implementation Steps

1. Parse the cached JD and official ByteDance posting.
   Verify: company, role, location, salary, responsibilities, qualifications, and hard blockers are known.
2. Evaluate Blocks A-G against the candidate sources.
   Verify: each major JD requirement maps to exact CV/article evidence or a stated gap.
3. Write the markdown report.
   Verify: report exists at the requested path and includes A-G plus ATS keywords.
4. Write the tracker addition.
   Verify: TSV has one line and exactly 9 tab-separated columns.
5. Skip PDF.
   Verify: no PDF path is created and final output reports `pdf: null`.

## Verification Approach

- `test -s` for the report and tracker files.
- `awk -F'\t' 'NF != 9 { exit 1 }'` on the tracker addition.
- `rg` checks for report header fields: Score, Legitimacy, URL, PDF, and Batch ID.

## Progress Log

- 2026-04-16: Read career-ops skill routing, `CLAUDE.md`, mode files, cached JD, CV, article digest, profile, user profile overrides, canonical states, current tracker, and scan history.
- 2026-04-16: Confirmed `llms.txt` is absent and `node cv-sync-check.mjs` passes.
- 2026-04-16: Opened the official ByteDance posting because the cached JD only contained URL/title; recovered San Jose location, job code `A16763`, responsibilities, qualifications, benefits, and `$150,000-$316,800` base salary range.
- 2026-04-16: Wrote the evaluation report and tracker addition.

## Key Decisions

- Use the official ByteDance posting as the substantive JD source because the local cache is too short for a real evaluation.
- Do not do broader compensation research because the official posting includes location and pay transparency.
- Score below the application-answer threshold because the role is strong on comp and data infrastructure but weaker on direct risk-modeling, Hadoop/Hive, and PhD-level ML research evidence.
- Use `Evaluated` in the tracker addition because `templates/states.yml` lists it as the canonical label and `Evaluada` as an alias.

## Risks and Blockers

- Sponsorship support must be confirmed before investing in heavy tailoring.
- The JD is a PhD-titled ML role and may screen hard for formal model training, ML theory, Hadoop/Hive, and risk-control domain experience.
- San Jose onsite or hybrid expectations are not stated but should be assumed until ByteDance confirms.

## Final Outcome

Completed. Report and tracker TSV were generated; PDF was skipped by explicit run instruction.
