# Review Loop

`review-loop.mjs` runs the local checks that should happen before asking a
human or AI reviewer to look at a career-ops change.

It is intentionally provider-neutral: it does not call Claude, Codex, Gemini,
or any other model. After the checks finish, it prints a compact reviewer
handoff prompt that can be pasted into the reviewer tool of your choice.

## Usage

```bash
npm run review
node review-loop.mjs --full
node review-loop.mjs --json
node review-loop.mjs --list
```

## Checks

- `node test-all.mjs --quick` by default, or `node test-all.mjs` with `--full`
- `git diff --check`
- `npm audit` when `package-lock.json` exists
- `go test ./...` in `dashboard/` when `--full` is used and Go files exist
- `bash -n batch/batch-runner.sh` when Bash is available

The loop exits non-zero when a required check fails.
