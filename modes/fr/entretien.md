<!-- Traduit depuis santifer/career-ops@411afb3 -->

# Mode : entretien — Intelligence de préparation d'entretien par entreprise

Quand tu demandes à préparer un entretien pour une entreprise+rôle spécifique, ou quand une évaluation atteint un score de 4.0+ et que tu mets à jour le statut en `Interview`, lancer ce mode.

## Entrées

1. **Nom de l'entreprise** et **titre du rôle** (obligatoires)
2. **Rapport d'évaluation** dans `reports/` (si existant) — lire pour l'archétype, les lacunes, les preuves concrètes matchées
3. **Banque d'histoires** dans `interview-prep/story-bank.md` — lire pour les histoires déjà préparées
4. **CV** dans `cv.md` + `article-digest.md` — lire pour les preuves concrètes
5. **Profil** dans `config/profile.yml` + `modes/_profile.md` — lire pour le contexte candidat

## Étape 1 — Recherche

Exécuter ces requêtes WebSearch. Extraire des données structurées, pas des résumés. Citer les sources pour chaque affirmation.

| Requête | Ce qu'il faut extraire |
|---------|------------------------|
| `"{company} {role} interview questions site:glassdoor.com"` | Questions effectivement posées, note de difficulté, note d'expérience, timeline du processus, nombre de rounds, ratio offre/rejet |
| `"{company} interview process site:teamblind.com"` | Descriptions candides du processus, données récentes, détails de négociation de comp, barre de recrutement |
| `"{company} {role} interview site:leetcode.com/discuss"` | Problèmes techniques spécifiques, sujets de system design, structure des rounds |
| `"{company} engineering blog"` | Stack technique, valeurs, ce qu'ils publient, priorités techniques |
| `"{company} interview process {role}"` (général) | Combler les lacunes — articles de blog, YouTube, guides de préparation, retours de candidats |

Si l'entreprise est petite ou peu connue et donne peu de résultats, élargir : chercher l'archétype du rôle dans des entreprises de taille similaire, et noter que l'intelligence est limitée.

**Ne JAMAIS inventer de questions d'entretien et les attribuer à des sources.** Si une source dit « ils ont posé des questions sur les systèmes distribués », reporter cela. Ne pas inventer une question spécifique sur les systèmes distribués. Quand tu génères des questions probables à partir de l'analyse du JD, les étiqueter clairement comme `[inféré du JD]` et non sourcé de candidats.

## Étape 2 — Vue d'ensemble du processus

```markdown
## Vue d'ensemble du processus
- **Rounds :** {N} rounds, ~{X} jours de bout en bout
- **Format :** {ex : screening recruteur → entretien technique téléphonique → test technique à domicile → onsite (4 rounds) → hiring manager}
- **Difficulté :** {X}/5 (moyenne Glassdoor, N avis)
- **Taux d'expérience positive :** {X} %
- **Particularités connues :** {ex : « pair programming au lieu de whiteboard », « pas de LeetCode, tout en pratique », « le test à domicile dure 4 heures »}
- **Sources :** {liens}
```

Si les données sont insuffisantes pour un champ, écrire « inconnu — pas assez de données » plutôt que deviner.

## Étape 3 — Détail round par round

Pour chaque round découvert dans la recherche :

```markdown
### Round {N} : {Type}
- **Durée :** {X} min
- **Conduit par :** {pair / manager / N+2 / recruteur — si connu}
- **Ce qu'ils évaluent :** {compétences ou traits spécifiques}
- **Questions rapportées :**
  - {question} — [source : Glassdoor 2026-Q1]
  - {question} — [source : Blind]
- **Comment se préparer :** {1-2 actions concrètes}
```

Si la structure des rounds est inconnue, l'indiquer et fournir la meilleure intelligence disponible sur les types de rounds à attendre selon la taille de l'entreprise, le stade et le niveau du rôle.

## Étape 4 — Questions probables

Catégoriser toutes les questions découvertes et inférées :

### Techniques
Questions sur le system design, le coding, l'architecture, le domaine métier.
Pour chaque : la question, la source, et à quoi ressemble une bonne réponse pour ce candidat spécifiquement (référencer les preuves concrètes du CV).

### Comportementales
Questions sur le leadership, les conflits, la collaboration, les échecs.
Pour chaque : la question, la source, et quelle histoire de `story-bank.md` correspond le mieux.

### Spécifiques au rôle
Questions liées à la description de poste spécifique (conscientes de l'archétype).
Pour chaque : la question, pourquoi ils la posent probablement (quelle exigence du JD elle mappe), et le meilleur angle du candidat.

### Signaux d'alerte sur le parcours
Questions que l'intervieweur posera probablement sur les trous, transitions, ou éléments inhabituels dans le parcours du candidat. Lire `_profile.md` et `cv.md` pour identifier ce qui pourrait soulever des questions.
Pour chaque : la question probable, pourquoi elle surgit, et un cadrage recommandé (honnête, spécifique, tourné vers l'avenir — jamais défensif).

## Étape 5 — Mapping de la banque d'histoires

| # | Question/sujet probable | Meilleure histoire de story-bank.md | Adéquation | Lacune ? |
|---|------------------------|-------------------------------------|------------|----------|
| 1 | … | [Titre de l'histoire] | forte/partielle/aucune | |

- **forte** : l'histoire répond directement à la question
- **partielle** : l'histoire est adjacente, nécessite un recadrage
- **aucune** : pas d'histoire existante — signaler à l'utilisateur

Pour chaque lacune, suggérer : « Tu as besoin d'une histoire sur {sujet}. Considère : {expérience spécifique de cv.md qui pourrait devenir une histoire STAR+R}. »

Si tu veux rédiger les histoires manquantes, aide à construire le format STAR+R et ajoute à `interview-prep/story-bank.md`.

## Étape 6 — Checklist de préparation technique

Basée sur ce que l'entreprise teste réellement, pas des conseils génériques :

```markdown
- [ ] {sujet} — pourquoi : « {preuve de la recherche} »
- [ ] {sujet} — pourquoi : « {leur blog/produit suggère que c'est important} »
- [ ] {sujet} — pourquoi : « {posé dans N/M avis Glassdoor récents} »
```

Prioriser par fréquence et pertinence pour le rôle. Maximum 10 items.

## Étape 7 — Signaux de l'entreprise

Choses à dire, faire et éviter selon la recherche :

- **Valeurs qu'ils évaluent :** les nommer, citer la source (page carrières, blog, avis Glassdoor)
- **Vocabulaire à utiliser :** termes que l'entreprise utilise en interne — montre que tu as fait tes devoirs (ex : Stripe dit « increase the GDP of the internet », Anthropic dit « safety » pas « alignment »)
- **Choses à éviter :** anti-patterns spécifiques signalés dans les avis d'entretien
- **Questions à leur poser :** 2-3 questions pointues qui démontrent que tu as recherché l'entreprise, liées à des actualités récentes ou des posts de blog découverts à l'Étape 1

## Sortie

Sauvegarder le rapport complet dans `interview-prep/{company-slug}-{role-slug}.md` avec cet en-tête :

```markdown
# Intelligence Entretien : {Entreprise} — {Rôle}

**Rapport :** {lien vers le rapport d'évaluation si existant, ou « N/A »}
**Recherché le :** {AAAA-MM-JJ}
**Sources :** {N} avis Glassdoor, {N} posts Blind, {N} autres
```

## Post-recherche

Après avoir livré le rapport :

1. Demander si tu veux rédiger des histoires pour les lacunes trouvées à l'Étape 5
2. Si tu as une date d'entretien planifiée, la noter : « Ton entretien est dans {X} jours. Veux-tu que je fixe un rappel pour revoir cette préparation ? »
3. Suggérer d'exécuter le mode `deep` si la recherche entreprise de l'Étape 1 était mince — le mode deep couvre la stratégie, la culture et le paysage concurrentiel en plus de profondeur

## Règles

- **JAMAIS inventer de questions d'entretien et les attribuer à des sources.** Les questions inférées doivent être étiquetées `[inféré du JD]`.
- **JAMAIS fabriquer des notes Glassdoor ou des statistiques.** Si les données ne sont pas là, le dire.
- **Tout citer.** Chaque question, chaque statistique, chaque affirmation reçoit une source ou un tag `[inféré]`.
- Générer dans la langue du JD (FR par défaut dans ce mode).
- Être direct. C'est un document de préparation de travail, pas un discours de motivation.
