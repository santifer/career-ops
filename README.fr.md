<!-- Traduit depuis santifer/career-ops@411afb3 -->

# Career-Ops FR

[Français](README.fr.md) | [English](README.md)

<p align="center">
  <img src="docs/hero-banner.jpg" alt="Career-Ops — Système multi-agent de recherche d'emploi" width="800">
</p>

<p align="center">
  <em>J'ai passé des mois à postuler à la dure. Alors j'ai conçu le système que j'aurais voulu avoir.</em><br>
  Les entreprises utilisent l'IA pour filtrer les candidats. <strong>J'ai simplement donné aux candidats l'IA pour <em>choisir</em> les entreprises.</strong><br>
  <em>Fork francophone de <a href="https://github.com/santifer/career-ops">career-ops</a> adapté au marché français.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white" alt="Claude Code">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white" alt="Playwright">
  <img src="https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white" alt="Go">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
  <img src="https://img.shields.io/badge/FR-blue?style=flat" alt="FR">
</p>

---

<p align="center">
  <img src="docs/demo.gif" alt="Career-Ops Demo" width="800">
</p>

<p align="center"><strong>740+ offres d'emploi évaluées · 100+ CV personnalisés · 1 poste idéal décroché</strong></p>

---

## Qu'est-ce que c'est

Career-Ops transforme n'importe quel CLI d'IA en centre de commande pour ta recherche d'emploi. Au lieu de suivre tes candidatures dans un tableur, tu obtiens un pipeline alimenté par l'IA qui :

- **Évalue les offres d'emploi** avec un système de score structuré A-F (10 dimensions pondérées)
- **Génère des CV sur mesure** — optimisés ATS, personnalisés par offre
- **Scanne les portails** automatiquement (France Travail, APEC, Welcome to the Jungle, HelloWork…)
- **Traite en lot** — évalue 10+ offres en parallèle avec des sous-agents
- **Suit tout** dans une source de vérité unique avec contrôles d'intégrité

> **Important : ce n'est PAS un outil de candidature de masse.** Career-ops est un filtre — il t'aide à trouver les rares offres qui méritent ton temps parmi des centaines. Le système déconseille fortement de candidater à tout ce qui a un score inférieur à 4.0/5. Ton temps est précieux, celui du recruteur aussi. Relis toujours avant de candidater.

Career-ops est agentique : Claude Code navigue sur les pages carrières avec Playwright, évalue l'adéquation en raisonnant sur ton CV vs la fiche de poste (pas du matching par mots-clés), et adapte ton CV par offre.

> **Attention : les premières évaluations ne seront pas parfaites.** Le système ne te connaît pas encore. Nourris-le de contexte — ton CV, ton parcours, tes preuves, tes préférences, tes forces, ce que tu veux éviter. Plus tu l'alimentes, meilleur il devient. Pense à l'onboarding d'un nouveau recruteur : la première semaine il doit apprendre à te connaître, puis il devient indispensable.

---

## Prérequis

- **Node.js** >= 18
- **Claude Code** (ou autre CLI IA compatible)
- **Compte France Travail** (optionnel, pour le scan via API)
- **Chromium** (installé via Playwright pour la génération PDF)

---

## Fonctionnalités

| Fonctionnalité | Description |
|----------------|-------------|
| **Auto-Pipeline** | Colle une URL, obtiens une évaluation complète + PDF + entrée dans le tableau de suivi |
| **Évaluation en 6 blocs** | Résumé du poste, adéquation CV, stratégie de niveau, recherche salariale, personnalisation, préparation d'entretien (STAR+R) |
| **Banque d'histoires d'entretien** | Accumule des histoires STAR+Réflexion à travers les évaluations — 5-10 histoires maîtresses qui répondent à toute question comportementale |
| **Scripts de négociation** | Frameworks de négociation salariale, argumentaires contre les décotes géographiques, levier d'offres concurrentes |
| **Génération PDF ATS** | CV avec injection de mots-clés, design Space Grotesk + DM Sans |
| **Scanner de portails** | Portails français préconfigurés (France Travail, APEC, Welcome to the Jungle, HelloWork, Jobijoba, RégionsJob) + requêtes personnalisées |
| **Traitement par lot** | Évaluation parallèle avec des workers `claude -p` |
| **Dashboard TUI** | Interface terminal pour parcourir, filtrer et trier ton pipeline |
| **Humain dans la boucle** | L'IA évalue et recommande, tu décides et agis. Le système ne soumet jamais une candidature — tu as toujours le dernier mot |
| **Intégrité du pipeline** | Fusion automatique, déduplication, normalisation des statuts, contrôles de santé |

---

## Démarrage rapide

```bash
# 1. Cloner et installer
git clone https://github.com/atoox-git/career-ops-fr.git
cd career-ops-fr && npm install
npx playwright install chromium   # Requis pour la génération PDF

# 2. Vérifier l'installation
npm run doctor                     # Valide tous les prérequis

# 3. Configurer
cp config/profile.example.yml config/profile.yml  # Édite avec tes infos
cp templates/portals.example.yml portals.yml       # Personnalise les entreprises

# 4. Ajouter ton CV
# Crée cv.md à la racine du projet avec ton CV en markdown

# 5. Personnaliser avec Claude
claude   # Ouvre Claude Code dans ce répertoire

# Les modes français sont dans modes/fr/
# Demande à Claude d'adapter le système :
# "Change les archétypes pour des postes d'ingénierie backend"
# "Ajoute ces 5 entreprises à portals.yml"
# "Mets à jour mon profil avec ce CV que je colle"

# 6. Commencer à utiliser
# Colle une URL d'offre ou lance /career-ops
```

> **Le système est conçu pour être personnalisé par Claude lui-même.** Modes, archétypes, poids du score, scripts de négociation — demande simplement à Claude de les modifier. Il lit les mêmes fichiers qu'il utilise, donc il sait exactement quoi éditer.

Voir [docs/SETUP.md](docs/SETUP.md) pour le guide d'installation complet.

---

## Utilisation

Career-ops est une commande slash unique avec plusieurs modes :

```
/career-ops                    → Affiche toutes les commandes disponibles
/career-ops {colle une offre}  → Pipeline automatique complet (évaluation + PDF + tableau de suivi)
/career-ops scan               → Scanner les portails pour de nouvelles offres
/career-ops pdf                → Générer un CV optimisé ATS
/career-ops batch              → Évaluer plusieurs offres en lot
/career-ops tracker            → Voir le statut des candidatures
/career-ops apply              → Remplir les formulaires de candidature avec l'IA
/career-ops pipeline           → Traiter les URL en attente
/career-ops contacto           → Message de prise de contact LinkedIn
/career-ops deep               → Recherche approfondie sur une entreprise
/career-ops training           → Évaluer une formation/certification
/career-ops project            → Évaluer un projet portfolio
```

Ou colle simplement une URL d'offre ou une description — career-ops la détecte automatiquement et lance le pipeline complet.

---

## Comment ça fonctionne

```
Tu colles une URL d'offre ou une description
        │
        ▼
┌──────────────────┐
│  Détection       │  Classifie : LLMOps / Agentique / PM / SA / FDE / Transformation
│  d'archétype     │
└────────┬─────────┘
         │
┌────────▼─────────┐
│  Évaluation A-F  │  Adéquation, lacunes, recherche salariale, histoires STAR
│  (lit cv.md)     │
└────────┬─────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
Rapport  PDF  Tableau de suivi
  .md   .pdf   .tsv
```

---

## Portails préconfigurés

Le scanner est préconfiguré pour les **portails français** suivants :

| Portail | Méthode d'accès |
|---------|-----------------|
| **France Travail** | API officielle (avec jeton) |
| **APEC** | Playwright respectueux (rate-limit) |
| **Welcome to the Jungle** | Playwright respectueux |
| **HelloWork** | Playwright respectueux |
| **Jobijoba** | Playwright respectueux |
| **RégionsJob** | Playwright respectueux |

Plus les portails internationaux : Greenhouse, Ashby, Lever, Wellfound.

Copie `templates/portals.example.yml` vers `portals.yml` et ajoute tes propres entreprises.

---

## Politique d'accès aux portails

L'accès aux portails d'emploi suit 3 niveaux, du plus respectueux au plus manuel :

| Niveau | Méthode | Exemple |
|--------|---------|---------|
| **1. API officielle** | Requêtes authentifiées, rate-limit respecté | France Travail (API Emploi Store) |
| **2. Playwright respectueux** | Navigation automatisée avec délais humains, respect du `robots.txt`, pas de surcharge | APEC, Welcome to the Jungle, HelloWork |
| **3. Collé manuellement** | Tu copies-colles la fiche de poste dans Claude | Tout portail sans accès automatisé |

**Règles strictes :**
- Jamais de scraping agressif (délai minimum 3 s entre requêtes)
- Respect du `robots.txt` et des conditions d'utilisation
- Pas de création de compte automatisée
- Pas de soumission automatique de candidature sans validation humaine

---

## Dashboard TUI

Le dashboard terminal intégré te permet de parcourir ton pipeline visuellement :

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..
```

Fonctionnalités : 6 onglets de filtre, 4 modes de tri, vue groupée/plate, prévisualisations en chargement différé, changements de statut en ligne.

---

## Structure du projet

```
career-ops-fr/
├── CLAUDE.md                    # Instructions pour l'agent
├── cv.md                        # Ton CV (à créer)
├── article-digest.md            # Tes preuves (optionnel)
├── config/
│   └── profile.example.yml      # Template pour ton profil
├── modes/
│   ├── fr/                      # Modes français
│   ├── _shared.md               # Contexte partagé (à personnaliser)
│   ├── oferta.md                # Évaluation unitaire
│   ├── pdf.md                   # Génération PDF
│   ├── scan.md                  # Scanner de portails
│   ├── batch.md                 # Traitement par lot
│   └── ...
├── templates/
│   ├── cv-template.html         # Template CV optimisé ATS
│   ├── portals.example.yml      # Config scanner (template)
│   └── states.yml               # Statuts canoniques
├── batch/
│   ├── batch-prompt.md          # Prompt worker autonome
│   └── batch-runner.sh          # Script orchestrateur
├── dashboard/                   # Visualiseur pipeline en Go (TUI)
├── data/                        # Données de suivi (gitignored)
├── reports/                     # Rapports d'évaluation (gitignored)
├── output/                      # PDF générés (gitignored)
├── fonts/                       # Space Grotesk + DM Sans
├── docs/                        # Installation, personnalisation, architecture
└── examples/                    # Exemples de CV, rapport, preuves
```

---

## Stack technique

![Claude Code](https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white)
![Go](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)
![Bubble Tea](https://img.shields.io/badge/Bubble_Tea-FF75B5?style=flat&logo=go&logoColor=white)

- **Agent** : Claude Code avec skills et modes personnalisés
- **PDF** : Playwright/Puppeteer + template HTML
- **Scanner** : Playwright + API France Travail + WebSearch
- **Dashboard** : Go + Bubble Tea + Lipgloss (thème Catppuccin Mocha)
- **Données** : Tables Markdown + config YAML + fichiers TSV par lot

---

## À propos

**Projet original** créé par [Santiago](https://github.com/santifer) — Head of Applied AI, qui a construit career-ops pour gérer sa propre recherche d'emploi et décrocher son poste actuel. Voir le [projet original](https://github.com/santifer/career-ops).

**Adaptation française** par Bertrand — fork adapté au marché français, avec des portails francophones, des modes traduits et une politique d'accès respectueuse des plateformes locales.

---

## Star History

<a href="https://www.star-history.com/?repos=atoox-git%2Fcareer-ops-fr&type=timeline&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=atoox-git/career-ops-fr&type=timeline&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=atoox-git/career-ops-fr&type=timeline&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=atoox-git/career-ops-fr&type=timeline&legend=top-left" />
 </picture>
</a>

---

## Avertissement

**career-ops est un outil local, open source — PAS un service hébergé.** En utilisant ce logiciel, tu reconnais que :

1. **Tu contrôles tes données.** Ton CV, tes coordonnées et tes données personnelles restent sur ta machine et sont envoyées directement au fournisseur d'IA que tu choisis (Anthropic, OpenAI, etc.). Nous ne collectons, ne stockons et n'avons accès à aucune de tes données.
2. **Tu contrôles l'IA.** Les prompts par défaut instruisent l'IA de ne pas soumettre automatiquement de candidatures, mais les modèles d'IA peuvent se comporter de manière imprévisible. Si tu modifies les prompts ou utilises d'autres modèles, tu le fais à tes risques et périls. **Relis toujours le contenu généré par l'IA avant de candidater.**
3. **Tu respectes les CGU des tiers.** Tu dois utiliser cet outil en conformité avec les conditions d'utilisation des portails d'emploi (France Travail, APEC, Welcome to the Jungle, LinkedIn, etc.). N'utilise pas cet outil pour spammer les employeurs ou surcharger les systèmes ATS.
4. **Aucune garantie.** Les évaluations sont des recommandations, pas des vérités. Les modèles d'IA peuvent halluciner des compétences ou de l'expérience. Les auteurs ne sont pas responsables des résultats d'embauche, des candidatures rejetées, des restrictions de compte ou de toute autre conséquence.

Voir [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md) pour les détails complets. Ce logiciel est fourni sous [licence MIT](LICENSE) « tel quel », sans garantie d'aucune sorte.

---

## Contributeurs

<a href="https://github.com/atoox-git/career-ops-fr/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=atoox-git/career-ops-fr" />
</a>

Tu as décroché un emploi grâce à career-ops ? [Partage ton histoire !](https://github.com/atoox-git/career-ops-fr/issues/new)

---

## Licence

MIT

---

## Restons en contact

[![GitHub](https://img.shields.io/badge/GitHub-000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/atoox-git/career-ops-fr)
[![Discord](https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/8pRpHETxa4)
