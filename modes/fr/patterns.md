<!-- Traduit depuis santifer/career-ops@411afb3 -->

# Mode : patterns — Détecteur de patterns de rejet

## Objectif

Analyser toutes les candidatures trackées pour trouver des patterns dans les résultats et faire remonter des insights actionnables. Identifie ce qui fonctionne (archétypes, politiques remote, tranches de score) et ce qui fait perdre du temps (rôles géo-restreints, écarts de stack, candidatures à score bas).

## Entrées

- `data/applications.md` — Tracker de candidatures
- `reports/` — Rapports d'évaluation individuels
- `config/profile.yml` — Profil utilisateur (pour le contexte des recommandations)
- `modes/_profile.md` — Archétypes et cadrage utilisateur
- `portals.yml` — Configuration des portails (pour les recommandations de mise à jour des filtres)

## Seuil minimum

Avant de lancer l'analyse, vérifier : est-ce que `data/applications.md` contient au moins 5 entrées avec un statut au-delà de « Evaluated » (c'est-à-dire Applied, Responded, Interview, Offer, Rejected, Discarded, SKIP) ?

Sinon, dire :
> « Pas assez de données encore — {N}/5 candidatures ont progressé au-delà de l'évaluation. Continue à postuler et reviens quand tu auras plus de résultats à analyser. »

Sortir proprement.

## Étape 1 — Exécuter le script d'analyse

Exécuter :

```bash
node analyze-patterns.mjs
```

Parser la sortie JSON. Elle contient :

| Clé | Contenu |
|-----|---------|
| `metadata` | Total entrées, plage de dates, date d'analyse, décomptes par résultat |
| `funnel` | Décompte par étape de statut (evaluated, applied, interview, offer, etc.) |
| `scoreComparison` | Score moyen/min/max par groupe de résultat (positive, negative, self_filtered, pending) |
| `archetypeBreakdown` | Par archétype : total, positifs, négatifs, auto-filtrés, taux de conversion |
| `blockerAnalysis` | Bloqueurs durs les plus fréquents : géo-restriction, stack-mismatch, seniority, onsite |
| `remotePolicy` | Par bucket de politique remote : total, positifs, négatifs, taux de conversion |
| `companySizeBreakdown` | Par bucket de taille : startup, scaleup, enterprise |
| `scoreThreshold` | Score minimum recommandé + raisonnement |
| `techStackGaps` | Lacunes techniques les plus fréquentes dans les résultats négatifs |
| `recommendations` | Top 5 actions avec raisonnement et niveau d'impact |

Si le script retourne `error`, afficher le message d'erreur et sortir.

## Étape 2 — Générer le rapport

Écrire le rapport dans `reports/pattern-analysis-{YYYY-MM-DD}.md`.

### Structure du rapport

```markdown
# Analyse de patterns — {AAAA-MM-JJ}

**Candidatures analysées :** {total}
**Plage de dates :** {du} au {au}
**Résultats :** {positifs} positifs, {négatifs} négatifs, {auto-filtrés} auto-filtrés, {en attente} en attente

---

## Entonnoir de conversion

Afficher chaque statut avec décompte et pourcentage du total. Utiliser un simple tableau :

| Étape | Nombre | % |
|-------|--------|---|
| Evaluated | X | X % |
| Applied | X | X % |
| … | | |

## Score vs Résultat

| Résultat | Score moyen | Min | Max | Nombre |
|----------|-------------|-----|-----|--------|
| Positif | X.X/5 | X.X | X.X | X |
| Négatif | … | | | |
| Auto-filtré | … | | | |
| En attente | … | | | |

## Performance par archétype

Tableau avec chaque archétype, total de candidatures, résultats positifs, taux de conversion.
Mettre en évidence l'archétype le plus performant et le moins performant.

## Top des bloqueurs

Tableau de fréquence des bloqueurs durs récurrents (géo-restriction, stack-mismatch, etc.).
Noter le pourcentage de toutes les candidatures affectées par chacun.

## Patterns de politique remote

Tableau montrant le taux de conversion par bucket de politique remote (global, régional, géo-restreint, hybride/onsite).

## Lacunes techniques

Liste des compétences manquantes les plus fréquentes dans les résultats négatifs/auto-filtrés avec fréquence.

## Seuil de score recommandé

Indiquer le score minimum basé sur les données et le raisonnement.

## Recommandations

Numéroter les recommandations principales (depuis la sortie du script). Pour chaque :
1. **[IMPACT]** Action à prendre
   Raisonnement derrière la recommandation.
```

## Étape 3 — Présenter le résumé

Montrer à l'utilisateur une version condensée avec :
1. Résumé en une ligne (X candidatures, Y % postulées, Z % résultat positif)
2. Top 3 des découvertes (patterns les plus impactants)
3. Lien vers le rapport complet

Exemple :
> **Analyse de patterns terminée** (24 candidatures, 7-8 avril)
>
> Découvertes clés :
> - Les rôles géo-restreints ont 0 % de conversion (7 sur 24) — arrête d'évaluer les postes US/Canada-only
> - Les rôles remote régionaux/globaux convertissent à 57-67 % — c'est ton point fort
> - Aucun résultat positif sous 4.2/5 — considère ça comme ton score plancher
>
> Rapport complet : `reports/pattern-analysis-2026-04-08.md`

## Étape 4 — Proposer d'appliquer les recommandations

Demander si tu veux agir sur certaines recommandations :

> « Tu veux que j'applique certaines de ces recommandations ? Je peux :
> - Mettre à jour `portals.yml` pour filtrer les rôles géo-restreints
> - Définir un seuil de score dans `_profile.md` pour la génération PDF
> - Ajuster le ciblage d'archétypes selon ce qui convertit
>
> Dis-moi lesquelles, ou « toutes » pour tout appliquer. »

Si l'utilisateur accepte :
- Pour les changements de filtres portail : modifier `portals.yml`
- Pour les changements de profil/archétype : modifier `modes/_profile.md` (JAMAIS `_shared.md`)
- Pour le seuil de score : ajouter dans `config/profile.yml` sous une clé `patterns`

## Classification des résultats

Pour référence, les résultats sont classifiés comme :

| Statut | Résultat |
|--------|----------|
| Interview, Offer, Responded, Applied | **Positif** (effort investi ou traction obtenue) |
| Rejected, Discarded | **Négatif** (l'entreprise a dit non ou l'offre est fermée) |
| SKIP, NO APLICAR | **Auto-filtré** (tu as décidé de ne pas postuler) |
| Evaluated | **En attente** (pas d'action prise encore) |
