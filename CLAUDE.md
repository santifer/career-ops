# Career-Ops -- Claude Compatibility Layer

`AGENTS.md` is the universal source of truth for this repository. This file exists to keep Claude Code compatible without making the project Claude-specific again.

## What Claude Should Use

1. Read `AGENTS.md` first for product behavior, data contract, onboarding, ethics, and verification rules.
2. Use `.claude/skills/career-ops/SKILL.md` for slash-command routing.
3. Use `modes/*` as the operational prompts for evaluation, scanning, PDFs, and tracking.

## Update Check

On the first message of each session, run:

```bash
node update-system.mjs check
```

If an update is available, explain that user files are not touched and ask before applying it.

## First Run

Before normal use, verify the setup expected by `AGENTS.md`:

- `cv.md`
- `config/profile.yml`
- `modes/_profile.md`
- `portals.yml`

If `modes/_profile.md` is missing, create it from `modes/_profile.template.md`.

## Claude-Specific Notes

- Claude still needs this compatibility file because it does not use `AGENTS.md` natively.
- The batch runner now has two verified built-in worker providers: `claude` and `codex`.
- Other runtimes still use the external adapter contract documented in `AGENTS.md` and `docs/AGENT_COMPATIBILITY.md`.
- OpenCode and Claude share the same core `modes/*` files and the same data contract.

## Data Contract

Use the same system/user layer split defined in `AGENTS.md` and `DATA_CONTRACT.md`.

The most important rule remains:

- personalization belongs in `config/profile.yml` and `modes/_profile.md`
- generic system behavior belongs in system files

## Ethical Use

- Never auto-submit an application.
- Discourage low-fit applications.
- Prefer quality over volume.

## Pipeline Integrity

- Never add new tracker rows directly to `data/applications.md`.
- Use `batch/tracker-additions/*.tsv` and merge with `node merge-tracker.mjs`.
- Keep canonical states from `templates/states.yml`.
