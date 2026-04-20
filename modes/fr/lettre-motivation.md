# Mode : lettre-motivation — Génération de lettre de motivation personnalisée

Quand le candidat demande une lettre de motivation après une évaluation, ce mode génère une lettre moderne, personnalisée et percutante en 3 paragraphes.

## Prérequis

- Un rapport d'évaluation existant dans `reports/` pour l'offre visée
- `cv.md` à jour dans la racine du projet
- `config/profile.yml` rempli (narratif de transition, compétences clés)

## Workflow

```
1. CHARGER    → Lire le rapport d'évaluation + cv.md + profile.yml
2. DÉTECTER   → Identifier l'archétype et les proof points clés
3. RÉDIGER    → Générer la lettre en 3 paragraphes
4. VÉRIFIER   → Contrôle qualité (ton, longueur, spécificité)
5. LIVRER     → Afficher la lettre + proposer export PDF
```

## Étape 1 — Charger le contexte

1. Identifier le rapport le plus récent pour l'entreprise/le rôle demandé
2. Lire `cv.md` et `article-digest.md` (si existant) pour les proof points
3. Lire `config/profile.yml` pour le narratif de transition et les cibles

## Étape 2 — Détecter l'archétype et les forces

Depuis le rapport d'évaluation :
- Archétype détecté (Bloc A)
- Points de match forts (Bloc B — lignes vertes)
- Lacunes à mitiger (Bloc B — gaps)
- Rémunération et positionnement (Bloc D)
- Stories STAR pertinentes (Bloc F)

## Étape 3 — Rédiger la lettre

### Structure obligatoire : 3 paragraphes

**Paragraphe 1 — Accroche (3-4 phrases)**
- Nommer le poste exact et l'entreprise
- Citer un élément spécifique de l'offre qui résonne avec le parcours du candidat
- Établir le lien immédiat entre le besoin de l'entreprise et ce que le candidat apporte
- Ton : direct, confiant, pas suppliant

**Paragraphe 2 — Expérience alignée (5-7 phrases)**
- Mapper 2-3 proof points concrets du CV sur les exigences clés de l'offre
- Utiliser des chiffres et résultats mesurables (depuis `cv.md` et `article-digest.md`)
- Si lacune identifiée dans le Bloc B : mitiger naturellement (expérience adjacente, apprentissage rapide démontré)
- Adapter le framing à l'archétype (voir `_shared.md`)

**Paragraphe 3 — Appel à l'action (2-3 phrases)**
- Exprimer l'enthousiasme pour le projet spécifique de l'entreprise
- Proposer un échange concret (appel, entretien, démo)
- Clôture professionnelle mais chaleureuse

### Signature

```
Cordialement,

[Prénom Nom depuis profile.yml]
[Email depuis profile.yml]
[Téléphone depuis profile.yml — seulement si explicitement autorisé]
```

## Règles de rédaction — NON NÉGOCIABLES

### INTERDIT
- « Je me permets de vous écrire… »
- « Suite à votre annonce parue sur… »
- « Madame, Monsieur, » (sauf si le genre du destinataire est inconnu ET le ton est formel)
- « Veuillez agréer l'expression de mes salutations distinguées »
- Phrases de plus de 25 mots
- Adjectifs creux sans preuve (« dynamique », « motivé », « passionné »)
- Copier-coller du CV en prose
- Mentionner des compétences non présentes dans `cv.md`

### OBLIGATOIRE
- Tutoiement si l'offre tutoie, vouvoiement sinon (détecter depuis le texte de l'offre)
- Citer au moins 1 phrase exacte de l'offre entre guillemets
- Au moins 1 chiffre concret (métrique, résultat, taille d'équipe)
- Maximum 350 mots (idéal : 250-300)
- Langue de l'offre (français si offre en français, anglais si offre en anglais)
- Ton « Je vous choisis » (pas « Choisissez-moi »)

## Étape 4 — Contrôle qualité

Avant de livrer, vérifier :

| Critère | Check |
|---------|-------|
| Longueur | ≤ 350 mots |
| Spécificité | ≥ 1 citation de l'offre, ≥ 1 chiffre concret |
| Ton | Direct, confiant, pas suppliant, pas corporate |
| Cohérence | Aligné avec le rapport d'évaluation |
| Accents | Tous les accents français corrects |
| Formules datées | Aucune formule de grand-père |

## Étape 5 — Livrer

Afficher la lettre formatée en markdown, puis proposer :

```
Lettre générée (XXX mots) | Archétype : [type] | Score offre : X.X/5

Options :
  [P] Générer un PDF dans le même design que le CV
  [E] Éditer — dis-moi ce que tu veux changer
  [C] Copier — prête à coller dans le formulaire
```

### Export PDF (si demandé)

Utiliser le même template HTML que le CV (`templates/cv-template.html`) pour maintenir la cohérence visuelle. La lettre de motivation doit donner l'impression de faire partie du même « dossier de candidature ».

## Exemples de tons par archétype

**Dev fullstack PME :**
> « Votre recherche d'un développeur fullstack capable de porter seul un projet de la conception au déploiement correspond exactement à ce que je fais depuis 4 ans chez [Entreprise] — où j'ai migré un monolithe PHP vers une architecture micro-services qui sert aujourd'hui 12 000 utilisateurs quotidiens. »

**Commercial B2B :**
> « Quand vous décrivez un cycle de vente de 6 à 12 mois sur des comptes grands groupes, vous décrivez mon quotidien des 3 dernières années : 2,4 M€ de CA signé en 2025 sur un portefeuille de 15 comptes stratégiques dans l'industrie. »

**Alternance / Stage :**
> « En deuxième année de BUT Informatique, j'ai déjà développé 3 projets en équipe utilisant React et Node.js — dont un chatbot interne qui a réduit de 30 % les questions répétitives adressées au service RH de mon IUT. »
