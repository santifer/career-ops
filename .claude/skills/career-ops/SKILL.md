---
name: career-ops
description: AI job search command center -- evaluate offers, generate CVs, scan portals, track applications
user_invocable: true
args: mode
---

# career-ops -- Claude Adapter

This is a thin Claude wrapper over the canonical runtime core.

## Required runtime sources

Before deciding anything, read these files and treat them as canonical:

1. `runtime/modes.yml` -- input classification and mode resolution
2. `runtime/context-loading.yml` -- which mode files to load for the resolved mode
3. `runtime/operating-rules.md` -- shared safeguards, ownership rules, and deferred scope

## Claude adapter contract

- Use Claude slash-command UX as the entry surface only.
- Resolve raw JDs / offer URLs and `/career-ops` subcommands from `runtime/modes.yml`.
- Load the required mode files exactly as defined in `runtime/context-loading.yml`.
- Execute business logic from `modes/*` and `CLAUDE.md`; do not restate or fork that logic here.
- Preserve shared safeguards from `runtime/operating-rules.md`, especially Playwright-only verification and the manual-submit boundary.

## Claude-specific affordances

- If the resolved mode is `discovery`, present the available `/career-ops` commands using Claude-friendly slash-command formatting.
- If the resolved mode needs a delegated/manual flow, keep the same resolved mode and context contract while using Claude-native agent UX.
- If user input is neither a recognized subcommand nor a raw JD/offer URL, fall back to the `discovery` behavior defined by the runtime core.
