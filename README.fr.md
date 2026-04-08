# Career-Ops — Adaptation Francophone

[English](README.md) | [Español](README.es.md) | [Français](README.fr.md)

<p align="center">
  <img src="docs/hero-banner.jpg" alt="Career-Ops — Système de recherche d'emploi multi-agents" width="800">
</p>

<p align="center">
  <em>Les entreprises utilisent l'IA pour filtrer les candidats. <strong>Career-ops donne aux candidats l'IA pour <em>choisir</em> les entreprises.</strong></em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white" alt="Claude Code">
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white" alt="Playwright">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
  <img src="https://img.shields.io/badge/Marché-Francophone-blue?style=flat" alt="Francophone">
</p>

---

> **Ce dépôt est une adaptation francophone de [career-ops](https://github.com/santifer/career-ops), le projet open-source original créé par [Santiago (santifer)](https://santifer.io).**
> L'auteur principal reste Santiago — ce fork adapte le système pour le marché francophone : France, Belgique, Suisse, Maroc, Côte d'Ivoire, Sénégal.

---

## Ce que c'est

Career-Ops transforme n'importe quel CLI IA en un centre de commande pour ta recherche d'emploi. Au lieu de gérer manuellement des candidatures dans un tableur, tu disposes d'un pipeline IA qui :

- **Évalue les offres** avec un système de scoring structuré A-F (10 dimensions pondérées)
- **Génère des CVs PDF** — optimisés ATS, personnalisés par description de poste
- **Scanne les portails** automatiquement (Greenhouse, Ashby, Lever, WelcomeToTheJungle, pages entreprises)
- **Traite en batch** — évalue 10+ offres en parallèle avec des sous-agents
- **Centralise tout** dans une source de vérité unique avec contrôles d'intégrité

> **Important : ce n'est PAS un outil de candidature en masse.** Career-ops est un filtre — il t'aide à trouver les rares offres qui valent ton temps parmi des centaines. Le système déconseille fortement de postuler à tout ce qui est en-dessous de 4,0/5. Ton temps est précieux, celui du recruteur aussi.

---

## Ce qui est adapté pour le marché francophone

### Modes en français
Les modes de conversation sont entièrement traduits et adaptés au marché français dans `modes/fr/` :
- Vocabulaire contractuel français : CDI/CDD, convention collective SYNTEC, RTT, mutuelle, prévoyance, 13e mois, intéressement/participation, titres-restaurant, portage salarial
- Scoring calibré pour la réalité du marché francophone (remote France/Belgique/Suisse, présentiel Dakar/Abidjan)

### Portails préconfigurés (`templates/portals.example.fr.yml`)
37 entreprises francophones organisées en 5 segments :

**Startups françaises remote-first (stack JS/TS) :**
Pennylane, Dougs, Alan, lemlist, Doctrine, Partoo, ManoMano, 360Learning, Indy, AssessFirst, Joko

**Scale-ups françaises tech :**
Qonto, Mistral AI, Hugging Face, Photoroom, Pigment

**Afrique francophone :**
Wave Mobile Money, Djamo, Expensya

**Maroc :**
YouCan, Rekrute

**International remote-first :**
Vercel, Anthropic, Supabase, n8n, Attio

**Portails de recherche :** WelcomeToTheJungle, Lever, Greenhouse, Ashby, Workable

---

## Démarrage rapide

```bash
# 1. Cloner et installer
git clone https://github.com/Guelord11/career-ops.git
cd career-ops && npm install
npx playwright install chromium   # Requis pour la génération de PDF

# 2. Configurer
cp config/profile.example.yml config/profile.yml  # À compléter avec tes infos
cp templates/portals.example.fr.yml portals.yml    # Version francophone

# 3. Ajouter ton CV
# Crée cv.md à la racine du projet avec ton CV en markdown

# 4. Personnaliser avec Claude
claude   # Ouvre Claude Code dans ce dossier

# Demande à Claude d'adapter le système :
# "Change les archétypes pour des rôles backend"
# "Ajoute ces 5 entreprises à portals.yml"
# "Mets à jour mon profil avec ce CV"

# 5. Lancer
# Colle une URL d'offre ou tape /career-ops
```

---

## Utilisation

```
/career-ops                     → Afficher toutes les commandes
/career-ops {coller une offre}  → Pipeline complet (évaluation + PDF + tracker)
/career-ops scan                → Scanner les portails pour de nouvelles offres
/career-ops pdf                 → Générer un CV optimisé ATS
/career-ops batch               → Évaluer plusieurs offres en parallèle
/career-ops tracker             → Voir le statut de mes candidatures
/career-ops pipeline            → Traiter les URLs en attente
/career-ops contacto            → Message de prise de contact LinkedIn
/career-ops deep                → Recherche approfondie sur une entreprise
```

Ou colle directement une URL ou une description d'offre — career-ops la détecte et lance le pipeline complet.

---

## Structure du projet

```
career-ops/
├── CLAUDE.md                    # Instructions de l'agent
├── cv.md                        # Ton CV (à créer, gitignored)
├── article-digest.md            # Tes proof points (optionnel, gitignored)
├── config/
│   └── profile.example.yml      # Template de profil
├── modes/
│   ├── fr/                      # Modes en français (marché francophone)
│   │   ├── _shared.md
│   │   ├── offre.md             # Évaluation d'offre
│   │   ├── postuler.md          # Aide à la candidature
│   │   └── pipeline.md
│   └── ...                      # Modes anglais (défaut)
├── templates/
│   ├── cv-template.html         # Template CV optimisé ATS
│   ├── portals.example.yml      # Config portails (anglophone, original)
│   └── portals.example.fr.yml   # Config portails (francophone, cette adaptation)
├── data/                        # Tes données de suivi (gitignored)
├── reports/                     # Rapports d'évaluation (gitignored)
└── output/                      # PDFs générés (gitignored)
```

---

## À propos

**Projet original :** [santifer/career-ops](https://github.com/santifer/career-ops) par [Santiago](https://santifer.io) — il a utilisé ce système pour évaluer 740+ offres, générer 100+ CVs personnalisés, et décrocher un poste Head of Applied AI. Tout le mérite de l'architecture, du pipeline et du système de scoring lui revient.

**Cette adaptation :** [Guelord Kanyamanda](https://www.linkedin.com/in/guelord-kanyamanda) — développeur Full-Stack & AI/LLM, fondateur d'[AfyaSearch](https://afyasearch.com), basé à Dakar, Sénégal. Cette version adapte career-ops pour les chercheurs d'emploi francophones : vocabulaire contractuel français, portails WTTJ/Lever/Greenhouse/Ashby ciblant la France et l'Afrique francophone, configuration marché Maroc.

---

## Licence

MIT — voir [LICENSE](LICENSE)

Basé sur le travail original de [Santiago (santifer)](https://santifer.io) sous licence MIT.
