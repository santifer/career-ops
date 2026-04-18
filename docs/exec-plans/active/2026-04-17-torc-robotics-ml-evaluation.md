# Torc Robotics ML Evaluation

## Background

Bridge batch run `-yzRmJ8HXwVS_ALIVtC6z` asks for a complete A-G evaluation of Torc Robotics' `ML Engineer, I - Acceleration Team` role from cached JD text, plus a tracker-addition TSV. PDF generation is explicitly disabled.

## Goal

Create `reports/247-torc-robotics-2026-04-17.md` and `batch/tracker-additions/-yzRmJ8HXwVS_ALIVtC6z.tsv`, then return a valid JSON summary.

## Scope

- Read `cv.md`, `llms.txt`, `article-digest.md`, `config/profile.yml`, cached JD text, tracker, and scan history.
- Evaluate fit, blockers, compensation, interview strategy, and posting legitimacy.
- Do not edit `cv.md`, `i18n.ts`, `data/applications.md`, or portfolio files.
- Do not generate a PDF because `PDF_CONFIRMED: no`.

## Assumptions

- The cached JD file is the primary source because it contains company, role, requirements, responsibilities, tags, and the Greenhouse URL.
- The cached JD has no YAML frontmatter delimited by `---`.
- `llms.txt` is absent in this checkout.
- The `H1B Sponsor Likely` tag is a positive signal, not a formal sponsorship guarantee.

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

- 2026-04-17: Loaded career-ops instructions, `CLAUDE.md`, cached JD, candidate CV, article digest, profile, applications tracker, and scan history.
- 2026-04-17: Confirmed cached JD is usable, no frontmatter is present, and no local scan-history duplicate was found for this URL, token, company-role combo, or batch ID.

## Key Decisions

- Use `AI Platform / LLMOps Engineer` with `AI Forward Deployed Engineer` as a secondary archetype because the role combines AI inference implementation, production optimization, performance profiling, tests, documentation, and embedded/safety-critical delivery.
- Treat C++/Linux/performance, Python/data pipelines, math, and AI-systems experience as credible adjacent matches.
- Treat CUDA, custom neural network layers, embedded safety-critical deployment, and direct PyTorch/TensorFlow production experience as meaningful gaps rather than automatic hard blockers.

## Risks and Blockers

- The cached JD is concise and does not expose full salary, team size, location, or live freshness.
- The role is closer to ML systems / acceleration than the candidate's strongest full-stack AI and distributed-systems profile.
- Sponsorship is likely-positive from the tag but not confirmed by employer language in the cached JD.

## Final Outcome

Pending.
