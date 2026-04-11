# Documentation Guide

This guide is for contributors who want to understand how the repository's markdown files fit together before changing prompts, docs, templates, or workflow instructions.

## Start Here

If you are new to the repository, read in this order:

1. [README.md](../README.md) — project overview, quick start, and main capabilities
2. [docs/SETUP.md](./SETUP.md) — environment and onboarding setup
3. [DATA_CONTRACT.md](../DATA_CONTRACT.md) — user-layer vs system-layer file ownership
4. [docs/ARCHITECTURE.md](./ARCHITECTURE.md) — how the pipeline, reports, and scripts fit together
5. [modes/README.md](../modes/README.md) — how prompt modes are organized
6. [docs/FILE_MAP.md](./FILE_MAP.md) — explanation of every markdown file and its file connections

## Repo Mental Model

Think about the repository in six buckets:

- **Project overview and policy** — root files such as `README.md`, `CLAUDE.md`, `AGENTS.md`, `DATA_CONTRACT.md`, and `LEGAL_DISCLAIMER.md`
- **Contributor guides** — `docs/SETUP.md`, `docs/ARCHITECTURE.md`, `docs/CUSTOMIZATION.md`, `docs/CODEX.md`, and this guide
- **Mode instructions** — `modes/` contains the operating prompts that drive evaluation, scanning, tailoring, tracking, and localized workflows
- **Examples and reference material** — `examples/` and `interview-prep/story-bank.md` show target formats and expected outputs
- **User-layer working files** — files such as `cv.md`, `config/profile.yml`, `modes/_profile.md`, `data/*`, `reports/*`, `output/*`, and `portals.yml` belong to the user and should not be overwritten by system updates
- **System scripts and templates** — `.mjs` utilities, `templates/*`, `batch/*`, `dashboard/*`, and shared mode files are maintained as part of the product itself

## Reading Paths

### I want to understand the product

Read [README.md](../README.md), then [docs/ARCHITECTURE.md](./ARCHITECTURE.md), then [docs/FILE_MAP.md](./FILE_MAP.md).

### I want to change prompts or mode behavior

Read [DATA_CONTRACT.md](../DATA_CONTRACT.md), then [modes/README.md](../modes/README.md), then the relevant entries in [docs/FILE_MAP.md](./FILE_MAP.md).

### I want to customize the system for a specific user

Read [DATA_CONTRACT.md](../DATA_CONTRACT.md) first, then [docs/CUSTOMIZATION.md](./CUSTOMIZATION.md). Put user-specific changes in `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, or other user-layer files — not in `modes/_shared.md`.

### I want to contribute documentation

Read [CONTRIBUTING.md](../CONTRIBUTING.md), then [docs/FILE_MAP.md](./FILE_MAP.md), then update any impacted destination guides.

## Docs by Topic

- **Setup:** [docs/SETUP.md](./SETUP.md)
- **Architecture:** [docs/ARCHITECTURE.md](./ARCHITECTURE.md)
- **Customization rules:** [docs/CUSTOMIZATION.md](./CUSTOMIZATION.md)
- **Codex-specific usage:** [docs/CODEX.md](./CODEX.md)
- **Mode system:** [modes/README.md](../modes/README.md)
- **All markdown files:** [docs/FILE_MAP.md](./FILE_MAP.md)
- **Contribution workflow:** [CONTRIBUTING.md](../CONTRIBUTING.md)

## Markdown File Map

The exhaustive markdown inventory lives in [docs/FILE_MAP.md](./FILE_MAP.md). Use it when you need to answer:

- what a file is for
- whether it is user-layer or system-layer
- which other files it depends on or mirrors
- whether it is an instruction file, example, plan, or output reference

## Editing Rules

- Treat [DATA_CONTRACT.md](../DATA_CONTRACT.md) as the source of truth for file ownership.
- Treat [CLAUDE.md](../CLAUDE.md) and [AGENTS.md](../AGENTS.md) as the source of truth for agent behavior and routing.
- Put user-specific customization in `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, and related user-layer files.
- Do not put per-user customization in `modes/_shared.md`.
- When editing localized modes, check the matching English mode and the language folder README before changing structure.
