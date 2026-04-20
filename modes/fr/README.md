# career-ops -- Modes francophones (`modes/fr/`)

Ce dossier contient les traductions françaises des principaux modes career-ops pour les candidats qui ciblent le marché francophone (France, Belgique, Suisse romande, Luxembourg, Québec).

## Quand utiliser ces modes ?

Utilise `modes/fr/` si au moins une de ces conditions est remplie :

- Tu postules principalement à des **offres d'emploi en français** (Welcome to the Jungle, Indeed FR, APEC, Pôle emploi / France Travail, LinkedIn FR, sites carrières)
- Ton **CV est en français** ou tu alternes entre FR et EN selon l'offre
- Tu as besoin de réponses et lettres de motivation en **français tech naturel**, pas traduit par une machine
- Tu dois gérer des **spécificités contractuelles francophones** : convention collective, RTT, mutuelle, prévoyance, 13e mois, période d'essai, préavis, chèques-déjeuner, intéressement/participation

Si la plupart de tes offres sont en anglais, reste sur les modes standard dans `modes/`. Les modes anglais fonctionnent pour les offres francophones, mais ne connaissent pas les spécificités du marché francophone en détail.

## Comment activer ?

### Option 1 -- Par session

Dis à Claude en début de session :

> « Utilise les modes français sous `modes/fr/`. »

Claude lira alors les fichiers de ce dossier au lieu de `modes/`.

### Option 2 -- En permanence

Ajoute dans `config/profile.yml` :

```yaml
language:
  primary: fr
  modes_dir: modes/fr
```

Rappelle-le à Claude lors de ta première session (« Regarde dans `profile.yml`, j'ai configuré `language.modes_dir` »). Claude utilisera automatiquement les modes français.

## Quels modes sont traduits ?

| Fichier | Traduit depuis | Rôle |
|---------|----------------|------|
| `_shared.md` | `modes/_shared.md` (EN) | Contexte partagé, archétypes, règles globales, spécificités marché francophone |
| `offre.md` | `modes/oferta.md` (ES) | Évaluation complète d'une offre (Blocs A-F) |
| `postuler.md` | `modes/apply.md` (EN) | Assistant live pour remplir les formulaires de candidature |
| `pipeline.md` | `modes/pipeline.md` (ES) | Inbox d'URLs / Second Brain pour les offres collectées |
| `scan.md` | `modes/scan.md` (ES) | Scanner de portails — découverte d'offres |
| `deep.md` | `modes/deep.md` (ES) | Recherche approfondie sur l'entreprise |
| `relance.md` | `modes/followup.md` (EN) | Suivi de cadence des relances |
| `entretien.md` | `modes/interview-prep.md` (EN) | Préparation d'entretien par entreprise |
| `contact.md` | `modes/contacto.md` (ES) | Prise de contact LinkedIn |
| `patterns.md` | `modes/patterns.md` (EN) | Détecteur de patterns de rejet |
| `_profile.template.md` | `modes/_profile.template.md` (EN) | Template de profil utilisateur |
| `formation.md` | `modes/training.md` (ES) | Évaluation de formation |
| `projet.md` | `modes/project.md` (ES) | Évaluation de projet portfolio |

## Ce qui reste en anglais (tooling)

Volontairement non traduit — ce sont des modes d'outillage technique :

- `modes/pdf.md` — Génération PDF
- `modes/batch.md` — Évaluation par lot
- `modes/latex.md` — Génération LaTeX
- `modes/tracker.md` — Gestion du tracker
- `modes/auto-pipeline.md` — Pipeline automatique

## Ce qui reste en anglais (vocabulaire tech standard)

- `cv.md`, `pipeline`, `tracker`, `report`, `score`, `archetype`, `proof point`
- Noms d'outils (`Playwright`, `WebSearch`, `WebFetch`, `Read`, `Write`, `Edit`, `Bash`)
- Valeurs de statut dans le tracker (`Evaluated`, `Applied`, `Interview`, `Offer`, `Rejected`)
- Extraits de code, chemins, commandes

Les modes utilisent du français tech naturel, tel qu'il est parlé dans les équipes engineering à Paris, Lyon ou Genève : texte courant en français, termes techniques en anglais là où c'est l'usage. Pas de traduction forcée de « Pipeline » en « Canalisation » ni de « Deploy » en « Déploiement applicatif ».

## Lexique de référence

Pour garder un ton cohérent si tu modifies ou étends les modes :

| Anglais | Français (dans cette codebase) |
|---------|-------------------------------|
| Job posting | Offre d'emploi / Annonce |
| Application | Candidature |
| Cover letter | Lettre de motivation |
| Resume / CV | CV |
| Salary | Salaire / Rémunération |
| Compensation | Rémunération / Package |
| Skills | Compétences |
| Interview | Entretien |
| Hiring manager | Manager recruteur / Hiring manager |
| Recruiter | Recruteur (ou Recruiter) |
| AI | IA (Intelligence Artificielle) |
| Requirements | Prérequis / Exigences |
| Career history | Parcours professionnel |
| Notice period | Préavis |
| Probation | Période d'essai |
| Vacation | Congés payés (CP) |
| 13th month salary | 13e mois / Prime de fin d'année |
| Permanent employment | CDI (Contrat à Durée Indéterminée) |
| Fixed-term contract | CDD (Contrat à Durée Déterminée) |
| Freelance | Freelance / Indépendant / Auto-entrepreneur |
| Collective agreement | Convention collective |
| Works council | CSE (Comité Social et Économique) |
| Profit sharing | Intéressement / Participation |
| Meal vouchers | Titres-restaurant / Chèques-déjeuner |
| Health insurance | Mutuelle d'entreprise |
| Disability/life insurance | Prévoyance |
| RTT | RTT (Réduction du Temps de Travail) |
| Cadre status | Statut cadre |
| SYNTEC | Convention SYNTEC (IT/consulting) |
| Follow-up | Relance |
| Rejection | Rejet |
| Pattern | Pattern (conservé) |
| Training | Formation |
| Project | Projet |

## Contribuer

Pour améliorer une traduction ou ajouter un mode :

1. Ouvre une Issue avec ta proposition (voir `CONTRIBUTING.md`)
2. Respecte le lexique ci-dessus pour garder le ton cohérent
3. Traduis de manière idiomatique — pas de traduction mot à mot
4. Conserve les éléments structurels (Blocs A-F, tableaux, blocs de code, instructions outils) à l'identique
5. Teste avec une vraie offre francophone (Welcome to the Jungle, APEC, Indeed FR) avant de soumettre la PR
