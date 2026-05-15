import { classifyLiveness } from '../liveness-core.mjs';
import { fetchWithTimeout } from './fetch-utils.mjs';

// Multilingual apply-control regex. Matches visible buttons/links so classifyLiveness can
// distinguish "page loaded but body is footer/nav only" from "real posting with Apply CTA".
const APPLY_CONTROL_RE =
  /\b(apply\s+now|easy\s+apply|submit\s+application|start\s+application|apply\s+for\s+this\s+(job|role|position)|bewerben|jetzt\s+bewerben|postuler|solicitar(?:\s+ahora)?|ich\s+bewerbe\s+mich)\b/gi;

// Unified liveness check used by triage.mjs and batch-runner-batches.mjs.
// Returns a normalized shape both callers can branch on:
//   live=true  → posting is active (visible Apply control)
//   live=false → posting expired (404/410, hard pattern, listing page, or empty body)
//   live=null  → uncertain (network error, soft state, body present but no CTA)
// `body` contains the fetched HTML (full response) so callers can slice as needed.
export async function checkUrl(url, opts = {}) {
  const { timeoutMs = 15_000, headers = {} } = opts;
  try {
    const { status, text, finalUrl } = await fetchWithTimeout(
      url,
      { redirect: 'follow', headers },
      timeoutMs,
    );

    // Hard HTTP failures — short-circuit before pattern matching.
    if (status === 404 || status === 410) {
      return { live: false, reason: `HTTP ${status}`, body: '', status };
    }
    if (status >= 400) {
      return { live: null, reason: `HTTP ${status} (uncertain)`, body: '', status };
    }

    const applyControls = (text.match(APPLY_CONTROL_RE) || []).slice(0, 10);
    const { result, reason } = classifyLiveness({
      status,
      finalUrl,
      bodyText: text,
      applyControls,
    });

    const live = result === 'active' ? true : result === 'expired' ? false : null;
    return { live, reason, body: text, status };
  } catch (err) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return {
      live: null,
      reason: isTimeout ? `timeout (${timeoutMs}ms)` : (err?.message?.slice(0, 80) || 'fetch error'),
      body: '',
      status: 0,
    };
  }
}
