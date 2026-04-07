# Runtime Operating Rules

This file defines the shared execution policy for every career-ops adapter.

## Safeguards

- **Playwright-only verification**: verify live job pages with Playwright navigation + content inspection. Never trust search fetches alone for offer status.
- **Never submit applications automatically**: agents may draft, fill, and prepare answers, but they MUST stop before the final submit/apply/send action.
- **worker/batch abstraction is deferred**: this runtime contract only standardizes interactive/manual flows. Future worker parity is follow-up scope.

## Data Ownership

### User Layer

- `cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, `portals.yml`
- `data/*`, `reports/*`, `output/*`, `interview-prep/*`

These files are personalization/work-product assets and must never be overwritten by system updates.

### System Layer

- `runtime/*`, `modes/_shared.md`, `modes/*.md`, `CLAUDE.md`, `AGENTS.md`
- `.claude/*`, `.opencode/*`, `*.mjs`, `dashboard/*`, `templates/*`, `docs/*`

These files define shared system behavior and may be updated centrally.

## Adapter Rules

- Adapters must resolve routing from `runtime/modes.yml`.
- Adapters must resolve file loading from `runtime/context-loading.yml`.
- Adapters may add additive-only UX, but must preserve routing, context loading, and safeguards.
- Adapters must not duplicate business logic that already lives in `modes/*` or `CLAUDE.md`.
