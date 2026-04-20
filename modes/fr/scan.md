<!-- Traduit depuis santifer/career-ops@411afb3 -->

# Mode : scan — Scanner de portails (découverte d'offres)

Scanne les portails d'emploi configurés, filtre par pertinence du titre, et ajoute les nouvelles offres au pipeline pour évaluation ultérieure.

> **Note (v1.5+) :** Le scanner par défaut (`scan.mjs` / `npm run scan`) est **zero-token** et ne consulte directement que les APIs publiques de Greenhouse, Ashby et Lever. Les niveaux avec Playwright/WebSearch décrits ci-dessous sont le flux **agent** (exécuté par Claude/Codex), pas ce que fait `scan.mjs`. Si une entreprise n'a pas d'API Greenhouse/Ashby/Lever, `scan.mjs` l'ignorera ; pour ces cas, l'agent doit compléter manuellement le Niveau 1 (Playwright) ou Niveau 3 (WebSearch).

## Exécution recommandée

Exécuter comme sous-agent pour ne pas consommer le contexte du main :

```
Agent(
    subagent_type="general-purpose",
    prompt="[contenu de ce fichier + données spécifiques]",
    run_in_background=True
)
```

## Configuration

Lire `portals.yml` qui contient :
- `search_queries` : liste de queries WebSearch avec filtres `site:` par portail (découverte large)
- `tracked_companies` : entreprises spécifiques avec `careers_url` pour navigation directe
- `title_filter` : keywords positive/negative/seniority_boost pour filtrage des titres

## Stratégie de découverte (3 niveaux)

### Niveau 1 — Playwright direct (PRINCIPAL)

**Pour chaque entreprise dans `tracked_companies` :** Naviguer vers sa `careers_url` avec Playwright (`browser_navigate` + `browser_snapshot`), lire TOUS les job listings visibles, et extraire titre + URL de chacun. C'est la méthode la plus fiable car :
- Elle voit la page en temps réel (pas de résultats cachés de Google)
- Elle fonctionne avec les SPA (Ashby, Lever, Workday)
- Elle détecte les nouvelles offres instantanément
- Elle ne dépend pas de l'indexation Google

**Chaque entreprise DOIT avoir `careers_url` dans portals.yml.** Si elle ne l'a pas, la chercher une fois, la sauvegarder, et l'utiliser pour les prochains scans.

### Niveau 2 — APIs ATS / Feeds (COMPLÉMENTAIRE)

Pour les entreprises avec API publique ou feed structuré, utiliser la réponse JSON/XML comme complément rapide du Niveau 1. C'est plus rapide que Playwright et réduit les erreurs de scraping visuel.

**Support actuel (variables entre `{}`) :**
- **Greenhouse** : `https://boards-api.greenhouse.io/v1/boards/{company}/jobs`
- **Ashby** : `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR** : liste `https://{company}.bamboohr.com/careers/list` ; détail d'une offre `https://{company}.bamboohr.com/careers/{id}/detail`
- **Lever** : `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor** : `https://{company}.teamtailor.com/jobs.rss`
- **Workday** : `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**Convention de parsing par provider :**
- `greenhouse` : `jobs[]` → `title`, `absolute_url`
- `ashby` : GraphQL `ApiJobBoardWithTeams` avec `organizationHostedJobsPageName={company}` → `jobBoard.jobPostings[]` (`title`, `id` ; construire l'URL publique si absente du payload)
- `bamboohr` : liste `result[]` → `jobOpeningName`, `id` ; construire l'URL de détail `https://{company}.bamboohr.com/careers/{id}/detail` ; pour lire le JD complet, faire GET du détail et utiliser `result.jobOpening` (`jobOpeningName`, `description`, `datePosted`, `minimumExperience`, `compensation`, `jobOpeningShareUrl`)
- `lever` : array racine `[]` → `text`, `hostedUrl` (fallback : `applyUrl`)
- `teamtailor` : RSS items → `title`, `link`
- `workday` : `jobPostings[]`/`jobPostings` (selon tenant) → `title`, `externalPath` ou URL construite depuis le host

### Niveau 3 — Requêtes WebSearch (DÉCOUVERTE LARGE)

Les `search_queries` avec filtres `site:` couvrent les portails de manière transversale (tous les Ashby, tous les Greenhouse, etc.). Utile pour découvrir des entreprises NOUVELLES qui ne sont pas encore dans `tracked_companies`, mais les résultats peuvent être obsolètes.

**Priorité d'exécution :**
1. Niveau 1 : Playwright → toutes les `tracked_companies` avec `careers_url`
2. Niveau 2 : API → toutes les `tracked_companies` avec `api:`
3. Niveau 3 : WebSearch → tous les `search_queries` avec `enabled: true`

Les niveaux sont additifs — on les exécute tous, les résultats sont mélangés et dédupliqués.

## Workflow

1. **Lire la configuration** : `portals.yml`
2. **Lire l'historique** : `data/scan-history.tsv` → URLs déjà vues
3. **Lire les sources de dédup** : `data/applications.md` + `data/pipeline.md`

4. **Niveau 1 — Scan Playwright** (parallèle en batches de 3-5) :
   Pour chaque entreprise dans `tracked_companies` avec `enabled: true` et `careers_url` définie :
   a. `browser_navigate` vers la `careers_url`
   b. `browser_snapshot` pour lire tous les job listings
   c. Si la page a des filtres/départements, naviguer les sections pertinentes
   d. Pour chaque job listing extraire : `{title, url, company}`
   e. Si la page pagine les résultats, naviguer les pages supplémentaires
   f. Accumuler dans la liste de candidats
   g. Si `careers_url` échoue (404, redirect), essayer `scan_query` en fallback et noter pour mise à jour de l'URL

5. **Niveau 2 — APIs ATS / feeds** (parallèle) :
   Pour chaque entreprise dans `tracked_companies` avec `api:` définie et `enabled: true` :
   a. WebFetch de l'URL de l'API/feed
   b. Si `api_provider` est défini, utiliser son parser ; sinon, inférer par domaine (`boards-api.greenhouse.io`, `jobs.ashbyhq.com`, `api.lever.co`, `*.bamboohr.com`, `*.teamtailor.com`, `*.myworkdayjobs.com`)
   c. Pour **Ashby**, envoyer POST avec :
      - `operationName: ApiJobBoardWithTeams`
      - `variables.organizationHostedJobsPageName: {company}`
      - query GraphQL de `jobBoardWithTeams` + `jobPostings { id title locationName employmentType compensationTierSummary }`
   d. Pour **BambooHR**, la liste ne ramène que les métadonnées de base. Pour chaque item pertinent, lire `id`, faire GET vers `https://{company}.bamboohr.com/careers/{id}/detail`, et extraire le JD complet depuis `result.jobOpening`. Utiliser `jobOpeningShareUrl` comme URL publique si présente ; sinon, utiliser l'URL de détail.
   e. Pour **Workday**, envoyer POST JSON avec au minimum `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}` et paginer par `offset` jusqu'à épuisement des résultats
   f. Pour chaque job extraire et normaliser : `{title, url, company}`
   g. Accumuler dans la liste de candidats (dédup avec Niveau 1)

6. **Niveau 3 — Requêtes WebSearch** (parallèle si possible) :
   Pour chaque query dans `search_queries` avec `enabled: true` :
   a. Exécuter WebSearch avec le `query` défini
   b. De chaque résultat extraire : `{title, url, company}`
      - **title** : du titre du résultat (avant le « @ » ou « | »)
      - **url** : URL du résultat
      - **company** : après le « @ » dans le titre, ou extraire du domaine/path
   c. Accumuler dans la liste de candidats (dédup avec Niveau 1+2)

6. **Filtrer par titre** en utilisant `title_filter` de `portals.yml` :
   - Au moins 1 keyword de `positive` doit apparaître dans le titre (case-insensitive)
   - 0 keywords de `negative` ne doivent apparaître
   - Les keywords `seniority_boost` donnent la priorité mais ne sont pas obligatoires

7. **Dédupliquer** contre 3 sources :
   - `scan-history.tsv` → URL exacte déjà vue
   - `applications.md` → entreprise + rôle normalisé déjà évalué
   - `pipeline.md` → URL exacte déjà en attente ou traitée

7.5. **Vérifier la vivacité des résultats WebSearch (Niveau 3)** — AVANT d'ajouter au pipeline :

   Les résultats de WebSearch peuvent être obsolètes (Google cache les résultats pendant des semaines ou des mois). Pour éviter d'évaluer des offres expirées, vérifier avec Playwright chaque nouvelle URL provenant du Niveau 3. Les Niveaux 1 et 2 sont intrinsèquement en temps réel et ne nécessitent pas cette vérification.

   Pour chaque nouvelle URL de Niveau 3 (séquentiel — JAMAIS Playwright en parallèle) :
   a. `browser_navigate` vers l'URL
   b. `browser_snapshot` pour lire le contenu
   c. Classifier :
      - **Active** : titre du poste visible + description du rôle + contrôle visible Apply/Submit/Postuler dans le contenu principal. Ne pas compter le texte générique de header/navbar/footer.
      - **Expirée** (n'importe laquelle de ces signaux) :
        - URL finale contient `?error=true` (Greenhouse redirige ainsi quand l'offre est fermée)
        - La page contient : « job no longer available » / « no longer open » / « position has been filled » / « this job has expired » / « page not found »
        - Seulement navbar et footer visibles, sans contenu JD (contenu < ~300 chars)
   d. Si expirée : enregistrer dans `scan-history.tsv` avec statut `skipped_expired` et écarter
   e. Si active : continuer à l'étape 8

   **Ne pas interrompre le scan entier si une URL échoue.** Si `browser_navigate` renvoie une erreur (timeout, 403, etc.), marquer comme `skipped_expired` et continuer avec la suivante.

8. **Pour chaque offre nouvelle vérifiée qui passe les filtres** :
   a. Ajouter à `pipeline.md` section « Pendientes » : `- [ ] {url} | {company} | {title}`
   b. Enregistrer dans `scan-history.tsv` : `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`

9. **Offres filtrées par titre** : enregistrer dans `scan-history.tsv` avec statut `skipped_title`
10. **Offres dupliquées** : enregistrer avec statut `skipped_dup`
11. **Offres expirées (Niveau 3)** : enregistrer avec statut `skipped_expired`

## Extraction de titre et entreprise des résultats WebSearch

Les résultats de WebSearch arrivent au format : `"Job Title @ Company"` ou `"Job Title | Company"` ou `"Job Title — Company"`.

Patrons d'extraction par portail :
- **Ashby** : `"Senior AI PM (Remote) @ EverAI"` → title : `Senior AI PM`, company : `EverAI`
- **Greenhouse** : `"AI Engineer at Anthropic"` → title : `AI Engineer`, company : `Anthropic`
- **Lever** : `"Product Manager - AI @ Temporal"` → title : `Product Manager - AI`, company : `Temporal`

Regex générique : `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`

## URLs privées

Si tu trouves une URL non accessible publiquement :
1. Sauvegarder le JD dans `jds/{company}-{role-slug}.md`
2. Ajouter à pipeline.md comme : `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title}`

## Historique de scan

`data/scan-history.tsv` tracke TOUTES les URLs vues :

```
url	first_seen	portal	title	company	status
https://...	2026-02-10	Ashby — AI PM	PM AI	Acme	added
https://...	2026-02-10	Greenhouse — SA	Junior Dev	BigCo	skipped_title
https://...	2026-02-10	Ashby — AI PM	SA AI	OldCo	skipped_dup
https://...	2026-02-10	WebSearch — AI PM	PM AI	ClosedCo	skipped_expired
```

## Résumé de sortie

```
Scan Portails — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries exécutés : N
Offres trouvées : N total
Filtrées par titre : N pertinentes
Dupliquées : N (déjà évaluées ou en pipeline)
Expirées écartées : N (liens morts, Niveau 3)
Nouvelles ajoutées à pipeline.md : N

  + {company} | {title} | {query_name}
  ...

→ Exécute /career-ops pipeline pour évaluer les nouvelles offres.
```

## Gestion de careers_url

Chaque entreprise dans `tracked_companies` doit avoir `careers_url` — l'URL directe vers sa page d'offres. Cela évite de la chercher à chaque fois.

**RÈGLE : Utilise toujours l'URL corporative de l'entreprise ; ne recours à l'endpoint ATS qu'en l'absence de page corporative propre.**

Le `careers_url` doit pointer vers la page emploi propre de l'entreprise chaque fois qu'elle est disponible. Beaucoup d'entreprises utilisent Workday, Greenhouse ou Lever en arrière-plan, mais n'exposent les IDs des postes qu'à travers leur domaine corporatif. Utiliser l'URL ATS directe quand une page corporative existe peut causer de faux erreurs 410 car les IDs des postes ne correspondent pas.

| Correct (corporative) | Incorrect comme premier choix (ATS direct) |
|---|---|
| `https://careers.mastercard.com` | `https://mastercard.wd1.myworkdayjobs.com` |
| `https://openai.com/careers` | `https://job-boards.greenhouse.io/openai` |
| `https://stripe.com/jobs` | `https://jobs.lever.co/stripe` |

Fallback : si tu n'as que l'URL ATS directe, navigue d'abord vers le site web de l'entreprise et localise sa page emploi corporative. N'utilise l'URL ATS directe que si l'entreprise n'a pas de page corporative propre.

**Patrons connus par plateforme :**
- **Ashby :** `https://jobs.ashbyhq.com/{slug}`
- **Greenhouse :** `https://job-boards.greenhouse.io/{slug}` ou `https://job-boards.eu.greenhouse.io/{slug}`
- **Lever :** `https://jobs.lever.co/{slug}`
- **BambooHR :** liste `https://{company}.bamboohr.com/careers/list` ; détail `https://{company}.bamboohr.com/careers/{id}/detail`
- **Teamtailor :** `https://{company}.teamtailor.com/jobs`
- **Workday :** `https://{company}.{shard}.myworkdayjobs.com/{site}`
- **Custom :** L'URL propre de l'entreprise (ex : `https://openai.com/careers`)

**Patrons d'API/feed par plateforme :**
- **Ashby API :** `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **BambooHR API :** liste `https://{company}.bamboohr.com/careers/list` ; détail `https://{company}.bamboohr.com/careers/{id}/detail` (`result.jobOpening`)
- **Lever API :** `https://api.lever.co/v0/postings/{company}?mode=json`
- **Teamtailor RSS :** `https://{company}.teamtailor.com/jobs.rss`
- **Workday API :** `https://{company}.{shard}.myworkdayjobs.com/wday/cxs/{company}/{site}/jobs`

**Si `careers_url` n'existe pas** pour une entreprise :
1. Essayer le patron de sa plateforme connue
2. Si échec, faire un WebSearch rapide : `"{company}" careers jobs`
3. Naviguer avec Playwright pour confirmer que ça fonctionne
4. **Sauvegarder l'URL trouvée dans portals.yml** pour les prochains scans

**Si `careers_url` renvoie 404 ou redirect :**
1. Noter dans le résumé de sortie
2. Essayer scan_query comme fallback
3. Marquer pour mise à jour manuelle

## Maintenance du portals.yml

- **TOUJOURS sauvegarder `careers_url`** quand on ajoute une nouvelle entreprise
- Ajouter de nouveaux queries selon les portails ou rôles intéressants découverts
- Désactiver des queries avec `enabled: false` s'ils génèrent trop de bruit
- Ajuster les keywords de filtrage selon l'évolution des rôles cibles
- Ajouter des entreprises à `tracked_companies` quand tu veux les suivre de près
- Vérifier `careers_url` périodiquement — les entreprises changent de plateforme ATS
