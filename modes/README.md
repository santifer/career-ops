# Modes Guide

The `modes/` directory contains the prompt files that drive Career-Ops behavior. These files are the operating instructions for offer evaluation, pipeline processing, scanning, PDF generation, tracker review, outreach, and localized workflows.

## What `modes/` Contains

There are three main groups in this directory:

- **Shared foundation files** — files such as `_shared.md` that define common rules, scoring logic, and reusable instructions
- **Root mode files** — task-specific prompts such as `offer.md`, `pipeline.md`, `scan.md`, `pdf.md`, and `tracker.md`
- **Language folders** — localized variants in `de/`, `esp/`, `fr/`, `ko/`, and `pt/`

## Shared vs Profile-Specific Files

This split is critical:

- `modes/_shared.md` is the shared system-layer instruction base used across workflows
- `modes/_profile.md` is the user-specific customization layer referenced by the data contract and onboarding flow
- `modes/_profile.template.md` is the starter template used to create `modes/_profile.md`

Use `modes/_profile.md` for user-specific customization. Do not put personal customization in `modes/_shared.md`.

## Root Mode Files

- `apply.md` — live application assistant for filling forms with human review
- `auto-pipeline.md` — full pipeline for turning a job URL or JD into evaluation, PDF, and tracker updates
- `batch.md` — orchestrates parallel processing of multiple jobs
- `compare.md` — compares multiple evaluated offers side by side
- `deep.md` — deeper company and role research workflow
- `interview-prep.md` — builds interview preparation from reports and story-bank material
- `offer.md` — single-offer A–F evaluation mode
- `outreach.md` — outreach and networking assistance, especially LinkedIn-style contact work
- `patterns.md` — rejection-pattern analysis using report history and scripts
- `pdf.md` — ATS-oriented CV generation and PDF rules
- `pipeline.md` — processes the URL inbox in `data/pipeline.md`
- `project.md` — evaluates a portfolio or project idea against career goals
- `scan.md` — scans job portals and company pages for matching roles
- `tracker.md` — summarizes tracker state and status workflows
- `training.md` — evaluates courses or certifications for strategic fit

## Language Folders

The language subfolders contain localized mode sets for specific languages or markets:

- `de/` — German / DACH-oriented workflow set
- `esp/` — Spanish-language workflow set
- `fr/` — French-language workflow set
- `ko/` — Korean-language workflow set
- `pt/` — Brazilian Portuguese workflow set

Some folders include only the highest-value workflows; others include shared files plus translated mode files. Treat the English root files as the default system behavior unless a contributor is intentionally working on a localized variant.

## Editing Rules for Contributors

- Check [DATA_CONTRACT.md](../DATA_CONTRACT.md) before deciding whether a change belongs in a shared mode or a user-layer file.
- Keep task behavior in the existing mode structure rather than creating parallel prompt files.
- When translating or localizing a mode, preserve the workflow structure unless a market-specific change is deliberate and documented.
- Update [docs/FILE_MAP.md](../docs/FILE_MAP.md) when you add, remove, or substantially repurpose a markdown file under `modes/`.
