# Guide d'utilisation — Career-Ops FR

> De l'installation à ta première candidature en 15 minutes.

---

## 1. Installation (5 minutes)

### Prérequis

- **Node.js 18+** → [nodejs.org](https://nodejs.org/) (prends la version LTS)
- **Claude Code** → ton abonnement Anthropic actif
- **Git** → normalement déjà installé

### Étapes

```bash
# Cloner le projet
git clone https://github.com/atoox-git/career-ops-fr.git
cd career-ops-fr

# Installer les dépendances (4 packages légers)
npm install

# Installer le navigateur pour la génération PDF
npx playwright install chromium

# Vérifier que tout est prêt
npm run doctor
```

`doctor` va te signaler 3 fichiers manquants — c'est normal, on les crée maintenant.

---

## 2. Configuration initiale (5 minutes)

### 2.1 Ton CV

Crée un fichier `cv.md` à la racine du projet avec ton CV en markdown :

```markdown
# Prénom Nom

## Profil
[2-3 phrases décrivant ton parcours et ton objectif]

## Expériences professionnelles

### Poste — Entreprise (Ville, N salariés)
**CDI cadre — Jan. 2022 – Présent**
- Réalisation clé avec chiffre mesurable
- Autre réalisation

## Formation
- **Diplôme** — École (Année)

## Compétences techniques
- **Domaine :** Outil 1, Outil 2, Outil 3

## Langues
- Français : natif
- Anglais : B2

## Informations complémentaires
- Permis B
- Disponibilité : 2 mois (préavis)
```

> Tu peux aussi ouvrir Claude Code et coller ton CV brut — il le reformatera pour toi.

### 2.2 Ton profil

```bash
cp config/profile.example.yml config/profile.yml
```

Ouvre `config/profile.yml` et remplis :
- Ton nom, email, localisation
- Tes rôles cibles (ex: « Développeur fullstack », « Commercial B2B »)
- Ta fourchette salariale

### 2.3 Tes portails

```bash
cp templates/portals-fr.example.yml portals.yml
```

Les portails français sont déjà préconfigurés. Adapte les mots-clés de `title_filter.positive` à tes rôles cibles.

### 2.4 (Optionnel) API France Travail

Si tu veux scanner les offres France Travail automatiquement :

1. Crée un compte sur [francetravail.io](https://francetravail.io)
2. Crée une application et abonne-toi à l'API « Offres d'emploi v2 »
3. Copie tes clés dans `.env` :

```bash
cp .env.example .env
# Édite .env avec tes FRANCE_TRAVAIL_CLIENT_ID et CLIENT_SECRET
```

Guide détaillé : [docs/API-FRANCE-TRAVAIL.md](API-FRANCE-TRAVAIL.md)

### 2.5 Vérification

```bash
npm run doctor
```

Tout devrait être vert maintenant (sauf `portals.yml` si tu ne l'as pas encore personnalisé).

---

## 3. Première utilisation — Évaluer une offre (2 minutes)

### Option A : Coller une URL

Ouvre Claude Code dans le répertoire du projet :

```bash
claude
```

Puis colle simplement une URL d'offre :

```
https://candidat.francetravail.fr/offres/recherche/detail/12345678
```

Career-ops va automatiquement :
1. Détecter que c'est une URL d'offre
2. Extraire la fiche de poste
3. Classer l'offre dans un archétype (dev fullstack, commercial, etc.)
4. Générer une évaluation complète A-F avec score
5. Créer un rapport dans `reports/`
6. Ajouter une entrée dans ton tableau de suivi

### Option B : Coller le texte d'une offre

Si l'URL ne fonctionne pas (LinkedIn, Indeed, Glassdoor), copie-colle le texte de l'offre directement :

```
Voici une offre qui m'intéresse :

Développeur Fullstack — StartupFlow (Paris)
CDI cadre, 42-50K€ brut
[... le texte complet de l'offre ...]
```

Career-ops détecte automatiquement que c'est une fiche de poste et lance le pipeline.

### Option C : Utiliser une commande slash

```
/career-ops évalue cette offre : [URL ou texte]
```

---

## 4. Comprendre le rapport d'évaluation

Le rapport contient **6 blocs** :

| Bloc | Contenu |
|------|---------|
| **A — Résumé** | Archétype détecté, séniorité, remote, TL;DR |
| **B — Match CV** | Chaque prérequis de l'offre mappé sur ton CV. Forces + lacunes avec stratégie de mitigation |
| **C — Niveau** | Ton niveau vs celui demandé. Plans « vendre senior » et « si je suis downlevel » |
| **D — Rémunération** | Données marché (Glassdoor, APEC, Talent.io). Fourchette recommandée. Scripts de négociation |
| **E — Personnalisation** | Summary CV réécrit pour cette offre. Lettre de motivation. Mots-clés ATS injectés |
| **F — Entretien** | 3-5 histoires STAR+Réflexion adaptées. Questions probables. Plan de préparation |

**Score global** (1 à 5) :
- **4.5+** → Fonce, c'est un excellent match
- **4.0-4.4** → Bon match, candidate
- **3.5-3.9** → Moyen, candidate seulement si raison spécifique
- **< 3.5** → Le système déconseille de candidater

---

## 5. Les commandes utiles au quotidien

### Scanner les portails

```
/career-ops scan
```

Parcourt tes portails configurés et rapporte les nouvelles offres correspondant à tes critères.

### Générer un CV PDF personnalisé

```
/career-ops pdf
```

Crée un CV PDF optimisé ATS, personnalisé pour la dernière offre évaluée. Le PDF va dans `output/`.

### Générer une lettre de motivation

```
/career-ops lettre-motivation
```

> Mode exclusif au fork FR. Génère une lettre en 3 paragraphes : accroche, expérience alignée, appel à l'action. Ton moderne, jamais de « Je me permets de… ».

### Remplir un formulaire de candidature

```
/career-ops apply
```

Claude lit le formulaire (capture d'écran ou texte copié) et génère des réponses personnalisées pour chaque champ — prétentions salariales, motivation, disponibilité.

### Recherche approfondie sur une entreprise

```
/career-ops deep [nom entreprise]
```

### Préparer un entretien

```
/career-ops entretien [entreprise]
```

### Suivre tes candidatures

```
/career-ops tracker
```

Affiche le tableau de suivi avec scores, statuts et liens vers les rapports.

### Traitement par lot

```
/career-ops batch
```

Évalue plusieurs offres en parallèle. Idéal après un scan qui a trouvé 10+ résultats.

### Analyser les patterns de rejet

```
/career-ops patterns
```

Après plusieurs candidatures, identifie les tendances : quels types d'offres te conviennent le mieux, où tu es systématiquement recalé.

---

## 6. Workflow quotidien recommandé

```
Matin (10 min) :
  1. Ouvre Claude Code dans career-ops-fr
  2. /career-ops scan → nouvelles offres ?
  3. Évalue les offres intéressantes (colle l'URL)
  4. Score ≥ 4.0 → génère le CV PDF + lettre de motivation

Candidature (15 min par offre) :
  5. /career-ops apply → remplis le formulaire avec l'aide de l'IA
  6. Relis TOUT avant de soumettre (humain dans la boucle)
  7. Le système met à jour ton tableau de suivi

Hebdomadaire :
  8. /career-ops tracker → vue d'ensemble
  9. /career-ops patterns → ajuste ta stratégie
  10. /career-ops followup → relances à faire
```

---

## 7. Les 6 archétypes du marché français

Career-ops-fr classifie chaque offre dans l'un de ces profils pour adapter l'évaluation :

| Archétype | Profil type | Dimensions clés |
|-----------|-------------|-----------------|
| **Dev fullstack PME** | JS/TS/PHP/Python, CDI, PME 10-200 | Stack, taille équipe, télétravail |
| **Commercial B2B** | SaaS/industrie/BTP, variable 20-40 % | CA, cycle de vente, secteur |
| **Manager d'équipe** | Tech lead / chef de service, 5-15 pers. | Leadership, recrutement, budget |
| **Artisan-salarié** | Plombier, électricien, conducteur de travaux | Permis, habilitations, déplacements |
| **Fonction support** | Compta, paie, RH, admin | Convention collective, outils, taille entreprise |
| **Alternance / stage** | Bac+2 à Bac+5 | Formation, rémunération légale, embauche à l'issue |

> Tu peux ajouter ou modifier les archétypes en demandant à Claude : *« Ajoute un archétype Data Engineer »*.

---

## 8. Personnalisation

Career-ops est conçu pour être personnalisé par Claude lui-même. Exemples :

| Tu dis… | Claude fait… |
|---------|-------------|
| « Change les archétypes pour des postes data » | Édite `modes/_profile.md` |
| « Ajoute Doctolib et BlaBlaCar à mes portails » | Édite `portals.yml` |
| « Mon préavis est de 3 mois » | Édite `config/profile.yml` |
| « Je vise 55-65K€ » | Met à jour la fourchette dans `profile.yml` |
| « Traduis mes modes en anglais » | Crée des fichiers dans `modes/` |

Les fichiers de personnalisation :
- `config/profile.yml` → tes infos, ta fourchette, tes cibles
- `modes/_profile.md` → tes archétypes personnalisés, ton narratif
- `portals.yml` → tes entreprises et mots-clés de scan
- `cv.md` → ton CV (source de vérité)

---

## 9. Dépannage

### « doctor » échoue

| Message | Solution |
|---------|----------|
| `cv.md not found` | Crée `cv.md` à la racine (voir section 2.1) |
| `profile.yml not found` | `cp config/profile.example.yml config/profile.yml` |
| `portals.yml not found` | `cp templates/portals-fr.example.yml portals.yml` |
| `Playwright chromium not found` | `npx playwright install chromium` |

### L'API France Travail renvoie 401

- Vérifie tes clés dans `.env` (pas d'espaces en trop)
- Vérifie que tu es bien abonné à l'API « Offres d'emploi v2 »
- Guide complet : [docs/API-FRANCE-TRAVAIL.md](API-FRANCE-TRAVAIL.md)

### Le score d'une offre ne correspond pas à mon ressenti

Le système s'améliore avec le temps. Dis à Claude :
- *« Ce score est trop haut, je ne postulerais pas ici parce que… »*
- *« Tu as raté que j'ai de l'expérience en X »*

Claude ajuste ses critères dans `modes/_profile.md` pour les prochaines évaluations.

### Un portail tier 2 ne fonctionne pas

Les sélecteurs Playwright peuvent devenir obsolètes quand un site change son design. Solutions :
1. Colle l'offre manuellement (mode paste — toujours fonctionnel)
2. Signale le problème dans les [issues GitHub](https://github.com/atoox-git/career-ops-fr/issues)

---

## 10. Ressources

| Ressource | Lien |
|-----------|------|
| Repo GitHub | [atoox-git/career-ops-fr](https://github.com/atoox-git/career-ops-fr) |
| Projet original | [santifer/career-ops](https://github.com/santifer/career-ops) |
| Guide API France Travail | [docs/API-FRANCE-TRAVAIL.md](API-FRANCE-TRAVAIL.md) |
| Politique de confidentialité | [PRIVACY.md](../PRIVACY.md) |
| Discord communauté | [discord.gg/8pRpHETxa4](https://discord.gg/8pRpHETxa4) |
