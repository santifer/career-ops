# Complete File Reference

This is the exhaustive inventory of every file in the Career-Ops repository. It explains what each file does, when to read or edit it, how files depend on one another, and which layer (user or system) each file belongs to.

**Use this when you need to:**
- Understand the structure and purpose of a specific file
- Trace how data flows through the system
- Know whether a file is safe to edit or auto-updated
- Find which files to modify for a particular task
- Understand dependencies between components

---

## Root Files — Policy & Entry Points

These files define governance, agent behavior, data ownership, and the main entry point.

### `README.md`
- **Purpose:** Primary repository overview; introduces Career-Ops, capabilities, quick-start, and main commands
- **Category:** Documentation
- **Layer:** System
- **Read when:** You are new to the project and need the 30-second elevator pitch
- **Write when:** Product messaging or top-level feature list changes
- **Depends on:** `docs/SETUP.md`, `docs/ARCHITECTURE.md`, `docs/CUSTOMIZATION.md`
- **Feeds into:** `docs/README.md` (contributor guide entry point)

### `README.es.md`
- **Purpose:** Spanish-language version of README.md
- **Category:** Documentation (localized)
- **Layer:** System
- **Read when:** You are targeting Spanish-language users
- **Write when:** Spanish translation of major README updates needed
- **Depends on:** `README.md` (source text), `modes/esp/*`
- **Feeds into:** Spanish onboarding flows

### `CLAUDE.md`
- **Purpose:** Main agent operating guide; defines core workflow, update checks, onboarding rules, routing, data-contract rules, and mode behavior
- **Category:** Agent instructions
- **Layer:** System
- **Read when:** You need the highest-level source of truth for how agents should behave in this repo
- **Write when:** Updating agent logic, onboarding flow, routing decisions, or system-wide rules
- **Depends on:** `DATA_CONTRACT.md`, `modes/*`, `config/profile.yml`, `modes/_profile.md`, `portals.yml`, `update-system.mjs`
- **Feeds into:** All agent workflows

### `AGENTS.md`
- **Purpose:** Codex-specific agent instructions; points to CLAUDE.md and docs/CODEX.md
- **Category:** Agent instructions
- **Layer:** System
- **Read when:** Using Codex (not Claude Code) with this repository
- **Write when:** Codex-specific behavior or routing changes
- **Depends on:** `CLAUDE.md`, `docs/CODEX.md`, `modes/*`
- **Feeds into:** Codex execution

### `DATA_CONTRACT.md`
- **Purpose:** File ownership policy; separates user-layer from system-layer files so updates don't overwrite user data
- **Category:** Policy
- **Layer:** System
- **Read when:** Deciding where to make a change (user-specific vs shared code)
- **Write when:** File ownership rules change
- **Depends on:** None
- **Feeds into:** `CLAUDE.md`, `AGENTS.md`, `docs/CUSTOMIZATION.md`, all edit decisions

### `CONTRIBUTING.md`
- **Purpose:** Contribution workflow; explains how to propose changes, prepare PRs, and test major system components
- **Category:** Governance
- **Layer:** System
- **Read when:** You want to contribute code, prompts, docs, or translations
- **Write when:** Process or requirements change
- **Depends on:** `docs/SETUP.md`, `docs/ARCHITECTURE.md`
- **Feeds into:** GitHub PR reviews and CI/CD checks

### `LEGAL_DISCLAIMER.md`
- **Purpose:** Privacy, platform, acceptable-use, and liability boundaries
- **Category:** Legal
- **Layer:** System
- **Read when:** Assessing compliance or contribution boundaries
- **Write when:** Terms or disclaimers change
- **Depends on:** None
- **Feeds into:** User safety and legal compliance

### `LICENSE`
- **Purpose:** MIT license terms
- **Category:** Legal
- **Layer:** System
- **Read when:** Questions about open-source usage and permissions
- **Write when:** License terms change (rare)
- **Depends on:** None
- **Feeds into:** Legal compliance

### `CITATION.cff`
- **Purpose:** Citation metadata in CFF format (for academic/research use)
- **Category:** Metadata
- **Layer:** System
- **Read when:** Citing the project in academic work
- **Write when:** Version or authorship changes
- **Depends on:** Package metadata
- **Feeds into:** Academic citations and publication metadata

---

## Configuration Layer (`/config/` and root level)

User-specific settings, profiles, and working files. **User-layer files: NEVER overwritten by updates.**

### `config/profile.example.yml`
- **Purpose:** Template for user profile (role targets, preferences, location, timezone, compensation targets)
- **Category:** Configuration template
- **Layer:** System template
- **Read when:** Setting up the system for the first time
- **Write when:** Changing profile template structure or defaults
- **Depends on:** None
- **Feeds into:** `config/profile.yml` (user's actual profile)

### `config/profile.yml`
- **Purpose:** User's personalized profile (name, location, target roles, salary preferences, timezone)
- **Category:** Configuration
- **Layer:** User
- **Read when:** You need the user's personal context (location, roles, preferences)
- **Write when:** User asks to update their profile or preferences
- **Depends on:** `config/profile.example.yml` (template source)
- **Feeds into:** `modes/pdf.md`, `modes/offer.md`, all evaluation workflows

### `config/portals.yml`
- **Purpose:** Portal configuration for job scanning (legacy; see `portals.yml` below)
- **Category:** Configuration
- **Layer:** User
- **Read when:** Setting up which job boards to scan
- **Write when:** Adding/removing job boards or search keywords
- **Depends on:** `templates/portals.example.yml`
- **Feeds into:** `modes/scan.md`, `scan.mjs`

### `portals.yml`
- **Purpose:** Primary portal configuration (45+ pre-configured companies, search keywords, filtering rules)
- **Category:** Configuration
- **Layer:** User
- **Read when:** Customizing which job boards/companies to scan and what keywords to use
- **Write when:** User adds/removes portals or changes search filters
- **Depends on:** `templates/portals.example.yml`
- **Feeds into:** `scan.mjs`, `modes/scan.md`

### `cv.md`
- **Purpose:** User's canonical CV in clean markdown (experience, education, skills, projects)
- **Category:** Source content
- **Layer:** User
- **Read when:** You need the user's professional background (experience, skills, achievements)
- **Write when:** User's background, skills, or achievements change
- **Depends on:** `examples/cv-example.md` (format reference)
- **Feeds into:** `modes/pdf.md`, `generate-pdf.mjs`, `modes/interview-prep.md`, all evaluation and PDF workflows

### `article-digest.md`
- **Purpose:** Compact proof points and achievements from the user's portfolio (optional)
- **Category:** Source content
- **Layer:** User
- **Read when:** You need detailed accomplishments or measurable results to inject into evaluations
- **Write when:** User updates portfolio or wants proof points available for CVs
- **Depends on:** User's portfolio or achievements
- **Feeds into:** `modes/pdf.md`, proof-point injection in evaluations

---

## Modes System (`/modes/`)

Prompt-based workflows that drive evaluation, application, scanning, and localization. The heart of the product.

### `modes/README.md`
- **Purpose:** Index and guide to the modes system; explains structure, when to use which mode, and localization strategy
- **Category:** Documentation
- **Layer:** System
- **Read when:** You need to understand how the prompt system is organized
- **Write when:** Modes structure or routing changes
- **Depends on:** All mode files
- **Feeds into:** `docs/FILE_MAP.md`, contributor onboarding

### `modes/_shared.md`
- **Purpose:** Shared foundation for all modes; defines scoring logic, evaluation blocks (A–F), reusable instructions, and common rules
- **Category:** Mode (shared foundation)
- **Layer:** System
- **Read when:** You are changing system-wide evaluation behavior or scoring
- **Write when:** Evaluation logic, scoring weights, or blocks change
- **Depends on:** None (foundational)
- **Feeds into:** All root modes (`offer.md`, `apply.md`, `scan.md`, etc.) and all localized `_shared.md` variants

### `modes/_profile.template.md`
- **Purpose:** Starter template for user's customization layer (archetypes, narrative, deal-breakers, proof points)
- **Category:** Mode (user customization template)
- **Layer:** System template
- **Read when:** Setting up user customization for the first time
- **Write when:** Customization template structure changes
- **Depends on:** `modes/_shared.md`
- **Feeds into:** `modes/_profile.md` (user's actual customization)

### `modes/_profile.md`
- **Purpose:** User's personal customizations (archetypes, role narrative, proof points, deal-breakers, scoring weights override)
- **Category:** Mode (user customization)
- **Layer:** User
- **Read when:** You need user-specific evaluation context (their priorities, deal-breakers, proof points)
- **Write when:** User asks to adjust archetypes, customize scoring, or change their narrative
- **Depends on:** `modes/_profile.template.md` (template source)
- **Feeds into:** `modes/offer.md`, `modes/pdf.md`, all evaluation workflows

### Root Modes

These are the main operational prompts that implement specific workflows.

#### `modes/offer.md`
- **Purpose:** Core A–F evaluation flow for a single job opportunity (scoring, blocks A–F, legitimacy check)
- **Category:** Mode (root)
- **Layer:** System
- **Read when:** You are changing evaluation logic, scoring criteria, or output format
- **Write when:** Evaluation blocks, scoring, or output structure changes
- **Depends on:** `modes/_shared.md`, `modes/_profile.md`, `interview-prep/story-bank.md`
- **Feeds into:** `reports/*`, `modes/auto-pipeline.md`, `batch/batch-prompt.md`

#### `modes/auto-pipeline.md`
- **Purpose:** Orchestrates end-to-end workflow: JD or URL → evaluation → PDF generation → tracker update
- **Category:** Mode (root)
- **Layer:** System
- **Read when:** You are changing the single-job workflow from input to output
- **Write when:** Pipeline flow or step ordering changes
- **Depends on:** `modes/offer.md`, `modes/pdf.md`, `modes/tracker.md`, `modes/_shared.md`
- **Feeds into:** User-facing single-job evaluations

#### `modes/pdf.md`
- **Purpose:** Defines ATS-safe CV structure, keyword injection, and PDF-generation guidance for English CVs
- **Category:** Mode (root)
- **Layer:** System
- **Read when:** You are changing CV output, ATS optimization, or keyword injection
- **Write when:** CV format, ATS rules, or keyword strategy changes
- **Depends on:** `templates/cv-template.html`, `cv.md`, `generate-pdf.mjs`
- **Feeds into:** `generate-pdf.mjs`, `modes/auto-pipeline.md`

#### `modes/batch.md`
- **Purpose:** Coordinates parallel offer processing using worker prompts for bulk evaluations
- **Category:** Mode (root)
- **Layer:** System
- **Read when:** You are changing multi-job orchestration or batch behavior
- **Write when:** Batch flow, worker coordination, or parallelization changes
- **Depends on:** `batch/batch-prompt.md`, `modes/_shared.md`, `modes/offer.md`
- **Feeds into:** Batch evaluation workflows

#### `modes/pipeline.md`
- **Purpose:** Processes queued job URLs from data/pipeline.md; runs full workflow for each pending item
- **Category:** Mode (root)
- **Layer:** System
- **Read when:** You are changing inbox/queue processing
- **Write when:** Pipeline processing logic changes
- **Depends on:** `data/pipeline.md`, `modes/auto-pipeline.md`
- **Feeds into:** Bulk URL processing workflows

#### `modes/scan.md`
- **Purpose:** Defines portal discovery logic, scanning strategy, and offer-collection workflow
- **Category:** Mode (root)
- **Layer:** System
- **Read when:** You are changing how job boards are scanned or offers discovered
- **Write when:** Scanning logic or discovery strategy changes
- **Depends on:** `portals.yml`, `modes/_shared.md`, `data/scan-history.tsv`
- **Feeds into:** `scan.mjs`, job discovery workflows

#### `modes/tracker.md`
- **Purpose:** Summarizes and operates on application-tracker data (status overviews, filtering)
- **Category:** Mode (root)
- **Layer:** System
- **Read when:** You are changing tracker review or status reporting
- **Write when:** Tracker operations or status logic changes
- **Depends on:** `data/applications.md`, `templates/states.yml`
- **Feeds into:** Tracker-review and status-summary workflows

#### `modes/compare.md`
- **Purpose:** Compares evaluated jobs and ranks or contrasts them for decision-making
- **Category:** Mode (root)
- **Layer:** System
- **Read when:** You are changing multi-offer comparison logic
- **Write when:** Comparison ranking or decision logic changes
- **Depends on:** `modes/_shared.md`, `reports/*`
- **Feeds into:** Multi-offer analysis workflows

#### `modes/interview-prep.md`
- **Purpose:** Turns reports and existing stories into interview preparation packs and story-bank updates
- **Category:** Mode (root)
- **Layer:** System
- **Read when:** You are changing interview prep output or story extraction
- **Write when:** Interview prep format or story logic changes
- **Depends on:** `interview-prep/story-bank.md`, `reports/*`, `modes/_shared.md`
- **Feeds into:** `interview-prep/story-bank.md`, interview prep outputs

#### `modes/apply.md`
- **Purpose:** Guides live application assistance while keeping the user in control of submission
- **Category:** Mode (root)
- **Layer:** System
- **Read when:** You are changing application-form guidance
- **Write when:** Application workflow or form-filling logic changes
- **Depends on:** `modes/_shared.md`, `data/applications.md`
- **Feeds into:** Live application workflows

#### `modes/deep.md`
- **Purpose:** Runs deeper research on companies, context, and decision-relevant signals beyond base evaluation
- **Category:** Mode (root)
- **Layer:** System
- **Read when:** You are changing deep-research behavior
- **Write when:** Research strategy or depth changes
- **Depends on:** `modes/_shared.md`
- **Feeds into:** Advanced company research workflows

#### `modes/outreach.md`
- **Purpose:** Provides networking and contact-outreach assistance (LinkedIn, email, etc.)
- **Category:** Mode (root)
- **Layer:** System
- **Read when:** You are changing outreach guidance
- **Write when:** Outreach messaging or strategy changes
- **Depends on:** `modes/_shared.md`, `modes/deep.md`
- **Feeds into:** Networking and outreach workflows

#### `modes/patterns.md`
- **Purpose:** Analyzes report history to detect rejection patterns and targeting mistakes
- **Category:** Mode (root)
- **Layer:** System
- **Read when:** You are changing pattern-analysis behavior
- **Write when:** Pattern-detection logic or output changes
- **Depends on:** `reports/*`, `modes/_shared.md`, `analyze-patterns.mjs`
- **Feeds into:** Pattern-analysis workflows

#### `modes/project.md`
- **Purpose:** Evaluates portfolio or project ideas by career relevance and interview value
- **Category:** Mode (root)
- **Layer:** System
- **Read when:** You are changing project-evaluation behavior
- **Write when:** Project scoring or evaluation logic changes
- **Depends on:** `modes/_shared.md`
- **Feeds into:** Portfolio strategy and project evaluation

#### `modes/training.md`
- **Purpose:** Evaluates training, courses, or certifications against the user's strategy
- **Category:** Mode (root)
- **Layer:** System
- **Read when:** You are changing training/cert evaluation
- **Write when:** Training-evaluation logic changes
- **Depends on:** `modes/_shared.md`
- **Feeds into:** Learning strategy and training evaluation

### Localized Modes — German (`/modes/de/`)

German-language and DACH market-specific workflows.

#### `modes/de/README.md`
- **Purpose:** Explains when and how to use the German mode set (DACH market context)
- **Category:** Documentation (localized)
- **Layer:** System
- **Read when:** Working on German-language workflows
- **Write when:** German localization strategy changes
- **Depends on:** `modes/README.md`
- **Feeds into:** German mode selection and routing

#### `modes/de/_shared.md`
- **Purpose:** German shared instruction layer with DACH-specific terminology (13. Monatsgehalt, Tarifvertrag, Kündigungsfrist, etc.)
- **Category:** Mode (localized shared foundation)
- **Layer:** System
- **Read when:** Changing German-specific evaluation behavior
- **Write when:** DACH market rules or terminology changes
- **Depends on:** `modes/_shared.md`
- **Feeds into:** All German root modes

#### `modes/de/angebot.md`
- **Purpose:** German translation and adaptation of offer-evaluation workflow
- **Category:** Mode (localized root)
- **Layer:** System
- **Read when:** Changing German offer evaluation
- **Write when:** German evaluation logic changes
- **Depends on:** `modes/de/_shared.md`, `modes/offer.md`
- **Feeds into:** German evaluation workflows

#### `modes/de/bewerben.md`
- **Purpose:** German translation and adaptation of live application-assistant workflow
- **Category:** Mode (localized root)
- **Layer:** System
- **Read when:** Changing German application assistance
- **Write when:** German application workflow changes
- **Depends on:** `modes/de/_shared.md`, `modes/apply.md`
- **Feeds into:** German application workflows

#### `modes/de/pipeline.md`
- **Purpose:** German translation and adaptation of URL inbox pipeline workflow
- **Category:** Mode (localized root)
- **Layer:** System
- **Read when:** Changing German inbox processing
- **Write when:** German pipeline logic changes
- **Depends on:** `modes/de/_shared.md`, `modes/pipeline.md`, `data/pipeline.md`
- **Feeds into:** German pipeline workflows

### Localized Modes — French (`/modes/fr/`)

French-language and Francophone market-specific workflows.

#### `modes/fr/README.md`
- **Purpose:** Explains when and how to use the French mode set (France/Belgium/Switzerland/Luxembourg)
- **Category:** Documentation (localized)
- **Layer:** System
- **Read when:** Working on French-language workflows
- **Write when:** French localization strategy changes
- **Depends on:** `modes/README.md`
- **Feeds into:** French mode selection and routing

#### `modes/fr/_shared.md`
- **Purpose:** French shared instruction layer with France-specific terminology (CDI/CDD, RTT, convention collective SYNTEC, etc.)
- **Category:** Mode (localized shared foundation)
- **Layer:** System
- **Read when:** Changing French-specific evaluation behavior
- **Write when:** French market rules or terminology changes
- **Depends on:** `modes/_shared.md`
- **Feeds into:** All French root modes

#### `modes/fr/offre.md`
- **Purpose:** French translation and adaptation of offer-evaluation workflow
- **Category:** Mode (localized root)
- **Layer:** System
- **Read when:** Changing French offer evaluation
- **Write when:** French evaluation logic changes
- **Depends on:** `modes/fr/_shared.md`, `modes/offer.md`
- **Feeds into:** French evaluation workflows

#### `modes/fr/pipeline.md`
- **Purpose:** French translation and adaptation of URL inbox workflow
- **Category:** Mode (localized root)
- **Layer:** System
- **Read when:** Changing French inbox processing
- **Write when:** French pipeline logic changes
- **Depends on:** `modes/fr/_shared.md`, `modes/pipeline.md`, `data/pipeline.md`
- **Feeds into:** French pipeline workflows

#### `modes/fr/postuler.md`
- **Purpose:** French translation and adaptation of application-assistant workflow
- **Category:** Mode (localized root)
- **Layer:** System
- **Read when:** Changing French application assistance
- **Write when:** French application workflow changes
- **Depends on:** `modes/fr/_shared.md`, `modes/apply.md`
- **Feeds into:** French application workflows

### Localized Modes — Portuguese (`/modes/pt/`)

Portuguese-language and Brazilian market-specific workflows.

#### `modes/pt/README.md`
- **Purpose:** Explains when and how to use the Brazilian Portuguese mode set
- **Category:** Documentation (localized)
- **Layer:** System
- **Read when:** Working on Portuguese-language workflows
- **Write when:** Portuguese localization strategy changes
- **Depends on:** `modes/README.md`
- **Feeds into:** Portuguese mode selection and routing

#### `modes/pt/_shared.md`
- **Purpose:** Portuguese shared instruction layer with Brazilian market context
- **Category:** Mode (localized shared foundation)
- **Layer:** System
- **Read when:** Changing Portuguese-specific evaluation behavior
- **Write when:** Brazilian market rules or terminology changes
- **Depends on:** `modes/_shared.md`
- **Feeds into:** All Portuguese root modes

#### `modes/pt/aplicar.md`
- **Purpose:** Portuguese translation and adaptation of live application workflow
- **Category:** Mode (localized root)
- **Layer:** System
- **Read when:** Changing Portuguese application assistance
- **Write when:** Portuguese application workflow changes
- **Depends on:** `modes/pt/_shared.md`, `modes/apply.md`
- **Feeds into:** Portuguese application workflows

#### `modes/pt/oferta.md`
- **Purpose:** Portuguese translation and adaptation of A–F offer-evaluation flow
- **Category:** Mode (localized root)
- **Layer:** System
- **Read when:** Changing Portuguese offer evaluation
- **Write when:** Portuguese evaluation logic changes
- **Depends on:** `modes/pt/_shared.md`, `modes/offer.md`
- **Feeds into:** Portuguese evaluation workflows

#### `modes/pt/pipeline.md`
- **Purpose:** Portuguese translation and adaptation of URL inbox workflow
- **Category:** Mode (localized root)
- **Layer:** System
- **Read when:** Changing Portuguese inbox processing
- **Write when:** Portuguese pipeline logic changes
- **Depends on:** `modes/pt/_shared.md`, `modes/pipeline.md`, `data/pipeline.md`
- **Feeds into:** Portuguese pipeline workflows

### Localized Modes — Korean (`/modes/ko/`)

Korean-language workflows with market-specific resume formats (Jumpit, 이력서).

#### `modes/ko/README.md`
- **Purpose:** Explains when and how to use the Korean mode set and resume options (ATS CV vs. multi-page 이력서)
- **Category:** Documentation (localized)
- **Layer:** System
- **Read when:** Working on Korean-language or Korean company workflows
- **Write when:** Korean localization strategy changes
- **Depends on:** `modes/README.md`
- **Feeds into:** Korean mode selection and routing

#### `modes/ko/_shared.md`
- **Purpose:** Korean shared instruction layer with market-specific terminology (정규직, 계약직, 연봉제, etc.)
- **Category:** Mode (localized shared foundation)
- **Layer:** System
- **Read when:** Changing Korean-specific evaluation behavior
- **Write when:** Korean market context changes
- **Depends on:** `modes/_shared.md`
- **Feeds into:** All Korean root modes

#### `modes/ko/offer.md`
- **Purpose:** Korean translation and adaptation of offer-evaluation flow
- **Category:** Mode (localized root)
- **Layer:** System
- **Read when:** Changing Korean offer evaluation
- **Write when:** Korean evaluation logic changes
- **Depends on:** `modes/ko/_shared.md`, `modes/offer.md`
- **Feeds into:** Korean evaluation workflows

#### `modes/ko/apply.md`
- **Purpose:** Korean translation and adaptation of application-assistant workflow
- **Category:** Mode (localized root)
- **Layer:** System
- **Read when:** Changing Korean application assistance
- **Write when:** Korean application workflow changes
- **Depends on:** `modes/ko/_shared.md`, `modes/apply.md`
- **Feeds into:** Korean application workflows

#### `modes/ko/pipeline.md`
- **Purpose:** Korean translation and adaptation of URL inbox workflow
- **Category:** Mode (localized root)
- **Layer:** System
- **Read when:** Changing Korean inbox processing
- **Write when:** Korean pipeline logic changes
- **Depends on:** `modes/ko/_shared.md`, `modes/pipeline.md`, `data/pipeline.md`
- **Feeds into:** Korean pipeline workflows

#### `modes/ko/pdf.md`
- **Purpose:** Korean-specific CV/resume generation; multi-page Jumpit-style 이력서 (2–4 pages) in A4 format
- **Category:** Mode (localized root)
- **Layer:** System
- **Read when:** Changing Korean resume output (이력서 format vs. ATS CV)
- **Write when:** Korean resume structure or layout changes
- **Depends on:** `modes/ko/assets/jumpit-korean-resume-template.html`, `cv.md`
- **Feeds into:** Korean resume generation workflows

#### `modes/ko/assets/jumpit-korean-resume-template.html`
- **Purpose:** HTML template for multi-page Korean resume (Jumpit-style 이력서 layout)
- **Category:** Template (localized)
- **Layer:** System
- **Read when:** Adjusting Korean resume styling or layout
- **Write when:** Resume template structure or design changes
- **Depends on:** `modes/ko/pdf.md`
- **Feeds into:** Korean PDF generation

#### `modes/ko/references/jumpit-layout.md`
- **Purpose:** Reference documentation for Jumpit resume layout and formatting conventions
- **Category:** Reference (localized)
- **Layer:** System
- **Read when:** Understanding Jumpit format requirements
- **Write when:** Jumpit format guidance changes
- **Depends on:** None
- **Feeds into:** `modes/ko/pdf.md`, Korean resume guidance

#### `modes/ko/references/career-ops-integration.md`
- **Purpose:** Integration guide for how Career-Ops connects to Korean resume workflows
- **Category:** Reference (localized)
- **Layer:** System
- **Read when:** Understanding how Career-Ops Korean modes integrate
- **Write when:** Integration points change
- **Depends on:** `modes/ko/pdf.md`, `modes/ko/_shared.md`
- **Feeds into:** Korean workflow documentation

---

## Data Layer (`/data/`)

User working documents: application inbox, pending URLs, and history.

### `data/applications.md`
- **Purpose:** Application tracker; table of all evaluated, applied, and tracked opportunities
- **Category:** User working document
- **Layer:** User
- **Read when:** You need to see the user's application status, review history, or update an entry
- **Write when:** User applies to a job, receives a response, or wants to update status
- **Depends on:** `templates/states.yml` (canonical status values), reports (for score/details)
- **Feeds into:** `modes/tracker.md`, status overviews, application history

### `data/pipeline.md`
- **Purpose:** Inbox of pending job URLs waiting to be evaluated or processed
- **Category:** User working document
- **Layer:** User
- **Read when:** You need to see queued jobs or check what's pending
- **Write when:** User pastes new job URLs to be evaluated
- **Depends on:** None
- **Feeds into:** `modes/pipeline.md`, `modes/auto-pipeline.md`, bulk evaluation workflows

### `data/scan-history.tsv`
- **Purpose:** Deduplication history from job board scans (tracks previously seen job postings)
- **Category:** User working document (data)
- **Layer:** User
- **Read when:** Checking if a job has been scanned before
- **Write when:** Scan workflows complete (auto-updated)
- **Depends on:** `scan.mjs`
- **Feeds into:** Deduplication logic in `scan.mjs`

### `data/follow-ups.md`
- **Purpose:** Follow-up history and cadence tracker
- **Category:** User working document
- **Layer:** User
- **Read when:** You need to check when the user last followed up with a company
- **Write when:** User completes a follow-up or wants to log history
- **Depends on:** `followup-cadence.mjs`
- **Feeds into:** Follow-up strategy and timing

---

## Processing Scripts (`*.mjs` files at root)

Node.js executable scripts that automate bulk operations, validation, and PDF generation.

### `generate-pdf.mjs`
- **Purpose:** Playwright-based HTML-to-PDF converter; transforms CV HTML to PDF with ATS normalization
- **Category:** Processing script
- **Layer:** System
- **Read when:** You are debugging PDF generation or ATS text cleanup
- **Write when:** PDF rendering, text normalization, or output logic changes
- **Depends on:** `templates/cv-template.html`, `modes/pdf.md`, user CV data
- **Feeds into:** `modes/pdf.md`, `modes/auto-pipeline.md`, CV outputs

### `analyze-patterns.mjs`
- **Purpose:** Analyzes evaluation reports to detect rejection patterns, targeting mistakes, and trends
- **Category:** Processing script
- **Layer:** System
- **Read when:** Generating pattern analysis or debugging pattern detection
- **Write when:** Pattern-detection logic or output changes
- **Depends on:** `reports/*`, `modes/_shared.md`
- **Feeds into:** `modes/patterns.md`, pattern-analysis workflows

### `scan.mjs`
- **Purpose:** Zero-token portal scanner; hits Greenhouse/Ashby/Lever APIs directly (no LLM cost)
- **Category:** Processing script
- **Layer:** System
- **Read when:** Understanding how job boards are scanned or debugging scanner issues
- **Write when:** Portal API integrations or scanner logic changes
- **Depends on:** `portals.yml`, `data/scan-history.tsv`
- **Feeds into:** Job discovery and bulk offer collection

### `check-liveness.mjs`
- **Purpose:** Job posting liveness checker; verifies whether a posting is still active
- **Category:** Processing script
- **Layer:** System
- **Read when:** Debugging liveness detection or understanding active/expired signals
- **Write when:** Liveness-detection logic changes
- **Depends on:** `liveness-core.mjs`
- **Feeds into:** Report legitimacy checks and offer evaluation

### `liveness-core.mjs`
- **Purpose:** Shared liveness logic; rules for detecting expired job postings
- **Category:** Processing script (shared library)
- **Layer:** System
- **Read when:** Understanding how expired postings are detected
- **Write when:** Liveness-detection rules change
- **Depends on:** None
- **Feeds into:** `check-liveness.mjs`, `modes/offer.md`

### `merge-tracker.mjs`
- **Purpose:** Merges tracker additions from batch evaluations into main applications.md
- **Category:** Processing script
- **Layer:** System
- **Read when:** Understanding how batch results integrate into the tracker
- **Write when:** Tracker merge logic changes
- **Depends on:** `batch/tracker-additions/*`, `data/applications.md`
- **Feeds into:** Application tracker consolidation

### `dedup-tracker.mjs`
- **Purpose:** Removes duplicate entries from applications.md based on company+role
- **Category:** Processing script
- **Layer:** System
- **Read when:** Debugging duplicate detection or cleaning tracker
- **Write when:** Deduplication logic changes
- **Depends on:** `data/applications.md`
- **Feeds into:** Tracker hygiene and data quality

### `normalize-statuses.mjs`
- **Purpose:** Normalizes all statuses in applications.md to canonical values
- **Category:** Processing script
- **Layer:** System
- **Read when:** Understanding canonical statuses or fixing status drift
- **Write when:** Status normalization logic changes
- **Depends on:** `templates/states.yml`, `data/applications.md`
- **Feeds into:** Tracker consistency and compliance

### `verify-pipeline.mjs`
- **Purpose:** Validation script; checks pipeline integrity, report naming, tracker consistency
- **Category:** Processing script (validation)
- **Layer:** System
- **Read when:** Debugging pipeline issues or validating data quality
- **Write when:** Validation rules change
- **Depends on:** `reports/*`, `data/applications.md`, `templates/*`
- **Feeds into:** CI/CD checks and quality gates

### `doctor.mjs`
- **Purpose:** Health check script; diagnoses sync problems, missing hooks, convention drift
- **Category:** Processing script (diagnostics)
- **Layer:** System
- **Read when:** Troubleshooting system issues
- **Write when:** Diagnostic checks or rules change
- **Depends on:** All system files
- **Feeds into:** System troubleshooting and maintenance

### `cv-sync-check.mjs`
- **Purpose:** Verifies that cv.md and generated PDFs/outputs stay in sync
- **Category:** Processing script (validation)
- **Layer:** System
- **Read when:** Debugging CV sync issues or validating CV consistency
- **Write when:** Sync-check logic changes
- **Depends on:** `cv.md`, `output/*`
- **Feeds into:** CV consistency validation

### `update-system.mjs`
- **Purpose:** System update checker and applier; downloads and applies new system-layer files without touching user data
- **Category:** Processing script (system management)
- **Layer:** System
- **Read when:** Understanding how updates work
- **Write when:** Update logic changes
- **Depends on:** Remote version manifest
- **Feeds into:** Auto-update workflows

### `followup-cadence.mjs`
- **Purpose:** Follow-up cadence calculator; determines optimal timing for follow-ups based on application history
- **Category:** Processing script
- **Layer:** System
- **Read when:** Understanding follow-up timing logic
- **Write when:** Cadence calculation changes
- **Depends on:** `data/follow-ups.md`, `data/applications.md`
- **Feeds into:** `modes/followup.md`, follow-up strategy

### `test-all.mjs`
- **Purpose:** Comprehensive test suite; 63+ checks covering architecture, examples, data integrity, and scripts
- **Category:** Processing script (testing)
- **Layer:** System
- **Read when:** Understanding what is tested or debugging test failures
- **Write when:** Test cases or validation rules change
- **Depends on:** All files (comprehensive coverage)
- **Feeds into:** CI/CD checks and quality gates

---

## Templates (`/templates/`)

Reusable skeletons and examples for configuration and output.

### `templates/cv-template.html`
- **Purpose:** HTML template for CV generation; defines layout, styling, and placeholder structure for PDF output
- **Category:** Template
- **Layer:** System
- **Read when:** Adjusting CV styling, layout, or HTML structure
- **Write when:** CV design or template structure changes
- **Depends on:** CSS styling, HTML structure
- **Feeds into:** `generate-pdf.mjs`, `modes/pdf.md`

### `templates/portals.example.yml`
- **Purpose:** Example portal configuration; shows structure for configuring job boards, search keywords, and filters
- **Category:** Template
- **Layer:** System template
- **Read when:** Setting up portals.yml for the first time
- **Write when:** Portal configuration structure changes
- **Depends on:** None
- **Feeds into:** `portals.yml` (user's actual configuration)

### `templates/states.yml`
- **Purpose:** Canonical application states/statuses; source of truth for allowed status values
- **Category:** Configuration
- **Layer:** System
- **Read when:** Checking valid application statuses or normalizing status values
- **Write when:** Canonical status list changes
- **Depends on:** None
- **Feeds into:** `data/applications.md`, `normalize-statuses.mjs`, status validation

### `templates/README.md`
- **Purpose:** Guide to templates directory and how to use template files
- **Category:** Documentation
- **Layer:** System
- **Read when:** Understanding template structure and usage
- **Write when:** Template guidance changes
- **Depends on:** Template files
- **Feeds into:** Template usage documentation

---

## Examples (`/examples/`)

Reference implementations, test fixtures, and expected output formats.

### `examples/cv-example.md`
- **Purpose:** Example markdown CV; shows expected structure, sections, and formatting for cv.md
- **Category:** Example content
- **Layer:** System example
- **Read when:** You need a reference CV format for the user
- **Write when:** CV format or expected structure changes
- **Depends on:** None
- **Feeds into:** User CV creation, `docs/SETUP.md`

### `examples/dual-track-engineer-instructor/README.md`
- **Purpose:** Guide to the dual-track example; explains how to interpret a persona with multiple career tracks
- **Category:** Example package guide
- **Layer:** System example
- **Read when:** You want a richer persona example (multiple roles)
- **Write when:** Example guidance changes
- **Depends on:** `examples/dual-track-engineer-instructor/cv.md`
- **Feeds into:** Role-positioning and multi-track career docs

### `examples/dual-track-engineer-instructor/cv.md`
- **Purpose:** Sample markdown CV for a dual-track persona (engineer + instructor)
- **Category:** Example CV
- **Layer:** System example
- **Read when:** You want an extended CV example (richer than cv-example.md)
- **Write when:** Example CV changes
- **Depends on:** `examples/cv-example.md`
- **Feeds into:** User CV creation

### `examples/dual-track-engineer-instructor/profile.yml`
- **Purpose:** Example profile configuration for a dual-track persona
- **Category:** Example configuration
- **Layer:** System example
- **Read when:** You want to see how a profile handles multiple roles/archetypes
- **Write when:** Example profile changes
- **Depends on:** `config/profile.example.yml`
- **Feeds into:** User profile customization

### `examples/sample-report.md`
- **Purpose:** Example evaluation report; shows expected shape, blocks A–F, scoring, and output format
- **Category:** Example report
- **Layer:** System example
- **Read when:** You want to see what a generated report should look like
- **Write when:** Report format or blocks change
- **Depends on:** `modes/offer.md`
- **Feeds into:** Report generation and validation

### `examples/article-digest-example.md`
- **Purpose:** Example article digest; shows what a compact proof-point summary looks like
- **Category:** Example content
- **Layer:** System example
- **Read when:** You want guidance on structuring proof points
- **Write when:** Proof-point format changes
- **Depends on:** None
- **Feeds into:** `article-digest.md` creation, proof-point guidance

### `examples/ats-normalization-test.md`
- **Purpose:** Test fixture; provides problematic text and verification instructions for ATS text cleanup
- **Category:** Test fixture documentation
- **Layer:** System example
- **Read when:** Validating PDF text cleanup or ATS normalization
- **Write when:** Normalization test cases change
- **Depends on:** `generate-pdf.mjs`
- **Feeds into:** ATS text-normalization testing

---

## Output Directories (Generated & Accumulated)

These directories contain generated reports, PDFs, and user-accumulated content. Generated files are `.gitignore`d except where noted.

### `reports/`
- **Purpose:** Evaluation reports in Markdown (format: `{###}-{company-slug}-{YYYY-MM-DD}.md`)
- **Content:** A–F blocks, scoring, legitimacy tier, company analysis, decision recommendation
- **Category:** Generated output
- **Layer:** User (generated by agent, owned by user)
- **Read when:** You need detailed evaluation for a job or company analysis
- **Write when:** Auto-generated by evaluation workflows
- **Depends on:** `modes/offer.md`, `modes/_shared.md`, `modes/_profile.md`, JD/URL input
- **Feeds into:** `data/applications.md`, tracker updates, interview prep, decision-making

### `output/`
- **Purpose:** Generated CVs and PDFs (format: `{company}/{role}/cv-{user}-{company}-{YYYY-MM-DD}.{pdf|html|md}`)
- **Content:** User's tailored CV in various formats (PDF, HTML, Markdown)
- **Category:** Generated output
- **Layer:** User (generated by agent, owned by user)
- **Read when:** You need to review or download a generated CV
- **Write when:** Auto-generated by PDF workflows
- **Depends on:** `modes/pdf.md`, `cv.md`, `generate-pdf.mjs`, `templates/cv-template.html`
- **Feeds into:** Application submission, user review

### `interview-prep/story-bank.md`
- **Purpose:** Accumulated STAR-style stories and reflections from evaluations and interviews
- **Category:** User working document
- **Layer:** User
- **Read when:** You need reusable interview stories or want to build story inventory
- **Write when:** User adds new stories or experiences
- **Depends on:** `modes/interview-prep.md`, evaluations, user experience
- **Feeds into:** Interview preparation, story reuse in future evaluations

### `interview-prep/{company}-{role}.md`
- **Purpose:** Company-specific interview intelligence report (question patterns, culture signals, interviewer style)
- **Category:** Generated output
- **Layer:** User (generated by agent, owned by user)
- **Read when:** Preparing for a specific company's interview
- **Write when:** Auto-generated by interview-prep workflows
- **Depends on:** `modes/interview-prep.md`, `reports/{company}.md`
- **Feeds into:** Interview preparation and interview performance

### `batch/`
- **Purpose:** Batch processing workspace; contains batch state, prompts, and per-company outputs
- **Content:** Tracker additions, batch metadata, worker results
- **Category:** Batch processing workspace
- **Layer:** Mixed (system scripts + user results)
- **Read when:** Debugging batch workflows or checking batch progress
- **Write when:** Batch workflows auto-populate
- **Depends on:** `modes/batch.md`, `batch/batch-prompt.md`
- **Feeds into:** `merge-tracker.mjs`, tracker consolidation

#### `batch/batch-prompt.md`
- **Purpose:** Worker prompt used for batch evaluation flows
- **Category:** Mode (batch worker)
- **Layer:** System
- **Read when:** Changing batch-worker behavior or debugging batch output
- **Write when:** Batch worker logic changes
- **Depends on:** `modes/_shared.md`, `modes/offer.md`
- **Feeds into:** Parallel worker execution

#### `batch/batch-input.tsv`
- **Purpose:** Input jobs for batch processing (TSV format: num, company, role, url)
- **Category:** Batch input data
- **Layer:** User
- **Read when:** Checking which jobs are queued for batch processing
- **Write when:** User or batch workflow populates
- **Depends on:** None
- **Feeds into:** Batch worker distribution

#### `batch/batch-state.tsv`
- **Purpose:** State tracker for batch jobs (progress, worker assignment, results)
- **Category:** Batch metadata
- **Layer:** User
- **Read when:** Monitoring batch progress
- **Write when:** Batch orchestration updates (auto)
- **Depends on:** Batch workers
- **Feeds into:** Batch coordination and progress tracking

#### `batch/tracker-additions/{company}.tsv`
- **Purpose:** Per-company tracker additions from batch evaluation (single TSV line per company)
- **Category:** Batch output
- **Layer:** User
- **Read when:** Reviewing individual batch results before merge
- **Write when:** Auto-generated by batch workers
- **Depends on:** Batch evaluation
- **Feeds into:** `merge-tracker.mjs`, consolidated tracker

#### `batch/tracker-additions/merged/`
- **Purpose:** Consolidated tracker additions (same as individual files but organized for merge)
- **Category:** Batch output (merged)
- **Layer:** User
- **Read when:** Verifying merged results before committing
- **Write when:** Auto-generated by merge script
- **Depends on:** `batch/tracker-additions/{company}.tsv`
- **Feeds into:** `data/applications.md` final merge

### `resumes/`
- **Purpose:** Saved resume variants (multiple versions for different roles or markets)
- **Category:** User working documents
- **Layer:** User
- **Read when:** You need to review or reuse saved resume variants
- **Write when:** User saves a variant for future use
- **Depends on:** `cv.md`, `modes/pdf.md`
- **Feeds into:** Application submission, portfolio

---

## Documentation (`/docs/`)

Contributor guides, architecture docs, and setup instructions.

### `docs/README.md`
- **Purpose:** Contributor documentation hub; provides reading order, repo mental model, and links to detailed guides
- **Category:** Documentation
- **Layer:** System
- **Read when:** You are new to contributing or need a guided entry into the codebase
- **Write when:** Contributor onboarding flow or documentation structure changes
- **Depends on:** All documentation files
- **Feeds into:** Contributor onboarding

### `docs/SETUP.md`
- **Purpose:** Setup guide; walks through environment setup, profile creation, CV creation, and initial usage
- **Category:** Documentation
- **Layer:** System
- **Read when:** Setting up the system locally or onboarding a new user
- **Write when:** Setup steps or requirements change
- **Depends on:** `config/profile.example.yml`, `templates/portals.example.yml`, `cv.md`
- **Feeds into:** First-run onboarding

### `docs/ARCHITECTURE.md`
- **Purpose:** Architecture guide; explains high-level system structure, evaluation flow, batch flow, data flow, naming rules, and pipeline integrity
- **Category:** Documentation
- **Layer:** System
- **Read when:** You need the system mental model or understanding of data flow
- **Write when:** Architecture changes or flow updates
- **Depends on:** `.mjs` scripts, `modes/*`, reports structure
- **Feeds into:** System design decisions, contributor understanding

### `docs/CUSTOMIZATION.md`
- **Purpose:** Customization guide; explains where user-specific customization belongs and how changes should be handled
- **Category:** Documentation
- **Layer:** System
- **Read when:** You need to customize the system for a user or role target
- **Write when:** Customization rules or guidance changes
- **Depends on:** `DATA_CONTRACT.md`, `config/profile.example.yml`, `modes/_profile.template.md`
- **Feeds into:** User personalization workflows

### `docs/CODEX.md`
- **Purpose:** Codex setup guide; explains how Codex should be used with Career-Ops and maps intents to modes
- **Category:** Documentation
- **Layer:** System
- **Read when:** Using Codex instead of Claude Code
- **Write when:** Codex-specific guidance changes
- **Depends on:** `AGENTS.md`, `CLAUDE.md`, `modes/*`
- **Feeds into:** Codex execution and mode selection

### `docs/SCRIPTS.md`
- **Purpose:** Script reference; documents every .mjs script, what it does, when to run it, and what it depends on
- **Category:** Documentation
- **Layer:** System
- **Read when:** You need to understand or use a processing script
- **Write when:** Script behavior or usage changes
- **Depends on:** All `.mjs` scripts
- **Feeds into:** Script usage and automation

### `docs/FILE_MAP.md`
- **Purpose:** Complete file reference (this document); inventories every file, purpose, layer, dependencies, and relationships
- **Category:** Documentation
- **Layer:** System
- **Read when:** You need to understand what any file does or how files connect
- **Write when:** New files added, file purpose changes, or file relationships change
- **Depends on:** Every file in the repository
- **Feeds into:** Contributor understanding and file navigation

### `docs/superpowers/`
- **Purpose:** Internal implementation plans and design specs for major initiatives
- **Category:** Documentation (internal planning)
- **Layer:** System
- **Read when:** Understanding the rationale behind major changes
- **Write when:** New initiatives or major changes are planned
- **Depends on:** Varies by initiative
- **Feeds into:** Implementation guidance and historical context

#### `docs/superpowers/plans/`
- **Purpose:** Task-by-task implementation plans for major initiatives
- **Category:** Implementation plan
- **Layer:** System
- **Read when:** Understanding step-by-step work for a major change
- **Write when:** Planning major initiatives
- **Depends on:** None
- **Feeds into:** Execution and status tracking

#### `docs/superpowers/specs/`
- **Purpose:** Design specifications and approved designs for major initiatives
- **Category:** Design specification
- **Layer:** System
- **Read when:** Understanding the approved design for a feature or change
- **Write when:** Design decisions are finalized
- **Depends on:** Planning and discovery work
- **Feeds into:** Implementation reference

---

## Skills & Agent Integration (`./.claude/` and `./.agents/`)

Claude Code and Agent integration points.

### `.claude/skills/career-ops/SKILL.md`
- **Purpose:** Skill definition for Claude Code; maps `/career-ops` and related commands to modes
- **Category:** Agent integration
- **Layer:** System
- **Read when:** Understanding how Claude Code skills map to career-ops modes
- **Write when:** Skill routing or behavior changes
- **Depends on:** `CLAUDE.md`, all modes
- **Feeds into:** Claude Code command execution

### `.claude/skills/resume-builder/SKILL.md`
- **Purpose:** Resume builder skill for Claude Code; guides CV creation and optimization
- **Category:** Agent integration
- **Layer:** System
- **Read when:** Using resume builder skill
- **Write when:** Resume skill behavior changes
- **Depends on:** `cv.md`, `modes/pdf.md`, resume templates
- **Feeds into:** Resume creation workflows

### `.claude/skills/korean-resume-builder/SKILL.md`
- **Purpose:** Korean-specific resume builder skill; guides Korean 이력서 creation in Jumpit format
- **Category:** Agent integration
- **Layer:** System
- **Read when:** Creating Korean resumes or working with Korean job applications
- **Write when:** Korean resume skill changes
- **Depends on:** `modes/ko/pdf.md`, Korean templates and references
- **Feeds into:** Korean resume workflows

### `.agents/skills/` (mirror structure)
- **Purpose:** Mirror of `.claude/skills/` for agent-based execution
- **Category:** Agent integration
- **Layer:** System
- **Read when:** Using agents (non-Claude Code) with the system
- **Write when:** Agent skill routing changes
- **Depends on:** Same as `.claude/skills/` equivalents
- **Feeds into:** Agent-based execution

### `.claude/settings.json` and `.claude/settings.local.json`
- **Purpose:** Claude Code configuration (hooks, behaviors, local overrides)
- **Category:** Configuration
- **Layer:** User (local settings)
- **Read when:** Debugging Claude Code behavior or hooks
- **Write when:** User configures Claude Code settings
- **Depends on:** None
- **Feeds into:** Claude Code execution environment

---

## Tooling & CI/CD (`./.github/`, `.mcp.json`, `.opencode/`)

GitHub workflows, MCP configuration, and OpenCode integration.

### `.github/workflows/test.yml`
- **Purpose:** CI/CD test workflow; runs `test-all.mjs` on every PR
- **Category:** CI/CD
- **Layer:** System
- **Read when:** Understanding CI/CD checks
- **Write when:** Test requirements change
- **Depends on:** `test-all.mjs`
- **Feeds into:** Pull request validation

### `.github/workflows/release.yml`
- **Purpose:** Release workflow; cuts releases and publishes updates
- **Category:** CI/CD
- **Layer:** System
- **Read when:** Understanding release process
- **Write when:** Release process changes
- **Depends on:** Version management
- **Feeds into:** Release automation

### `.github/workflows/labeler.yml`
- **Purpose:** Auto-labeler workflow; tags PRs by risk (🔴 core, ⚠️ behavior, 📄 docs)
- **Category:** CI/CD
- **Layer:** System
- **Read when:** Understanding PR labeling
- **Write when:** Labeling rules change
- **Depends on:** `.github/labeler.yml`
- **Feeds into:** PR triage and risk assessment

### `.github/labeler.yml`
- **Purpose:** Labeling rules for auto-labeler; defines file patterns and risk categories
- **Category:** CI/CD configuration
- **Layer:** System
- **Read when:** Understanding PR risk categorization
- **Write when:** File patterns or risk categories change
- **Depends on:** None
- **Feeds into:** `.github/workflows/labeler.yml`

### `.github/dependabot.yml`
- **Purpose:** Dependabot configuration; monitors npm, Go modules, and GitHub Actions for updates
- **Category:** CI/CD configuration
- **Layer:** System
- **Read when:** Understanding dependency update strategy
- **Write when:** Update strategy changes
- **Depends on:** None
- **Feeds into:** Automated dependency PRs

### `.github/PULL_REQUEST_TEMPLATE.md`
- **Purpose:** PR template; guides contributors in describing changes
- **Category:** Governance
- **Layer:** System
- **Read when:** Understanding PR expectations
- **Write when:** PR template changes
- **Depends on:** None
- **Feeds into:** PR descriptions

### `.github/ISSUE_TEMPLATE/`
- **Purpose:** Issue templates for bug reports, features, hiring celebrations, and config requests
- **Category:** Governance
- **Layer:** System
- **Read when:** Understanding expected issue structure
- **Write when:** Issue templates change
- **Depends on:** None
- **Feeds into:** Issue creation and triage

### `.github/SECURITY.md`
- **Purpose:** Security policy; private vulnerability reporting
- **Category:** Security policy
- **Layer:** System
- **Read when:** Reporting a security vulnerability
- **Write when:** Security policy changes
- **Depends on:** None
- **Feeds into:** Security vulnerability handling

### `.github/FUNDING.yml`
- **Purpose:** Funding and sponsorship configuration
- **Category:** Configuration
- **Layer:** System
- **Read when:** Sponsorship or funding questions
- **Write when:** Funding options change
- **Depends on:** None
- **Feeds into:** Community support

### `.github/workflows/`
- **Purpose:** All GitHub Actions workflows (test, release, labeler, CodeQL, dependency review, stale issue management, welcome bot)
- **Category:** CI/CD
- **Layer:** System
- **Read when:** Understanding automated workflows
- **Write when:** Workflow behavior changes
- **Depends on:** Scripts and configuration files
- **Feeds into:** Automation and validation

### `.mcp.json`
- **Purpose:** MCP (Model Context Protocol) configuration; defines available resources and tools for agents
- **Category:** Configuration
- **Layer:** System
- **Read when:** Understanding what resources agents have access to
- **Write when:** MCP resources or tools change
- **Depends on:** None
- **Feeds into:** Agent execution capabilities

### `.opencode/commands/`
- **Purpose:** OpenCode skill definitions; mirrors Claude Code skills for use in OpenCode platform
- **Category:** Agent integration
- **Layer:** System
- **Read when:** Using OpenCode instead of Claude Code
- **Write when:** OpenCode skill definitions change
- **Depends on:** Same as `.claude/skills/*` and `modes/*`
- **Feeds into:** OpenCode command execution

---

## Package Management

### `package.json` and `package-lock.json`
- **Purpose:** Node.js dependencies and version lock
- **Category:** Configuration
- **Layer:** System
- **Read when:** Checking dependencies or versions
- **Write when:** Adding or updating packages
- **Depends on:** npm registry
- **Feeds into:** Node.js script execution

### `node_modules/`
- **Purpose:** Installed dependencies (Playwright, etc.)
- **Category:** Generated
- **Layer:** System (generated)
- **Read when:** Should not be read directly; use package.json instead
- **Write when:** Auto-generated by `npm install`
- **Depends on:** `package.json`
- **Feeds into:** Script execution

---

## Miscellaneous

### `.beads/`
- **Purpose:** Beads task management metadata (embedded Dolt database, task state)
- **Category:** Task management system
- **Layer:** System
- **Read when:** Not typically directly; Beads CLI manages this
- **Write when:** Auto-managed by Beads
- **Depends on:** Dolt
- **Feeds into:** Task tracking and workflow

### `.air/`
- **Purpose:** Air (version control) metadata
- **Category:** VCS metadata
- **Layer:** System
- **Read when:** Not typically directly
- **Write when:** Auto-managed by Air
- **Depends on:** VCS system
- **Feeds into:** Version control

### `.playwright-cli/`
- **Purpose:** Playwright CLI recorded session data (transient)
- **Category:** Transient data
- **Layer:** Transient
- **Read when:** Debugging recorded browser sessions
- **Write when:** Auto-generated by Playwright
- **Depends on:** Playwright CLI usage
- **Feeds into:** Browser automation debugging

---

## File Dependencies Summary

### Core Input Files (User owns, shouldn't be auto-updated)
- `cv.md` → feeds into all CV/PDF workflows
- `config/profile.yml` → feeds into evaluation and personalization
- `modes/_profile.md` → feeds into scoring and narrative
- `portals.yml` → feeds into scanning
- `data/pipeline.md` → feeds into bulk workflows
- `data/applications.md` → feeds into tracking and status reporting

### Core Output Files (Generated, user accumulates)
- `reports/*.md` → generated by evaluations
- `output/*` → generated PDFs and CVs
- `data/scan-history.tsv` → accumulates scan results
- `interview-prep/story-bank.md` → accumulates stories
- `batch/tracker-additions/*` → intermediate batch results

### System Foundational Files (Don't edit for user customization)
- `modes/_shared.md` → all evaluation logic
- All `.mjs` scripts → processing logic
- `CLAUDE.md` → agent behavior
- `DATA_CONTRACT.md` → ownership rules

### Localization Pattern
Each language folder mirrors the English structure:
- `modes/de/` (German)
- `modes/fr/` (French)
- `modes/pt/` (Portuguese)
- `modes/ko/` (Korean)

Each follows: `_shared.md` (foundation) + root modes (offer, apply, pipeline, etc.)

---

## When to Read Which Files

| I need to... | Read... |
|---|---|
| Understand the product | `README.md` → `docs/ARCHITECTURE.md` → this file |
| Set up the system | `docs/SETUP.md` → `config/profile.example.yml` → `cv.md` |
| Change evaluation behavior | `modes/_shared.md` then user-specific `modes/_profile.md` |
| Add a language | `modes/README.md` then mirror English folder structure |
| Create a report | `modes/offer.md` → `examples/sample-report.md` |
| Generate a CV | `modes/pdf.md` → `templates/cv-template.html` → `generate-pdf.mjs` |
| Scan job boards | `modes/scan.md` → `portals.yml` → `scan.mjs` |
| Verify data quality | `verify-pipeline.mjs` → `templates/states.yml` |
| Understand file ownership | `DATA_CONTRACT.md` → decide user-layer vs system-layer |
| Contribute code | `CONTRIBUTING.md` → `docs/README.md` → `docs/ARCHITECTURE.md` |
| Debug a script | `docs/SCRIPTS.md` → specific `*.mjs` file → `test-all.mjs` |
| Understand dependencies | This file → look at "Depends on" and "Feeds into" for any file |

