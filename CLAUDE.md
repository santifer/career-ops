<!-- Traduit depuis santifer/career-ops@411afb3 -->

# Career-Ops — Pipeline IA de recherche d'emploi

## Origine

Ce système a été conçu et utilisé par l'auteur original pour évaluer plus de 740 offres d'emploi, générer plus de 100 CV sur mesure et décrocher un poste de Head of Applied AI. Les archétypes, la logique de scoring, les scripts de négociation et la structure des preuves reflètent sa recherche spécifique dans les rôles IA/automatisation.

Le portfolio qui accompagne ce système est également open source : [cv-santiago](https://github.com/santifer/cv-santiago).

**Le système fonctionne immédiatement, mais il est conçu pour que tu te l'appropries.** Si les archétypes ne correspondent pas à ta carrière, si les modes sont dans la mauvaise langue, ou si le scoring ne correspond pas à tes priorités — demande simplement. Toi (Agent IA) tu peux modifier les fichiers de l'utilisateur. L'utilisateur dit « change les archétypes pour des rôles data engineering » et tu le fais. C'est tout l'intérêt.

## Contrat de données (CRITIQUE)

Il y a deux couches. Lis `DATA_CONTRACT.md` pour la liste complète.

**Couche utilisateur (JAMAIS mise à jour automatiquement, la personnalisation va ICI) :**
- `cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, `portals.yml`
- `data/*`, `reports/*`, `output/*`, `interview-prep/*`

**Couche système (mise à jour automatique possible, NE PAS mettre de données utilisateur ici) :**
- `modes/_shared.md`, `modes/oferta.md`, tous les autres modes
- `CLAUDE.md`, `*.mjs` scripts, `dashboard/*`, `templates/*`, `batch/*`

**LA RÈGLE : Quand l'utilisateur demande de personnaliser quoi que ce soit (archétypes, narratif, scripts de négociation, preuves, politique de localisation, objectifs de rémunération), TOUJOURS écrire dans `modes/_profile.md` ou `config/profile.yml`. JAMAIS modifier `modes/_shared.md` pour du contenu spécifique à l'utilisateur.** Cela garantit que les mises à jour système n'écrasent pas ses personnalisations.

## Vérification des mises à jour

Au premier message de chaque session, lancer le vérificateur de mises à jour silencieusement :

```bash
node update-system.mjs check
```

Analyser la sortie JSON :
- `{"status": "update-available", "local": "1.0.0", "remote": "1.1.0", "changelog": "..."}` → informer l'utilisateur :
  > « Mise à jour career-ops disponible (v{local} → v{remote}). Tes données (CV, profil, tableau de suivi, rapports) ne seront PAS touchées. Tu veux que je mette à jour ? »
  Si oui → lancer `node update-system.mjs apply`. Si non → lancer `node update-system.mjs dismiss`.
- `{"status": "up-to-date"}` → ne rien dire
- `{"status": "dismissed"}` → ne rien dire
- `{"status": "offline"}` → ne rien dire

L'utilisateur peut aussi dire « vérifie les mises à jour » ou « mets à jour career-ops » à tout moment pour forcer une vérification.
Pour revenir en arrière : `node update-system.mjs rollback`

## Qu'est-ce que career-ops

Pipeline de recherche d'emploi automatisé par IA, construit sur Claude Code : suivi du pipeline, évaluation des offres d'emploi, génération de CV, scan des portails, traitement par lots.

### Fichiers principaux

| Fichier | Fonction |
|---------|----------|
| `data/applications.md` | Tableau de suivi des candidatures |
| `data/pipeline.md` | Boîte de réception des URLs en attente |
| `data/scan-history.tsv` | Historique de déduplication du scanner |
| `portals.yml` | Configuration des requêtes et entreprises |
| `templates/cv-template.html` | Template HTML pour les CV |
| `templates/cv-template.tex` | Template LaTeX/Overleaf pour les CV |
| `generate-pdf.mjs` | Playwright : HTML vers PDF |
| `generate-latex.mjs` | Validateur de CV LaTeX + compilateur pdflatex |
| `article-digest.md` | Preuves compactes issues du portfolio (optionnel) |
| `interview-prep/story-bank.md` | Histoires STAR+R accumulées à travers les évaluations |
| `interview-prep/{company}-{role}.md` | Rapports de renseignements d'entretien par entreprise |
| `analyze-patterns.mjs` | Script d'analyse de tendances (sortie JSON) |
| `followup-cadence.mjs` | Calculateur de cadence de relance (sortie JSON) |
| `data/follow-ups.md` | Tableau de suivi des relances |
| `scan.mjs` | Scanner de portails zéro-token — interroge directement les API Greenhouse/Ashby/Lever, zéro coût LLM |
| `check-liveness.mjs` | Vérificateur de validité des offres d'emploi |
| `liveness-core.mjs` | Logique partagée de validité (les signaux d'expiration l'emportent sur le texte générique « Postuler ») |
| `reports/` | Rapports d'évaluation (format : `{###}-{company-slug}-{YYYY-MM-DD}.md`). Blocs A-F + G (Légitimité de l'offre). L'en-tête inclut `**Légitimité :** {tier}`. |

### Commandes OpenCode

Avec [OpenCode](https://opencode.ai), les commandes slash suivantes sont disponibles (définies dans `.opencode/commands/`) :

| Commande | Équivalent Claude Code | Description |
|----------|------------------------|-------------|
| `/career-ops` | `/career-ops` | Afficher le menu ou évaluer une offre avec arguments |
| `/career-ops-pipeline` | `/career-ops pipeline` | Traiter les URLs en attente de la boîte de réception |
| `/career-ops-evaluate` | `/career-ops oferta` | Évaluer une offre d'emploi (scoring A-F) |
| `/career-ops-compare` | `/career-ops ofertas` | Comparer et classer plusieurs offres |
| `/career-ops-contact` | `/career-ops contacto` | Prise de contact LinkedIn (trouver des contacts + rédiger) |
| `/career-ops-deep` | `/career-ops deep` | Recherche approfondie sur une entreprise |
| `/career-ops-pdf` | `/career-ops pdf` | Générer un CV optimisé ATS |
| `/career-ops-latex` | `/career-ops latex` | Exporter le CV en LaTeX/Overleaf .tex |
| `/career-ops-training` | `/career-ops training` | Évaluer une formation/certification par rapport aux objectifs |
| `/career-ops-project` | `/career-ops project` | Évaluer une idée de projet portfolio |
| `/career-ops-tracker` | `/career-ops tracker` | Vue d'ensemble du statut des candidatures |
| `/career-ops-apply` | `/career-ops apply` | Assistant de candidature en direct |
| `/career-ops-scan` | `/career-ops scan` | Scanner les portails pour de nouvelles offres |
| `/career-ops-batch` | `/career-ops batch` | Traitement par lots avec workers parallèles |
| `/career-ops-patterns` | `/career-ops patterns` | Analyser les tendances de refus et améliorer le ciblage |
| `/career-ops-followup` | `/career-ops followup` | Suivi de la cadence de relance |

**Note :** Les commandes OpenCode invoquent le même skill `.claude/skills/career-ops/SKILL.md` utilisé par Claude Code. Les fichiers `modes/*` sont partagés entre les deux plateformes.

### Commandes Gemini CLI

Avec le [Gemini CLI](https://github.com/google-gemini/gemini-cli), les commandes slash suivantes sont disponibles (définies dans `.gemini/commands/`) :

| Commande | Équivalent Claude Code | Description |
|----------|------------------------|-------------|
| `/career-ops` | `/career-ops` | Afficher le menu ou évaluer une offre avec arguments |
| `/career-ops-pipeline` | `/career-ops pipeline` | Traiter les URLs en attente de la boîte de réception |
| `/career-ops-evaluate` | `/career-ops oferta` | Évaluer une offre d'emploi (scoring A-G) |
| `/career-ops-compare` | `/career-ops ofertas` | Comparer et classer plusieurs offres |
| `/career-ops-contact` | `/career-ops contacto` | Prise de contact LinkedIn (trouver des contacts + rédiger) |
| `/career-ops-deep` | `/career-ops deep` | Recherche approfondie sur une entreprise |
| `/career-ops-pdf` | `/career-ops pdf` | Générer un CV optimisé ATS |
| `/career-ops-training` | `/career-ops training` | Évaluer une formation/certification par rapport aux objectifs |
| `/career-ops-project` | `/career-ops project` | Évaluer une idée de projet portfolio |
| `/career-ops-tracker` | `/career-ops tracker` | Vue d'ensemble du statut des candidatures |
| `/career-ops-apply` | `/career-ops apply` | Assistant de candidature en direct |
| `/career-ops-scan` | `/career-ops scan` | Scanner les portails pour de nouvelles offres |
| `/career-ops-batch` | `/career-ops batch` | Traitement par lots avec workers parallèles |
| `/career-ops-patterns` | `/career-ops patterns` | Analyser les tendances de refus et améliorer le ciblage |
| `/career-ops-followup` | `/career-ops followup` | Suivi de la cadence de relance |

**Note :** Les commandes Gemini CLI sont définies dans `.gemini/commands/*.toml`. Le contexte du projet est chargé automatiquement depuis `GEMINI.md`. Tous les fichiers `modes/*` sont partagés entre Claude Code, OpenCode et Gemini CLI.

### Premier lancement — Onboarding (IMPORTANT)

**Avant de faire QUOI QUE CE SOIT d'autre, vérifie si le système est configuré.** Lance ces vérifications silencieusement à chaque début de session :

1. Est-ce que `cv.md` existe ?
2. Est-ce que `config/profile.yml` existe (pas seulement profile.example.yml) ?
3. Est-ce que `modes/_profile.md` existe (pas seulement _profile.template.md) ?
4. Est-ce que `portals.yml` existe (pas seulement templates/portals.example.yml) ?

Si `modes/_profile.md` est manquant, copie depuis `modes/_profile.template.md` silencieusement. C'est le fichier de personnalisation de l'utilisateur — il ne sera jamais écrasé par les mises à jour.

**Si L'UN de ces fichiers manque, passe en mode onboarding.** NE PAS procéder aux évaluations, scans ou tout autre mode tant que les bases ne sont pas en place. Guide l'utilisateur étape par étape :

#### Étape 1 : CV (obligatoire)
Si `cv.md` est manquant, demande :
> « Je n'ai pas encore ton CV. Tu peux soit :
> 1. Coller ton CV ici et je le convertirai en markdown
> 2. Coller ton URL LinkedIn et j'extrairai les infos clés
> 3. Me parler de ton expérience et je rédigerai un CV pour toi
>
> Que préfères-tu ? »

Crée `cv.md` à partir de ce qu'il fournit. Fais un markdown propre avec des sections standard (Résumé, Expérience, Projets, Formation, Compétences).

#### Étape 2 : Profil (obligatoire)
Si `config/profile.yml` est manquant, copie depuis `config/profile.example.yml` puis demande :
> « J'ai besoin de quelques détails pour personnaliser le système :
> - Ton nom complet et ton email
> - Ta localisation et ton fuseau horaire
> - Quels rôles vises-tu ? (ex. : « Développeur Backend Senior », « Chef de Produit IA »)
> - Ta fourchette de salaire cible
>
> Je vais tout configurer pour toi. »

Remplis `config/profile.yml` avec ses réponses. Pour les archétypes et le narratif de ciblage, stocke le mapping spécifique à l'utilisateur dans `modes/_profile.md` ou `config/profile.yml` plutôt que de modifier `modes/_shared.md`.

#### Étape 3 : Portails (recommandé)
Si `portals.yml` est manquant :
> « Je vais configurer le scanner d'offres avec plus de 45 entreprises pré-configurées. Tu veux que je personnalise les mots-clés de recherche pour tes rôles cibles ? »

Copie `templates/portals.example.yml` → `portals.yml`. S'il a donné des rôles cibles à l'étape 2, mets à jour `title_filter.positive` en conséquence.

#### Étape 4 : Tableau de suivi
Si `data/applications.md` n'existe pas, crée-le :
```markdown
# Tableau de suivi des candidatures

| # | Date | Entreprise | Rôle | Score | Statut | PDF | Rapport | Notes |
|---|------|------------|------|-------|--------|-----|---------|-------|
```

#### Étape 5 : Apprendre à connaître l'utilisateur (important pour la qualité)

Après la configuration de base, demande proactivement plus de contexte. Plus tu en sais, meilleures seront tes évaluations :

> « Les bases sont prêtes. Mais le système fonctionne beaucoup mieux quand il te connaît bien. Peux-tu m'en dire plus sur :
> - Ce qui te rend unique ? Quel est ton « super-pouvoir » que les autres candidats n'ont pas ?
> - Quel type de travail t'enthousiasme ? Qu'est-ce qui t'épuise ?
> - Des critères éliminatoires ? (ex. : pas de présentiel, pas de startups de moins de 20 personnes, pas de Java)
> - Ta meilleure réalisation professionnelle — celle que tu mettrais en avant en entretien
> - Des projets, articles ou études de cas que tu as publiés ?
>
> Plus tu me donnes de contexte, mieux je filtre. Pense à ça comme l'onboarding d'un recruteur — la première semaine j'ai besoin d'apprendre à te connaître, ensuite je deviens indispensable. »

Stocke les informations que l'utilisateur partage dans `config/profile.yml` (sous narrative), `modes/_profile.md`, ou dans `article-digest.md` s'il partage des preuves. Ne mets pas les archétypes ou le cadrage spécifiques à l'utilisateur dans `modes/_shared.md`.

**Après chaque évaluation, apprends.** Si l'utilisateur dit « ce score est trop élevé, je ne postulerais pas ici » ou « tu as raté que j'ai de l'expérience en X », mets à jour ta compréhension dans `modes/_profile.md`, `config/profile.yml`, ou `article-digest.md`. Le système doit devenir plus intelligent à chaque interaction sans mettre de personnalisation dans les fichiers de la couche système.

#### Étape 6 : Prêt
Une fois tous les fichiers en place, confirme :
> « Tu es prêt ! Tu peux maintenant :
> - Coller une URL d'offre pour l'évaluer
> - Lancer `/career-ops scan` (ou `/career-ops-scan` avec OpenCode) pour scanner les portails
> - Lancer `/career-ops` pour voir toutes les commandes
>
> Tout est personnalisable — demande-moi simplement de changer ce que tu veux.
>
> Astuce : Avoir un portfolio personnel améliore considérablement ta recherche d'emploi. Si tu n'en as pas encore, le portfolio de l'auteur original est aussi open source : github.com/santifer/cv-santiago — n'hésite pas à le forker et à te l'approprier. »

Puis suggère l'automatisation :
> « Tu veux que je scanne les nouvelles offres automatiquement ? Je peux configurer un scan récurrent tous les quelques jours pour que tu ne rates rien. Dis simplement « scan tous les 3 jours » et je le configure. »

Si l'utilisateur accepte, utilise le skill `/loop` ou `/schedule` (si disponible) pour configurer un `/career-ops scan` récurrent (ou `/career-ops-scan` avec OpenCode). Si ceux-ci ne sont pas disponibles, suggère d'ajouter un cron job ou rappelle-lui de lancer `/career-ops scan` (ou `/career-ops-scan` avec OpenCode) périodiquement.

### Personnalisation

Ce système est conçu pour être personnalisé par TOI (Agent IA). Quand l'utilisateur te demande de changer les archétypes, traduire les modes, ajuster le scoring, ajouter des entreprises ou modifier les scripts de négociation — fais-le directement. Tu lis les mêmes fichiers que tu utilises, donc tu sais exactement quoi modifier.

**Demandes de personnalisation courantes :**
- « Change les archétypes pour des rôles [backend/frontend/data/devops] » → modifie `modes/_profile.md` ou `config/profile.yml`
- « Traduis les modes en anglais » → modifie tous les fichiers dans `modes/`
- « Ajoute ces entreprises à mes portails » → modifie `portals.yml`
- « Mets à jour mon profil » → modifie `config/profile.yml`
- « Change le design du template CV » → modifie `templates/cv-template.html`
- « Ajuste les pondérations du scoring » → modifie `modes/_profile.md` pour la pondération spécifique à l'utilisateur, ou modifie `modes/_shared.md` et `batch/batch-prompt.md` uniquement pour changer les paramètres système partagés par défaut

### Modes linguistiques

Les modes par défaut pour ce fork sont dans `modes/fr/` (français). Des modes dans d'autres langues sont également disponibles :

- **Français (marché francophone) — DÉFAUT pour ce fork :** `modes/fr/` — traductions françaises natives avec vocabulaire spécifique France/Belgique/Suisse/Luxembourg (CDI/CDD, convention collective SYNTEC, RTT, mutuelle, prévoyance, 13e mois, intéressement/participation, titres-restaurant, CSE, portage salarial, etc.). Inclut `_shared.md`, `offre.md` (évaluation), `postuler.md` (candidater), `pipeline.md`.
- **Anglais :** `modes/` — modes originaux en anglais.
- **Allemand (marché DACH) :** `modes/de/` — traductions allemandes natives avec vocabulaire spécifique DACH (13. Monatsgehalt, Probezeit, Kündigungsfrist, AGG, Tarifvertrag, etc.). Inclut `_shared.md`, `angebot.md` (évaluation), `bewerben.md` (candidater), `pipeline.md`.
- **Japonais (marché japonais) :** `modes/ja/` — traductions japonaises natives avec vocabulaire spécifique au Japon (正社員, 業務委託, 賞与, 退職金, みなし残業, 年俸制, 36協定, 通勤手当, 住宅手当, etc.). Inclut `_shared.md`, `kyujin.md` (évaluation), `oubo.md` (candidater), `pipeline.md`.

**Quand utiliser les modes français (DÉFAUT) :** Ce fork utilise le français par défaut. Les modes français dans `modes/fr/` sont chargés automatiquement. Soit :
1. L'utilisateur a cloné ce fork → les modes français sont utilisés par défaut
2. L'utilisateur définit `language.modes_dir: modes/fr` dans `config/profile.yml` → toujours utiliser les modes français
3. Tu détectes une offre d'emploi en français → utilise les modes français

**Quand utiliser les modes allemands :** Si l'utilisateur vise des offres en allemand, vit dans la zone DACH, ou demande une sortie en allemand. Soit :
1. L'utilisateur dit « utilise les modes allemands » → lis depuis `modes/de/` au lieu de `modes/fr/`
2. L'utilisateur définit `language.modes_dir: modes/de` dans `config/profile.yml` → toujours utiliser les modes allemands
3. Tu détectes une offre en allemand → suggère de passer aux modes allemands

**Quand utiliser les modes japonais :** Si l'utilisateur vise des offres en japonais, vit au Japon, ou demande une sortie en japonais. Soit :
1. L'utilisateur dit « utilise les modes japonais » → lis depuis `modes/ja/` au lieu de `modes/fr/`
2. L'utilisateur définit `language.modes_dir: modes/ja` dans `config/profile.yml` → toujours utiliser les modes japonais
3. Tu détectes une offre en japonais → suggère de passer aux modes japonais

**Quand NE PAS utiliser les modes traduits :** Si l'utilisateur postule à des rôles en anglais, même dans des entreprises françaises, allemandes ou japonaises, utilise les modes anglais par défaut (`modes/`).

### Modes du skill

| Si l'utilisateur… | Mode |
|--------------------|------|
| Colle une offre ou une URL | auto-pipeline (évaluer + rapport + PDF + tableau de suivi) |
| Demande d'évaluer une offre | `oferta` |
| Demande de comparer des offres | `ofertas` |
| Veut une prise de contact LinkedIn | `contacto` |
| Demande une recherche sur une entreprise | `deep` |
| Prépare un entretien pour une entreprise spécifique | `interview-prep` |
| Veut générer un CV/PDF | `pdf` |
| Évalue une formation/certification | `training` |
| Évalue un projet portfolio | `project` |
| Demande le statut des candidatures | `tracker` |
| Remplit un formulaire de candidature | `apply` |
| Cherche de nouvelles offres | `scan` |
| Traite les URLs en attente | `pipeline` |
| Traite des offres par lots | `batch` |
| Demande les tendances de refus ou veut améliorer le ciblage | `patterns` |
| Demande les relances ou la cadence de candidature | `followup` |

### Source de vérité du CV

- `cv.md` à la racine du projet est le CV canonique
- `article-digest.md` contient les preuves détaillées (optionnel)
- **JAMAIS de métriques en dur** — les lire depuis ces fichiers au moment de l'évaluation

---

## Utilisation éthique — CRITIQUE

**Ce système est conçu pour la qualité, pas la quantité.** L'objectif est d'aider l'utilisateur à trouver et postuler à des rôles où il y a une correspondance réelle — pas de spammer les entreprises avec des candidatures de masse.

- **JAMAIS soumettre une candidature sans que l'utilisateur l'ait d'abord relue.** Remplis les formulaires, rédige les réponses, génère les PDF — mais ARRÊTE-TOI toujours avant de cliquer sur Candidater/Envoyer/Postuler. L'utilisateur prend la décision finale.
- **Décourage fortement les candidatures à faible correspondance.** Si un score est inférieur à 4,0/5, recommande explicitement de ne pas postuler. Le temps de l'utilisateur et celui du recruteur sont tous deux précieux. Ne procède que si l'utilisateur a une raison spécifique de passer outre le score.
- **Qualité plutôt que vitesse.** Une candidature bien ciblée à 5 entreprises vaut mieux qu'un envoi générique à 50. Guide l'utilisateur vers moins de candidatures, mais de meilleure qualité.
- **Respecte le temps des recruteurs.** Chaque candidature qu'un humain lit coûte de l'attention à quelqu'un. N'envoie que ce qui mérite d'être lu.

---

## Vérification des offres — OBLIGATOIRE

**JAMAIS faire confiance à WebSearch/WebFetch pour vérifier si une offre est encore active.** TOUJOURS utiliser Playwright :
1. `browser_navigate` vers l'URL
2. `browser_snapshot` pour lire le contenu
3. Seulement un footer/navbar sans description de poste = fermée. Titre + description + Postuler = active.

**Exception pour les workers batch (`claude -p`) :** Playwright n'est pas disponible en mode pipe headless. Utilise WebFetch en fallback et marque l'en-tête du rapport avec `**Vérification :** non confirmée (mode batch)`. L'utilisateur pourra vérifier manuellement plus tard.

---

## CI/CD et qualité

- **GitHub Actions** s'exécutent à chaque PR : `test-all.mjs` (63+ vérifications), auto-labeler (basé sur le risque : 🔴 core-architecture, ⚠️ agent-behavior, 📄 docs), bot de bienvenue pour les nouveaux contributeurs
- **Protection de branche** sur `main` : les vérifications de statut doivent passer avant le merge. Pas de push direct sur main (sauf bypass admin).
- **Dependabot** surveille npm, les modules Go et GitHub Actions pour les mises à jour de sécurité
- **Processus de contribution** : issue d'abord → discussion → PR avec issue liée → CI passe → revue du mainteneur → merge

## Communauté et gouvernance

- **Code de conduite** : Contributor Covenant 2.1 avec actions d'application (voir `CODE_OF_CONDUCT.md`)
- **Gouvernance** : modèle BDFL avec échelle de contribution — Participant → Contributeur → Trieur → Relecteur → Mainteneur (voir `GOVERNANCE.md`)
- **Sécurité** : signalement privé de vulnérabilités par email (voir `SECURITY.md`)
- **Support** : les questions d'aide vont sur Discord/Discussions, pas sur les issues (voir `SUPPORT.md`)
- **Discord** : https://discord.gg/8pRpHETxa4

## Stack et conventions

- Node.js (modules mjs), Playwright (PDF + scraping), YAML (config), HTML/CSS (template), Markdown (données), Canva MCP (CV visuel optionnel)
- Scripts en `.mjs`, configuration en YAML
- Sortie dans `output/` (gitignored), Rapports dans `reports/`
- Offres d'emploi dans `jds/` (référencées comme `local:jds/{file}` dans pipeline.md)
- Batch dans `batch/` (gitignored sauf scripts et prompt)
- Numérotation des rapports : séquentielle sur 3 chiffres avec zéros, max existant + 1
- **RÈGLE : Après chaque lot d'évaluations, lancer `node merge-tracker.mjs`** pour fusionner les ajouts au tableau de suivi et éviter les doublons.
- **RÈGLE : JAMAIS créer de nouvelles entrées dans applications.md si entreprise+rôle existe déjà.** Mettre à jour l'entrée existante.

### Format TSV pour les ajouts au tableau de suivi

Écris un fichier TSV par évaluation dans `batch/tracker-additions/{num}-{company-slug}.tsv`. Une seule ligne, 9 colonnes séparées par des tabulations :

```
{num}\t{date}\t{company}\t{role}\t{status}\t{score}/5\t{pdf_emoji}\t[{num}](reports/{num}-{slug}-{date}.md)\t{note}
```

**Ordre des colonnes (IMPORTANT — statut AVANT score) :**
1. `num` — numéro séquentiel (entier)
2. `date` — YYYY-MM-DD
3. `company` — nom court de l'entreprise
4. `role` — intitulé du poste
5. `status` — statut canonique (ex. : `Evaluated`)
6. `score` — format `X.X/5` (ex. : `4.2/5`)
7. `pdf` — `✅` ou `❌`
8. `report` — lien markdown `[num](reports/...)`
9. `notes` — résumé sur une ligne

**Note :** Dans applications.md, le score vient AVANT le statut. Le script de fusion gère cette inversion de colonnes automatiquement.

### Intégrité du pipeline

1. **JAMAIS modifier applications.md pour AJOUTER de nouvelles entrées** — Écris le TSV dans `batch/tracker-additions/` et `merge-tracker.mjs` gère la fusion.
2. **OUI tu peux modifier applications.md pour METTRE À JOUR le statut/notes des entrées existantes.**
3. Tous les rapports DOIVENT inclure `**URL :**` dans l'en-tête (entre Score et PDF). Inclure `**Légitimité :** {tier}` (voir Bloc G dans `modes/oferta.md`).
4. Tous les statuts DOIVENT être canoniques (voir `templates/states.yml`).
5. Vérification de santé : `node verify-pipeline.mjs`
6. Normalisation des statuts : `node normalize-statuses.mjs`
7. Déduplication : `node dedup-tracker.mjs`

### États canoniques (applications.md)

**Source de vérité :** `templates/states.yml`

| État | Quand l'utiliser |
|------|------------------|
| `Evaluated` | Rapport terminé, en attente de décision |
| `Applied` | Candidature envoyée |
| `Responded` | L'entreprise a répondu |
| `Interview` | En processus d'entretien |
| `Offer` | Offre reçue |
| `Rejected` | Refusé par l'entreprise |
| `Discarded` | Écarté par le candidat ou offre fermée |
| `SKIP` | Ne correspond pas, ne pas postuler |

**RÈGLES :**
- Pas de gras markdown (`**`) dans le champ statut
- Pas de dates dans le champ statut (utiliser la colonne date)
- Pas de texte supplémentaire (utiliser la colonne notes)
