# OpenRouter CLI Commands Documentation

Complete reference for Career-Ops CLI commands powered by OpenRouter AI API.

## Overview

Career-Ops CLI uses **OpenRouter API** to provide AI-powered job search automation. All commands leverage LLM models (Google Gemma, Mistral, Llama, etc.) through OpenRouter's unified API.

**🎉 FREE TIER AVAILABLE** - Use `google/gemma-4-31b-it:free` model at **$0 cost**

## Quick Start (Free)

```bash
# 1. Get free API key from openrouter.ai (no credit card required)
# 2. Use free model - zero cost!
npm run cli:evaluate "https://vercel.com/careers" -- -t "Senior Frontend" -m google/gemma-4-31b-it:free
```

## Setup

### 1. Get OpenRouter API Key

1. Visit [https://openrouter.ai](https://openrouter.ai)
2. Sign up with Google/GitHub (free)
3. Go to **Keys** → **Create Key**
4. Copy your API key (starts with `sk-or-v1-...`)

### 2. Configure API Key

```bash
cd d:\career-ops

# Save API key
echo "OPENROUTER_API_KEY=sk-or-v1-..." > .env

# Or configure via CLI
career-ops config --set-api-key sk-or-v1-...
```

### 3. Verify Setup

```bash
# Check system health
npm run cli:doctor

# Test with a job evaluation
npm run cli:evaluate "https://vercel.com/careers" -- -t "Senior Frontend"
```

## Available Commands

### 1. `evaluate` - Job Evaluation

**Purpose**: Analyze a job posting against your CV using AI

**How it works**:
- Sends your CV + job description to OpenRouter
- AI compares requirements with your experience
- Generates match score (0-100) and detailed analysis
- Creates PDF report and updates tracker

**Usage**:
```bash
# Evaluate from URL
npm run cli:evaluate "https://jobs.company.com/123" -t "Frontend Developer"

# Evaluate from file
echo "Job description..." > job.txt
npm run cli:evaluate job.txt -t "Backend Developer"

# With custom model
npm run cli:evaluate "https://jobs.company.com/123" -- -m openrouter/auto
```

**AI Prompt Structure**:
```
CV Content: [Your cv.md content]
Job Description: [Scraped or provided job text]

Analyze:
1. Match percentage based on skills alignment
2. Red flags (unrealistic requirements, vague descriptions)
3. CV tailoring suggestions
4. Talking points for interviews
```

**Output**:
- Console report with score
- PDF report saved to `reports/`
- Entry added to `applications.md` tracker

---

### 2. `scan` - Company Scanner

**Purpose**: Check all tracked companies for new job postings

**How it works**:
- Reads `portals.yml` for company list
- Uses web search to find jobs at each company
- Filters by your target roles (from `profile.yml`)
- Presents results in interactive table
- Can evaluate selected jobs immediately

**Usage**:
```bash
# Interactive scan
npm run cli:scan

# With specific model
npm run cli:scan -- -m google/gemma-4-31b-it:free
```

**AI Integration**:
- Uses web search results as context
- AI ranks jobs by relevance to your CV
- Shows match scores for each posting

---

### 3. `add-companies` - AI Company Discovery

**Purpose**: Discover companies matching your CV using AI

**How it works**:
- Analyzes your CV for skills and experience
- AI searches for companies in selected regions
- Filters by: UAE, Saudi, Egypt, Europe, Remote, etc.
- Prevents duplicates (case-insensitive check)
- Adds to `portals.yml` for tracking

**Usage**:
```bash
# Interactive AI search
npm run cli:add-companies

# Direct AI search mode
npm run cli:add-companies ai-search

# Add predefined packs
npm run cli:add-companies gulf      # 18 Gulf/MENA companies
npm run cli:add-companies startups  # 40 startup companies
npm run cli:add-companies remote    # 30 remote-friendly companies
```

**AI Prompt**:
```
CV: [Your cv.md]
Target Roles: [From profile.yml]
Regions: UAE, Saudi, Egypt, Remote

Find 10-15 real companies that:
1. Match the candidate's skills
2. Have active tech hiring
3. Are in specified regions
4. Offer good career growth

Output JSON format with: name, careers_url, notes, region
```

**Features**:
- Smart duplicate detection
- Region filtering
- Match scoring based on CV keywords
- Interactive confirmation before adding

---

### 4. `job-search` - AI Job Search

**Purpose**: Find specific job openings matching your profile

**How it works**:
- Reads your CV and target roles
- AI searches for actual job postings
- Filters by location preferences
- Returns specific job titles, companies, URLs
- Can auto-evaluate selected jobs

**Usage**:
```bash
# Search remote jobs
npm run cli:job-search

# Search specific regions
npm run cli:job-search -- -l "UAE,Saudi,Egypt"

# Search specific role
npm run cli:job-search -- -r "Senior Frontend Engineer" -l "Germany,Remote"

# Save results to file
npm run cli:job-search -- -s
```

**AI Prompt**:
```
CV: [Your cv.md]
Target Roles: Frontend Developer, React Engineer
Locations: Remote, UAE, Germany

Find 10-15 current job openings:
- Real positions at real companies
- Match candidate's experience level
- Include direct application URLs
- Explain why each matches

Output JSON: title, company, location, url, match_reason, action
```

**Output**:
```
📋 JOB OPPORTUNITIES

┌─ Job 1: Senior Frontend Engineer
│  🏢 Company: Careem
│  📍 Location: Dubai, UAE
│  🔗 URL: https://careem.com/careers/senior-frontend
│  📝 Why it matches: React/Next.js skills from CV
│  💡 Action: Apply directly - strong match
```

---

### 5. `tracker` - Application Management

**Purpose**: View and manage job applications

**Usage**:
```bash
# Show status
npm run cli:tracker

# Generate report
npm run cli:tracker -- --report

# Export to CSV
npm run cli:tracker -- --export
```

---

### 6. `deep` - Company Research

**Purpose**: Deep research on a company for interview prep

**How it works**:
- AI analyzes company website, culture, tech stack
- Generates comprehensive research report
- Includes: Overview, Culture, Recent News, Tech Stack, Interview Questions

**Usage**:
```bash
npm run cli:deep "Vercel"
npm run cli:deep "Stripe" -- -r "Frontend Engineer"
```

---

### 7. `batch` - Batch Evaluation

**Purpose**: Evaluate multiple jobs from a file

**Usage**:
```bash
npm run cli:batch jobs-to-evaluate.txt
```

---

### 8. `apply` - Application Assistant

**Purpose**: Generate application materials

**Usage**:
```bash
npm run cli:apply "https://jobs.company.com/123"
```

---

### 9. `contact` - Outreach Assistant

**Purpose**: Generate LinkedIn connection messages

**Usage**:
```bash
npm run cli:contact "Company Name"
```

---

### 10. `training` - Interview Prep

**Purpose**: Generate study plans for skill gaps

**Usage**:
```bash
npm run cli:training "System Design"
```

---

### 11. `project` - Portfolio Builder

**Purpose**: Evaluate portfolio projects

**Usage**:
```bash
npm run cli:project "My React App"
```

---

### 12. `pdf` - Report Viewer

**Purpose**: Open generated PDF reports

**Usage**:
```bash
npm run cli:pdf "company-slug"
```

---

### 13. `doctor` - System Check

**Purpose**: Verify CLI configuration

**Usage**:
```bash
npm run cli:doctor
```

**Checks**:
- API key configuration
- cv.md exists and is valid
- portals.yml structure
- Required directories

---

## Models Available

Change model with `-m` flag:

| Model | Description | Cost |
|-------|-------------|------|
| `openrouter/auto` | Best available (default) | ~$0.02 |
| `google/gemma-4-31b-it:free` | Google's Gemma (free tier) | $0 |
| `mistralai/mistral-7b-instruct` | Mistral 7B | ~$0.01 |
| `meta-llama/llama-3-8b-instruct` | Llama 3 | ~$0.01 |

**Example**:
```bash
npm run cli:evaluate "https://..." -- -m google/gemma-4-31b-it:free
```

---

## File Structure

```
career-ops/
├── cli/
│   ├── commands/           # All CLI command implementations
│   │   ├── evaluate.js     # Job evaluation
│   │   ├── scan.js         # Company scanner
│   │   ├── add-companies.js # AI company discovery
│   │   ├── job-search.js   # AI job search
│   │   ├── tracker.js      # Application tracker
│   │   ├── deep.js         # Company research
│   │   ├── batch.js        # Batch processing
│   │   ├── apply.js        # Application helper
│   │   ├── contact.js      # Outreach helper
│   │   ├── training.js     # Interview prep
│   │   ├── project.js      # Portfolio evaluator
│   │   ├── pdf.js          # PDF viewer
│   │   └── doctor.js       # System check
│   ├── core/               # Core utilities
│   │   ├── config.js       # Config loading
│   │   ├── llm.js          # OpenRouter API client
│   │   └── jobsdb.js       # Jobs database
│   ├── utils/              # Utilities
│   │   ├── logger.js       # Console output
│   │   └── pdf.js          # PDF generation
│   └── bin/
│       └── career-ops-cli.js  # CLI entry point
├── cv.md                   # Your CV
├── portals.yml             # Tracked companies
├── applications.md         # Application tracker
└── config/
    └── profile.yml         # Target roles & settings
```

---

## How It Works (Technical)

### LLMClient Class (`cli/core/llm.js`)

All commands use the `LLMClient` to call OpenRouter:

```javascript
const llm = new LLMClient(apiKey, model, provider);

// Send prompt
const result = await llm.chat(prompt, {
  maxTokens: 4000,
  temperature: 0.7
});
```

### Prompt Building

Each command builds specialized prompts:

**evaluate**: CV + Job → Match analysis
**scan**: Companies + Target roles → Job listings
**add-companies**: CV + Regions → Company discovery
**job-search**: CV + Locations → Specific jobs

### Response Parsing

AI returns structured responses (JSON or markdown tables):

```javascript
// Example: job-search response parsing
function parseJobResults(result) {
  // Try JSON extraction first
  const jsonMatch = result.match(/\[\s\S]*\]/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  // Fallback to manual extraction
}
```

---

## Windows PowerShell Tips

Use `--` to separate npm args from command args:

```powershell
# Correct
npm run cli:evaluate "https://..." -- -t "Title" -m openrouter/auto

# Full example
npm run cli:job-search -- -l "UAE,Saudi" -r "Frontend" -s
```

---

## Troubleshooting

### "No companies discovered by AI"
- Check your cv.md has content
- Verify OPENROUTER_API_KEY is set
- Try different regions

### "API Error"
- Verify API key format: `sk-or-v1-...`
- Check OpenRouter dashboard for credits
- Try a different model

### "Command not found"
Use npm scripts instead:
```bash
npm run cli:evaluate "..."
```

---

## Cost Estimation

| Command | Avg Tokens | Cost |
|---------|-----------|------|
| evaluate | ~2000 | $0.01-0.02 |
| scan | ~3000 | $0.02-0.03 |
| add-companies | ~2500 | $0.02 |
| job-search | ~3000 | $0.02-0.03 |
| deep | ~4000 | $0.03-0.04 |

**Monthly estimate**: 50 evaluations = ~$1.00

---

*Generated for Career-Ops OpenRouter CLI*
