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
  PopupRequest,
  PopupResponse,
} from "../contracts/messages.js";
import type {
  EvaluationResult,
  BridgeError,
  EnrichedRow,
  JobEvent,
  JobId,
  JobSnapshot,
  NewGradDetail,
  NewGradEnrichResult,
  NewGradRow,
  PipelineEntry,
  ScoredRow,
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

function normalizeUrlCandidate(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
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

          const signals = [
            "active secret security clearance",
            "active secret clearance",
            "current secret clearance",
            "must have an active secret clearance",
            "must possess an active secret clearance",
            "requires an active secret clearance",
            "active secret clearance required",
          ];
          return signals.some((signal) => normalized.includes(signal));
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

  // Enumerate frames so we can see if the real JD lives in an iframe
  // (common on Workday: top doc is a shell, content is in a child
  // frame under wd*.myworkday.com or similar).
  let frames: chrome.webNavigation.GetAllFrameResultDetails[] = [];
  try {
    frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
    dbg("frames", {
      count: frames.length,
      urls: frames.map((f) => ({ id: f.frameId, url: f.url })),
    });
  } catch (err) {
    dbg("frames.error", { err: String(err) });
  }

  // First attempt — top frame only, matching prior behaviour.
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
      frameIds: first.rawResults.map((r) => r.frameId),
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
      await new Promise((r) => setTimeout(r, 800));
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

  // Fallback: if top-frame injection gave us nothing or near-empty
  // text, try all frames and keep the richest result. This catches
  // two patterns on Workday-like sites:
  //  1. Real JD rendered inside a child iframe.
  //  2. Top frame returned synchronously before SPA populated DOM,
  //     while a child frame (or later-hydrated top) has content.
  // Scoring prefers explicit job-posting detections over raw text
  // length so a short nav-only top frame can't outrank a richer
  // child frame that was actually identified as a JD.
  if (!captured || captured.pageText.length < 400) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ["content.js"],
      });
      dbg("inject.allFrames", {
        resultsLen: results.length,
        perFrame: results.map((r) => ({
          frameId: r.frameId,
          hasResult: Boolean(r.result),
          pageTextLen:
            (r.result as CapturedTab | undefined)?.pageText?.length ?? 0,
          detection: (r.result as CapturedTab | undefined)?.detection?.label,
        })),
      });
      const scoreFrame = (c: CapturedTab): number => {
        const base = c.pageText.length;
        const bonus =
          c.detection?.label === "job_posting"
            ? 5000
            : c.detection?.label === "likely_job_posting"
              ? 2000
              : 0;
        return base + bonus;
      };
      let best: CapturedTab | undefined;
      let bestScore = -1;
      for (const r of results) {
        const c = r.result as CapturedTab | undefined;
        if (!c) continue;
        const s = scoreFrame(c);
        if (s > bestScore) {
          best = c;
          bestScore = s;
        }
      }
      const currentScore = captured ? scoreFrame(captured) : -1;
      if (best && bestScore > currentScore) {
        captured = { ...best, tabId };
      }
    } catch (err) {
      dbg("inject.allFrames.throw", { err: String(err) });
    }
  }

  if (!captured) {
    // Last-resort: hand the tab's URL/title to the caller with an
    // empty pageText and captureState:"hydrating". The bridge's
    // Playwright fallback is expected to re-fetch and render the
    // page properly; returning INTERNAL here blocks that path.
    // INTERNAL is only correct when we cannot even identify the tab.
    dbg("final.fallback.empty", {});
    return {
      kind: "captureActiveTab",
      ok: true,
      result: {
        tabId,
        url: tab.url,
        title: tab.title ?? "",
        pageText: "",
        detection: { label: "not_job_posting", confidence: 0.1, signals: [] },
        captureState: "hydrating",
        capturedAt: new Date().toISOString(),
      },
    };
  }
  dbg("final.ok", {
    pageTextLen: captured.pageText.length,
    captureState: captured.captureState,
    detection: captured.detection?.label,
  });
  return { kind: "captureActiveTab", ok: true, result: captured };
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
        const preferred = Array.from(document.querySelectorAll("iframe[src]"))
          .map((iframe) => (iframe as HTMLIFrameElement).src)
          .find((src) => src.includes("jobright.ai/minisites-jobs/newgrad/us/swe"));
        if (preferred) return preferred;

        const fallback = Array.from(document.querySelectorAll("iframe[src]"))
          .map((iframe) => (iframe as HTMLIFrameElement).src)
          .find((src) => src.includes("jobright.ai/minisites-jobs"));
        if (fallback) return fallback;

        return "https://jobright.ai/minisites-jobs/newgrad/us/swe?embed=true";
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

async function handleNewGradScore(rows: NewGradRow[]): Promise<PopupResponse> {
  const { client, error } = await authenticatedClient();
  if (error) return { kind: "newgradScore", ok: false, error };
  const res = await client.scoreNewGradRows(rows);
  if (res.ok) return { kind: "newgradScore", ok: true, result: res.result };
  return { kind: "newgradScore", ok: false, error: res.error };
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
              return (
                normalized.includes("active secret security clearance") ||
                normalized.includes("active secret clearance") ||
                normalized.includes("current secret clearance") ||
                normalized.includes("must have an active secret clearance") ||
                normalized.includes("must possess an active secret clearance") ||
                normalized.includes("requires an active secret clearance")
              );
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
            const employmentType =
              labelledValue("employment type") ||
              labelledValue("job type") ||
              labelledValue("type");

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
            const seniorityLevel =
              labelledValue("seniority") ||
              labelledValue("experience level") ||
              labelledValue("level");

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

  // Use streaming endpoint to get per-row progress.
  // sessionId scopes broadcasts so multiple panels don't cross-contaminate.
  const controller = new AbortController();
  let finalResult: NewGradEnrichResult | null = null;
  let finalError: BridgeError | null = null;

  try {
    await client.streamEnrich(
      rows,
      (event) => {
        if (event.kind === "progress") {
          chrome.runtime.sendMessage({
            kind: "enrichProgress",
            sessionId,
            current: event.current,
            total: event.total,
            row: event.row,
          }).catch(() => { /* no listeners — OK */ });
        } else if (event.kind === "done") {
          finalResult = {
            added: event.added as number,
            skipped: event.skipped as number,
            entries: event.entries as PipelineEntry[],
            ...((event.candidates as PipelineEntry[] | undefined)
              ? { candidates: event.candidates as PipelineEntry[] }
              : {}),
          };
        } else if (event.kind === "failed") {
          const err = event.error as { code: string; message: string };
          finalError = { code: err.code as BridgeError["code"], message: err.message };
        }
      },
      controller.signal,
    );
  } catch (err) {
    // Preserve structured BridgeError from non-2xx responses
    const bridgeErr = (err as { bridgeError?: BridgeError }).bridgeError;
    return {
      kind: "newgradEnrich",
      ok: false,
      error: bridgeErr ?? { code: "INTERNAL", message: err instanceof Error ? err.message : "stream failed" },
    };
  }

  if (finalError) return { kind: "newgradEnrich", ok: false, error: finalError };
  const enrichResult = finalResult as NewGradEnrichResult | null;
  if (enrichResult !== null) {
    const evaluationCandidates = enrichResult.candidates ?? enrichResult.entries;
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
        ...enrichResult,
        skipped: Math.max(rows.length - evaluationCandidates.length, 0),
        queued: directEval.queued,
        evaluated: directEval.queued,
        failed: directEval.failed,
        jobs: directEval.jobs,
      },
    };
  }

  // Fallback — stream ended without done/failed event
  return {
    kind: "newgradEnrich",
    ok: false,
    error: { code: "INTERNAL", message: "enrich stream ended unexpectedly" },
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

async function runDirectNewGradEvaluations(
  client: ReturnType<typeof bridgeClientFromState>,
  entries: readonly PipelineEntry[],
  rows: EnrichedRow[],
  sessionId: string,
): Promise<{
  queued: number;
  failed: number;
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
  const recentQueuedAt: number[] = [];

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    while (recentQueuedAt.length >= 3) {
      const waitMs = 60_000 - (Date.now() - recentQueuedAt[0]!);
      if (waitMs <= 0) {
        recentQueuedAt.shift();
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs + 250));
      while (recentQueuedAt.length > 0 && Date.now() - recentQueuedAt[0]! >= 60_000) {
        recentQueuedAt.shift();
      }
    }

    chrome.runtime.sendMessage({
      kind: "enrichProgress",
      sessionId,
      current: index,
      total: entries.length,
      row: { company: entry.company, title: `Queueing ${entry.role}` },
    }).catch(() => { /* popup/panel may be closed */ });

    const matchedRow = rows.find((row) => matchesNewGradEntry(entry, row));
    const evaluationInput = {
      url: entry.url,
      title: entry.role,
      detection: {
        label: "job_posting" as const,
        confidence: 1,
        signals: ["newgrad-scan"],
      },
      ...(matchedRow?.detail.description
        ? { pageText: matchedRow.detail.description }
        : {}),
    };
    const create = await client.createEvaluation({
      ...evaluationInput,
    });

    if (!create.ok) {
      failed += 1;
      jobs.push({
        jobId: `failed-${Date.now()}-${index}`,
        company: entry.company,
        role: entry.role,
        status: "failed",
        error: create.error.message,
      });
      continue;
    }

    recentQueuedAt.push(Date.now());
    queued += 1;
    jobs.push({
      jobId: create.result.jobId,
      company: entry.company,
      role: entry.role,
      status: "queued",
    });

    chrome.runtime.sendMessage({
      kind: "enrichProgress",
      sessionId,
      current: index + 1,
      total: entries.length,
      row: { company: entry.company, title: `Queued ${entry.role}` },
    }).catch(() => { /* popup/panel may be closed */ });
  }

  return { queued, failed, jobs };
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
