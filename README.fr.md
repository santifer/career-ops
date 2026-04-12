# Career-Ops

[English](README.md) | [Español](README.es.md) | [Français](README.fr.md) | [Português (Brasil)](README.pt-BR.md) | [한국어](README.ko-KR.md) | [日本語](README.ja.md) | [Русский](README.ru.md)

<p align="center">
  <a href="https://x.com/santifer"><img src="docs/hero-banner.jpg" alt="Career-Ops — Systeme Multi-Agent de Recherche d'Emploi" width="800"></a>
</p>

<p align="center">
  <em>Des mois a envoyer des CV dans le vide. Alors j'ai construit le systeme que j'aurais voulu avoir.</em><br>
  Les entreprises utilisent l'IA pour filtrer les candidats. <strong>J'ai donne aux candidats l'IA pour <em>choisir</em> les entreprises.</strong><br>
  <em>Maintenant c'est open source.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white" alt="Claude Code">
  <img src="https://img.shields.io/badge/OpenCode-111827?style=flat&logo=terminal&logoColor=white" alt="OpenCode">
  <img src="https://img.shields.io/badge/Codex_(bientot)-6B7280?style=flat&logo=openai&logoColor=white" alt="Codex">
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
  <img src="docs/demo.gif" alt="Career-Ops Demo" width="800">
</p>

<p align="center"><strong>740+ offres evaluees · 100+ CV personnalises · 1 poste de reve decroche</strong></p>

<p align="center"><a href="https://discord.gg/8pRpHETxa4"><img src="https://img.shields.io/badge/Rejoindre_la_communaute-Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a></p>

## C'est quoi

Career-Ops transforme n'importe quel CLI d'IA en centre de commande pour la recherche d'emploi. Au lieu de suivre vos candidatures dans un tableur, vous disposez d'un pipeline IA qui :

- **Evalue les offres** avec un scoring structure A-F (10 dimensions ponderees)
- **Genere des PDF personnalises** -- CV optimises ATS adaptes a chaque offre
- **Scanne les portails** automatiquement (Greenhouse, Ashby, Lever, sites d'entreprises)
- **Traite en batch** -- evalue 10+ offres en parallele avec des sous-agents
- **Centralise tout** dans une source de verite unique avec des controles d'integrite

> **Important : ce n'est PAS un outil pour spammer les entreprises.** Career-ops est un filtre -- il vous aide a trouver les quelques offres qui meritent votre temps parmi des centaines. Le systeme deconseille fortement de postuler a tout ce qui est en dessous de 4.0/5. Votre temps est precieux, celui du recruteur aussi. Relisez toujours avant d'envoyer.

> **Attention : les premieres evaluations ne seront pas parfaites.** Le systeme ne vous connait pas encore. Donnez-lui du contexte -- votre CV, votre parcours, vos preuves, vos preferences, vos forces, ce que vous voulez eviter. Plus vous le nourrissez, mieux il filtre. Voyez-le comme l'onboarding d'un nouveau recruteur : la premiere semaine il doit apprendre a vous connaitre, ensuite il devient indispensable.

Construit par quelqu'un qui l'a utilise pour evaluer 740+ offres, generer 100+ CV personnalises et decrocher un poste de Head of Applied AI. [Lire le case study complet](https://santifer.io/career-ops).

## Fonctionnalites

| Fonctionnalite | Description |
|----------------|-------------|
| **Auto-Pipeline** | Collez une URL, obtenez une evaluation + PDF + entree dans le tracker |
| **Evaluation A-F** | Resume du poste, match CV, strategie de niveau, recherche de comp, personnalisation, preparation d'entretien (STAR+R) |
| **Banque d'histoires** | Accumule des histoires STAR+Reflexion au fil des evaluations -- 5-10 histoires cles qui repondent a toute question comportementale |
| **Scripts de negociation** | Frameworks de negociation salariale, pushback sur les decotes geographiques, levier des offres concurrentes |
| **PDF ATS** | CV avec mots-cles injectes, design Space Grotesk + DM Sans |
| **Scanner de portails** | 45+ entreprises pre-configurees (Anthropic, OpenAI, ElevenLabs, Retool, n8n...) + recherches sur Ashby, Greenhouse, Lever, Wellfound |
| **Batch** | Evaluation en parallele avec des workers `claude -p` |
| **Dashboard TUI** | Interface terminal pour naviguer, filtrer et trier votre pipeline |
| **Human-in-the-Loop** | L'IA evalue et recommande, vous decidez et agissez. Le systeme n'envoie jamais de candidature -- vous avez toujours le dernier mot |
| **Integrite du pipeline** | Merge automatique, dedup, normalisation des statuts, health checks |

## Demarrage rapide

```bash
# 1. Cloner et installer
git clone https://github.com/santifer/career-ops.git
cd career-ops && npm install
npx playwright install chromium   # Necessaire pour la generation de PDF

# 2. Verifier l'installation
npm run doctor                     # Valide tous les prerequis

# 3. Configurer
cp config/profile.example.yml config/profile.yml  # Editez avec vos infos
cp templates/portals.example.yml portals.yml       # Personnalisez les entreprises

# 4. Ajouter votre CV
# Creez cv.md a la racine du projet avec votre CV en markdown

# 5. Personnaliser avec Claude
claude   # Ouvrez Claude Code dans ce repertoire

# Demandez a Claude d'adapter le systeme a vous :
# "Change les archetypes pour des roles backend"
# "Traduis les modes en anglais"
# "Ajoute ces entreprises a portals.yml"
# "Mets a jour mon profil avec ce CV que je colle"

# 6. Utiliser
# Collez une URL d'offre ou lancez /career-ops
```

> **Le systeme est concu pour etre personnalise par Claude lui-meme.** Modes, archetypes, scoring, scripts de negociation -- il suffit de demander. Claude lit les memes fichiers qu'il utilise, il sait donc exactement quoi modifier.

Guide complet dans [docs/SETUP.md](docs/SETUP.md).

## Utilisation

Career-ops est une seule commande slash avec plusieurs modes :

```
/career-ops                → Afficher toutes les commandes
/career-ops {collez un JD} → Pipeline complet (evaluer + PDF + tracker)
/career-ops scan           → Scanner les portails
/career-ops pdf            → Generer un CV optimise ATS
/career-ops batch          → Evaluer des offres en batch
/career-ops tracker        → Voir le statut des candidatures
/career-ops apply          → Remplir les formulaires avec l'IA
/career-ops pipeline       → Traiter les URL en attente
/career-ops contacto       → Message LinkedIn outreach
/career-ops deep           → Recherche approfondie sur une entreprise
/career-ops training       → Evaluer une formation/certification
/career-ops project        → Evaluer un projet portfolio
```

Ou collez simplement une URL ou une description d'offre -- career-ops la detecte et lance le pipeline complet.

## Comment ca marche

```
Vous collez une URL ou une description d'offre
        |
        v
+------------------+
|  Detection       |  Classifie : LLMOps / Agentic / PM / SA / FDE / Transformation
|  d'archetype     |
+--------+---------+
         |
+--------v---------+
|  Evaluation A-F  |  Match, lacunes, recherche comp, histoires STAR
|  (lit cv.md)     |
+--------+---------+
         |
    +----+----+
    v    v    v
 Report  PDF  Tracker
  .md   .pdf   .tsv
```

## Portails inclus

Le scanner est livre avec **45+ entreprises** pre-configurees et **19 requetes** sur les principaux portails d'emploi. Copiez `templates/portals.example.yml` vers `portals.yml` et ajoutez les votres :

**Labos IA :** Anthropic, OpenAI, Mistral, Cohere, LangChain, Pinecone
**IA Vocale :** ElevenLabs, PolyAI, Parloa, Hume AI, Deepgram, Vapi, Bland AI
**Plateformes IA :** Retool, Airtable, Vercel, Temporal, Glean, Arize AI
**Centre de Contact :** Ada, LivePerson, Sierra, Decagon, Talkdesk, Genesys
**Enterprise :** Salesforce, Twilio, Gong, Dialpad
**LLMOps :** Langfuse, Weights & Biases, Lindy, Cognigy, Speechmatics
**Automatisation :** n8n, Zapier, Make.com
**Europe :** Factorial, Attio, Tinybird, Clarity AI, Travelperk

**Portails d'emploi :** Ashby, Greenhouse, Lever, Wellfound, Workable, RemoteFront

## Dashboard TUI

Le dashboard integre en terminal vous permet de parcourir votre pipeline visuellement :

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..
```

Fonctionnalites : 6 onglets de filtre, 4 modes de tri, vue groupee/plate, previews en chargement differe, changements de statut inline.

## Structure du projet

```
career-ops/
├── CLAUDE.md                    # Instructions de l'agent
├── cv.md                        # Votre CV (a creer)
├── article-digest.md            # Vos preuves (optionnel)
├── config/
│   └── profile.example.yml      # Template pour votre profil
├── modes/                       # 14 modes
│   ├── _shared.md               # Contexte partage (personnalisable)
│   ├── oferta.md                # Evaluation individuelle
│   ├── pdf.md                   # Generation de PDF
│   ├── scan.md                  # Scanner de portails
│   ├── batch.md                 # Traitement batch
│   └── ...
├── templates/
│   ├── cv-template.html         # Template de CV optimise ATS
│   ├── portals.example.yml      # Config du scanner
│   └── states.yml               # Statuts canoniques
├── batch/
│   ├── batch-prompt.md          # Prompt autonome du worker
│   └── batch-runner.sh          # Script orchestrateur
├── dashboard/                   # Visualiseur de pipeline en Go TUI
├── data/                        # Vos donnees de suivi (gitignored)
├── reports/                     # Rapports d'evaluation (gitignored)
├── output/                      # PDF generes (gitignored)
├── fonts/                       # Space Grotesk + DM Sans
├── docs/                        # Installation, personnalisation, architecture
└── examples/                    # CV exemple, rapport, preuves
```

## Tech Stack

![Claude Code](https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white)
![Go](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)
![Bubble Tea](https://img.shields.io/badge/Bubble_Tea-FF75B5?style=flat&logo=go&logoColor=white)

- **Agent** : Claude Code avec skills et modes personnalises
- **PDF** : Playwright/Puppeteer + template HTML
- **Scanner** : Playwright + Greenhouse API + WebSearch
- **Dashboard** : Go + Bubble Tea + Lipgloss (theme Catppuccin Mocha)
- **Donnees** : Tables Markdown + config YAML + fichiers TSV batch

## A propos de l'auteur

Je suis Santiago -- Head of Applied AI, ex-fondateur (j'ai monte et vendu une entreprise qui tourne encore avec mon nom). J'ai construit career-ops pour gerer ma propre recherche d'emploi. Ca a marche : je l'ai utilise pour decrocher mon poste actuel.

Mon portfolio et mes autres projets open source → [santifer.io](https://santifer.io)

☕ [Offrez-moi un cafe](https://buymeacoffee.com/santifer) si career-ops vous a aide dans votre recherche.

## Documentation

- [SETUP.md](docs/SETUP.md) -- Guide d'installation
- [CUSTOMIZATION.md](docs/CUSTOMIZATION.md) -- Comment personnaliser
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) -- Comment le systeme fonctionne

## Egalement Open Source

- **[cv-santiago](https://github.com/santifer/cv-santiago)** -- Le portfolio (santifer.io) avec chatbot IA, dashboard LLMOps et case studies. Si vous avez besoin d'un portfolio pour accompagner votre recherche d'emploi, jetez-y un oeil.

## Star History

<a href="https://www.star-history.com/?repos=santifer%2Fcareer-ops&type=timeline&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=santifer/career-ops&type=timeline&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=santifer/career-ops&type=timeline&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=santifer/career-ops&type=timeline&legend=top-left" />
 </picture>
</a>

## Avertissement legal

**career-ops est un outil local et open source — PAS un service heberge.** En utilisant ce logiciel, vous reconnaissez que :

1. **Vous controlez vos donnees.** Votre CV, vos coordonnees et vos informations personnelles restent sur votre machine et sont envoyees directement au fournisseur d'IA que vous choisissez (Anthropic, OpenAI, etc.). Nous ne collectons, ne stockons et n'avons acces a aucune de vos donnees.
2. **Vous controlez l'IA.** Les prompts par defaut instruisent l'IA de ne pas envoyer de candidatures automatiquement, mais les modeles peuvent se comporter de maniere imprevisible. Si vous modifiez les prompts ou utilisez d'autres modeles, vous le faites a vos risques et perils. **Relisez toujours le contenu genere avant de l'envoyer.**
3. **Vous respectez les conditions d'utilisation des tiers.** Vous devez utiliser cet outil conformement aux Conditions d'Utilisation des portails d'emploi (Greenhouse, Lever, Workday, LinkedIn, etc.). N'utilisez pas cet outil pour spammer les entreprises.
4. **Aucune garantie.** Les evaluations sont des recommandations, pas des verites absolues. Les modeles peuvent inventer des competences ou de l'experience. Les auteurs ne sont pas responsables des resultats professionnels, des candidatures rejetees, des restrictions de compte ni de toute autre consequence.

Voir [LEGAL_DISCLAIMER.md](LEGAL_DISCLAIMER.md) pour plus de details. Ce logiciel est fourni sous la [Licence MIT](LICENSE) "tel quel", sans garantie d'aucune sorte.

## Licence

MIT

## Restons en contact

[![Website](https://img.shields.io/badge/santifer.io-000?style=for-the-badge&logo=safari&logoColor=white)](https://santifer.io)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/santifer)
[![X](https://img.shields.io/badge/X-000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/santifer)
[![Discord](https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/8pRpHETxa4)
[![Email](https://img.shields.io/badge/Email-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:hi@santifer.io)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy_Me_a_Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/santifer)
