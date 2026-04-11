# Markdown File Map

This file explains every current `.md` file in the repository, what it is for, and which other files it connects to.

## Root Documents

## `AGENTS.md`
- **Category:** Codex agent instructions
- **Purpose:** Defines how Codex should behave in this repository and points it to `CLAUDE.md` and `docs/CODEX.md`.
- **Edited by:** Maintainers
- **Layer:** System
- **Connects to:** `CLAUDE.md`, `docs/CODEX.md`, `modes/*`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`
- **Read this when:** You are using Codex or updating repository-specific agent guidance.

## `CLAUDE.md`
- **Category:** Main agent operating guide
- **Purpose:** Defines the core workflow, update check, onboarding rules, routing map, data-contract rules, and mode behavior for Career-Ops agents.
- **Edited by:** Maintainers
- **Layer:** System
- **Connects to:** `DATA_CONTRACT.md`, `modes/*`, `config/profile.yml`, `modes/_profile.md`, `portals.yml`, `update-system.mjs`
- **Read this when:** You need the highest-level source of truth for agent behavior.

## `CONTRIBUTING.md`
- **Category:** Contribution workflow guide
- **Purpose:** Explains how contributors should propose changes, prepare PRs, and test major parts of the system.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `docs/README.md`, `docs/SETUP.md`, `docs/ARCHITECTURE.md`, `modes/*`, `dashboard/*`
- **Read this when:** You want to contribute code, prompts, docs, or translations.

## `DATA_CONTRACT.md`
- **Category:** File ownership policy
- **Purpose:** Separates user-layer files from system-layer files so updates and customization do not overwrite user data.
- **Edited by:** Maintainers
- **Layer:** System
- **Connects to:** `CLAUDE.md`, `AGENTS.md`, `docs/CUSTOMIZATION.md`, `config/profile.yml`, `modes/_profile.md`, `modes/_shared.md`
- **Read this when:** You are deciding where a change belongs.

## `LEGAL_DISCLAIMER.md`
- **Category:** Legal and acceptable-use policy
- **Purpose:** Explains privacy, platform, acceptable-use, and liability boundaries for the project.
- **Edited by:** Maintainers
- **Layer:** System
- **Connects to:** `README.md`, `CONTRIBUTING.md`, live application and scanning workflows
- **Read this when:** You are assessing compliance or contribution boundaries.

## `README.es.md`
- **Category:** Spanish overview README
- **Purpose:** Spanish-language project overview and onboarding entry point.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `README.md`, `docs/SETUP.md`, `modes/esp/*`
- **Read this when:** You want the high-level project intro in Spanish.

## `README.md`
- **Category:** Primary repository overview
- **Purpose:** Introduces Career-Ops, explains its main capabilities, and provides the top-level setup and usage entry point.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `docs/README.md`, `docs/SETUP.md`, `docs/ARCHITECTURE.md`, `docs/CUSTOMIZATION.md`, `docs/FILE_MAP.md`
- **Read this when:** You are starting with the repository.

## Other workflow markdown

## `batch/batch-prompt.md`
- **Category:** Batch worker prompt
- **Purpose:** Defines the worker prompt used for batch evaluation flows.
- **Edited by:** Maintainers
- **Layer:** System
- **Connects to:** `modes/batch.md`, `modes/_shared.md`, `reports/*`, `output/*`, tracker flow files
- **Read this when:** You are changing batch-worker behavior or debugging batch output.

## `docs/`

## `docs/ARCHITECTURE.md`
- **Category:** Architecture guide
- **Purpose:** Explains the high-level system structure, evaluation flow, batch flow, data flow, naming rules, and pipeline integrity scripts.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `README.md`, `docs/README.md`, `.mjs` scripts, `reports/*`, `dashboard/*`, `modes/*`
- **Read this when:** You need the system mental model.

## `docs/CODEX.md`
- **Category:** Codex setup guide
- **Purpose:** Explains how Codex should be used with Career-Ops and maps user intents to existing modes.
- **Edited by:** Maintainers
- **Layer:** System
- **Connects to:** `AGENTS.md`, `CLAUDE.md`, `modes/*`, verification commands
- **Read this when:** You are using Codex instead of Claude Code.

## `docs/CUSTOMIZATION.md`
- **Category:** Customization guide
- **Purpose:** Explains where user-specific customization belongs and how personal profile, portal, proof-point, and template changes should be handled.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `DATA_CONTRACT.md`, `config/profile.example.yml`, `modes/_profile.template.md`, `templates/portals.example.yml`, `modes/_shared.md`
- **Read this when:** You need to adapt the system to a person or role target.

## `docs/README.md`
- **Category:** Contributor docs hub
- **Purpose:** Gives new contributors a reading order, repo mental model, and links to the detailed documentation map.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `README.md`, `docs/SETUP.md`, `docs/ARCHITECTURE.md`, `docs/CUSTOMIZATION.md`, `docs/FILE_MAP.md`, `modes/README.md`
- **Read this when:** You want a guided entry into the documentation.

## `docs/SETUP.md`
- **Category:** Setup guide
- **Purpose:** Walks through environment setup, profile configuration, CV creation, portal configuration, and initial usage.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `README.md`, `config/profile.example.yml`, `templates/portals.example.yml`, `cv.md`, `docs/CUSTOMIZATION.md`
- **Read this when:** You are getting the system running locally.

## `docs/FILE_MAP.md`
- **Category:** Markdown inventory
- **Purpose:** Documents every markdown file in the repository and shows how the markdown surface area connects together.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** every `.md` file in the repository, `docs/README.md`, `modes/README.md`
- **Read this when:** You want to understand what any markdown file does.

## `docs/superpowers/plans/2026-04-10-docs-navigation.md`
- **Category:** Internal implementation plan
- **Purpose:** Task-by-task plan for the docs navigation improvement.
- **Edited by:** Maintainers or agents during planning
- **Layer:** System
- **Connects to:** `docs/superpowers/specs/2026-04-10-docs-navigation-design.md`, `docs/README.md`, `docs/FILE_MAP.md`, `modes/README.md`
- **Read this when:** You want the implementation breakdown behind the docs-navigation work.

## `docs/superpowers/plans/2026-04-10-mode-english-default.md`
- **Category:** Internal implementation plan
- **Purpose:** Plan for the English-default mode layout work.
- **Edited by:** Maintainers or agents during planning
- **Layer:** System
- **Connects to:** `docs/superpowers/specs/2026-04-10-mode-english-default-design.md`, `modes/*`, routing docs
- **Read this when:** You need context on the mode-layout planning work.

## `docs/superpowers/specs/2026-04-10-docs-navigation-design.md`
- **Category:** Internal design spec
- **Purpose:** Approved design for the documentation navigation and markdown inventory work.
- **Edited by:** Maintainers or agents during design
- **Layer:** System
- **Connects to:** `docs/superpowers/plans/2026-04-10-docs-navigation.md`, `docs/README.md`, `docs/FILE_MAP.md`, `modes/README.md`
- **Read this when:** You want the design rationale for the docs-navigation change.

## `docs/superpowers/specs/2026-04-10-mode-english-default-design.md`
- **Category:** Internal design spec
- **Purpose:** Design document for the English-default mode-layout work.
- **Edited by:** Maintainers or agents during design
- **Layer:** System
- **Connects to:** `docs/superpowers/plans/2026-04-10-mode-english-default.md`, `modes/*`, routing docs
- **Read this when:** You need historical context on the mode-layout design.

## `examples/`

## `examples/article-digest-example.md`
- **Category:** Example content
- **Purpose:** Shows what a compact proof-point digest looks like.
- **Edited by:** Maintainers and contributors
- **Layer:** System example
- **Connects to:** `article-digest.md`, `docs/CUSTOMIZATION.md`, report and PDF workflows
- **Read this when:** You want to shape proof points for user reuse.

## `examples/ats-normalization-test.md`
- **Category:** Test fixture documentation
- **Purpose:** Provides problematic text and verification instructions for ATS normalization behavior.
- **Edited by:** Maintainers and contributors
- **Layer:** System example
- **Connects to:** `generate-pdf.mjs`, `modes/pdf.md`, ATS text-normalization logic
- **Read this when:** You are validating PDF text cleanup or normalization.

## `examples/cv-example.md`
- **Category:** Example content
- **Purpose:** Shows the expected markdown structure for `cv.md`.
- **Edited by:** Maintainers and contributors
- **Layer:** System example
- **Connects to:** `cv.md`, `docs/SETUP.md`, `modes/pdf.md`, `generate-pdf.mjs`
- **Read this when:** You need a reference CV format.

## `examples/dual-track-engineer-instructor/README.md`
- **Category:** Example package guide
- **Purpose:** Explains the dual-track example and how its files should be interpreted together.
- **Edited by:** Maintainers and contributors
- **Layer:** System example
- **Connects to:** `examples/dual-track-engineer-instructor/cv.md`, `examples/cv-example.md`, role-positioning docs
- **Read this when:** You want a richer persona example.

## `examples/dual-track-engineer-instructor/cv.md`
- **Category:** Example CV
- **Purpose:** Sample markdown CV for the dual-track example persona.
- **Edited by:** Maintainers and contributors
- **Layer:** System example
- **Connects to:** `examples/dual-track-engineer-instructor/README.md`, `examples/cv-example.md`, `modes/pdf.md`
- **Read this when:** You want an extended CV example rather than a minimal template.

## `examples/sample-report.md`
- **Category:** Example report
- **Purpose:** Shows the expected shape of a generated evaluation report.
- **Edited by:** Maintainers and contributors
- **Layer:** System example
- **Connects to:** `modes/offer.md`, `modes/auto-pipeline.md`, `reports/*`, `interview-prep/story-bank.md`
- **Read this when:** You want to see what the A–F output should look like.

## `interview-prep/`

## `interview-prep/story-bank.md`
- **Category:** User working document
- **Purpose:** Stores reusable STAR-style stories and reflections that accumulate over time.
- **Edited by:** Users and workflows
- **Layer:** User
- **Connects to:** `modes/interview-prep.md`, `modes/offer.md`, generated interview-prep outputs
- **Read this when:** You are building or reusing interview stories.

## `modes/` root files

## `modes/README.md`
- **Category:** Modes index
- **Purpose:** Explains the structure of the `modes/` directory, including shared files, root modes, and language folders.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `docs/README.md`, `docs/FILE_MAP.md`, `modes/_shared.md`, `modes/_profile.template.md`, `modes/*/*`
- **Read this when:** You need to understand where prompt behavior lives.

## `modes/_profile.template.md`
- **Category:** User customization template
- **Purpose:** Starter template for the user-specific `modes/_profile.md` file.
- **Edited by:** Maintainers
- **Layer:** System template
- **Connects to:** `CLAUDE.md`, `DATA_CONTRACT.md`, `docs/CUSTOMIZATION.md`, `modes/_profile.md`
- **Read this when:** You are creating or updating the profile customization template.

## `modes/_shared.md`
- **Category:** Shared mode foundation
- **Purpose:** Defines common scoring logic, reusable instructions, and shared workflow rules for the default mode set.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** root mode files in `modes/`, `DATA_CONTRACT.md`, `docs/CUSTOMIZATION.md`, localized `_shared.md` variants
- **Read this when:** You are changing system-wide prompt logic.

## `modes/apply.md`
- **Category:** Root mode
- **Purpose:** Guides live application assistance while keeping the user in control of submission.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `modes/_shared.md`, `modes/auto-pipeline.md`, `data/applications.md`, `reports/*`
- **Read this when:** You are working on application-form guidance.

## `modes/auto-pipeline.md`
- **Category:** Root mode
- **Purpose:** Orchestrates the end-to-end path from JD or URL to evaluation, PDF generation, and tracker updates.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `modes/_shared.md`, `modes/offer.md`, `modes/pdf.md`, `modes/tracker.md`, `reports/*`, `output/*`
- **Read this when:** You want the full single-job workflow.

## `modes/batch.md`
- **Category:** Root mode
- **Purpose:** Coordinates parallel offer processing using worker prompts.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `modes/_shared.md`, `batch/batch-prompt.md`, `reports/*`, tracker merge scripts
- **Read this when:** You are changing multi-job orchestration.

## `modes/compare.md`
- **Category:** Root mode
- **Purpose:** Compares evaluated jobs and ranks or contrasts them for decision-making.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `modes/_shared.md`, `reports/*`, tracker data
- **Read this when:** You are changing multi-offer comparison logic.

## `modes/de/` — German

## `modes/de/README.md`
- **Category:** Localized modes guide
- **Purpose:** Explains when and how to use the German / DACH mode set.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/de/_shared.md`, `modes/de/angebot.md`, `modes/de/bewerben.md`, `modes/de/pipeline.md`, `modes/README.md`
- **Read this when:** You are working on German-language workflows.

## `modes/de/_shared.md`
- **Category:** Localized shared mode foundation
- **Purpose:** German shared instruction layer for DACH-specific evaluation and workflow context.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/de/angebot.md`, `modes/de/bewerben.md`, `modes/de/pipeline.md`, `modes/_shared.md`
- **Read this when:** You are changing the shared German prompt base.

## `modes/de/angebot.md`
- **Category:** Localized root mode
- **Purpose:** German translation and adaptation of the offer-evaluation workflow.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/de/_shared.md`, `modes/offer.md`, `reports/*`
- **Read this when:** You are changing German offer evaluation.

## `modes/de/bewerben.md`
- **Category:** Localized root mode
- **Purpose:** German translation and adaptation of the live application-assistant workflow.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/de/_shared.md`, `modes/apply.md`, application workflows
- **Read this when:** You are changing German application assistance.

## `modes/de/pipeline.md`
- **Category:** Localized root mode
- **Purpose:** German translation and adaptation of the URL inbox pipeline workflow.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/de/_shared.md`, `modes/pipeline.md`, `data/pipeline.md`
- **Read this when:** You are changing German inbox processing.

## `modes/deep.md`
- **Category:** Root mode
- **Purpose:** Runs deeper research on companies, context, and decision-relevant signals beyond the base evaluation.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `modes/_shared.md`, `reports/*`, research flows
- **Read this when:** You are changing deep-research behavior.

## `modes/esp/` — Spanish

## `modes/esp/apply.md`
- **Category:** Localized root mode
- **Purpose:** Spanish-language live application assistant.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** Spanish mode set, `modes/apply.md`, Spanish shared behavior
- **Read this when:** You are changing Spanish application assistance.

## `modes/esp/auto-pipeline.md`
- **Category:** Localized root mode
- **Purpose:** Spanish-language full URL-to-report pipeline.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** Spanish mode set, `modes/auto-pipeline.md`, tracker and PDF workflows
- **Read this when:** You are changing Spanish pipeline orchestration.

## `modes/esp/batch.md`
- **Category:** Localized root mode
- **Purpose:** Spanish-language batch evaluation orchestration.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `batch/batch-prompt.md`, `modes/batch.md`, Spanish shared behavior
- **Read this when:** You are changing Spanish batch processing.

## `modes/esp/contacto.md`
- **Category:** Localized root mode
- **Purpose:** Spanish-language outreach and networking prompt.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/outreach.md`, Spanish mode set
- **Read this when:** You are changing Spanish outreach behavior.

## `modes/esp/deep.md`
- **Category:** Localized root mode
- **Purpose:** Spanish-language deep research prompt.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/deep.md`, Spanish mode set
- **Read this when:** You are changing Spanish deep-research behavior.

## `modes/esp/oferta.md`
- **Category:** Localized root mode
- **Purpose:** Spanish-language A–F offer evaluation prompt.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/offer.md`, Spanish shared behavior, `reports/*`
- **Read this when:** You are changing Spanish offer evaluation.

## `modes/esp/ofertas.md`
- **Category:** Localized root mode
- **Purpose:** Spanish-language multi-offer comparison prompt.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/compare.md`, Spanish mode set, `reports/*`
- **Read this when:** You are changing Spanish offer comparison.

## `modes/esp/pdf.md`
- **Category:** Localized root mode
- **Purpose:** Spanish-language PDF and CV-generation prompt.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/pdf.md`, `generate-pdf.mjs`, Spanish mode set
- **Read this when:** You are changing Spanish PDF generation.

## `modes/esp/pipeline.md`
- **Category:** Localized root mode
- **Purpose:** Spanish-language URL inbox workflow.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/pipeline.md`, `data/pipeline.md`, Spanish mode set
- **Read this when:** You are changing Spanish pipeline processing.

## `modes/esp/project.md`
- **Category:** Localized root mode
- **Purpose:** Spanish-language portfolio project evaluation prompt.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/project.md`, Spanish mode set
- **Read this when:** You are changing Spanish project evaluation.

## `modes/esp/scan.md`
- **Category:** Localized root mode
- **Purpose:** Spanish-language portal scanning prompt.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/scan.md`, `portals.yml`, Spanish mode set
- **Read this when:** You are changing Spanish scan behavior.

## `modes/esp/tracker.md`
- **Category:** Localized root mode
- **Purpose:** Spanish-language tracker-review prompt.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/tracker.md`, `data/applications.md`, Spanish mode set
- **Read this when:** You are changing Spanish tracker behavior.

## `modes/esp/training.md`
- **Category:** Localized root mode
- **Purpose:** Spanish-language training and certification evaluation prompt.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/training.md`, Spanish mode set
- **Read this when:** You are changing Spanish training evaluation.

## `modes/fr/` — French

## `modes/fr/README.md`
- **Category:** Localized modes guide
- **Purpose:** Explains when and how to use the French mode set.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/fr/_shared.md`, `modes/fr/offre.md`, `modes/fr/pipeline.md`, `modes/fr/postuler.md`, `modes/README.md`
- **Read this when:** You are working on French-language workflows.

## `modes/fr/_shared.md`
- **Category:** Localized shared mode foundation
- **Purpose:** French shared instruction layer for localized workflow behavior.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/fr/offre.md`, `modes/fr/pipeline.md`, `modes/fr/postuler.md`, `modes/_shared.md`
- **Read this when:** You are changing the shared French prompt base.

## `modes/fr/offre.md`
- **Category:** Localized root mode
- **Purpose:** French translation and adaptation of the offer evaluation flow.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/fr/_shared.md`, `modes/offer.md`, `reports/*`
- **Read this when:** You are changing French offer evaluation.

## `modes/fr/pipeline.md`
- **Category:** Localized root mode
- **Purpose:** French translation and adaptation of the pipeline inbox flow.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/fr/_shared.md`, `modes/pipeline.md`, `data/pipeline.md`
- **Read this when:** You are changing French pipeline processing.

## `modes/fr/postuler.md`
- **Category:** Localized root mode
- **Purpose:** French translation and adaptation of the application-assistant flow.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/fr/_shared.md`, `modes/apply.md`, application workflows
- **Read this when:** You are changing French application assistance.

## `modes/interview-prep.md`
- **Category:** Root mode
- **Purpose:** Turns reports and existing stories into interview preparation packs and story-bank updates.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `modes/_shared.md`, `interview-prep/story-bank.md`, `reports/*`
- **Read this when:** You are changing interview-prep behavior.

## `modes/ko/` — Korean

## `modes/ko/README.md`
- **Category:** Localized modes guide
- **Purpose:** Explains when and how to use the Korean mode set.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/ko/_shared.md`, `modes/ko/apply.md`, `modes/ko/offer.md`, `modes/ko/pipeline.md`, `modes/README.md`
- **Read this when:** You are working on Korean-language workflows.

## `modes/ko/_shared.md`
- **Category:** Localized shared mode foundation
- **Purpose:** Korean shared instruction layer for local workflow behavior and terminology.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/ko/apply.md`, `modes/ko/offer.md`, `modes/ko/pipeline.md`, `modes/_shared.md`
- **Read this when:** You are changing the shared Korean prompt base.

## `modes/ko/apply.md`
- **Category:** Localized root mode
- **Purpose:** Korean translation and adaptation of the application-assistant flow.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/ko/_shared.md`, `modes/apply.md`, application workflows
- **Read this when:** You are changing Korean application assistance.

## `modes/ko/offer.md`
- **Category:** Localized root mode
- **Purpose:** Korean translation and adaptation of the offer-evaluation flow.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/ko/_shared.md`, `modes/offer.md`, `reports/*`
- **Read this when:** You are changing Korean offer evaluation.

## `modes/ko/pipeline.md`
- **Category:** Localized root mode
- **Purpose:** Korean translation and adaptation of the URL inbox flow.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/ko/_shared.md`, `modes/pipeline.md`, `data/pipeline.md`
- **Read this when:** You are changing Korean pipeline processing.

## `modes/offer.md`
- **Category:** Root mode
- **Purpose:** Runs the main A–F evaluation flow for a single job opportunity.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `modes/_shared.md`, `reports/*`, `interview-prep/story-bank.md`, `modes/pdf.md`
- **Read this when:** You are changing the core scoring and evaluation output.

## `modes/outreach.md`
- **Category:** Root mode
- **Purpose:** Provides networking and contact-outreach assistance.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `modes/_shared.md`, `modes/deep.md`, external contact research workflows
- **Read this when:** You are changing outreach guidance.

## `modes/patterns.md`
- **Category:** Root mode
- **Purpose:** Analyzes report history to detect rejection patterns and targeting mistakes.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `analyze-patterns.mjs`, `reports/*`, `modes/_shared.md`
- **Read this when:** You are changing pattern-analysis behavior.

## `modes/pdf.md`
- **Category:** Root mode
- **Purpose:** Defines ATS-safe CV structure, keyword-injection rules, and PDF-generation guidance.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `generate-pdf.mjs`, `templates/cv-template.html`, `examples/cv-example.md`, `examples/ats-normalization-test.md`
- **Read this when:** You are changing CV or PDF output behavior.

## `modes/pipeline.md`
- **Category:** Root mode
- **Purpose:** Processes queued job URLs from `data/pipeline.md` and runs the full workflow for each pending item.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `data/pipeline.md`, `modes/auto-pipeline.md`, `reports/*`, `cv-sync-check.mjs`
- **Read this when:** You are changing inbox processing.

## `modes/project.md`
- **Category:** Root mode
- **Purpose:** Evaluates portfolio or project ideas by career relevance and interview value.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `modes/_shared.md`, report-style outputs, portfolio strategy docs
- **Read this when:** You are changing project-evaluation behavior.

## `modes/pt/` — Portuguese

## `modes/pt/README.md`
- **Category:** Localized modes guide
- **Purpose:** Explains when and how to use the Brazilian Portuguese mode set.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/pt/_shared.md`, `modes/pt/aplicar.md`, `modes/pt/oferta.md`, `modes/pt/pipeline.md`, `modes/README.md`
- **Read this when:** You are working on Portuguese-language workflows.

## `modes/pt/_shared.md`
- **Category:** Localized shared mode foundation
- **Purpose:** Portuguese shared instruction layer for Brazilian market-specific behavior.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/pt/aplicar.md`, `modes/pt/oferta.md`, `modes/pt/pipeline.md`, `modes/_shared.md`
- **Read this when:** You are changing the shared Portuguese prompt base.

## `modes/pt/aplicar.md`
- **Category:** Localized root mode
- **Purpose:** Portuguese translation and adaptation of the live application workflow.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/pt/_shared.md`, `modes/apply.md`, application workflows
- **Read this when:** You are changing Portuguese application assistance.

## `modes/pt/oferta.md`
- **Category:** Localized root mode
- **Purpose:** Portuguese translation and adaptation of the A–F offer-evaluation flow.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/pt/_shared.md`, `modes/offer.md`, `reports/*`
- **Read this when:** You are changing Portuguese offer evaluation.

## `modes/pt/pipeline.md`
- **Category:** Localized root mode
- **Purpose:** Portuguese translation and adaptation of the URL inbox workflow.
- **Edited by:** Maintainers and translators
- **Layer:** System
- **Connects to:** `modes/pt/_shared.md`, `modes/pipeline.md`, `data/pipeline.md`
- **Read this when:** You are changing Portuguese pipeline processing.

## `modes/scan.md`
- **Category:** Root mode
- **Purpose:** Defines portal discovery logic, scanning strategy, and offer-collection workflow.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `portals.yml`, `templates/portals.example.yml`, `data/scan-history.tsv`, `modes/_shared.md`
- **Read this when:** You are changing job-discovery behavior.

## `modes/tracker.md`
- **Category:** Root mode
- **Purpose:** Summarizes and operates on application-tracker data.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `data/applications.md`, `templates/states.yml`, tracker utility scripts
- **Read this when:** You are changing tracker status or overview behavior.

## `modes/training.md`
- **Category:** Root mode
- **Purpose:** Evaluates training, courses, or certifications against the user's strategy.
- **Edited by:** Maintainers and contributors
- **Layer:** System
- **Connects to:** `modes/_shared.md`, learning-decision outputs
- **Read this when:** You are changing training-evaluation behavior.
