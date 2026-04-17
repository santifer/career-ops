# ByteDance ML Recommendation Evaluation

## Background

Bridge batch job `EXjr-YGO7kfbECv1Kre0p` requests a career-ops evaluation for ByteDance's `Machine Learning Engineer Graduate (E-Commerce Recommendation/Search Alliance)- 2026 Start (BS/MS)` role. The primary JD source is the cached bridge file under `/var/folders/.../career-ops-bridge-jd-EXjr-YGO7kfbECv1Kre0p.txt`.

## Goal

Produce report number 144 and a tracker addition without generating a PDF.

## Scope

- Read the cached JD, `cv.md`, optional `llms.txt`, `article-digest.md`, profile data, tracker state, and scan history.
- Generate `reports/144-bytedance-2026-04-16.md`.
- Generate `batch/tracker-additions/EXjr-YGO7kfbECv1Kre0p.tsv`.
- Do not edit `cv.md`, `i18n.ts`, portfolio files, or `data/applications.md`.
- Do not generate a PDF because `PDF_CONFIRMED: no`.

## Assumptions

- The cached bridge JD is sufficient for evaluation; no web fetch or web search is needed.
- The cached file has structured field labels but no YAML frontmatter block, so `used_frontmatter` is false.
- The candidate requires sponsorship based on `config/profile.yml`; the cached JobRight recommendation tag says `H1B Sponsor Likely`, but this is not direct employer confirmation.
- The role is a graduate ML/recommendation/search role, best mapped to `AI Platform / LLMOps Engineer` plus `AI Forward Deployed Engineer` because the candidate's strongest evidence is production-style retrieval, ranking-adjacent systems, data pipelines, and backend reliability.

## Implementation Steps

1. Read local sources and parse JD metadata.
   Verify: company, role, level, sponsorship signal, requirements, and responsibilities are present.
2. Evaluate blocks A-G against the CV and article proof points.
   Verify: every major JD requirement maps to a CV line, article proof point, or a stated gap.
3. Write the report markdown.
   Verify: report exists at the requested path and contains A-G plus keywords.
4. Write the tracker addition.
   Verify: TSV has one line and exactly 9 tab-separated columns.
5. Skip PDF.
   Verify: final JSON reports `pdf: null`.

## Verification Approach

- `test -s` for report and tracker files.
- `awk -F'\t' 'NF != 9 { exit 1 }'` on the tracker addition.
- Header grep for score, legitimacy, URL, PDF status, and batch ID in the report.

## Progress Log

- 2026-04-16: Read the career-ops skill, `CLAUDE.md`, batch mode docs, shared/profile mode docs, cached JD, CV, article digest, profile, scan history, canonical states, current tracker, and data contract.
- 2026-04-16: Confirmed `llms.txt` is absent, `cv-sync-check.mjs` passes, and PDF generation is explicitly disabled.
- 2026-04-16: Evaluated the role as a strong but not automatic new-grad ML systems target because retrieval/data-pipeline evidence is strong while direct recommender model training, ML frameworks, publications, and official sponsorship/location/comp remain gaps.

## Key Decisions

- No external research was performed because the cached JD includes enough requirements and responsibilities for scoring; missing salary/location are called out explicitly rather than patched with unverified assumptions.
- Legitimacy is `Proceed with Caution`: the role has an official ByteDance URL and coherent JD content, but batch mode cannot verify freshness or apply state and the cache lacks salary/location.
- Global score is 3.95/5: worth a selective application if sponsorship and location are viable, but not a 4.5+ automatic apply because of ML-framework/recommender-production gaps and incomplete posting metadata.

## Risks and Blockers

- Direct ByteDance sponsorship support is not confirmed by employer text.
- The cached JD salary field is not a compensation range.
- Location, remote/hybrid policy, live apply state, and posting freshness are unverified in batch mode.
- The candidate has strong retrieval and systems proof but no explicit PyTorch/TensorFlow, publication, or production recommender-system training evidence in the CV.

## Final Outcome

Pending report and tracker write.
