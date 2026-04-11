# Customization Guide

Use this guide when adapting Career-Ops to a specific person's background, goals, or search strategy. For file ownership rules, read [DATA_CONTRACT.md](../DATA_CONTRACT.md) first.

## Personalization Rules

Store user-specific identity, targets, narrative, negotiation preferences, and role framing in:

- `config/profile.yml`
- `modes/_profile.md`
- `article-digest.md`
- `portals.yml`
- other user-layer files listed in [DATA_CONTRACT.md](../DATA_CONTRACT.md)

Do not store personal customization in `modes/_shared.md`. That file is the shared system-layer instruction base.

## Profile (`config/profile.yml`)

This is the main structured source of truth for the user's identity and search constraints.

Key sections usually include:

- **candidate** — name, contact details, location, links
- **target_roles** — role targets, archetypes, or role families
- **narrative** — headline, positioning, strengths, proof points
- **compensation** — targets, minimums, currency, negotiation guardrails
- **location** — country, timezone, visa status, remote/on-site constraints

This file connects to the main mode flows because shared and task-specific prompts read profile context from it.

## Personal Positioning (`modes/_profile.md`)

Use this file for user-specific prompt customization that should survive system updates.

Good fits for this file:

- personalized archetypes or role framing
- transition narrative and positioning
- negotiation preferences and pushback language
- user-specific proof-point emphasis
- market or location preferences that belong in prose rather than YAML

Start from `modes/_profile.template.md` if the profile file does not exist yet.

## Proof Points (`article-digest.md`)

Use `article-digest.md` for compact summaries of portfolio projects, case studies, shipped work, or proof points that the evaluation and PDF flows can reuse.

The example file in `examples/article-digest-example.md` shows the intended style and density.

## Portals (`portals.yml`)

Create `portals.yml` from `templates/portals.example.yml` and customize:

1. `title_filter.positive` for matching target roles
2. `title_filter.negative` for filtering out bad-fit roles
3. `search_queries` for board-specific discovery patterns
4. `tracked_companies` for direct company-page checks

This file connects directly to the scanner and discovery workflows.

## CV Template (`templates/cv-template.html`)

This is a shared system template, not a user profile file. Edit it only when you want to change the output design or rendering behavior for everyone using that template.

The template connects to `generate-pdf.mjs`, `modes/pdf.md`, and the example CV/output flow.

## Shared Workflow Logic (`modes/_shared.md`)

`modes/_shared.md` documents the common system logic used by multiple modes: scoring, shared rules, reusable instructions, and workflow conventions.

Contributors may edit it when changing the shared product behavior. Users should not use it as the place for their personal profile or negotiation preferences.

## Hooks (Optional)

Career-Ops can integrate with external systems through local Claude hooks. If you use them, keep the hook definitions in `.claude/settings.json` and treat them as environment-specific configuration.

## States (`templates/states.yml`)

The canonical tracker states rarely need to change. If you do change them, update the connected files together:

1. `templates/states.yml`
2. `normalize-statuses.mjs`
3. any mode or tracker docs that describe those states
