/**
 * index.ts — background service worker entrypoint.
 *
 * Responsibilities:
 *   • Route PopupRequest messages from the popup.
 *   • Capture the active tab via chrome.scripting.executeScript.
 *   • Proxy bridge HTTP calls.
 *   • Maintain SSE subscriptions and re-fan events to popup ports.
 *
 * MV3 note: this is a service worker, not a persistent background page.
 * It may be killed and restarted at any time. All mutable state must
 * live either in chrome.storage or be recoverable on restart.
 *
 * The one exception: active SSE subscriptions are held in a module-level
 * Map. If the worker is evicted, the SSE stream terminates and the popup
 * must resubscribe. That is acceptable for Phase 2 — popups live for
 * seconds, not hours.
 */

import type {
  CapturedTab,
  ExtensionState,
  JobPortMessage,
  NewGradPendingCacheWarmResult,
  PopupRequest,
  PopupResponse,
} from "../contracts/messages.js";
import type {
  EvaluationResult,
  BridgeError,
  EnrichedRow,
  FilteredRow,
  JobEvent,
  JobId,
  JobSnapshot,
  NewGradDetail,
  NewGradEnrichResult,
  NewGradPendingEntry,
  NewGradRow,
  PipelineEntry,
  ScoredRow,
  StructuredJobSignals,
} from "../contracts/bridge-wire.js";

import { loadState, patchState } from "./state.js";
import { bridgeClientFromState } from "./bridge-client.js";
import { resolvePermissionOrigin } from "../shared/permissions.js";
import { extractNewGradList } from "../content/extract-newgrad.js";

/* -------------------------------------------------------------------------- */
/*  Authenticated client helper — eliminates repeated load+check boilerplate  */
/* -------------------------------------------------------------------------- */

async function authenticatedClient() {
  const state = await loadState();
  if (!state.bridgeToken) {
    return { state, client: null as never, error: { code: "UNAUTHORIZED" as const, message: "bridge token not configured" } };
  }
  return { state, client: bridgeClientFromState(state), error: null };
}

/* -------------------------------------------------------------------------- */
/*  Subscription registry                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Open SSE streams keyed by jobId. An entry exists while the stream is
 * running; the AbortController tears it down. One stream per job; multiple
 * ports may share a stream (e.g. popup reopened while job still running).
 */
interface Subscription {
  controller: AbortController;
  ports: Set<chrome.runtime.Port>;
}
const subscriptions = new Map<JobId, Subscription>();

/* -------------------------------------------------------------------------- */
/*  Toolbar icon click → toggle panel in active tab                           */
/* -------------------------------------------------------------------------- */

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { kind: "togglePanel" });
  } catch {
    // Content script not yet loaded — inject it first, then toggle
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["panel.js"],
      });
      // Give it a moment to register the listener
      setTimeout(() => {
        if (tab.id) chrome.tabs.sendMessage(tab.id, { kind: "togglePanel" });
      }, 100);
    } catch {
      // Can't inject (chrome:// page, etc.) — ignore
    }
  }
});

/* -------------------------------------------------------------------------- */
/*  Message router                                                            */
/* -------------------------------------------------------------------------- */

chrome.runtime.onMessage.addListener(
  (rawMessage, _sender, sendResponse) => {
    void handleRequest(rawMessage as PopupRequest).then(sendResponse);
    return true; // keep the message channel open for async
  }
);

async function handleRequest(req: PopupRequest): Promise<PopupResponse> {
  try {
    switch (req.kind) {
      case "hasToken":
        return await handleHasToken();
      case "setToken":
        return await handleSetToken(req.token);
      case "getModePreference":
        return await handleGetModePreference();
      case "setModePreference":
        return await handleSetModePreference(req.preset);
      case "getHealth":
        return await handleGetHealth();
      case "captureActiveTab":
        return await handleCapture();
      case "checkLiveness":
        return await handleLiveness(req.url);
      case "startEvaluation":
        return await handleStartEvaluation(req.input);
      case "getJob":
        return await handleGetJob(req.jobId);
      case "subscribeJob":
        return handleSubscribeAck(req.jobId);
      case "unsubscribeJob":
        return handleUnsubscribeAck(req.jobId);
      case "openPath":
        return await handleOpenPath(req.absolutePath);
      case "getRecentJobs":
        return await handleGetRecentJobs(req.limit);
      case "readReport":
        return await handleReadReport(req.reportNum);
      case "mergeTracker":
        return await handleMergeTracker(req.dryRun);
      case "newgradExtractList":
        return await handleNewGradExtractList();
      case "newgradPending":
        return await handleNewGradPending(req.limit);
      case "newgradEvaluatePending":
        return await handleNewGradEvaluatePending(req.entries, req.sessionId, req.limit);
      case "newgradWarmPendingCache":
        return await handleNewGradWarmPendingCache(req.entries, req.sessionId, req.limit);
      case "newgradScore":
        return await handleNewGradScore(req.rows);
      case "newgradEnrichDetails":
        return await handleNewGradEnrichDetails(req.promotedRows, req.config);
      case "newgradEnrich":
        return await handleNewGradEnrich(req.rows, req.sessionId);
      case "openPermissionTab":
        return await handleOpenPermissionTab(req.origin, req.label);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Narrow return type to a failure envelope matching the request kind.
    const bridgeErr: BridgeError = { code: "INTERNAL", message };
    return failureFor(req, bridgeErr);
  }
}

function failureFor(req: PopupRequest, error: BridgeError): PopupResponse {
  // Every PopupResponse variant has `{ kind, ok: false, error }`.
  return { kind: req.kind, ok: false, error } as PopupResponse;
}

/* -------------------------------------------------------------------------- */
/*  Handlers                                                                  */
/* -------------------------------------------------------------------------- */

async function handleHasToken(): Promise<PopupResponse> {
  const state = await loadState();
  return {
    kind: "hasToken",
    ok: true,
    result: { present: state.bridgeToken.length > 0 },
  };
}

async function handleSetToken(token: string): Promise<PopupResponse> {
  const trimmed = token.trim();
  if (trimmed.length < 16) {
    return {
      kind: "setToken",
      ok: false,
      error: { code: "BAD_REQUEST", message: "token too short" },
    };
  }
  await patchState({ bridgeToken: trimmed });
  return { kind: "setToken", ok: true, result: { saved: true } };
}

async function handleGetModePreference(): Promise<PopupResponse> {
  const state = await loadState();
  return {
    kind: "getModePreference",
    ok: true,
    result: { preset: state.preferredBridgePreset },
  };
}

async function handleSetModePreference(
  preset: import("../contracts/messages.js").BridgePreset
): Promise<PopupResponse> {
  const next = await patchState({ preferredBridgePreset: preset });
  return {
    kind: "setModePreference",
    ok: true,
    result: { saved: true, preset: next.preferredBridgePreset },
  };
}

async function handleGetHealth(): Promise<PopupResponse> {
  const { client, error } = await authenticatedClient();
  if (error) return { kind: "getHealth", ok: false, error };
  const res = await client.getHealth();
  await patchState({
    lastHealthAt: new Date().toISOString(),
    lastHealthOk: res.ok,
  });
  if (res.ok) return { kind: "getHealth", ok: true, result: res.result };
  return { kind: "getHealth", ok: false, error: res.error };
}

async function getActiveHttpTab(): Promise<chrome.tabs.Tab | null> {
  const candidates = [
    await chrome.tabs.query({ active: true, currentWindow: true }),
    await chrome.tabs.query({ active: true, lastFocusedWindow: true }),
  ];

  for (const tabs of candidates) {
    const tab = tabs[0];
    if (tab && tab.id !== undefined && tab.url) {
      return tab;
    }
  }

  return null;
}

async function waitForTabComplete(
  tabId: number,
  timeoutMs = 15000,
): Promise<void> {
  await new Promise<void>((resolve) => {
    const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeoutMs);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type CaptureLogger = (event: string, payload: Record<string, unknown>) => void;

function scoreCapturedTab(captured: CapturedTab): number {
  const base = captured.pageText.length;
  const bonus =
    captured.detection?.label === "job_posting"
      ? 5000
      : captured.detection?.label === "likely_job_posting"
        ? 2000
        : 0;
  return base + bonus;
}

async function captureTabContext(
  tabId: number,
  tabMeta: { url: string; title: string },
  dbg: CaptureLogger,
  options: { returnEmptyFallback: boolean },
): Promise<CapturedTab | undefined> {
  let frames: chrome.webNavigation.GetAllFrameResultDetails[] = [];
  try {
    frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
    dbg("frames", {
      count: frames.length,
      urls: frames.map((frame) => ({ id: frame.frameId, url: frame.url })),
    });
  } catch (err) {
    dbg("frames.error", { err: String(err) });
  }

  const injectTop = async (): Promise<{
    result: CapturedTab | undefined;
    rawResults: chrome.scripting.InjectionResult<unknown>[];
  }> => {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    const raw = results[0]?.result as CapturedTab | undefined;
    return { result: raw ? { ...raw, tabId } : undefined, rawResults: results };
  };

  let captured: CapturedTab | undefined;
  try {
    const first = await injectTop();
    dbg("inject.top.first", {
      resultsLen: first.rawResults.length,
      frameIds: first.rawResults.map((result) => result.frameId),
      hasResult: Boolean(first.result),
      resultShape: first.result
        ? {
            titleLen: (first.result.title ?? "").length,
            pageTextLen: (first.result.pageText ?? "").length,
            captureState: first.result.captureState,
            detection: first.result.detection?.label,
          }
        : null,
    });
    captured = first.result;

    if (captured && captured.captureState === "hydrating") {
      await sleep(800);
      const retry = await injectTop();
      dbg("inject.top.retry", {
        hasResult: Boolean(retry.result),
        pageTextLen: retry.result?.pageText.length,
      });
      if (retry.result) captured = retry.result;
    }
  } catch (err) {
    dbg("inject.top.throw", { err: String(err) });
  }

  if (!captured || captured.pageText.length < 400) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ["content.js"],
      });
      dbg("inject.allFrames", {
        resultsLen: results.length,
        perFrame: results.map((result) => ({
          frameId: result.frameId,
          hasResult: Boolean(result.result),
          pageTextLen:
            (result.result as CapturedTab | undefined)?.pageText?.length ?? 0,
          detection: (result.result as CapturedTab | undefined)?.detection?.label,
        })),
      });

      let best: CapturedTab | undefined;
      let bestScore = -1;
      for (const result of results) {
        const current = result.result as CapturedTab | undefined;
        if (!current) continue;
        const score = scoreCapturedTab(current);
        if (score > bestScore) {
          best = current;
          bestScore = score;
        }
      }
      const currentScore = captured ? scoreCapturedTab(captured) : -1;
      if (best && bestScore > currentScore) {
        captured = { ...best, tabId };
      }
    } catch (err) {
      dbg("inject.allFrames.throw", { err: String(err) });
    }
  }

  if (!captured) {
    dbg("final.fallback.empty", {});
    if (!options.returnEmptyFallback) return undefined;
    return {
      tabId,
      url: tabMeta.url,
      title: tabMeta.title,
      pageText: "",
      detection: { label: "not_job_posting", confidence: 0.1, signals: [] },
      captureState: "hydrating",
      capturedAt: new Date().toISOString(),
    };
  }

  dbg("final.ok", {
    pageTextLen: captured.pageText.length,
    captureState: captured.captureState,
    detection: captured.detection?.label,
  });
  return captured;
}

const TRACKING_QUERY_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "utm_name",
  "ref",
  "source",
  "gh_src",
  "lever-source",
]);

function normalizeUrlCandidate(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    const keysToRemove: string[] = [];
    parsed.searchParams.forEach((_value, key) => {
      if (TRACKING_QUERY_PARAMS.has(key)) {
        keysToRemove.push(key);
      }
    });
    for (const key of keysToRemove) {
      parsed.searchParams.delete(key);
    }
    parsed.pathname = trimTrailingSlash(parsed.pathname.replace(/\/{2,}/g, "/"));
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function canonicalizeJobUrlKey(url: string | null | undefined): string | null {
  const normalized = normalizeUrlCandidate(url);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const oracleJobId = parsed.pathname.match(
      /\/CandidateExperience\/(?:[^/]+\/)?(?:sites\/[^/]+\/)?job\/([^/?#]+)/i,
    )?.[1];
    if (oracleJobId) {
      return `${parsed.origin}/hcmUI/CandidateExperience/job/${oracleJobId}`;
    }

    const genericJobIdMatch = parsed.pathname.match(
      /^(.*?\/job\/)(?=[A-Za-z0-9_-]*\d)([A-Za-z0-9_-]{5,})(?:\/.*)?$/i,
    );
    if (genericJobIdMatch) {
      return `${parsed.origin}${trimTrailingSlash(`${genericJobIdMatch[1]}${genericJobIdMatch[2]}`)}`;
    }

    return normalized;
  } catch {
    return normalized;
  }
}

function trimTrailingSlash(value: string): string {
  if (value === "/") return value;
  return value.replace(/\/+$/, "");
}

function isJobrightUrl(url: string | null | undefined): boolean {
  const normalized = normalizeUrlCandidate(url);
  if (!normalized) return false;

  try {
    const parsed = new URL(normalized);
    return (
      parsed.hostname === "jobright.ai" ||
      parsed.hostname.endsWith(".jobright.ai")
    );
  } catch {
    return false;
  }
}

function isNewGradJobsUrl(url: string | null | undefined): boolean {
  const normalized = normalizeUrlCandidate(url);
  if (!normalized) return false;

  try {
    const parsed = new URL(normalized);
    return (
      parsed.hostname === "www.newgrad-jobs.com" ||
      parsed.hostname.endsWith(".newgrad-jobs.com")
    );
  } catch {
    return false;
  }
}

function scoreUrlCandidate(url: string | null | undefined): number {
  const normalized = normalizeUrlCandidate(url);
  if (!normalized) return Number.NEGATIVE_INFINITY;

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const full = `${host}${path}${parsed.search.toLowerCase()}`;
    const atsHosts = [
      "greenhouse",
      "ashbyhq.com",
      "lever.co",
      "workdayjobs.com",
      "myworkdayjobs.com",
      "smartrecruiters.com",
      "jobvite.com",
      "icims.com",
    ];
    const noiseHosts = [
      "linkedin.com",
      "crunchbase.com",
      "glassdoor.com",
      "facebook.com",
      "instagram.com",
      "x.com",
      "twitter.com",
      "youtube.com",
      "marketbeat.com",
      "media.licdn.com",
    ];
    const applyHints = [
      "/apply",
      "/job",
      "/jobs",
      "/career",
      "/careers",
      "/position",
      "/positions",
      "gh_jid",
      "jobid",
      "job_id",
      "requisition",
      "req_id",
      "token=",
      "lever-source",
      "ashby_jid",
    ];

    if (noiseHosts.some((pattern) => host.includes(pattern))) return -100;

    let score = 0;
    if (atsHosts.some((pattern) => host.includes(pattern))) score += 100;
    if (applyHints.some((pattern) => full.includes(pattern))) score += 24;
    if (/\b(apply|job|jobs|career|careers|position|opening|opportunit)\b/.test(full)) {
      score += 12;
    }

    if (isJobrightUrl(normalized)) {
      score -= 80;
      if (path.startsWith("/jobs/info/")) score -= 30;
    } else {
      score += 40;
    }

    return score;
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
}

function pickBestCandidateUrl(
  ...candidates: Array<string | null | undefined>
): string | null {
  let bestUrl: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const normalized = normalizeUrlCandidate(candidate);
    if (!normalized) continue;

    const score = scoreUrlCandidate(normalized);
    if (score > bestScore) {
      bestScore = score;
      bestUrl = normalized;
    }
  }

  return bestUrl;
}

function hasExternalCandidateUrl(
  ...candidates: Array<string | null | undefined>
): boolean {
  const best = pickBestCandidateUrl(...candidates);
  return Boolean(best && !isJobrightUrl(best) && !isNewGradJobsUrl(best));
}

async function confirmOriginalPostingBlockers(
  ...candidates: Array<string | null | undefined>
): Promise<Pick<NewGradDetail,
  "confirmedSponsorshipSupport" |
  "confirmedRequiresActiveSecurityClearance"
> & { confirmationUrl: string | null }> {
  const emptyResult = {
    confirmationUrl: null,
    confirmedSponsorshipSupport: "unknown" as const,
    confirmedRequiresActiveSecurityClearance: false,
  };

  const targetUrl = pickBestCandidateUrl(...candidates);
  if (!targetUrl || isJobrightUrl(targetUrl) || isNewGradJobsUrl(targetUrl)) {
    return emptyResult;
  }

  const perm = resolvePermissionOrigin(targetUrl);
  if (perm) {
    const alreadyGranted = await chrome.permissions.contains({
      origins: [perm.pattern],
    });
    if (!alreadyGranted) {
      return emptyResult;
    }
  }

  let tabIdToClose: number | null = null;
  try {
    const tab = await chrome.tabs.create({ url: targetUrl, active: false });
    if (tab.id === undefined) return emptyResult;
    tabIdToClose = tab.id;

    await waitForTabComplete(tab.id);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        function collectText(): string {
          const bodyText = document.body?.innerText ?? "";
          const scriptText = Array.from(
            document.querySelectorAll(
              "script[type='application/ld+json'], script[type='application/json'], script#__NEXT_DATA__"
            )
          )
            .map((script) => script.textContent ?? "")
            .join("\n");
          return `${bodyText}\n${scriptText}`;
        }

        function parseSponsorshipStatus(text: string): "yes" | "no" | "unknown" {
          const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
          if (!normalized) return "unknown";

          const negativeSignals = [
            "no sponsorship",
            "without sponsorship",
            "unable to sponsor",
            "cannot sponsor",
            "can't sponsor",
            "will not sponsor",
            "does not provide sponsorship",
            "sponsorship not available",
            "no visa sponsorship",
            "not eligible for visa sponsorship",
            "must be authorized to work without sponsorship",
            "work authorization without sponsorship",
          ];
          if (negativeSignals.some((signal) => normalized.includes(signal))) {
            return "no";
          }

          const positiveSignals = [
            "visa sponsorship available",
            "sponsorship available",
            "work authorization support",
            "immigration support",
          ];
          if (positiveSignals.some((signal) => normalized.includes(signal))) {
            return "yes";
          }

          return "unknown";
        }

        function requiresActiveSecurityClearance(text: string): boolean {
          const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
          if (!normalized) return false;
          const segments = normalized
            .split(/[\n\r.;!?]+/)
            .map((segment) => segment.trim())
            .filter(Boolean);

          for (const segment of segments) {
            if (
              /\b(preferred|preference|nice to have|plus|public trust)\b/.test(segment) ||
              /\b(ability|eligible|eligibility|able)\s+to\s+obtain\b/.test(segment) ||
              /\bobtain(?:ed|ing)?\b/.test(segment)
            ) {
              continue;
            }
            if (
              /\b(active|current)\s+secret(?:\s+security)?\s+clearance\b/.test(segment) ||
              /\b(active|current)\s+security\s+clearance\b/.test(segment) ||
              /\btop\s+secret(?:\s+security)?\s+clearance\b/.test(segment) ||
              /\b(?:current\s+)?ts\/sci(?:\s+security)?\s+clearance\b/.test(segment) ||
              /\b(?:must\s+(?:have|possess)|requires?|required|need(?:ed)?|mandatory)\b.{0,40}\b(?:secret|top\s+secret|ts\/sci)(?:\s+security)?\s+clearance\b/.test(
                segment,
              ) ||
              (
                segment.length <= 120 &&
                /\b(top secret|ts\/sci)\b/.test(segment)
              )
            ) {
              return true;
            }
          }

          return false;
        }

        const combinedText = collectText();
        return {
          confirmationUrl: window.location.href,
          confirmedSponsorshipSupport: parseSponsorshipStatus(combinedText),
          confirmedRequiresActiveSecurityClearance:
            requiresActiveSecurityClearance(combinedText),
        };
      },
    });

    return (
      (results[0]?.result as typeof emptyResult | undefined) ?? emptyResult
    );
  } catch {
    return emptyResult;
  } finally {
    if (tabIdToClose !== null) {
      await chrome.tabs.remove(tabIdToClose).catch(() => undefined);
    }
  }
}

async function handleCapture(): Promise<PopupResponse> {
  const tab = await getActiveHttpTab();
  if (!tab || tab.id === undefined || !tab.url) {
    return {
      kind: "captureActiveTab",
      ok: false,
      error: { code: "NOT_FOUND", message: "no active tab" },
    };
  }
  // Refuse chrome://, about:, etc. — scripting API cannot inject there
  // and even if it could, there's no JD to extract.
  if (!/^https?:\/\//.test(tab.url)) {
    return {
      kind: "captureActiveTab",
      ok: false,
      error: {
        code: "BAD_REQUEST",
        message: `cannot capture non-http page: ${tab.url}`,
      },
    };
  }
  // Permission pre-check. For hosts outside the manifest's baseline
  // host_permissions, we need a user-granted origin before
  // chrome.scripting.executeScript can run. We surface this as a
  // BAD_REQUEST with detail.permissionRequired so the panel can show
  // the grant-tab CTA without the user seeing a generic INTERNAL.
  const perm = resolvePermissionOrigin(tab.url);
  if (perm) {
    const alreadyGranted = await chrome.permissions.contains({
      origins: [perm.pattern],
    });
    if (!alreadyGranted) {
      return {
        kind: "captureActiveTab",
        ok: false,
        error: {
          code: "BAD_REQUEST",
          message: `authorization needed for ${perm.label}`,
          detail: {
            permissionRequired: true,
            origin: perm.pattern,
            label: perm.label,
            isFamily: perm.isFamily,
          },
        },
      };
    }
  }
  const tabId = tab.id;
  // Diagnostics: dump every boundary crossing so when something fails
  // we can tell WHICH layer died (permission state vs injection
  // completed vs content IIFE returned empty vs iframe-only page).
  // Verbose by design — we are debugging a specific failure mode on
  // *.myworkdayjobs.com and need the full picture.
  const dbg = (event: string, payload: Record<string, unknown>): void => {
    // eslint-disable-next-line no-console
    console.log("[career-ops capture]", event, { url: tab.url, tabId, ...payload });
  };

  // Reconfirm the permission state we *just* checked, plus what
  // chrome.permissions.getAll reports — these should agree. If they
  // don't, Chrome is in a stale state after a grant.
  try {
    const all = await chrome.permissions.getAll();
    dbg("perm.getAll", {
      expectedPattern: perm?.pattern,
      grantedOrigins: all.origins ?? [],
    });
  } catch (err) {
    dbg("perm.getAll.error", { err: String(err) });
  }
  const captured = await captureTabContext(
    tabId,
    { url: tab.url, title: tab.title ?? "" },
    dbg,
    { returnEmptyFallback: true },
  );
  return { kind: "captureActiveTab", ok: true, result: captured! };
}

/**
 * Open the extension's permission-grant page in a new foreground tab.
 * The panel calls this when capture fails with detail.permissionRequired.
 * The grant page itself owns the user-gesture call to
 * chrome.permissions.request and posts "permissionGranted" back when
 * the user accepts.
 */
async function handleOpenPermissionTab(
  origin: string,
  label: string
): Promise<PopupResponse> {
  const url = chrome.runtime.getURL(
    `permission.html?origin=${encodeURIComponent(origin)}&label=${encodeURIComponent(label)}`
  );
  await chrome.tabs.create({ url, active: true });
  return { kind: "openPermissionTab", ok: true, result: { opened: true } };
}

async function handleLiveness(url: string): Promise<PopupResponse> {
  const state = await loadState();
  const client = bridgeClientFromState(state);
  const res = await client.checkLiveness(url);
  if (res.ok) return { kind: "checkLiveness", ok: true, result: res.result };
  return { kind: "checkLiveness", ok: false, error: res.error };
}

async function handleStartEvaluation(
  input: import("../contracts/bridge-wire.js").EvaluationInput
): Promise<PopupResponse> {
  const state = await loadState();
  const client = bridgeClientFromState(state);
  const res = await client.createEvaluation(input);
  if (!res.ok) {
    return { kind: "startEvaluation", ok: false, error: res.error };
  }
  const { jobId } = res.result;

  // Persist last-job for popup reopen.
  await patchState({ lastJobId: jobId });

  // Kick off the SSE stream immediately so we don't lose events between
  // POST and the popup's subscribe call.
  openStream(jobId, state);

  // Build a minimal initial snapshot for the popup to render while it
  // waits for the first real SSE event. The bridge's initial SSE frame
  // will overwrite this.
  const now = new Date().toISOString();
  const initialSnapshot: import("../contracts/bridge-wire.js").JobSnapshot = {
    id: jobId,
    phase: "queued",
    createdAt: now,
    updatedAt: now,
    input,
    progress: { phases: [{ phase: "queued", at: now }] },
  };

  return {
    kind: "startEvaluation",
    ok: true,
    result: { jobId, initialSnapshot },
  };
}

async function handleGetJob(jobId: JobId): Promise<PopupResponse> {
  const { client, error } = await authenticatedClient();
  if (error) return { kind: "getJob", ok: false, error };
  const res = await client.getJob(jobId);
  if (!res.ok) return { kind: "getJob", ok: false, error: res.error };
  return { kind: "getJob", ok: true, result: res.result };
}

function handleSubscribeAck(_jobId: JobId): PopupResponse {
  // Actual subscription happens via chrome.runtime.connect, not onMessage.
  // This message exists for symmetry; we just ack it.
  void _jobId;
  return { kind: "subscribeJob", ok: true, result: { subscribed: true } };
}

function handleUnsubscribeAck(_jobId: JobId): PopupResponse {
  void _jobId;
  return {
    kind: "unsubscribeJob",
    ok: true,
    result: { unsubscribed: true },
  };
}

async function handleOpenPath(absolutePath: string): Promise<PopupResponse> {
  // file:// URLs may require the user to explicitly grant access; we
  // open them in a new tab and let Chrome handle access. In Phase 2
  // we don't try to pre-flight that.
  try {
    await chrome.tabs.create({ url: `file://${absolutePath}` });
    return { kind: "openPath", ok: true, result: { opened: true } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind: "openPath",
      ok: false,
      error: { code: "INTERNAL", message },
    };
  }
}

async function handleGetRecentJobs(limit?: number): Promise<PopupResponse> {
  const { client, error } = await authenticatedClient();
  if (error) return { kind: "getRecentJobs", ok: false, error };
  const res = await client.getTracker(limit ?? 20);
  if (res.ok) return { kind: "getRecentJobs", ok: true, result: res.result };
  return { kind: "getRecentJobs", ok: false, error: res.error };
}

async function handleReadReport(reportNum: number): Promise<PopupResponse> {
  const { client, error } = await authenticatedClient();
  if (error) return { kind: "readReport", ok: false, error };
  const res = await client.getReport(reportNum);
  if (res.ok) return { kind: "readReport", ok: true, result: res.result };
  return { kind: "readReport", ok: false, error: res.error };
}

async function handleMergeTracker(dryRun?: boolean): Promise<PopupResponse> {
  const { client, error } = await authenticatedClient();
  if (error) return { kind: "mergeTracker", ok: false, error };
  const res = await client.mergeTracker(dryRun ?? false);
  if (res.ok) return { kind: "mergeTracker", ok: true, result: res.result };
  return { kind: "mergeTracker", ok: false, error: res.error };
}

/* -------------------------------------------------------------------------- */
/*  Newgrad-scan handlers                                                     */
/* -------------------------------------------------------------------------- */

async function handleNewGradExtractList(): Promise<PopupResponse> {
  const tab = await getActiveHttpTab();
  if (!tab || tab.id === undefined || !tab.url) {
    return {
      kind: "newgradExtractList",
      ok: false,
      error: { code: "NOT_FOUND", message: "no active tab" },
    };
  }
  if (
    !tab.url.includes("newgrad-jobs.com") &&
    !tab.url.includes("jobright.ai/minisites-jobs")
  ) {
    return {
      kind: "newgradExtractList",
      ok: false,
      error: {
        code: "BAD_REQUEST",
        message: `active tab is not on the supported newgrad scan source: ${tab.url}`,
      },
    };
  }
  let sourceTabId = tab.id;
  let closeSourceTab = false;

  if (tab.url.includes("newgrad-jobs.com")) {
    const iframeResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        function withForwardedParams(baseUrl: string): string {
          const sourceParams = new URLSearchParams(window.location.search);
          const url = new URL(baseUrl);
          url.searchParams.set("embed", "true");

          for (const key of ["u", "utm_source", "utm_campaign"]) {
            const value = sourceParams.get(key);
            if (value) url.searchParams.set(key, value);
          }

          return url.toString();
        }

        function selectedJobrightUrl(): string | null {
          const params = new URLSearchParams(window.location.search);
          const key = params.get("k");
          const selectedKey = params.get("selectedKey");
          const items = Array.from(
            document.querySelectorAll<HTMLElement>(".div-block-14, .airtable-trigger")
          );

          const selectedItem = items.find((item) => {
            const shortLink = item.getAttribute("short-link");
            const text = item.innerText.trim();
            return (
              (key !== null && shortLink === decodeURIComponent(key)) ||
              (selectedKey !== null && text === decodeURIComponent(selectedKey))
            );
          }) ?? document.querySelector<HTMLElement>(
            ".w-tab-pane.w--tab-active .div-block-14.active, .w-tab-pane.w--tab-active .airtable-trigger.active"
          ) ?? document.querySelector<HTMLElement>(
            ".w-tab-pane.w--tab-active .div-block-14, .w-tab-pane.w--tab-active .airtable-trigger"
          );

          const jobPath = selectedItem?.getAttribute("data-job-path");
          if (!jobPath || jobPath.trim() === "") return null;

          const cleanPath = jobPath.startsWith("/") ? jobPath.slice(1) : jobPath;
          return withForwardedParams(`https://jobright.ai/minisites-jobs/newgrad/${cleanPath}`);
        }

        const selected = selectedJobrightUrl();
        if (selected) return selected;

        const fallback = Array.from(document.querySelectorAll("iframe[src]"))
          .map((iframe) => (iframe as HTMLIFrameElement).src)
          .find((src) => src.includes("jobright.ai/minisites-jobs/newgrad"));
        if (fallback) return fallback;

        return withForwardedParams("https://jobright.ai/minisites-jobs/newgrad/us/swe");
      },
    });

    const sourceUrl = iframeResults[0]?.result as string | undefined;
    if (!sourceUrl) {
      return {
        kind: "newgradExtractList",
        ok: false,
        error: { code: "NOT_FOUND", message: "could not find the embedded Jobright scan source" },
      };
    }

    const sourceTab = await chrome.tabs.create({ url: sourceUrl, active: false });
    if (!sourceTab.id) {
      return {
        kind: "newgradExtractList",
        ok: false,
        error: { code: "INTERNAL", message: "failed to open the Jobright scan source tab" },
      };
    }

    sourceTabId = sourceTab.id;
    closeSourceTab = true;
    await waitForTabComplete(sourceTabId);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: sourceTabId },
      func: extractNewGradList,
    });

    const rows = results[0]?.result as NewGradRow[] | undefined;

    if (!rows) {
      return {
        kind: "newgradExtractList",
        ok: false,
        error: { code: "INTERNAL", message: "content script returned no result" },
      };
    }

    return {
      kind: "newgradExtractList",
      ok: true,
      result: {
        rows,
        pageInfo: { currentPage: 1, totalRows: rows.length },
      },
    };
  } finally {
    if (closeSourceTab) {
      await chrome.tabs.remove(sourceTabId).catch(() => undefined);
    }
  }
}

async function handleNewGradPending(limit = 100): Promise<PopupResponse> {
  const { client, error } = await authenticatedClient();
  if (error) return { kind: "newgradPending", ok: false, error };
  const res = await client.getNewGradPending(limit);
  if (!res.ok) return { kind: "newgradPending", ok: false, error: res.error };
  return { kind: "newgradPending", ok: true, result: res.result };
}

async function handleNewGradEvaluatePending(
  requestedEntries: NewGradPendingEntry[] | undefined,
  sessionId: string,
  limit = 100,
): Promise<PopupResponse> {
  const { client, error } = await authenticatedClient();
  if (error) return { kind: "newgradEvaluatePending", ok: false, error };

  const automaticBulkRun = !requestedEntries || requestedEntries.length === 0;
  let entries = requestedEntries;
  let skipped = 0;
  if (!entries || entries.length === 0) {
    const pending = await client.getNewGradPending(limit);
    if (!pending.ok) return { kind: "newgradEvaluatePending", ok: false, error: pending.error };
    const eligibleEntries = pending.result.entries.filter(canBulkDirectEvaluatePendingEntry);
    skipped = pending.result.entries.length - eligibleEntries.length;
    entries = [...eligibleEntries];
  }

  const directEval = await runDirectNewGradEvaluations(
    client,
    entries,
    [],
    sessionId,
    { automaticBulkRun },
  );
  return {
    kind: "newgradEvaluatePending",
    ok: true,
    result: {
      added: 0,
      skipped: skipped + directEval.skipped,
      entries,
      candidates: entries,
      queued: directEval.queued,
      evaluated: directEval.queued,
      failed: directEval.failed,
      jobs: directEval.jobs,
    },
  };
}

async function handleNewGradWarmPendingCache(
  requestedEntries: NewGradPendingEntry[] | undefined,
  sessionId: string,
  limit = 100,
): Promise<PopupResponse> {
  const { client, error } = await authenticatedClient();
  if (error) return { kind: "newgradWarmPendingCache", ok: false, error };

  let entries = requestedEntries;
  if (!entries || entries.length === 0) {
    const pending = await client.getNewGradPending(limit);
    if (!pending.ok) {
      return { kind: "newgradWarmPendingCache", ok: false, error: pending.error };
    }
    entries = [...pending.result.entries];
  }

  const targets = entries.filter(needsLegacyPendingCacheBackfill);
  const summary: NewGradPendingCacheWarmResult = {
    total: entries.length,
    targeted: targets.length,
    warmed: 0,
    skipped: entries.length - targets.length,
    failed: 0,
  };

  if (targets.length === 0) {
    return { kind: "newgradWarmPendingCache", ok: true, result: summary };
  }

  const backfillInputs: Array<{
    url: string;
    company: string;
    role: string;
    lineNumber: number;
    pageText: string;
  }> = [];

  for (let index = 0; index < targets.length; index++) {
    const entry = targets[index]!;
    chrome.runtime.sendMessage({
      kind: "newgradPendingBackfillProgress",
      sessionId,
      current: index + 1,
      total: targets.length,
      row: {
        company: entry.company,
        title: `Warming ${entry.role}`,
      },
    }).catch(() => { /* popup/panel may be closed */ });

    const preparedEntry = await hydratePendingEntryForEvaluation(entry);
    const pageText = preparedEntry.pageText?.trim();
    if (!pageText || pageText.length < 1_200 || typeof entry.lineNumber !== "number") {
      summary.skipped += 1;
      continue;
    }

    backfillInputs.push({
      url: entry.url,
      company: entry.company,
      role: entry.role,
      lineNumber: entry.lineNumber,
      pageText,
    });
  }

  for (let index = 0; index < backfillInputs.length; index += PENDING_BACKFILL_BATCH_SIZE) {
    const batch = backfillInputs.slice(index, index + PENDING_BACKFILL_BATCH_SIZE);
    const backfill = await client.backfillNewGradPendingCache(batch);
    if (!backfill.ok) {
      summary.failed += batch.length;
      continue;
    }

    for (const outcome of backfill.result.outcomes) {
      if (outcome.status === "updated") {
        summary.warmed += 1;
      } else {
        summary.failed += 1;
      }
    }
  }

  return { kind: "newgradWarmPendingCache", ok: true, result: summary };
}

async function handleNewGradScore(rows: NewGradRow[]): Promise<PopupResponse> {
  const { client, error } = await authenticatedClient();
  if (error) return { kind: "newgradScore", ok: false, error };
  const promoted: ScoredRow[] = [];
  const filtered: FilteredRow[] = [];
  const uniqueRows = dedupeNewGradRows(rows);
  const chunkSize = 50;

  for (let start = 0; start < uniqueRows.length; start += chunkSize) {
    const chunk = uniqueRows.slice(start, start + chunkSize);
    const res = await client.scoreNewGradRows(chunk);
    if (!res.ok) return { kind: "newgradScore", ok: false, error: res.error };
    promoted.push(...(res.result.promoted ?? []));
    filtered.push(...(res.result.filtered ?? []));
  }

  promoted.sort((a, b) => b.score - a.score);
  return {
    kind: "newgradScore",
    ok: true,
    result: { promoted, filtered },
  };
}

function dedupeNewGradRows(rows: NewGradRow[]): NewGradRow[] {
  const seen = new Set<string>();
  const uniqueRows: NewGradRow[] = [];

  for (const row of rows) {
    const key =
      normalizeUrlCandidate(row.detailUrl) ??
      normalizeUrlCandidate(row.applyUrl) ??
      `${row.company.trim().toLowerCase()}|${row.title.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRows.push(row);
  }

  return uniqueRows;
}

async function handleNewGradEnrichDetails(
  promotedRows: ScoredRow[],
  config: { concurrent: number; delayMinMs: number; delayMaxMs: number }
): Promise<PopupResponse> {
  const enrichedRows: EnrichedRow[] = [];
  let failed = 0;
  const queue = [...promotedRows];

  while (queue.length > 0) {
    const batch = queue.splice(0, config.concurrent);
    const results = await Promise.all(batch.map(async (scored) => {
      let tabIdToClose: number | null = null;
      try {
        // Open background tab
        const tab = await chrome.tabs.create({ url: scored.row.detailUrl, active: false });
        if (!tab.id) return null;
        tabIdToClose = tab.id;

        await waitForTabComplete(tab.id);

        // Inject detail extractor — FULLY self-contained inline function.
        const scriptResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const MAX_DESC_CHARS = 20000;

            /* ---- helpers (inlined — no closures) ---- */
            function txt(el: Element | null | undefined): string {
              if (!el) return "";
              return (
                (el as HTMLElement).innerText ?? el.textContent ?? ""
              ).trim();
            }

            function href(el: Element | null | undefined): string {
              if (!el) return "";
              return (el as HTMLAnchorElement).href ?? el.getAttribute("href") ?? "";
            }

            function first(root: Document | Element, ...selectors: string[]): Element | null {
              for (const sel of selectors) {
                try {
                  const found = root.querySelector(sel);
                  if (found) return found;
                } catch {
                  // Invalid selector — skip
                }
              }
              return null;
            }

            function labelledValue(label: string): string {
              const allEls = Array.from(
                document.querySelectorAll(
                  "dt, th, label, strong, b, [class*='label'], [class*='key'], [class*='field-name']"
                )
              );
              const lower = label.toLowerCase();
              for (const el of allEls) {
                const elText = txt(el).toLowerCase();
                if (elText.includes(lower)) {
                  const next = el.nextElementSibling;
                  if (next) {
                    const val = txt(next);
                    if (val) return val;
                  }
                  const parentNext = el.parentElement?.nextElementSibling;
                  if (parentNext) {
                    const val = txt(parentNext);
                    if (val) return val;
                  }
                  const parentText = txt(el.parentElement);
                  const idx = parentText.toLowerCase().indexOf(lower);
                  if (idx >= 0) {
                    const afterLabel = parentText.slice(idx + label.length).replace(/^[:\s]+/, "").trim();
                    if (afterLabel) return afterLabel;
                  }
                }
              }
              return "";
            }

            function addCandidate(set: Set<string>, value: string | null | undefined): void {
              if (!value) return;
              const trimmed = value.trim();
              if (!trimmed) return;
              try {
                const parsed = new URL(trimmed, window.location.href);
                if (!/^https?:$/.test(parsed.protocol)) return;
                parsed.hash = "";
                set.add(parsed.toString());
              } catch {
                // Ignore malformed URLs
              }
            }

            function scoreCandidate(candidate: string): number {
              try {
                const parsed = new URL(candidate);
                const host = parsed.hostname.toLowerCase();
                const path = parsed.pathname.toLowerCase();
                const full = `${host}${path}${parsed.search.toLowerCase()}`;
                const atsHosts = [
                  "greenhouse",
                  "ashbyhq.com",
                  "lever.co",
                  "workdayjobs.com",
                  "myworkdayjobs.com",
                  "smartrecruiters.com",
                  "jobvite.com",
                  "icims.com",
                ];
                const noiseHosts = [
                  "linkedin.com",
                  "crunchbase.com",
                  "glassdoor.com",
                  "facebook.com",
                  "instagram.com",
                  "x.com",
                  "twitter.com",
                  "youtube.com",
                  "marketbeat.com",
                  "media.licdn.com",
                ];
                const applyHints = [
                  "/apply",
                  "/job",
                  "/jobs",
                  "/career",
                  "/careers",
                  "/position",
                  "/positions",
                  "gh_jid",
                  "jobid",
                  "job_id",
                  "requisition",
                  "req_id",
                  "token=",
                  "lever-source",
                  "ashby_jid",
                ];

                if (noiseHosts.some((pattern) => host.includes(pattern))) return -100;

                let score = 0;
                if (atsHosts.some((pattern) => host.includes(pattern))) score += 100;
                if (applyHints.some((pattern) => full.includes(pattern))) score += 24;
                if (/\b(apply|job|jobs|career|careers|position|opening|opportunit)\b/.test(full)) {
                  score += 12;
                }
                if (host === "jobright.ai" || host.endsWith(".jobright.ai")) {
                  score -= 80;
                  if (path.startsWith("/jobs/info/")) score -= 30;
                } else {
                  score += 40;
                }
                return score;
              } catch {
                return Number.NEGATIVE_INFINITY;
              }
            }

            function pickBestUrl(candidates: Iterable<string>): string {
              let best = "";
              let bestScore = Number.NEGATIVE_INFINITY;

              for (const candidate of candidates) {
                const score = scoreCandidate(candidate);
                if (score > bestScore) {
                  best = candidate;
                  bestScore = score;
                }
              }

              return best;
            }

            function collectScriptUrls(): string[] {
              const urls = new Set<string>();
              const inlineUrlPattern = /https?:\/\/[^\s"'<>]+/g;

              function visit(value: unknown): void {
                if (typeof value === "string") {
                  addCandidate(urls, value);
                  for (const match of value.match(inlineUrlPattern) ?? []) {
                    addCandidate(urls, match);
                  }
                  return;
                }
                if (Array.isArray(value)) {
                  for (const item of value) visit(item);
                  return;
                }
                if (value && typeof value === "object") {
                  for (const entry of Object.values(value as Record<string, unknown>)) {
                    visit(entry);
                  }
                }
              }

              const scripts = Array.from(
                document.querySelectorAll(
                  "script#jobright-helper-job-detail-info, script#__NEXT_DATA__, script#job-posting, script[type='application/json'], script[type='application/ld+json']"
                )
              );
              for (const script of scripts) {
                const raw = script.textContent?.trim();
                if (!raw) continue;
                try {
                  visit(JSON.parse(raw));
                } catch {
                  for (const match of raw.match(inlineUrlPattern) ?? []) {
                    addCandidate(urls, match);
                  }
                }
              }

              return Array.from(urls);
            }

            function collectDomUrls(): string[] {
              const urls = new Set<string>();
              const elements = Array.from(
                document.querySelectorAll(
                  "a[href], form[action], [data-url], [data-href], [data-apply-url], [data-link], button, [role='button']"
                )
              );

              for (const element of elements) {
                addCandidate(urls, href(element));

                if (element instanceof HTMLFormElement) {
                  addCandidate(urls, element.action);
                }

                if (element instanceof HTMLElement) {
                  addCandidate(urls, element.dataset.url);
                  addCandidate(urls, element.dataset.href);
                  addCandidate(urls, element.dataset.applyUrl);
                  addCandidate(urls, element.dataset.link);
                }

                const text = txt(element).toLowerCase();
                if (
                  element instanceof HTMLAnchorElement &&
                  (
                    text.includes("original") ||
                    text.includes("apply on employer site") ||
                    text.includes("apply now") ||
                    text.includes("join now") ||
                    text.includes("apply for")
                  )
                ) {
                  addCandidate(urls, element.href);
                }
              }

              return Array.from(urls);
            }

            function uniqueStrings(values: Array<string | null | undefined>): string[] {
              const seen = new Set<string>();
              for (const value of values) {
                if (!value) continue;
                const trimmed = value.trim();
                if (!trimmed) continue;
                seen.add(trimmed);
              }
              return Array.from(seen);
            }

            function splitValues(value: string | null | undefined): string[] {
              if (!value) return [];
              return value
                .split(/[,|\n]/)
                .map((part) => part.trim())
                .filter(Boolean);
            }

            function parseSponsorshipStatus(text: string): "yes" | "no" | "unknown" {
              const normalized = text.trim().toLowerCase();
              if (!normalized) return "unknown";
              if (/\b(not sure|unknown|n\/a|unclear)\b/.test(normalized)) return "unknown";
              if (
                /\b(no|false)\b/.test(normalized) ||
                normalized.includes("no sponsorship") ||
                normalized.includes("without sponsorship") ||
                normalized.includes("unable to sponsor") ||
                normalized.includes("cannot sponsor") ||
                normalized.includes("can't sponsor")
              ) {
                return "no";
              }
              if (
                /\b(yes|true)\b/.test(normalized) ||
                normalized.includes("sponsor") ||
                normalized.includes("visa support") ||
                normalized.includes("work authorization support")
              ) {
                return "yes";
              }
              return "unknown";
            }

            function requiresActiveSecurityClearance(text: string): boolean {
              const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
              if (!normalized) return false;
              const segments = normalized
                .split(/[\n\r.;!?]+/)
                .map((segment) => segment.trim())
                .filter(Boolean);

              for (const segment of segments) {
                if (
                  /\b(preferred|preference|nice to have|plus|public trust)\b/.test(segment) ||
                  /\b(ability|eligible|eligibility|able)\s+to\s+obtain\b/.test(segment) ||
                  /\bobtain(?:ed|ing)?\b/.test(segment)
                ) {
                  continue;
                }
                if (
                  /\b(active|current)\s+secret(?:\s+security)?\s+clearance\b/.test(segment) ||
                  /\b(active|current)\s+security\s+clearance\b/.test(segment) ||
                  /\btop\s+secret(?:\s+security)?\s+clearance\b/.test(segment) ||
                  /\b(?:current\s+)?ts\/sci(?:\s+security)?\s+clearance\b/.test(segment) ||
                  /\b(?:must\s+(?:have|possess)|requires?|required|need(?:ed)?|mandatory)\b.{0,40}\b(?:secret|top\s+secret|ts\/sci)(?:\s+security)?\s+clearance\b/.test(
                    segment,
                  ) ||
                  (
                    segment.length <= 120 &&
                    /\b(top secret|ts\/sci)\b/.test(segment)
                  )
                ) {
                  return true;
                }
              }

              return false;
            }

            function normalizeEmploymentTypeValue(...candidates: string[]): string {
              for (const candidate of candidates) {
                const normalized = candidate.trim().toLowerCase();
                if (!normalized) continue;
                if (/\bfull[-\s]?time\b/.test(normalized)) return "Full-time";
                if (/\bpart[-\s]?time\b/.test(normalized)) return "Part-time";
                if (/\bcontract(or)?\b/.test(normalized)) return "Contract";
                if (/\bintern(ship)?\b/.test(normalized)) return "Internship";
              }
              return "";
            }

            function normalizeSeniorityValue(titleText: string, ...candidates: string[]): string {
              const titleNormalized = titleText.trim().toLowerCase();
              if (
                /\b(new grad|new graduate|graduate|entry level|entry-level|associate|junior|engineer i|engineer 1)\b/.test(
                  titleNormalized,
                )
              ) {
                return "Early career";
              }
              if (/\b(senior|staff|principal|lead|manager|director|architect)\b/.test(titleNormalized)) {
                return "Senior";
              }

              for (const candidate of candidates) {
                const normalized = candidate.trim().toLowerCase();
                if (!normalized) continue;
                if (
                  /\b(entry|entry level|associate|junior|new grad|new graduate|graduate|early career|engineer i|engineer 1)\b/.test(
                    normalized,
                  )
                ) {
                  return "Early career";
                }
                if (/\b(senior|staff|principal|lead|manager|director|architect)\b/.test(normalized)) {
                  return "Senior";
                }
              }

              return "";
            }

            function parseJobrightData(): {
              jobResult?: Record<string, unknown>;
              companyResult?: Record<string, unknown>;
              jobPosting?: Record<string, unknown>;
            } {
              const result: {
                jobResult?: Record<string, unknown>;
                companyResult?: Record<string, unknown>;
                jobPosting?: Record<string, unknown>;
              } = {};

              const helperRaw = document.querySelector("script#jobright-helper-job-detail-info")?.textContent?.trim();
              if (helperRaw) {
                try {
                  const parsed = JSON.parse(helperRaw) as {
                    jobResult?: Record<string, unknown>;
                    companyResult?: Record<string, unknown>;
                  };
                  if (parsed.jobResult) result.jobResult = parsed.jobResult;
                  if (parsed.companyResult) result.companyResult = parsed.companyResult;
                } catch {
                  // Ignore malformed embedded JSON
                }
              }

              const nextRaw = document.querySelector("script#__NEXT_DATA__")?.textContent?.trim();
              if (nextRaw) {
                try {
                  const parsed = JSON.parse(nextRaw) as {
                    props?: {
                      pageProps?: {
                        dataSource?: {
                          jobResult?: Record<string, unknown>;
                          companyResult?: Record<string, unknown>;
                        };
                      };
                    };
                  };
                  const dataSource = parsed.props?.pageProps?.dataSource;
                  if (!result.jobResult && dataSource?.jobResult) result.jobResult = dataSource.jobResult;
                  if (!result.companyResult && dataSource?.companyResult) result.companyResult = dataSource.companyResult;
                } catch {
                  // Ignore malformed __NEXT_DATA__
                }
              }

              const jobPostingRaw = document.querySelector("script#job-posting")?.textContent?.trim();
              if (jobPostingRaw) {
                try {
                  result.jobPosting = JSON.parse(jobPostingRaw) as Record<string, unknown>;
                } catch {
                  // Ignore malformed ld+json
                }
              }

              return result;
            }

            /* ---- title ---- */
            const titleEl = first(
              document,
              "h1[class*='title']",
              "h1[class*='job']",
              "[class*='job-title']",
              "[class*='position-title']",
              "h1"
            );
            const title = txt(titleEl);

            /* ---- company ---- */
            const companyEl = first(
              document,
              "[class*='company-name']",
              "[class*='company'] h2",
              "[class*='company'] a",
              "[class*='employer']"
            );
            const company = txt(companyEl) || labelledValue("company");

            /* ---- location ---- */
            const locationEl = first(
              document,
              "[class*='location']",
              "[class*='job-location']"
            );
            const location = txt(locationEl) || labelledValue("location");

            /* ---- employment type ---- */
            const employmentType = normalizeEmploymentTypeValue(
              labelledValue("employment type"),
              labelledValue("job type"),
              labelledValue("time type"),
            );

            /* ---- work model ---- */
            const workModelEl = first(
              document,
              "[class*='work-model']",
              "[class*='remote']",
              "[class*='workplace']"
            );
            const workModel =
              txt(workModelEl) ||
              labelledValue("work model") ||
              labelledValue("workplace type") ||
              labelledValue("remote");

            /* ---- seniority level ---- */
            const seniorityLevel = normalizeSeniorityValue(
              title,
              labelledValue("seniority"),
              labelledValue("experience level"),
              labelledValue("career level"),
            );

            /* ---- salary range ---- */
            const salaryEl = first(
              document,
              "[class*='salary']",
              "[class*='compensation']",
              "[class*='pay']"
            );
            const salaryRange =
              txt(salaryEl) ||
              labelledValue("salary") ||
              labelledValue("compensation") ||
              labelledValue("pay range");

            /* ---- Jobright match scores ---- */
            const bodyText = document.body?.innerText ?? "";

            function extractPercentage(pattern: RegExp): number | null {
              const m = bodyText.match(pattern);
              if (m && m[1]) {
                const n = parseInt(m[1], 10);
                return Number.isNaN(n) ? null : n;
              }
              return null;
            }

            const matchScore = extractPercentage(
              /(\d+)\s*%\s*(?:GOOD\s+MATCH|GREAT\s+MATCH|MATCH)/i
            );
            const expLevelMatch = extractPercentage(
              /experience\s+level\s*(?:match)?\s*[:\s]*(\d+)\s*%/i
            );
            const skillMatch = extractPercentage(
              /skills?\s*(?:match)?\s*[:\s]*(\d+)\s*%/i
            );
            const industryExpMatch = extractPercentage(
              /industry\s*(?:experience)?\s*(?:match)?\s*[:\s]*(\d+)\s*%/i
            );

            /* ---- description ---- */
            const descEl = first(
              document,
              "[class*='description']",
              "[class*='job-details']",
              "[class*='job-body']",
              "[class*='jd-content']",
              "article",
              "main [class*='content']",
              "main"
            );
            const rawDesc = txt(descEl) || txt(document.querySelector("main")) || "";
            const description = rawDesc
              .replace(/\s+\n/g, "\n")
              .replace(/[ \t]+/g, " ")
              .trim()
              .slice(0, MAX_DESC_CHARS);

            const embedded = parseJobrightData();
            const jobResult = embedded.jobResult ?? {};
            const companyResult = embedded.companyResult ?? {};
            const jobPosting = embedded.jobPosting ?? {};

            const domSkillTags = Array.from(
              document.querySelectorAll(".ant-tag, [class*='qualification-tag'], [class*='skill-tag'], [class*='tag']")
            ).map((el) => txt(el));

            const industries = uniqueStrings([
              ...splitValues(String(companyResult.companyCategories ?? "")),
              ...splitValues(String(jobPosting.industry ?? "")),
              ...(Array.isArray(jobResult.jobTags) ? jobResult.jobTags.map((value) => String(value)) : []),
            ]);
            const recommendationTags = uniqueStrings(
              Array.isArray(jobResult.recommendationTags)
                ? jobResult.recommendationTags.map((value) => String(value))
                : []
            );
            const responsibilities = uniqueStrings(
              Array.isArray(jobResult.coreResponsibilities)
                ? jobResult.coreResponsibilities.map((value) => String(value))
                : []
            );
            const requiredQualifications = uniqueStrings([
              ...(Array.isArray(jobResult.skillSummaries)
                ? jobResult.skillSummaries.map((value) => String(value))
                : []),
              ...(
                jobResult.qualifications &&
                typeof jobResult.qualifications === "object" &&
                Array.isArray((jobResult.qualifications as { mustHave?: unknown[] }).mustHave)
                  ? ((jobResult.qualifications as { mustHave?: unknown[] }).mustHave ?? []).map((value) => String(value))
                  : []
              ),
              ...(
                jobResult.qualifications &&
                typeof jobResult.qualifications === "object" &&
                Array.isArray((jobResult.qualifications as { preferredHave?: unknown[] }).preferredHave)
                  ? ((jobResult.qualifications as { preferredHave?: unknown[] }).preferredHave ?? []).map((value) => String(value))
                  : []
              ),
            ]);
            const skillTags = uniqueStrings([
              ...(Array.isArray(jobResult.jdCoreSkills)
                ? jobResult.jdCoreSkills.map((value) =>
                    value && typeof value === "object" && "skill" in value
                      ? String((value as { skill?: unknown }).skill ?? "")
                      : ""
                  )
                : []),
              ...(Array.isArray(jobResult.skillMatchingScores)
                ? jobResult.skillMatchingScores.map((value) =>
                    value && typeof value === "object" && "displayName" in value
                      ? String((value as { displayName?: unknown }).displayName ?? "")
                      : ""
                  )
                : []),
              ...domSkillTags,
            ]);
            const taxonomy = uniqueStrings(
              Array.isArray(jobResult.jobTaxonomyV3)
                ? jobResult.jobTaxonomyV3.map((value) => String(value))
                : []
            );
            const companyWebsite =
              (typeof companyResult.companyURL === "string" ? companyResult.companyURL : null) ||
              (
                jobPosting.hiringOrganization &&
                typeof jobPosting.hiringOrganization === "object" &&
                typeof (jobPosting.hiringOrganization as { sameAs?: unknown }).sameAs === "string"
                  ? String((jobPosting.hiringOrganization as { sameAs?: unknown }).sameAs)
                  : null
              );
            const companyDescription =
              typeof companyResult.companyDesc === "string" ? companyResult.companyDesc : null;
            const companySize =
              typeof companyResult.companySize === "string" ? companyResult.companySize : null;
            const companyLocation =
              typeof companyResult.companyLocation === "string" ? companyResult.companyLocation : null;
            const companyFoundedYear =
              typeof companyResult.companyFoundYear === "string" ? companyResult.companyFoundYear : null;
            const companyCategories = uniqueStrings(
              splitValues(typeof companyResult.companyCategories === "string" ? companyResult.companyCategories : "")
            );
            const h1bSponsorLikely =
              typeof jobResult.isH1bSponsor === "boolean"
                ? jobResult.isH1bSponsor
                : bodyText.toLowerCase().includes("h1b sponsor likely")
                  ? true
                  : null;
            const sponsorshipSupport =
              typeof jobResult.isH1bSponsor === "boolean"
                ? jobResult.isH1bSponsor
                  ? "yes"
                  : "no"
                : parseSponsorshipStatus(bodyText);
            const h1bSponsorshipHistory = Array.isArray(companyResult.h1bAnnualJobCount)
              ? companyResult.h1bAnnualJobCount
                  .map((value) => {
                    if (!value || typeof value !== "object") return null;
                    const year = String((value as { year?: unknown }).year ?? "").trim();
                    const count = Number((value as { count?: unknown }).count ?? NaN);
                    if (!year || Number.isNaN(count)) return null;
                    return { year, count };
                  })
                  .filter((value): value is { year: string; count: number } => value !== null)
              : [];
            const insiderConnections = Array.isArray(jobResult.socialConnections)
              ? jobResult.socialConnections.length
              : null;
            const activeSecurityClearanceRequired = requiresActiveSecurityClearance(
              [
                bodyText,
                description,
                requiredQualifications.join(" "),
                recommendationTags.join(" "),
              ].join(" ")
            );

            /* ---- original/apply URLs ---- */
            const origLink = first(
              document,
              "a[href*='original']",
              "a[class*='original']"
            );
            const originalCandidates = new Set<string>();
            addCandidate(originalCandidates, href(origLink));
            for (const a of Array.from(document.querySelectorAll("a[href]"))) {
              const linkText = txt(a).toLowerCase();
              if (
                linkText.includes("original") &&
                (linkText.includes("post") || linkText.includes("job"))
              ) {
                addCandidate(originalCandidates, href(a));
              }
            }

            const applyLink = first(
              document,
              "a[href*='greenhouse']",
              "a[href*='ashby']",
              "a[href*='lever.co']",
              "a[href*='workdayjobs']",
              "a[href*='myworkdayjobs']",
              "a[href*='smartrecruiters']",
              "a[href*='jobvite']",
              "a[href*='icims']",
              "a[href*='apply'][class*='btn']",
              "a[href*='apply'][class*='button']",
              "a[href*='apply']",
              "button[class*='apply']",
              "[class*='apply'] a",
              "a[class*='apply']"
            );
            const applyCandidates = new Set<string>();
            addCandidate(applyCandidates, href(applyLink));
            for (const a of Array.from(document.querySelectorAll("a[href]"))) {
              const linkText = txt(a).toLowerCase();
              if (
                linkText.includes("apply on employer site") ||
                linkText.includes("apply now") ||
                linkText.includes("join now") ||
                linkText.includes("apply for")
              ) {
                addCandidate(applyCandidates, href(a));
              }
            }

            const domCandidates = collectDomUrls();
            const scriptCandidates = collectScriptUrls();
            for (const candidate of domCandidates) {
              addCandidate(originalCandidates, candidate);
              addCandidate(applyCandidates, candidate);
            }
            for (const candidate of scriptCandidates) {
              addCandidate(originalCandidates, candidate);
              addCandidate(applyCandidates, candidate);
            }

            const originalPostUrl = pickBestUrl(originalCandidates);
            const applyNowUrl = pickBestUrl(applyCandidates);

            return {
              position: 0,
              title,
              company,
              location,
              employmentType,
              workModel,
              seniorityLevel,
              salaryRange,
              matchScore,
              expLevelMatch,
              skillMatch,
              industryExpMatch,
              description,
              industries,
              recommendationTags,
              responsibilities,
              requiredQualifications,
              skillTags,
              taxonomy,
              companyWebsite,
              companyDescription,
              companySize,
              companyLocation,
              companyFoundedYear,
              companyCategories,
              h1bSponsorLikely,
              sponsorshipSupport,
              confirmedSponsorshipSupport: "unknown",
              h1bSponsorshipHistory,
              requiresActiveSecurityClearance: activeSecurityClearanceRequired,
              confirmedRequiresActiveSecurityClearance: false,
              insiderConnections,
              originalPostUrl,
              applyNowUrl,
              applyFlowUrls: [],
            };
          },
        });

        let detail = scriptResults[0]?.result as NewGradDetail | undefined;
        if (!detail) return null;

        if (
          !hasExternalCandidateUrl(
            detail.originalPostUrl,
            detail.applyNowUrl,
            scored.row.applyUrl,
          )
        ) {
          const probeResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async () => {
              function txt(el: Element | null | undefined): string {
                if (!el) return "";
                return (
                  (el as HTMLElement).innerText ?? el.textContent ?? ""
                ).trim();
              }

              function normalizeUrl(value: string | null | undefined): string | null {
                if (!value) return null;
                const trimmed = value.trim();
                if (!trimmed) return null;
                try {
                  const parsed = new URL(trimmed, window.location.href);
                  if (!/^https?:$/.test(parsed.protocol)) return null;
                  parsed.hash = "";
                  return parsed.toString();
                } catch {
                  return null;
                }
              }

              function addCandidate(set: Set<string>, value: string | null | undefined): void {
                const normalized = normalizeUrl(value);
                if (normalized) set.add(normalized);
              }

              function scoreCandidate(candidate: string): number {
                try {
                  const parsed = new URL(candidate);
                  const host = parsed.hostname.toLowerCase();
                  const path = parsed.pathname.toLowerCase();
                  const full = `${host}${path}${parsed.search.toLowerCase()}`;
                  const atsHosts = [
                    "greenhouse",
                    "ashbyhq.com",
                    "lever.co",
                    "workdayjobs.com",
                    "myworkdayjobs.com",
                    "smartrecruiters.com",
                    "jobvite.com",
                    "icims.com",
                  ];
                  const noiseHosts = [
                    "linkedin.com",
                    "crunchbase.com",
                    "glassdoor.com",
                    "facebook.com",
                    "instagram.com",
                    "x.com",
                    "twitter.com",
                    "youtube.com",
                    "marketbeat.com",
                    "media.licdn.com",
                  ];
                  const applyHints = [
                    "/apply",
                    "/job",
                    "/jobs",
                    "/career",
                    "/careers",
                    "/position",
                    "/positions",
                    "gh_jid",
                    "jobid",
                    "job_id",
                    "requisition",
                    "req_id",
                    "token=",
                    "lever-source",
                    "ashby_jid",
                  ];

                  if (noiseHosts.some((pattern) => host.includes(pattern))) return -100;

                  let score = 0;
                  if (atsHosts.some((pattern) => host.includes(pattern))) score += 100;
                  if (applyHints.some((pattern) => full.includes(pattern))) score += 24;
                  if (/\b(apply|job|jobs|career|careers|position|opening|opportunit)\b/.test(full)) {
                    score += 12;
                  }
                  if (host === "jobright.ai" || host.endsWith(".jobright.ai")) {
                    score -= 80;
                    if (path.startsWith("/jobs/info/")) score -= 30;
                  } else {
                    score += 40;
                  }
                  return score;
                } catch {
                  return Number.NEGATIVE_INFINITY;
                }
              }

              function pickBest(candidates: Iterable<string>): string {
                let best = "";
                let bestScore = Number.NEGATIVE_INFINITY;
                for (const candidate of candidates) {
                  const score = scoreCandidate(candidate);
                  if (score > bestScore) {
                    best = candidate;
                    bestScore = score;
                  }
                }
                return best;
              }

              function collectDomCandidates(): string[] {
                const urls = new Set<string>();
                for (const element of Array.from(
                  document.querySelectorAll(
                    "a[href], form[action], [data-url], [data-href], [data-apply-url], [data-link], button, [role='button']"
                  )
                )) {
                  if (element instanceof HTMLAnchorElement) addCandidate(urls, element.href);
                  if (element instanceof HTMLFormElement) addCandidate(urls, element.action);
                  if (element instanceof HTMLElement) {
                    addCandidate(urls, element.dataset.url);
                    addCandidate(urls, element.dataset.href);
                    addCandidate(urls, element.dataset.applyUrl);
                    addCandidate(urls, element.dataset.link);
                  }
                }
                return Array.from(urls);
              }

              function collectUrlsFromText(raw: string): string[] {
                const pattern = /https?:\/\/[^\s"'<>]+/g;
                return raw.match(pattern) ?? [];
              }

              function findApplyTrigger(): HTMLElement | null {
                const interactive = Array.from(
                  document.querySelectorAll("a, button, [role='button']")
                );
                let best: HTMLElement | null = null;
                let bestScore = Number.NEGATIVE_INFINITY;

                for (const candidate of interactive) {
                  if (!(candidate instanceof HTMLElement)) continue;
                  const text = txt(candidate).toLowerCase();
                  if (!text) continue;

                  let score = Number.NEGATIVE_INFINITY;
                  if (text.includes("apply on employer site")) score = 100;
                  else if (text.includes("apply now")) score = 90;
                  else if (text.includes("join now")) score = 80;
                  else if (text.includes("apply")) score = 70;

                  if (score > bestScore) {
                    best = candidate;
                    bestScore = score;
                  }
                }

                return best;
              }

              const captured = new Set<string>();
              const record = (value: string | null | undefined) => addCandidate(captured, value);
              const clickListener = (event: Event) => {
                const target = event.target instanceof Element ? event.target : null;
                const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
                if (anchor) record(anchor.href);
              };
              document.addEventListener("click", clickListener, true);

              const originalOpen = window.open.bind(window);
              const originalFetch = window.fetch.bind(window);
              const originalXhrOpen = XMLHttpRequest.prototype.open;
              const originalXhrSend = XMLHttpRequest.prototype.send;
              try {
                window.open = ((url?: string | URL | undefined) => {
                  if (typeof url === "string") record(url);
                  else if (url instanceof URL) record(url.toString());
                  return null;
                }) as typeof window.open;

                window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
                  const requestUrl =
                    typeof input === "string"
                      ? input
                      : input instanceof URL
                        ? input.toString()
                        : input.url;
                  record(requestUrl);
                  const response = await originalFetch(input, init);
                  try {
                    const clone = response.clone();
                    const text = await clone.text();
                    for (const candidate of collectUrlsFromText(text)) record(candidate);
                  } catch {
                    // Ignore unreadable fetch bodies
                  }
                  return response;
                }) as typeof window.fetch;

                XMLHttpRequest.prototype.open = function (
                  method: string,
                  url: string | URL,
                  async?: boolean,
                  username?: string | null,
                  password?: string | null,
                ): void {
                  const resolvedUrl = typeof url === "string" ? url : url.toString();
                  (this as XMLHttpRequest & { __careerOpsUrl?: string }).__careerOpsUrl = resolvedUrl;
                  record(resolvedUrl);
                  originalXhrOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
                };

                XMLHttpRequest.prototype.send = function (
                  body?: Document | XMLHttpRequestBodyInit | null
                ): void {
                  this.addEventListener("loadend", function () {
                    const xhr = this as XMLHttpRequest & { __careerOpsUrl?: string };
                    record(xhr.responseURL || xhr.__careerOpsUrl);
                    if (typeof xhr.responseText === "string" && xhr.responseText) {
                      for (const candidate of collectUrlsFromText(xhr.responseText)) record(candidate);
                    }
                  });
                  originalXhrSend.call(this, body);
                };

                const trigger = findApplyTrigger();
                if (trigger) trigger.click();
                await new Promise((resolve) => setTimeout(resolve, 2500));

                for (const candidate of collectDomCandidates()) record(candidate);
              } finally {
                window.open = originalOpen;
                window.fetch = originalFetch;
                XMLHttpRequest.prototype.open = originalXhrOpen;
                XMLHttpRequest.prototype.send = originalXhrSend;
                document.removeEventListener("click", clickListener, true);
              }

              const resolved = pickBest(captured);
              return {
                originalPostUrl: resolved,
                applyNowUrl: resolved,
                applyFlowUrls: Array.from(captured),
              };
            },
          });
          const probe = probeResults[0]?.result as
            | { originalPostUrl?: string; applyNowUrl?: string; applyFlowUrls?: string[] }
            | undefined;

          if (probe) {
            detail = {
              ...detail,
              originalPostUrl:
                pickBestCandidateUrl(detail.originalPostUrl, probe.originalPostUrl) ??
                detail.originalPostUrl,
              applyNowUrl:
                pickBestCandidateUrl(detail.applyNowUrl, probe.applyNowUrl) ??
                detail.applyNowUrl,
              applyFlowUrls: Array.from(
                new Set([...(detail.applyFlowUrls ?? []), ...(probe.applyFlowUrls ?? [])])
              ),
            };
          }
        }

        const confirmation = await confirmOriginalPostingBlockers(
          detail.originalPostUrl,
          detail.applyNowUrl,
          ...(detail.applyFlowUrls ?? []),
          scored.row.applyUrl,
        );
        detail = {
          ...detail,
          originalPostUrl:
            pickBestCandidateUrl(
              detail.originalPostUrl,
              confirmation.confirmationUrl,
            ) ?? detail.originalPostUrl,
          confirmedSponsorshipSupport:
            confirmation.confirmedSponsorshipSupport,
          confirmedRequiresActiveSecurityClearance:
            confirmation.confirmedRequiresActiveSecurityClearance,
        };

        return {
          row: scored,
          detail: { ...detail, position: scored.row.position },
        } as EnrichedRow;
      } catch {
        return null;
      } finally {
        if (tabIdToClose !== null) {
          await chrome.tabs.remove(tabIdToClose).catch(() => undefined);
        }
      }
    }));

    for (const r of results) {
      if (r) enrichedRows.push(r);
      else failed++;
    }

    // Random delay between batches
    if (queue.length > 0) {
      const delay = config.delayMinMs + Math.random() * (config.delayMaxMs - config.delayMinMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return { kind: "newgradEnrichDetails", ok: true, result: { enrichedRows, failed } };
}

async function handleNewGradEnrich(rows: EnrichedRow[], sessionId: string): Promise<PopupResponse> {
  const { client, error } = await authenticatedClient();
  if (error) return { kind: "newgradEnrich", ok: false, error };

  // Use streaming endpoint in small batches. Enriched rows include long JD text,
  // so sending all rows at once can exceed the bridge's body limit.
  // sessionId scopes broadcasts so multiple panels don't cross-contaminate.
  const chunkSize = 3;
  const mergedResult: NewGradEnrichResult = {
    added: 0,
    skipped: 0,
    entries: [],
    candidates: [],
  };

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize).map(truncateEnrichedRow);
    const controller = new AbortController();
    const chunkState: {
      result?: NewGradEnrichResult;
      error?: BridgeError;
    } = {};

    try {
      await client.streamEnrich(
        chunk,
        (event) => {
          if (event.kind === "progress") {
            chrome.runtime.sendMessage({
              kind: "enrichProgress",
              sessionId,
              current: Math.min(rows.length, start + Number(event.current ?? 0)),
              total: rows.length,
              row: event.row,
            }).catch(() => { /* no listeners — OK */ });
          } else if (event.kind === "done") {
            chunkState.result = {
              added: event.added as number,
              skipped: event.skipped as number,
              entries: event.entries as PipelineEntry[],
              ...((event.candidates as PipelineEntry[] | undefined)
                ? { candidates: event.candidates as PipelineEntry[] }
                : {}),
            };
          } else if (event.kind === "failed") {
            const err = event.error as { code: string; message: string };
            chunkState.error = { code: err.code as BridgeError["code"], message: err.message };
          }
        },
        controller.signal,
      );
    } catch (err) {
      const bridgeErr = (err as { bridgeError?: BridgeError }).bridgeError;
      return {
        kind: "newgradEnrich",
        ok: false,
        error: bridgeErr ?? { code: "INTERNAL", message: err instanceof Error ? err.message : "stream failed" },
      };
    }

    if (chunkState.error) return { kind: "newgradEnrich", ok: false, error: chunkState.error };
    if (!chunkState.result) {
      return {
        kind: "newgradEnrich",
        ok: false,
        error: { code: "INTERNAL", message: "enrich stream ended unexpectedly" },
      };
    }

    const chunkResult = chunkState.result;
    mergedResult.added += chunkResult.added;
    mergedResult.skipped += chunkResult.skipped;
    mergedResult.entries = [...mergedResult.entries, ...chunkResult.entries];
    mergedResult.candidates = [
      ...(mergedResult.candidates ?? []),
      ...(chunkResult.candidates ?? chunkResult.entries),
    ];
  }

  const evaluationCandidates = mergedResult.entries;
  const directEval = await runDirectNewGradEvaluations(
    client,
    evaluationCandidates,
    rows,
    sessionId,
  );
  return {
    kind: "newgradEnrich",
    ok: true,
    result: {
      ...mergedResult,
      skipped: Math.max(rows.length - evaluationCandidates.length, 0),
      queued: directEval.queued,
      evaluated: directEval.queued,
      failed: directEval.failed,
      jobs: directEval.jobs,
    },
  };
}

function truncateEnrichedRow(row: EnrichedRow): EnrichedRow {
  return {
    ...row,
    detail: {
      ...row.detail,
      description: row.detail.description.slice(0, 12000),
      responsibilities: row.detail.responsibilities.slice(0, 20),
      requiredQualifications: row.detail.requiredQualifications.slice(0, 30),
      skillTags: row.detail.skillTags.slice(0, 40),
      recommendationTags: row.detail.recommendationTags.slice(0, 20),
      industries: row.detail.industries.slice(0, 20),
      taxonomy: row.detail.taxonomy.slice(0, 20),
      companyDescription: row.detail.companyDescription
        ? row.detail.companyDescription.slice(0, 2000)
        : null,
      applyFlowUrls: row.detail.applyFlowUrls.slice(0, 20),
      h1bSponsorshipHistory: row.detail.h1bSponsorshipHistory.slice(0, 10),
      companyCategories: row.detail.companyCategories.slice(0, 20),
    },
  };
}

function matchesNewGradEntry(entry: PipelineEntry, row: EnrichedRow): boolean {
  const entryCompany = entry.company.trim().toLowerCase();
  const entryRole = entry.role.trim().toLowerCase();
  const candidates = [
    row.detail.company,
    row.row.row.company,
  ]
    .map((value) => value.trim().toLowerCase());
  const roleCandidates = [
    row.detail.title,
    row.row.row.title,
  ]
    .map((value) => value.trim().toLowerCase());
  return candidates.includes(entryCompany) && roleCandidates.includes(entryRole);
}

interface DirectEvaluationSessionState {
  total: number;
  completed: number;
  failed: number;
}

const PENDING_BACKFILL_BATCH_SIZE = 10;

type DirectEvaluationEntry = PipelineEntry & {
  pageText?: string;
  lineNumber?: number;
  localJdPath?: string;
};

function canBulkDirectEvaluatePendingEntry(
  entry: NewGradPendingEntry,
): boolean {
  return (
    entry.valueScore !== undefined ||
    (entry.pageText?.trim().length ?? 0) >= 1_200 ||
    entry.score >= 8
  );
}

function needsLegacyPendingCacheBackfill(entry: DirectEvaluationEntry): boolean {
  return !entry.localJdPath;
}

function normalizeQueueText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function directEvaluationCompanyRoleKey(entry: DirectEvaluationEntry): string {
  return `${normalizeQueueText(entry.company)}|${normalizeQueueText(entry.role)}`;
}

function hasRichPendingContext(entry: DirectEvaluationEntry): boolean {
  return (
    entry.valueScore !== undefined ||
    (entry.pageText?.trim().length ?? 0) >= 1_200
  );
}

async function captureUrlInHiddenTab(url: string): Promise<CapturedTab | undefined> {
  if (!/^https?:\/\//.test(url)) return undefined;

  const perm = resolvePermissionOrigin(url);
  if (perm) {
    const alreadyGranted = await chrome.permissions.contains({
      origins: [perm.pattern],
    });
    if (!alreadyGranted) return undefined;
  }

  let tabIdToClose: number | null = null;
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    if (tab.id === undefined) return undefined;
    tabIdToClose = tab.id;

    await waitForTabComplete(tab.id);
    await sleep(1200);

    return await captureTabContext(
      tab.id,
      { url: tab.url ?? url, title: tab.title ?? "" },
      () => {},
      { returnEmptyFallback: false },
    );
  } catch {
    return undefined;
  } finally {
    if (tabIdToClose !== null) {
      await chrome.tabs.remove(tabIdToClose).catch(() => undefined);
    }
  }
}

async function hydratePendingEntryForEvaluation(
  entry: DirectEvaluationEntry,
): Promise<DirectEvaluationEntry> {
  if ((entry.pageText?.trim().length ?? 0) >= 1_200) {
    return entry;
  }

  const captured = await captureUrlInHiddenTab(entry.url);
  const capturedText = captured?.pageText?.trim();
  if (!capturedText) return entry;

  return { ...entry, pageText: capturedText };
}

async function persistPendingEntryLocalCache(
  client: ReturnType<typeof bridgeClientFromState>,
  originalEntry: DirectEvaluationEntry,
  preparedEntry: DirectEvaluationEntry,
): Promise<DirectEvaluationEntry> {
  const pageText = preparedEntry.pageText?.trim();
  if (!pageText || pageText.length < 1_200) {
    return preparedEntry;
  }
  if (typeof originalEntry.lineNumber !== "number") {
    return preparedEntry;
  }

  const originalLength = originalEntry.pageText?.trim().length ?? 0;
  if (originalEntry.localJdPath && originalLength >= pageText.length) {
    return preparedEntry;
  }

  const backfill = await client.backfillNewGradPendingCache([
    {
      url: originalEntry.url,
      company: originalEntry.company,
      role: originalEntry.role,
      lineNumber: originalEntry.lineNumber,
      pageText,
    },
  ]);
  if (!backfill.ok) {
    return preparedEntry;
  }

  const outcome = backfill.result.outcomes[0];
  if (outcome?.status !== "updated" || !outcome.localJdPath) {
    return preparedEntry;
  }

  return {
    ...preparedEntry,
    localJdPath: outcome.localJdPath,
  };
}

function buildCompactEvaluationPageText(
  entry: DirectEvaluationEntry,
  matchedRow: EnrichedRow | undefined,
): string | undefined {
  if (!matchedRow) {
    const raw = entry.pageText?.trim();
    return raw ? raw.slice(0, 4_000) : undefined;
  }

  const { detail, row } = matchedRow;
  const sections = [
    `URL: ${entry.url}`,
    `Company: ${detail.company || row.row.company}`,
    `Role: ${detail.title || row.row.title}`,
    detail.location ? `Location: ${detail.location}` : null,
    detail.workModel ? `Work model: ${detail.workModel}` : null,
    detail.employmentType ? `Employment type: ${detail.employmentType}` : null,
    detail.seniorityLevel ? `Seniority: ${detail.seniorityLevel}` : null,
    detail.salaryRange ? `Salary: ${detail.salaryRange}` : null,
    detail.confirmedSponsorshipSupport !== "unknown"
      ? `Confirmed sponsorship: ${detail.confirmedSponsorshipSupport}`
      : null,
    detail.confirmedRequiresActiveSecurityClearance
      ? "Confirmed active security clearance requirement: yes"
      : null,
    detail.skillTags.length > 0
      ? `Skill tags: ${detail.skillTags.slice(0, 15).join(", ")}`
      : null,
    detail.recommendationTags.length > 0
      ? `Recommendation tags: ${detail.recommendationTags.slice(0, 8).join(", ")}`
      : null,
    detail.taxonomy.length > 0
      ? `Taxonomy: ${detail.taxonomy.slice(0, 8).join(", ")}`
      : null,
    detail.requiredQualifications.length > 0
      ? [
          "Requirements:",
          ...detail.requiredQualifications.slice(0, 10).map((item) => `- ${item}`),
        ].join("\n")
      : null,
    detail.responsibilities.length > 0
      ? [
          "Responsibilities:",
          ...detail.responsibilities.slice(0, 8).map((item) => `- ${item}`),
        ].join("\n")
      : null,
    detail.description
      ? `Description excerpt:\n${detail.description.slice(0, 1_800)}`
      : null,
  ]
    .filter((section): section is string => Boolean(section))
    .join("\n\n")
    .trim();

  return sections.length > 0 ? sections.slice(0, 4_000) : undefined;
}

function extractYearsExperienceRequired(text: string): number | null {
  const normalized = text.toLowerCase();
  const matches = Array.from(
    normalized.matchAll(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)(?:\s+of\s+experience)?\b/g),
  );
  if (matches.length === 0) return null;

  let maxYears = 0;
  for (const match of matches) {
    const years = Number(match[1]);
    if (Number.isFinite(years)) {
      maxYears = Math.max(maxYears, years);
    }
  }

  return maxYears > 0 ? maxYears : null;
}

function inferSponsorshipSupport(text: string): "yes" | "no" | "unknown" {
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  if (
    normalized.includes("no sponsorship") ||
    normalized.includes("without sponsorship") ||
    normalized.includes("unable to sponsor") ||
    normalized.includes("cannot sponsor") ||
    normalized.includes("can't sponsor") ||
    normalized.includes("does not provide sponsorship") ||
    normalized.includes("not eligible for immigration sponsorship") ||
    normalized.includes("visa sponsorship unavailable") ||
    normalized.includes("must be authorized to work without sponsorship") ||
    normalized.includes("work authorization without sponsorship")
  ) {
    return "no";
  }
  if (
    normalized.includes("visa sponsorship") ||
    normalized.includes("work authorization support") ||
    normalized.includes("immigration support") ||
    normalized.includes("we sponsor")
  ) {
    return "yes";
  }
  return "unknown";
}

function detectClearanceRequirement(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  const segments = normalized
    .split(/[\n\r.;!?]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (
      /\b(preferred|preference|nice to have|plus|public trust)\b/.test(segment) ||
      /\b(ability|eligible|eligibility|able)\s+to\s+obtain\b/.test(segment) ||
      /\bobtain(?:ed|ing)?\b/.test(segment)
    ) {
      continue;
    }
    if (
      /\b(active|current)\s+secret(?:\s+security)?\s+clearance\b/.test(segment) ||
      /\b(active|current)\s+security\s+clearance\b/.test(segment) ||
      /\btop\s+secret(?:\s+security)?\s+clearance\b/.test(segment) ||
      /\b(?:current\s+)?ts\/sci(?:\s+security)?\s+clearance\b/.test(segment) ||
      /\b(?:must\s+(?:have|possess)|requires?|required|need(?:ed)?|mandatory)\b.{0,40}\b(?:secret|top\s+secret|ts\/sci)(?:\s+security)?\s+clearance\b/.test(
        segment,
      ) ||
      (
        segment.length <= 120 &&
        /\b(top secret|ts\/sci)\b/.test(segment)
      )
    ) {
      return true;
    }
  }

  return false;
}

function inferWorkModel(text: string): string | undefined {
  const normalized = text.toLowerCase();
  if (normalized.includes("hybrid")) return "Hybrid";
  if (normalized.includes("remote")) return "Remote";
  if (normalized.includes("on-site") || normalized.includes("onsite")) return "On-site";
  return undefined;
}

function extractLabeledMetadataValue(
  text: string,
  labels: readonly string[],
): string | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 80);

  for (const line of lines) {
    for (const label of labels) {
      const match = line.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "i"));
      const value = match?.[1]?.trim();
      if (value) return value;
    }
  }

  return undefined;
}

function normalizeEmploymentType(
  entry: DirectEvaluationEntry,
  ...candidates: Array<string | null | undefined>
): string | undefined {
  const title = entry.role.toLowerCase();
  if (/\bintern(ship)?\b/.test(title)) return "Internship";

  for (const candidate of candidates) {
    const normalized = candidate?.trim().toLowerCase();
    if (!normalized) continue;
    if (/\bfull[-\s]?time\b/.test(normalized)) return "Full-time";
    if (/\bpart[-\s]?time\b/.test(normalized)) return "Part-time";
    if (/\bcontract(or)?\b/.test(normalized)) return "Contract";
    if (/\bintern(ship)?\b/.test(normalized) && /\bintern(ship)?\b/.test(title)) {
      return "Internship";
    }
  }

  return undefined;
}

function inferEmploymentType(
  entry: DirectEvaluationEntry,
  text: string,
): string | undefined {
  return normalizeEmploymentType(
    entry,
    extractLabeledMetadataValue(text, [
      "employment type",
      "job type",
      "time type",
      "schedule",
    ]),
  );
}

function normalizeStructuredSeniority(
  entry: DirectEvaluationEntry,
  ...candidates: Array<string | null | undefined>
): string | undefined {
  const title = entry.role.toLowerCase();
  if (/\b(new grad|new graduate|graduate|entry level|entry-level|associate|junior|engineer i|engineer 1)\b/.test(title)) {
    return "Early career";
  }
  if (/\b(senior|staff|principal|lead|manager|director|architect)\b/.test(title)) {
    return "Senior";
  }

  for (const candidate of candidates) {
    const normalized = candidate?.trim().toLowerCase();
    if (!normalized) continue;
    if (/\b(entry|entry level|associate|junior|new grad|new graduate|graduate|early career|engineer i|engineer 1)\b/.test(normalized)) {
      return "Early career";
    }
    if (/\b(senior|staff|principal|lead|manager|director|architect)\b/.test(normalized)) {
      return "Senior";
    }
  }

  return undefined;
}

function inferSeniority(entry: DirectEvaluationEntry, text: string): string | undefined {
  const explicit = extractLabeledMetadataValue(text, [
    "seniority",
    "experience level",
    "career level",
  ]);
  if (explicit?.toLowerCase() === "i") {
    return "Early career";
  }
  const titleAndExplicit = explicit ? `${entry.role}\n${explicit}` : entry.role;
  if (/\b(engineer i|engineer 1)\b/i.test(titleAndExplicit)) {
    return "Early career";
  }
  return normalizeStructuredSeniority(entry, explicit);
}

function inferPostingQualitySignals(text: string): string[] {
  const reasons: string[] = [];
  if (extractBulletLines(text, 6).length >= 4) reasons.push("structured_bullet_sections_present");
  if (text.length >= 1_500) reasons.push("substantive_local_jd_cache");
  return reasons;
}

function extractSalaryRange(text: string): string | undefined {
  const compact = text.replace(/\s+/g, " ");
  const match = compact.match(
    /(\$|usd\s*)\s?\d{2,3}(?:,\d{3})?(?:\.\d+)?\s*(?:-|to|–)\s*(\$|usd\s*)?\s?\d{2,3}(?:,\d{3})?(?:\.\d+)?/i,
  );
  return match?.[0]?.trim() || undefined;
}

function extractTopSkills(text: string): string[] {
  const candidates = [
    "TypeScript",
    "JavaScript",
    "Python",
    "Java",
    "Go",
    "Rust",
    "C++",
    "React",
    "Node.js",
    "AWS",
    "GCP",
    "Azure",
    "SQL",
    "PostgreSQL",
    "Docker",
    "Kubernetes",
    "LLM",
    "AI",
    "Machine Learning",
  ];
  const normalized = text.toLowerCase();
  return candidates.filter((skill) => normalized.includes(skill.toLowerCase())).slice(0, 12);
}

function extractBulletLines(text: string, maxItems: number): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*•]\s+/.test(line))
    .map((line) => line.replace(/^[-*•]\s+/, "").trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function buildStructuredEvaluationSignals(
  entry: DirectEvaluationEntry,
  matchedRow: EnrichedRow | undefined,
): StructuredJobSignals {
  if (matchedRow) {
    const { detail, row } = matchedRow;
    const valueScore = entry.valueScore;
    const localValueReasons = entry.valueReasons ? [...entry.valueReasons] : [];
    const yearsExperienceRequired = extractYearsExperienceRequired(
      [detail.requiredQualifications.join(" "), detail.description].join("\n"),
    );
    const location = detail.location || row.row.location;
    const workModel = detail.workModel || row.row.workModel;
    const employmentType = normalizeEmploymentType(
      entry,
      detail.employmentType,
      row.row.title,
    );
    const seniority = normalizeStructuredSeniority(
      entry,
      detail.seniorityLevel,
      row.row.title,
      detail.recommendationTags.join(" "),
      detail.taxonomy.join(" "),
    );
    const postedAgo = row.row.postedAgo;
    const salaryRange = detail.salaryRange || row.row.salary || undefined;
    const sponsorshipSupport =
      detail.confirmedSponsorshipSupport !== "unknown"
        ? detail.confirmedSponsorshipSupport
        : detail.sponsorshipSupport;
    const companySize = detail.companySize || row.row.companySize || null;

    return {
      source: "newgrad-scan",
      company: detail.company || row.row.company,
      role: detail.title || row.row.title,
      ...(location ? { location } : {}),
      ...(workModel ? { workModel } : {}),
      ...(employmentType ? { employmentType } : {}),
      ...(seniority ? { seniority } : {}),
      ...(postedAgo ? { postedAgo } : {}),
      ...(salaryRange ? { salaryRange } : {}),
      ...(sponsorshipSupport ? { sponsorshipSupport } : {}),
      requiresActiveSecurityClearance:
        detail.confirmedRequiresActiveSecurityClearance ||
        detail.requiresActiveSecurityClearance,
      ...(yearsExperienceRequired !== null ? { yearsExperienceRequired } : {}),
      ...(companySize ? { companySize } : { companySize: null }),
      taxonomy: detail.taxonomy.slice(0, 10),
      recommendationTags: detail.recommendationTags.slice(0, 10),
      skillTags: detail.skillTags.slice(0, 14),
      requiredQualifications: detail.requiredQualifications.slice(0, 10),
      responsibilities: detail.responsibilities.slice(0, 8),
      ...(valueScore !== undefined ? { localValueScore: valueScore } : {}),
      ...(localValueReasons.length > 0 ? { localValueReasons } : {}),
    };
  }

  const rawText = entry.pageText?.trim() ?? "";
  const bulletLines = extractBulletLines(rawText, 16);
  const yearsExperienceRequired = extractYearsExperienceRequired(rawText);
  const workModel = inferWorkModel(rawText);
  const employmentType = inferEmploymentType(entry, rawText);
  const seniority = inferSeniority(entry, rawText);
  const salaryRange = extractSalaryRange(rawText);
  const sponsorshipSupport = inferSponsorshipSupport(rawText);
  const skillTags = extractTopSkills(rawText);
  const localValueReasons = Array.from(new Set([
    ...(entry.valueReasons ?? []),
    ...inferPostingQualitySignals(rawText),
  ]));

  return {
    source: "newgrad-scan",
    company: entry.company,
    role: entry.role,
    ...(workModel ? { workModel } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(seniority ? { seniority } : {}),
    ...(salaryRange ? { salaryRange } : {}),
    ...(sponsorshipSupport ? { sponsorshipSupport } : {}),
    requiresActiveSecurityClearance: detectClearanceRequirement(rawText),
    ...(yearsExperienceRequired !== null ? { yearsExperienceRequired } : {}),
    ...(skillTags.length > 0 ? { skillTags } : {}),
    requiredQualifications: bulletLines.slice(0, 8),
    responsibilities: bulletLines.slice(8, 14),
    ...(entry.valueScore !== undefined ? { localValueScore: entry.valueScore } : {}),
    ...(localValueReasons.length > 0 ? { localValueReasons } : {}),
  };
}

async function runDirectNewGradEvaluations(
  client: ReturnType<typeof bridgeClientFromState>,
  entries: readonly DirectEvaluationEntry[],
  rows: EnrichedRow[],
  sessionId: string,
  options?: { automaticBulkRun?: boolean },
): Promise<{
  queued: number;
  failed: number;
  skipped: number;
  jobs: Array<{
    jobId: string;
    company: string;
    role: string;
    status: "queued" | "failed";
    score?: number;
    reportNumber?: number;
    reportPath?: string;
    error?: string;
  }>;
}> {
  const jobs: Array<{
    jobId: string;
    company: string;
    role: string;
    status: "queued" | "failed";
    score?: number;
    reportNumber?: number;
    reportPath?: string;
    error?: string;
  }> = [];
  let queued = 0;
  let failed = 0;
  let skipped = 0;
  const sessionState: DirectEvaluationSessionState = {
    total: entries.length,
    completed: 0,
    failed: 0,
  };
  const seenCanonicalUrls = new Set<string>();
  const seenCompanyRoles = new Set<string>();

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;

    chrome.runtime.sendMessage({
      kind: "enrichProgress",
      sessionId,
      current: index,
      total: entries.length,
      row: { company: entry.company, title: `Queueing ${entry.role}` },
    }).catch(() => { /* popup/panel may be closed */ });

    const canonicalUrl = canonicalizeJobUrlKey(entry.url);
    const companyRoleKey = directEvaluationCompanyRoleKey(entry);
    if (
      (canonicalUrl && seenCanonicalUrls.has(canonicalUrl)) ||
      seenCompanyRoles.has(companyRoleKey)
    ) {
      skipped += 1;
      sessionState.total = Math.max(sessionState.total - 1, 0);
      chrome.runtime.sendMessage({
        kind: "enrichProgress",
        sessionId,
        current: index + 1,
        total: entries.length,
        row: {
          company: entry.company,
          title: `Skipped ${entry.role} (duplicate pending job)`,
        },
      }).catch(() => { /* popup/panel may be closed */ });
      continue;
    }
    if (canonicalUrl) seenCanonicalUrls.add(canonicalUrl);
    seenCompanyRoles.add(companyRoleKey);

    const matchedRow = rows.find((row) => matchesNewGradEntry(entry, row));
    let preparedEntry = entry;
    if (!matchedRow && !hasRichPendingContext(preparedEntry)) {
      chrome.runtime.sendMessage({
        kind: "enrichProgress",
        sessionId,
        current: index,
        total: entries.length,
        row: { company: entry.company, title: `Hydrating ${entry.role}` },
      }).catch(() => { /* popup/panel may be closed */ });

      preparedEntry = await hydratePendingEntryForEvaluation(entry);
    }
    preparedEntry = await persistPendingEntryLocalCache(
      client,
      entry,
      preparedEntry,
    );

    if (options?.automaticBulkRun && !matchedRow && !hasRichPendingContext(preparedEntry)) {
      skipped += 1;
      sessionState.total = Math.max(sessionState.total - 1, 0);
      chrome.runtime.sendMessage({
        kind: "enrichProgress",
        sessionId,
        current: index + 1,
        total: entries.length,
        row: {
          company: entry.company,
          title: `Skipped ${entry.role} (insufficient local context)`,
        },
      }).catch(() => { /* popup/panel may be closed */ });
      continue;
    }

    const evaluationPageText = buildCompactEvaluationPageText(preparedEntry, matchedRow);
    const structuredSignals = buildStructuredEvaluationSignals(preparedEntry, matchedRow);
    const evaluationInput = {
      url: preparedEntry.url,
      title: preparedEntry.role,
      evaluationMode: "newgrad_quick" as const,
      structuredSignals,
      detection: {
        label: "job_posting" as const,
        confidence: 1,
        signals: ["newgrad-scan"],
      },
      ...(evaluationPageText
        ? { pageText: evaluationPageText }
        : {}),
    };
    const create = await client.createEvaluation({
      ...evaluationInput,
    });

    if (!create.ok) {
      failed += 1;
      sessionState.failed += 1;
      const failedJobId = `failed-${Date.now()}-${index}`;
      jobs.push({
        jobId: failedJobId,
        company: preparedEntry.company,
        role: preparedEntry.role,
        status: "failed",
        error: create.error.message,
      });
      broadcastNewGradEvaluationProgress(sessionId, sessionState, {
        jobId: failedJobId,
        company: preparedEntry.company,
        role: preparedEntry.role,
        phase: "failed",
        error: create.error.message,
      });
      continue;
    }

    queued += 1;
    jobs.push({
      jobId: create.result.jobId,
      company: preparedEntry.company,
      role: preparedEntry.role,
      status: "queued",
    });

    broadcastNewGradEvaluationProgress(sessionId, sessionState, {
      jobId: create.result.jobId,
      company: preparedEntry.company,
      role: preparedEntry.role,
      phase: "queued",
    });
    void monitorNewGradEvaluationJob(
      client,
      sessionId,
      sessionState,
      create.result.jobId,
      preparedEntry.company,
      preparedEntry.role,
    );

    chrome.runtime.sendMessage({
      kind: "enrichProgress",
      sessionId,
      current: index + 1,
      total: entries.length,
      row: { company: preparedEntry.company, title: `Queued ${preparedEntry.role}` },
    }).catch(() => { /* popup/panel may be closed */ });
  }

  return { queued, failed, skipped, jobs };
}

function broadcastNewGradEvaluationProgress(
  sessionId: string,
  sessionState: DirectEvaluationSessionState,
  job: {
    jobId: string;
    company: string;
    role: string;
    phase: string;
    score?: number;
    reportNumber?: number;
    reportPath?: string;
    error?: string;
  },
): void {
  chrome.runtime.sendMessage({
    kind: "newgradEvaluationProgress",
    sessionId,
    total: sessionState.total,
    completed: sessionState.completed,
    failed: sessionState.failed,
    job,
  }).catch(() => { /* popup/panel may be closed */ });
}

async function monitorNewGradEvaluationJob(
  client: ReturnType<typeof bridgeClientFromState>,
  sessionId: string,
  sessionState: DirectEvaluationSessionState,
  jobId: JobId,
  company: string,
  role: string,
): Promise<void> {
  let lastPhase = "queued";
  const startedAt = Date.now();
  const timeoutMs = 20 * 60_000;

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const snapshotRes = await client.getJob(jobId);
    if (!snapshotRes.ok) {
      lastPhase = "failed";
      sessionState.failed += 1;
      broadcastNewGradEvaluationProgress(sessionId, sessionState, {
        jobId,
        company,
        role,
        phase: "failed",
        error: snapshotRes.error.message,
      });
      return;
    }

    const snapshot = snapshotRes.result;
    if (snapshot.phase === "completed" && snapshot.result) {
      sessionState.completed += 1;
      await persistLastResult(jobId, snapshot.result);
      broadcastNewGradEvaluationProgress(sessionId, sessionState, {
        jobId,
        company: snapshot.result.company,
        role: snapshot.result.role,
        phase: "completed",
        score: snapshot.result.score,
        reportNumber: snapshot.result.reportNumber,
        reportPath: snapshot.result.reportPath,
      });
      return;
    }

    if (snapshot.phase === "failed") {
      sessionState.failed += 1;
      broadcastNewGradEvaluationProgress(sessionId, sessionState, {
        jobId,
        company,
        role,
        phase: "failed",
        error: snapshot.error?.message ?? "evaluation failed",
      });
      return;
    }

    if (snapshot.phase !== lastPhase) {
      lastPhase = snapshot.phase;
      broadcastNewGradEvaluationProgress(sessionId, sessionState, {
        jobId,
        company,
        role,
        phase: snapshot.phase,
      });
    }
  }

  sessionState.failed += 1;
  broadcastNewGradEvaluationProgress(sessionId, sessionState, {
    jobId,
    company,
    role,
    phase: "failed",
    error: "evaluation monitor timed out",
  });
}

/* -------------------------------------------------------------------------- */
/*  SSE streams and port fan-out                                              */
/* -------------------------------------------------------------------------- */

function openStream(jobId: JobId, state: ExtensionState): void {
  if (subscriptions.has(jobId)) return; // already streaming
  const controller = new AbortController();
  const sub: Subscription = { controller, ports: new Set() };
  subscriptions.set(jobId, sub);

  const client = bridgeClientFromState(state);
  void client
    .streamJob(
      jobId,
      (event) => {
        fanEvent(jobId, event);
        if (event.kind === "done" || event.kind === "failed") {
          closeStream(jobId, event.kind);
        }
      },
      controller.signal
    )
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      fanEvent(jobId, {
        kind: "failed",
        jobId,
        error: { code: "INTERNAL", message },
      });
      closeStream(jobId, "failed");
    });
}

function fanEvent(jobId: JobId, event: JobEvent): void {
  const sub = subscriptions.get(jobId);
  if (!sub) return;
  const message: JobPortMessage = { channel: "job", event };
  for (const port of sub.ports) {
    try {
      port.postMessage(message);
    } catch {
      // port disconnected; remove on next prune
    }
  }

  // Chrome notification on terminal events
  try {
    if (event.kind === "done") {
      void persistLastResult(jobId, event.result);
      chrome.notifications.create(jobId, {
        type: "basic",
        iconUrl: "icon-128.png",
        title: `${event.result.company} — ${event.result.score.toFixed(1)}/5`,
        message: `${event.result.role} · ${event.result.archetype}`,
      });
    } else if (event.kind === "failed") {
      chrome.notifications.create(jobId, {
        type: "basic",
        iconUrl: "icon-128.png",
        title: "Evaluation failed",
        message: event.error.message,
      });
    }
  } catch {
    // notifications permission may be denied — fail silently
  }
}

function closeStream(jobId: JobId, reason: "done" | "failed"): void {
  const sub = subscriptions.get(jobId);
  if (!sub) return;
  const closedMsg: JobPortMessage = {
    channel: "job",
    event: { kind: "closed", jobId, reason },
  };
  for (const port of sub.ports) {
    try {
      port.postMessage(closedMsg);
    } catch {
      /* ignore */
    }
  }
  sub.controller.abort();
  subscriptions.delete(jobId);
}

async function persistLastResult(
  jobId: JobId,
  result: EvaluationResult
): Promise<void> {
  await patchState({
    lastJobId: jobId,
    lastResult: { jobId, at: new Date().toISOString(), result },
  });
}

function postJobEvent(port: chrome.runtime.Port, event: JobPortMessage["event"]): void {
  try {
    port.postMessage({ channel: "job", event } as JobPortMessage);
  } catch {
    /* ignore disconnected ports */
  }
}

async function replayCurrentJobState(
  port: chrome.runtime.Port,
  snapshot: JobSnapshot
): Promise<void> {
  postJobEvent(port, { kind: "snapshot", snapshot });
  if (snapshot.phase === "completed" && snapshot.result) {
    await persistLastResult(snapshot.id, snapshot.result);
    postJobEvent(port, {
      kind: "done",
      jobId: snapshot.id,
      at: snapshot.updatedAt,
      result: snapshot.result,
    } as JobEvent);
  } else if (snapshot.phase === "failed" && snapshot.error) {
    postJobEvent(port, { kind: "failed", jobId: snapshot.id, error: snapshot.error });
  }
}

/* -------------------------------------------------------------------------- */
/*  Long-lived ports for popup subscriptions                                  */
/* -------------------------------------------------------------------------- */

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "career-ops.job") return;
  // The first message from the popup names the jobId.
  const onInit = (msg: unknown) => {
    if (
      typeof msg !== "object" ||
      msg === null ||
      (msg as { jobId?: unknown }).jobId === undefined
    ) {
      return;
    }
    port.onMessage.removeListener(onInit);
    void (async () => {
      const jobId = (msg as { jobId: string }).jobId as JobId;
      const { state, client, error } = await authenticatedClient();
      if (error) {
        postJobEvent(port, { kind: "failed", jobId, error });
        return;
      }

      const snapshotRes = await client.getJob(jobId);
      if (!snapshotRes.ok) {
        postJobEvent(port, { kind: "failed", jobId, error: snapshotRes.error });
        return;
      }

      let sub = subscriptions.get(jobId);
      if (!sub && snapshotRes.result.phase !== "completed" && snapshotRes.result.phase !== "failed") {
        openStream(jobId, state);
        sub = subscriptions.get(jobId);
      }

      if (sub) {
        sub.ports.add(port);
        port.onDisconnect.addListener(() => {
          sub?.ports.delete(port);
        });
      }

      await replayCurrentJobState(port, snapshotRes.result);
    })();
  };
  port.onMessage.addListener(onInit);
});
