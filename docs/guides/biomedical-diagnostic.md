# Diagnostic — Secteur Biomedical & Pharma

**Date :** 2026-07-16  
**Profil :** Audrey Kwekeu — Ingenieure Qualite & Affaires Reglementaires

---

## Constat

### Comment portals.yml est alimente

**Aucune automatisation.** Le fichier est gere manuellement :

| Methode | Description | Automatique ? |
|---------|-------------|:---:|
| Copie du template | `cp templates/portals.example.yml config/portals.yml` | Non |
| Ajout manuel | Editer le YAML a la main | Non |
| Django admin web | UI web pour gerer les entreprises en DB, sync bidirectionnelle | Non |
| LLM extraction | API qui extrait une entree entreprise depuis du texte via LLM | Semi |
| Discovery bridge | Merge les mots-cles decouverts dans `title_filter.positive` | Semi |

Le template (`templates/portals.example.yml`) contient ~100 entreprises AI/tech preselectionnees par l'auteur (santifer) pour son propre secteur. Il n'y a aucun scraper automatique qui decouvre et ajoute des entreprises.

### Pourquoi le scanner ne trouve pas d'offres biomedicales

Apres tests approfondis (`scan`, `scan_ats_full`, verification des APIs), le scanner automatique de career-ops **ne trouve pas d'offres pertinentes** pour le secteur biomedical/pharma/dispositifs medicaux en France.

### Pourquoi

| Probleme | Detail |
|----------|--------|
| **ATS incompatibles** | 46 entreprises pharma/DM testees : **0** utilisent Greenhouse ou Lever. Toutes utilisent Workday, SAP SuccessFactors, Oracle Taleo, Eightfold, ou des portails custom. |
| **scan_ats_full inefficace** | 28 746 entreprises scannees sur Workday → **0 offre** retenue avec les mots-cles biomedical/qualite/reglementaire. Le jeu de donnees public est domine par la tech. |
| **WebSearch non implemente** | Le `scan_method: websearch` n'a pas de provider integre. La decouverte via moteur de recherche n'est pas operationnelle. |
| **Concu pour la tech** | Le scanner a ete cree par un AI Engineer pour des roles AI/ML. Les 85+ entreprises preconfigurees sont des startups tech (Anthropic, Cohere, Vercel...). |

### Ce qui a ete tente

```
npm run scan                         → 5306 offres, 0 biomedical
npm run scan -- --company bioMerieux → 404, pas d'API Greenhouse
npm run scan -- --company Sanofi     → 0, pas de provider
scan_ats_full --ats workday          → 28746 companies, 0 offre
Verification API 16 slugs            → 0 Greenhouse, 0 Lever
```

---

## Ce qui fonctionne

Tout le reste du pipeline est **pleinement operationnel** et pertinent pour Audrey :

| Fonctionnalite | Commande | Interet |
|---------------|----------|---------|
| **Evaluation d'offres** | `npm run openai:eval -- --url <url>` | Score automatise contre le profil |
| **Generation CV** | `npm run pdf` | CV PDF depuis `cv.md` |
| **Lettre de motivation** | `npm run cover-letter` | Adaptee a l'offre |
| **Suivi pipeline** | `npm run merge` / `npm run verify` | Tracker dans `applications.md` |
| **Reponses recruteurs** | `npm run paste-reply` | Classification des emails |
| **Gap competences** | `python -m scripts.python.evaluation.jd_skill_gap` | Gap map vs CV |
| **Stats** | `npm run patterns` / `npm run upskill` | Analyse du pipeline |
| **Preparation entretiens** | `npm run star` | Matching questions → stories |

---

## Strategie recommandee

### Pour la decouverte d'offres (phase 1)

Alimenter `data/pipeline.md` **manuellement** avec des URLs d'offres trouvees sur :

- **APEC** (apec.fr) — le plus riche pour cadres France
- **Indeed France** (fr.indeed.com) — generaliste, mots-cles "affaires reglementaires", "qualite", "biomedical"
- **HelloWork** (hellowork.com) — RegionsJob, ParisJob
- **LinkedIn Jobs** — recherche "qualite" OU "reglementaire" + filtre France
- **Sites carriere directs** — Sanofi, bioMerieux, Medtronic, Siemens Healthineers, Stryker, Roche...

#### Workflow recommande

```
1. Ouvrir APEC / Indeed / LinkedIn
2. Recherche : "affaires reglementaires" OR "qualite" OR "biomedical"
3. Filtrer : France, CDI/CDD, < 30 jours
4. Copier chaque URL pertinente
5. Ajouter dans data/pipeline.md au format :
   - [ ] <url> | <entreprise> | <titre> | <localisation>
6. Lancer l'evaluation :
   npm run openai:eval -- --url <url>
7. Le rapport est genere dans reports/
8. Merge dans le tracker :
   npm run merge
```

### Exemple de pipeline.md a maintenir

```markdown
# Pipeline — Offres biomedicales

## Pending

- [ ] https://www.apec.fr/offre-12345 | Sanofi | Charge Assurance Qualite | Lyon
- [ ] https://fr.indeed.com/viewjob?jk=abc | bioMerieux | Regulatory Affairs Specialist | Craponne

## Processed

- [x] https://www.apec.fr/offre-67890 | Medtronic | Ingenieur Qualite | Paris → Report 001
```

### Pour l'evaluation automatisee

Une fois les URLs dans `pipeline.md` :

```bash
# Evaluer une offre (standard = GPT-4o-mini)
npm run openai:eval -- --url "https://www.apec.fr/offre-12345"

# Evaluer en premium (GPT-4o) pour les offres qui comptent vraiment
SPEND_TIER=premium npm run openai:eval -- --url "https://..."

# Generer le CV adapte
npm run pdf

# Verifier l'integrite du tracker
npm run verify
```

---

## Personnalisation effectuee

| Fichier | Changement |
|---------|-----------|
| `cv.md` | Cree avec le parcours biomedical complet d'Audrey (4 experiences, 3 projets, 4 formations) |
| `config/profile.yml` | Archetypes mis a jour : Quality/Regulatory Engineer, Biomedical Engineer |
| `config/portals.yml` | 24 entreprises pharma/DM + mots-cles biomedical (inutilisable en scan auto, mais documente les cibles) |
| `config/portals.yml.backup-ai-tech` | Sauvegarde de l'ancien profil AI/tech |
| `docs/guides/portals-customization.md` | Guide complet de personnalisation des portails |

---

## Si le secteur change

Pour restaurer le profil AI/tech (ou tout autre secteur) :

```bash
cp config/portals.yml.backup-ai-tech config/portals.yml
```

Puis suivre le guide : `docs/guides/portals-customization.md`

---

## Conclusion

Career-ops reste un **excellent outil d'evaluation et de suivi** pour Audrey. Les fonctionnalites de scoring, generation de CV, tracking, et preparation aux entretiens sont directement applicables a son secteur.

Le scanner automatique est en revanche inadapte au biomedical — la decouverte d'offres doit se faire manuellement via les job boards francais (APEC, Indeed, HelloWork, LinkedIn), puis les URLs sont injectees dans le pipeline pour evaluation automatisee.

C'est exactement le workflow que l'auteur (santifer) utilisait pour les offres hors-portails tech : curation manuelle + evaluation automatisee.
