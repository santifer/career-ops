import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Returns the resolved career-ops data directory root.
 * First checks process.env.CAREER_OPS_ROOT, then process.env.CAREER_OPS_DATA_DIR,
 * and falls back to the codebase root (__dirname).
 * 
 * @returns {string} Absolute path to the data root
 */
export function getCareerOpsRoot() {
  const env = process.env.CAREER_OPS_ROOT?.trim() || process.env.CAREER_OPS_DATA_DIR?.trim();
  if (env) {
    return resolve(__dirname, env);
  }
  return __dirname;
}

/**
 * Returns the resolved path to the tracker applications.md file.
 * Priority: process.env.CAREER_OPS_TRACKER > root/data/applications.md > root/applications.md.
 * 
 * @param {string} root The career-ops data root directory
 * @returns {string} Absolute path to the tracker file
 */
export function resolveTrackerPath(root) {
  if (process.env.CAREER_OPS_TRACKER) {
    return resolve(__dirname, process.env.CAREER_OPS_TRACKER);
  }
  const dataPath = join(root, 'data/applications.md');
  return existsSync(dataPath) ? dataPath : join(root, 'applications.md');
}
