# GitHub Actions Daily Scan Setup

This setup runs the scanner daily at **8:00 PM IST** without your laptop.

## What was added

- Workflow: `.github/workflows/daily-scan.yml`

## What this automation does

1. Starts on schedule (or manual run).
2. Restores prior scan state (pipeline + scan history) from Actions cache.
3. Ensures required runtime files exist.
4. Runs `node scan.mjs`.
5. Uploads scan output + data files as artifacts.

## Required GitHub Secrets

Add these in: `Repo Settings -> Secrets and variables -> Actions -> New repository secret`

1. `CAREER_OPS_PROFILE_YML` (optional, full YAML content of your `config/profile.yml`)
2. `CAREER_OPS_PORTALS_YML` (optional, full YAML content of your `portals.yml`)

If profile/portals secrets are not provided, the workflow falls back to example templates.

## Run once manually

1. Open `Actions` tab in GitHub.
2. Select `Daily Scan`.
3. Click `Run workflow`.

## Important limitation

This workflow runs the **scanner** (`scan.mjs`) automatically.  
Full `/career-ops pipeline` evaluation is agent-driven and not available as a plain non-interactive CI script in this repo.

