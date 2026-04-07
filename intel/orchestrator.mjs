/**
 * Central Orchestrator
 *
 * Connects the query router to source modules through budget tracking and
 * deduplication. Provides high-level pipeline functions for prospect scanning,
 * outreach research, company intel, and market trends.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyQuery, getRoutingChain } from './router.mjs';
import { dedup } from './dedup.mjs';
import { BudgetTracker } from './budget.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Module Loading ──────────────────────────────────────────────────────────

/**
 * Dynamically import a source module by name.
 * Returns the module or null if not found / fails to load.
 *
 * @param {string} name — source name, e.g. 'exa', 'builtin'
 * @returns {Promise<object|null>}
 */
export async function loadSourceModule(name) {
  try {
    const mod = await import(`./sources/${name}.mjs`);
    return mod;
  } catch {
    return null;
  }
}

// ─── Source Chain Execution ──────────────────────────────────────────────────

/**
 * Iterate the source chain, trying each in order.
 * Skips unavailable, over-budget, or erroring sources.
 * Returns results from the first source that yields non-empty results,
 * or [] if all fail.
 *
 * @param {Array<{ name: string, module: object }>} sources
 * @param {{ query: string, type?: string, [key: string]: any }} query
 * @param {{ reserveBudget: Function, commitBudget: Function, releaseBudget: Function }} budget
 * @returns {Promise<Array>}
 */
export async function trySourceChain(sources, query, budget) {
  for (const { name, module } of sources) {
    // Skip unavailable sources
    if (!module.isAvailable()) continue;

    const estimatedCost = module.estimateCost(query.type || 'search');

    // Skip if budget cannot absorb this cost
    if (!budget.reserveBudget(name, estimatedCost)) continue;

    try {
      const results = await module.execute(query);

      if (results && results.length > 0) {
        budget.commitBudget(name, estimatedCost);
        return results;
      }

      // Empty results — release reservation and try next source
      budget.releaseBudget(name, estimatedCost);
    } catch {
      budget.releaseBudget(name, estimatedCost);
      // Continue to next source
    }
  }

  return [];
}

// ─── Primary Query Executor ──────────────────────────────────────────────────

/**
 * Execute a single intelligence query end-to-end:
 * 1. Classify the query
 * 2. Build the routing chain
 * 3. Create and load a BudgetTracker
 * 4. Load source modules
 * 5. Try the source chain
 * 6. Save budget state
 * 7. Dedup results
 *
 * @param {string} query — natural-language query string
 * @param {object} [options]
 * @param {string} [options.usagePath] — path to budget JSON file
 * @param {string} [options.lockPath]  — path to budget lock file
 * @param {object} [options.budgets]   — { sourceName: monthlyUSD }
 * @returns {Promise<Array>}
 */
export async function executeQuery(query, options = {}) {
  // 1. Classify
  const queryType = classifyQuery(query);

  // 2. Routing chain
  const chain = getRoutingChain(queryType);

  // 3. Budget tracker
  const usagePath = options.usagePath ?? join(__dirname, '..', '.intel-budget.json');
  const lockPath = options.lockPath ?? join(__dirname, '..', '.intel-budget.lock');
  const budgets = options.budgets ?? {};

  const budget = new BudgetTracker(usagePath, lockPath, budgets);
  budget.load();

  // 4. Load source modules
  const sources = [];
  for (const entry of chain) {
    const module = await loadSourceModule(entry.source);
    if (module) {
      sources.push({ name: entry.source, module });
    }
  }

  // 5. Try the chain
  const results = await trySourceChain(
    sources,
    { ...options, query, type: queryType },
    budget,
  );

  // 6. Save budget
  budget.save();

  // 7. Dedup
  const mapped = results.map((r) => ({
    ...r,
    company: r.metadata?.company || r.title,
    title: r.title,
  }));

  return dedup(mapped);
}

// ─── Pipeline Functions ──────────────────────────────────────────────────────

/**
 * Scan for new job prospects across a list of keywords.
 * Runs one executeQuery per keyword and deduplicates the combined results.
 *
 * @param {object} [config]
 * @param {string[]} [config.keywords]
 * @returns {Promise<Array>}
 */
export async function runProspectScan(config = {}) {
  const keywords = config.keywords ?? ['AI Engineer', 'ML Engineer', 'Head of AI'];

  const allResults = [];
  for (const keyword of keywords) {
    const results = await executeQuery(keyword, config);
    allResults.push(...results);
  }

  return dedup(allResults);
}

/**
 * Research outreach targets for a given company and role.
 * Runs two queries: find hiring manager + find email.
 *
 * @param {string} company
 * @param {string} role
 * @param {object} [options]
 * @returns {Promise<{ people: Array, emails: Array, company: string, role: string }>}
 */
export async function runOutreachResearch(company, role, options = {}) {
  const [people, emails] = await Promise.all([
    executeQuery(`find hiring manager for ${role} at ${company}`, options),
    executeQuery(`find email for hiring manager at ${company}`, options),
  ]);

  return { people, emails, company, role };
}

/**
 * Gather company intelligence at a specified depth.
 *
 * @param {string} company
 * @param {'quick'|'deep'} [depth='quick']
 * @param {object} [options]
 * @returns {Promise<Array>}
 */
export async function runCompanyIntel(company, depth = 'quick', options = {}) {
  const q =
    depth === 'deep'
      ? `deep research analysis ${company} funding team tech stack culture`
      : `tell me about ${company}`;

  return executeQuery(q, options);
}

/**
 * Scan the market for AI hiring trends and compensation data.
 *
 * @param {object} [options]
 * @returns {Promise<Array>}
 */
export async function runMarketScan(options = {}) {
  return executeQuery('AI hiring trends salary compensation 2026', options);
}
