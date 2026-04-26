# Career-Ops -- AI Job Search Pipeline

## Origin

This system was built and used by [santifer](https://santifer.io) to evaluate 740+ job offers, generate 100+ tailored CVs, and land a Head of Applied AI role. The archetypes, scoring logic, negotiation scripts, and proof point structure all reflect his specific career search in AI/automation roles.

The portfolio that goes with this system is also open source: [cv-santiago](https://github.com/santifer/cv-santiago).

**It will work out of the box, but it's designed to be made yours.** If the archetypes don't match your career, the modes are in the wrong language, or the scoring doesn't fit your priorities -- just ask. You (AI Agent) can edit the user's files. The user says "change the archetypes to data engineering roles" and you do it. That's the whole point.

## Data Contract (CRITICAL)

There are two layers. Read `DATA_CONTRACT.md` for the full list.

**User Layer (NEVER auto-updated, personalization goes HERE):**
- `cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, `portals.yml`
- `data/*`, `reports/*`, `output/*`, `interview-prep/*`

**System Layer (auto-updatable, DON'T put user data here):**
- `modes/_shared.md`, `modes/oferta.md`, all other modes
- `CLAUDE.md`, `*.mjs` scripts, `dashboard/*`, `templates/*`, `batch/*`

**THE RULE: When the user asks to customize anything (archetypes, narrative, negotiation scripts, proof points, location policy, comp targets), ALWAYS write to `modes/_profile.md` or `config/profile.yml`. NEVER edit `modes/_shared.md` for user-specific content.** This ensures system updates don't overwrite their customizations.

## Update Check

On the first message of each session, run the update checker silently:

```bash
node update-system.mjs check
```

Parse the JSON output:
- `{"status": "update-available", "local": "1.0.0", "remote": "1.1.0", "changelog": "..."}` → tell the user:
  > "career-ops update available (v{local} → v{remote}). Your data (CV, profile, tracker, reports) will NOT be touched. Want me to update?"
  If yes → run `node update-system.mjs apply`. If no → run `node update-system.mjs dismiss`.
- `{"status": "up-to-date"}` → say nothing
- `{"status": "dismissed"}` → say nothing
- `{"status": "offline"}` → say nothing

The user can also say "check for updates" or "update career-ops" at any time to force a check.
To rollback: `node update-system.mjs rollback`

## What is career-ops

AI-powered job search automation built on Claude Code: pipeline tracking, offer evaluation, CV generation, portal scanning, batch processing.

### Main Files

| File | Function |
|------|----------|
| `data/applications.md` | Application tracker |
| `data/pipeline.md` | Inbox of pending URLs |
| `data/scan-history.tsv` | Scanner dedup history |
| `portals.yml` | Query and company config |
| `templates/cv-template.html` | HTML template for CVs |
| `generate-pdf.mjs` | Playwright: HTML to PDF |
| `article-digest.md` | Compact proof points from portfolio (optional) |
| `interview-prep/story-bank.md` | Accumulated STAR+R stories across evaluations |
| `interview-prep/{company}-{role}.md` | Company-specific interview intel reports |
| `analyze-patterns.mjs` | Pattern analysis script (JSON output) |
| `followup-cadence.mjs` | Follow-up cadence calculator (JSON output) |
| `data/follow-ups.md` | Follow-up history tracker |
| `scan.mjs` | Zero-token portal scanner — hits Greenhouse/Ashby/Lever APIs directly, zero LLM cost |
| `check-liveness.mjs` | Job posting liveness checker |
| `liveness-core.mjs` | Shared liveness logic (expired signals win over generic Apply text) |
| `reports/` | Evaluation reports (format: `{###}-{company-slug}-{YYYY-MM-DD}.md`). Blocks A-F + G (Posting Legitimacy). Header includes `**Legitimacy:** {tier}`. |
| `.claude/skills/headhunter/SKILL.md` | Skill `/headhunter` — orquestra 3 subagents (vaga-analyst, cv-strategist, recruiter-reviewer) para gerar CV hiper-personalizado por vaga sem inventar conteúdo. Reaproveita `modes/pdf.md` na Fase 5. |
| `.claude/agents/{vaga-analyst,cv-strategist,recruiter-reviewer}.md` | Subagents do time `/headhunter`, dispatcháveis via Task tool. |
| `.claude/commands/{cv-analyze,cv-strategy,cv-recruiter-check,tailor-cv}.md` | Slash commands granulares para uso cirúrgico de cada subagent + alias legado `/tailor-cv`. |
| `.claude/references/cv-playbook-2026.md` | Base de conhecimento de melhores práticas (Harvard MCS, Jobscan, ZipRecruiter) — consultada pelos 3 subagents de `/headhunter`. |
| `.claude/references/recruiter-lens.md` | Filtro mental do recrutador segmentado por nível (IC/manager/director/VP) e família funcional (Controller, Consolidation, FP&A, Financeiro). Consultada por `/headhunter` e seus 3 subagents. |
| `.claude/rules/{10-scan-priority,20-project-governance}.md` | Regras de projeto com `globs` para ativação contextual (cargos-alvo, governança CI/CD). |
| `.claude/designs/headhunter-design-2026-04-26.md` | Design doc IMPLEMENTED da Fase 1 do `/headhunter`. Fase 2 (recruiter-driven completo) pendente. |
| `output/tailor-runs/{date}-{slug}/` | Artefatos persistidos por execução de `/headhunter` (recruiter framing, briefing, blueprint, review, summary). |

### OpenCode Commands

When using [OpenCode](https://opencode.ai), the following slash commands are available (defined in `.opencode/commands/`):

| Command | Claude Code Equivalent | Description |
|---------|------------------------|-------------|
| `/career-ops` | `/career-ops` | Show menu or evaluate JD with args |
| `/career-ops-pipeline` | `/career-ops pipeline` | Process pending URLs from inbox |
| `/career-ops-evaluate` | `/career-ops oferta` | Evaluate job offer (A-F scoring) |
| `/career-ops-compare` | `/career-ops ofertas` | Compare and rank multiple offers |
| `/career-ops-contact` | `/career-ops contacto` | LinkedIn outreach (find contacts + draft) |
| `/career-ops-deep` | `/career-ops deep` | Deep company research |
| `/career-ops-pdf` | `/career-ops pdf` | Generate ATS-optimized CV |
| `/career-ops-training` | `/career-ops training` | Evaluate course/cert against goals |
| `/career-ops-project` | `/career-ops project` | Evaluate portfolio project idea |
| `/career-ops-tracker` | `/career-ops tracker` | Application status overview |
| `/career-ops-apply` | `/career-ops apply` | Live application assistant |
| `/career-ops-scan` | `/career-ops scan` | Scan portals for new offers |
| `/career-ops-batch` | `/career-ops batch` | Batch processing with parallel workers |
| `/career-ops-patterns` | `/career-ops patterns` | Analyze rejection patterns and improve targeting |
| `/career-ops-followup` | `/career-ops followup` | Follow-up cadence tracker |

**Note:** OpenCode commands invoke the same `.claude/skills/career-ops/SKILL.md` skill used by Claude Code. The `modes/*` files are shared between both platforms.

### First Run — Onboarding (IMPORTANT)

**Before doing ANYTHING else, check if the system is set up.** Run these checks silently every session:

1. Does `cv.md` exist?
2. Does `config/profile.yml` exist (not just profile.example.yml)?
3. Does `modes/_profile.md` exist (not just _profile.template.md)?
4. Does `portals.yml` exist (not just templates/portals.example.yml)?

If `modes/_profile.md` is missing, copy from `modes/_profile.template.md` silently.

**If ANY is missing, enter onboarding mode.** Do NOT proceed with evaluations, scans, or other modes. Guide the user:

1. **CV** (`cv.md`): Ask user to paste CV, share LinkedIn URL, or describe experience → create markdown
2. **Profile** (`config/profile.yml`): Copy from `config/profile.example.yml`, ask for name, email, location, target roles, salary range → fill in. Store user-specific data in `modes/_profile.md` or `config/profile.yml`, NEVER in `modes/_shared.md`
3. **Portals** (`portals.yml`): Copy from `templates/portals.example.yml`, customize keywords for target roles
4. **Tracker** (`data/applications.md`): Create empty table header
5. **Learn the user**: Ask about superpowers, deal-breakers, best achievement, published work. Store in `config/profile.yml`, `modes/_profile.md`, or `article-digest.md`
6. **Ready**: Confirm setup, suggest automation (`/loop` or `/schedule` for recurring scans)

**After every evaluation, learn.** Update understanding when user corrects scores or adds context.

### Personalization

This system is designed to be customized by YOU (AI Agent). When the user asks you to change archetypes, translate modes, adjust scoring, add companies, or modify negotiation scripts -- do it directly. You read the same files you use, so you know exactly what to edit.

**Common customization requests:**
- "Change the archetypes to [backend/frontend/data/devops] roles" → edit `modes/_profile.md` or `config/profile.yml`
- "Translate the modes to English" → edit all files in `modes/`
- "Add these companies to my portals" → edit `portals.yml`
- "Update my profile" → edit `config/profile.yml`
- "Change the CV template design" → edit `templates/cv-template.html`
- "Adjust the scoring weights" → edit `modes/_profile.md` for user-specific weighting, or edit `modes/_shared.md` and `batch/batch-prompt.md` only when changing the shared system defaults for everyone
- "Update recruiter heuristics for [Controller/FP&A/etc.]" → edit `.claude/references/recruiter-lens.md` (segmentado por família funcional). Quando o usuário trouxer feedback real de recrutador ("o head-hunter da empresa X reclamou de Y"), atualizar essa lente.

**Regra de arquétipos — onde editar:**
- `modes/_shared.md` define a **taxonomia de arquétipos do projeto** (6 subtipos com triggers de keyword: Head de Accounting, Controller LATAM, Finance Manager, FP&A Manager, M&A, Tax). Edite aqui quando: (a) adicionar/remover um subtipo, (b) ajustar os triggers de detecção, (c) mudar o framing macro do projeto.
- `.claude/references/recruiter-lens.md` define o **filtro mental do recrutador** segmentado por nível (IC/manager/director/VP) e família funcional (Controller, Consolidation, FP&A, Financeiro genérico). Edite aqui quando: (a) o usuário trouxer feedback real de recrutador, (b) descobrir nova heurística de filtro por nível/família, (c) refinar vocabulário que ressoa em uma família funcional específica.
- **Não dupliquem conteúdo entre os dois.** Se um arquétipo de `_shared.md` ganhar uma heurística nova de filtro mental, ela vai pra `recruiter-lens.md`. Se uma família de `recruiter-lens.md` precisar virar um arquétipo formal do projeto, ela ganha entrada em `_shared.md`.
- "Tighten the /headhunter trigger" → ajustar `description` em `.claude/skills/headhunter/SKILL.md` (auto-invocação por description é o trigger).
- "Add a granular cv-* command" → criar wrapper fino em `.claude/commands/`, despachando o subagent correspondente em `.claude/agents/`. A lógica fica no agent, não no command.

### Language Modes

Default modes are in `modes/` (English). Additional modes:
- **German (DACH):** `modes/de/` — `angebot.md` (eval), `bewerben.md` (apply), `pipeline.md`
- **French:** `modes/fr/` — `offre.md` (eval), `postuler.md` (apply), `pipeline.md`
- **Japanese:** `modes/ja/` — `kyujin.md` (eval), `oubo.md` (apply), `pipeline.md`

**When to switch:** User says "use [language] modes" → read from that directory. Or set `language.modes_dir` in `config/profile.yml`. Or detect non-English JD and suggest. **English-language roles always use default modes**, even at French/German/Japanese companies.

### Target Roles (evaluation scoring)

**Source of truth:** `config/profile.yml` + `modes/_profile.md`

**PRIMARY (score boost, always match):**
- Head of Accounting and Controlling (vocabulário-líder canônico)
- Head of Accounting / Head de Contabilidade
- Controller (Financial / Regional / LATAM / Corporate / Business)
- Head de Consolidacao / Gerente de Consolidacao

> **Regra:** NUNCA usar "Director" / "Diretor" como cargo-alvo (restringe busca de vagas). Exceções permitidas: Audit Director, Tax Director, Post-Integration Director (cargos especialistas distintos). Ver memória `cv-rules.md` Regra 3 + `config/profile.yml` `avoid_titles`.

**SECONDARY (score lower, match when fit):**
- Head de FP&A / Gerente de FP&A
- Head Financeiro / Gerente Financeiro

### Scan Strategy (portal search priority)

**Source of truth:** `modes/scan.md` + `portals.yml` + `.claude/rules/10-scan-priority.md`

| Tier | Method | Portals | Auth Required |
|------|--------|---------|---------------|
| 0 | Playwright (browser) | LinkedIn, Indeed Brazil, Vagas.com.br, Robert Half | Yes — Auth Gate before scan |
| 1 | WebSearch (Google) | Greenhouse, Lever, Ashby, Workable, Glassdoor | No |
| 2 | ATS APIs (HTTP) | Companies with Greenhouse/Ashby/Lever API | No |
| 3 | Playwright (individual) | 45+ tracked companies in portals.yml | Varies |

**Auth Gate rule:** Before scanning Tier 0 portals, the system MUST check if the user is logged in via Playwright. If not, PAUSE and wait for the user to authenticate. See `modes/scan.md` for the full workflow.

### Skill Modes

**Regra de roteamento entre `/career-ops` e `/headhunter`:**

> **SSOT canônico:** [`.claude/references/routing-rules.md`](.claude/references/routing-rules.md) tem a regra completa (precedência de triggers, frases de intenção em 6 idiomas, thresholds de score alinhados com cutoff ético, mapeamento score↔match rate, tratamento por modo single/batch/headless). Quando esta seção divergir do `routing-rules.md`, o `routing-rules.md` vence. Edite lá quando mudar a regra; aqui é só resumo.

**Resumo executável (precedência — primeira condição que casa vence):**
1. **Comando explícito `/headhunter <URL ou JD>` ou comandos granulares (`/cv-analyze`, `/cv-strategy`, `/cv-recruiter-check`, `/tailor-cv`)** → vence sobre tudo.
2. **Frase de intenção de personalização** (PT/EN/ES/FR/DE/JA — ver routing-rules.md §2) → aciona `/headhunter` **mesmo se acompanhada de URL**.
3. **Cola URL/JD pura sem comando ou frase de intenção** → `/career-ops` auto-pipeline (default). Se score ≥ 4.0, sugere escalonar pra `/headhunter`.

**Princípio:** comando vence frase, frase vence URL, URL pura cai no padrão. Nunca ambos os caminhos disparam para o mesmo input.

| If the user... | Mode |
|----------------|------|
| Comando explícito `/headhunter <URL ou JD>` ou frase de personalização | `/headhunter` (SSOT premium) |
| Quer só **decodificar a vaga** sem gerar CV | `/cv-analyze` (despacha vaga-analyst isolado) |
| Quer **iterar a estratégia** sem refazer análise | `/cv-strategy` (despacha cv-strategist isolado) |
| Quer **auditar um CV existente** contra uma vaga | `/cv-recruiter-check` (despacha recruiter-reviewer isolado) |
| Pastes JD or URL (cola pura, sem comando) | auto-pipeline (evaluate + report + PDF + tracker; sugere `/headhunter` se score ≥ 4.0) |
| Asks to evaluate offer | `oferta` |
| Asks to compare offers | `ofertas` |
| Wants LinkedIn outreach | `contacto` |
| Asks for company research | `deep` |
| Preps for interview at specific company | `interview-prep` |
| Wants to generate CV/PDF | `pdf` |
| Evaluates a course/cert | `training` |
| Evaluates portfolio project | `project` |
| Asks about application status | `tracker` |
| Fills out application form | `apply` |
| Searches for new offers | `scan` |
| Processes pending URLs | `pipeline` |
| Batch processes offers | `batch` |
| Asks about rejection patterns or wants to improve targeting | `patterns` |
| Asks about follow-ups or application cadence | `followup` |

### CV Source of Truth

- `cv.md` in project root is the canonical CV
- `article-digest.md` has detailed proof points (optional)
- **NEVER hardcode metrics** -- read them from these files at evaluation time
- **Page cap:** CV padrão 3 páginas A4 (4 só para C-level / 20+ anos). Detalhe em memória `cv-rules.md` Regra 6.
- **Cargo-alvo SSOT:** memória `cv-rules.md` Regra 3 + `config/profile.yml` `avoid_titles` + `director_allowed_exceptions` (Audit/Tax/Post-Integration Director permitidos).

---

## Ethical Use -- CRITICAL

**This system is designed for quality, not quantity.** The goal is to help the user find and apply to roles where there is a genuine match -- not to spam companies with mass applications.

- **NEVER submit an application without the user reviewing it first.** Fill forms, draft answers, generate PDFs -- but always STOP before clicking Submit/Send/Apply. The user makes the final call.
- **Strongly discourage low-fit applications.** If a score is below 4.0/5, explicitly recommend against applying. The user's time and the recruiter's time are both valuable. Only proceed if the user has a specific reason to override the score.
- **Quality over speed.** A well-targeted application to 5 companies beats a generic blast to 50. Guide the user toward fewer, better applications.
- **Respect recruiters' time.** Every application a human reads costs someone's attention. Only send what's worth reading.

---

## Offer Verification -- MANDATORY

**NEVER trust WebSearch/WebFetch to verify if an offer is still active.** ALWAYS use Playwright:
1. `browser_navigate` to the URL
2. `browser_snapshot` to read content
3. Only footer/navbar without JD = closed. Title + description + Apply = active.

**Exception for batch workers (`claude -p`):** Playwright is not available in headless pipe mode. Use WebFetch as fallback and mark the report header with `**Verification:** unconfirmed (batch mode)`. The user can verify manually later.

---

## CI/CD, Quality, Community

See `.claude/rules/20-project-governance.md` for full details.

## Stack and Conventions

- Node.js (mjs modules), Playwright (PDF + scraping), YAML (config), HTML/CSS (template), Markdown (data), Canva MCP (optional visual CV)
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
3. All reports MUST include `**URL:**` in the header (between Score and PDF). Include `**Legitimacy:** {tier}` (see Block G in `modes/oferta.md`).
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
