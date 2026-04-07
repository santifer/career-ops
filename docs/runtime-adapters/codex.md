# Codex CLI Adapter Status

Codex CLI is **documented-only** in this repository.

## What this means

- This guidance is **not part of this PR** as a shipped adapter implementation.
- Any future Codex CLI adapter must read `runtime/modes.yml`, `runtime/context-loading.yml`, and `runtime/operating-rules.md`.
- The wrapper **must not imply full parity** with Claude or OpenCode premium until a real adapter lands.
- `batch/background worker abstraction is deferred`, so this document must not claim worker support.

## Future implementation rules

1. Keep the runtime core vendor-neutral and canonical.
2. Treat Codex-specific UX as adapter-scoped only.
3. Preserve routing, context loading, safeguards, and the manual-submit boundary.
4. Keep `documented-only` status until tests and entrypoints actually exist.
