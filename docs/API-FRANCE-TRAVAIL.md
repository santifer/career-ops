# Guide : API France Travail — Offres d'emploi v2

<!-- Traduit depuis santifer/career-ops@411afb3 -->

Ce guide t'explique comment créer un compte développeur France Travail et configurer tes clés API pour career-ops-fr.

## Pourquoi cette API ?

France Travail (ex-Pôle emploi) met à disposition une API gratuite donnant accès à ~900 000 offres d'emploi. C'est le portail tier 1 de career-ops-fr : aucun scraping, aucun anti-bot, couverture massive du marché français.

## Étape 1 — Créer ton compte développeur

1. Va sur [francetravail.io](https://francetravail.io)
2. Clique sur **« Se connecter »** en haut à droite
3. Crée un compte avec ton adresse email
4. Confirme ton email (lien dans le mail reçu)

## Étape 2 — Créer une application

1. Une fois connecté, va dans **Mon espace → Mes applications**
2. Clique sur **« Créer une application »**
3. Remplis les champs :
   - **Nom** : `career-ops-fr`
   - **Description** : `Pipeline local d'évaluation d'offres d'emploi`
   - **URL de redirection** : `http://localhost` (on n'utilise pas le flow redirect)

## Étape 3 — S'abonner aux APIs

1. Dans la page de ton application, clique sur **« Ajouter une API »**
2. Cherche et souscris à :
   - **Offres d'emploi v2** (obligatoire)
   - **ROME 4.0** (optionnel mais recommandé pour les codes métiers)
3. Les abonnements sont activés instantanément

## Étape 4 — Récupérer tes identifiants

1. Dans la page de ton application, tu trouveras :
   - **Client ID** (identifiant)
   - **Client Secret** (clé secrète)
2. **Ne partage jamais** le Client Secret

## Étape 5 — Configurer career-ops-fr

1. Copie le fichier `.env.example` :
   ```bash
   cp .env.example .env
   ```

2. Ouvre `.env` et remplis :
   ```
   FRANCE_TRAVAIL_CLIENT_ID=ton_client_id_ici
   FRANCE_TRAVAIL_CLIENT_SECRET=ton_client_secret_ici
   FRANCE_TRAVAIL_SCOPE=api_offresdemploiv2 o2dsoffre
   ```

3. Teste la connexion :
   ```bash
   node scripts/test-api-francetravail.mjs
   ```

   Tu devrais voir :
   ```
   🔍 Recherche France Travail : "développeur" dans le département 75

   ✅ 15 offre(s) trouvée(s)
   ```

## Dépannage

### Erreur 401 (Unauthorized)
- Vérifie que le `client_id` et le `client_secret` sont corrects
- Vérifie qu'il n'y a pas d'espaces en trop dans le fichier `.env`
- Vérifie que tu as bien souscrit à l'API « Offres d'emploi v2 »

### Erreur 429 (Too Many Requests)
- L'API a un rate limit. Attends quelques minutes et réessaie
- career-ops-fr respecte automatiquement le rate limit en usage normal

### Aucun résultat
- Essaie des mots-clés plus génériques : `node scripts/test-api-francetravail.mjs "informatique" 75`
- Vérifie le code département (75 = Paris, 69 = Rhône, 31 = Haute-Garonne)

## Endpoints utilisés

| Endpoint | Usage |
|----------|-------|
| `POST /connexion/oauth2/access_token` | Obtenir un token OAuth2 |
| `GET /offresdemploi/v2/offres/search` | Rechercher des offres |
| `GET /offresdemploi/v2/offres/{id}` | Détail d'une offre |

## Limites du plan gratuit

- Authentification par `client_credentials` (pas de flow utilisateur)
- Rate limit raisonnable (non documenté précisément, ~100 req/min en pratique)
- Token valide ~1 500 secondes (25 minutes)
- Aucune limite de volume journalier documentée

## Ressources

- [Documentation API France Travail](https://francetravail.io/data/api/offres-emploi)
- [Référentiel ROME 4.0](https://francetravail.io/data/api/rome)
- [Portail développeurs](https://francetravail.io)
