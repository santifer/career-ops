# Changelog

All notable changes to JobSeeker · Career-Ops are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/).

## [1.3.0] — 2026-05-05

The "easy install + amazing onboarding" release. Career-Ops is now installable
in 60 seconds with a single command on any platform, ships a single-file
executable for users who'd rather not touch a terminal, and the 6-step
resume-driven onboarding wizard now reads as a conversation with the AI.

### Added

#### Packaging & install
- `install.sh` — bash installer with `--docker | --local | --update | --uninstall | --doctor` modes. Auto-generates `SESSION_SECRET`, copies `.env.example` to `.env`, opens the dashboard URL in your default browser, polls `/api/health` for boot.
- `install.ps1` — PowerShell mirror for native Windows install. Same UX, same modes.
- `Makefile` — 16 targets (`install`, `docker`, `docker-prod`, `local`, `start`, `stop`, `logs`, `shell`, `test`, `doctor`, `update`, `backup`, `clean`, `rebuild`, `wipe-cache`). Self-documenting via bare `make`.
- `scripts/build-exe.sh` — esbuild bundle + Node SEA pipeline that produces a single-file `career-ops.exe` (Windows) / `career-ops` (macOS, Linux) — ~88 MiB, no Node install needed by the end user.
- `scripts/launcher.mjs` — the EXE entrypoint: auto-detects free port, opens browser, finds project root, falls back to `~/CareerOps` if no project nearby.
- `scripts/publish-release.sh` — `gh repo create` + push + tag + release with EXE attached, all idempotent. Refuses to publish if it detects API keys in tracked files.
- `packaging/career-ops.service` — systemd unit with sandboxing for Linux servers / WSL2.
- `packaging/io.santifer.career-ops.plist` — launchd agent for macOS auto-start at login.
- `docker-compose.hardened.yml` — production overlay with read-only fs + capability drop + ulimits + log rotation.

#### Backend
- `GET /api/health` — lightweight liveness probe `{ ok, uptime, version, now }` with `Cache-Control: no-store`. Used by Docker `HEALTHCHECK`, the install boot probe, and external monitors.
- Pure-Node Docker `HEALTHCHECK` (replaces `wget` which isn't in `node:22-slim`).
- `tini` as the container entrypoint for proper PID-1 signal handling and zombie reaping (Playwright spawns Chromium subprocesses).

#### Onboarding UX
- Conversational subtitles on every wizard step ("Hi — let's start with your resume", "Did I get these right?", "Anything that's a hard no?", "Tell me what makes you, you", "Ready when you are"). Reads like the AI is talking to you, not a form wizard.
- Post-finalize celebration: 36 prismatic confetti dots burst from the brand mark when the user ships the wizard. Respects `prefers-reduced-motion`. Lasts ~1.4 s.
- Toast on finalize is now "Profile saved · rendering your CV — I'll handle it from here" (was "Profile saved · CV PDF generating…").

#### CI
- New `.github/workflows/release.yml`:
  - **smoke-install** matrix on Ubuntu / macOS / Windows runs `install.sh --doctor` + `npm test` + syntax-checks all shell scripts.
  - **docker-build** builds the image and probes `/api/health` from a live container.
  - **build-exe** matrix produces signed-ready binaries for the 3 platforms on every `v*` tag.
  - **publish-release** drafts a GitHub Release, attaches all binaries + a source tarball, then un-drafts.

### Changed

- **Dockerfile**: multi-layer rebuild — `npm ci` when lockfile present, env defaults for `PORT`/`HOST`, `tini` entrypoint, exposes 4747, `EXPOSE 4747`, `HEALTHCHECK` baked in (no longer requires `docker-compose.yaml` to add it).
- **docker-compose.yaml**: now exposes `4747:4747`, default command runs the dashboard (was `/bin/bash`), `restart: unless-stopped`, healthcheck via pure Node, OCI image labels.
- **package.json**: `"type": "module"`, `"engines": { "node": ">=20" }`, `"bin": { "career-ops": "dashboard-web/server.mjs" }`. New scripts: `start`, `dev` (with `--watch`), `preview` (isolated tmp dirs), `test:watch`. Bumped 1.0.0 → 1.3.0.
- **README**: new "Install in 60 seconds" section at top covers macOS / Linux / WSL / Windows / Make / curl-pipe-bash / auto-start templates. Original manual-install steps preserved as a fallback.
- **`.gitignore`**: hardened against accidental secret leaks (`.env*`, `*.pem`, `*.key`, `secrets.json`), excludes `cv.md` (PII), `data/follow-ups.md`, build artifacts (`dist/`, `*.exe`, `backups/`), worktree scratch.

### Tests

- 122 total (was 116) — 6 new integration tests for `/api/health` that boot a real server on a random port and assert the contract: status 200, JSON shape, `Cache-Control: no-store`, monotonic uptime, 20 concurrent probes < 2 s.
- `buildGmailStatus` (12) and `readJsonBody` (8) suites unchanged; all still passing.

### Security

- `scripts/publish-release.sh` includes a pre-flight scan that refuses to publish if any tracked file matches Anthropic / OpenRouter / Kimi / Google / GitHub token patterns. Belt-and-suspenders next to `.gitignore`.
- Healthcheck uses a portable Node oneliner — eliminates the need for `wget` / `curl` in the container image.

### Migration notes

If you were already running the dashboard from this repo:

1. `git pull` the latest.
2. Restart your dashboard so `/api/health` becomes available (the Docker healthcheck depends on it).
3. (Docker users) `docker compose down && docker compose up -d --build` to pick up the multi-layer Dockerfile + new healthcheck.

Your data (`cv.md`, `config/profile.yml`, `data/`, `reports/`, `interview-prep/`) is untouched by any of these changes — they live outside the system layer per `DATA_CONTRACT.md`.

[1.3.0]: https://github.com/santifer/career-ops/releases/tag/v1.3.0
