# Claude Code and Codex Compatibility

## Current state

This fork works well with Claude Code today and works partially with Codex right now.

What already transfers cleanly:

- file-based sources of truth: `cv.md`, `article-digest.md`, `config/profile.yml`, `portals.yml`
- mode instructions in `modes/*.md`
- tracker/report/PDF scripts in Node
- manual evaluation, personalization, and tracker maintenance

What is still Claude-native:

- slash-command routing through `.claude/skills/career-ops/SKILL.md`
- onboarding phrasing in `CLAUDE.md`
- `claude -p` worker orchestration in `batch/batch-runner.sh`
- some batch prompt wording in `batch/batch-prompt.md` and `modes/batch.md`

## What was added in this fork

- `AGENTS.md` so Codex has repo-native operating instructions
- personalized `cv.md`
- personalized `article-digest.md`
- personalized `config/profile.yml`
- personalized `portals.yml`
- baseline tracker and pipeline files in `data/`

## What Codex can do cleanly now

Codex can already:

- read `AGENTS.md` plus the same source-of-truth files Claude reads
- evaluate a pasted JD or job URL by following `modes/_shared.md` and `modes/auto-pipeline.md`
- update the profile, portals, and tracker files
- generate reports and run repo scripts from the shell

The practical difference is interface:

- Claude Code uses slash commands
- Codex should be driven by natural-language requests such as "evaluate this role", "scan these companies", or "generate a tailored resume for this JD"

## What still needs to be done for true parity

### 1. Replace the Claude-only batch runner

Current blocker:

- `batch/batch-runner.sh` shells out to `claude -p`

Clean fix:

- extract worker execution behind an agent-agnostic interface
- example approach: `BATCH_AGENT=claude|manual`
- `claude` mode keeps current behavior
- `manual` mode writes ready-to-run work packets that Codex can process sequentially

Better long-term fix:

- move batch orchestration into Node so worker execution can target different agents through adapters

### 2. Make the batch prompt agent-neutral

Current blocker:

- `batch/batch-prompt.md` assumes a Claude worker and contains Spanish AI-role framing from the original author's search

Clean fix:

- split it into:
  - `batch/batch-context.md`
  - `batch/batch-worker-output.md`
- keep role-specific logic in shared files instead of duplicating old AI-role assumptions

### 3. Add Codex-oriented command docs

Current blocker:

- `README.md` and `docs/SETUP.md` are still mostly Claude-first

Clean fix:

- document parallel Claude and Codex usage explicitly
- keep slash commands as Claude examples
- add natural-language equivalents for Codex

### 4. Script the onboarding checks

Current blocker:

- onboarding is described in prose inside `CLAUDE.md`

Clean fix:

- add a small `bootstrap.mjs` that:
  - checks required files
  - creates missing files from templates
  - prints next-step guidance

This helps both Claude and Codex because less core behavior lives only in prompt text.

### 5. Add scanner and verifier helpers that do not depend on agent-specific browser tools

Current blocker:

- some guidance assumes Claude's browser workflow

Clean fix:

- add Node/Playwright helper scripts for:
  - job-post verification
  - JD extraction
  - portal scanning

That makes the system more durable across Claude, Codex, and future agents.

## Recommended next implementation order

1. Add `bootstrap.mjs`
2. Refactor batch execution behind an agent adapter
3. Normalize batch prompt files around the current frontend/commerce targets
4. Add Node/Playwright helpers for verification and extraction

## Personalization assumptions to review

These were inferred from `life-os` and should be validated by the user:

- compensation target range in `config/profile.yml`
- minimum acceptable comp in `config/profile.yml`
- curated tracked companies in `portals.yml`
- whether `portfolio_url` should stay blank or point to a public project/site
