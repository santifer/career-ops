# Career-Ops Intelligence Engine

An OSINT-powered intelligence layer for career-ops that automates prospect discovery, company research, hiring manager identification, outreach drafting, and continuous self-improvement.

---

## Quick Start

### 1. Set API Keys

Add the following environment variables to your shell profile (`.zshrc`, `.bashrc`, or `.env`):

```bash
export EXA_API_KEY="your-exa-key"
export BRIGHTDATA_API_KEY="your-brightdata-key"
export TAVILY_API_KEY="your-tavily-key"
export FIRECRAWL_API_KEY="your-firecrawl-key"
export VALYU_API_KEY="your-valyu-key"
export PARALLEL_API_KEY="your-parallel-key"
```

Not all keys are required. The engine gracefully degrades when a source is unavailable.

### 2. Install Google Tools (Optional)

For Gmail monitoring, Google Docs cover letter generation, and push-sync to Google Sheets:

```bash
# Google Docs MCP — follow OAuth setup in SETUP.md
# gogcli — Google Calendar & Contacts CLI
brew install gogcli
gogcli auth login

# gws CLI — push operations (Sheets, Drive, Gmail send)
brew install googleworkspace-cli
gws auth setup
gws auth login
```

### 3. Install Gemma 4 (Optional)

For local self-improvement reasoning without API costs:

```bash
brew install ollama
ollama pull gemma4:26b
```

The engine falls back to Claude if Gemma is unavailable.

### 4. Tell Claude "set up the intelligence engine"

Claude will copy `config/intel.example.yml` to `config/intel.yml`, verify your API keys, and run the first scan.

### 5. Done

The engine is ready. It will run on the schedules defined in `config/intel.yml` and learn from every interaction.

---

## Commands

| Command | What It Does |
|---------|-------------|
| Paste a job URL | Full pipeline: evaluate, score, generate report and PDF, update tracker |
| `/career-ops prospect` | Discover new job postings across all configured boards and portals |
| `/career-ops outreach [company]` | Research hiring manager and draft personalized outreach |
| `/career-ops intel` | Generate an intelligence briefing with prospects, signals, and trends |
| `/career-ops improve` | Run a self-improvement cycle: calibrate scores, refine strategy, update prompts |
| `/career-ops osint [company]` | Deep OSINT research on a specific company (funding, team, tech stack, culture) |
| `/career-ops sync` | Bidirectional sync: push tracker updates to Google Sheets, pull recruiter responses from Gmail |

### Google Sync

The engine supports bidirectional sync with Google Workspace when `gws` is installed:

- **Push**: New evaluations and status changes are written to the configured tracking spreadsheet (`google.tracking_sheet_id` in `intel.yml`) via `gws sheets`.
- **Pull**: Gmail is polled on the `gmail_monitor` schedule for recruiter responses matching `gmail_recruiter_patterns`. Matching threads update the tracker status automatically.
- **Cover Letters**: Generated docs are saved to the configured Drive folder (`google.cover_letter_folder_id`) via the Google Docs MCP server.

All three tools are optional and independent. The engine degrades gracefully when any is unavailable.

---

## How It Learns

The intelligence engine has five feedback loops that compound over time:

1. **Score Calibration** — compares predicted scores against actual outcomes (did you apply? get an interview? receive an offer?) and adjusts scoring weights in the strategy ledger.

2. **Strategy Refinement** — promotes hypotheses to guiding principles or cautionary principles after gathering enough evidence (n >= 10 data points across 3+ industries).

3. **Voice Profiling** — observes how you edit outreach drafts and cover letters, extracts writing rules, and applies them to future drafts so they sound like you wrote them.

4. **Outreach Optimization** — tracks response rates by channel, message style, and timing. Shifts strategy toward what gets replies.

5. **Market Awareness** — monitors salary trends, demand shifts, and hiring signals to keep evaluations grounded in current market conditions.

---

## Architecture

```
intel/
  sources/          # API source modules (Exa, Bright Data, Tavily, Firecrawl, Valyu, Parallel)
  pipelines/        # Orchestration pipelines (prospect, outreach, research, improve)
  self-improve/     # Self-improvement cycle logic
    prompts/        # Prompt templates for calibration and strategy refinement
  schedules/        # Schedule runners and cron configuration
  market/           # Market intelligence files (per-country)
  templates/        # Output templates (HM reports, outreach drafts, briefings)
  orchestrator.mjs  # Top-level pipeline coordinator — routes commands to pipelines
  engine.mjs        # Setup checker — validates config, APIs, Gemma, gogcli, gws
  wiring.mjs        # Outcome recording, draft diffing, voice pattern extraction
  router.mjs        # Command router — maps user intent to pipeline
config/
  intel.yml         # Runtime configuration (copied from intel.example.yml)
  strategy-ledger.md    # Learned principles and calibration log
  voice-profile.md      # User writing style profile
```

### Orchestrator Flow

```
User command
    │
    ▼
router.mjs — parse intent
    │
    ▼
orchestrator.mjs — coordinate pipeline
    ├─► sources/      — fetch data (Exa, Tavily, BrightData, …)
    ├─► pipelines/    — prospect / outreach / research / improve
    ├─► wiring.mjs    — record outcomes, diff drafts, update voice profile
    └─► Google Sync   — gws (Sheets push), Gmail poll, Docs MCP
```

For the full system specification, see the project documentation.
