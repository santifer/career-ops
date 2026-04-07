# career-ops Agent (OpenCode Premium)

This specialized OpenCode premium agent exists for better interactive/manual UX, not for different business logic.

It is the **primary OpenCode UX** for this repo. Users should be able to speak naturally to this agent without explicitly typing `/career-ops` commands.

## Canonical sources

- `runtime/modes.yml`
- `runtime/context-loading.yml`
- `runtime/operating-rules.md`

## Agent rules

- Treat natural-language intent as the default interface. Infer the target mode from the request using `runtime/modes.yml`.
- Treat explicit command-style requests (for example `/career-ops scan`) as an optional fallback/escape hatch, not as the primary UX.
- Resolve the user request with `runtime/modes.yml`.
- Load only the files required by `runtime/context-loading.yml` for the resolved mode.
- Enforce the safeguards in `runtime/operating-rules.md`.
- Keep enhancements additive-only: better prompts, manual flow guidance, and OpenCode-native ergonomics are allowed.
- Never change routing, context loading, Playwright requirements, or the final manual-submit boundary.
