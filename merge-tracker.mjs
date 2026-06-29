#!/usr/bin/env node
/**
 * merge-tracker.mjs — Merge batch tracker additions into applications.md
 *
 * Handles multiple TSV formats:
 * - 9-col: num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes
 * - 8-col: num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport (no notes)
 * - Pipe-delimited (markdown table row): | col | col | ... |
 *
 * Dedup: company normalized + role fuzzy match + report number match
 * If duplicate with higher score → update in-place, update report link
 * Validates status against states.yml (rejects non-canonical, logs warning)
 *
 * Run: node career-ops/merge-tracker.mjs [--dry-run] [--verify]
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, existsSync, rmSync, statSync, realpathSync } from 'fs';
import { join, basename, dirname, resolve, relative, isAbsolute, sep } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { normalizeReportLink as normalizeLink } from './tracker-links.mjs';
import { roleFuzzyMatch } from './role-matcher.mjs';
import { normalizeUrl } from './url-key.mjs';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
// Support both layouts: data/applications.md (boilerplate) and applications.md (original).
// CAREER_OPS_TRACKER overrides the path (used by tests and non-standard layouts).
const APPS_FILE_RAW = process.env.CAREER_OPS_TRACKER
  ? process.env.CAREER_OPS_TRACKER
  : existsSync(join(CAREER_OPS, 'data/applications.md'))
    ? join(CAREER_OPS, 'data/applications.md')
    : join(CAREER_OPS, 'applications.md');
const APPS_FILE = canonicalizeTrackerPath(APPS_FILE_RAW);
const TRACKER_DIR = dirname(APPS_FILE);
// CAREER_OPS_ADDITIONS overrides the additions dir (used by tests, mirrors CAREER_OPS_TRACKER).
const ADDITIONS_DIR = process.env.CAREER_OPS_ADDITIONS
  ? process.env.CAREER_OPS_ADDITIONS
  : join(CAREER_OPS, 'batch/tracker-additions');
const MERGED_DIR = join(ADDITIONS_DIR, 'merged');
const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY = process.argv.includes('--verify');
const MIGRATE = process.argv.includes('--migrate');
const BACKFILL_URLS = process.argv.includes('--backfill-urls');
const MERGE_HOLD_MS = Number(process.env.CAREER_OPS_MERGE_HOLD_MS) || 0;
const MERGE_READY_IPC = process.env.CAREER_OPS_MERGE_READY_IPC === '1';

const trackerLockKey = createHash('sha256').update(APPS_FILE).digest('hex').slice(0, 16);
const TRACKER_LOCK_DIR = resolveTrackerLockDir(process.env.CAREER_OPS_TRACKER_LOCK, trackerLockKey);

// The reports/ dir sits at the repo root, which is the tracker's parent in the
// data/ layout (data/applications.md) and the tracker's own dir at root layout.
const REPORTS_ROOT = basename(TRACKER_DIR) === 'data' ? dirname(TRACKER_DIR) : TRACKER_DIR;

/**
 * Normalize report links before writing them into the tracker file.
 *
 * TSV additions use root-relative report links so they are easy for agents to
 * generate. The tracker may live either at `data/applications.md` or at the
 * repository root, so this wrapper binds the correct tracker and reports
 * directories before delegating to the shared link normalizer.
 *
 * @param {string} reportField - Raw report cell from a TSV addition.
 * @returns {string} Markdown report link relative to the tracker file.
 */
const normalizeReportLink = (reportField) => normalizeLink(reportField, TRACKER_DIR, REPORTS_ROOT);

// Ensure required directories exist (fresh setup)
mkdirSync(join(CAREER_OPS, 'data'), { recursive: true });
mkdirSync(ADDITIONS_DIR, { recursive: true });

/**
 * Convert the tracker path into one stable absolute spelling before hashing it.
 *
 * Equivalent tracker paths can be written in multiple ways, such as a relative
 * path from the current shell, an absolute path, or a path that travels through
 * a symlink. The lock key must be based on one canonical spelling so all merge
 * processes that target the same tracker also target the same lock directory.
 *
 * @param {string} path - Raw tracker path from config, env, or the default.
 * @returns {string} Absolute canonical path when the file exists, else resolved path.
 */
function canonicalizeTrackerPath(path) {
  const absolutePath = resolve(path);
  try {
    return realpathSync(absolutePath);
  } catch {
    return absolutePath;
  }
}

/**
 * Check whether one absolute path stays inside another directory.
 *
 * This protects recursive lock cleanup from accepting paths that escape the
 * system temp directory through `..` segments or unrelated absolute roots.
 *
 * @param {string} childPath - Candidate path to validate.
 * @param {string} parentDir - Required parent directory boundary.
 * @returns {boolean} True when childPath is inside parentDir or equal to it.
 */
function pathIsInside(childPath, parentDir) {
  const relativePath = relative(parentDir, childPath);
  return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath));
}

/**
 * Validate and resolve the tracker lock directory.
 *
 * `CAREER_OPS_TRACKER_LOCK` exists for tests and unusual local layouts, but the
 * merge script later removes the lock directory recursively. To keep that safe,
 * env-provided lock paths must be absolute, live under the OS temp directory,
 * and use the career-ops lock-name prefix. Invalid values are ignored and the
 * deterministic temp-dir default is used instead.
 *
 * @param {string|undefined} envValue - Optional lock path override.
 * @param {string} lockKey - Stable tracker hash suffix.
 * @returns {string} Safe lock directory path.
 */
function resolveTrackerLockDir(envValue, lockKey) {
  const tmpRoot = realpathSync(tmpdir());
  const fallback = join(tmpRoot, `career-ops-merge-tracker-${lockKey}.lock`);
  if (!envValue || !isAbsolute(envValue)) return fallback;

  const candidate = resolve(envValue);
  const parentDir = dirname(candidate);
  const canonicalParent = existsSync(parentDir) ? realpathSync(parentDir) : resolve(parentDir);
  if (!pathIsInside(canonicalParent, tmpRoot)) return fallback;
  if (!basename(candidate).startsWith('career-ops-merge-tracker-')) return fallback;
  return candidate;
}

/**
 * Pause the async merge flow for a fixed number of milliseconds.
 *
 * This is used in two places:
 * - the lock retry loop, where waiting briefly avoids a tight CPU spin while
 *   another `merge-tracker.mjs` process owns the tracker lock;
 * - the regression test hook (`CAREER_OPS_MERGE_HOLD_MS`), which deliberately
 *   holds the first merge after it reads `applications.md` so a second merge can
 *   try to enter the same critical section.
 *
 * @param {number} ms - Milliseconds to wait before resolving.
 * @returns {Promise<void>} Resolves after the requested delay.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine whether a process id still belongs to a live process.
 *
 * The tracker lock stores the owner PID in `owner.json`. When another process
 * finds an existing lock, this check lets it distinguish a valid live owner from
 * a crashed process that left a stale lock directory behind. `EPERM` counts as
 * alive because the process exists even if the current user cannot signal it.
 *
 * @param {number} pid - Process id recorded by the lock owner.
 * @returns {boolean} True when the process appears to still exist.
 */
function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

/**
 * Read lock ownership metadata from a tracker lock directory.
 *
 * The metadata contains the owner PID, a unique release token, the acquisition
 * timestamp, and the tracker path. Invalid or missing metadata is treated as
 * unreadable so the stale-lock recovery path can fall back to directory age.
 *
 * @param {string} lockDir - Directory that represents the active lock.
 * @returns {object|null} Parsed owner metadata, or null when unavailable.
 */
function readLockOwner(lockDir) {
  try {
    return JSON.parse(readFileSync(join(lockDir, 'owner.json'), 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Decide whether an existing lock can be safely recovered.
 *
 * Recovery is conservative: if the lock has an owner PID and that process is
 * still alive, the lock is never considered stale merely because it is old. If
 * the owner process is gone, or if the metadata cannot be read and the lock
 * directory itself is older than the stale threshold, the waiting process may
 * remove the lock and retry acquisition.
 *
 * @param {string} lockDir - Directory that represents the active lock.
 * @param {number} staleMs - Age threshold for metadata-free lock recovery.
 * @returns {boolean} True when the caller may remove and recreate the lock.
 */
function lockCanRecover(lockDir, staleMs) {
  const owner = readLockOwner(lockDir);
  if (owner?.pid) return !processIsAlive(owner.pid);

  try {
    return Date.now() - statSync(lockDir).mtimeMs > staleMs;
  } catch {
    return true;
  }
}

/**
 * Acquire an exclusive filesystem lock for one tracker merge.
 *
 * The critical section must cover the full read/modify/write/move sequence, not
 * just the final write. Otherwise two processes can read the same old tracker
 * snapshot, compute independent updates, and let the later writer erase rows
 * written by the earlier one. The lock is implemented with atomic directory
 * creation, owner metadata, retry/backoff, stale-owner recovery, and a release
 * token so one process cannot delete another process's newer lock.
 *
 * @param {string} lockDir - Directory path used as the lock sentinel.
 * @param {object} [options] - Lock timing options.
 * @param {number} [options.timeoutMs=60000] - Maximum time to wait for the lock.
 * @param {number} [options.retryMs=75] - Delay between acquisition attempts.
 * @param {number} [options.staleMs=600000] - Metadata-free stale-lock threshold.
 * @returns {Promise<{attempts:number,waitMs:number,staleRecovered:boolean,release:Function}>}
 * Lock handle with metadata and an idempotent release method.
 */
async function acquireTrackerLock(lockDir, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const retryMs = options.retryMs ?? 75;
  const staleMs = options.staleMs ?? 10 * 60_000;
  const recoverGuardDir = `${lockDir}.recover`;
  const token = randomUUID();
  const startedAt = Date.now();
  let attempts = 0;
  let staleRecovered = false;

  while (Date.now() - startedAt < timeoutMs) {
    attempts++;
    try {
      mkdirSync(lockDir);
      writeFileSync(join(lockDir, 'owner.json'), JSON.stringify({
        pid: process.pid,
        token,
        started_at: new Date().toISOString(),
        tracker: APPS_FILE,
      }, null, 2));

      let released = false;
      return {
        attempts,
        waitMs: Date.now() - startedAt,
        staleRecovered,
        release() {
          if (released) return;
          released = true;
          const owner = readLockOwner(lockDir);
          if (owner?.token === token) {
            rmSync(lockDir, { recursive: true, force: true });
          }
        },
      };
    } catch (err) {
      if (err?.code !== 'EEXIST') throw err;

      let hasRecoverGuard = false;
      try {
        mkdirSync(recoverGuardDir);
        hasRecoverGuard = true;
      } catch (guardErr) {
        if (guardErr?.code !== 'EEXIST') throw guardErr;
      }

      if (hasRecoverGuard) {
        try {
          if (lockCanRecover(lockDir, staleMs)) {
            rmSync(lockDir, { recursive: true, force: true });
            staleRecovered = true;
            continue;
          }
        } finally {
          rmSync(recoverGuardDir, { recursive: true, force: true });
        }
      }

      await sleep(retryMs);
    }
  }

  throw new Error(`Timed out waiting for tracker merge lock at ${lockDir}`);
}

/**
 * Replace a tracker file atomically using a same-directory temporary file.
 *
 * Writing into the same directory keeps the final `renameSync` atomic on normal
 * filesystems and avoids exposing a partially written `applications.md` to other
 * readers. If the write or rename fails, the temporary file is cleaned up before
 * the original error is rethrown.
 *
 * @param {string} path - Final file path to replace.
 * @param {string} content - Complete file content to write.
 * @returns {void}
 */
function writeFileAtomic(path, content) {
  const tmpPath = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
  try {
    writeFileSync(tmpPath, content);
    renameSync(tmpPath, path);
  } catch (err) {
    rmSync(tmpPath, { force: true });
    throw err;
  }
}

let trackerLock;
try {
  trackerLock = await acquireTrackerLock(TRACKER_LOCK_DIR, {
    timeoutMs: Number(process.env.CAREER_OPS_TRACKER_LOCK_TIMEOUT_MS) || 60_000,
    retryMs: Number(process.env.CAREER_OPS_TRACKER_LOCK_RETRY_MS) || 75,
    staleMs: Number(process.env.CAREER_OPS_TRACKER_LOCK_STALE_MS) || 10 * 60_000,
  });
  process.once('exit', () => trackerLock?.release());
  if (trackerLock.waitMs > 0 || trackerLock.staleRecovered) {
    console.log(`🔒 Tracker merge lock acquired (wait_ms=${trackerLock.waitMs} | attempts=${trackerLock.attempts} | stale_recovered=${trackerLock.staleRecovered})`);
  }
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

// Canonical states and aliases
const CANONICAL_STATES = ['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP'];

/**
 * Convert raw addition status text into one canonical tracker state.
 *
 * Batch workers and older tracker additions may emit Spanish labels, bold
 * Markdown, legacy date suffixes, or repost markers. The merge script normalizes
 * all of those variants here so applications.md keeps the states defined by
 * templates/states.yml.
 *
 * @param {string} status - Raw status string from a TSV or pipe-delimited row.
 * @returns {string} Canonical tracker status.
 */
function validateStatus(status) {
  const clean = status.replace(/\*\*/g, '').replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
  const lower = clean.toLowerCase();

  for (const valid of CANONICAL_STATES) {
    if (valid.toLowerCase() === lower) return valid;
  }

  // Aliases
  const aliases = {
    // Spanish → English
    'evaluada': 'Evaluated', 'condicional': 'Evaluated', 'hold': 'Evaluated', 'evaluar': 'Evaluated', 'verificar': 'Evaluated',
    'aplicado': 'Applied', 'enviada': 'Applied', 'aplicada': 'Applied', 'applied': 'Applied', 'sent': 'Applied',
    'respondido': 'Responded',
    'entrevista': 'Interview',
    'oferta': 'Offer',
    'rechazado': 'Rejected', 'rechazada': 'Rejected',
    'descartado': 'Discarded', 'descartada': 'Discarded', 'cerrada': 'Discarded', 'cancelada': 'Discarded',
    'no aplicar': 'SKIP', 'no_aplicar': 'SKIP', 'skip': 'SKIP', 'monitor': 'SKIP',
    'geo blocker': 'SKIP',
  };

  if (aliases[lower]) return aliases[lower];

  // DUPLICADO/Repost → Discarded
  if (/^(duplicado|dup|repost)/i.test(lower)) return 'Discarded';

  console.warn(`⚠️  Non-canonical status "${status}" → defaulting to "Evaluated"`);
  return 'Evaluated';
}

/**
 * Normalize company names for duplicate lookup during tracker merges.
 *
 * Company names can contain spaces, punctuation, or branding variants in the
 * tracker and incoming TSV rows. Removing non-alphanumeric characters gives the
 * merge step a stable same-company key before it compares report numbers or
 * fuzzy role titles.
 *
 * @param {string} name - Company name from the tracker or addition row.
 * @returns {string} Lowercase alphanumeric company key.
 */
function normalizeCompany(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Extract the bracketed report number from a Markdown report link.
 *
 * Report-number equality is an exact duplicate signal, but only after company
 * equality is confirmed by the caller. This helper reads links such as
 * `[123](../reports/123-company-role-date.md)` and returns the numeric id.
 *
 * @param {string} reportStr - Raw report cell from applications.md or TSV input.
 * @returns {number|null} Parsed report number, or null when absent.
 */
function extractReportNum(reportStr) {
  const m = reportStr.match(/\[(\d+)\]/);
  return m ? parseInt(m[1]) : null;
}

/**
 * Parse a score cell into a numeric value for score-upgrade decisions.
 *
 * The merge path compares old and new scores to decide whether to update an
 * existing duplicate row. Markdown bolding and `/5` suffixes are presentation
 * details, so only the first numeric value is used.
 *
 * @param {string} s - Raw score cell such as `4.2/5`.
 * @returns {number} Parsed score, or 0 when no numeric value is present.
 */
function parseScore(s) {
  const m = s.replace(/\*\*/g, '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

// Column layout for the applications.md table. The tracker may use the original
// 9-column layout, or a customized one with an extra/reordered column (e.g. a
// Location column after Role). We map columns by header NAME rather than fixed
// position so both work — fixed-position indexing would otherwise read, say,
// Location where it expects Score. Falls back to the legacy layout when no
// recognizable header row is found.
const LEGACY_COLMAP = { num: 1, date: 2, company: 3, role: 4, score: 5, status: 6, pdf: 7, report: 8, notes: 9 };
let COLMAP = LEGACY_COLMAP;

const HEADER_ALIASES = {
  '#': 'num', 'num': 'num', 'date': 'date', 'company': 'company', 'empresa': 'company',
  'role': 'role', 'puesto': 'role', 'location': 'location', 'score': 'score',
  'status': 'status', 'pdf': 'pdf', 'report': 'report', 'notes': 'notes',
  'url': 'url', 'link': 'url',
};

// Scan the table for a header row and build a header-name → column-index map.
// Indexing matches `line.split('|')` (leading empty cell before the first pipe),
// the same split parseAppLine uses. Returns null — caller keeps the legacy
// layout — unless the essential columns are all present, so a stray pipe line
// can't yield a bogus mapping.
function detectColumns(lines) {
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map(s => s.trim().toLowerCase());
    if (!cells.includes('company') || !cells.includes('role')) continue;
    const map = {};
    cells.forEach((c, i) => { if (HEADER_ALIASES[c] != null) map[HEADER_ALIASES[c]] = i; });
    if (['num', 'company', 'role', 'score', 'status'].every(k => map[k] != null)) return map;
  }
  return null;
}

// Build a tracker row string from the DETECTED column layout (COLMAP), placing
// each field at its own index. This round-trips any layout — the legacy 9-col,
// an optional Location column after Role, and/or a trailing URL column — without
// a separate hand-written branch per combination. Reading and writing by the
// same name→index map is what makes adding a column an additive, non-breaking
// change (a positional builder would silently shift cells when a column moved).
function buildRow(o) {
  const maxIdx = Math.max(...Object.values(COLMAP));
  const cells = new Array(maxIdx).fill('');
  const put = (key, val) => { if (COLMAP[key] != null) cells[COLMAP[key] - 1] = String(val ?? ''); };
  put('num', o.num);
  put('date', o.date);
  put('company', o.company);
  put('role', o.role);
  put('location', o.location || '—');
  put('score', o.score);
  put('status', o.status);
  put('pdf', o.pdf);
  put('report', o.report);
  put('notes', o.notes);
  put('url', o.url || '');
  return `| ${cells.join(' | ')} |`;
}

/**
 * Parse one Markdown applications.md table row into a tracker object.
 *
 * Header/separator rows and malformed rows return null. Valid rows preserve the
 * original raw line so the merge logic can locate and replace the exact tracker
 * line when a higher-scored re-evaluation arrives.
 *
 * @param {string} line - One line from applications.md.
 * @returns {object|null} Parsed tracker row, or null for non-data rows.
 */
function parseAppLine(line) {
  const parts = line.split('|').map(s => s.trim());
  const maxIdx = Math.max(...Object.values(COLMAP));
  if (parts.length <= maxIdx) return null;
  const num = parseInt(parts[COLMAP.num]);
  if (isNaN(num) || num === 0) return null;
  return {
    num,
    date: parts[COLMAP.date],
    company: parts[COLMAP.company],
    role: parts[COLMAP.role],
    location: COLMAP.location != null ? parts[COLMAP.location] : '',
    score: parts[COLMAP.score],
    status: parts[COLMAP.status],
    pdf: parts[COLMAP.pdf],
    report: parts[COLMAP.report],
    notes: COLMAP.notes != null ? (parts[COLMAP.notes] || '') : '',
    url: COLMAP.url != null ? (parts[COLMAP.url] || '') : '',
    raw: line,
  };
}

/**
 * Resolve the optional trailing TSV fields (location and/or URL) by CONTENT.
 *
 * The 9-column contract is followed by up to two optional trailing fields: an
 * (older) location and a (new) posting URL. Parsing them by fixed position is
 * fragile — a row with a URL but no location would otherwise read the URL as a
 * location. A URL is unambiguous (it starts with http(s)://), so we classify
 * each present trailing field by shape, which makes the two fields
 * order-independent and keeps old location-only rows working untouched.
 *
 * @param {string[]} fields - Candidate trailing cells (already string-typed).
 * @returns {{url: string, location: string}} Classified trailing values.
 */
function splitTrailing(fields) {
  let url = '';
  let location = '';
  for (const f of fields) {
    const t = (f || '').trim();
    if (!t) continue;
    if (/^https?:\/\//i.test(t)) {
      if (!url) url = t;
    } else if (!location) {
      location = t;
    }
  }
  return { url, location };
}

/**
 * Parse a TSV file content into a structured addition object.
 *
 * Handles 9-column TSV, 8-column TSV, and pipe-delimited Markdown rows. The
 * parser also tolerates old score/status column ordering, validates status, and
 * rejects additions without a usable tracker number so malformed batch output
 * cannot corrupt applications.md.
 *
 * @param {string} content - Raw file content from batch/tracker-additions.
 * @param {string} filename - Source filename used in warning messages.
 * @returns {object|null} Parsed tracker addition, or null when malformed.
 */
function parseTsvContent(content, filename) {
  content = content.trim();
  if (!content) return null;

  let parts;
  let addition;

  // Detect pipe-delimited (markdown table row)
  if (content.startsWith('|')) {
    parts = content.split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length < 8) {
      console.warn(`⚠️  Skipping malformed pipe-delimited ${filename}: ${parts.length} fields`);
      return null;
    }
    // Format: num | date | company | role | score | status | pdf | report | notes [| location] [| url]
    addition = {
      num: parseInt(parts[0]),
      date: parts[1],
      company: parts[2],
      role: parts[3],
      score: parts[4],
      status: validateStatus(parts[5]),
      pdf: parts[6],
      report: parts[7],
      notes: parts[8] || '',
      ...splitTrailing([parts[9], parts[10]]),
    };
  } else {
    // Tab-separated
    parts = content.split('\t');
    if (parts.length < 8) {
      console.warn(`⚠️  Skipping malformed TSV ${filename}: ${parts.length} fields`);
      return null;
    }

    // Detect column order: some TSVs have (status, score), others have (score, status)
    // Heuristic: if col4 looks like a score and col5 looks like a status, they're swapped
    const col4 = parts[4].trim();
    const col5 = parts[5].trim();
    const col4LooksLikeScore = /^\d+\.?\d*\/5$/.test(col4) || col4 === 'N/A' || col4 === 'DUP';
    const col5LooksLikeScore = /^\d+\.?\d*\/5$/.test(col5) || col5 === 'N/A' || col5 === 'DUP';
    const col4LooksLikeStatus = /^(evaluated|applied|responded|interview|offer|rejected|discarded|skip|evaluada|aplicado|respondido|entrevista|oferta|rechazado|descartado|no aplicar|cerrada|duplicado|repost|condicional|hold|monitor)/i.test(col4);
    const col5LooksLikeStatus = /^(evaluated|applied|responded|interview|offer|rejected|discarded|skip|evaluada|aplicado|respondido|entrevista|oferta|rechazado|descartado|no aplicar|cerrada|duplicado|repost|condicional|hold|monitor)/i.test(col5);

    let statusCol, scoreCol;
    if (col4LooksLikeStatus && !col4LooksLikeScore) {
      // Standard format: col4=status, col5=score
      statusCol = col4; scoreCol = col5;
    } else if (col4LooksLikeScore && col5LooksLikeStatus) {
      // Swapped format: col4=score, col5=status
      statusCol = col5; scoreCol = col4;
    } else if (col5LooksLikeScore && !col4LooksLikeScore) {
      // col5 is definitely score → col4 must be status
      statusCol = col4; scoreCol = col5;
    } else {
      // Default: standard format (status before score)
      statusCol = col4; scoreCol = col5;
    }

    addition = {
      num: parseInt(parts[0]),
      date: parts[1],
      company: parts[2],
      role: parts[3],
      status: validateStatus(statusCol),
      score: scoreCol,
      pdf: parts[6],
      report: parts[7],
      notes: parts[8] || '',
      // Optional trailing fields (location and/or posting URL), classified by
      // content so a URL-but-no-location row isn't misread as a location.
      ...splitTrailing([parts[9], parts[10]]),
    };
  }

  if (isNaN(addition.num) || addition.num === 0) {
    console.warn(`⚠️  Skipping ${filename}: invalid entry number`);
    return null;
  }

  return addition;
}

// Status funnel as a small lattice. A re-evaluation arrives as "Evaluated", so
// status merges by the LEAST UPPER BOUND of the funnel (monotonic join) rather
// than by overwrite: a re-eval can advance status but must never downgrade it.
// Terminal states are absorbing — once a human marks a row Rejected/Discarded/
// SKIP, a re-eval can't revive it to Evaluated.
const STATUS_RANK = { 'Evaluated': 0, 'Applied': 1, 'Responded': 2, 'Interview': 3, 'Offer': 4 };
const TERMINAL_STATES = new Set(['Rejected', 'Discarded', 'SKIP']);

/**
 * Merge two statuses by the funnel lattice (never downgrade).
 * @param {string} existing - Status already on the tracker row.
 * @param {string} incoming - Status from the new addition.
 * @returns {string} The joined (higher) status.
 */
function mergeStatus(existing, incoming) {
  const e = existing || 'Evaluated';
  const i = incoming || 'Evaluated';
  if (TERMINAL_STATES.has(e)) return e;      // terminal is absorbing — keep it
  if (TERMINAL_STATES.has(i)) return i;      // a new terminal decision advances
  return (STATUS_RANK[i] ?? 0) > (STATUS_RANK[e] ?? 0) ? i : e;
}

/**
 * Merge the PDF flag monotonically — a ✅ (a generated tailored PDF) is never
 * lost to a later ❌ re-eval that simply didn't regenerate one.
 * @param {string} existing - Existing PDF cell.
 * @param {string} incoming - Incoming PDF cell.
 * @returns {string} '✅' if either side has it, else the incoming/existing value.
 */
function mergePdf(existing, incoming) {
  if (existing === '✅' || incoming === '✅') return '✅';
  return incoming || existing || '❌';
}

/**
 * Find the existing tracker row that is the same opening as `addition`.
 *
 * Pass 0 (deterministic): exact match on the normalized posting URL — the stable
 * natural key. When it hits, it is authoritative.
 *
 * Passes 1-3 (legacy fallback, for rows with no URL yet): report-number +
 * company, entry-number + company, then company + fuzzy role. A fallback
 * candidate is REJECTED when it carries a URL that DIFFERS from the addition's
 * URL — two different posting URLs are two different postings, so a fuzzy title
 * collision must not collapse them (this is the over-dedup bug). A candidate
 * with no URL stays eligible so legacy un-backfilled rows still match.
 *
 * @param {object} addition - Parsed TSV addition.
 * @param {object[]} existingApps - Parsed tracker rows.
 * @returns {{match: object, reason: string}|null}
 */
function findDuplicate(addition, existingApps) {
  const addUrl = normalizeUrl(addition.url);

  if (addUrl) {
    const m = existingApps.find(a => a.url && normalizeUrl(a.url) === addUrl);
    if (m) return { match: m, reason: 'url' };
  }

  const normCompany = normalizeCompany(addition.company);
  // Guard the fuzzy/num/report fallback against collapsing distinct postings:
  //  - candidate has no URL          → eligible (legacy un-backfilled rows);
  //  - candidate has a URL, addition has none → REJECT: the candidate is a known
  //    specific posting and a URL-less addition must not silently claim/clobber
  //    it (it may be a different role at the same company — the over-dedup bug);
  //  - both have URLs                → conflict only when they differ.
  const urlConflict = (cand) => {
    if (!cand.url) return false;
    if (!addUrl) return true;
    return normalizeUrl(cand.url) !== addUrl;
  };

  const reportNum = extractReportNum(addition.report);
  if (reportNum) {
    const m = existingApps.find(a =>
      extractReportNum(a.report) === reportNum && normalizeCompany(a.company) === normCompany);
    if (m && !urlConflict(m)) return { match: m, reason: 'report+company' };
  }

  {
    const m = existingApps.find(a =>
      a.num === addition.num && normalizeCompany(a.company) === normCompany);
    if (m && !urlConflict(m)) return { match: m, reason: 'num+company' };
  }

  {
    const m = existingApps.find(a =>
      normalizeCompany(a.company) === normCompany && roleFuzzyMatch(addition.role, a.role));
    if (m && !urlConflict(m)) return { match: m, reason: 'fuzzy' };
  }

  return null;
}

// ---- Main ----

// Read applications.md
if (!existsSync(APPS_FILE)) {
  console.log('No applications.md found. Nothing to merge into.');
  process.exit(0);
}
const appContent = readFileSync(APPS_FILE, 'utf-8');
// Test-only synchronization hook: the concurrent merge test waits for the
// first worker to read the tracker while still holding the lock, then starts a
// second worker to prove the lock prevents the old lost-update race.
if (MERGE_READY_IPC && typeof process.send === 'function') {
  process.send({ type: 'merge-tracker-ready' });
}
if (MERGE_HOLD_MS > 0) {
  await sleep(MERGE_HOLD_MS);
}

// One-time migration: rewrite existing report links so they resolve relative
// to the tracker file's directory (see #760). Run with: node merge-tracker.mjs --migrate
if (MIGRATE) {
  const migrated = appContent
    .split('\n')
    .map(line => (line.startsWith('|') ? normalizeReportLink(line) : line));
  const before = appContent.split('\n');
  const changed = migrated.filter((l, i) => l !== before[i]).length;

  if (DRY_RUN) {
    console.log(`🔎 Migration (dry-run): ${changed} row(s) would be rewritten in ${basename(APPS_FILE)}`);
  } else {
    writeFileAtomic(APPS_FILE, migrated.join('\n'));
    console.log(`✅ Migration: rewrote ${changed} report link(s) in ${basename(APPS_FILE)} relative to ${TRACKER_DIR === CAREER_OPS ? 'repo root' : 'data/'}`);
  }
  process.exit(0);
}

const appLines = appContent.split('\n');
// Detect the tracker's column layout via header names so parsing and writing
// both work whether the table uses the original 9-column layout or a customized
// one (e.g. with a Location column after Role). Falls back to the legacy layout.
COLMAP = detectColumns(appLines) || LEGACY_COLMAP;
if (COLMAP.location != null) console.log('🧭 Detected Location column.');
const existingApps = [];
let maxNum = 0;

// Match the markdown separator row PRECISELY (a row of only pipes/dashes/colons/
// spaces). A blanket `line.includes('---')` also matches DATA rows whose URL
// contains `---` (common in Workday slugs, e.g. `Product-Strategy---Operations`),
// which would silently drop those rows from existingApps and break their dedup.
const isSeparatorRow = (l) => /^\|[\s|:-]+\|\s*$/.test(l);

for (const line of appLines) {
  if (line.startsWith('|') && !isSeparatorRow(line) && !line.includes('Empresa')) {
    const app = parseAppLine(line);
    if (app) {
      existingApps.push(app);
      if (app.num > maxNum) maxNum = app.num;
    }
  }
}

console.log(`📊 Existing: ${existingApps.length} entries, max #${maxNum}`);

// One-time backfill: populate the URL column on existing rows from each row's
// linked report (**URL:** header). This is the EXPAND-phase backfill (Fowler,
// Parallel Change) — deterministic URL-keyed dedup can't engage on a row until
// it has a URL, so the key must be backfilled before the merge relies on it.
// Idempotent: only fills rows whose URL is empty, so it is safe to re-run.
// Run with: node merge-tracker.mjs --backfill-urls [--dry-run]
if (BACKFILL_URLS) {
  if (COLMAP.url == null) {
    console.error('❌ --backfill-urls: this tracker has no URL column. Add a `URL` header column first (additive, see #URL-dedup), then re-run.');
    trackerLock.release();
    process.exit(1);
  }
  let filled = 0, noReport = 0, noUrl = 0, already = 0;
  for (const app of existingApps) {
    if ((app.url || '').trim()) { already++; continue; }   // idempotent: skip filled rows
    const linkMatch = (app.report || '').match(/\]\(([^)]+)\)/);
    if (!linkMatch) { noReport++; continue; }
    // Report files live under REPORTS_ROOT/reports/. Tracker links may be
    // root-relative (`reports/...`) or data-relative (`../reports/...`); resolve
    // both against REPORTS_ROOT after stripping any leading `../` so backfill
    // finds the report regardless of which link style a row uses (#URL-dedup).
    const reportPath = resolve(REPORTS_ROOT, linkMatch[1].trim().replace(/^(\.\.\/)+/, ''));
    let url = '';
    try {
      const txt = readFileSync(reportPath, 'utf-8');
      const um = txt.match(/\*\*URL:\*\*\s*(\S+)/i);
      if (um) url = um[1].trim();
    } catch { noReport++; continue; }
    if (!/^https?:\/\//i.test(url)) { noUrl++; continue; }
    const lineIdx = appLines.indexOf(app.raw);
    if (lineIdx < 0) continue;
    appLines[lineIdx] = buildRow({ ...app, url });
    filled++;
  }
  const summary = `filled ${filled}; ${already} already had one; ${noReport} missing/unreadable report; ${noUrl} report had no URL`;
  if (DRY_RUN) {
    console.log(`🔎 Backfill URLs (dry-run): would fill ${filled} row(s). (${summary})`);
  } else {
    writeFileAtomic(APPS_FILE, appLines.join('\n'));
    console.log(`✅ Backfill URLs: ${summary}.`);
  }
  trackerLock.release();
  process.exit(0);
}

// Read tracker additions
if (!existsSync(ADDITIONS_DIR)) {
  console.log('No tracker-additions directory found.');
  process.exit(0);
}

const tsvFiles = readdirSync(ADDITIONS_DIR).filter(f => f.endsWith('.tsv'));
if (tsvFiles.length === 0) {
  console.log('✅ No pending additions to merge.');
  process.exit(0);
}

// Sort files numerically for deterministic processing
tsvFiles.sort((a, b) => {
  const numA = parseInt(a.replace(/\D/g, '')) || 0;
  const numB = parseInt(b.replace(/\D/g, '')) || 0;
  return numA - numB;
});

console.log(`📥 Found ${tsvFiles.length} pending additions`);

let added = 0;
let updated = 0;
let skipped = 0;
let warnedNoUrlCol = false;
const newLines = [];

for (const file of tsvFiles) {
  const content = readFileSync(join(ADDITIONS_DIR, file), 'utf-8').trim();
  const addition = parseTsvContent(content, file);
  if (!addition) { skipped++; continue; }

  // If additions carry a URL but the tracker has no URL column, deterministic
  // URL dedup can't engage (falls back to fuzzy). Warn once so it's not silent.
  if (addition.url && COLMAP.url == null && !warnedNoUrlCol) {
    console.warn('⚠️  Additions carry a URL but this tracker has no URL column — URL dedup is INACTIVE (fuzzy fallback). Add a `URL` header column to enable it.');
    warnedNoUrlCol = true;
  }

  // Normalize the report link to be relative to the tracker file's directory.
  // The TSV convention carries a root-relative `reports/...` link; rewrite it
  // so it resolves correctly when clicked from applications.md (see #760).
  addition.report = normalizeReportLink(addition.report);

  // Find a duplicate. Pass 0 is the deterministic posting-URL key (the stable
  // natural key); report/num/fuzzy are the legacy fallback for rows without a
  // URL yet, guarded so two distinct URLs never collapse. See findDuplicate().
  const found = findDuplicate(addition, existingApps);

  if (found) {
    const { match: duplicate, reason } = found;
    const newScore = parseScore(addition.score);
    const oldScore = parseScore(duplicate.score);
    const lineIdx = appLines.indexOf(duplicate.raw);
    const mergedStatus = mergeStatus(duplicate.status, addition.status);
    const mergedPdf = mergePdf(duplicate.pdf, addition.pdf);

    if (reason === 'url') {
      // Same posting (confirmed by URL key) → LAST-WRITE-WINS on the evaluation.
      // The newest eval is the truth; this also stops a stale wrong-high score
      // from being pinned forever (the failed-fetch hazard the old max-score gate
      // created). EXCEPTION: an unscoreable re-eval (N/A / failed fetch →
      // parseScore 0) must NOT overwrite a real score — "never trust a
      // WebFetch-failed score". In that case keep the prior score/report/date and
      // only merge status/PDF/url. Status/PDF always merge monotonically.
      if (lineIdx >= 0) {
        const incomingScored = newScore > 0;
        const note = incomingScored
          ? (newScore !== oldScore ? `Re-eval ${addition.date} (${oldScore}→${newScore}). ${addition.notes}`.trim() : addition.notes)
          : duplicate.notes;
        appLines[lineIdx] = buildRow({
          num: duplicate.num,
          date: incomingScored ? addition.date : duplicate.date,
          company: addition.company, role: addition.role,
          location: addition.location || duplicate.location || '—',
          score: incomingScored ? addition.score : duplicate.score,
          status: mergedStatus, pdf: mergedPdf,
          report: incomingScored ? addition.report : duplicate.report,
          notes: note,
          url: addition.url || duplicate.url || '',
        });
        console.log(`🔄 Update [url]: #${duplicate.num} ${addition.company} — ${addition.role} ${incomingScored ? `(${oldScore}→${newScore})` : `(kept ${oldScore}; re-eval unscored)`}`);
        updated++;
      }
    } else if (newScore > oldScore) {
      // Fallback match (no stable URL identity) → keep the conservative
      // max-score gate. Do NOT stamp a URL here: a fuzzy/num/report match can be
      // wrong, and writing a URL onto it would make a bad merge look canonical.
      if (lineIdx >= 0) {
        appLines[lineIdx] = buildRow({
          num: duplicate.num, date: addition.date, company: addition.company, role: addition.role,
          location: addition.location || duplicate.location || '—',
          score: addition.score, status: mergedStatus, pdf: mergedPdf,
          report: addition.report,
          notes: `Re-eval ${addition.date} (${oldScore}→${newScore}). ${addition.notes}`,
          url: duplicate.url || '',
        });
        console.log(`🔄 Update [${reason}]: #${duplicate.num} ${addition.company} — ${addition.role} (${oldScore}→${newScore})`);
        updated++;
      }
    } else {
      console.log(`⏭️  Skip [${reason}]: ${addition.company} — ${addition.role} (existing #${duplicate.num} ${oldScore} >= new ${newScore})`);
      skipped++;
    }
  } else {
    // New entry — use the number from the TSV
    const entryNum = addition.num > maxNum ? addition.num : ++maxNum;
    if (addition.num > maxNum) maxNum = addition.num;

    const newLine = buildRow({
      num: entryNum, date: addition.date, company: addition.company, role: addition.role,
      location: addition.location || '—',
      score: addition.score, status: addition.status, pdf: addition.pdf,
      report: addition.report, notes: addition.notes,
      url: addition.url || '',
    });
    newLines.push(newLine);
    added++;
    console.log(`➕ Add #${entryNum}: ${addition.company} — ${addition.role} (${addition.score})`);
  }
}

// Insert new lines after the header (line index of first data row)
if (newLines.length > 0) {
  // Find header separator (|---|...) and insert after it. Use the precise
  // separator test so a data row with `---` in its URL isn't mistaken for it.
  let insertIdx = -1;
  for (let i = 0; i < appLines.length; i++) {
    if (isSeparatorRow(appLines[i])) {
      insertIdx = i + 1;
      break;
    }
  }
  if (insertIdx >= 0) {
    appLines.splice(insertIdx, 0, ...newLines);
  }
}

// Write back
if (!DRY_RUN) {
  writeFileAtomic(APPS_FILE, appLines.join('\n'));

  // Move processed files to merged/
  if (!existsSync(MERGED_DIR)) mkdirSync(MERGED_DIR, { recursive: true });
  for (const file of tsvFiles) {
    renameSync(join(ADDITIONS_DIR, file), join(MERGED_DIR, file));
  }
  console.log(`\n✅ Moved ${tsvFiles.length} TSVs to merged/`);
}

console.log(`\n📊 Summary: +${added} added, 🔄${updated} updated, ⏭️${skipped} skipped`);
if (DRY_RUN) console.log('(dry-run — no changes written)');
trackerLock.release();

// Optional verify
if (VERIFY && !DRY_RUN) {
  console.log('\n--- Running verification ---');
  try {
    execFileSync('node', [join(CAREER_OPS, 'verify-pipeline.mjs')], { stdio: 'inherit' });
  } catch (e) {
    process.exit(1);
  }
}
