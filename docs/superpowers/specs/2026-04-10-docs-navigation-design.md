# Docs Navigation Design

## Goal

Make the repository's markdown files understandable for new contributors without rewriting the whole project. The main pain points are:

- there is no single contributor-facing index for the documentation
- the `modes/` tree is hard to understand from file names alone
- setup, architecture, customization, and contributor guidance are split across multiple files with weak cross-linking
- contributors cannot easily tell what each markdown file is for or which other files it depends on
- at least one customization document conflicts with the data contract by telling users to edit `modes/_shared.md` for personal changes

## Scope

This change introduces a documentation navigation layer, an explicit markdown file map, and fixes the conflicting guidance.

Included:

- add a central contributor docs hub at `docs/README.md`
- add a `modes/README.md` that explains the mode system and language folders
- add a markdown catalog that explains every `.md` file in the repository and what other files it connects to
- update top-level `README.md` to point contributors into the docs hub and file map
- update `docs/CUSTOMIZATION.md` so personalization guidance matches `DATA_CONTRACT.md` and `CLAUDE.md`
- add cross-links between the major docs so contributors can move through them in a sensible order

Not included:

- rewriting every mode file
- renaming existing directories
- changing runtime behavior or scripts
- changing user-layer files or onboarding flow

## Users

### New contributors

Need a fast mental model of the repo and a reading path that answers:

- what the project does
- which docs matter first
- what each markdown file is for
- which files are safe to edit
- where user-specific customization belongs
- which files are inputs, templates, examples, instructions, or outputs

### Maintainers

Need a lightweight structure that can grow without constant cleanup.

## Deliverables

### 1. Contributor docs hub

`docs/README.md` becomes the entry point for contributors.

It should contain:

- recommended reading order
- repo mental model
- editing safety rules
- links to the markdown catalog
- links to setup, architecture, customization, and contribution docs

### 2. Modes index

`modes/README.md` explains the mode system.

It should contain:

- the purpose of root mode files
- the role of `modes/_shared.md`
- the role of `modes/_profile.md` and `modes/_profile.template.md`
- one-line explanations for each top-level mode file
- how language folders inherit from or mirror the default modes
- where contributors should put user-specific versus shared changes

### 3. Markdown file catalog

Create a dedicated file, recommended name `docs/FILE_MAP.md`, that documents every repository markdown file.

Each entry should include:

- file path
- category
- purpose
- who edits it
- whether it is user-layer or system-layer when relevant
- key connected files
- notes on when a contributor should read or change it

The catalog should cover all current markdown files, including:

- root docs such as `README.md`, `CONTRIBUTING.md`, `DATA_CONTRACT.md`, `LEGAL_DISCLAIMER.md`, `CLAUDE.md`, `AGENTS.md`
- docs under `docs/`
- examples under `examples/`
- mode files under `modes/` and language subfolders
- batch and interview-prep markdown files

## Connection Model

The markdown catalog should use a simple, readable connection format rather than a full graph syntax.

For each file, connections should be expressed in plain language such as:

- reads with
- extends
- mirrors
- documents
- customizes
- feeds
- example for
- source of truth for

Examples:

- `docs/CUSTOMIZATION.md` -> `config/profile.example.yml`, `modes/_profile.template.md`, `DATA_CONTRACT.md`
- `modes/offer.md` -> `modes/_shared.md`, generated reports in `reports/`, tracker flow docs
- `examples/cv-example.md` -> `cv.md`, `docs/SETUP.md`, PDF generation flow

## Approach Options Considered

### Option 1: Add a navigation layer on top of the existing docs

Add a docs hub, a modes index, a markdown catalog, and repair broken links/guidance.

Pros:

- minimal repo disruption
- low maintenance cost
- preserves existing filenames and external references
- solves the main onboarding problem quickly

Cons:

- existing docs still vary in depth and style

### Option 2: Full docs rewrite

Rewrite and reorganize most markdown files.

Pros:

- potentially cleaner long-term consistency

Cons:

- large diff
- higher risk of introducing drift or losing nuance
- slower to review

### Recommendation

Choose Option 1. It fixes discoverability and correctness first, while keeping the existing project structure intact.

## Information Architecture

### 1. Root README remains the project overview

`README.md` should continue to explain the project at a high level, but it should route contributor-type readers toward the documentation hub and markdown catalog.

### 2. `docs/README.md` becomes the contributor entry point

This file should answer:

- what each major documentation area is for
- recommended reading order
- how the repo separates system files from user data
- where the exhaustive markdown file map lives

### 3. `docs/FILE_MAP.md` becomes the exhaustive markdown inventory

This file should be optimized for navigation, not prose.

Suggested organization:

- Root documents
- `docs/`
- `modes/` root files
- `modes/` language folders
- `examples/`
- Other workflow markdown files

Within each section, every markdown file gets a short but concrete entry.

### 4. `modes/README.md` becomes the mode index

This file should help contributors understand the most confusing part of the repository: mode routing and translation folders.

### 5. Existing docs become destination pages

Current docs remain in place but are made easier to discover through explicit cross-links and corrected wording.

## Content Rules

### Customization safety

All docs touched by this change must reinforce the existing rule:

- user-specific customization belongs in `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, and related user-layer files
- `modes/_shared.md` is system-layer shared logic and should not be used for per-user customization

### Contributor orientation

The new docs should be written for contributors, not just end users. That means they should describe repository structure, document ownership boundaries, and editing expectations.

### Minimal churn

Use the current filenames and folder layout. Add indexing and cross-linking rather than inventing a parallel docs system.

## Expected File Changes

- create `docs/README.md`
- create `docs/FILE_MAP.md`
- create `modes/README.md`
- modify `README.md`
- modify `docs/CUSTOMIZATION.md`
- optionally modify `CONTRIBUTING.md` if a link to the docs hub improves discoverability

## Validation

After editing:

- verify all new internal markdown links resolve to existing files
- verify every current `.md` file in the repository is covered in `docs/FILE_MAP.md`
- verify no updated docs instruct users to place personal configuration in `modes/_shared.md`
- verify the docs hub accurately reflects the current repository structure
- keep the change limited to documentation unless a docs-only correction requires a tiny supporting change

## Risks

- the exhaustive catalog could become stale if contributors add new markdown files and forget to update it
- adding too much new structure could duplicate existing docs
- contributor guidance could drift from `CLAUDE.md` if it paraphrases too loosely

Mitigation:

- keep entries concise and structured
- cross-link to source-of-truth files instead of re-explaining everything in depth
- treat `DATA_CONTRACT.md` and `CLAUDE.md` as the source of truth for customization boundaries
