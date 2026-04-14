/**
 * popup/index.ts — popup controller.
 *
 * State machine:
 *   idle      → on open, send captureActiveTab to background
 *   captured  → show URL + title + Evaluate CTA
 *   running   → stepper, driven by SSE events fanned via port
 *   done      → score hero + Open Report button
 *   error     → contextual error with recovery hint
 *
 * No framework, no innerHTML. All user-derived strings go through the
 * DOM as `textContent` so there is no XSS path — even if the bridge
 * returns hostile content scraped from a malicious job page.
 */

import type {
  CapturedTab,
  ExtensionState,
  JobPortMessage,
  PopupRequest,
  PopupResponse,
} from "../contracts/messages.js";
import { STATE_STORAGE_KEY } from "../contracts/messages.js";
import type {
  EvaluationResult,
  HealthResult,
  JobPhase,
  JobEvent,
  JobId,
  JobSnapshot,
} from "../contracts/bridge-wire.js";
import {
  type BridgePreset,
  PHASE_ORDER,
  PHASE_LABEL,
  pct,
  presetCommand,
  presetDescription,
  presetDisplayName,
  presetFromHealth,
  scoreColor,
} from "../shared/utils.js";

type UiState = "idle" | "setup" | "captured" | "notDetected" | "running" | "done" | "error";

/* -------------------------------------------------------------------------- */
/*  DOM handles                                                               */
/* -------------------------------------------------------------------------- */

const app = document.getElementById("app")!;
const healthSrEl = document.getElementById("health-sr")!;
const bridgeChip = document.getElementById("bridge-chip") as HTMLButtonElement;
const bridgeChipLabel = document.getElementById("bridge-chip-label")!;
const healthDot = document.getElementById("health-dot")!;
const modePanelEl = document.getElementById("mode-panel")!;
const setupEl = document.getElementById("setup")!;
const setupTokenInput = document.getElementById("setup-token") as HTMLInputElement;
const setupSaveBtn = document.getElementById("setup-save-btn") as HTMLButtonElement;
const modeSelect = document.getElementById("mode-select") as HTMLSelectElement;
const modeCurrentEl = document.getElementById("mode-current")!;
const modeMatchEl = document.getElementById("mode-match")!;
const modeHelpEl = document.getElementById("mode-help")!;
const modeCommandEl = document.getElementById("mode-command")!;
const modeCopyBtn = document.getElementById("mode-copy-btn") as HTMLButtonElement;
const captureEl = document.getElementById("capture")!;
const notDetectedEl = document.getElementById("not-detected")!;
const runningEl = document.getElementById("running")!;
const doneEl = document.getElementById("done")!;
const errorEl = document.getElementById("error")!;

const captureUrlEl = document.getElementById("capture-url")!;
const captureTitleEl = document.getElementById("capture-title")!;
const captureDetectionEl = document.getElementById("capture-detection")!;
const evaluateBtn = document.getElementById("evaluate-btn") as HTMLButtonElement;

// Inline expiry warning (replaces confirm())
const expiryWarningEl = document.getElementById("expiry-warning")!;
const expiryWarningTextEl = document.getElementById("expiry-warning-text")!;
const expiryEvaluateBtn = document.getElementById("expiry-evaluate-btn") as HTMLButtonElement;
const expiryDismissBtn = document.getElementById("expiry-dismiss-btn") as HTMLButtonElement;

const jobIdEl = document.getElementById("job-id")!;
const phaseListEl = document.getElementById("phase-list")!;
const phaseCounterEl = document.getElementById("phase-counter")!;

const resultScoreEl = document.getElementById("result-score")!;
const resultHeaderEl = document.getElementById("result-header")!;
const resultTldrEl = document.getElementById("result-tldr")!;
const openReportBtn = document.getElementById("open-report-btn") as HTMLButtonElement;

const errorCategoryEl = document.getElementById("error-category")!;
const errorExplanationEl = document.getElementById("error-explanation")!;
const errorRecoveryEl = document.getElementById("error-recovery")!;
const retryBtn = document.getElementById("retry-btn") as HTMLButtonElement;

const recentListEl = document.getElementById("recent-list")!;
const recentListWrap = document.getElementById("recent-list-wrap")!;
const recentEmptyEl = document.getElementById("recent-empty")!;
const mergeTrackerBtn = document.getElementById("merge-tracker-btn") as HTMLButtonElement;
const copySummaryBtn = document.getElementById("copy-summary-btn") as HTMLButtonElement;
const evaluateAnywayBtn = document.getElementById("evaluate-anyway-btn") as HTMLButtonElement;
const offlineBannerEl = document.getElementById("offline-banner")!;
const footerVersionEl = document.getElementById("footer-version")!;

/* -------------------------------------------------------------------------- */
/*  State                                                                     */
/* -------------------------------------------------------------------------- */

let captured: CapturedTab | null = null;
let currentJobId: JobId | null = null;
let currentResult: EvaluationResult | null = null;
let activePort: chrome.runtime.Port | null = null;
let preferredPreset: BridgePreset = "real-codex";
let currentBridgePreset: BridgePreset | null = null;
let expiryBypassResolve: ((proceed: boolean) => void) | null = null;
let lastErrorRetryable = true;
let jobPollTimer: number | null = null;

function trackerButtonLabel(result: EvaluationResult): string {
  if (!result.trackerMerged) return "Save to tracker";
  const summary = result.trackerMergeSummary;
  if (!summary) return "Tracker synced";
  if (summary.added > 0) return `Saved to tracker (${summary.added} added)`;
  if (summary.updated > 0) return `Saved to tracker (${summary.updated} updated)`;
  return "Tracker already up to date";
}

/* -------------------------------------------------------------------------- */
/*  UI switching                                                              */
/* -------------------------------------------------------------------------- */

function show(state: UiState): void {
  setupEl.classList.toggle("hidden", state !== "setup");
  captureEl.classList.toggle("hidden", state !== "captured");
  notDetectedEl.classList.toggle("hidden", state !== "notDetected");
  runningEl.classList.toggle("hidden", state !== "running");
  doneEl.classList.toggle("hidden", state !== "done");
  errorEl.classList.toggle("hidden", state !== "error");
  app.className = `state-${state}`;
}

function stopJobPolling(): void {
  if (jobPollTimer !== null) {
    window.clearInterval(jobPollTimer);
    jobPollTimer = null;
  }
}

function startJobPolling(jobId: JobId): void {
  stopJobPolling();
  jobPollTimer = window.setInterval(() => {
    void pollJobSnapshot(jobId);
  }, 4000);
}

function setHealth(state: "unknown" | "ok" | "bad" | "warn", label: string): void {
  healthDot.dataset.state = state;
  bridgeChipLabel.textContent = label;
  healthSrEl.textContent = `Bridge status: ${label}`;
}

/* -------------------------------------------------------------------------- */
/*  Bridge chip toggle                                                        */
/* -------------------------------------------------------------------------- */

function toggleModePanel(): void {
  const expanded = bridgeChip.getAttribute("aria-expanded") === "true";
  bridgeChip.setAttribute("aria-expanded", String(!expanded));
  modePanelEl.classList.toggle("hidden", expanded);
}

/* -------------------------------------------------------------------------- */
/*  Messaging helpers                                                         */
/* -------------------------------------------------------------------------- */

function sendRequest<K extends PopupRequest["kind"]>(
  req: Extract<PopupRequest, { kind: K }>
): Promise<Extract<PopupResponse, { kind: K }>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(req, (res: PopupResponse) => {
      resolve(res as Extract<PopupResponse, { kind: K }>);
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  Flow                                                                      */
/* -------------------------------------------------------------------------- */

async function init(): Promise<void> {
  footerVersionEl.textContent = `v${__EXTENSION_VERSION__} · local bridge`;

  // Phase 1: Read cached state + fire independent background requests in parallel.
  const [stored, preferenceRes, tokenRes] = await Promise.all([
    chrome.storage.local.get(STATE_STORAGE_KEY),
    sendRequest({ kind: "getModePreference" }),
    sendRequest({ kind: "hasToken" }),
  ]);

  // Apply cached state for instant render.
  const state = stored[STATE_STORAGE_KEY] as ExtensionState | undefined;
  preferredPreset = state?.preferredBridgePreset ?? preferredPreset;
  if (preferenceRes.ok) {
    preferredPreset = preferenceRes.result.preset;
  }
  modeSelect.value = preferredPreset;
  renderModePanel();

  if (state?.lastHealthAt != null && state.lastHealthOk != null) {
    const age = Date.now() - new Date(state.lastHealthAt).getTime();
    if (age < 30_000) {
      if (state.lastHealthOk) {
        setHealth("ok", "bridge");
        offlineBannerEl.classList.add("hidden");
      } else {
        setHealth("bad", "offline");
        offlineBannerEl.classList.remove("hidden");
      }
    }
  }

  // Gate on token — setup flow if missing.
  if (!tokenRes.ok || !tokenRes.result.present) {
    show("setup");
    setupTokenInput.focus();
    return;
  }

  // Reopen recovery — show cached result if available.
  if (state?.lastResult) {
    currentJobId = state.lastResult.jobId;
    currentResult = state.lastResult.result;
    renderDone(state.lastResult.result);
  } else if (state?.lastJobId) {
    currentJobId = state.lastJobId;
    jobIdEl.textContent = `job ${currentJobId}`;
    show("running");
    subscribeToJob(currentJobId);
    startJobPolling(currentJobId);
  }

  // Phase 2: Health, capture, and recent jobs are independent — fire all at once.
  void refreshHealth();
  void loadRecentJobs();
  await runCapture();
}

async function onSetupSaveClick(): Promise<void> {
  const token = setupTokenInput.value.trim();
  setupSaveBtn.disabled = true;
  const res = await sendRequest({ kind: "setToken", token });
  setupSaveBtn.disabled = false;
  if (!res.ok) {
    renderError(res.error.code, res.error.message);
    return;
  }
  // Token saved — move into the normal flow.
  setupTokenInput.value = "";
  void refreshHealth();
  await runCapture();
}

declare const __EXTENSION_VERSION__: string;

async function refreshHealth(): Promise<void> {
  setHealth("unknown", "checking\u2026");
  const res = await sendRequest({ kind: "getHealth" });
  if (res.ok) {
    setHealth("ok", `bridge ${res.result.bridgeVersion}`);
    offlineBannerEl.classList.add("hidden");
    currentBridgePreset = presetFromHealth(res.result);
    renderModePanel(res.result);
    // Version mismatch warning
    try {
      const extMajorMinor = __EXTENSION_VERSION__.split(".").slice(0, 2).join(".");
      const bridgeMajorMinor = res.result.bridgeVersion.split(".").slice(0, 2).join(".");
      if (extMajorMinor !== bridgeMajorMinor) {
        setHealth("warn", `v${__EXTENSION_VERSION__} \u2260 bridge v${res.result.bridgeVersion}`);
      }
    } catch { /* unparseable version, skip warning */ }
  } else {
    setHealth("bad", res.error.code);
    offlineBannerEl.classList.remove("hidden");
    currentBridgePreset = null;
    renderModePanel();
  }
}

async function runCapture(): Promise<void> {
  const res = await sendRequest({ kind: "captureActiveTab" });
  if (!res.ok) {
    renderError(res.error.code, res.error.message);
    return;
  }
  captured = res.result;
  renderCaptured(captured);
}

function renderCaptured(cap: CapturedTab): void {
  captureUrlEl.textContent = cap.url;
  captureTitleEl.textContent = cap.title || "(no title)";
  const label =
    cap.detection.label === "job_posting"
      ? `detected job posting (${pct(cap.detection.confidence)})`
      : cap.detection.label === "likely_job_posting"
        ? `likely job posting (${pct(cap.detection.confidence)})`
        : "not a job posting (heuristic)";
  captureDetectionEl.textContent = label;

  // Reset expiry warning state
  expiryWarningEl.classList.add("hidden");
  evaluateBtn.classList.remove("hidden");
  captureDetectionEl.style.color = "";

  if (cap.detection.label === "not_job_posting") {
    show("notDetected");
    return;
  }
  show("captured");
}

/* -------------------------------------------------------------------------- */
/*  Inline expiry warning (replaces confirm())                                */
/* -------------------------------------------------------------------------- */

function showExpiryWarning(reason: string): Promise<boolean> {
  return new Promise((resolve) => {
    expiryBypassResolve = resolve;
    expiryWarningTextEl.textContent = `This posting appears to be expired. ${reason}`;
    expiryWarningEl.classList.remove("hidden");
    evaluateBtn.classList.add("hidden");
    captureDetectionEl.textContent = "\u26A0 This posting appears to be expired.";
    captureDetectionEl.style.color = "var(--warn)";
    expiryEvaluateBtn.focus();
  });
}

function onExpiryEvaluate(): void {
  expiryWarningEl.classList.add("hidden");
  evaluateBtn.classList.remove("hidden");
  expiryBypassResolve?.(true);
  expiryBypassResolve = null;
}

function onExpiryDismiss(): void {
  expiryWarningEl.classList.add("hidden");
  evaluateBtn.classList.remove("hidden");
  evaluateBtn.disabled = false;
  evaluateBtn.textContent = "Evaluate this job";
  expiryBypassResolve?.(false);
  expiryBypassResolve = null;
}

/* -------------------------------------------------------------------------- */
/*  Evaluate flow                                                             */
/* -------------------------------------------------------------------------- */

async function onEvaluateClick(): Promise<void> {
  if (!captured) return;
  evaluateBtn.disabled = true;

  // Liveness pre-check — skip silently on network error
  evaluateBtn.textContent = "Checking liveness\u2026";
  const livenessRes = await sendRequest({ kind: "checkLiveness", url: captured.url });
  if (livenessRes.ok && livenessRes.result.status === "expired") {
    evaluateBtn.disabled = false;
    evaluateBtn.textContent = "Evaluate this job";
    const proceed = await showExpiryWarning(livenessRes.result.reason);
    if (!proceed) return;
  }
  // active, uncertain, or network error → proceed

  evaluateBtn.textContent = "Starting evaluation\u2026";
  const res = await sendRequest({
    kind: "startEvaluation",
    input: {
      url: captured.url,
      title: captured.title,
      pageText: captured.pageText,
      detection: captured.detection,
    },
  });
  evaluateBtn.disabled = false;
  evaluateBtn.textContent = "Evaluate this job";
  if (!res.ok) {
    renderError(res.error.code, res.error.message);
    return;
  }
  currentJobId = res.result.jobId;
  jobIdEl.textContent = `job ${currentJobId}`;
  renderPhases(res.result.initialSnapshot);
  show("running");
  subscribeToJob(currentJobId);
  startJobPolling(currentJobId);
}

function subscribeToJob(jobId: JobId): void {
  activePort?.disconnect();
  const port = chrome.runtime.connect({ name: "career-ops.job" });
  activePort = port;
  port.postMessage({ jobId });
  port.onMessage.addListener((raw: unknown) => {
    const msg = raw as JobPortMessage;
    if (msg.channel !== "job") return;
    handleJobEvent(msg.event);
  });
}

function handleJobEvent(
  event: JobEvent | { kind: "closed"; jobId: JobId; reason: "done" | "failed" | "client" }
): void {
  if (event.kind === "snapshot") {
    applyJobSnapshot(event.snapshot);
    return;
  }
  if (event.kind === "phase") {
    appendPhase(event.phase);
    return;
  }
  if (event.kind === "done") {
    stopJobPolling();
    currentResult = event.result;
    renderDone(event.result);
    return;
  }
  if (event.kind === "failed") {
    stopJobPolling();
    renderError(event.error.code, event.error.message);
    return;
  }
  // closed — ignore; terminal event already handled.
}

function applyJobSnapshot(snap: JobSnapshot): void {
  if (snap.phase === "completed" && snap.result) {
    stopJobPolling();
    currentResult = snap.result;
    renderDone(snap.result);
    return;
  }
  if (snap.phase === "failed" && snap.error) {
    stopJobPolling();
    renderError(snap.error.code, snap.error.message);
    return;
  }
  renderPhases(snap);
}

async function pollJobSnapshot(jobId: JobId): Promise<void> {
  if (currentJobId !== jobId) {
    stopJobPolling();
    return;
  }
  const res = await sendRequest({ kind: "getJob", jobId });
  if (!res.ok) return;
  applyJobSnapshot(res.result);
}

function renderPhases(snap: JobSnapshot): void {
  while (phaseListEl.firstChild) phaseListEl.removeChild(phaseListEl.firstChild);
  const done = new Set(snap.progress?.phases.map((p) => p.phase) ?? []);
  let activeIdx = -1;

  // When snap.phase is "failed", find the last completed phase to mark it as failed.
  // PHASE_ORDER doesn't contain "failed", so we need a separate lookup.
  const isFailed = snap.phase === "failed";
  let failedPhaseIdx = -1;
  if (isFailed) {
    for (let j = PHASE_ORDER.length - 1; j >= 0; j--) {
      const p = PHASE_ORDER[j]!;
      if (done.has(p)) { failedPhaseIdx = j; break; }
    }
  }

  for (let i = 0; i < PHASE_ORDER.length; i++) {
    const phase = PHASE_ORDER[i]!;
    const li = document.createElement("li");
    li.textContent = PHASE_LABEL[phase];
    if (isFailed) {
      if (i === failedPhaseIdx) {
        li.className = "failed";
      } else if (done.has(phase)) {
        li.className = "completed";
      }
    } else if (phase === snap.phase) {
      li.className = "active";
      activeIdx = i;
    } else if (done.has(phase)) {
      li.className = "completed";
    }
    phaseListEl.appendChild(li);
  }
  // Phase counter
  const completedCount = done.size;
  const total = PHASE_ORDER.length;
  if (isFailed) {
    phaseCounterEl.textContent = `Failed at phase ${failedPhaseIdx + 1} of ${total}`;
  } else if (activeIdx >= 0) {
    phaseCounterEl.textContent = `Phase ${activeIdx + 1} of ${total}`;
  } else {
    phaseCounterEl.textContent = `${completedCount} of ${total} complete`;
  }
}

function appendPhase(phase: JobPhase): void {
  const items = Array.from(phaseListEl.children) as HTMLLIElement[];
  const reachedIdx = PHASE_ORDER.indexOf(phase);
  if (reachedIdx < 0) return;
  for (let i = 0; i < PHASE_ORDER.length; i++) {
    const li = items[i];
    if (!li) continue;
    if (i === reachedIdx) {
      li.className = "active";
    } else if (i < reachedIdx) {
      li.className = "completed";
    }
  }
  phaseCounterEl.textContent = `Phase ${reachedIdx + 1} of ${PHASE_ORDER.length}`;
}

function renderDone(result: EvaluationResult): void {
  stopJobPolling();
  // Score hero — large, color-coded
  resultScoreEl.textContent = `${result.score.toFixed(1)}/5`;
  resultScoreEl.style.color = scoreColor(result.score);

  // Company — Role · Archetype
  resultHeaderEl.textContent = `${result.company} \u2014 ${result.role} \u00b7 ${result.archetype}`;

  resultTldrEl.textContent = result.tldr;
  mergeTrackerBtn.disabled = result.trackerMerged;
  mergeTrackerBtn.textContent = trackerButtonLabel(result);
  show("done");
  if (result.trackerMerged) {
    void loadRecentJobs();
  }
}

async function onOpenReportClick(): Promise<void> {
  if (!currentResult) return;
  await sendRequest({
    kind: "openPath",
    absolutePath: currentResult.reportPath,
  });
}

/* -------------------------------------------------------------------------- */
/*  Contextual error rendering                                                */
/* -------------------------------------------------------------------------- */

/** Structured recovery hint — text with optional inline code snippet. */
interface RecoveryHint {
  before: string;
  code?: string;
}

function classifyError(code: string, message: string): {
  category: string;
  explanation: string;
  recovery: RecoveryHint;
  retryable: boolean;
} {
  const lower = `${code} ${message}`.toLowerCase();

  if (lower.includes("econnrefused") || lower.includes("fetch") || lower.includes("network") || lower.includes("bridge_unreachable")) {
    return {
      category: "Connection error",
      explanation: "The local bridge isn't running or can't be reached.",
      recovery: { before: "Start the bridge:", code: "cd bridge && npm run start" },
      retryable: true,
    };
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("deadline")) {
    return {
      category: "Timeout",
      explanation: "The evaluation took too long. This can happen with slow AI model responses or large job descriptions.",
      recovery: { before: "Try again \u2014 timeouts are usually transient." },
      retryable: true,
    };
  }
  if (lower.includes("auth") || lower.includes("token") || lower.includes("401") || lower.includes("403")) {
    return {
      category: "Authentication error",
      explanation: "The bridge token is invalid or expired.",
      recovery: { before: "Re-enter your token:", code: "cat bridge/.bridge-token" },
      retryable: false,
    };
  }
  if (lower.includes("rate") || lower.includes("429") || lower.includes("quota")) {
    return {
      category: "Rate limited",
      explanation: "The AI provider returned a rate limit. Wait a moment before retrying.",
      recovery: { before: "Wait 30\u201360 seconds, then try again." },
      retryable: true,
    };
  }
  // Generic fallback
  return {
    category: "Evaluation error",
    explanation: message || "Something went wrong during the evaluation.",
    recovery: code ? { before: `Error code: ${code}` } : { before: "" },
    retryable: true,
  };
}

function renderRecovery(el: HTMLElement, hint: RecoveryHint): void {
  while (el.firstChild) el.removeChild(el.firstChild);
  if (hint.before) el.appendChild(document.createTextNode(hint.before));
  if (hint.code) {
    if (hint.before) el.appendChild(document.createTextNode(" "));
    const codeEl = document.createElement("code");
    codeEl.textContent = hint.code;
    el.appendChild(codeEl);
  }
}

function renderError(code: string, message: string): void {
  stopJobPolling();
  const err = classifyError(code, message);
  lastErrorRetryable = err.retryable;
  errorCategoryEl.textContent = err.category;
  errorExplanationEl.textContent = err.explanation;
  renderRecovery(errorRecoveryEl, err.recovery);
  retryBtn.textContent = err.retryable ? "Try again" : "Re-enter token";
  show("error");
}

function renderModePanel(health?: HealthResult): void {
  modeSelect.value = preferredPreset;
  modeHelpEl.textContent = presetDescription(preferredPreset);
  modeCommandEl.textContent = presetCommand(preferredPreset);

  const currentText = currentBridgePreset
    ? `Current bridge: ${presetDisplayName(currentBridgePreset)}`
    : health
      ? `Current bridge: ${health.execution.mode}`
      : "Current bridge: unknown";
  modeCurrentEl.textContent = currentText;

  if (!currentBridgePreset) {
    modeMatchEl.dataset.match = "no";
    modeMatchEl.textContent =
      "Restart the local bridge with the command below if you want this preset.";
    return;
  }

  const matches = currentBridgePreset === preferredPreset;
  modeMatchEl.dataset.match = matches ? "yes" : "no";
  modeMatchEl.textContent = matches
    ? "Bridge already matches your preferred preset."
    : "Bridge is running a different preset. Restart it with the command below to switch.";
}

async function onModeChange(): Promise<void> {
  preferredPreset = modeSelect.value as BridgePreset;
  renderModePanel();
  const res = await sendRequest({
    kind: "setModePreference",
    preset: preferredPreset,
  });
  if (!res.ok) {
    renderError(res.error.code, res.error.message);
    return;
  }
  preferredPreset = res.result.preset;
  renderModePanel();
}

async function onCopyModeCommand(): Promise<void> {
  const text = presetCommand(preferredPreset);
  try {
    await navigator.clipboard.writeText(text);
    modeCopyBtn.textContent = "Copied";
    setTimeout(() => {
      modeCopyBtn.textContent = "Copy start command";
    }, 1500);
  } catch {
    modeCopyBtn.textContent = "Copy failed";
    setTimeout(() => {
      modeCopyBtn.textContent = "Copy start command";
    }, 1500);
  }
}

async function onEvaluateAnywayClick(): Promise<void> {
  if (!captured) return;
  show("captured");
  await onEvaluateClick();
}

async function onCopySummaryClick(): Promise<void> {
  if (!currentResult) return;
  const text = `${currentResult.company} \u2014 ${currentResult.role}\nScore: ${currentResult.score.toFixed(1)}/5 \u00b7 ${currentResult.archetype}\n${currentResult.tldr}`;
  try {
    await navigator.clipboard.writeText(text);
    copySummaryBtn.textContent = "Copied";
  } catch {
    copySummaryBtn.textContent = "Copy failed";
  }
  setTimeout(() => {
    copySummaryBtn.textContent = "Copy summary";
  }, 1500);
}

async function onRetryClick(): Promise<void> {
  stopJobPolling();
  if (!lastErrorRetryable) {
    // Non-retryable (auth) — clear token and go to setup
    await sendRequest({ kind: "setToken", token: "" });
    show("setup");
    setupTokenInput.focus();
    return;
  }
  if (currentJobId) {
    currentJobId = null;
    currentResult = null;
  }
  await runCapture();
}

/* -------------------------------------------------------------------------- */
/*  Recent evaluations                                                        */
/* -------------------------------------------------------------------------- */

async function loadRecentJobs(): Promise<void> {
  try {
    const res = await sendRequest({ kind: "getRecentJobs", limit: 8 });
    if (!res.ok) return;
    const { rows } = res.result;
    if (rows.length === 0) return;

    // Hide the empty state, show rows
    recentEmptyEl.classList.add("hidden");

    // Clear any previous rows (but keep the empty element)
    const existing = recentListEl.querySelectorAll(".recent-item");
    existing.forEach((el) => el.remove());

    for (const row of rows) {
      const item = document.createElement("div");
      item.className = "recent-item";
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
      item.setAttribute("aria-label", `${row.company} ${row.role} \u2014 score ${row.score}`);

      const left = document.createElement("span");
      const companySpan = document.createElement("span");
      companySpan.className = "company";
      companySpan.textContent = row.company;
      const roleSpan = document.createElement("span");
      roleSpan.className = "role";
      roleSpan.textContent = row.role;
      left.appendChild(companySpan);
      left.appendChild(roleSpan);

      const scoreSpan = document.createElement("span");
      scoreSpan.className = "score";
      scoreSpan.textContent = row.score;
      const numScore = parseFloat(row.score);
      if (!isNaN(numScore)) scoreSpan.style.color = scoreColor(numScore);

      item.appendChild(left);
      item.appendChild(scoreSpan);

      const reportNum = row.num;
      const openReport = () => {
        void (async () => {
          const reportRes = await sendRequest({ kind: "readReport", reportNum });
          if (reportRes.ok) {
            void sendRequest({ kind: "openPath", absolutePath: reportRes.result.path });
          }
        })();
      };

      item.addEventListener("click", openReport);
      item.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openReport();
        }
      });

      recentListEl.appendChild(item);
    }

    // Check for scroll overflow and apply fade mask
    checkRecentOverflow();
  } catch {
    // silently fail — recent is informational, not critical
  }
}

function checkRecentOverflow(): void {
  const hasOverflow = recentListWrap.scrollHeight > recentListWrap.clientHeight;
  recentListWrap.classList.toggle("has-overflow", hasOverflow);
}

async function onMergeTrackerClick(): Promise<void> {
  mergeTrackerBtn.disabled = true;
  mergeTrackerBtn.textContent = "Merging\u2026";
  const res = await sendRequest({ kind: "mergeTracker", dryRun: false });
  if (res.ok) {
    mergeTrackerBtn.textContent =
      res.result.added > 0
        ? `Saved to tracker (${res.result.added} added)`
        : res.result.updated > 0
          ? `Saved to tracker (${res.result.updated} updated)`
          : "Tracker already up to date";
    void loadRecentJobs();
  } else {
    mergeTrackerBtn.disabled = false;
    mergeTrackerBtn.textContent = "Merge failed";
  }
}

/* -------------------------------------------------------------------------- */
/*  Wire events                                                               */
/* -------------------------------------------------------------------------- */

bridgeChip.addEventListener("click", toggleModePanel);
evaluateBtn.addEventListener("click", () => void onEvaluateClick());
openReportBtn.addEventListener("click", () => void onOpenReportClick());
retryBtn.addEventListener("click", () => void onRetryClick());
setupSaveBtn.addEventListener("click", () => void onSetupSaveClick());
mergeTrackerBtn.addEventListener("click", () => void onMergeTrackerClick());
copySummaryBtn.addEventListener("click", () => void onCopySummaryClick());
evaluateAnywayBtn.addEventListener("click", () => void onEvaluateAnywayClick());
expiryEvaluateBtn.addEventListener("click", onExpiryEvaluate);
expiryDismissBtn.addEventListener("click", onExpiryDismiss);
modeSelect.addEventListener("change", () => void onModeChange());
modeCopyBtn.addEventListener("click", () => void onCopyModeCommand());

void init();
