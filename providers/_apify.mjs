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
// Validate strictly so a malformed config can't escape the intended
// /acts/<actor>/runs path with extra `/`, `..`, `?`, or `#` characters and
// send our bearer token to an unintended endpoint on api.apify.com.
const ACTOR_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*[~/][A-Za-z0-9][A-Za-z0-9_.-]*$/;

export function normalizeActorId(actorId) {
  if (typeof actorId !== 'string' || !ACTOR_ID_RE.test(actorId)) {
    throw new Error(
      `apify: invalid actorId ${JSON.stringify(actorId)}. ` +
      `Expected "owner/actor" or "owner~actor" with letters, digits, "_", ".", or "-" only.`
    );
  }
  const [owner, name] = actorId.split(/[~/]/, 2);
  return `${encodeURIComponent(owner)}~${encodeURIComponent(name)}`;
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
// When `deadline` is provided, each attempt's per-request timeout and the
// inter-attempt backoff are both capped against the remaining budget so the
// total time spent here can't blow past the caller's overall ceiling.
async function fetchJson(
  url,
  init = {},
  timeoutMs = PER_REQUEST_TIMEOUT_MS,
  attempts = CONNECT_RETRY_ATTEMPTS,
  deadline = null,
) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    let thisTimeout = timeoutMs;
    if (deadline != null) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw lastErr || new Error('Apify request budget exhausted');
      thisTimeout = Math.min(timeoutMs, remainingMs);
    }
    try {
      return await fetchJsonOnce(url, init, thisTimeout);
    } catch (err) {
      lastErr = err;
      if (err.status >= 400 && err.status < 500) throw err;
      if (i < attempts - 1) {
        const backoff = 500 * (i + 1);
        const sleepMs = deadline != null ? Math.min(backoff, deadline - Date.now()) : backoff;
        if (sleepMs > 0) await sleep(sleepMs);
        else if (deadline != null) throw lastErr;
      }
    }
  }
  throw lastErr;
}

async function startRun(actorId, input, token, deadline = null) {
  const url = `${APIFY_API_BASE}/acts/${normalizeActorId(actorId)}/runs`;
  const body = await fetchJson(
    url,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify(input || {}),
    },
    PER_REQUEST_TIMEOUT_MS,
    CONNECT_RETRY_ATTEMPTS,
    deadline,
  );
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
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    try {
      // Cap the per-request timeout by the remaining budget so a single slow
      // poll can't blow past `timeoutMs` before the abort logic runs.
      const body = await fetchJsonOnce(
        url,
        { headers: authHeaders(token) },
        Math.min(PER_REQUEST_TIMEOUT_MS, remainingMs),
      );
      const run = body?.data;
      if (run && TERMINAL_STATUSES.has(run.status)) return run;
      lastError = undefined;
    } catch (err) {
      // 4xx from the run-status endpoint (401/403 auth revoked, 404 run not
      // found) won't ever succeed on retry. Surface the real cause instead
      // of looping until the deadline and masking it as a generic timeout.
      // Matches the same policy fetchJson() applies to its retry loop.
      if (err?.status >= 400 && err.status < 500) throw err;
      lastError = err;
    }
    // Same cap for the sleep — if the budget is almost gone, don't waste it
    // on a fixed interval before the loop exits.
    const sleepMs = Math.min(POLL_INTERVAL_MS, deadline - Date.now());
    if (sleepMs > 0) await sleep(sleepMs);
  }
  // Fire-and-forget — abortRun() is best-effort cleanup (it already swallows
  // its own errors and has a 5s internal timeout), but awaiting it here would
  // add up to those 5s to the function's total runtime AFTER the user's
  // timeoutMs budget has already been exhausted. The wall-clock contract of
  // runActor() is end-to-end within timeoutMs, so we let abortRun complete in
  // the background and throw immediately.
  void abortRun(runId, token).catch(() => {});
  const suffix = lastError ? ` (last error: ${lastError.message})` : '';
  throw new Error(`Apify run ${runId} did not finish within ${Math.round(timeoutMs / 1000)}s${suffix}`);
}

async function fetchDatasetItems(runId, token, deadline = null) {
  const url = `${APIFY_API_BASE}/actor-runs/${runId}/dataset/items`;
  const items = await fetchJson(
    url,
    { headers: authHeaders(token) },
    PER_REQUEST_TIMEOUT_MS * 2,
    CONNECT_RETRY_ATTEMPTS,
    deadline,
  );
  if (!Array.isArray(items)) {
    throw new Error(`Apify run ${runId} returned non-array dataset payload`);
  }
  return items;
}

export async function runActor(actorId, input, { timeoutMs = DEFAULT_RUN_TIMEOUT_MS } = {}) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN not set');
  // Validate up front — a NaN or negative timeoutMs would yield a malformed
  // deadline (Date.now() + NaN = NaN) and the loop in waitForRun would never
  // enter, producing a confusing "did not finish within 0s" error.
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`apify: invalid timeoutMs ${JSON.stringify(timeoutMs)} (must be a positive finite number of milliseconds)`);
  }

  // Single deadline shared across startRun → waitForRun → fetchDatasetItems
  // so the user-supplied `timeoutMs` is the end-to-end ceiling, not just the
  // wait-loop ceiling. Each helper caps its internal retry/backoff against
  // the remaining budget via fetchJson(..., deadline).
  const deadline = Date.now() + timeoutMs;
  const runId = await startRun(actorId, input, token, deadline);
  const run = await waitForRun(runId, token, deadline, timeoutMs);

  if (run.status !== 'SUCCEEDED') {
    const reason = run.statusMessage ? `: ${run.statusMessage}` : '';
    throw new Error(`Apify actor ${actorId} finished with status ${run.status}${reason}`);
  }

  return await fetchDatasetItems(runId, token, deadline);
}
