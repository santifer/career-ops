#!/usr/bin/env node
/**
 * Runner de régression pour le golden set.
 *
 * Vérifie que les cas de test du golden set sont structurellement valides
 * et que les fichiers d'entrée existent. L'évaluation réelle des scores
 * nécessite le pipeline complet (LLM + cv.md + profile.yml).
 *
 * Usage : node tests/run-golden.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const CASES_FILE = join(ROOT, 'tests', 'golden', 'cases.json');

console.log('\n🧪 Golden Set — Vérification de régression\n');

if (!existsSync(CASES_FILE)) {
  console.error('❌ Fichier tests/golden/cases.json introuvable.');
  process.exit(1);
}

let cases;
try {
  cases = JSON.parse(readFileSync(CASES_FILE, 'utf-8'));
} catch (err) {
  console.error(`❌ Erreur de parsing cases.json : ${err.message}`);
  process.exit(1);
}

let passed = 0;
let failed = 0;
const failures = [];

for (const testCase of cases) {
  const checks = [];

  // Vérifier la structure du cas
  if (!testCase.id) checks.push('id manquant');
  if (!testCase.name) checks.push('name manquant');
  if (!testCase.archetype) checks.push('archetype manquant');
  if (!testCase.input) checks.push('input manquant');
  if (!testCase.expectedScore?.min || !testCase.expectedScore?.max) {
    checks.push('expectedScore.min/max manquant');
  }

  // Vérifier que le fichier d'entrée existe
  if (testCase.inputType === 'file') {
    const inputPath = join(ROOT, testCase.input);
    if (!existsSync(inputPath)) {
      checks.push(`fichier introuvable : ${testCase.input}`);
    }
  }

  // Vérifier la cohérence du score
  if (testCase.expectedScore) {
    if (testCase.expectedScore.min > testCase.expectedScore.max) {
      checks.push('expectedScore.min > expectedScore.max');
    }
    if (testCase.expectedScore.min < 1 || testCase.expectedScore.max > 5) {
      checks.push('expectedScore hors plage [1, 5]');
    }
  }

  if (checks.length === 0) {
    console.log(`  ✅ ${testCase.id} — ${testCase.name}`);
    passed++;
  } else {
    console.log(`  ❌ ${testCase.id} — ${testCase.name}`);
    for (const check of checks) {
      console.log(`     └── ${check}`);
    }
    failed++;
    failures.push({ id: testCase.id, issues: checks });
  }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  Résultat : ${passed} passé(s), ${failed} échoué(s) sur ${cases.length} cas`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

if (failed > 0) {
  console.log('Cas en échec :');
  for (const f of failures) {
    console.log(`  - ${f.id}: ${f.issues.join(', ')}`);
  }
  process.exit(1);
}

console.log('Tous les cas du golden set sont structurellement valides.');
console.log('Note : les scores réels seront vérifiés quand le pipeline complet sera opérationnel.');
process.exit(0);
