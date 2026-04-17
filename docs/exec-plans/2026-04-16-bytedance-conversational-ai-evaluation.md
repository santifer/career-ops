# ByteDance Conversational AI Evaluation

## Background

Batch job `X3yTCu1peiINGk_DYWJJX` requests a career-ops evaluation for ByteDance's `Machine Learning Engineer Graduate (TikTok E-Commerce - Conversational AI)-2026 Start (BS/MS)` role. The primary JD source is the cached bridge file under `/var/folders/.../career-ops-bridge-jd-X3yTCu1peiINGk_DYWJJX.txt`.

## Goal

Produce a real evaluation report and tracker addition for report number 145 without generating a PDF.

## Scope

- Read the cached JD, `cv.md`, `article-digest.md`, optional `llms.txt`, profile data, tracker state, and scan history.
- Use the direct ByteDance posting only to fill missing cached-JD fields such as location, job code, and compensation.
- Generate `reports/145-bytedance-2026-04-16.md`.
- Generate `batch/tracker-additions/X3yTCu1peiINGk_DYWJJX.tsv`.
- Do not edit `cv.md`, `i18n.ts`, or `data/applications.md`.
- Do not generate a PDF because `PDF_CONFIRMED: no`.

## Assumptions

- The cached JD plus the direct ByteDance posting are sufficient for evaluation; no web search is needed.
- The cached JD file has structured field labels but not YAML frontmatter, so `used_frontmatter` is false.
- The candidate requires sponsorship based on `config/profile.yml`; the cached scan signal says "H1B Sponsor Likely", and the JD does not say sponsorship is unavailable, so sponsorship is a verification risk rather than a hard blocker.
- The role is best classified as `AI Platform / LLMOps Engineer + Agentic Workflows / Automation` because it buys production LLM/NLP systems, conversational AI, machine translation, AIGC, and e-commerce automation.

## Uncertainties

- Direct sponsorship support is not stated in the posting.
- The JD expects practical NLP/modeling depth, machine translation, and possibly publication-quality research; the CV shows stronger AI systems and RAG evidence than model-training research.
- Batch mode cannot verify posting freshness beyond the direct page content and local scan history.

## Simplest Viable Path

1. Parse the local JD and direct posting facts.
   Verify: company, role, location, salary, requirements, responsibilities, and hard blockers are known.
2. Evaluate A-G against `cv.md` and `article-digest.md`.
   Verify: each major JD requirement maps to a CV line or a stated gap.
3. Write the markdown report.
   Verify: report exists at the requested path and includes A-G plus ATS keywords.
4. Write the tracker addition.
   Verify: TSV has one line and exactly 9 tab-separated columns.
5. Skip PDF.
   Verify: final JSON reports `pdf: null`.

## Verification Approach

- `test -s` for report and tracker files.
- `awk -F'\t' 'NF != 9 { exit 1 }'` on the tracker addition.
- Header grep for score, legitimacy, URL, batch ID, and PDF status in the report.

## Progress Log

- 2026-04-16: Read the career-ops skill, `CLAUDE.md`, cached JD, CV, article digest, profile, scan history, canonical states, and current tracker.
- 2026-04-16: Confirmed `llms.txt` is absent and PDF generation is explicitly disabled.
- 2026-04-16: Opened the direct ByteDance posting to fill missing cached-JD fields: Seattle location, job code `A104950`, and `$124,717-$243,200` base salary range.

## Key Decisions

- Use the direct employer URL as a supplement because the cached JD contains a malformed salary field and omits location.
- Do not do broader company or market research because the direct posting provides enough compensation and legitimacy signal.
- Omit application-answer drafts because the expected global score is below the `>= 4.5` threshold.

## Risks and Blockers

- Sponsorship must be confirmed before heavy application effort.
- The candidate should not overclaim machine translation, chatbot model training, or publication experience.
- ByteDance/TikTok culture may be high-pace and onsite-heavy; confirm team expectations before prioritizing.

## Final Outcome

Pending.
