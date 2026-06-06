/**
 * Context loader: prints PRODUCT.md (and DESIGN.md if present) as one
 * markdown block on stdout, or exits with empty stdout when no PRODUCT.md
 * is found anywhere. The skill keys off "empty stdout" to branch into the
 * init flow.
 *
 * Path resolution (first match wins):
 *   1. cwd, if PRODUCT.md or DESIGN.md is there
 *   2. .agents/context/ then docs/
 *   3. $IMPECCABLE_CONTEXT_DIR (absolute or cwd-relative) — power-user
 *      escape hatch, only consulted when defaults are empty
 *   4. cwd as a "nothing found" default
 *
 * `resolveContextDir()` and `loadContext()` are also exported for the
 * server-side scripts (live.mjs, live-server.mjs) that need the structured
 * shape rather than the markdown block.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCT_NAMES = ['PRODUCT.md', 'Product.md', 'product.md'];
const DESIGN_NAMES = ['DESIGN.md', 'Design.md', 'design.md'];
const FALLBACK_DIRS = ['.agents/context', 'docs'];

// ─── Update check ──────────────────────────────────────────────────────────
// Piggyback a lightweight skill-version check on the once-per-session boot.
// When a newer skill ships, append an UPDATE_AVAILABLE directive so the agent
// can offer `npx impeccable skills update`. Everything here is best-effort and
// silent on failure: a network problem, sandbox, or missing cache must never
// block context output or print an error.

const UPDATE_HOST = (process.env.IMPECCABLE_UPDATE_HOST || 'https://impeccable.style').replace(/\/$/, '');
const UPDATE_CACHE_PATH =
  process.env.IMPECCABLE_UPDATE_CACHE || path.join(os.homedir(), '.impeccable', 'update-check.json');
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // throttle the network poll to once a day
const RENOTIFY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // don't re-surface the same version for a week
const FETCH_TIMEOUT_MS = 1200;

export function resolveContextDir(cwd = process.cwd()) {
  if (firstExisting(cwd, [...PRODUCT_NAMES, ...DESIGN_NAMES])) {
    return cwd;
  }
  for (const rel of FALLBACK_DIRS) {
    const candidate = path.resolve(cwd, rel);
    if (firstExisting(candidate, [...PRODUCT_NAMES, ...DESIGN_NAMES])) {
      return candidate;
    }
  }
  const envDir = process.env.IMPECCABLE_CONTEXT_DIR;
  if (envDir && envDir.trim()) {
    const trimmed = envDir.trim();
    return path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
  }
  return cwd;
}

export function loadContext(cwd = process.cwd()) {
  const contextDir = resolveContextDir(cwd);
  const productPath = firstExisting(contextDir, PRODUCT_NAMES);
  const designPath = firstExisting(contextDir, DESIGN_NAMES);
  const product = productPath ? safeRead(productPath) : null;
  const design = designPath ? safeRead(designPath) : null;
  return {
    hasProduct: !!product,
    product,
    productPath: productPath ? path.relative(cwd, productPath) : null,
    hasDesign: !!design,
    design,
    designPath: designPath ? path.relative(cwd, designPath) : null,
    contextDir,
  };
}

function firstExisting(dir, names) {
  for (const name of names) {
    const abs = path.join(dir, name);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function safeRead(p) {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Pull the register (`brand` or `product`) out of PRODUCT.md by looking
 * for a `## Register` section and reading the first non-empty line that
 * follows it. Returns null when the file is legacy / register-less.
 */
export function extractRegister(product) {
  if (!product) return null;
  const lines = product.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Register\b/i.test(lines[i].trim())) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next) continue;
        const word = next.toLowerCase();
        if (word === 'brand' || word === 'product') return word;
        return null;
      }
    }
  }
  return null;
}

/**
 * Read the installed skill's own version from the sibling SKILL.md frontmatter
 * (this file lives at `<skill>/scripts/context.mjs`). Returns null when the
 * frontmatter is missing or unreadable.
 */
function readLocalSkillVersion() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const skillMd = path.join(here, '..', 'SKILL.md');
    const content = fs.readFileSync(skillMd, 'utf-8');
    const match = content.match(/^version:\s*(.+)$/m);
    return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

function readUpdateCache() {
  try {
    return JSON.parse(fs.readFileSync(UPDATE_CACHE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeUpdateCache(cache) {
  try {
    fs.mkdirSync(path.dirname(UPDATE_CACHE_PATH), { recursive: true });
    fs.writeFileSync(UPDATE_CACHE_PATH, JSON.stringify(cache));
  } catch {
    // Best-effort: a read-only home dir just means we re-poll next session.
  }
}

/** Compare dotted numeric versions. Returns >0 when a is newer than b. */
function compareSemver(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function fetchLatestSkillVersion() {
  try {
    const res = await fetch(`${UPDATE_HOST}/api/version`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.skills === 'string' ? data.skills : null;
  } catch {
    return null; // offline, sandboxed, timed out, or bad JSON: all non-fatal
  }
}

function buildUpdateDirective(localVersion, latestVersion) {
  return (
    `UPDATE_AVAILABLE: A newer Impeccable skill is available ` +
    `(installed v${localVersion}, latest v${latestVersion}). ` +
    `Before continuing, ask the user once: "A newer Impeccable (v${latestVersion}) is available. ` +
    `Update now? It runs \`npx impeccable skills update\`." ` +
    `If they agree, run \`npx impeccable skills update\` (the update applies to the next session, not this one). ` +
    `Either way, continue the current task without waiting, and do not raise this again.`
  );
}

/**
 * Best-effort update directive for the boot output. Returns a string to append
 * or null. Polls the version endpoint at most once per day (cached globally in
 * the user's home dir) and re-surfaces a given version at most once per week so
 * the agent never nags. Opt out entirely with IMPECCABLE_NO_UPDATE_CHECK=1.
 */
async function computeUpdateDirective(now = Date.now()) {
  try {
    if (process.env.IMPECCABLE_NO_UPDATE_CHECK) return null;
    const localVersion = readLocalSkillVersion();
    if (!localVersion) return null;

    const cache = readUpdateCache();

    // Poll the network only when the throttle window has elapsed. Stamp
    // lastCheck even on failure so an offline machine doesn't poll every boot.
    if (!cache.lastCheck || now - cache.lastCheck > CHECK_INTERVAL_MS) {
      const latest = await fetchLatestSkillVersion();
      cache.lastCheck = now;
      if (latest) cache.latestVersion = latest;
      writeUpdateCache(cache);
    }

    const latest = cache.latestVersion;
    if (!latest || compareSemver(latest, localVersion) <= 0) return null;

    // Anti-nag: surface a given version at most once per RENOTIFY window.
    if (cache.notifiedVersion === latest && cache.notifiedAt && now - cache.notifiedAt < RENOTIFY_INTERVAL_MS) {
      return null;
    }
    cache.notifiedVersion = latest;
    cache.notifiedAt = now;
    writeUpdateCache(cache);

    return buildUpdateDirective(localVersion, latest);
  } catch {
    return null;
  }
}

async function cli() {
  const ctx = loadContext(process.cwd());
  const updateDirective = await computeUpdateDirective();

  if (!ctx.hasProduct) {
    // Direct stdout message instead of relying on empty output as a signal
    // — cheap models miss the empty case more often than the explicit one.
    const parts = [
      'NO_PRODUCT_MD: This project has no PRODUCT.md yet. ' +
      'Stop the current task, load reference/init.md, and follow its ' +
      'instructions to write PRODUCT.md before resuming.',
    ];
    if (updateDirective) parts.push(updateDirective);
    process.stdout.write(parts.join('\n\n---\n\n') + '\n');
    process.exit(0);
  }
  const parts = [`# PRODUCT.md\n\n${ctx.product.trim()}`];
  if (ctx.hasDesign) {
    parts.push(`# DESIGN.md\n\n${ctx.design.trim()}`);
  }
  const register = extractRegister(ctx.product);
  const next = register
    ? `NEXT STEP: This project's register is \`${register}\`. You MUST now read \`reference/${register}.md\` before producing any design output.`
    : `NEXT STEP: You MUST now read the matching register reference (\`reference/brand.md\` or \`reference/product.md\`) before producing any design output. Pick based on PRODUCT.md above.`;
  parts.push(next);
  if (updateDirective) parts.push(updateDirective);
  process.stdout.write(parts.join('\n\n---\n\n') + '\n');
}

// Run cli() only when this module is the entry point. Compare realpaths
// rather than endsWith(): a loose suffix match also fires for unrelated
// scripts like `load-context.mjs`, and realpath tolerates symlinked
// invocation (the test harness symlinks the skill dir).
function invokedAsScript() {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return fs.realpathSync(arg) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedAsScript()) {
  cli();
}
