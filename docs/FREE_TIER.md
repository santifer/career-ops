# Career-Ops on the Free Tier (Gemini CLI)

career-ops works with **Gemini CLI's free tier** — no API key or paid
subscription required. This guide covers setup, limits, and trade-offs.

## Quick Start

1. Install Gemini CLI (requires Node.js 18+):

   ```bash
   npm install -g @google/gemini-cli
   ```

2. Authenticate with your Google account:

   ```bash
   gemini auth login
   ```

3. Enable free-tier mode by setting the environment variable:

   ```bash
   export GEMINI_FREE_TIER=true
   ```

   On Windows (PowerShell):

   ```powershell
   $env:GEMINI_FREE_TIER = "true"
   ```

4. Run career-ops as usual:

   ```bash
   gemini          # interactive — paste a URL, evaluate, scan, etc.
   gemini -p "..." # headless / batch mode
   ```

## Daily Limits

The free tier has daily request and token caps set by Google. Typical
limits (subject to change):

| Resource            | Approximate daily limit |
|---------------------|------------------------|
| Requests            | 1,000                  |
| Input tokens        | ~1 M                   |
| Output tokens       | ~100 K                 |

Limits reset at midnight Pacific Time. If you hit a cap the CLI returns
a rate-limit error; career-ops will pause and suggest retrying tomorrow.

## Batch Mode Behavior

- `batch-runner.sh` spawns `claude -p` workers by default (Claude Code
  specific). To use Gemini CLI workers instead, invoke them manually:

  ```bash
  gemini -p "evaluate <URL>"
  ```

- With free-tier limits, keep `--parallel 1` to avoid burning through
  your daily quota on parallel requests.
- Large batches (50+ offers) will likely span multiple days. Use
  `--start-from` to resume where you left off.

## What Works Without Paying

| Feature                 | Free tier | Notes                            |
|-------------------------|-----------|----------------------------------|
| Offer evaluation (A-F)  | ✅        | Full scoring pipeline            |
| Report generation (.md) | ✅        | Markdown reports                 |
| Portal scanning         | ✅        | Zero-token — hits APIs directly  |
| PDF generation          | ✅        | Uses local Playwright, no tokens |
| Batch processing        | ⚠️        | Limited by daily quota           |

## Upgrading

If you outgrow the free tier, you can switch to a paid Google AI plan
or use Claude Code (`claude` CLI) with a Claude Max subscription. Both
are fully supported — just remove the `GEMINI_FREE_TIER` variable and
authenticate with your preferred provider.
