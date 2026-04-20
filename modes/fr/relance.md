<!-- Traduit depuis santifer/career-ops@411afb3 -->

# Mode : relance — Suivi de cadence des relances

## Objectif

Suivre la cadence de relance des candidatures actives. Signaler les relances en retard, extraire les contacts depuis les notes, et générer des brouillons de relance (email/LinkedIn) adaptés en utilisant le contexte du rapport.

## Entrées

- `data/applications.md` — Tracker de candidatures
- `data/follow-ups.md` — Historique des relances (créé au premier usage)
- `reports/` — Rapports d'évaluation (pour le contexte dans les brouillons)
- `config/profile.yml` — Profil utilisateur (nom, identité)
- `cv.md` — CV pour les preuves concrètes dans les brouillons

## Étape 1 — Exécuter le script de cadence

Exécuter :

```bash
node followup-cadence.mjs
```

Parser la sortie JSON. Elle contient :

| Clé | Contenu |
|-----|---------|
| `metadata` | Date d'analyse, total suivi, nombre actionnable, décomptes overdue/urgent/cold/waiting |
| `entries` | Par candidature : entreprise, rôle, statut, jours depuis la candidature, nombre de relances, urgence, date de prochaine relance, contacts extraits, chemin du rapport |
| `cadenceConfig` | Règles de cadence (applied : 7 jours, responded : 3 jours, interview : 1 jour) |

Si aucune entrée actionnable, dire :
> « Aucune candidature active à relancer. Postule d'abord à quelques rôles avec `/career-ops postuler` et reviens quand elles auront pris de l'âge. »

## Étape 2 — Afficher le tableau de bord

Montrer un tableau de bord de cadence trié par urgence (urgent > overdue > waiting > cold) :

```
Tableau de bord des relances — {date}
{N} candidatures suivies, {N} actionnables

| # | Entreprise | Rôle | Statut | Jours | Relances | Prochaine | Urgence | Contact |
```

Utiliser des indicateurs visuels :
- **URGENT** — répondre dans les 24 heures (l'entreprise a répondu)
- **EN RETARD** — la relance est en retard
- **en attente (X jours)** — en bonne voie, relance planifiée
- **FROID** — 2+ relances envoyées, suggérer de clôturer

## Étape 3 — Générer les brouillons de relance

Pour chaque entrée **en retard** ou **urgente** uniquement :

1. Lire le rapport lié (`reportPath` depuis le JSON) pour le contexte entreprise
2. Lire `cv.md` pour les preuves concrètes
3. Lire `config/profile.yml` pour le nom et l'identité du candidat

### Framework email de relance (première relance, followupCount == 0)

Générer un email de 3-4 phrases :

1. **Phrase 1 :** Référencer le rôle spécifique + quand tu as postulé. Être spécifique — mentionner le nom de l'entreprise et le titre du rôle.
2. **Phrase 2 :** Une valeur ajoutée concrète depuis le match Bloc B du rapport ou une preuve concrète de cv.md. Quantifier si possible.
3. **Phrase 3 :** Demande douce + disponibilité. Proposer un créneau spécifique (« cette semaine » ou « mardi prochain »).
4. **Phrase 4 (optionnelle) :** Brève mention d'un projet ou accomplissement récent pertinent.

**Règles :**
- Professionnel mais chaleureux, PAS désespéré
- **JAMAIS** de « je voulais juste prendre des nouvelles », « je fais suite à », « je reviens vers vous », « je me permets de relancer »
- Commencer par la valeur, pas par la demande
- Référencer quelque chose de spécifique à CETTE entreprise (depuis le rapport Bloc A)
- Maximum 150 mots
- Inclure un objet
- Utiliser le nom du candidat depuis `config/profile.yml`

**Exemple de ton :**
> Objet : Re : Développeur Senior PHP/Laravel — IxDF
>
> Bonjour [nom du contact ou « l'équipe »],
>
> J'ai soumis ma candidature pour le poste de Développeur Senior PHP/Laravel le 7 avril. Je souhaitais partager que mon application Laravel en production (Barbeiro.app — 120 modèles, 315 endpoints API, suite de tests complète) reflète étroitement la culture TDD décrite dans l'annonce.
>
> J'aimerais beaucoup discuter de comment mes 15 ans d'expérience PHP et mon workflow d'outillage IA pourraient contribuer à la plateforme IxDF. Un créneau cette semaine conviendrait-il pour un bref échange ?
>
> Cordialement,
> [Nom]

### Relance LinkedIn (si aucun contact email trouvé)

Réutiliser le framework contact : 3 phrases, 300 caractères max.
- Accroche spécifique à l'entreprise → preuve concrète → demande douce
- Suggérer à l'utilisateur d'exécuter `/career-ops contact {entreprise}` pour trouver la bonne personne d'abord

### Deuxième relance (followupCount == 1)

Plus courte que la première (2-3 phrases). Prendre un **nouvel angle** :
- Partager un insight pertinent, un article, ou une mise à jour de projet
- Ne pas répéter le contenu de la première relance
- Toujours référencer le rôle spécifiquement

### Candidature froide (followupCount >= 2)

Ne PAS générer une autre relance. Suggérer plutôt :
> « Cette candidature a eu {N} relances sans réponse. Considère :
> - Mettre à jour le statut en `Discarded` si le rôle semble pourvu
> - Essayer un autre contact via `/career-ops contact`
> - Garder en statut `Applied` mais déprioriser »

## Étape 4 — Présenter les brouillons

Pour chaque brouillon, afficher :

```
## Relance : {Entreprise} — {Rôle} (#{num})

**À :** {email ou « Pas de contact trouvé — exécute `/career-ops contact` d'abord »}
**Objet :** {ligne d'objet}
**Jours depuis la candidature :** {N}
**Relances envoyées :** {N}
**Canal :** Email / LinkedIn

{texte du brouillon}
```

## Étape 5 — Enregistrer les relances

Après que l'utilisateur a revu et confirmé avoir envoyé une relance, l'enregistrer :

1. Si `data/follow-ups.md` n'existe pas, le créer :
   ```markdown
   # Historique des relances

   | # | Cand# | Date | Entreprise | Rôle | Canal | Contact | Notes |
   |---|-------|------|------------|------|-------|---------|-------|
   ```

2. Ajouter une ligne avec :
   - `#` = prochain numéro séquentiel dans le tableau des relances
   - `Cand#` = numéro de candidature depuis le tracker
   - `Date` = date du jour
   - `Entreprise` = nom de l'entreprise
   - `Rôle` = titre du rôle
   - `Canal` = Email / LinkedIn / Autre
   - `Contact` = à qui c'a été envoyé
   - `Notes` = note brève (ex : « Première relance, référence à Barbeiro.app »)

3. Optionnellement mettre à jour la colonne Notes dans `data/applications.md` avec « Relance {N} envoyée {AAAA-MM-JJ} »

**IMPORTANT :** N'enregistrer que les relances que l'utilisateur confirme avoir effectivement envoyées. Ne jamais enregistrer un brouillon comme envoyé.

## Étape 6 — Résumé

Après avoir montré tous les brouillons, résumer :

> **Tableau de bord des relances** ({date})
> - {N} candidatures suivies
> - {N} en retard — brouillons générés ci-dessus
> - {N} urgentes — répondre aujourd'hui
> - {N} en attente — dates de prochaine relance affichées
> - {N} froides — envisager de clôturer
>
> Revois les brouillons ci-dessus et dis-moi lesquels tu as envoyés pour que je les enregistre.

## Référence des règles de cadence

| Statut | Première relance | Suivantes | Max tentatives |
|--------|-----------------|-----------|----------------|
| Applied | 7 jours après la candidature | Tous les 7 jours | 2 (puis marquer froid) |
| Responded | 1 jour (réponse urgente) | Tous les 3 jours | Pas de limite |
| Interview | 1 jour après (remerciement) | Tous les 3 jours | Pas de limite |

Ces valeurs par défaut peuvent être remplacées via `node followup-cadence.mjs --applied-days N`.
