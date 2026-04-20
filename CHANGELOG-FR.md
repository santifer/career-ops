# Changelog du fork FR

Trace toutes les divergences avec l'upstream `santifer/career-ops`.

## [Unreleased]

### Added
- Initialisation du fork francophone `atoox-git/career-ops-fr`
- Basé sur upstream commit `411afb3`

### Traduit (Phase 2)
- `README.fr.md` — README principal en français
- `CLAUDE.md` — Instructions agent traduites en français
- `docs/SETUP.fr.md` — Guide d'installation en français
- `docs/API-FRANCE-TRAVAIL.md` — Guide API France Travail
- 9 modes traduits dans `modes/fr/` : scan, deep, contact, entretien, formation, patterns, projet, relance, _profile.template

### Adapté (Phase 3)
- 6 archétypes FR dans `modes/fr/_shared.md` (existant upstream, à réécrire)
- `templates/portals-fr.example.yml` — 9 portails FR en 3 tiers
- `modes/fr/lettre-motivation.md` — Nouveau mode (from scratch)
- `templates/cv-template-fr.html` — Template CV Europass FR
- `examples/cv-exemple-1.md` — CV développeur fullstack PME
- `examples/cv-exemple-2.md` — CV commerciale B2B
- 5 offres FR anonymisées dans `examples/offres-exemple/`
- Scripts npm : ajout `claude:eval` et `ollama:eval` (stub)

### Intégré (Phase 4-5)
- `adapters/portals/france-travail.mjs` — API OAuth2 France Travail
- `adapters/portals/_shared.mjs` — Utilitaires Playwright partagés (robots.txt, rate limit, cache)
- 5 adapters Playwright tier 2 : APEC, WTTJ, HelloWork, Jobijoba, RégionsJob
- `scripts/test-api-francetravail.mjs` — Script de test manuel

### Qualité (Phase 6)
- `tests/golden/cases.json` — 5 cas de test FR
- `tests/run-golden.mjs` — Runner de régression
- `.github/workflows/test-fr.yml` — CI GitHub Actions

### Documentation (Phase 7)
- `NOTICE.md` — Attribution Santiago + copyright Bertrand
- `MENTIONS-LEGALES.md` — Mentions légales françaises
- `PRIVACY.md` — Politique de confidentialité (local-first, RGPD)
- `.env.example` — Variables France Travail ajoutées
- `.gitignore` — Cache portails et fichier nul Windows ajoutés
