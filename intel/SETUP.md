# Intelligence Engine Setup Guide

Detailed instructions for configuring all components of the intelligence engine.

---

## Prerequisites

- Node.js 18+ (for career-ops scripts)
- Claude Code CLI (for running the intelligence engine)
- Homebrew (macOS) or equivalent package manager

---

## API Key Setup

Each API source provides different capabilities. Configure as many or as few as you need.

| API | Sign Up | Free Tier | Env Variable | Used For |
|-----|---------|-----------|-------------|----------|
| Exa | [exa.ai](https://exa.ai) | 1,000 searches/month | `EXA_API_KEY` | Semantic job search, similar company discovery |
| Bright Data | [brightdata.com](https://brightdata.com) | Pay-as-you-go from $0.001/req | `BRIGHTDATA_API_KEY` | LinkedIn scraping, hiring manager lookup |
| Tavily | [tavily.com](https://tavily.com) | 1,000 searches/month | `TAVILY_API_KEY` | Web search for job boards, company news |
| Firecrawl | [firecrawl.dev](https://firecrawl.dev) | 500 pages/month | `FIRECRAWL_API_KEY` | Structured extraction from job boards and career pages |
| Valyu | [valyu.network](https://valyu.network) | Usage-based pricing | `VALYU_API_KEY` | Real-time data marketplace queries |
| Parallel | [parallel.ai](https://parallel.ai) | Usage-based pricing | `PARALLEL_API_KEY` | Data enrichment and analysis |

### Setting Keys

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
# Career-Ops Intelligence Engine API Keys
export EXA_API_KEY="exa-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export BRIGHTDATA_API_KEY="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export TAVILY_API_KEY="tvly-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export FIRECRAWL_API_KEY="fc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export VALYU_API_KEY="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export PARALLEL_API_KEY="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Then reload: `source ~/.zshrc`

---

## Google Docs MCP Server Setup

The Google Docs MCP server enables Claude to create and edit Google Docs directly (for cover letters, thank-you notes, etc.).

### Step 1: Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Docs API and Google Drive API
4. Go to Credentials > Create Credentials > OAuth 2.0 Client ID
5. Application type: Desktop App
6. Download the JSON credentials file

### Step 2: Set Environment Variables

```bash
export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="your-client-secret"
export GOOGLE_REDIRECT_URI="http://localhost:3000/oauth/callback"
```

### Step 3: Authenticate

Run the MCP server once to complete the OAuth flow:

```bash
npx google-docs-mcp auth
```

This opens a browser window. Sign in with your Google account and grant access. The refresh token is stored locally.

### Step 4: Add to Claude Config

Add the Google Docs MCP server to your Claude configuration (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "google-docs": {
      "command": "npx",
      "args": ["google-docs-mcp"],
      "env": {
        "GOOGLE_CLIENT_ID": "${GOOGLE_CLIENT_ID}",
        "GOOGLE_CLIENT_SECRET": "${GOOGLE_CLIENT_SECRET}"
      }
    }
  }
}
```

### Step 5: Verify

Ask Claude: "Create a test Google Doc called 'Intel Engine Test'" -- if it works, the setup is complete.

---

## gogcli Setup

`gogcli` provides CLI access to Google Calendar and Contacts, useful for scheduling interviews and managing recruiter contacts.

### Install

```bash
brew install gogcli
```

### Authenticate

```bash
gogcli auth login
```

This opens a browser for Google OAuth. Grant access to Calendar and Contacts.

### Verify

```bash
gogcli calendar list --max 5
```

You should see your upcoming calendar events.

---

## Gemma 4 Setup (Optional)

Gemma 4 runs locally via Ollama and is used for self-improvement cycles. This avoids API costs for iterative reasoning tasks like strategy refinement and score calibration.

### Install Ollama

```bash
brew install ollama
```

### Start the Ollama Server

```bash
ollama serve
```

Leave this running in a background terminal or configure it as a launch agent.

### Pull the Gemma 4 Model

```bash
ollama pull gemma4:26b
```

This downloads approximately 16GB. The 26B parameter model provides strong reasoning at acceptable speed on Apple Silicon.

### Verify

```bash
ollama run gemma4:26b "What is the average software engineer salary in San Francisco?"
```

You should get a coherent response within a few seconds.

### Fallback Behavior

If Gemma is unavailable (Ollama not running, model not pulled), the engine automatically falls back to Claude for self-improvement tasks. Set `gemma.fallback_to_builtin: true` in `config/intel.yml` (this is the default).

---

## Verify Setup

After completing the setup, ask Claude:

> "Check my intelligence engine setup"

Claude will verify:
- Which API keys are configured and valid
- Whether Google tools are authenticated
- Whether Gemma is available locally
- Whether `config/intel.yml` exists and is properly configured

Any missing components will be flagged with instructions to fix them. The engine works with partial setup -- you do not need every component configured to start using it.
