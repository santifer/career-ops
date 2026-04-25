// Apify transport helper — runs pre-built actors and returns dataset items.
// Used by Apify-backed providers (e.g. providers/apify.mjs).
//
// Uses the async pattern (start → poll → fetch dataset) rather than the
// long-polling /run-sync-get-dataset-items endpoint, which holds one HTTP
// connection open for the full actor run and gets cut by some networks /
// Windows SChannel before Apify can flush the response.
//
// Requires APIFY_TOKEN in the environment. Callers should use hasToken()
// to short-circuit gracefully when the token is missing, so scan.mjs
// continues to work for users who haven't set up Apify.

const APIFY_API_BASE = 'https://api.apify.com/v2';
const DEFAULT_RUN_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 3_000;
const PER_REQUEST_TIMEOUT_MS = 15_000;
const CONNECT_RETRY_ATTEMPTS = 3;
const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);

export function hasToken() {
  return Boolean(process.env.APIFY_TOKEN);
}

// Apify accepts both "user/actor" and "user~actor" in URLs; normalize to `~`.
function normalizeActorId(actorId) {
  return actorId.replace('/', '~');
}

// Apify supports auth via ?token= or Authorization: Bearer. The query-string
// form leaks the token into HTTP access logs and any error/log line that
// includes the URL, so always use the header.
function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchJsonOnce(url, init = {}, timeoutMs = PER_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Cold connects to api.apify.com occasionally exceed Undici's 10s internal
// connect timeout on this host — retry with backoff before giving up.
async function fetchJson(url, init = {}, timeoutMs = PER_REQUEST_TIMEOUT_MS, attempts = CONNECT_RETRY_ATTEMPTS) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchJsonOnce(url, init, timeoutMs);
    } catch (err) {
      lastErr = err;
      if (err.status >= 400 && err.status < 500) throw err;
      if (i < attempts - 1) await sleep(500 * (i + 1));
    }
  }
  throw lastErr;
}

async function startRun(actorId, input, token) {
  const url = `${APIFY_API_BASE}/acts/${normalizeActorId(actorId)}/runs`;
  const body = await fetchJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(input || {}),
  });
  const runId = body?.data?.id;
  if (!runId) {
    throw new Error(`Apify did not return a run id: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return runId;
}

// Best-effort — if we give up on a run, stop the actor so credits aren't wasted.
// A short timeout keeps a flaky network from leaving this request pending and
// blocking scan task completion.
async function abortRun(runId, token) {
  const url = `${APIFY_API_BASE}/actor-runs/${runId}/abort`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(url, { method: 'POST', headers: authHeaders(token), signal: controller.signal });
  } catch {} finally {
    clearTimeout(timer);
  }
}

async function waitForRun(runId, token, deadline, timeoutMs) {
  const url = `${APIFY_API_BASE}/actor-runs/${runId}`;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const body = await fetchJsonOnce(url, { headers: authHeaders(token) });
      const run = body?.data;
      if (run && TERMINAL_STATUSES.has(run.status)) return run;
      lastError = undefined;
    } catch (err) {
      lastError = err;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  await abortRun(runId, token);
  const suffix = lastError ? ` (last error: ${lastError.message})` : '';
  throw new Error(`Apify run ${runId} did not finish within ${Math.round(timeoutMs / 1000)}s${suffix}`);
}

async function fetchDatasetItems(runId, token) {
  const url = `${APIFY_API_BASE}/actor-runs/${runId}/dataset/items`;
  const items = await fetchJson(url, { headers: authHeaders(token) }, PER_REQUEST_TIMEOUT_MS * 2);
  if (!Array.isArray(items)) {
    throw new Error(`Apify run ${runId} returned non-array dataset payload`);
  }
  return items;
}

export async function runActor(actorId, input, { timeoutMs = DEFAULT_RUN_TIMEOUT_MS } = {}) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN not set');

  const deadline = Date.now() + timeoutMs;
  const runId = await startRun(actorId, input, token);
  const run = await waitForRun(runId, token, deadline, timeoutMs);

  if (run.status !== 'SUCCEEDED') {
    const reason = run.statusMessage ? `: ${run.statusMessage}` : '';
    throw new Error(`Apify actor ${actorId} finished with status ${run.status}${reason}`);
  }

  return await fetchDatasetItems(runId, token);
}
