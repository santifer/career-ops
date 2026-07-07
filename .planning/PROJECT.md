# Project: Career-Ops Full Turkish Localization

## Context

**What this is:**
Career-Ops is an AI-powered job search automation pipeline running locally on standard LLM CLI tools. We are executing a 100% full Turkish localization of the entire project to make Turkish the first fully localized market.

**Why we're building it:**
The Turkish market is massive but under-served in native tech tools. The core translation was missing, and the 15 utility modes (`scan.md`, `batch.md`, etc.) were left in English. A full localization will make this project a first-class citizen in Turkey.

**What success looks like:**
- All 15 remaining markdown modes exist in `modes/tr/` as native Turkish files.
- `README.tr.md` and `modes/tr/README.md` are updated.
- Templates and Go dashboard support the Turkish language or are prepared for it.
- Tracking states correctly merge into the markdown format.

## Core Value
The system must feel completely native to a Turkish job seeker, from prompt outputs to terminal UI and CV templates.

## Requirements

### Validated
- ✓ [Existing capability 1] — career-ops core functionality works and supports language switching via `--mode-dir=modes/tr`
- ✓ [Existing capability 2] — `modes/tr/is-ilani.md`, `basvuru.md`, `pipeline.md` already exist.
- ✓ [Existing capability 3] — `README.tr.md` translated.

### Active
- [ ] Translate utility modes to `modes/tr/`: `scan.md`, `batch.md`, `pdf.md`, `cover.md`, `email.md`, `interview-prep.md`, `patterns.md`, `auto-pipeline.md`, `deep.md`, `contacto.md`, `ofertas.md` (as `teklifler.md`), `project.md`, `training.md`, `tracker.md`, `followup.md`.
- [ ] Update `modes/tr/README.md` to remove disclaimer about English fallbacks.
- [ ] Ensure `templates/states.yml` supports Turkish tracking labels without breaking the parser.
- [ ] Update HTML CV and Cover Letter Templates for Turkish sections (Özet, Deneyim, vb.).
- [ ] TUI Dashboard localization strategy (e.g. i18n support or hardcoded TR fork).

### Out of Scope
- [Exclusion 1] — Creating completely new features not present in the English version.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Atomically step-by-step | Multi-step localization is complex. We will use GSD to plan it phase by phase. | — Pending |
| Phase 02 Filenames | Keep `contacto.md` and `ofertas.md` names to preserve CLI skill router mapping. | Validated |

---
*Last updated: 2026-07-07 after Phase 02 completion*

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state
