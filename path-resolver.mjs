import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, realpathSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function canonicalizePath(p) {
  const absolutePath = resolve(p);
  try {
    return realpathSync(absolutePath);
  } catch {
    return absolutePath;
  }
}

/**
 * Returns the resolved career-ops data directory root.
 * Priority: process.env.CAREER_OPS_ROOT or process.env.CAREER_OPS_DATA_DIR >
 * .career-ops-data marker file > codebase root (__dirname).
 * 
 * @returns {string} Absolute path to the data root
 */
export function getCareerOpsRoot() {
  const env = process.env.CAREER_OPS_ROOT?.trim() || process.env.CAREER_OPS_DATA_DIR?.trim();
  if (env) {
    return resolve(__dirname, env);
  }
  const markerFile = join(__dirname, '.career-ops-data');
  if (existsSync(markerFile)) {
    try {
      const content = readFileSync(markerFile, 'utf-8').trim();
      if (content) {
        return resolve(__dirname, content);
      }
    } catch {
      // ignore read errors
    }
  }
  return __dirname;
}

/**
 * Returns the resolved path to the tracker applications.md file for reading.
 * Priority: process.env.CAREER_OPS_TRACKER > root/data/applications.md > root/applications.md.
 * 
 * @param {string} root The career-ops data root directory
 * @returns {string} Absolute path to the tracker file
 */
export function resolveTrackerPath(root) {
  const env = process.env.CAREER_OPS_TRACKER?.trim();
  const raw = env
    ? env
    : existsSync(join(root, 'data/applications.md'))
      ? join(root, 'data/applications.md')
      : join(root, 'applications.md');
  return canonicalizePath(raw);
}

/**
 * Returns the resolved path to the tracker applications.md file for writing.
 * Priority: process.env.CAREER_OPS_TRACKER > root/data/applications.md.
 * Does not check for file existence, providing a deterministic write target.
 * 
 * @param {string} root The career-ops data root directory
 * @returns {string} Absolute path to the tracker file for writing
 */
export function resolveTrackerPathForWrite(root) {
  const env = process.env.CAREER_OPS_TRACKER?.trim();
  const raw = env
    ? env
    : join(root, 'data/applications.md');
  return canonicalizePath(raw);
}

