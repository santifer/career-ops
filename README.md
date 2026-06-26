# Career-Ops CNX

**CNX-hardened Career-Ops for human-in-the-loop job search operations.**

`career-ops-cnx` is a governance-focused fork of [`santifer/career-ops`](https://github.com/santifer/career-ops).
The original project turns AI coding CLIs into a job-search command center. This fork keeps that practical foundation and adds a stricter operating boundary:

> AI may assist, analyze, draft, score, filter, and organize.
> AI must not silently authorize actions, invent career facts, submit applications, mutate external systems, or convert uncertainty into user action.

This fork is for job seekers who want the leverage of AI-assisted career operations without turning their job search into an uncontrolled automation pipeline.

---

## Status

```text
Project: career-ops-cnx
Fork origin: santifer/career-ops
Current focus: CNX/SCL hardening
Default posture: human-in-the-loop
Implementation status: early fork hardening
Authority posture: no silent action authorization
```

This fork is currently in a hardening phase. Some inherited upstream files, modes, translations, and workflows may still reflect the original project until they are reviewed and updated.

Do not treat this fork as independently audited or fully CNX-compliant until the PMT/RIM review, policy gates, fallback paths, and audit replay checks are complete.

---

## Attribution

This repository is a fork of the original **Career-Ops** project by Santiago Fernández de Valderrama:

* Original repository: [`santifer/career-ops`](https://github.com/santifer/career-ops)
* Original project website: [`career-ops.org`](https://career-ops.org)
* Original license: MIT, subject to the upstream license and trademark policy

This fork is maintained separately by Ivan Silva / Carlonoscopen, LLC for CNX/SCL hardening, governance review, local-first privacy, and authority-separation research.

This fork is not presented as an official upstream release unless explicitly accepted upstream.

---

## What Is Career-Ops CNX?

Career-Ops CNX is a candidate-side job-search operations system.

It helps a job seeker:

* evaluate job descriptions,
* compare roles against a CV and profile,
* generate tailored CV drafts,
* generate cover letter drafts,
* prepare interview stories,
* scan job portals,
* track applications,
* identify stale, suspicious, or low-fit postings,
* preserve a structured job-search pipeline.

The CNX fork adds a stronger safety frame:

* **No auto-submit by default**
* **No invented experience**
* **No silent cloud calls**
* **No silent career-impacting decisions**
* **No mutation without policy**
* **No action without fallback**
* **No confidence without evidence framing**
* **No job-search automation that bypasses the user**

---

## Why This Matters

Companies increasingly use ATS filters, automated ranking, AI-assisted screening, and structured hiring workflows.

Job seekers often still operate with scattered spreadsheets, manual rewriting, fragile memory, and emotional fatigue.

Career-Ops CNX aims to give job seekers a structured operating layer while keeping the human in control.

The goal is not to spam employers.

The goal is to help a candidate answer:

```text
Is this role worth my time?
Does my actual background support this application?
What evidence do I have?
What should I tailor?
What should I avoid claiming?
What is stale, fake, low-quality, or risky?
What action, if any, should I take next?
```

---

## CNX Operating Principle

```text
Passing an AI evaluation is not action authorization.
A polished career artifact is not proof.
A score is not truth.
A recommendation is not permission.
The user remains the authority boundary.
```

Career-Ops CNX separates:

```text
claim
evidence
source
recommendation
policy
action
audit
```

The system may help produce artifacts, but the user must review and approve anything that affects external systems, employers, applications, accounts, or personal representation.

---

## Core Safety Rules

Career-Ops CNX follows these non-negotiable rules.

### 1. No automatic application submission

The system must not click final submit, confirm, accept, purchase, authorize, or equivalent external-action buttons.

Form-filling assistance must stop before irreversible submission.

### 2. No invented career facts

Generated CVs, cover letters, reports, and interview stories must not invent:

* employers,
* job titles,
* dates,
* credentials,
* education,
* certifications,
* publications,
* patents,
* salary history,
* work authorization,
* metrics,
* responsibilities,
* achievements,
* tools or skills not supported by the user's source material.

### 3. Human review is mandatory

All generated career artifacts are drafts.

The user must review them before use.

### 4. Cloud routes must be visible

Any cloud AI provider route must disclose:

* provider,
* model or service,
* privacy route,
* likely data exposure,
* cost risk,
* fallback path.

### 5. Local-first where feasible

For private CV/profile processing, local or user-controlled model routes should be preferred when practical.

### 6. Stale or suspicious postings route to fallback

Unverified, stale, scam-like, or low-confidence postings should be flagged for review, not treated as trustworthy opportunities.

### 7. No hidden authority escalation

An AI coding CLI must not reinterpret a mode, command, prompt, or workflow as permission to perform higher-authority actions.

---

## SCL Primitive Chain

This fork uses the SCL/CNX primitive chain as its design model:

```text
REFERENCE -> PROJECT -> SIGNATURE -> BZ_REFINE ->
VALIDATE -> POLICY -> ACT/FALLBACK -> LOG
```

For Career-Ops CNX, this means:

| Primitive   | Career-Ops CNX Meaning                                                            |
| ----------- | --------------------------------------------------------------------------------- |
| `REFERENCE` | CV, profile, proof points, preferences, modes, templates, portal config           |
| `PROJECT`   | Job description, job URL, ATS feed, company page, pipeline state                  |
| `SIGNATURE` | Fit score, role archetype, risk signal, legitimacy signal, gap analysis           |
| `BZ_REFINE` | Draft CV, draft cover letter, interview prep, negotiation script, recommendation  |
| `VALIDATE`  | Liveness check, trust check, source check, tracker integrity, user evidence check |
| `POLICY`    | Human-in-loop gate, no-auto-submit rule, privacy/cost boundary                    |
| `ACT`       | Generate report, generate PDF, update local tracker, archive posting              |
| `FALLBACK`  | Safe no-op, manual review, skip posting, preserve existing state                  |
| `LOG`       | Report, tracker entry, pipeline state, audit record                               |

---

## Authority Levels

Career-Ops CNX separates actions by authority level.

| Level | Meaning               | Allowed Examples                                                      | Not Allowed                                           |
| ----- | --------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| L1    | Report-only           | analyze JD, summarize role, flag risks, suggest questions             | write files, alter tracker, submit forms              |
| L2    | Assisted local action | generate local report, generate PDF, update tracker after user intent | external submit, deploy, delete, spend money          |
| L3    | High-authority action | future explicit workflows with verifier and rollback                  | silent external mutation, auto-apply, account actions |

Current default target: **L1/L2 only**.

No L3 workflow should be considered safe until independently reviewed, policy-gated, and audit-replayable.

---

## Features Inherited from Career-Ops

This fork inherits the upstream Career-Ops architecture, including support for:

| Feature           | Description                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Job evaluation    | Structured role evaluation against the user's CV/profile                                       |
| CV tailoring      | Draft ATS-oriented CV variants based on a job description                                      |
| Cover letters     | Draft cover letters with user review                                                           |
| Portal scanning   | Scan configured job portals and ATS feeds                                                      |
| Liveness checks   | Verify whether postings still appear active                                                    |
| Pipeline tracking | Track roles, reports, statuses, and application workflow                                       |
| Batch processing  | Evaluate multiple jobs with worker prompts                                                     |
| Dashboard         | Terminal UI for browsing and updating pipeline state                                           |
| Multi-CLI support | Claude Code, OpenCode, Antigravity CLI, Codex, Qwen, Grok Build CLI, and compatible agent CLIs |

Inherited features should be treated as under review until CNX hardening is complete.

---

## CNX Hardening Roadmap

### Phase 1 — PMT/RIM Structural Review

Goal: inspect the project as a whole system before changing behavior.

Deliverables:

* source integrity review,
* dependency graph,
* folder/file authority map,
* action inventory,
* external access inventory,
* mutation surface inventory,
* risk register,
* test matrix,
* first policy boundary.

### Phase 2 — Policy and Guardrail Hardening

Goal: enforce rules in agent instructions, modes, and runtime scripts.

Targets:

* no-auto-submit policy,
* no invented career facts,
* evidence-bounded CV generation,
* cloud disclosure,
* local-first guidance,
* explicit fallback paths,
* CLI wrapper parity.

### Phase 3 — Validation and Audit

Goal: make the system replayable and safer under failure.

Targets:

* tracker backup/recovery,
* audit records for generated artifacts,
* liveness uncertainty handling,
* scam/ghost job fallback,
* batch budget controls,
* report regeneration checks,
* test coverage for denial paths.

### Phase 4 — Local-First Evaluation

Goal: reduce privacy and cost risk.

Targets:

* Ollama/local evaluator profile,
* cloud route disclosure,
* provider capability registry,
* user-controlled model selection,
* privacy-preserving default modes.

---

## Quick Start

This fork should currently be installed manually from GitHub.

```bash
git clone https://github.com/ivan33609/career-ops-cnx.git
cd career-ops-cnx
npm install
```

Install Chromium for PDF generation and browser-based verification:

```bash
npx playwright install chromium
```

Run the project health check:

```bash
npm run doctor
```

Create your local profile and portal configuration:

```bash
cp config/profile.example.yml config/profile.yml
cp templates/portals.example.yml portals.yml
```

Create your CV file:

```text
cv.md
```

Optional proof-point file:

```text
article-digest.md
```

Then open the project with your AI coding CLI:

```bash
claude
# or
opencode
# or
agy
# or another supported CLI
```

---

## Important Installation Note

The upstream project may provide an `npx @santifer/career-ops init` installer.

That command installs the upstream package, not necessarily this CNX fork.

For this fork, use the GitHub clone command above unless a dedicated CNX package is released later.

---

## Usage

The inherited command interface is centered around `/career-ops`.

Typical commands include:

```text
/career-ops                -> Show available commands
/career-ops {paste a JD}   -> Evaluate a job description
/career-ops scan           -> Scan configured portals
/career-ops pdf            -> Generate a CV PDF draft
/career-ops cover          -> Generate a cover letter draft
/career-ops batch          -> Batch evaluate roles
/career-ops tracker        -> View or manage application tracking
/career-ops pipeline       -> Process pending URLs
/career-ops deep           -> Research a company or role
/career-ops training       -> Evaluate a course or certification
/career-ops project        -> Evaluate a portfolio project
```

Use `/career-ops apply` only with extreme caution.

CNX policy requires that any form-filling workflow stop before final submission unless the user manually acts outside the agent. This fork should not be used as an auto-application bot.

---

## Recommended First Run

Start with a single job description, not a batch.

```text
/career-ops {paste one job description}
```

Then review:

```text
reports/
output/
data/pipeline.md
```

Before using any generated CV or cover letter, check:

```text
Does every claim come from my actual background?
Are all dates, employers, titles, and metrics accurate?
Did the system overstate my experience?
Did it add tools or skills I do not actually have?
Is the role still live?
Is the company/posting legitimate?
Do I want to apply?
```

---

## Local-First and Privacy

This project may process sensitive personal data, including:

* CV,
* employment history,
* contact details,
* salary preferences,
* career goals,
* immigration/work authorization context,
* writing samples,
* interview stories,
* application history.

Before using any cloud model, understand where your data is going.

Preferred privacy posture:

```text
local model first where feasible
explicit cloud disclosure where not
no silent provider fallback
no hidden paid call
no upload of private career data without user awareness
```

If using local models, review the inherited local/Ollama evaluator support and budget documentation.

---

## Job Posting Trust

Career-Ops CNX should not blindly trust a job feed.

Job postings may be:

* stale,
* duplicated,
* fake,
* scam-like,
* closed but still listed,
* location-mismatched,
* compensation-misleading,
* seniority-mismatched,
* harvested from unreliable sources.

Use verification where possible:

```bash
node scan.mjs --verify
```

Uncertain postings should be routed to manual review.

---

## Project Structure

The inherited project structure is approximately:

```text
career-ops-cnx/
├── AGENTS.md                    # Canonical agent instructions
├── CLAUDE.md                    # Claude Code wrapper
├── OPENCODE.md                  # OpenCode wrapper
├── GEMINI.md                    # Gemini / Antigravity compatibility guard
├── cv.md                        # Your CV, created locally
├── article-digest.md            # Optional proof points, created locally
├── config/
│   └── profile.example.yml      # Profile template
├── modes/                       # Skill modes
│   ├── _shared.md
│   ├── oferta.md
│   ├── pdf.md
│   ├── cover.md
│   ├── scan.md
│   ├── batch.md
│   └── ...
├── templates/
│   ├── cv-template.html
│   ├── portals.example.yml
│   └── states.yml
├── batch/
│   ├── batch-prompt.md
│   └── batch-runner.sh
├── dashboard/                   # Go terminal dashboard
├── data/                        # Local tracking data, usually gitignored
├── reports/                     # Generated reports, usually gitignored
├── output/                      # Generated PDFs, usually gitignored
├── docs/                        # Documentation
├── providers/                   # Job source providers
├── jds/                         # Job descriptions
└── examples/                    # Sample artifacts
```

Future CNX-specific documentation may be added under:

```text
docs/cnx/
```

Suggested CNX documents:

```text
docs/cnx/PMT_RIM_PHASE1_REVIEW.md
docs/cnx/AUTHORITY_POLICY.md
docs/cnx/NO_AUTO_SUBMIT_POLICY.md
docs/cnx/CLOUD_AND_PRIVACY_POLICY.md
docs/cnx/RISK_REGISTER.md
docs/cnx/AUDIT_REPLAY_REQUIREMENTS.md
```

---

## Development Policy for This Fork

Before changing behavior, follow the PMT/RIM discipline:

```text
1. Review the project as a structural manifold.
2. Map folders and files to authority levels.
3. Identify external access.
4. Identify mutation surfaces.
5. Identify fallback paths.
6. Identify audit requirements.
7. Derive tests.
8. Only then modify code.
```

No code change should add a new action path without answering:

```text
What does it consume?
What does it produce?
Does it mutate state?
Can it affect an external system?
What policy authorizes it?
What fallback exists?
How is it logged?
How can it be replayed?
```

---

## Testing

Run the inherited test suite:

```bash
npm test
```

Run the all-in-one test script if available:

```bash
node test-all.mjs
```

Run setup validation:

```bash
npm run doctor
```

Run specific validation scripts as needed:

```bash
node verify-pipeline.mjs
node verify-portals.mjs
node test-trust-validator.mjs
node tracker-columns-tests.mjs
```

Before accepting a CNX hardening change, denial paths must also be tested.

No acceptance if:

```text
an invalid career claim is generated without warning
an uncertain validator authorizes action
a form flow can silently submit
a cloud route runs without disclosure
a tracker mutation lacks recovery
a batch workflow lacks budget limits
a policy denial lacks fallback or safe no-op
```

---

## Security and Safety

This project handles sensitive career data.

Do not commit:

```text
cv.md
config/profile.yml
article-digest.md
data/
reports/
output/
.env
.env.local
private writing samples
salary history
personal contact data
application history
```

Check `.gitignore` before committing.

Use local test data when contributing.

---

## Not a Hosted Service

Career-Ops CNX is local open-source software.

The maintainers of this fork do not collect, host, or process your CV, job-search data, generated reports, or application materials.

However, your chosen AI provider, browser automation target, or job portal may receive data depending on how you configure and use the tool.

You are responsible for reviewing provider terms, portal terms, privacy implications, and generated artifacts.

---

## Legal and Employment Disclaimer

This software does not guarantee interviews, offers, salary outcomes, visa outcomes, or employment.

Generated evaluations are recommendations, not truth.

Generated CVs, cover letters, and interview material are drafts, not verified personal records.

You are responsible for ensuring that every application, CV, cover letter, portfolio claim, and interview answer is accurate and lawful.

Do not use this tool to spam employers, bypass platform rules, misrepresent yourself, or overwhelm applicant tracking systems.

See the inherited `LEGAL_DISCLAIMER.md`, `LICENSE`, `SECURITY.md`, and `TRADEMARK.md` files for additional terms.

---

## License

This fork preserves the upstream MIT license unless otherwise stated.

See:

```text
LICENSE
TRADEMARK.md
LEGAL_DISCLAIMER.md
```

The `career-ops` name and branding may be subject to the upstream trademark policy. This fork uses the name `career-ops-cnx` to distinguish the CNX hardening work from the original project.

---

## Contributing

Contributions are welcome if they strengthen the human-in-the-loop, privacy-preserving, evidence-bounded direction of the fork.

High-priority contribution areas:

* no-auto-submit enforcement,
* evidence-bounded CV generation,
* local/Ollama evaluation routes,
* cloud disclosure,
* tracker backup/recovery,
* liveness uncertainty handling,
* scam/ghost-job detection,
* audit replay,
* CLI wrapper parity,
* prompt-injection resistance,
* test coverage for denial paths.

Please avoid changes that encourage:

* spray-and-pray applications,
* fabricated career claims,
* silent cloud usage,
* hidden provider fallback,
* autonomous submission,
* employer spam,
* bypassing portal restrictions,
* replacing user judgment with model confidence.

---

## Maintainer Note

This fork is part of a broader CNX/SCL research and engineering direction:

```text
CNX prevents intelligence from silently becoming authority.
SCL structures the primitive chain from reference to action.
PMT unfolds the project before implementation.
RIM tests whether the unfolded structure can safely become action.
```

In this repository, that means job-search automation must remain accountable to the job seeker, bounded by evidence, and safe under uncertainty.

---

## Original Project Credit

Career-Ops was originally created by Santiago Fernández de Valderrama.

If you want the original project, visit:

```text
https://github.com/santifer/career-ops
https://career-ops.org
```

This fork exists because the original idea is valuable: job seekers need leverage too.

Career-Ops CNX aims to preserve that value while adding stronger governance, privacy, auditability, and authority separation.
