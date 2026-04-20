/**
 * Adapter France Travail — API Offres d'emploi v2
 *
 * OAuth2 client_credentials flow.
 * Documentation : https://francetravail.io/data/api/offres-emploi
 */
import 'dotenv/config';

const TOKEN_URL = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire';
const API_BASE = 'https://api.francetravail.io/partenaire/offresdemploi/v2';
const SCOPE = process.env.FRANCE_TRAVAIL_SCOPE || 'api_offresdemploiv2 o2dsoffre';

let tokenCache = { accessToken: null, expiresAt: 0 };

/**
 * Obtenir un token OAuth2 (client_credentials).
 * Le token est mis en cache et rafraîchi 100s avant expiration.
 */
async function getToken() {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 100_000) {
    return tokenCache.accessToken;
  }

  const clientId = process.env.FRANCE_TRAVAIL_CLIENT_ID;
  const clientSecret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Variables FRANCE_TRAVAIL_CLIENT_ID et FRANCE_TRAVAIL_CLIENT_SECRET manquantes dans .env.\n' +
      'Voir docs/API-FRANCE-TRAVAIL.md pour créer ton compte.'
    );
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: SCOPE,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Échec d'authentification France Travail (${res.status}) : ${text}`);
  }

  const data = await res.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in || 1500) * 1000,
  };

  return tokenCache.accessToken;
}

/**
 * Appel authentifié à l'API France Travail.
 * Retry 1x en cas de 401 (token expiré).
 */
async function apiCall(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  let token = await getToken();
  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Retry 1x si 401 (token expiré)
  if (res.status === 401) {
    tokenCache = { accessToken: null, expiresAt: 0 };
    token = await getToken();
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  if (res.status === 429) {
    throw new Error('Rate limit France Travail atteint. Attends quelques minutes.');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erreur API France Travail (${res.status}) sur ${path} : ${text}`);
  }

  return res.json();
}

/**
 * Rechercher des offres d'emploi.
 *
 * @param {Object} criteria
 * @param {string} [criteria.motsCles] - Mots-clés de recherche
 * @param {string} [criteria.departement] - Code département (ex: '75', '69')
 * @param {string} [criteria.commune] - Code commune INSEE
 * @param {string} [criteria.codeROME] - Code ROME du métier
 * @param {string} [criteria.typeContrat] - CDI, CDD, MIS, etc.
 * @param {number} [criteria.range] - Plage de résultats (ex: '0-14' pour les 15 premiers)
 * @returns {Promise<Array>} Liste d'offres
 */
async function search(criteria = {}) {
  const params = {};

  if (criteria.motsCles) params.motsCles = criteria.motsCles;
  if (criteria.departement) params.departement = criteria.departement;
  if (criteria.commune) params.commune = criteria.commune;
  if (criteria.codeROME) params.codeROME = criteria.codeROME;
  if (criteria.typeContrat) params.typeContrat = criteria.typeContrat;
  params.range = criteria.range || '0-14';

  const data = await apiCall('/offres/search', params);
  return data.resultats || [];
}

/**
 * Récupérer le détail complet d'une offre par son identifiant.
 *
 * @param {string} id - Identifiant de l'offre France Travail
 * @returns {Promise<Object>} Détail complet de l'offre
 */
async function getById(id) {
  return apiCall(`/offres/${id}`);
}

/**
 * Normaliser une offre France Travail vers le format JD markdown
 * attendu par le pipeline career-ops.
 *
 * @param {Object} offre - Offre brute de l'API France Travail
 * @returns {string} JD formatée en markdown
 */
function normalizeToJD(offre) {
  const lines = [];

  lines.push(`# ${offre.intitule || 'Poste non spécifié'}`);
  lines.push('');

  // Métadonnées
  if (offre.entreprise?.nom) {
    lines.push(`**Entreprise :** ${offre.entreprise.nom}`);
  }
  if (offre.lieuTravail?.libelle) {
    lines.push(`**Localisation :** ${offre.lieuTravail.libelle}`);
  }
  if (offre.typeContrat) {
    lines.push(`**Contrat :** ${offre.typeContratLibelle || offre.typeContrat}`);
  }
  if (offre.salaire?.libelle) {
    lines.push(`**Salaire :** ${offre.salaire.libelle}`);
  }
  if (offre.experienceExige) {
    const expMap = { 'D': 'Débutant accepté', 'S': 'Expérience souhaitée', 'E': 'Expérience exigée' };
    lines.push(`**Expérience :** ${expMap[offre.experienceExige] || offre.experienceExige}`);
  }
  if (offre.dureeTravailLibelle) {
    lines.push(`**Durée :** ${offre.dureeTravailLibelle}`);
  }
  if (offre.dateCreation) {
    lines.push(`**Publiée le :** ${offre.dateCreation.split('T')[0]}`);
  }

  lines.push('');

  // Description
  if (offre.description) {
    lines.push('## Description du poste');
    lines.push('');
    lines.push(offre.description);
    lines.push('');
  }

  // Compétences
  if (offre.competences?.length > 0) {
    lines.push('## Compétences demandées');
    lines.push('');
    for (const comp of offre.competences) {
      const exigence = comp.exigence === 'E' ? '(exigée)' : comp.exigence === 'S' ? '(souhaitée)' : '';
      lines.push(`- ${comp.libelle} ${exigence}`.trim());
    }
    lines.push('');
  }

  // Formations
  if (offre.formations?.length > 0) {
    lines.push('## Formation');
    lines.push('');
    for (const form of offre.formations) {
      const exigence = form.exigence === 'E' ? '(exigée)' : '(souhaitée)';
      lines.push(`- ${form.domaineLibelle || form.niveauLibelle || 'Formation'} ${exigence}`);
    }
    lines.push('');
  }

  // Qualités professionnelles
  if (offre.qualitesProfessionnelles?.length > 0) {
    lines.push('## Qualités professionnelles');
    lines.push('');
    for (const qp of offre.qualitesProfessionnelles) {
      lines.push(`- **${qp.libelle}** : ${qp.description || ''}`);
    }
    lines.push('');
  }

  // Avantages
  const avantages = [];
  if (offre.complementExercice) avantages.push(offre.complementExercice);
  if (offre.conditionExercice) avantages.push(offre.conditionExercice);
  if (avantages.length > 0) {
    lines.push('## Conditions de travail');
    lines.push('');
    lines.push(avantages.join('\n'));
    lines.push('');
  }

  // Source
  lines.push('---');
  lines.push(`*Source : France Travail — ID ${offre.id}*`);
  if (offre.origineOffre?.urlOrigine) {
    lines.push(`*URL originale : ${offre.origineOffre.urlOrigine}*`);
  }

  return lines.join('\n');
}

export const franceTravail = { search, getById, normalizeToJD };
