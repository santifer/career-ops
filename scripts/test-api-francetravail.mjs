#!/usr/bin/env node
/**
 * Script de test manuel pour l'API France Travail.
 * Usage : node scripts/test-api-francetravail.mjs [motsCles] [departement]
 *
 * Exemples :
 *   node scripts/test-api-francetravail.mjs
 *   node scripts/test-api-francetravail.mjs "développeur fullstack" 75
 *   node scripts/test-api-francetravail.mjs "commercial" 69
 */
import { franceTravail } from '../adapters/portals/france-travail.mjs';

const motsCles = process.argv[2] || 'développeur';
const departement = process.argv[3] || '75';

console.log(`\n🔍 Recherche France Travail : "${motsCles}" dans le département ${departement}\n`);

try {
  const results = await franceTravail.search({ motsCles, departement });

  console.log(`✅ ${results.length} offre(s) trouvée(s)\n`);

  if (results.length === 0) {
    console.log('Aucune offre trouvée. Essaie avec des mots-clés plus génériques.');
    process.exit(0);
  }

  // Afficher les 5 premières offres
  const preview = results.slice(0, 5);
  for (const [i, offre] of preview.entries()) {
    console.log(`--- Offre ${i + 1} ---`);
    console.log(`  Titre     : ${offre.intitule}`);
    console.log(`  Entreprise: ${offre.entreprise?.nom || 'Non communiqué'}`);
    console.log(`  Lieu      : ${offre.lieuTravail?.libelle || 'Non précisé'}`);
    console.log(`  Contrat   : ${offre.typeContratLibelle || offre.typeContrat || '?'}`);
    console.log(`  Salaire   : ${offre.salaire?.libelle || 'Non communiqué'}`);
    console.log(`  ID        : ${offre.id}`);
    console.log('');
  }

  // Tester normalizeToJD sur la première offre
  if (results[0]) {
    console.log('--- Aperçu JD normalisée (première offre) ---\n');
    const detail = await franceTravail.getById(results[0].id);
    const jd = franceTravail.normalizeToJD(detail);
    // Afficher les 30 premières lignes
    const lines = jd.split('\n');
    console.log(lines.slice(0, 30).join('\n'));
    if (lines.length > 30) {
      console.log(`\n... (${lines.length - 30} lignes supplémentaires)`);
    }
  }
} catch (err) {
  console.error(`\n❌ Erreur : ${err.message}\n`);

  if (err.message.includes('manquantes')) {
    console.error('👉 Crée un fichier .env avec tes identifiants France Travail.');
    console.error('   Voir docs/API-FRANCE-TRAVAIL.md pour les instructions.');
  }

  process.exit(1);
}
