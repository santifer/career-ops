# Claude Code and Codex Compatibility

## Current state

This fork works well with Claude Code today and now has a real Codex batch path.

What already transfers cleanly:

- file-based sources of truth: `cv.md`, `article-digest.md`, `config/profile.yml`, `portals.yml`
- mode instructions in `modes/*.md`
- tracker/report/PDF scripts in Node
- manual evaluation, personalization, and tracker maintenance

What is still Claude-native:

- slash-command routing through `.claude/skills/career-ops/SKILL.md`
- onboarding phrasing in `CLAUDE.md`
- some slash-command ergonomics and Chrome-driven workflows

## What was added in this fork

- `AGENTS.md` so Codex has repo-native operating instructions
- personalized `cv.md`
- personalized `article-digest.md`
- personalized `config/profile.yml`
- personalized `portals.yml`
- baseline tracker and pipeline files in `data/`

## What Codex can do cleanly now

Codex can now:

- read `AGENTS.md` plus the same source-of-truth files Claude reads
- evaluate a pasted JD or job URL by following `modes/_shared.md` and `modes/auto-pipeline.md`
- update the profile, portals, and tracker files
- generate reports and run repo scripts from the shell
- run the standalone batch runner with `batch/batch-runner.sh --agent codex`

The practical difference is interface:

- Claude Code uses slash commands
- Codex should be driven by natural-language requests such as "evaluate this role", "scan these companies", or "generate a tailored resume for this JD"

## What still needs to be done for true parity

### 1. Batch parity is now functional, but not yet elegant

Current state:

- `batch/batch-runner.sh` supports `claude`, `codex`, `manual`, and `auto`
- `codex` uses `codex exec`
- `manual` prepares work packets without executing them
- `batch/batch-runner.ps1` is the preferred Codex batch path on Windows

Remaining improvement:

- move batch orchestration into Node so worker execution and JSON parsing are less shell-dependent

### 2. The batch prompt is usable, but still too monolithic

Current state:

- `batch/batch-prompt.md` is updated for the frontend/commerce target
- it works for both Claude and Codex backends

Remaining improvement:

- split shared reasoning context from output contract so the worker prompt is easier to maintain

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
2. Add Node/Playwright helpers for verification and extraction
3. Move batch orchestration from Bash to Node
4. Split the batch prompt into smaller reusable pieces

## Personalization assumptions to review

These were inferred from `life-os` and should be validated by the user:

- compensation target range in `config/profile.yml`
- minimum acceptable comp in `config/profile.yml`
- curated tracked companies in `portals.yml`
- whether `portfolio_url` should stay blank or point to a public project/site
