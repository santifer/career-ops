# NEXT-STEPS — career-ops

**Date :** 2026-07-16  
**Profil :** Audrey Kwekeu — Ingenieure Qualite & Affaires Reglementaires

---

## Etat actuel

Le systeme est operationnel mais n'a jamais ete utilise en conditions reelles.  
Toutes les dependances sont installees dans `.venv/`, le profil est configure, le CV est pret.

Ce qui manque : **des offres a evaluer et une cle API OpenAI**.

---

## Etape 1 — Configurer la cle API (5 min)

```bash
# Editer le .env et remplir au moins une cle :
vim .env

# Minimum requis pour evaluer des offres :
OPENAI_API_KEY=sk-...        # OpenAI, DeepSeek, Together, OpenRouter...
# ou
GEMINI_API_KEY=...           # Gratuit : https://aistudio.google.com/apikey
```

Verifier :
```bash
source .venv/bin/activate
python -c "import os; from dotenv import load_dotenv; load_dotenv(); print('OK' if os.getenv('OPENAI_API_KEY') else 'MANQUANT')"
```

---

## Etape 2 — Activer le venv (a chaque session)

```bash
source .venv/bin/activate
```

> **Note :** Les commandes `npm run ...` utilisent le `python` du PATH. Active le venv d'abord pour que `python` pointe vers `.venv/bin/python`.

---

## Etape 3 — Trouver des offres biomedicales (15 min)

### 3a. Chercher sur APEC

1. Aller sur [apec.fr](https://www.apec.fr)
2. Rechercher : `"affaires reglementaires"` OU `"qualite"` OU `"biomedical"`
3. Filtrer : France, CDI/CDD, moins de 30 jours
4. Copier 5-10 URLs pertinentes

### 3b. Chercher sur Indeed

1. Aller sur [fr.indeed.com](https://fr.indeed.com)
2. Rechercher : `"regulatory affairs"` OU `"quality engineer"` OU `"medical device"`
3. Filtrer : France, CDI

### 3c. Ajouter dans pipeline.md

```bash
# Editer data/pipeline.md et ajouter les URLs au format :
vim data/pipeline.md
```

Format :
```markdown
# Pipeline

## Pending

- [ ] https://www.apec.fr/offre-12345 | Sanofi | Charge Assurance Qualite | Lyon
- [ ] https://fr.indeed.com/viewjob?jk=abc | bioMerieux | Regulatory Affairs Specialist | Craponne
- [ ] https://www.apec.fr/offre-67890 | Medtronic | Ingenieur Qualite | Paris
```

---

## Etape 4 — Evaluer la premiere offre (2 min)

```bash
source .venv/bin/activate

# Standard (GPT-4o-mini, pas cher)
npm run openai:eval -- --url "https://www.apec.fr/offre-12345"

# Premium (GPT-4o, pour les offres qui comptent vraiment)
SPEND_TIER=premium npm run openai:eval -- --url "https://..."
```

Resultat : un rapport dans `reports/###-entreprise-date.md` avec score /5, analyse, recommandation.

---

## Etape 5 — Generer le CV adapte (1 min)

```bash
npm run pdf
```

Resultat : `output/cv-*.pdf` — CV personnalise pour l'offre evaluee.

---

## Etape 6 — Merger dans le tracker (30 sec)

```bash
npm run merge
npm run verify
```

Resultat : l'entree est ajoutee dans `data/applications.md` avec le statut "Evaluated".

---

## Etape 7 — Iterer

Pour chaque nouvelle offre :
1. Ajouter l'URL dans `pipeline.md`
2. `npm run openai:eval -- --url <url>`
3. `npm run merge`
4. Si interessant → `npm run pdf`

Pour suivre les candidatures :
```bash
npm run verify          # Sante du pipeline
npm run stats --summary # Statistiques
npm run patterns        # Analyse des tendances
```

---

## Roadmap technique (pour plus tard)

### Semaine 1 — Stabiliser
- [ ] Tester `npm run pdf` avec Playwright Python (venv)
- [ ] Tester `npm run gemini:eval` (gratuit, pas de cle OpenAI necessaire)
- [ ] Fix `test_browser_extract.py` (2 tests qui attendent Playwright absent)

### Semaine 2 — Premier pipeline hybride
- [ ] Implementer `python manage.py discover_portals --sector pharma`
- [ ] Tester sur le secteur biomedical
- [ ] Valider les slugs ATS automatiquement

### Semaine 3 — Enrichir
- [ ] Ajouter 10-20 evaluations au tracker
- [ ] Generer des CV adaptes pour les offres prometteuses
- [ ] Preparer le story bank (`interview-prep/story-bank.md`)
- [ ] Premier `npm run star` pour matcher une question d'entretien

### Semaine 4 — Automatiser
- [ ] OpenCode skill `portal-discovery`
- [ ] Script `npm run setup` pour nouvelles installations
- [ ] Nettoyer les README traduits (references `scripts/js/`)

---

## Commandes utiles (memo)

```bash
# Activer l'environnement
source .venv/bin/activate

# Scan (marche surtout pour la tech, pas le biomedical)
npm run scan -- --dry-run

# Evaluer une offre
npm run openai:eval -- --url "https://..."
npm run openai:eval -- --file ./jds/offre.txt

# Generer CV + lettre
npm run pdf
npm run cover-letter

# Tracker
npm run merge
npm run verify
npm run find -- "Sanofi"
npm run set-status -- 1 Applied --note "Candidature envoyee le 2026-07-20"

# Stats
npm run stats --summary
npm run patterns

# Tests
python -m pytest scripts/python/tests -q
```
