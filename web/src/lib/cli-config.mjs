/**
 * cli-config.mjs — the one place that reads and writes the selected CLI.
 *
 * The Config page detects installed CLIs and auto-selects the first one it finds,
 * which paints a green check and a selected border. That selection used to live
 * only in React state, so a user who never pressed "Save config" saw a configured
 * engine while `localStorage["career-ops:config"]` stayed empty, and every run
 * launched from it died with "No CLI configured". Shown state and persisted state
 * are now the same state: whatever auto-selects is written straight through.
 *
 * `resolveCliId` is the read path for anything that actually launches a run. It
 * prefers the saved choice, and only when there is none does it ask the server
 * what is installed and persist that answer, so the fallback happens once rather
 * than on every launch.
 *
 * Plain .mjs, dependency-free (same pattern as job-url.mjs / pdf-paths.mjs) so the
 * sibling test suite can import it under bare Node with no DOM.
 */

export const CONFIG_KEY = "career-ops:config";

/** localStorage in the browser, null anywhere it does not exist (SSR, tests). */
function defaultStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage disabled (private mode, blocked cookies)
  }
}

/**
 * The stored config object, or `{}` for absent/corrupt/unavailable storage.
 * Never throws: every caller is a render or launch path that must not break
 * because a user cleared their storage mid-session.
 *
 * @param {Storage|null} [storage]
 * @returns {Record<string, unknown>}
 */
export function readConfig(storage = defaultStorage()) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(CONFIG_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/**
 * The saved CLI id, or null when nothing has been chosen yet.
 *
 * @param {Storage|null} [storage]
 * @returns {string|null}
 */
export function readCliId(storage = defaultStorage()) {
  const id = readConfig(storage).cliId;
  return typeof id === "string" && id ? id : null;
}

/**
 * Persist a CLI choice, merging into whatever else is already stored so writing
 * the engine never drops the user's `logos` / `provider` preferences. `mode` is
 * pinned to "cli" because selecting an installed CLI is what that mode means,
 * and the other two modes are not wired yet.
 *
 * @param {string} id
 * @param {Storage|null} [storage]
 * @returns {boolean} whether the write landed
 */
export function saveCliId(id, storage = defaultStorage()) {
  if (!storage || !id) return false;
  try {
    storage.setItem(CONFIG_KEY, JSON.stringify({ ...readConfig(storage), mode: "cli", cliId: id }));
    return true;
  } catch {
    return false; // quota / disabled storage
  }
}

/**
 * The CLI to default to out of a /api/clis payload: the first installed one, in
 * the order lib/clis.ts lists them (Claude Code first, which is the best-supported
 * runtime per the Config page copy).
 *
 * @param {Array<{id?: string, installed?: boolean}>|null|undefined} clis
 * @returns {string|null}
 */
export function pickDefaultCli(clis) {
  if (!Array.isArray(clis)) return null;
  const found = clis.find((c) => c && c.installed && typeof c.id === "string" && c.id);
  return found ? found.id : null;
}

/**
 * The CLI id to launch a run with: the saved choice, or the first installed CLI
 * on this machine (persisted, so the next read is synchronous). Returns null only
 * when there is genuinely no CLI to use, which is the case the callers report as
 * "No CLI configured".
 *
 * @param {{storage?: Storage|null, fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<string|null>}
 */
export async function resolveCliId(opts = {}) {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const saved = readCliId(storage);
  if (saved) return saved;

  const fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!fetchImpl) return null;
  try {
    const res = await fetchImpl("/api/clis");
    if (!res || !res.ok) return null;
    const data = await res.json();
    const id = pickDefaultCli(data && data.clis);
    if (!id) return null;
    saveCliId(id, storage);
    return id;
  } catch {
    return null; // offline / route down: the caller reports it as unconfigured
  }
}
