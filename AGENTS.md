# Career-Ops -- AI Job Search Pipeline

## Origin

This system was built and used by [santifer](https://santifer.io) to evaluate 740+ job offers, generate 100+ tailored CVs, and land a Head of Applied AI role. The archetypes, scoring logic, negotiation scripts, and proof point structure all reflect his specific career search in AI/automation roles.

The portfolio that goes with this system is also open source: [cv-santiago](https://github.com/santifer/cv-santiago).

**It'll work out of the box, but it's designed to be made yours.** If the archetypes don't match your career, the modes are in the wrong language, or the scoring doesn't fit your priorities -- just ask. You (the AI) can edit any file in this system. The user says "change the archetypes to data engineering roles" and you do it. That's the whole point.

---

## Build/Lint/Test Commands

### Node.js Scripts

```bash
# Verify pipeline integrity (health check)
npm run verify              # or: node verify-pipeline.mjs

# Normalize statuses to canonical states
npm run normalize           # or: node normalize-statuses.mjs

# Remove duplicate tracker entries
npm run dedup               # or: node dedup-tracker.mjs

# Merge TSV additions into applications.md
npm run merge               # or: node merge-tracker.mjs

# Generate PDF from HTML CV
npm run pdf                 # or: node generate-pdf.mjs <input.html> <output.pdf>

# Check CV/config consistency
npm run sync-check          # or: node cv-sync-check.mjs
```

### Go Dashboard (TUI)

```bash
# Build dashboard
cd dashboard && go build -o career-dashboard .

# Run dashboard
./career-dashboard --path /path/to/career-ops

# Development
cd dashboard && go run main.go --path ..
```

### Running Single Scripts

All `.mjs` scripts are executable and can be run directly:

```bash
# Run with Node
node verify-pipeline.mjs
node merge-tracker.mjs --dry-run

# Or make executable and run directly (Unix)
chmod +x verify-pipeline.mjs
./verify-pipeline.mjs
```

**Important:** Always run `merge-tracker.mjs` after batch evaluations to prevent duplicates.

---

## Code Style Guidelines

### General Conventions

- **Language:** Node.js (ES modules `.mjs`), Go (dashboard), Markdown (data/config), YAML (config), HTML/CSS (templates)
- **Line Length:** Soft limit 120 chars for code, flexible for markdown
- **Indentation:** 2 spaces (JavaScript/YAML), tabs (Go), 2 spaces (HTML/CSS)
- **File Naming:** kebab-case for scripts (`merge-tracker.mjs`), PascalCase for Go packages

### JavaScript/Node.js (.mjs files)

#### Imports

```javascript
// Standard library first, third-party second, local third
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { chromium } from 'playwright';
```

#### Error Handling

```javascript
// Always check file existence before reading
if (!existsSync(filePath)) {
  console.log('File not found. Exiting gracefully.');
  process.exit(0);  // Use 0 for "nothing to do", 1 for errors
}

// Catch errors at top level
try {
  const content = readFileSync(filePath, 'utf-8');
} catch (err) {
  console.error(`❌ Failed: ${err.message}`);
  process.exit(1);
}
```

#### Logging Conventions

Use emoji prefixes consistently:
- `✅` Success/completion
- `❌` Errors/failures
- `⚠️` Warnings
- `📊` Statistics/summary
- `🗑️` Deletions/removals
- `➕` Additions
- `🔄` Updates/changes
- `⏭️` Skipped items
- `📄` File operations
- `📁` Directory operations

#### Types and Validation

```javascript
// Always validate parsed integers
const num = parseInt(parts[1]);
if (isNaN(num)) {
  console.warn(`⚠️ Skipping invalid entry number: ${parts[1]}`);
  continue;
}

// Always normalize strings before comparison
function normalizeCompany(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}
```

#### CLI Arguments

```javascript
// Use simple flag detection
const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY = process.argv.includes('--verify');

// Named arguments with defaults
let format = 'a4';
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--format=')) {
    format = arg.split('=')[1].toLowerCase();
  }
}
```

### Go (Dashboard)

#### Package Structure

```
dashboard/
├── main.go                    # Entry point
├── go.mod                     # Dependencies
├── internal/
│   ├── data/                  # Data layer (parsers, updaters)
│   ├── model/                 # Business logic
│   ├── theme/                 # UI theming
│   └── ui/screens/            # TUI screens
```

#### Imports

```go
// Standard library first
import (
    "flag"
    "fmt"
    "os"
)

// External packages second
import (
    tea "github.com/charmbracelet/bubbletea"
)

// Local packages third
import (
    "github.com/santifer/career-ops/dashboard/internal/data"
)
```

#### Naming Conventions

- Types: `PascalCase` (e.g., `PipelineModel`)
- Functions: `PascalCase` for exported, `camelCase` for internal
- Constants: `camelCase` for internal, `PascalCase` for exported
- Enums: `camelCase` with type prefix (e.g., `viewPipeline`)

### Markdown (Modes/Reports/Data)

#### Front Matter (Reports)

All evaluation reports follow this structure:

```markdown
**Company:** [Name]
**Role:** [Job Title]
**Score:** X.X/5 (Grade)
**URL:** https://...
**PDF:** ✅/❌ output/XXX-company-slug.pdf

---

[6-block evaluation content]
```

#### Data Files

- `data/applications.md` — Markdown table, 9 pipe-delimited columns
- `data/pipeline.md` — Simple list of URLs or `local:jds/{file}`
- `data/scan-history.tsv` — TSV format for dedup

#### Mode Files

Mode files (`modes/*.md`) are prompt templates:
- Always include `<!-- [CUSTOMIZE] -->` comments for user-editable sections
- Always read from `cv.md`, `article-digest.md`, `config/profile.yml` — NEVER hardcode metrics
- Use `**RULE:**` prefix for critical constraints
- Use tables for structured data (archetypes, comp ranges, etc.)

### YAML (Configuration)

```yaml
# Use snake_case for keys
full_name: "John Doe"
target_roles:
  - "Senior Backend Engineer"
  - "Staff Platform Engineer"

# Comments for guidance
salary:
  min: 150000  # USD, base only
  target: 180000
```

### HTML/CSS (CV Templates)

```html
<!-- Use semantic HTML5 -->
<section class="experience">
  <h2>Experience</h2>
  <div class="job">
    <h3 class="job-title">Senior Engineer</h3>
    <p class="job-company">Acme Corp</p>
  </div>
</section>

<!-- Inline critical CSS for PDF generation -->
<style>
  body { font-family: 'Space Grotesk', sans-serif; }
  .job-title { font-weight: 600; color: #1a1a1a; }
</style>
```

---

## What is career-ops

AI-powered job search automation for AI coding agents (Claude Code, OpenCode): pipeline tracking, offer evaluation, CV generation, portal scanning, batch processing.

### Main Files

| File | Function |
|------|----------|
| `data/applications.md` | Application tracker |
| `data/pipeline.md` | Inbox of pending URLs |
| `data/scan-history.tsv` | Scanner dedup history |
| `portals.yml` | Query and company config |
| `templates/cv-template.html` | HTML template for CVs |
| `generate-pdf.mjs` | Puppeteer: HTML to PDF |
| `article-digest.md` | Compact proof points from portfolio (optional) |
| `interview-prep/story-bank.md` | Accumulated STAR+R stories across evaluations |
| `reports/` | Evaluation reports (format: `{###}-{company-slug}-{YYYY-MM-DD}.md`) |

### First Run — Onboarding (IMPORTANT)

**Before doing ANYTHING else, check if the system is set up.** Run these checks silently every time a session starts:

1. Does `cv.md` exist?
2. Does `config/profile.yml` exist (not just profile.example.yml)?
3. Does `portals.yml` exist (not just templates/portals.example.yml)?

**If ANY of these is missing, enter onboarding mode.** Do NOT proceed with evaluations, scans, or any other mode until the basics are in place. Guide the user step by step:

#### Step 1: CV (required)
If `cv.md` is missing, ask:
> "I don't have your CV yet. You can either:
> 1. Paste your CV here and I'll convert it to markdown
> 2. Paste your LinkedIn URL and I'll extract the key info
> 3. Tell me about your experience and I'll draft a CV for you
>
> Which do you prefer?"

Create `cv.md` from whatever they provide. Make it clean markdown with standard sections (Summary, Experience, Projects, Education, Skills).

#### Step 2: Profile (required)
If `config/profile.yml` is missing, copy from `config/profile.example.yml` and then ask:
> "I need a few details to personalize the system:
> - Your full name and email
> - Your location and timezone
> - What roles are you targeting? (e.g., 'Senior Backend Engineer', 'AI Product Manager')
> - Your salary target range
>
> I'll set everything up for you."

Fill in `config/profile.yml` with their answers. For archetypes, map their target roles to the closest matches and update `modes/_shared.md` if needed.

#### Step 3: Portals (recommended)
If `portals.yml` is missing:
> "I'll set up the job scanner with 45+ pre-configured companies. Want me to customize the search keywords for your target roles?"

Copy `templates/portals.example.yml` → `portals.yml`. If they gave target roles in Step 2, update `title_filter.positive` to match.

#### Step 4: Tracker
If `data/applications.md` doesn't exist, create it:
```markdown
# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
```

#### Step 5: Ready
Once all files exist, confirm:
> "You're all set! You can now:
> - Paste a job URL to evaluate it
> - Run `/career-ops scan` to search portals
> - Run `/career-ops` to see all commands
>
> Everything is customizable — just ask me to change anything.
>
> Tip: Having a personal portfolio dramatically improves your job search. If you don't have one yet, the author's portfolio is also open source: github.com/santifer/cv-santiago — feel free to fork it and make it yours."

Then suggest automation:
> "Want me to scan for new offers automatically? I can set up a recurring scan every few days so you don't miss anything. Just say 'scan every 3 days' and I'll configure it."

If the user accepts, use the `/loop` or `/schedule` skill (if available) to set up a recurring `/career-ops scan`. If those aren't available, suggest adding a cron job or remind them to run `/career-ops scan` periodically.

### Personalization

This system is designed to be customized by YOU (the AI). When the user asks you to change archetypes, translate modes, adjust scoring, add companies, or modify negotiation scripts -- do it directly. You read the same files you use, so you know exactly what to edit.

**Common customization requests:**
- "Change the archetypes to [backend/frontend/data/devops] roles" → edit `modes/_shared.md`
- "Translate the modes to English" → edit all files in `modes/`
- "Add these companies to my portals" → edit `portals.yml`
- "Update my profile" → edit `config/profile.yml`
- "Change the CV template design" → edit `templates/cv-template.html`
- "Adjust the scoring weights" → edit `modes/_shared.md` and `batch/batch-prompt.md`

### Skill Modes

| If the user... | Mode |
|----------------|------|
| Pastes JD or URL | auto-pipeline (evaluate + report + PDF + tracker) |
| Asks to evaluate offer | `offer` |
| Asks to compare offers | `offers` |
| Wants LinkedIn outreach | `contact` |
| Asks for company research | `deep` |
| Wants to generate CV/PDF | `pdf` |
| Evaluates a course/cert | `training` |
| Evaluates portfolio project | `project` |
| Asks about application status | `tracker` |
| Fills out application form | `apply` |
| Searches for new offers | `scan` |
| Processes pending URLs | `pipeline` |
| Batch processes offers | `batch` |

### CV Source of Truth

- `cv.md` in project root is the canonical CV
- `article-digest.md` has detailed proof points (optional)
- **NEVER hardcode metrics** -- read them from these files at evaluation time

---

## Ethical Use -- CRITICAL

**This system is designed for quality, not quantity.** The goal is to help the user find and apply to roles where there is a genuine match -- not to spam companies with mass applications.

- **NEVER submit an application without the user reviewing it first.** Fill forms, draft answers, generate PDFs -- but always STOP before clicking Submit/Send/Apply. The user makes the final call.
- **Discourage low-fit applications.** If a score is below 3.0/5, explicitly tell the user this is a weak match and recommend skipping unless they have a specific reason.
- **Quality over speed.** A well-targeted application to 5 companies beats a generic blast to 50. Guide the user toward fewer, better applications.
- **Respect recruiters' time.** Every application a human reads costs someone's attention. Only send what's worth reading.

---

## Offer Verification -- MANDATORY

**NEVER trust WebSearch/WebFetch to verify if an offer is still active.** ALWAYS use Playwright:
1. `browser_navigate` to the URL
2. `browser_snapshot` to read content
3. Only footer/navbar without JD = closed. Title + description + Apply = active.

---

## Stack and Conventions

- Node.js (mjs modules), Playwright (PDF + scraping), YAML (config), HTML/CSS (template), Markdown (data)
- Scripts in `.mjs`, configuration in YAML
- Output in `output/` (gitignored), Reports in `reports/`
- JDs in `jds/` (referenced as `local:jds/{file}` in pipeline.md)
- Batch in `batch/` (gitignored except scripts and prompt)
- Report numbering: sequential 3-digit zero-padded, max existing + 1
- **RULE: After each batch of evaluations, run `node merge-tracker.mjs`** to merge tracker additions and avoid duplications.
- **RULE: NEVER create new entries in applications.md if company+role already exists.** Update the existing entry.

### TSV Format for Tracker Additions

Write one TSV file per evaluation to `batch/tracker-additions/{num}-{company-slug}.tsv`. Single line, 9 tab-separated columns:

```
{num}\t{date}\t{company}\t{role}\t{status}\t{score}/5\t{pdf_emoji}\t[{num}](reports/{num}-{slug}-{date}.md)\t{note}
```

**Column order (IMPORTANT -- status BEFORE score):**
1. `num` -- sequential number (integer)
2. `date` -- YYYY-MM-DD
3. `company` -- short company name
4. `role` -- job title
5. `status` -- canonical status (e.g., `Evaluated`)
6. `score` -- format `X.X/5` (e.g., `4.2/5`)
7. `pdf` -- `✅` or `❌`
8. `report` -- markdown link `[num](reports/...)`
9. `notes` -- one-line summary

**Note:** In applications.md, score comes BEFORE status. The merge script handles this column swap automatically.

### Pipeline Integrity

1. **NEVER edit applications.md to ADD new entries** -- Write TSV in `batch/tracker-additions/` and `merge-tracker.mjs` handles the merge.
2. **YES you can edit applications.md to UPDATE status/notes of existing entries.**
3. All reports MUST include `**URL:**` in the header (between Score and PDF).
4. All statuses MUST be canonical (see `templates/states.yml`).
5. Health check: `node verify-pipeline.mjs`
6. Normalize statuses: `node normalize-statuses.mjs`
7. Dedup: `node dedup-tracker.mjs`

### Canonical States (applications.md)

**Source of truth:** `templates/states.yml`

| State | When to use |
|-------|-------------|
| `Evaluated` | Report completed, pending decision |
| `Applied` | Application sent |
| `Responded` | Company responded |
| `Interview` | In interview process |
| `Offer` | Offer received |
| `Rejected` | Rejected by company |
| `Discarded` | Discarded by candidate or offer closed |
| `SKIP` | Doesn't fit, don't apply |

**RULES:**
- No markdown bold (`**`) in status field
- No dates in status field (use the date column)
- No extra text (use the notes column)
