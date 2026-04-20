<!-- Traduit depuis santifer/career-ops@411afb3 -->

# Guide d'installation

## Prérequis

- [Claude Code](https://claude.ai/code) installé et configuré
- Node.js 18+ (pour la génération PDF et les scripts utilitaires)
- (Optionnel) Go 1.21+ (pour le dashboard TUI)

## Démarrage rapide (5 étapes)

### 1. Cloner et installer

```bash
git clone https://github.com/atoox-git/career-ops-fr.git
cd career-ops-fr
npm install
npx playwright install chromium   # Required for PDF generation
```

### 2. Configurer ton profil

```bash
cp config/profile.example.yml config/profile.yml
```

Modifie `config/profile.yml` avec tes informations personnelles : nom, email, rôles cibles, récit, preuves concrètes.

### 3. Ajouter ton CV

Crée `cv.md` à la racine du projet avec ton CV complet en format markdown. C'est la source de vérité pour toutes les évaluations et les PDF.

(Optionnel) Crée `article-digest.md` avec les preuves concrètes de tes projets/articles portfolio.

### 4. Configurer les portails

```bash
cp templates/portals.example.yml portals.yml
```

Modifie `portals.yml` :
- Mets à jour `title_filter.positive` avec les mots-clés correspondant à tes rôles cibles
- Ajoute les entreprises à suivre dans `tracked_companies`
- Personnalise `search_queries` pour tes sites d'emploi préférés

### 5. Commencer à utiliser

Ouvre Claude Code dans ce répertoire :

```bash
claude
```

Puis colle une URL d'offre ou une description de poste. Career-ops va automatiquement l'évaluer, générer un rapport, créer un PDF adapté et la tracker.

## Commandes disponibles

| Action | Comment |
|--------|---------|
| Évaluer une offre | Colle une URL ou un texte de JD |
| Chercher des offres | `/career-ops scan` |
| Traiter les URLs en attente | `/career-ops pipeline` |
| Générer un PDF | `/career-ops pdf` |
| Évaluation par lot | `/career-ops batch` |
| Vérifier le statut du tracker | `/career-ops tracker` |
| Remplir un formulaire de candidature | `/career-ops postuler` |

## Vérifier l'installation

```bash
node cv-sync-check.mjs      # Check configuration
node verify-pipeline.mjs     # Check pipeline integrity
```

## Compiler le dashboard (optionnel)

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..  # Opens TUI pipeline viewer
```
