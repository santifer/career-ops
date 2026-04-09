# Mode : pipeline — Inbox d'URLs (Afrique francophone)

Traite les URLs d'offres accumulees dans `data/pipeline.md`. Le candidat ajoute des URLs quand il veut et lance ensuite `/career-ops pipeline` pour toutes les traiter d'un coup.

## Workflow

1. **Lire** `data/pipeline.md` -> trouver les items `- [ ]` dans la section "En attente" / "Pending"
2. **Pour chaque URL en attente** :
   a. Calculer le prochain `REPORT_NUM` sequentiel
   b. **Extraire l'offre** avec Playwright -> WebFetch -> WebSearch
   c. Si l'URL n'est pas accessible -> marquer `- [!]` avec une note et continuer
   d. **Executer l'auto-pipeline complet** : Evaluation A-F -> Report .md -> PDF (si score >= 3.0) -> Tracker
   e. **Deplacer vers "Traitees"** : `- [x] #NNN | URL | Entreprise | Role | Score/5 | PDF oui/non`
3. **Si 3+ URLs en attente**, lancer des agents en parallele pour maximiser la vitesse.
4. **A la fin**, afficher un tableau recapitulatif avec recommandations.

## Format de pipeline.md

```markdown
## En attente
- [ ] https://www.africawork.com/offre/123
- [ ] https://www.rekrute.com/offre-456.html | Acme Maroc | Developpeur Full-Stack
- [ ] https://boards.greenhouse.io/wave/jobs/789 | Wave Mobile Money | Backend Engineer
- [!] https://emploi.ci/offre/012 — Erreur : page expiree

## Traitees
- [x] #001 | https://www.africawork.com/offre/100 | Yango | Data Engineer | 3.8/5 | PDF oui
- [x] #002 | https://www.jobafrica.com/offre/200 | Orange Senegal | Dev Mobile | 4.2/5 | PDF oui
```

## Portails africains — Detection intelligente

### Methode de detection par portail

| Portail | Methode preferee | Fallback | Notes |
|---------|-----------------|----------|-------|
| **AfricaWork** (africawork.com) | Playwright | WebFetch | Bien structure, facile a parser |
| **Jobafrica** (jobafrica.com) | Playwright | WebFetch | Redirection parfois vers site entreprise |
| **Rekrute** (rekrute.com) | WebFetch | WebSearch | Contenu statique, WebFetch suffit souvent |
| **Emploi.ma** | WebFetch | WebSearch | Similaire a Rekrute |
| **LinkedIn (Africa)** | Playwright | `[!]` si login requis | Login souvent necessaire |
| **AfricaTechJobs** | WebFetch | WebSearch | Portail specialise tech africain |
| **TechAfrica Jobs** | WebFetch | WebSearch | Agregateur emplois tech |
| **Wave / Orange / MTN careers** | Playwright | WebFetch | Sites entreprises directs |
| **NITA (Cote d'Ivoire)** | WebFetch | WebSearch | Offres formelles CI |
| **Greenhouse / Ashby / Lever** | Playwright | WebFetch | Pour les startups africaines utilisent ces ATS |
| **Email direct** | N/A | Coller le texte | Demander au candidat de coller l'offre |

### Gestion des cas particuliers africains

- **Offre expiree** : Les portails africains laissent souvent les offres en ligne longtemps apres cloture. TOUJOURS verifier qu'il y a encore un bouton "Postuler" actif.
- **Offre en anglais sur un portail francophone** : Evaluer normalement. Generer le CV dans la langue de l'offre.
- **Offre sur WhatsApp / Facebook** : Frequent en Afrique. Demander au candidat de coller le texte brut.
- **Offre PDF** : Lire directement avec le Read tool.
- **Prefixe `local:`** : Lire le fichier local. Ex : `local:jds/wave-backend.md` -> lire `jds/wave-backend.md`

## Numerotation automatique

1. Lister tous les fichiers dans `reports/`
2. Extraire le numero du prefixe (ex : `142-wave-backend-2026...` -> 142)
3. Nouveau numero = maximum trouve + 1

## Verification de sync avant traitement

```bash
node cv-sync-check.mjs
```

En cas de desynchronisation, alerter le candidat avant de continuer.

## Tableau recapitulatif final

```
| # | Entreprise | Role | Marche | Score | PDF | Recommandation |
|---|-----------|------|--------|-------|-----|----------------|
| 001 | Wave | Backend Eng | Remote INT | 4.5/5 | ✅ | Postuler maintenant |
| 002 | Orange CI | Dev Mobile | Presentiel | 3.2/5 | ✅ | A evaluer |
| 003 | Startup XYZ | Full-Stack | Presentiel | 2.1/5 | ❌ | Ne pas postuler |
```

Ajouter systematiquement pour les offres remote :
- Mode de paiement precise ou non (flag si absent)
- Overlap horaire avec l'equipe
