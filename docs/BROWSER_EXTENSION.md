# Browser Extension + Local Bridge

This workflow lets you evaluate a job posting directly from Chrome without duplicating the existing career-ops pipeline. The extension captures the active tab, sends the page to a local bridge on `127.0.0.1`, and the bridge writes the same report and tracker artifacts used by the CLI flow.

## What It Includes

- `extension/`: Chrome Manifest V3 popup, background worker, and page extraction logic
- `bridge/`: local Fastify companion with health, liveness, evaluate, jobs, stream, tracker, reports, and merge endpoints
- Shared contracts in `bridge/src/contracts/*` and re-exported types in the extension

## Prerequisites

- Root dependencies installed: `npm install`
- Bridge dependencies installed: `npm --prefix bridge install`
- Extension dependencies installed: `npm --prefix extension install`
- Playwright Chromium installed if you want live liveness checks: `npx playwright install chromium`
- For `CAREER_OPS_BRIDGE_MODE=real`: Claude Code CLI on `PATH`
- For `CAREER_OPS_BRIDGE_MODE=sdk`: `ANTHROPIC_API_KEY` in the environment

## Verify Everything

From the repo root:

```bash
npm run verify
```

That now runs the existing tracker integrity checks plus:

- `bridge`: tests + typecheck
- `extension`: typecheck + build

## Start the Bridge

The repo root now exposes short aliases so you do not have to type env vars by hand.

Typical Codex flow:

```bash
npm run ext:start
```

That does two things from the repo root:

- builds `extension/dist`
- starts the bridge in `real / codex` mode

Other common shortcuts:

```bash
npm run ext:build
npm run ext:bridge
npm run ext:bridge:claude
npm run ext:bridge:fake
ANTHROPIC_API_KEY=... npm run ext:bridge:sdk
```

If you want a simple macOS picker instead of remembering commands:

```bash
npm run ext:launcher
```

That opens a native dialog where you can choose build/start actions.

The new default action is `Desktop launchpad (Codex)`, which will:

- start `npm run ext:start` in Terminal
- reveal `extension/dist` in Finder
- open `chrome://extensions` in Chrome

The first screen is now intentionally short:

- `Desktop launchpad (Codex)`
- `Desktop launchpad (Claude)`
- `Advanced tools…`

Less common maintenance actions live under `Advanced tools…` so the main launcher stays clean.

Default mode is `fake`, which is safe for UI and integration testing.

```bash
npm --prefix bridge run start
```

Optional modes:

```bash
CAREER_OPS_BRIDGE_MODE=real npm --prefix bridge run start
CAREER_OPS_BRIDGE_MODE=real CAREER_OPS_REAL_EXECUTOR=codex npm --prefix bridge run start
CAREER_OPS_BRIDGE_MODE=sdk ANTHROPIC_API_KEY=... npm --prefix bridge run start
```

The raw commands above still work; the root aliases are just shorter wrappers around them.

Bridge notes:

- Binds to `127.0.0.1:47319` by default
- Generates or reuses `bridge/.bridge-token`
- Rejects requests without `x-career-ops-token`
- Refuses to boot `sdk` mode unless `ANTHROPIC_API_KEY` is present
- `real` mode defaults to `claude`; set `CAREER_OPS_REAL_EXECUTOR=codex` to run the same bridge flow through `codex exec`

Quick health check:

```bash
curl -s -H "x-career-ops-token: $(cat bridge/.bridge-token)" http://127.0.0.1:47319/v1/health
```

## Build and Load the Extension

```bash
npm run ext:build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click `Load unpacked`
4. Select `extension/dist`

The popup will ask for the bridge token on first use. Paste the contents of `bridge/.bridge-token`.

## Typical Flow

1. Start the bridge locally
2. Open a job posting in Chrome
3. Open the extension popup
4. Confirm the bridge is healthy
5. Run liveness or evaluation
6. Open the generated report or tracker output from the popup

Artifacts still land in the normal career-ops locations:

- reports: `reports/*.md`
- tracker additions: `batch/tracker-additions/*.tsv`
- merged tracker: `data/applications.md` after running merge

## Mode Guidance

- `fake`: best for UI work, popup QA, and contract-level smoke tests
- `real`: best when you want the bridge to reuse the checked-in career-ops pipeline with a real CLI agent
- `real` + `CAREER_OPS_REAL_EXECUTOR=claude`: uses `claude -p` and preserves the existing behavior
- `real` + `CAREER_OPS_REAL_EXECUTOR=codex`: uses `codex exec` as a CLI wrapper around the same batch prompt and artifact flow
- `sdk`: best when you want direct Anthropic API calls without spawning the Claude CLI

## Current Limits

- The extension does not submit applications
- The bridge writes tracker TSV additions, not direct tracker merges
- `sdk` mode returns report + tracker TSV, but currently does not generate PDFs
- `sdk` mode should be treated as code-complete but still lightly validated compared with the `real` path
- `real` + Codex is the fastest integration path; it reuses the existing prompt/output contract but has not been hardened to the same degree as the long-standing Claude path

## Troubleshooting

- `UNAUTHORIZED`: token in the popup does not match `bridge/.bridge-token`
- `BRIDGE_NOT_READY`: required local files like `cv.md` or `config/profile.yml` are missing
- `RATE_LIMITED`: the bridge allows 3 evaluations per minute
- Health works but evaluation fails in `sdk` mode: verify `ANTHROPIC_API_KEY`
- Health works but `real` mode fails: verify the `claude` CLI is installed and on `PATH`
- Health works but `real` + Codex fails: verify the `codex` CLI is installed, authenticated, and on `PATH`
