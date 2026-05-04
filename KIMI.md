# Career-Ops — AI Job Search Pipeline (Kimi CLI)



> This file is the Kimi CLI equivalent of `CLAUDE.md` and `GEMINI.md`.
>
> It is **not** auto-loaded by Kimi CLI — it is a human-readable reference for Kimi CLI users. Skills are discovered natively from `.kimi/skills/`.



## What is career-ops



AI-powered job search automation: pipeline tracking, offer evaluation, CV generation, portal scanning, batch processing. Originally built on Claude Code, now fully supported on Gemini CLI, OpenCode, and Kimi CLI.



## Data Contract (CRITICAL)



**User Layer (NEVER auto-updated — your personalizations live here):**



* `cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, `portals.yml`

* `data/*`, `reports/*`, `output/*`, `interview-prep/*`



**System Layer (auto-updatable — do NOT put user data here):**



* `modes/_shared.md`, `modes/oferta.md`, all other modes

* `KIMI.md`, `CLAUDE.md`, `GEMINI.md`, `*.mjs` scripts, `templates/*`, `batch/*`



**THE RULE:** When the user asks to customize anything (archetypes, narrative, negotiation scripts, proof points, location policy, comp targets), ALWAYS write to `modes/_profile.md` or `config/profile.yml`. NEVER edit `modes/_shared.md` for user-specific content.



## Update Check



On the first message of each session, run the update checker silently:



```

node update-system.mjs check

```



Parse the JSON output:



* `{"status": "update-available", ...}` → tell the user an update is available and ask if they want to apply it (`node update-system.mjs apply`)

* `{"status": "up-to-date"}` → say nothing

* `{"status": "dismissed"}` or `{"status": "offline"}` → say nothing



## Kimi CLI Setup



Install Kimi CLI:



```bash

# Recommended

curl -LsSf https://code.kimi.com/install.sh | bash



# Then authenticate

kimi login

```



Run in the career-ops directory:



```bash

cd career-ops

kimi

```



Kimi CLI discovers skills natively from `.kimi/skills/` and injects them into the system prompt. You can also invoke a skill explicitly with `/skill:<name>`.



## Kimi CLI Skills

When using [Kimi CLI](https://code.kimi.com/), the following skills are auto-discovered from `.kimi/skills/` and injected into the system prompt:

| Skill | Claude Code Equivalent | Description | Invocation |
|-------|------------------------|-------------|------------|
| `career-ops` | `/career-ops` | Show menu or evaluate JD | Auto-loaded, or `/skill:career-ops` |
| `career-ops-pipeline` | `/career-ops pipeline` | Process pending URLs from inbox | `/skill:career-ops-pipeline` |
| `career-ops-evaluate` | `/career-ops oferta` | Evaluate job offer (A-G scoring) | `/skill:career-ops-evaluate` |
| `career-ops-compare` | `/career-ops ofertas` | Compare and rank multiple offers | `/skill:career-ops-compare` |
| `career-ops-contact` | `/career-ops contacto` | LinkedIn outreach | `/skill:career-ops-contact` |
| `career-ops-deep` | `/career-ops deep` | Deep company research | `/skill:career-ops-deep` |
| `career-ops-pdf` | `/career-ops pdf` | Generate ATS-optimized CV | `/skill:career-ops-pdf` |
| `career-ops-training` | `/career-ops training` | Evaluate course/cert | `/skill:career-ops-training` |
| `career-ops-project` | `/career-ops project` | Evaluate portfolio project | `/skill:career-ops-project` |
| `career-ops-tracker` | `/career-ops tracker` | Application status overview | `/skill:career-ops-tracker` |
| `career-ops-apply` | `/career-ops apply` | Live application assistant | `/skill:career-ops-apply` |
| `career-ops-scan` | `/career-ops scan` | Scan portals for new offers | `/skill:career-ops-scan` |
| `career-ops-batch` | `/career-ops batch` | Batch processing | `/skill:career-ops-batch` |
| `career-ops-patterns` | `/career-ops patterns` | Analyze rejection patterns | `/skill:career-ops-patterns` |
| `career-ops-followup` | `/career-ops followup` | Follow-up cadence tracker | `/skill:career-ops-followup` |

**How to use:**
- **Implicit:** Just paste a JD or ask a question. The `career-ops` skill is auto-discovered and will route your request.
- **Explicit:** Type `/skill:career-ops-evaluate` followed by the job description to force a specific mode.

**All skills share the same evaluation logic** in `modes/*.md`. The `modes/` files are shared between Claude Code, OpenCode, Gemini CLI, and Kimi CLI.

> **Note:** Kimi CLI does not support Gemini-style TOML custom slash commands. Skills are the Kimi-native way to package reusable prompts. The old `.kimi/commands/*.toml` files have been moved to `.kimi/commands-deprecated/` for reference.



## Standalone API Script (No CLI install needed)



For users who want to evaluate job descriptions without installing Kimi CLI:



```bash

# 1. Get an API key at https://platform.moonshot.cn/

cp .env.example .env

# Edit .env → set MOONSHOT_API_KEY=your_key_here



# 2. Install dependencies

npm install



# 3. Evaluate a job description

node kimi-eval.mjs "We are looking for a Senior AI Engineer..."

node kimi-eval.mjs --file ./jds/my-job.txt

npm run kimi:eval -- "JD text here"

```



> **Free tier:** Moonshot AI offers free API quota for new accounts at platform.moonshot.cn. The standalone script defaults to `kimi-k2.6` (advanced reasoning, 256K context window). For faster, cheaper evaluations on simple JDs, switch to `moonshot-v1-8k` in `.env`.



## First Run — Onboarding



**Before doing anything else, check if the system is set up.** Run silently every session:



1\. Does `cv.md` exist?

2\. Does `config/profile.yml` exist (not just profile.example.yml)?

3\. Does `modes/_profile.md` exist (not just _profile.template.md)?

4\. Does `portals.yml` exist (not just templates/portals.example.yml)?



If `modes/_profile.md` is missing, copy from `modes/_profile.template.md` silently.



**If ANY of these is missing, enter onboarding mode.** Guide the user step by step — ask for their CV, fill the profile, set up the tracker. See `CLAUDE.md` for the full onboarding script (identical logic applies here).



## Skill Modes



| If the user... | Mode to load |

|---|---|

| Pastes JD or URL | auto-pipeline → read `modes/_shared.md` + `modes/auto-pipeline.md` |

| Asks to evaluate offer | read `modes/_shared.md` + `modes/oferta.md` |

| Asks to compare offers | read `modes/_shared.md` + `modes/ofertas.md` |

| Wants LinkedIn outreach | read `modes/_shared.md` + `modes/contacto.md` |

| Asks for company research | read `modes/deep.md` |

| Preps for interview | read `modes/interview-prep.md` |

| Wants to generate CV/PDF | read `modes/_shared.md` + `modes/pdf.md` |

| Evaluates a course/cert | read `modes/training.md` |

| Evaluates portfolio project | read `modes/project.md` |

| Asks about application status | read `modes/tracker.md` |

| Fills out application form | read `modes/_shared.md` + `modes/apply.md` |

| Searches for new offers | read `modes/_shared.md` + `modes/scan.md` |

| Processes pending URLs | read `modes/_shared.md` + `modes/pipeline.md` |

| Batch processes offers | read `modes/_shared.md` + `modes/batch.md` |

| Asks about rejection patterns | read `modes/patterns.md` |

| Asks about follow-ups | read `modes/followup.md` |



## Main Files



| File | Function |

|---|---|

| `data/applications.md` | Application tracker |

| `data/pipeline.md` | Inbox of pending URLs |

| `portals.yml` | Query and company config |

| `templates/cv-template.html` | HTML template for CVs |

| `generate-pdf.mjs` | Playwright: HTML to PDF |

| `article-digest.md` | Proof points from portfolio (optional) |

| `interview-prep/story-bank.md` | Accumulated STAR+R stories |

| `kimi-eval.mjs` | Standalone Moonshot API evaluator (no CLI required) |



## Ethical Use — CRITICAL



* **NEVER submit an application without the user reviewing it first.** Fill forms, draft answers, generate PDFs — but always STOP before clicking Submit. The user makes the final call.

* **Strongly discourage low-fit applications.** If a score is below 4.0/5, explicitly recommend against applying.

* **Quality over speed.** A well-targeted application to 5 companies beats a generic blast to 50.



## Pipeline Integrity



1\. **NEVER edit applications.md to ADD new entries** — Write TSV in `batch/tracker-additions/` and `node merge-tracker.mjs` handles the merge.

2\. Run `node verify-pipeline.mjs` to check health.

3\. All reports MUST include `**URL:**` and `**Legitimacy:**` in the header.

4\. All statuses MUST be canonical (see `templates/states.yml`).

