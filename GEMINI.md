# GEMINI.md — Career-Ops Project Context

## Project Overview
**Career-Ops** is an AI-powered job search command center designed to automate the evaluation of job offers, generation of tailored CVs, and tracking of applications. It is built to work seamlessly with agentic CLIs like Claude Code and Gemini CLI.

### Core Technologies
- **Node.js**: Primary execution environment for scripts (`.mjs`).
- **Go**: Powers the terminal-based dashboard TUI (`dashboard/`).
- **Playwright**: Used for job description (JD) extraction and PDF generation.
- **Markdown/YAML/TSV**: Data storage formats for CVs, configuration, and tracking.
- **Claude Code/Gemini CLI**: The agentic interface for running the pipeline.

---

## Project Structure & Data Contract

The project strictly distinguishes between the **User Layer** (personalized data) and the **System Layer** (core logic).

### User Layer (DO NOT OVERWRITE)
- `cv.md`: Canonical source of truth for the candidate's CV.
- `config/profile.yml`: Candidate identity, target roles, and location/comp preferences.
- `modes/_profile.md`: User-specific archetypes, framing, and negotiation scripts.
- `article-digest.md`: Detailed proof points and metrics from the user's portfolio.
- `data/applications.md`: The main application tracker.
- `reports/`: AI-generated evaluation reports.
- `output/`: Generated tailored PDFs.

### System Layer (Updatable Logic)
- `modes/`: Logic and prompts for different operations (e.g., `oferta.md` for evaluation).
- `*.mjs`: Automation scripts (`doctor.mjs`, `generate-pdf.mjs`, `merge-tracker.mjs`).
- `dashboard/`: Go source code for the TUI.
- `templates/`: HTML templates for CVs and state definitions.

---

## Building and Running

### Prerequisites
- Node.js >= 18
- Go (for the dashboard)
- Playwright Chromium: `npx playwright install chromium`

### Key Commands
- `npm run doctor`: Validates the local environment and setup.
- `npm run pdf`: Generates an ATS-optimized PDF from a JD and `cv.md`.
- `npm run scan`: Scans job portals configured in `portals.yml`.
- `npm run merge`: Merges temporary tracker additions (`batch/tracker-additions/`) into `data/applications.md`.
- `npm run verify`: Health check for the pipeline integrity.
- `cd dashboard && go run main.go`: Launches the TUI dashboard.

---

## Development Conventions

### Data Integrity
1. **Never edit `data/applications.md` directly for new entries.** Instead, write a TSV file to `batch/tracker-additions/` and run `npm run merge`.
2. **Read-Only Context**: Always read `cv.md` and `article-digest.md` before generating any matching content. **Never invent metrics.**
3. **Archetype Alignment**: Classify roles into defined archetypes (e.g., AI Platform, Agentic, Technical PM) and use the framing defined in `_profile.md`.

### Evaluation Standards
- Reports follow a fixed Block A-G structure.
- Global score (1-5) is based on Match, North Star alignment, Comp, and Culture.
- **Block G (Legitimacy)**: Separate qualitative assessment of whether the posting is active/ghost.

### Personalization Strategy
When asked to customize the system (e.g., "Change my target roles"), **always write to `modes/_profile.md` or `config/profile.yml`**. Avoid modifying `modes/_shared.md` as it is part of the system layer and may be updated.

---

## Operational Workflows

### 1. Onboarding
If `cv.md` or `config/profile.yml` is missing, prioritize setting these up by interviewing the user or extracting data from provided links.

### 2. Auto-Pipeline
When a job URL is provided:
1. Extract JD using Playwright.
2. Evaluate JD against `cv.md` (A-F scoring).
3. Generate a tailored PDF CV.
4. Record the entry in the tracker via TSV addition.

### 3. Ethical Use
- **Quality over Quantity**: Discourage applications with scores below 4.0/5.
- **Human-in-the-Loop**: Never submit applications automatically; only prepare the materials for user review.
