<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/wordmark-dark.svg"><img src="docs/wordmark-light.svg" alt="career-ops" width="250" height="56"></picture></p>

<div align="center">

[English](README.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Português (Brasil)](README.pt-BR.md) | [한국어](README.ko-KR.md) | [日本語](README.ja.md) | [简体中文](README.cn.md) | [繁體中文](README.zh-TW.md) | [Українська](README.ua.md) | [Русский](README.ru.md) | [Polski](README.pl.md) | [Dansk](README.da.md) | [العربية](README.ar.md) | [हिन्दी](README.hi.md)

</div>

<p align="center">
  <a href="https://x.com/santifer"><img src="docs/hero-banner.jpg" alt="Système de recherche d'emploi multi-agent Career-Ops" width="800"></a>
</p>

<p align="center">
  <em>J'ai passé des mois à postuler à des emplois à la dure. J'ai donc conçu le système que j'aurais aimé avoir.</em><br>
  Les entreprises utilisent l'IA pour filtrer les candidats. <strong>Je viens de donner aux candidats une IA pour <em>choisir</em> leurs entreprises.</strong><br>
  <em>Maintenant, c'est open source.</em>
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/25195" target="_blank"><img src="https://trendshift.io/api/badge/repositories/25195" alt="santifer%2Fcareer-ops | Trendshift" style="width: 245px; height: 54px; vertical-align: middle;" width="245" height="54"/></a>
</p>

<p align="center">
  <a href="https://www.producthunt.com/products/santifer-io?utm_source=badge-featured&utm_medium=badge" target="_blank"><img src="docs/press/producthunt.svg" alt="Career-Ops sur Claude | Product Hunt" style="width: 206px; height: 54px; vertical-align: middle;" width="206" height="54"/></a>
</p>

<p align="center"><sub>PRÉSENTÉ DANS</sub></p>

<p align="center">
  <a href="https://wired.com.gr/article/to-ai-ergaleio-pou-fernei-epanastasi-ston-tropo-pou-psachnoume-douleia/" rel="noopener noreferrer nofollow"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/press/wired-dark.svg"><img src="docs/press/wired.svg" alt="WIRED" height="32"></picture></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.businessinsider.com/how-i-built-tool-filter-job-listings-landed-head-ai-2026-4" rel="noopener noreferrer nofollow"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/press/business-insider-dark.svg"><img src="docs/press/business-insider.svg" alt="Business Insider" height="32"></picture></a>
</p>

---

<p align="center">
  <img src="docs/demo.gif" alt="Démo de Career-Ops" width="800">
</p>

<p align="center"><strong>Plus de 740 offres d'emploi évaluées · Plus de 100 CV personnalisés · 1 poste de rêve décroché</strong></p>

<p align="center">
  <a href="https://discord.gg/8pRpHETxa4"><img src="https://img.shields.io/badge/Rejoindre_la_communauté-Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
</p>

<p align="center">
  <a href="https://github.com/santifer/career-ops/releases/latest"><img src="https://img.shields.io/badge/release-v1.9.0-2ea44f?style=for-the-badge&labelColor=2b3137" alt="Dernière version"></a>
</p>

<p align="center">
  <a href="https://claude.com/claude-code"><img src="https://img.shields.io/badge/Built_with-Claude_Code-000?style=for-the-badge&logo=anthropic&logoColor=white" alt="Built with Claude Code"></a>
</p>

<p align="center">
  <sub>Fonctionne aussi avec n'importe quel CLI compatible avec le standard agent-skill</sub><br>
  <img src="https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white" alt="Claude Code">
  <img src="https://img.shields.io/badge/OpenCode-111827?style=flat&logo=terminal&logoColor=white" alt="OpenCode">
  <img src="https://img.shields.io/badge/Gemini_CLI-4285F4?style=flat&logo=google&logoColor=white" alt="Gemini CLI">
  <img src="https://img.shields.io/badge/Codex-412991?style=flat&logo=openai&logoColor=white" alt="Codex">
  <img src="https://img.shields.io/badge/Qwen-615CED?style=flat" alt="Qwen">
  <img src="https://img.shields.io/badge/GitHub_Copilot-000?style=flat&logo=githubcopilot&logoColor=white" alt="GitHub Copilot">
  <br>
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white" alt="Go">
  <img src="https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white" alt="Playwright">
  <img src="https://img.shields.io/badge/Bubble_Tea-FF75B5?style=flat&logo=go&logoColor=white" alt="Bubble Tea">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
  <a href="TRADEMARK.md"><img src="https://img.shields.io/badge/Trademark-Policy-blue.svg" alt="Trademark Policy"></a>
</p>

## Qu'est-ce que c'est

Career-Ops ([career-ops.org](https://career-ops.org), également connu sous le nom de **careerops**) transforme n'importe quelle interface de ligne de commande (CLI) de codage IA en un véritable centre de commandement pour votre recherche d'emploi. Au lieu de suivre manuellement vos candidatures dans un tableau de bord, vous disposez d'un pipeline alimenté par l'IA qui :

- **Évalue les offres** avec un système de notation structuré de A à F (10 dimensions pondérées)
- **Génère des PDF sur mesure** — des CV optimisés pour les systèmes ATS, personnalisés pour chaque description de poste
- **Scanne automatiquement les portails** (Greenhouse, Ashby, Lever, pages carrières des entreprises)
- **Traite en lot** — évalue plus de 10 offres en parallèle avec des sous-agents
- **Suit tout** dans une source unique de vérité avec des vérifications d'intégrité

> **Important : Il ne s'agit PAS d'un outil pour postuler en masse de manière abusive (spray-and-pray).** Career-ops est un filtre — il vous aide à identifier les rares offres qui méritent votre temps parmi des centaines d'autres. Le système recommande fortement de ne pas postuler aux offres ayant un score inférieur à 4,0/5. Votre temps est précieux, tout comme celui des recruteurs. Relisez toujours avant d'envoyer.

Career-ops est agentic : Claude Code navigue sur les pages carrières avec Playwright, évalue l'adéquation en analysant votre CV par rapport à la description du poste (et non par simple correspondance de mots-clés), et adapte votre CV pour chaque offre.

> **Attention : les premières évaluations ne seront pas parfaites.** Le système ne vous connaît pas encore. Fournissez-lui du contexte — votre CV, votre parcours professionnel, vos réalisations marquantes, vos préférences, vos points forts et ce que vous souhaitez éviter. Plus vous l'alimentez, plus il devient performant. Voyez cela comme l'intégration d'un nouveau recruteur : la première semaine, il doit apprendre à vous connaître, puis il devient indispensable.

Conçu par quelqu'un qui l'a utilisé pour évaluer plus de 740 offres d'emploi, générer plus de 100 CV personnalisés et décrocher un poste de Head of Applied AI. [Lire l'étude de cas complète (en anglais)](https://santifer.io/career-ops-system).

## Fonctionnalités

| Fonctionnalité | Description |
| :--- | :--- |
| **Pipeline Automatique** | Collez une URL, obtenez une évaluation complète + un CV PDF + une entrée dans le tracker |
| **Évaluation en 6 Blocs** | Résumé du rôle, correspondance de CV, stratégie de niveau, recherche de salaire, personnalisation, préparation aux entretiens (STAR+R) — avec une vérification de légitimité de l'offre (Bloc G) pour signaler les arnaques et les emplois fantômes |
| **Banque d'histoires d'entretien** | Accumule les récits STAR+Réflexion à travers les évaluations — 5 à 10 histoires clés pour répondre à n'importe quelle question comportementale |
| **Scripts de Négociation** | Cadres de négociation de salaire, arguments contre les baisses de salaire géographiques, levier d'offres concurrentes |
| **Génération de CV ATS** | CV optimisés avec injection de mots-clés, utilisant le design Space Grotesk + DM Sans |
| **Scanner de Portails** | Plus de 45 entreprises préconfigurées (Anthropic, OpenAI, ElevenLabs, Retool, n8n...) + requêtes personnalisées sur Ashby, Greenhouse, Lever, Wellfound |
| **Traitement en Lot** | Évaluation parallèle avec des processus de travail `claude -p` |
| **TUI de Tableau de Bord** | Interface terminal pour explorer, filtrer et trier votre pipeline |
| **Humain dans la Boucle** | L'IA évalue et recommande, vous décidez et agissez. Le système ne soumet jamais de candidature automatiquement — vous avez toujours le dernier mot |
| **Intégrité du Pipeline** | Fusion automatisée, déduplication, normalisation des statuts et vérifications de santé |

## Démarrage rapide

**La méthode la plus rapide — une seule commande :**

```bash
npx @santifer/career-ops init
```

> 💡 `npx` est fourni avec [Node.js](https://nodejs.org) — il exécute l'installateur une seule fois, sans rien installer globalement. Si vous n'avez pas encore Node, installez-le d'abord. (Si vous utilisez déjà un CLI Claude Code / Gemini / Codex, vous l'avez déjà.)

Cette commande clone la dernière version dans `./career-ops` et installe les dépendances. Ensuite :

```bash
cd career-ops
claude   # ou gemini / codex / qwen / opencode — ouvrez votre CLI d'IA ici
```

**Lors du premier lancement, career-ops vous guide à travers la configuration — votre CV, votre profil et vos rôles cibles — simplement par chat. Rien à modifier à la main.**

<details>
<summary><b>Vous préférez le configurer manuellement ? (git clone)</b></summary>

```bash
git clone https://github.com/santifer/career-ops.git
cd career-ops && npm install
npx playwright install chromium   # requis uniquement pour la génération de PDF
claude   # ouvrez votre CLI d'IA — il vous guidera au premier lancement
```

</details>

> **Le système est conçu pour être personnalisé par Claude lui-même.** Modes, archétypes, pondérations des scores, scripts de négociation — demandez simplement à Claude de les modifier. Il lit les mêmes fichiers qu'il utilise, il sait donc exactement quoi modifier.

Voir [docs/SETUP.md](docs/SETUP.md) (en anglais) pour le guide de configuration complet.

## Intégration de l'interface en ligne de commande Gemini

Career-ops prend en charge [Gemini CLI](https://github.com/google-gemini/gemini-cli) nativement, de la même manière qu'il supporte Claude Code et OpenCode. Les 15 commandes slash sont disponibles, utilisant la même logique d'évaluation `modes/*.md`.

### Option A : Gemini CLI Natif (Recommandé)

```bash
# 1. Installez Gemini CLI
npm install -g @google/gemini-cli
# ou : npx @google/gemini-cli --version

# 2. Authentifiez-vous (gratuit, utilise votre compte Google)
gemini auth

# 3. Exécutez dans le dossier career-ops
cd career-ops
gemini

# 4. Utilisez la commande unifiée /career-ops avec ses sous-commandes :
/career-ops "Senior AI Engineer at Anthropic..."
/career-ops pipeline
/career-ops scan
/career-ops pdf
/career-ops tracker
```

Le fichier `GEMINI.md` est chargé automatiquement comme contexte. Toutes les sous-commandes sont routées via la définition unifiée `.agents/skills/career-ops/SKILL.md`.

### Option B : Script d'API autonome (Aucune installation de CLI requise)

```bash
# 1. Obtenez une clé d'API gratuite sur https://aistudio.google.com/apikey
cp .env.example .env
# Modifiez .env, définissez GEMINI_API_KEY=votre_cle_ici

# 2. Installez les dépendances
npm install

# 3. Évaluez une description de poste
node gemini-eval.mjs "We are looking for a Senior AI Engineer..."
node gemini-eval.mjs --file ./jds/my-job.txt
npm run gemini:eval -- "Texte de la description de poste ici"
```

> **Offre gratuite :** Les deux options fonctionnent sans facturation. Le CLI natif utilise l'authentification OAuth Google ; le script d'API utilise `gemini-2.5-flash` (15 requêtes/min, 1M de jetons/jour gratuits).

## Utilisation

Career-ops est accessible via une commande slash unique avec plusieurs modes :

```
/career-ops                → Afficher toutes les commandes disponibles
/career-ops {coller JD}    → Pipeline automatique complet (évaluation + PDF + tracker)
/career-ops scan           → Scanner les portails pour de nouvelles offres
/career-ops pdf            → Générer un CV optimisé pour les ATS
/career-ops batch          → Évaluer plusieurs offres en lot
/career-ops tracker        → Consulter l'état des candidatures
/career-ops apply          → Remplir des formulaires de candidature avec l'IA
/career-ops pipeline       → Traiter les URL en attente
/career-ops contacto       → Message d'approche LinkedIn
/career-ops deep           → Recherche approfondie sur une entreprise
/career-ops training       → Évaluer une formation/certification
/career-ops project        → Évaluer un projet de portfolio
```

Ou collez simplement l'URL ou la description d'un emploi — career-ops le détecte automatiquement et lance le pipeline complet.

## Comment ça fonctionne

```
Vous collez l'URL ou la description d'un emploi
        │
        ▼
┌──────────────────┐
│  Détection de    │  Classification : LLMOps / Agentic / PM / SA / FDE / Transformation
│  l'archétype     │
└────────┬─────────┘
         │
┌────────▼─────────┐
│ Évaluation A-F   │  Correspondance, lacunes, recherche de salaire, récits STAR
│ (lit cv.md)      │
└────────┬─────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
 Rapport  PDF  Tracker
  .md    .pdf   .tsv
```

## Portails préconfigurés

Le scanner est livré avec **plus de 45 entreprises** prêtes à être analysées et **19 requêtes de recherche** sur les principaux sites d'emploi. Copiez `templates/portals.example.yml` sous le nom de `portals.yml` et ajoutez les vôtres :

**Laboratoires d'IA :** Anthropic, OpenAI, Mistral, Cohere, LangChain, Pinecone  
**IA vocale :** ElevenLabs, PolyAI, Parloa, Hume AI, Deepgram, Vapi, Bland AI  
**Plateformes d'IA :** Retool, Airtable, Vercel, Temporal, Glean, Arize AI  
**Centres de contact :** Ada, LivePerson, Sierra, Decagon, Talkdesk, Genesys  
**Entreprises :** Salesforce, Twilio, Gong, Dialpad  
**LLMOps :** Langfuse, Weights & Biases, Lindy, Cognigy, Speechmatics  
**Automatisation :** n8n, Zapier, Make.com  
**Européennes :** Factorial, Attio, Tinybird, Clarity AI, Travelperk  

**Plateformes d'emploi scannées :** Ashby, Greenhouse, Lever, Wellfound, Workable, RemoteFront  

Par défaut, `node scan.mjs` (alias `npm run scan`) fait confiance aux données renvoyées par les flux ATS. Certaines entreprises laissent des offres obsolètes actives sur leurs API publiques même après la fermeture du poste, ce qui peut polluer `pipeline.md`. Passez l'option `--verify` pour lancer Playwright après l'analyse de l'API afin de supprimer les offres expirées :

```bash
node scan.mjs --verify          # découverte sans jeton + vérification de l'état actif via Playwright
```

La vérification est séquentielle et ne s'exécute que sur les nouvelles offres (après déduplication), afin de limiter l'utilisation des ressources.

## TUI de Tableau de Bord

Le tableau de bord terminal intégré vous permet d'explorer visuellement votre pipeline :

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..
```

Fonctionnalités : 6 onglets de filtrage, 4 modes de tri, vue groupée ou plate, chargement différé des aperçus, modification du statut en ligne.

## Structure du projet

```
career-ops/
├── AGENTS.md                    # Instructions de l'agent canonique (tous CLI)
├── CLAUDE.md                    # Wrapper Claude Code (importe AGENTS.md)
├── cv.md                        # Votre CV (à créer)
├── article-digest.md            # Vos réalisations clés (optionnel)
├── config/
│   └── profile.example.yml      # Modèle pour votre profil
├── modes/                       # Les 14 modes de compétences
│   ├── _shared.md               # Contexte partagé (à personnaliser)
│   ├── oferta.md                # Évaluation individuelle
│   ├── pdf.md                   # Génération de CV
│   ├── scan.md                  # Scanner de portails
│   ├── batch.md                 # Traitement par lot
│   └── ...
├── templates/
│   ├── cv-template.html         # Modèle de CV optimisé pour les ATS
│   ├── portals.example.yml      # Modèle de configuration du scanner
│   └── states.yml               # Statuts canoniques
├── batch/
│   ├── batch-prompt.md          # Consigne pour le traitement par lot
│   └── batch-runner.sh          # Script d'orchestration
├── dashboard/                   # Visualiseur de pipeline TUI en Go
├── data/                        # Vos données de suivi (gitignoré)
├── reports/                     # Rapports d'évaluation (gitignoré)
├── output/                      # CV PDF générés (gitignoré)
├── fonts/                       # Polices Space Grotesk + DM Sans
├── docs/                        # Configuration, personnalisation, architecture
└── examples/                    # Exemples de CV, rapport, réalisations
```

## Pile technique

- **Agent** : Claude Code avec compétences et modes personnalisés
- **PDF** : Playwright/Puppeteer + modèle HTML
- **Scanner** : Playwright + API Greenhouse + Recherche Web
- **Tableau de bord** : Go + Bubble Tea + Lipgloss (thème Catppuccin Mocha)
- **Données** : Tableaux Markdown + configuration YAML + fichiers TSV pour les lots

## Également en Open Source

- **[cv-santiago](https://github.com/santifer/cv-santiago)** — Le site web de portfolio (santifer.io) avec chatbot IA, tableau de bord LLMOps et études de cas. Si vous avez besoin d'un portfolio pour accompagner votre recherche d'emploi, forkez-le et personnalisez-le.

## À propos de l'auteur

Je m'appelle [Santiago Fernández de Valderrama Aparicio](https://santifer.io/about) (santifer) — Head of Applied AI, ancien fondateur (j'ai créé et vendu une entreprise qui fonctionne toujours sous mon nom). J'ai conçu career-ops pour gérer ma propre recherche d'emploi. Cela a fonctionné : je l'ai utilisé pour décrocher mon poste actuel.

Mon portfolio et mes autres projets open source → [santifer.io](https://santifer.io)

Wikidata: [Santiago Fernández de Valderrama Aparicio](https://www.wikidata.org/wiki/Q138710224) · [career-ops](https://www.wikidata.org/wiki/Q139007988).

## Historique des étoiles

<a href="https://www.star-history.com/?repos=santifer%2Fcareer-ops&type=timeline&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=santifer/career-ops&type=timeline&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=santifer/career-ops&type=timeline&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=santifer/career-ops&type=timeline&legend=top-left" />
 </picture>
</a>

## Clause de non-responsabilité

**career-ops est un outil local et open source, pas un service hébergé.** En utilisant ce logiciel, vous reconnaissez que :

1. **Vous contrôlez vos données.** Votre CV, vos coordonnées et vos données personnelles restent sur votre machine et sont envoyés directement au fournisseur d'IA que vous choisissez (Anthropic, OpenAI, etc.). Nous ne collectons, ne stockons ni n'avons accès à aucune de vos données.
2. **Vous contrôlez l'IA.** Les consignes par défaut demandent à l'IA de ne pas soumettre de candidatures automatiquement, mais les modèles d'IA peuvent se comporter de manière imprévisible. Si vous modifiez les consignes ou utilisez d'autres modèles, vous le faites à vos propres risques. **Vérifiez toujours le contenu généré par l'IA avant de soumettre une candidature.**
3. **Vous respectez les conditions d'utilisation des tiers.** Vous devez utiliser cet outil conformément aux conditions d'utilisation des portails de recrutement avec lesquels vous interagissez (Greenhouse, Lever, Workday, LinkedIn, etc.). N'utilisez pas cet outil pour spammer les employeurs ou saturer les systèmes ATS.
4. **Aucune garantie.** Les évaluations sont des recommandations et non des vérités absolues. Les modèles d'IA peuvent halluciner des compétences ou de l'expérience. Les auteurs ne sont pas responsables de l'issue de vos recherches, des candidatures rejetées, des restrictions de compte ou de toute autre conséquence.

Voir [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md) (en anglais) pour tous les détails. Ce logiciel est fourni sous [Licence MIT](LICENSE) "en l'état", sans aucune garantie d'aucune sorte.

## Contributeurs

<a href="https://github.com/santifer/career-ops/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=santifer/career-ops" />
</a>

Vous avez été embauché grâce à career-ops ? [Partagez votre histoire ! (en anglais)](https://github.com/santifer/career-ops/issues/new?template=i-got-hired.yml)

## Licence et marques déposées

Le code est distribué sous [Licence MIT](LICENSE). Le nom et la marque "career-ops" sont régis par la [Politique de marques déposées](TRADEMARK.md), qui autorise l'usage par la communauté mais le réserve pour les produits commerciaux et les promotions.

## Connectons-nous

[![Site Web](https://img.shields.io/badge/santifer.io-000?style=for-the-badge&logo=safari&logoColor=white)](https://santifer.io)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/santifer)
[![X](https://img.shields.io/badge/X-000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/santifer)
[![Discord](https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/8pRpHETxa4)
[![Email](https://img.shields.io/badge/Email-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:hi@santifer.io)
