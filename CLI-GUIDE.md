# Career-Ops CLI Guide

Complete guide for using Career-Ops without Claude Code subscription.

## Overview

**Career-Ops CLI** provides a command-line interface for job search automation that works alongside the existing Claude Code integration. Choose the interface that works best for you:

- **Claude Code** ($20/month) - Full AI assistant experience
- **CLI** (pay-as-you-go, ~$0.01-0.03/eval) - Scriptable, automation-friendly

## Quick Start

### 1. Get API Key

#### Option A: OpenRouter (Recommended)
1. Visit [https://openrouter.ai](https://openrouter.ai)
2. Sign up with Google/GitHub (free)
3. Go to **Keys** → **Create Key**
4. Copy your API key (starts with `sk-or-v1-...`)

#### Option B: Anthropic
1. Visit [https://console.anthropic.com](https://console.anthropic.com)
2. Create account and add credits
3. Copy your API key (starts with `sk-ant-...`)

### 2. Configure

```bash
cd d:\career-ops

# Save API key
echo "OPENROUTER_API_KEY=sk-or-v1-..." > .env

# Or use the CLI
career-ops config --set-api-key sk-or-v1-...
```

### 3. Verify Setup

```bash
# Check system health
career-ops doctor

# Test with a job URL
career-ops evaluate "https://jobs.company.com/123" -t "Frontend Developer"
```

### Alternative: NPM Scripts

If `career-ops` command is not found, use npm scripts:

```bash
# All commands available via npm run
npm run cli:evaluate <url> [options]
npm run cli:scan
npm run cli:job-search [options]
npm run cli:tracker [command]
npm run cli:pdf [company-slug]
npm run cli:batch <input-file>
npm run cli:apply <url>
npm run cli:contact <company>
npm run cli:deep <company>
npm run cli:training <course>
npm run cli:project <project>
npm run cli:doctor
npm run cli:add-companies [category]
```

**Windows PowerShell example:**
```powershell
npm run cli:evaluate "https://vercel.com/careers" -- -t "Senior Frontend"
```

## Commands Reference

### `career-ops evaluate <url-or-file>`

Evaluate a job offer against your CV.

**Usage:**
```bash
# Evaluate from URL
career-ops evaluate "https://jobs.greenhouse.io/vercel/jobs/123" -t "Frontend Engineer at Vercel"

# Evaluate from file
echo "Job description..." > job.txt
career-ops evaluate job.txt -t "Backend Developer at Stripe" -c "Stripe"
```

**Options:**
- `-t, --title <title>` - Job title for the report
- `-c, --company <company>` - Company name
- `-m, --model <model>` - LLM model (default: openrouter/auto)
- `-o, --output <file>` - Custom output file
- `--no-pdf` - Skip PDF generation
- `--no-tracker` - Skip adding to tracker
- `-v, --verbose` - Show detailed progress

**Output:**
- Console: Evaluation report with score
- File: `reports/{###}-{company}-{date}.md`
- Tracker: Auto-added to `data/applications.md`

**Cost:** ~$0.01-0.03 per evaluation

---

### `career-ops tracker [command]`

Manage your job application tracker.

**Subcommands:**

#### `tracker list` (default)
```bash
# List all applications
career-ops tracker

# Filter by status
career-ops tracker list --status Applied

# Sort by score
career-ops tracker list --sort score
```

#### `tracker add`
```bash
# Add new application manually
career-ops tracker add \
  -c "Google" \
  -r "Software Engineer" \
  -s 4.5 \
  --status Applied \
  --url "https://jobs.google.com/123"
```

#### `tracker update <number>`
```bash
# Update status
career-ops tracker update 42 --status Interview

# Add notes
career-ops tracker update 42 --status Rejected --notes "Position filled internally"
```

#### `tracker stats`
```bash
# Show application statistics
career-ops tracker stats
```

**Output:**
- Console: Formatted table or statistics
- File: Updates `data/applications.md`

---

### `career-ops pdf [company-slug]`

Generate ATS-optimized CV PDF.

**Usage:**
```bash
# Generate generic CV
career-ops pdf

# Generate tailored CV for specific company
career-ops pdf google

# Custom format
career-ops pdf --format Letter --output my-cv.pdf
```

**Options:**
- `-t, --template <file>` - Custom HTML template
- `-o, --output <file>` - Custom filename
- `-f, --format <format>` - A4 or Letter (default: A4)
- `--no-headless` - Show browser (debugging)

**Output:**
- File: `output/cv-{name}-{company}-{date}.pdf`

---

### `career-ops doctor`

Check system health and prerequisites.

**Usage:**
```bash
career-ops doctor
```

**Checks:**
- Node.js version
- cv.md exists
- config/profile.yml exists
- API key configured
- Playwright installed

---

### `career-ops config`

View and modify configuration.

**Usage:**
```bash
# Show current config
career-ops config --show

# Set API key
career-ops config --set-api-key sk-or-v1-...

# Set default model
career-ops config --set-model anthropic/claude-3-haiku
```

## API Providers

### OpenRouter (Recommended) - FREE TIER AVAILABLE

**🎉 Completely FREE Option:**
Use `google/gemma-4-31b-it:free` model - **$0 cost, no credit card required**

```bash
# FREE usage example
npm run cli:evaluate "https://vercel.com/careers" -- -t "Senior Frontend" -m google/gemma-4-31b-it:free
```

**Setup (Free or Paid):**
```bash
# 1. Get free API key from https://openrouter.ai
# 2. Save it
echo "OPENROUTER_API_KEY=sk-or-v1-..." > .env

# 3. Use free model (default)
=```

**Free Tier Limits:**
- ~10 requests per minute
- Rate limited but functional for job search
- No credit card required

*
### Anthropic (Alternative)

**Pros:**
- Most reliable
- Consistent quality
- Direct from provider

**Setup:**
```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
echo "DEFAULT_MODEL=claude-3-haiku-20240307" >> .env
```

## Daily Workflow

### Morning: Scan for Jobs
```bash
# Manually check portals (scan command coming soon)
# Or use existing portals.yml as checklist
```

### Evaluate Interesting Jobs
```bash
# For each job you find:
career-ops evaluate "<job-url>" -t "<Job Title>"

# Review the score and report
# If score >= 4.0, apply
```

### Track Applications
```bash
# Update status when you apply
career-ops tracker update 42 --status Applied

# Update when you hear back
career-ops tracker update 42 --status Interview
```

### Generate Tailored CVs
```bash
# Before applying, generate tailored CV
career-ops pdf <company-slug>

# Upload the PDF to application
```

## Advanced Usage

### Batch Evaluation

Create a file `jobs.txt`:
```
https://jobs.company1.com/123
https://jobs.company2.com/456
https://jobs.company3.com/789
```

Evaluate all:
```bash
while read url; do
  career-ops evaluate "$url" -v
done < jobs.txt
```

### Custom Evaluation Mode

Use different evaluation frameworks:
```bash
# Default (Spanish/English mix)
career-ops evaluate <url>

# With specific mode (if available)
career-ops evaluate <url> --mode oferta
```

### Rate Limiting

The CLI automatically respects API rate limits. To customize:
```bash
echo "RATE_LIMIT=5" >> .env  # 5 requests per minute
```

## Troubleshooting

### "No API key found"
```bash
# Check .env file
cat .env

# Should contain:
# OPENROUTER_API_KEY=sk-or-v1-...
```

### "Cannot fetch job description"
Many job sites block scraping. Workaround:
```bash
# 1. Copy job description manually
# 2. Save to file
echo "Paste job description here..." > job.txt

# 3. Evaluate file
career-ops evaluate job.txt -t "Job Title"
```

### "Rate limited"
OpenRouter free tier has limits. Solutions:
1. Wait a few minutes
2. Use different model: `-m mistralai/mistral-7b-instruct:free`
3. Upgrade to paid tier (very cheap)

### "Model not found"
Some models are temporarily unavailable. Try:
```bash
# Use auto model selection
career-ops evaluate <url> -m openrouter/auto

# Or specific known-working model
career-ops evaluate <url> -m meta-llama/llama-3.1-8b-instruct:free
```

## Environment Variables

Create `.env` file in career-ops directory:

```bash
# Required - choose one
OPENROUTER_API_KEY=sk-or-v1-...
# OR
ANTHROPIC_API_KEY=sk-ant-...

# Optional
DEFAULT_MODEL=openrouter/auto
RATE_LIMIT=10
PDF_FORMAT=A4
```

## File Structure

```
career-ops/
├── cli/                    # CLI module
│   ├── commands/
│   │   ├── evaluate.js
│   │   ├── tracker.js
│   │   └── pdf.js
│   ├── core/
│   │   ├── llm.js
│   │   ├── config.js
│   │   └── scraper.js
│   └── bin/
│       └── career-ops-cli.js
├── cv.md                   # Your CV
├── config/
│   └── profile.yml         # Your profile
├── portals.yml             # Company list
├── .env                    # API keys
├── data/
│   └── applications.md     # Tracker
├── reports/                # Evaluation reports
└── output/                 # Generated PDFs
```

## OpenRouter CLI Integration

Career-Ops CLI uses **OpenRouter API** for AI-powered job search automation. This provides a cost-effective alternative to subscription-based AI services.

### How It Works

1. **API Key Setup**: Get free API key from [openrouter.ai](https://openrouter.ai)
2. **Pay-as-you-go**: ~$0.01-0.03 per job evaluation
3. **No Subscription**: Only pay for what you use
4. **Multiple Models**: Choose from Gemma, Mistral, Llama, etc.

### Cost Comparison

| Service | Monthly Cost | Per Evaluation |
|---------|--------------|----------------|
| Claude Code | $20/month | Included |
| **OpenRouter CLI** | **~$1-5/month** | **$0.01-0.03** |
| ChatGPT Plus | $20/month | Limited |

### Available Models

- `openrouter/auto` - Best available (default)
- `google/gemma-4-31b-it:free` - Free tier
- `mistralai/mistral-7b-instruct` - Fast & cheap
- `meta-llama/llama-3-8b-instruct` - Open source

See [openrouter-commands.md](./openrouter-commands.md) for complete documentation.

## Contributing

The CLI is designed as an open addition to Career-Ops. To add new commands:

1. Create `cli/commands/<command>.js`
2. Follow existing command structure
3. Add to `cli/bin/career-ops-cli.js`
4. Document in this guide
5. Submit PR

## Support

- **Issues:** GitHub Issues
- **Documentation:** This file + README.md
- **API Docs:** https://openrouter.ai/docs

## License

Same as Career-Ops - MIT License.
