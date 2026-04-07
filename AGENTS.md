# Career-Ops OpenCode Adapter

This repo supports an OpenCode premium interactive surface, but the runtime contract is still canonical and vendor-neutral.

## Canonical runtime core

Read these files first and treat them as the source of truth:

1. `runtime/modes.yml`
2. `runtime/context-loading.yml`
3. `runtime/operating-rules.md`

## Adapter contract

- OpenCode premium UX is **additive-only**.
- Mode routing must come from `runtime/modes.yml`.
- Context loading must come from `runtime/context-loading.yml`.
- Safeguards, manual-submit boundaries, and scope limits must come from `runtime/operating-rules.md`.
- Business logic stays in `modes/*` and `CLAUDE.md`; this adapter must not fork it.

## Premium/manual UX allowance

OpenCode premium may provide a richer interactive/manual flow, a clearer command surface, or a specialized agent entrypoint, but it must preserve the exact same resolved mode, loaded files, and safeguards as the canonical runtime core.

## Preferred OpenCode UX

- The specialized OpenCode agent is the preferred interface when available.
- Users should be able to interact naturally with the OpenCode agent without explicitly typing `/career-ops` commands.
- Explicit command surfaces are still allowed, but they are fallback/escape-hatch UX rather than the primary interaction model.
- Natural-language routing in the OpenCode agent must still resolve through the same canonical runtime files listed above.
