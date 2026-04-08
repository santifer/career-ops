# Career-Ops Architecture

System design and code structure documentation for the Career-Ops job search automation platform.

## Overview

Career-Ops is a modular job search automation system consisting of:
- **CLI Tool**: Node.js command-line interface with OpenRouter AI integration
- **Dashboard**: Go + Bubble Tea terminal UI for visual tracking
- **Configuration**: YAML-based profiles and tracked companies
- **AI Engine**: OpenRouter API for job evaluation and discovery

## Project Structure

```
career-ops/
├── cli/                          # Node.js CLI application
│   ├── bin/
│   │   └── career-ops-cli.js     # CLI entry point
│   ├── commands/                 # Individual command implementations
│   │   ├── add-companies.js      # AI company discovery
│   │   ├── apply.js              # Application helper
│   │   ├── batch.js              # Batch job evaluation
│   │   ├── contact.js            # LinkedIn outreach
│   │   ├── deep.js               # Company research
│   │   ├── doctor.js             # System diagnostics
│   │   ├── evaluate.js           # Single job evaluation
│   │   ├── job-search.js         # AI job search
│   │   ├── pdf.js                # Report viewer
│   │   ├── project.js            # Portfolio evaluator
│   │   ├── scan.js               # Company scanner
│   │   ├── tracker.js            # Application tracker
│   │   └── training.js           # Interview prep
│   ├── core/                     # Core utilities
│   │   ├── config.js             # Configuration loader
│   │   ├── jobsdb.js             # Jobs database
│   │   └── llm.js                # OpenRouter LLM client
│   └── utils/                    # Helper utilities
│       ├── logger.js             # Console output styling
│       └── pdf.js                 # PDF generation
├── dashboard/                    # Go terminal dashboard
│   ├── internal/
│   │   ├── data/                 # Data parsing & models
│   │   ├── theme/                # UI theming (Catppuccin)
│   │   └── ui/screens/           # Screen components
│   │       ├── commands.go       # CLI launcher (optional)
│   │       ├── mode_selector.go  # Mode selection (optional)
│   │       ├── pipeline.go       # Main pipeline view
│   │       └── viewer.go         # Report viewer
│   └── main.go                   # Dashboard entry point
├── config/                       # User configuration
│   └── profile.yml               # Target roles, skills, preferences
├── cv.md                         # User CV/resume
├── portals.yml                   # Tracked companies database
├── applications.md               # Job applications tracker
└── reports/                      # Generated PDF reports
```

## CLI Architecture

### Command Pattern

Each command follows a consistent structure:

```javascript
// cli/commands/{command-name}.js
import { Command } from 'commander';
import { logger } from '../utils/logger.js';
import { loadConfig, loadCV } from '../core/config.js';
import { LLMClient } from '../core/llm.js';

const program = new Command();

program
  .name('command-name')
  .description('What this command does')
  .option('-m, --model <model>', 'LLM model to use')
  .action(async (options) => {
    try {
      logger.section('Command Title');
      
      // 1. Load configuration
      const config = loadConfig();
      const cv = loadCV();
      
      // 2. Initialize LLM
      const llm = new LLMClient(config.apiKey, options.model, config.provider);
      
      // 3. Build AI prompt
      const prompt = buildPrompt(cv, options);
      
      // 4. Call AI
      const result = await llm.chat(prompt, { maxTokens: 4000 });
      
      // 5. Parse and display results
      const parsed = parseResult(result);
      displayResults(parsed);
      
      // 6. Save to tracker (if applicable)
      await updateTracker(parsed);
      
    } catch (error) {
      logger.error(`Command failed: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
```

### Core Components

#### 1. LLMClient (`cli/core/llm.js`)

Unified interface for OpenRouter API:

```javascript
class LLMClient {
  constructor(apiKey, model = 'openrouter/auto', provider = 'openrouter') {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = 'https://openrouter.ai/api/v1';
  }

  async chat(prompt, options = {}) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://career-ops.local',
        'X-Title': 'Career-Ops CLI'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: 'You are a career coach...' },
          { role: 'user', content: prompt }
        ],
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.7
      })
    });
    
    const data = await response.json();
    return data.choices[0].message.content;
  }
}
```

#### 2. Config Loader (`cli/core/config.js`)

Loads user configuration from multiple sources:

```javascript
function loadConfig() {
  // 1. Load .env for API keys
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
  
  // 2. Load profile.yml
  const profilePath = join(process.cwd(), 'config', 'profile.yml');
  const profile = yaml.load(readFileSync(profilePath, 'utf8'));
  
  // 3. Load portals.yml
  const portalsPath = join(process.cwd(), 'portals.yml');
  const portals = yaml.load(readFileSync(portalsPath, 'utf8'));
  
  return {
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || 'openrouter/auto',
    provider: 'openrouter',
    profile,
    portals
  };
}
```

#### 3. Logger (`cli/utils/logger.js`)

Styled console output with Chalk:

```javascript
const logger = {
  section: (text) => console.log('\n' + chalk.cyan('═'.repeat(60)) + '\n' + chalk.bold(text) + '\n' + chalk.cyan('═'.repeat(60))),
  success: (text) => console.log(chalk.green('✓'), text),
  error: (text) => console.log(chalk.red('✗'), text),
  warning: (text) => console.log(chalk.yellow('⚠'), text),
  info: (text) => console.log(chalk.blue('ℹ'), text),
  divider: () => console.log(chalk.gray('─'.repeat(60)))
};
```

## Data Flow

### 1. Job Evaluation Flow

```
User Input (URL/title)
    ↓
[evaluate command]
    ↓
Load CV + Config
    ↓
Scrape/Read Job Description
    ↓
Build AI Prompt (CV + Job)
    ↓
Call OpenRouter API
    ↓
Parse AI Response
    ↓
Display Results (Console)
    ↓
Generate PDF Report
    ↓
Update applications.md
```

### 2. AI Company Discovery Flow

```
User Input (regions)
    ↓
[add-companies ai-search]
    ↓
Load CV + Target Roles
    ↓
Build AI Prompt (CV + Regions)
    ↓
Call OpenRouter API
    ↓
Parse Company List (JSON)
    ↓
Filter Duplicates
    ↓
Interactive Confirmation
    ↓
Update portals.yml
```

### 3. Job Search Flow

```
User Input (locations, role)
    ↓
[job-search command]
    ↓
Load CV + Profile
    ↓
Build AI Prompt (CV + Search Criteria)
    ↓
Call OpenRouter API
    ↓
Parse Job Listings (JSON)
    ↓
Interactive Selection
    ↓
Optional: Auto-evaluate selected jobs
    ↓
Save to jobs-found.md (optional)
```

## AI Prompt Engineering

### Prompt Structure

All prompts follow a consistent pattern:

```
# CANDIDATE PROFILE
{CV content}
Target Roles: {from profile.yml}

# INPUT
{Job description / Search criteria / Company requirements}

# TASK
{Specific AI task}

# OUTPUT FORMAT
{Structured format: JSON, table, or list}
```

### Example: Job Evaluation Prompt

```
# CANDIDATE CV
Name: Mohamed
Experience: 5 years Frontend
Skills: React, Next.js, TypeScript

# JOB DESCRIPTION
Company: Vercel
Role: Senior Frontend Engineer
Requirements: React, Next.js, 5+ years exp

# TASK
Evaluate match between CV and job:
1. Calculate match percentage
2. Identify red flags
3. Suggest CV improvements
4. Generate talking points

# OUTPUT FORMAT
{
  "matchScore": 85,
  "redFlags": [],
  "cvGaps": ["Add Vercel-specific projects"],
  "talkingPoints": ["Next.js experience"],
  "recommendation": "Apply"
}
```

## State Management

### Configuration Files

| File | Purpose | Format |
|------|---------|--------|
| `cv.md` | User resume | Markdown |
| `config/profile.yml` | Target roles, skills | YAML |
| `portals.yml` | Tracked companies | YAML |
| `applications.md` | Job applications | Markdown table |
| `.env` | API keys | Environment |

### Applications Tracker Format

```markdown
| # | Date | Company | Role | Status | Score | PDF | Report |
|---|---|---|---|---|---|---|---|
| 1 | 2024-01-15 | Vercel | Senior Frontend | Applied | 85 | [PDF](...) | [Report](...) |
```

## Security

### API Key Handling

1. **Never commit .env**: Added to .gitignore
2. **No hardcoded keys**: Always use environment variables
3. **Local-only**: Keys stay on user's machine

### Data Privacy

- CV data processed locally
- Only job descriptions sent to OpenRouter
- No personal data stored externally

## Extension Points

### Adding New Commands

1. Create `cli/commands/{name}.js`
2. Follow command pattern (see Architecture section)
3. Add to `cli/bin/career-ops-cli.js`
4. Add npm script to `package.json`
5. Document in `openrouter-commands.md`

### Adding New AI Models

Update `llm.js` model validation:

```javascript
const VALID_MODELS = [
  'openrouter/auto',
  'google/gemma-4-31b-it:free',
  'mistralai/mistral-7b-instruct',
  // Add new models here
];
```

## Performance

### Caching Strategy

- No external caching (stateless CLI)
- PDF reports cached in `reports/` directory
- Application state in `applications.md`

### Rate Limiting

- OpenRouter: ~10 requests/minute on free tier
- Implement delays for batch operations
- Use `--delay` flag for batch commands

## Testing

### Manual Testing

```bash
# Test each command
npm run cli:doctor
npm run cli:evaluate <test-url>
npm run cli:scan -- --dry-run
npm run cli:add-companies ai-search
```

### Integration Testing

- Test with different CV formats
- Test with various job descriptions
- Verify PDF generation
- Check tracker updates

## Deployment

### Local Usage

```bash
# Clone repo
git clone <repo>
cd career-ops

# Install dependencies
npm install

# Configure
npm run cli:doctor

# Start using
npm run cli:evaluate <job-url>
```

### Distribution

- No build step required
- Pure Node.js + dependencies
- Cross-platform (Windows/Mac/Linux)

## Monitoring

### Logging Levels

- `logger.section()` - Major sections
- `logger.success()` - Successful operations
- `logger.error()` - Failures
- `logger.warning()` - Non-critical issues
- `logger.info()` - General information

### Error Handling

All commands use try-catch with user-friendly error messages:

```javascript
try {
  // Command logic
} catch (error) {
  logger.error(`Command failed: ${error.message}`);
  if (options.verbose) {
    console.error(error.stack);
  }
  process.exit(1);
}
```

---

*Architecture documentation for Career-Ops v1.0*
