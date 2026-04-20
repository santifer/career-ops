# Design: Spanish (Argentina) Modes for career-ops

**Date:** 2026-04-20
**Branch:** `feature/Argentina-ES`
**Status:** Approved, pending implementation plan

## Problem

career-ops ships with localized modes for DACH (`modes/de/`), Francophone (`modes/fr/`), Japan (`modes/ja/`), Brazil (`modes/pt/`), and Russia (`modes/ru/`). There is no Spanish variant. A user targeting the Argentine job market cannot activate a market-adapted evaluation flow without manually rewriting modes.

The root `modes/` directory is in mixed state: file names are Spanish (`oferta.md`, `ofertas.md`, `contacto.md`) but `_shared.md` is in English and other content varies. Relying on that mixed state is not a substitute for a proper localized mode.

## Goal

Ship `modes/es/` as a rioplatense-Spanish, Argentina-first localized mode that:

1. Covers the core evaluation path (`_shared.md`, `oferta.md`, `aplicar.md`, `pipeline.md`) — same scope as `modes/fr/` and `modes/de/`.
2. Encodes Argentine labor-law and compensation realities into the evaluation without hardcoding salary ranges.
3. Provides an Argentine job-board and company list as `templates/portals.ar.example.yml`, parallel to `portals.example.yml` rather than replacing it.
4. Integrates with the existing `language.modes_dir` config mechanism so activation is one YAML line.
5. Respects the system/user layer separation defined in `CLAUDE.md`: user-specific content stays in `modes/_profile.md` and `config/profile.yml`, never in `modes/es/_shared.md`.

## Non-goals

- Translating every mode file. Out of scope for this iteration: `scan.md`, `patterns.md`, `followup.md`, `batch.md`, `pdf.md`, `latex.md`, `tracker.md`, `deep.md`, `contacto.md`, `interview-prep.md`, `training.md`, `project.md`, `auto-pipeline.md`, `ofertas.md`. These remain in the root `modes/` directory and will work in English; users can request Spanish versions later.
- Modifying any `.mjs` script. Scripts read YAML and Markdown by structure, not by natural language, so the localization does not require code changes.
- Modifying `templates/cv-template.html`, `templates/cv-template.tex`, or `templates/states.yml`. The CV templates are language-agnostic (they adapt to the user's `cv.md`), and `states.yml` values are identifiers, not UI strings.
- Translating the dashboard or any UI.
- Building a separate `modes/es-ar/` directory plus a neutral `modes/es/`. We follow the pragmatic path: one `modes/es/` directory with a rioplatense + AR-first bias, same convention as `modes/de/` (DACH-heavy) and `modes/fr/` (France-heavy). Users in other Spanish-speaking markets can fork to `modes/es-mx/`, `modes/es-cl/`, etc.
- Rewriting `modes/_shared.md` or any English mode file. This design is additive.
- Covering every corner of Argentine labor law. The scope is "Medium" depth (see Scope Decisions below) — detect and ask, don't lawyer.

## Scope Decisions (recorded from brainstorming)

The following decisions were made during brainstorming on 2026-04-20 and underpin the design below:

| Decision | Option chosen | Rejected alternatives |
|---|---|---|
| Market scope | Rioplatense + AR-first single directory (`modes/es/`) | Separate AR-only (`modes/es-ar/`); neutral LATAM with country overrides |
| Comp calibration depth | Medium: AR comp section in `_shared.md` with modality detection and red/green flags, no hardcoded ranges | Minimal (text-only translation); Maximum (hardcoded ranges per seniority/archetype) |
| Labor-law vocab depth | Medium: detect mentions of LCT concepts; ask in Block F for items the JD doesn't specify | Light (only flag what appears); Heavy (scoring penalties + compliance checks) |
| Activation | Default: set `language.modes_dir: modes/es` in this user's `config/profile.yml` during onboarding | Opt-in only (user must edit config manually) |
| Portals file | Separate `templates/portals.ar.example.yml`; user copies to `portals.yml` based on region | Merge into the existing `portals.example.yml`; extend existing with marked sections |
| Initial company count | ~50 companies in `portals.ar.example.yml` | 25-30 starter set; full 127-entry port |
| User-layer bleed into `_shared.md` | Keep `modes/es/_shared.md` clean of user data; archetypes and narrative stay in `modes/_profile.md` | Follow the fr/de/pt inline `[PERSONNALISER]` pattern (which we consider a codebase inconsistency, not a pattern to replicate) |

## Architecture

### Directory layout

```
modes/es/
├── README.md           # scope, activation, forking guide for other es-* markets
├── _shared.md          # system context (Spanish) + "Mercado argentino" section
├── oferta.md           # A-G evaluation with AR adaptations in blocks C and F
├── aplicar.md          # live application assistant with AR form hints
└── pipeline.md         # orchestration (Spanish) — reads pending URLs, invokes oferta.md

templates/
└── portals.ar.example.yml   # ~50 companies: AR-native + LATAM regional + global w/ AR teams

config/
└── profile.example.yml      # add optional `language.modes_dir` key with docstring

CLAUDE.md                    # extend "Language Modes" section with Spanish (AR) entry
```

### File responsibilities

**`modes/es/README.md`** — scope statement (rioplatense, AR-first), activation instructions (`language.modes_dir: modes/es`), fork guide for other Spanish markets (`modes/es-mx/`, `modes/es-cl/`), list of modes not yet translated and how to request them.

**`modes/es/_shared.md`** (~220 lines, similar to `modes/fr/_shared.md`) sections:

1. Header + sources of truth (translation of `modes/_shared.md` header)
2. Scoring system A-G (translation)
3. Posting Legitimacy / Block G signals (translation)
4. Global rules — NUNCA / SIEMPRE (translation)
5. Tools section — Playwright, WebFetch, batch mode caveat (translation)
6. **New section: "Mercado argentino — Especificidades"** with:
   - Hiring modalities: relación de dependencia (RD), monotributo-USD, contractor/consultancy, hybrid
   - Comp red flags: flat ARS with no IPC adjustment clause, "sueldo competitivo" with no range, pesos-only with no FX hedge
   - Comp green flags: USD/crypto payment, quarterly IPC adjustments, USD-equivalent explicit
   - LCT vocabulary to detect or ask for: SAC (aguinaldo), ART, obra social, vacaciones por antigüedad, período de prueba 3m, preaviso, art. 245 indemnización
   - Instruction: if the JD does not specify modality, flag it in Block F as a recruiter question, do not penalize the overall score
7. Reference to `modes/_profile.md` for archetypes, narrative, negotiation scripts, location policy (these stay user-layer)

**`modes/es/oferta.md`** (~220 lines, parallel to `modes/oferta.md`):
- Translation to rioplatense Spanish (voseo: vos, tenés, querés)
- Block A-B-D-E-G: structural translation, no logic change
- **Block C (Comp y Demanda) — AR additions:**
  - Detect modality mentioned in the JD
  - If modality unspecified → flag as "modalidad no declarada — preguntar"
  - If ARS-only with no adjustment clause → explicit penalty note in comp sub-score rationale (not a new dimension)
  - If USD/crypto/adjusted-ARS → treat as stability green flag in rationale
- **Block F (Plan de Entrevistas) — AR additions:**
  - Mandatory subsection "Preguntas para el recruiter sobre contratación AR", populated dynamically from the LCT items the JD did not specify:
    - ¿Es relación de dependencia o monotributo?
    - ¿En qué moneda se paga? ¿Hay cláusula de ajuste por inflación?
    - ¿SAC, ART, obra social cubiertos?
    - Período de prueba y preaviso
  - Only include questions for items actually missing from the JD (no spam)
- Post-evaluation flow (report save, tracker TSV, PDF trigger): unchanged; only surrounding text translated

**`modes/es/aplicar.md`** (~150 lines, parallel to `modes/apply.md`):
- Translation to rioplatense
- **AR additions:**
  - "Expected salary" fields: branch by modality (RD → ARS range with IPC-adjustment note; monotributo → USD neto; unknown → recommend asking before stating a number)
  - Recognize and handle AR-specific form fields (CUIT/CUIL, localidad vs provincia, disponibilidad para viajar) when they appear
- **Ethical rule reinforced in Spanish:** NUNCA submit without user review (already in `CLAUDE.md`; restated inline for Spanish-only readers)

**`modes/es/pipeline.md`** (~80 lines, parallel to `modes/pipeline.md`):
- Direct translation. No AR additions — it is orchestration logic (read URLs from `data/pipeline.md`, invoke `oferta.md`, save reports). All AR-specific logic already lives in `_shared.md` and `oferta.md`, which this mode calls.

**`templates/portals.ar.example.yml`** (~400-500 lines):
- Header and customization guide translated
- `title_filter.positive`: Spanish keywords ("Ingeniero de IA", "Desarrollador", "Analista", "Líder Técnico", etc.) + reuse of English keywords from the root example (since many AR postings are in English)
- `title_filter.negative`: AR-specific additions ("Pasantía" / "Practicante" for senior users; "Reemplazo por maternidad" as a non-ideal signal; staffing-agency signals without disclosed client)
- `search_queries`: queries targeting AR boards — Bumeran (`site:bumeran.com.ar`), Computrabajo AR (`site:ar.computrabajo.com`), GetOnBoard (`site:getonbrd.com`), LinkedIn AR geo-filter, plus LATAM-remote boards
- `tracked_companies`: ~50 entries split approximately:
  - ~30 AR-native (Mercado Libre, Globant, Despegar, MODO, Ualá, Pomelo, OLX, Etermax, Digital House, TiendaNube, Mudafy, Satellogic, Ripio, Lemon Cash, Buenbit, Prisma, Naranja X, Brubank, 10Pines, etc.)
  - ~10 LATAM regional with strong AR presence (Belvo, Bitso, Kushki, NotCo, Fintual, Kavak, Rappi AR, dLocal, Betterfly)
  - ~10 global with known AR-remote teams (Stripe, Deel, Remote, GitLab, Canonical, DataDog, Turing, Toptal, Andela)
- Each entry carries a verified **branded** `careers_url` — not the raw ATS URL. This matches the rule enforced in `modes/scan.md` and `templates/portals.example.yml` header. If a company has no branded careers page, the ATS URL is acceptable as documented fallback.
- Closing note: "Esta lista es un punto de partida. Pedile al agente que agregue o saque empresas según tu búsqueda."

### Integration points

**`config/profile.example.yml`** — add:
```yaml
# Optional: localized modes. When set, career-ops reads modes from this directory.
# Supported: modes/de, modes/es, modes/fr, modes/ja, modes/pt, modes/ru
# Unset → uses modes/ (English/mixed).
language:
  modes_dir: modes/es   # example: Argentine Spanish
```

**`CLAUDE.md` — "Language Modes" section** — add paragraph after the existing ja/fr/de entries:
> **When to use Spanish (AR) modes:** If the user is targeting Argentine job postings, lives in Argentina, or requests Spanish output. Either: (1) user says "usa los modos en español" → read from `modes/es/` instead of `modes/`, (2) user sets `language.modes_dir: modes/es` in `config/profile.yml` → always use Spanish modes, (3) you detect an AR Spanish JD → suggest switching to Spanish modes. For Spanish-speaking users in MX/CL/CO/etc., recommend forking `modes/es/` into a country-specific directory.

And update the mode-files table if it references the default English files by name.

**Onboarding flow (`CLAUDE.md` Step 2)** — during profile setup, if the user's location or email TLD is Argentine (or the user explicitly targets AR), propose setting `language.modes_dir: modes/es`. For this specific user (whose environment shows an Argentine email and Argentine location), set it by default during onboarding.

### Data flow

```
User action                  File read                         File written
─────────────                ─────────                         ─────────────
/career-ops <URL>      →     modes/_profile.md                 reports/NNN-slug-date.md
                             config/profile.yml                batch/tracker-additions/NNN-slug.tsv
                             cv.md
                             (language.modes_dir resolves →)
                             modes/es/_shared.md
                             modes/es/oferta.md
```

The resolution of `language.modes_dir` is handled by the agent (Claude) reading the config, not by a new script. The existing pattern is documented in `CLAUDE.md` ("When the user sets `language.modes_dir: modes/de` in `config/profile.yml` → always use German modes") and applies identically.

### Error handling / edge cases

- **User has `modes_dir: modes/es` set but asks to evaluate an English-language JD at a non-AR company.** The agent should evaluate in Spanish but note in the report that the role is not AR-based and the "Mercado argentino" section applies less. Do not force AR framing on unrelated roles.
- **A JD is Spanish but not rioplatense (e.g., a Spain-based role).** The agent uses Spanish evaluation but flags in Block F that Spain-specific labor concepts (paga extra vs SAC, autónomo vs monotributo) may apply and recommends the user seek Spain-specific info. Do not hallucinate Spain labor law.
- **Missing modality in JD.** Never penalize the global score. Always flag in Block F as a recruiter question.
- **Scripts (`scan.mjs`, `merge-tracker.mjs`, etc.) running against Spanish-generated reports.** Contract: reports continue to use identical headers (`**Score:**`, `**URL:**`, `**Legitimacy:**`), identical block names (A-G), identical TSV schema. Translation affects body prose, not metadata. Verified by re-running `verify-pipeline.mjs` after first Spanish-generated report.
- **Report filename convention.** Remains `reports/NNN-company-slug-YYYY-MM-DD.md` regardless of language. No localization in filenames.

## Testing strategy

Not a code change, so traditional TDD does not apply. Verification instead:

1. **Structural checks:**
   - `node verify-pipeline.mjs` passes after generating the first Spanish report
   - `node merge-tracker.mjs` correctly ingests a TSV generated from `modes/es/oferta.md`
   - `node test-all.mjs` continues to pass (63+ checks)

2. **Linguistic consistency (manual review):**
   - Every file in `modes/es/` uses voseo consistently
   - No untranslated English strings in user-facing output except proper nouns and technical identifiers (state names, block letters, field labels in reports that scripts depend on)
   - Proof-read by a native Spanish speaker — that's the user

3. **Functional smoke test:**
   - Create `config/profile.yml` with `language.modes_dir: modes/es`
   - Paste a known AR job posting URL (Mercado Libre, Ualá, etc.)
   - Verify: report is generated in Spanish, block F contains AR-specific recruiter questions for any missing LCT items, `applications.md` row appears with canonical state, URL is captured, legitimacy tier is set

4. **Regression check:**
   - Unset `language.modes_dir`, paste a non-AR English JD
   - Verify: English flow still works as before, no leakage of Spanish or AR content

5. **Portals YAML schema check:**
   - `node scan.mjs` accepts `portals.ar.example.yml` when copied to `portals.yml` without schema errors
   - At least one scan cycle completes against the AR portals file

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| AR company list rots fast (company renames, acquisitions, careers URL moves) | Keep the list modest (50, not 127); document that it's a starting point; `check-liveness.mjs` already flags dead URLs |
| Other Spanish-speaking users (MX/CL/CO) adopt `modes/es/` and encounter rioplatense friction | `README.md` is explicit about scope and documents the fork path; we do not advertise `modes/es/` as "LATAM Spanish" |
| Drift between `modes/_shared.md` (English) and `modes/es/_shared.md` when the former gets updated | Accept this risk — same problem applies to `fr/`, `de/`, `ja/`, `pt/`, `ru/`; out of scope to solve here; maintainer runs `test-all.mjs` to catch structural drift, relies on PR review for content |
| `language.modes_dir` resolution is agent-driven and could be ignored in batch mode (`claude -p`) where system prompt may be shorter | `CLAUDE.md` update will be explicit about the rule; the batch worker prompt in `batch/batch-prompt.md` may need a note (checked during implementation — low cost to fix) |
| Labor-law claims in `_shared.md` go stale (LCT article numbers, period lengths) | Only reference stable concepts (SAC, ART, period of probation of 3 months). Avoid article numbers except art. 245 indemnización, which is the canonical reference; add a disclaimer that the mode is not legal advice |
| Rioplatense tone feels unprofessional in Spain-facing applications | Scope is AR; if the user applies to Spain, they switch off `modes_dir` or use the English flow. Document explicitly. |

## Open questions (deferred to implementation)

- **Exact company list (all 50 with verified branded careers_urls).** The design commits to the count and distribution (30 AR + 10 LATAM + 10 global). The specific URLs are verified during implementation. Companies with no verifiable branded careers page drop to ATS fallback, with a comment in YAML.
- **Which existing modes (beyond the core 4) the user wants translated next.** Out of scope for this spec.
- **Whether to add a `modes/es/` language mention to `README.md` of the repo root.** Minor — handle during implementation, inside the scope of "integration points".

## Out of scope (explicit)

- Spanish versions of `scan.md`, `patterns.md`, `followup.md`, `batch.md`, `pdf.md`, `latex.md`, `tracker.md`, `deep.md`, `contacto.md`, `interview-prep.md`, `training.md`, `project.md`, `auto-pipeline.md`, `ofertas.md`.
- Mexican, Chilean, Colombian, Uruguayan, Peruvian, Spanish (Spain) variants.
- Code changes to any `.mjs` script.
- Dashboard localization.
- Adding `es` to the `language.modes_dir` validation in any hypothetical config-validator.
- Translating `templates/states.yml` (identifiers, not UI).

## References

- Pattern source: `modes/fr/_shared.md` (205 lines) and `modes/fr/offre.md` (166 lines) — closest precedent.
- Existing AR-related infrastructure: Spanish-named mode files in root `modes/` (`oferta.md`, `ofertas.md`, `contacto.md`).
- CLAUDE.md rules on system vs user layer separation.
- `templates/portals.example.yml` as base schema (do not diverge).
- `modes/scan.md` branded-careers_url rule.
