# Analyse — Alimentation de portals.yml

**Date :** 2026-07-16

---

## Question

> Comment est alimente actuellement le fichier `portals.yml` ? Y a-t-il une automatisation dans le projet, ou est-il fait manuellement ?

## Reponse

**Aucune automatisation.** `portals.yml` est integraement gere manuellement. Il n'existe aucun scraper, crawler, ou processus automatique qui decouvre et ajoute des entreprises.

---

## Methodes de gestion existantes

### 1. Copie du template (initiale)

```bash
cp templates/portals.example.yml config/portals.yml
```

Le template contient ~100 entreprises AI/tech preselectionnees par l'auteur original (santifer) pour son propre secteur (AI Engineer / Head of Applied AI).

Localisation : `config/portals.yml` (lu par le scanner) vs `portals.yml` racine (non utilise par le scanner, copie de commodite).

### 2. Edition manuelle du YAML

L'utilisateur ajoute/supprime/modifie des entreprises dans le fichier YAML directement. C'est la methode principale.

Structure d'une entree :
```yaml
tracked_companies:
  - name: Entreprise
    careers_url: https://...
    api: https://boards-api.greenhouse.io/...   # optionnel
    enabled: true
```

### 3. Django Admin Web (backend/)

L'application Django dispose d'une interface d'administration et d'une API REST pour gerer les portails :

| Fonction | Endpoint / Action |
|----------|-------------------|
| Import YAML → DB | `import_yaml_to_db()` — via admin action |
| Export DB → YAML | `export_db_to_yaml()` — via admin action |
| CRUD entreprises | `GET/POST /api/portals` — lit/ecrit `portals.yml` |
| Validation slugs | `POST /api/portals/verify` — verifie les slugs ATS |

**Sync bidirectionnelle :** la DB Django et le YAML sont maintenus en synchronisation. La DB est la source de verite pour le web, le YAML pour le scanner CLI. Le YAML gagne en cas de conflit.

Code : `backend/apps/portals/services.py:48` (`import_yaml_to_db`), `:215` (`export_db_to_yaml`)

### 4. LLM Extraction (semi-automatique)

`POST /api/skills/llm/extract-portal`

Extrait une entree entreprise (nom, careers_url, API) depuis un texte libre via LLM. Retourne une entree YAML prete a inserer.

Code : `backend/apps/skills_portfolio/services/extraction.py:686` (`extract_portal_from_text`), `backend/apps/skills_portfolio/views.py:727`

### 5. Discovery Bridge (semi-automatique)

`apply_discovery_to_portals()` — merge les mots-cles decouverts par l'analyse de competences dans `title_filter.positive` du `portals.yml`. Ne fait que completer les mots-cles, pas ajouter des entreprises.

Code : `backend/apps/skills_portfolio/services/integration.py:180`

---

## Ce qui N'EXISTE PAS

| Fonctionnalite | Statut |
|---------------|--------|
| Scraper automatique d'entreprises | ❌ Inexistant |
| Decouverte de nouvelles entreprises par secteur | ❌ Inexistant |
| Enrichissement automatique depuis APEC/Indeed/LinkedIn | ❌ Inexistant |
| Import depuis un CSV/liste d'entreprises | ❌ Inexistant |
| Detection automatique de l'ATS d'une entreprise | ❌ Inexistant (le scanner auto-detecte Greenhouse/Lever/Ashby/Workday a partir de l'URL, mais il faut fournir l'URL) |
| Suggestions d'entreprises basees sur le profil | ❌ Inexistant |
| WebSearch provider operationnel | ❌ Non implemente (`scan_method: websearch` declare mais aucun provider integre) |

---

## Flux de donnees actuel

```
templates/portals.example.yml  (template AI/tech ~100 entreprises)
        │
        │ cp (manuel)
        ▼
config/portals.yml  (fichier de travail, modifie manuellement)
        │
        ├──► scanner/scan.py  (lit le YAML, scanne les APIs)
        │
        ├──► import_yaml_to_db()  (sync vers Django DB)
        │         │
        │         ▼
        │    Django Admin / API  (gestion web)
        │         │
        │         ▼
        │    export_db_to_yaml()  (sync vers YAML)
        │
        ├──► apply_discovery_to_portals()  (merge mots-cles uniquement)
        │
        └──► POST /api/skills/llm/extract-portal  (extraction LLM d'une entree)
```

## Implications pour le secteur biomedical

1. **Le template est inadapte** — 100% AI/tech, 0% pharma/DM
2. **Pas d'automatisation** — impossible d'appuyer sur un bouton pour remplacer le secteur
3. **Ajout manuel couteux** — 46 entreprises a ajouter a la main, puis verifier chaque ATS
4. **La plupart des boites pharma/DM n'utilisent pas Greenhouse/Lever** — meme avec les bonnes URLs, le scanner ne les trouvera pas
5. **Workday est supporte** — mais `scan_ats_full` n'a trouve aucune offre biomedicale sur 28K+ entreprises

## Recommandation

Pour changer de secteur :
1. Sauvegarder l'existant : `cp config/portals.yml config/portals.yml.backup`
2. Creer un nouveau `portals.yml` cible (voir `docs/guides/portals-customization.md`)
3. Ajouter les entreprises une par une avec leur `careers_url`
4. Verifier les slugs ATS : `npm run verify:portals`
5. Tester en dry-run : `npm run scan -- --dry-run`

Pour le biomedical specifiquement, la recommandation est de ne **pas** utiliser le scanner automatique, mais d'alimenter `pipeline.md` manuellement (voir `docs/guides/biomedical-diagnostic.md`).
