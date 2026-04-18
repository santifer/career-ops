# Roku ML Evaluation

## Background

Bridge batch run `glwk0M6kgmvS06Yv5aF0h` asks for a complete A-G evaluation of Roku's `Software Engineer, Machine Learning` role from cached JD text, plus a tracker-addition TSV. PDF generation is explicitly disabled.

## Goal

Create `reports/244-roku-2026-04-17.md` and `batch/tracker-additions/glwk0M6kgmvS06Yv5aF0h.tsv`, then return a valid JSON summary.

## Scope

- Read `cv.md`, `llms.txt`, `article-digest.md`, `config/profile.yml`, cached JD text, tracker, and scan history.
- Evaluate fit, blockers, compensation, interview strategy, and posting legitimacy.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or portfolio files.
- Do not generate a PDF because `PDF_CONFIRMED: no`.

## Assumptions

- The cached JD file is the primary source because it contains company, role, requirements, responsibilities, and tags.
- `llms.txt` is empty or absent of extra guidance in this checkout.
- Roku's `H1B Sponsor Likely` tag is enough to avoid a sponsorship hard blocker, but it remains a verification item.

## Implementation Steps

1. Load source files and cached JD.
   Verify: source reads complete without errors.
2. Draft A-G evaluation with exact CV line references and repo proof points.
   Verify: report includes required header, all required sections, and no unsupported metrics.
3. Write tracker addition using max existing tracker number + 1.
   Verify: TSV has one line and exactly 9 tab-separated columns.
4. Run structural checks on created artifacts.
   Verify: report path exists, PDF is absent, TSV column count is 9.

## Verification Approach

Use shell checks for file existence, key report markers, TSV column count, and a quick readback of created files. No PDF or live application submission is part of this run.

## Progress Log

- 2026-04-17: Loaded career-ops instructions, `CLAUDE.md`, cached JD, candidate CV, article digest, profile, applications tracker, scan history, and states file.
- 2026-04-17: Confirmed cached JD is usable and no frontmatter is present.

## Key Decisions

- Use `AI Forward Deployed Engineer` with `AI Platform / LLMOps Engineer` as the secondary archetype because the role mixes applied ML implementation, cross-functional translation, experimentation, and production optimization.
- Treat C++/Python/systems fundamentals as strong adjacent matches; treat DL frameworks, RNN/CNN/multimodal, video/audio ML, and edge devices as gaps rather than hard blockers.

## Risks and Blockers

- The cached JD is concise and does not expose full salary, team size, location, or live freshness.
- The role may expect more ML model training depth than the CV currently proves.
- Sponsorship is a likely-positive tag, not a formal guarantee.

## Final Outcome

Pending.
