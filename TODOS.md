# TODOS — career-ops

**Derniere mise a jour :** 2026-07-16

---

## Bugs

- [ ] `scan_ats_full --since N` argument non respecte (reste bloque sur `--since 3`)
- [ ] `test_browser_extract.py` : 2 tests echouent quand Playwright est installe (conçus pour le cas absent)

---

## Features — Priorite haute

- [ ] **Pipeline hybride portals discovery** — `python manage.py discover_portals --sector pharma --country France`
  - Phase 1 : management command + discovery.py + enrichment.py + ats_detector.py
  - Phase 2 : multi-source (APEC, Indeed scraping)
  - Plan : `docs/plans/portals-automation-hybrid.md`
- [ ] **Provider `scan_method: websearch`** — implementer dans le scanner Python
  - Les boites pharma/DM n'utilisent pas Greenhouse/Lever, besoin d'un fallback websearch
- [ ] **Premiere evaluation biomedicale** — alimenter `data/pipeline.md` avec des offres APEC/Indeed, evaluer avec `npm run openai:eval`
- [ ] **Premier CV PDF** — `npm run pdf` pour generer le premier CV adapte d'Audrey

---

## Features — Priorite moyenne

- [ ] OpenCode skill `portal-discovery` (`.opencode/skills/portal-discovery/SKILL.md`)
  - Fallback manuel quand le pipeline auto echoue
- [ ] API endpoint `POST /api/portals/discover` (Approche C)
- [ ] Frontend UI pour la decouverte de portails
- [ ] Script `npm run setup` : `python -m venv .venv && source .venv/bin/activate && pip install -e 'scripts/python/[dev]' -e 'backend/[dev]' && cp .env.example .env`
- [ ] Playwright browsers install : `npx playwright install chromium` + `python -m playwright install chromium`

---

## Infrastructure

- [ ] Verifier que `npm run pdf` fonctionne avec le venv Python (Playwright Python vs Node.js)
- [ ] Verifier que `npm run openai:eval` fonctionne (besoin cle API dans `.env`)
- [ ] Verifier que `npm run gemini:eval` fonctionne (besoin cle API dans `.env`)
- [ ] Verifier que Django `python backend/manage.py runserver` demarre
- [ ] CI : ajouter `pip install -e 'scripts/python/[dev]' -e 'backend/[dev]'` aux workflows

---

## Documentation

- [ ] Ajouter section "Installation" dans README.md avec instructions venv
- [ ] Ajouter section "Premiere utilisation" avec exemple biomedical
- [ ] Mettre a jour `docs/getting-started/setup.md` avec le nouveau workflow venv
- [ ] Supprimer les references `scripts/js/` restantes dans les README traduits

---

## Onboarding Audrey Kwekeu

- [ ] Complete le `.env` avec les cles API (OpenAI, Gemini, OpenRouter)
- [ ] Alimenter `data/pipeline.md` avec 5-10 offres biomedicales (APEC, Indeed)
- [ ] Lancer `npm run openai:eval -- --url <url>` sur la premiere offre
- [ ] Lancer `npm run merge`
- [ ] Lancer `npm run pdf` pour generer le CV adapte
- [ ] Configurer les follow-ups (`data/follow-ups.md`)
- [ ] Preparer le story bank (`interview-prep/story-bank.md`)

---

## Nettoyage

- [ ] Supprimer les references `scripts/js/` dans les README traduits (~50 fichiers)
- [ ] Supprimer ou archiver `templates/portals.example.yml` (template AI/tech, plus pertinent)

---

## Futures idees

- [ ] Scanner multi-source : combiner Greenhouse + Workday + websearch en un seul run
- [ ] Mode `career-ops init` interactif avec questionnaire guide
- [ ] Dashboard web : visualiser le pipeline dans le navigateur
- [ ] Plugin LinkedIn : importer offres sauvegardees
- [ ] Support Indeed API / APEC API pour la decouverte automatique
- [ ] Mode `career-ops sector-switch` : changer tout le profil d'un coup (biomedical → AI, etc.)
