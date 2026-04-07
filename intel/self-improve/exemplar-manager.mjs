/**
 * Exemplar Manager — few-shot library for calibration examples
 *
 * Stores high-fit, low-fit, and calibration-miss exemplars as JSON files.
 * Supports keyword-based retrieval for building few-shot prompts.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CATEGORIES = ['highFit', 'lowFit', 'calibrationMiss'];

/**
 * Load exemplars from a directory of JSON files.
 * Returns { highFit: [], lowFit: [], calibrationMiss: [] } if dir missing.
 */
export async function loadExemplars(dir) {
  const result = { highFit: [], lowFit: [], calibrationMiss: [] };
  for (const cat of CATEGORIES) {
    try {
      const raw = await readFile(join(dir, `${cat}.json`), 'utf-8');
      result[cat] = JSON.parse(raw);
    } catch {
      // File doesn't exist or is invalid — start empty
    }
  }
  return result;
}

/**
 * Add an exemplar to a category, enforcing maxPerCategory and sort order.
 * highFit sorted by score desc, lowFit by score asc.
 * Returns the mutated exemplars object.
 */
export function addExemplar(exemplars, category, entry, opts = {}) {
  const { maxPerCategory = Infinity } = opts;
  exemplars[category].push(entry);

  // Sort: highFit by score desc, lowFit by score asc, calibrationMiss by score desc
  if (category === 'lowFit') {
    exemplars[category].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  } else {
    exemplars[category].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  // Trim to max
  if (exemplars[category].length > maxPerCategory) {
    exemplars[category] = exemplars[category].slice(0, maxPerCategory);
  }

  return exemplars;
}

/**
 * Get best exemplars matching a keyword query.
 * Scoring: company match +3, role match +2, jdSummary match +1.
 * Returns up to `limit` results sorted by relevance score desc.
 */
export function getBestExemplars(exemplars, query, limit = 5) {
  const allEntries = [
    ...exemplars.highFit,
    ...exemplars.lowFit,
    ...exemplars.calibrationMiss,
  ];

  const queryLower = query.toLowerCase();
  const scored = allEntries.map((entry) => {
    let relevance = 0;
    if ((entry.company || '').toLowerCase().includes(queryLower)) relevance += 3;
    if ((entry.role || '').toLowerCase().includes(queryLower)) relevance += 2;
    if ((entry.jdSummary || '').toLowerCase().includes(queryLower)) relevance += 1;
    return { ...entry, _relevance: relevance };
  });

  scored.sort((a, b) => b._relevance - a._relevance);

  return scored.slice(0, limit).map(({ _relevance, ...rest }) => rest);
}

/**
 * Save exemplars to a directory as JSON files per category.
 */
export async function saveExemplars(exemplars, dir) {
  await mkdir(dir, { recursive: true });
  for (const cat of CATEGORIES) {
    const data = exemplars[cat] || [];
    await writeFile(join(dir, `${cat}.json`), JSON.stringify(data, null, 2) + '\n');
  }
}
