# Career-Ops

[English](README.md) | [Español](README.es.md) | [Português (Brasil)](README.pt-BR.md) | [한국어](README.ko-KR.md) | [日本語](README.ja.md) | [Русский](README.ru.md) | [Français](README.fr.md)

<p align="center">
  <a href="https://x.com/santifer"><img src="docs/hero-banner.jpg" alt="Career-Ops — Multi-Agent Job Search System" width="800"></a>
</p>

<p align="center">
  <em>J'ai passé des mois à postuler à des emplois à la dure. J'ai donc conçu le système que j'aurais aimé avoir.</em><br>
  Les entreprises utilisent l'IA pour filtrer les candidats. <strong>J'ai donné aux candidats une IA pour <em>choisir</em> les entreprises.</strong><br>
  <em>C'est maintenant open source.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white" alt="Claude Code">
  <img src="https://img.shields.io/badge/OpenCode-111827?style=flat&logo=terminal&logoColor=white" alt="OpenCode">
  <img src="https://img.shields.io/badge/Codex_(bientôt)-6B7280?style=flat&logo=openai&logoColor=white" alt="Codex">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white" alt="Go">
  <img src="https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white" alt="Playwright">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
  <a href="https://discord.gg/8pRpHETxa4"><img src="https://img.shields.io/badge/Discord-5865F2?style=flat&logo=discord&logoColor=white" alt="Discord"></a>
  <br>
  <img src="https://img.shields.io/badge/EN-blue?style=flat" alt="EN">
  <img src="https://img.shields.io/badge/ES-red?style=flat" alt="ES">
  <img src="https://img.shields.io/badge/DE-grey?style=flat" alt="DE">
  <img src="https://img.shields.io/badge/FR-blue?style=flat" alt="FR">
  <img src="https://img.shields.io/badge/PT--BR-green?style=flat" alt="PT-BR">
  <img src="https://img.shields.io/badge/KO-white?style=flat" alt="KO">
  <img src="https://img.shields.io/badge/JA-red?style=flat" alt="JA">
</p>

---

<p align="center">
  <img src="docs/demo.gif" alt="Démo Career-Ops" width="800">
</p>

<p align="center"><strong>Plus de 740 offres d'emploi évaluées · Plus de 100 CV personnalisés · 1 rôle de rêve décroché</strong></p>

<p align="center"><a href="https://discord.gg/8pRpHETxa4"><img src="https://img.shields.io/badge/Join_the_community-Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a></p>

## Qu'est-ce que c'est

Career-Ops transforme n'importe quelle interface de codage IA en un centre de commande complet de recherche d'emploi. Au lieu de suivre manuellement les candidatures dans une feuille de calcul, vous obtenez un pipeline optimisé par l'IA qui :

- **Évalue les offres** avec un système de notation structuré de A à F (10 dimensions pondérées)
- **Génère des PDF sur mesure** -- des CV optimisés ATS personnalisés par description de poste
- **Scan les portails** automatiquement (Greenhouse, Ashby, Lever, pages d'entreprise)
- **Traite par lots** -- évaluer plus de 10 offres en parallèle avec des sous-agents
- **Suit tout** dans une source de vérité unique avec des contrôles d'intégrité

> **Important : Il ne s'agit PAS d'un outil de type « spray-and-pray » (tirer dans le tas).** Career-ops est un filtre -- il vous aide à trouver les quelques offres qui valent votre temps parmi des centaines. Le système déconseille fortement de postuler à quoi que ce soit avec un score inférieur à 4,0/5. Votre temps est précieux, et celui du recruteur aussi. Passez toujours en revue avant de soumettre.

Career-ops est un système agentique : Claude Code navigue sur les pages carrières avec Playwright, évalue l'adéquation en raisonnant sur votre CV par rapport à la description du poste (pas de correspondance de mots-clés) et adapte votre CV par annonce.

> **Attention : les premières évaluations ne seront pas formidables.** Le système ne vous connaît pas encore. Fournissez-lui du contexte -- votre CV, votre histoire professionnelle, vos arguments de preuve, vos préférences, ce à quoi vous êtes bon, ce que vous voulez éviter. Plus vous le nourrissez, meilleur il devient. Considérez cela comme l'intégration d'un nouveau recruteur : la première semaine, ils ont besoin d'en apprendre sur vous, puis ils deviennent inestimables.

Construit par quelqu'un qui l'a utilisé pour évaluer plus de 740 offres d'emploi, générer plus de 100 CV personnalisés et décrocher un rôle de Head of Applied AI. [Lisez l'étude de cas complète](https://santifer.io/career-ops-system).

## Fonctionnalités

| Fonctionnalité | Description |
|---------|-------------|
| **Auto-Pipeline** | Collez une URL, obtenez une évaluation complète + PDF + entrée de suivi |
| **Évaluation à 6 blocs** | Résumé du rôle, adéquation du CV, stratégie de niveau, recherche de rémunération, personnalisation, préparation aux entretiens (STAR+R) |
| **Banque d'histoires d'entretien** | Accumule les histoires STAR+Réflexion à travers les évaluations -- 5 à 10 histoires maîtresses qui répondent à toute question comportementale |
| **Scripts de négociation** | Cadres de négociation salariale, contestation des remises géographiques, gestion des offres concurrentes |
| **Génération PDF ATS** | CV injectés de mots-clés avec design Space Grotesk + DM Sans |
| **Scanner de portails** | Plus de 45 entreprises préconfigurées (Anthropic, OpenAI, ElevenLabs, Retool, n8n...) + requêtes personnalisées sur Ashby, Greenhouse, Lever, Wellfound |
| **Traitement par lot** | Évaluation parallèle avec les workers `claude -p` |
| **Tableau de bord TUI** | Interface utilisateur terminal (TUI) pour parcourir, filtrer et trier votre pipeline |
| **L'Humain dans la Boucle** | L'IA évalue et recommande, vous décidez et agissez. Le système ne soumet jamais une candidature - vous avez toujours le dernier mot |
| **Intégrité du pipeline** | Fusion automatisée, déduplication, normalisation d'état, contrôles de santé |

## Démarrage Rapide

```bash
# 1. Cloner et installer
git clone https://github.com/santifer/career-ops.git
cd career-ops && npm install
npx playwright install chromium   # Requis pour la génération de PDF

# 2. Vérifier la configuration
npm run doctor                     # Valide tous les prérequis

# 3. Configurer
cp config/profile.example.yml config/profile.yml  # Éditez avec vos détails
cp templates/portals.example.yml portals.yml       # Personnaliser les entreprises

# 4. Ajouter votre CV
# Créez cv.md dans le répertoire racine avec votre CV en markdown

# 5. Personnaliser avec Claude
claude   # Ouvrir Claude Code dans ce répertoire

# Ensuite, demandez à Claude d'adapter le système à vous :
# "Change les archétypes vers des rôles d'ingénierie backend"
# "Traduis les modes en français"
# "Ajoute ces 5 entreprises à portals.yml"
# "Mets à jour mon profil avec ce CV que je colle"

# 6. Commencer à utiliser
# Collez l'URL d'un poste ou exécutez /career-ops
```

> **Le système est conçu pour être personnalisé par Claude lui-même.** Modes, archétypes, pondération des scores, scripts de négociation -- demandez simplement à Claude de les modifier. Il lit les mêmes fichiers qu'il utilise, donc il sait exactement quoi modifier.

Consultez [docs/SETUP.md](docs/SETUP.md) pour le guide de configuration complet.

## Utilisation

Career-ops est une seule commande avec plusieurs modes :

```
/career-ops                → Afficher toutes les commandes disponibles
/career-ops {URL de JD}    → Auto-pipeline complet (évaluer + PDF + suivi)
/career-ops scan           → Scanner les portails pour les nouvelles offres
/career-ops pdf            → Générer un CV optimisé pour les ATS
/career-ops batch          → Évaluer par lots plusieurs offres
/career-ops tracker        → Afficher les candidatures
/career-ops apply          → Remplir les formulaires avec l'IA
/career-ops pipeline       → Traiter les URL en attente
/career-ops contacto       → Message d'accroche LinkedIn
/career-ops deep           → Recherche approfondie sur l'entreprise
/career-ops training       → Évaluer un cours/certificat
/career-ops project        → Évaluer un projet portfolio
```

Ou collez simplement une URL ou description de poste directement -- career-ops la détecte automatiquement et exécute le pipeline complet.

## Comment ça marche

```
Vous collez une URL ou description de poste
        │
        ▼
┌──────────────────┐
│  Détection       │  Classifie : LLMOps / Agentic / PM / SA / FDE / Transformation
│  d'archétype     │
└────────┬─────────┘
         │
┌────────▼─────────┐
│ Évaluation A-F   │  Adéquation, lacunes, recherche comp, histoires STAR
│ (lit cv.md)      │
└────────┬─────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
 Rapport PDF Tracker
   .md  .pdf  .tsv
```

## Portails Préconfigurés

Le scanner est livré avec **45+ entreprises** prêtes à être scannées et **19 requêtes de recherche** sur les principaux sites d'emploi. Copiez `templates/portals.example.yml` vers `portals.yml` et ajoutez les vôtres :

**Laban IA :** Anthropic, OpenAI, Mistral, Cohere, LangChain, Pinecone
**IA Vocale :** ElevenLabs, PolyAI, Parloa, Hume AI, Deepgram, Vapi, Bland AI
**Plateformes IA :** Retool, Airtable, Vercel, Temporal, Glean, Arize AI
**Centre de contact :** Ada, LivePerson, Sierra, Decagon, Talkdesk, Genesys
**Entreprise :** Salesforce, Twilio, Gong, Dialpad
**LLMOps :** Langfuse, Weights & Biases, Lindy, Cognigy, Speechmatics
**Automatisation :** n8n, Zapier, Make.com
**Européennes :** Factorial, Attio, Tinybird, Clarity AI, Travelperk

**Sites d'emploi cherchés :** Ashby, Greenhouse, Lever, Wellfound, Workable, RemoteFront

## Tableau de bord TUI

Le tableau de bord terminal intégré vous permet de parcourir visuellement votre pipeline :

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..
```

Fonctionnalités : 6 onglets filtrants, 4 modes de tri, vue groupée/plate, aperçus à chargement différé, modifications de statut en ligne.

## Structure du Projet

```
career-ops/
├── CLAUDE.md                    # Instructions de l'agent
├── cv.md                        # Votre CV (à créer)
├── article-digest.md            # Vos arguments de preuves (optionnel)
├── config/
│   └── profile.example.yml      # Modèle de votre profil
├── modes/                       # 14 modes de compétences
│   ├── _shared.md               # Contexte partagé (à personnaliser)
│   ├── oferta.md                # Évaluation unique
│   ├── pdf.md                   # Génération PDF
│   ├── scan.md                  # Scanner de portails
│   ├── batch.md                 # Traitement de lot
│   └── ...
├── templates/
│   ├── cv-template.html         # Modèle CV optimisé ATS
│   ├── portals.example.yml      # Modèle de config scanner
│   └── states.yml               # Statuts canoniques
├── batch/
│   ├── batch-prompt.md          # Invite de worker autonome
│   └── batch-runner.sh          # Script d'orchestration
├── dashboard/                   # Visionneur TUI pipeline Go
├── data/                        # Vos données de suivi (ignoré via git)
├── reports/                     # Rapports d'évaluation (ignorés via git)
├── output/                      # PDF générés (ignorés via git)
├── fonts/                       # Espace Grotesk + DM Sans
├── docs/                        # Configuration, architecture etc.
└── examples/                    # Exemples de CV, rapport, etc.
```

## Pile technologique

![Claude Code](https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white)
![Go](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)
![Bubble Tea](https://img.shields.io/badge/Bubble_Tea-FF75B5?style=flat&logo=go&logoColor=white)

- **Agent** : Claude Code avec des compétences et des modes personnalisés
- **PDF** : Playwright/Puppeteer + modèle HTML
- **Scanner** : Playwright + API Greenhouse + WebSearch
- **Tableau de bord** : Go + Bubble Tea + Lipgloss (thème Catppuccin Mocha)
- **Données** : Tableaux Markdown + configuration YAML + fichiers TSV par lots

## Également Open Source

- **[cv-santiago](https://github.com/santifer/cv-santiago)** -- Le site web de portfolio (santifer.io) avec chatbot IA, tableau de bord LLMOps et études de cas. Si vous avez besoin d'un portfolio à montrer en parallèle de votre recherche d'emploi, forkez-le et personnalisez-le.

## À Propos de l'Auteur

Je suis Santiago -- Chef de l'IA appliquée (Head of Applied AI), ancien fondateur (j'ai construit et vendu une entreprise qui fonctionne toujours avec mon nom). J'ai construit career-ops pour gérer ma propre recherche d'emploi. Ça a marché : je l'ai utilisé pour décrocher mon poste actuel.

Mon portfolio et autres projets open source → [santifer.io](https://santifer.io)

☕ [Achetez-moi un café](https://buymeacoffee.com/santifer) si career-ops a aidé votre recherche d'emploi.

## Historique des étoiles (Stars)

<a href="https://www.star-history.com/?repos=santifer%2Fcareer-ops&type=timeline&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=santifer/career-ops&type=timeline&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=santifer/career-ops&type=timeline&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=santifer/career-ops&type=timeline&legend=top-left" />
 </picture>
</a>

## Avertissement Légal

**career-ops est un outil local open-source — NON un service hébergé.** En utilisant ce logiciel, vous reconnaissez :

1. **Vous contrôlez vos données.** Votre CV, infos de contact etc restent sur votre machine et sont envoyées au fournisseur IA de votre choix (Anthropic, OpenAI...). Nous ne collectons pas vos données.
2. **Vous contrôlez l'IA.** Les invites par défaut demandent de ne pas soumettre de candidatures auto, mais l'IA peut être imprévisible. Si vous modifiez les modes, c'est à vos risques et périls. **Relisez toujours le contenu de l'IA avant de soumettre.**
3. **Respectez les ToS.** Utilisez cet outil en conformité avec les conditions des portails d'emploi. Ne pas spammer avec.
4. **Pas de garanties.** L'IA peut halluciner. L'auteur n'est pas responsable de l'issue de vos recherches.

Voir [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md) pour les détails. Ce logiciel est fourni sous licence [MIT License](LICENSE) "en l'état" sans garantie.

## Licence

MIT

## Restons Connectés

[![Site Web](https://img.shields.io/badge/santifer.io-000?style=for-the-badge&logo=safari&logoColor=white)](https://santifer.io)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/santifer)
[![X](https://img.shields.io/badge/X-000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/santifer)
[![Discord](https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/8pRpHETxa4)
[![Email](https://img.shields.io/badge/Email-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:hi@santifer.io)
[![Offrez-moi un café](https://img.shields.io/badge/Buy_Me_a_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/santifer)
