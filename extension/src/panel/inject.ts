/**
 * inject.ts — floating panel injected into the page via content script.
 *
 * Creates a shadow-DOM container with the career-ops panel UI.
 * Features:
 *   • Draggable by the header bar
 *   • Persists across focus changes (it's part of the page DOM)
 *   • Toggled by toolbar icon click (message from background)
 *   • Remembers position via chrome.storage.local
 *   • Shadow DOM isolates styles from the host page
 *
 * All communication with the bridge goes through chrome.runtime messages
 * to the background service worker, same as the old popup.
 */

import type { JobPhase } from "../contracts/bridge-wire.js";
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

declare const __EXTENSION_VERSION__: string;
const PANEL_ID = "career-ops-panel-root";
const STORAGE_POS_KEY = "careerOps.panelPos";

function getOrCreatePanel(): { root: HTMLElement; shadow: ShadowRoot; existed: boolean } {
  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    return { root: existing, shadow: existing.shadowRoot!, existed: true };
  }

  const root = document.createElement("div");
  root.id = PANEL_ID;
  root.style.cssText = "all:initial; position:fixed; z-index:2147483647; top:80px; right:20px;";
  const shadow = root.attachShadow({ mode: "open" });
  document.body.appendChild(root);
  return { root, shadow, existed: false };
}

function buildStyles(): string {
  return `
:host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif; }
* { box-sizing: border-box; }

.panel-container {
  width: 380px;
  background: #0f0f10;
  color: #e8e8ea;
  border: 1px solid #26262a;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  font-size: 13px;
  line-height: 1.45;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}

.drag-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #181819;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid #26262a;
}
.drag-bar:active { cursor: grabbing; }
.drag-bar h1 { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 0.02em; color: #e8e8ea; }

.health { display: flex; align-items: center; gap: 5px; font-size: 10px; color: #8f8f94; }
.health .dot { width: 7px; height: 7px; border-radius: 50%; background: #8f8f94; }
.health[data-state="ok"] .dot { background: #4ecb71; }
.health[data-state="bad"] .dot { background: #ef5f5f; }
.health[data-state="warn"] .dot { background: #e5b93c; }

.close-btn {
  background: none; border: none; color: #8f8f94; font-size: 16px;
  cursor: pointer; padding: 0 4px; line-height: 1;
}
.close-btn:hover { color: #e8e8ea; }

.panel-body {
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section {
  background: #181819;
  border: 1px solid #26262a;
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-title {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: #8f8f94;
}

.hidden { display: none !important; }

.capture-url { font-size: 11px; color: #8f8f94; word-break: break-all; }
.capture-title { font-size: 13px; font-weight: 500; }
.capture-detection { font-size: 11px; color: #8f8f94; }

.cta {
  appearance: none; background: transparent; color: #e8e8ea;
  border: 1px solid #26262a; border-radius: 4px; padding: 7px 10px;
  font-family: inherit; font-size: 12px; font-weight: 500; cursor: pointer;
}
.cta:hover { background: #202024; }
.cta.primary { background: #7aa7ff; color: #000; border-color: #7aa7ff; }
.cta.primary:hover { background: #5c8eff; border-color: #5c8eff; }
.cta:disabled { opacity: 0.5; cursor: default; }

.job-id { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #8f8f94; }
.phase-list { margin: 0; padding: 0 0 0 16px; display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.phase-list li { color: #8f8f94; }
.phase-list li.active { color: #e8e8ea; font-weight: 500; }
.phase-list li.completed { color: #4ecb71; }
.phase-list li.failed { color: #ef5f5f; }

.result { font-size: 13px; font-weight: 500; }
.result .score { color: #7aa7ff; font-weight: 600; }
.result-tldr { font-size: 11px; color: #8f8f94; line-height: 1.5; }
.result-actions { display: flex; gap: 6px; flex-wrap: wrap; }

.error-code { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #ef5f5f; }
.error-message { font-size: 12px; }

.offline-banner {
  background: #2a1a1a; border: 1px solid #ef5f5f; border-radius: 4px;
  padding: 6px 10px; font-size: 11px; color: #ef5f5f;
}
.offline-banner code { color: #e8e8ea; }

.setup-hint { margin: 0; font-size: 11px; color: #8f8f94; line-height: 1.5; }
.setup-cmd { font-family: ui-monospace, Menlo, monospace; background: #000; padding: 2px 6px; border-radius: 3px; color: #7aa7ff; }
.setup-input {
  appearance: none; background: #000; color: #e8e8ea;
  border: 1px solid #26262a; border-radius: 4px; padding: 7px 10px;
  font-family: ui-monospace, Menlo, monospace; font-size: 11px; outline: none; width: 100%;
}
.setup-input:focus { border-color: #7aa7ff; }

.mode-field { display: flex; flex-direction: column; gap: 6px; }
.mode-label { font-size: 11px; color: #8f8f94; }
.mode-select {
  appearance: none; background: #000; color: #e8e8ea;
  border: 1px solid #26262a; border-radius: 4px; padding: 7px 10px;
  font-family: inherit; font-size: 12px; outline: none;
}
.mode-select:focus { border-color: #7aa7ff; }
.mode-meta { display: flex; flex-direction: column; gap: 2px; }
.mode-current, .mode-match, .mode-help {
  font-size: 11px; color: #8f8f94; line-height: 1.5;
}
.mode-match[data-match="yes"] { color: #4ecb71; }
.mode-match[data-match="no"] { color: #e5b93c; }
.mode-command {
  display: block; background: #000; color: #7aa7ff;
  border: 1px solid #26262a; border-radius: 4px; padding: 8px 10px;
  font-family: ui-monospace, Menlo, monospace; font-size: 11px;
  white-space: pre-wrap; word-break: break-word;
}

.recent-list { display: flex; flex-direction: column; gap: 3px; }
.recent-empty { font-size: 11px; color: #8f8f94; }
.recent-item {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 11px; padding: 3px 0; border-bottom: 1px solid #26262a; cursor: pointer;
}
.recent-item:last-child { border-bottom: none; }
.recent-item:hover .company { color: #7aa7ff; }
.recent-item .company { font-weight: 500; color: #e8e8ea; }
.recent-item .role { color: #8f8f94; margin-left: 4px; }
.recent-item .score { color: #7aa7ff; font-weight: 600; white-space: nowrap; }

.footer { text-align: center; font-size: 10px; color: #8f8f94; padding: 4px 0; }
`;
}

function buildHTML(): string {
  return `
<div class="panel-container">
  <div class="drag-bar" id="drag-bar">
    <h1>career-ops</h1>
    <div class="health" id="health" data-state="unknown">
      <span class="dot"></span>
      <span class="label">checking…</span>
    </div>
    <button class="close-btn" id="close-btn" title="Close">&times;</button>
  </div>
  <div class="panel-body">
    <div id="offline-banner" class="offline-banner hidden">
      Bridge not reachable. Run: <code>cd bridge && npm run start</code>
    </div>
    <div id="mode-panel" class="section">
      <div class="section-title">Bridge Mode</div>
      <label class="mode-field">
        <span class="mode-label">Preferred mode</span>
        <select id="mode-select" class="mode-select">
          <option value="real-codex">real / codex</option>
          <option value="real-claude">real / claude</option>
          <option value="sdk">sdk</option>
          <option value="fake">fake</option>
        </select>
      </label>
      <div class="mode-meta">
        <div class="mode-current" id="mode-current">Current bridge: unknown</div>
        <div class="mode-match" id="mode-match">Select a preset to see the startup command.</div>
      </div>
      <div class="mode-help" id="mode-help"></div>
      <code class="mode-command" id="mode-command"></code>
      <button class="cta" id="mode-copy-btn">Copy start command</button>
    </div>
    <div id="setup" class="section hidden">
      <div class="section-title">First-time setup</div>
      <p class="setup-hint">Paste your bridge token:<br/><code class="setup-cmd">cat &lt;repo&gt;/bridge/.bridge-token</code></p>
      <input type="password" id="setup-token" class="setup-input" placeholder="paste token…" />
      <button class="cta primary" id="setup-save-btn">Save token</button>
    </div>
    <div id="capture" class="section hidden">
      <div class="section-title">Detected page</div>
      <div class="capture-url" id="capture-url"></div>
      <div class="capture-title" id="capture-title"></div>
      <div class="capture-detection" id="capture-detection"></div>
      <button class="cta primary" id="evaluate-btn">Evaluate this job</button>
    </div>
    <div id="not-detected" class="section hidden">
      <div class="section-title">No job posting detected</div>
      <p style="margin:0;font-size:12px;color:#8f8f94;">This page doesn't look like a job posting. If it is, you can still evaluate it.</p>
      <button class="cta" id="evaluate-anyway-btn">Evaluate anyway</button>
    </div>
    <div id="running" class="section hidden">
      <div class="section-title">Running evaluation</div>
      <div class="job-id" id="job-id"></div>
      <ol class="phase-list" id="phase-list"></ol>
    </div>
    <div id="done" class="section hidden">
      <div class="section-title">Evaluation complete</div>
      <div class="result" id="result-header"></div>
      <div class="result-tldr" id="result-tldr"></div>
      <div class="result-actions">
        <button class="cta" id="open-report-btn">Open report</button>
        <button class="cta" id="copy-summary-btn">Copy summary</button>
        <button class="cta" id="merge-tracker-btn">Save to tracker</button>
      </div>
    </div>
    <div id="error" class="section hidden">
      <div class="section-title">Error</div>
      <div class="error-code" id="error-code"></div>
      <div class="error-message" id="error-message"></div>
      <button class="cta" id="retry-btn">Try again</button>
    </div>
    <div id="newgrad-scan" class="section hidden">
      <div class="section-title">newgrad-jobs.com Scanner</div>
      <div id="ng-status" style="font-size:12px;color:#8f8f94;margin-bottom:6px;"></div>
      <button class="cta primary" id="ng-scan-btn">Scan & Score</button>
      <div id="ng-results" class="hidden" style="display:flex;flex-direction:column;gap:4px;margin-top:8px;">
        <div id="ng-promoted" style="font-size:12px;color:#4ecb71;"></div>
        <div id="ng-filtered" style="font-size:12px;color:#8f8f94;"></div>
        <div id="ng-deduped" style="font-size:12px;color:#8f8f94;"></div>
        <button class="cta primary" id="ng-enrich-btn" style="margin-top:4px;">Enrich detail pages</button>
      </div>
      <div id="ng-enrich-progress" class="hidden" style="font-size:12px;color:#8f8f94;margin-top:8px;"></div>
      <div id="ng-enrich-results" class="hidden" style="display:flex;flex-direction:column;gap:4px;margin-top:8px;">
        <div id="ng-added" style="font-size:12px;color:#4ecb71;"></div>
        <div id="ng-skipped" style="font-size:12px;color:#8f8f94;"></div>
        <div style="font-size:11px;color:#8f8f94;margin-top:6px;">
          Run <code style="color:#7aa7ff;">/career-ops pipeline</code> to start full evaluations.
        </div>
      </div>
    </div>
    <div id="recent" class="section">
      <div class="section-title">Recent evaluations</div>
      <div class="recent-list" id="recent-list">
        <div class="recent-empty">No evaluations yet</div>
      </div>
    </div>
    <div class="footer">v${__EXTENSION_VERSION__} · Alt+Shift+C to toggle</div>
  </div>
</div>`;
}

/* -------------------------------------------------------------------------- */
/*  Panel controller (mirrors popup/index.ts logic)                            */
/* -------------------------------------------------------------------------- */

function initPanel(shadow: ShadowRoot, root: HTMLElement): void {
  const $ = (id: string) => shadow.getElementById(id)!;

  const dragBar = $("drag-bar");
  const closeBtn = $("close-btn");
  const healthEl = $("health");
  const offlineBanner = $("offline-banner");
  const modeSelect = $("mode-select") as HTMLSelectElement;
  const modeCurrentEl = $("mode-current");
  const modeMatchEl = $("mode-match");
  const modeHelpEl = $("mode-help");
  const modeCommandEl = $("mode-command");
  const modeCopyBtn = $("mode-copy-btn") as HTMLButtonElement;
  const setupEl = $("setup");
  const setupTokenInput = $("setup-token") as HTMLInputElement;
  const setupSaveBtn = $("setup-save-btn") as HTMLButtonElement;
  const captureEl = $("capture");
  const notDetectedEl = $("not-detected");
  const runningEl = $("running");
  const doneEl = $("done");
  const errorEl = $("error");
  const captureUrlEl = $("capture-url");
  const captureTitleEl = $("capture-title");
  const captureDetectionEl = $("capture-detection");
  const evaluateBtn = $("evaluate-btn") as HTMLButtonElement;
  const jobIdEl = $("job-id");
  const phaseListEl = $("phase-list");
  const resultHeaderEl = $("result-header");
  const resultTldrEl = $("result-tldr");
  const openReportBtn = $("open-report-btn") as HTMLButtonElement;
  const mergeTrackerBtn = $("merge-tracker-btn") as HTMLButtonElement;
  const errorCodeEl = $("error-code");
  const errorMessageEl = $("error-message");
  const retryBtn = $("retry-btn") as HTMLButtonElement;
  const recentListEl = $("recent-list");
  const copySummaryBtn = $("copy-summary-btn") as HTMLButtonElement;
  const evaluateAnywayBtn = $("evaluate-anyway-btn") as HTMLButtonElement;
  const newgradScanEl = $("newgrad-scan");
  const ngStatusEl = $("ng-status");
  const ngScanBtn = $("ng-scan-btn") as HTMLButtonElement;
  const ngResultsEl = $("ng-results");
  const ngPromotedEl = $("ng-promoted");
  const ngFilteredEl = $("ng-filtered");
  const ngDedupedEl = $("ng-deduped");
  const ngEnrichBtn = $("ng-enrich-btn") as HTMLButtonElement;
  const ngEnrichProgressEl = $("ng-enrich-progress");
  const ngEnrichResultsEl = $("ng-enrich-results");
  const ngAddedEl = $("ng-added");
  const ngSkippedEl = $("ng-skipped");

  // --- Drag logic ---
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  dragBar.addEventListener("mousedown", (e: Event) => {
    const me = e as MouseEvent;
    isDragging = true;
    dragOffsetX = me.clientX - root.offsetLeft;
    dragOffsetY = me.clientY - root.offsetTop;
    me.preventDefault();
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!isDragging) return;
    const x = Math.max(0, Math.min(e.clientX - dragOffsetX, window.innerWidth - 100));
    const y = Math.max(0, Math.min(e.clientY - dragOffsetY, window.innerHeight - 100));
    root.style.left = x + "px";
    root.style.top = y + "px";
    root.style.right = "auto";
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    chrome.storage.local.set({
      [STORAGE_POS_KEY]: { left: root.style.left, top: root.style.top },
    });
  });

  // Restore saved position
  chrome.storage.local.get(STORAGE_POS_KEY, (data) => {
    const pos = data[STORAGE_POS_KEY];
    if (pos?.left && pos?.top) {
      root.style.left = pos.left;
      root.style.top = pos.top;
      root.style.right = "auto";
    }
  });

  // --- Close ---
  closeBtn.addEventListener("click", () => {
    root.style.display = "none";
  });

  // --- State machine ---
  type UiState = "idle" | "setup" | "captured" | "notDetected" | "running" | "done" | "error" | "newgradScan";
  let capturedData: { url: string; title: string; pageText: string; detection: any } | null = null;
  let currentJobId: string | null = null;
  let currentResult: any = null;
  let activePort: chrome.runtime.Port | null = null;
  let preferredPreset: BridgePreset = "real-codex";
  let currentBridgePreset: BridgePreset | null = null;
  let jobPollTimer: number | null = null;

  // PHASE_ORDER, PHASE_LABEL imported from shared/utils

  function show(state: UiState): void {
    setupEl.classList.toggle("hidden", state !== "setup");
    captureEl.classList.toggle("hidden", state !== "captured");
    notDetectedEl.classList.toggle("hidden", state !== "notDetected");
    runningEl.classList.toggle("hidden", state !== "running");
    doneEl.classList.toggle("hidden", state !== "done");
    errorEl.classList.toggle("hidden", state !== "error");
    newgradScanEl.classList.toggle("hidden", state !== "newgradScan");
  }

  function stopJobPolling(): void {
    if (jobPollTimer !== null) {
      window.clearInterval(jobPollTimer);
      jobPollTimer = null;
    }
  }

  function startJobPolling(jobId: string): void {
    stopJobPolling();
    jobPollTimer = window.setInterval(() => {
      void pollJobSnapshot(jobId);
    }, 4000);
  }

  function setHealth(state: string, label: string): void {
    healthEl.dataset.state = state;
    const labelEl = healthEl.querySelector(".label");
    if (labelEl) labelEl.textContent = label;
  }

  function sendMsg(msg: any): Promise<any> {
    return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
  }

  // pct, scoreColor imported from shared/utils

  // presetFromHealth, presetDisplayName, presetDescription, presetCommand imported from shared/utils

  function renderModePanel(health?: any): void {
    modeSelect.value = preferredPreset;
    modeHelpEl.textContent = presetDescription(preferredPreset);
    modeCommandEl.textContent = presetCommand(preferredPreset);

    const currentText = currentBridgePreset
      ? "Current bridge: " + presetDisplayName(currentBridgePreset)
      : health?.execution?.mode
        ? "Current bridge: " + health.execution.mode
        : "Current bridge: unknown";
    modeCurrentEl.textContent = currentText;

    if (!currentBridgePreset) {
      modeMatchEl.dataset.match = "no";
      modeMatchEl.textContent = "Restart the local bridge with the command below if you want this preset.";
      return;
    }

    const matches = currentBridgePreset === preferredPreset;
    modeMatchEl.dataset.match = matches ? "yes" : "no";
    modeMatchEl.textContent = matches
      ? "Bridge already matches your preferred preset."
      : "Bridge is running a different preset. Restart it with the command below to switch.";
  }

  async function refreshHealth(): Promise<void> {
    setHealth("unknown", "checking…");
    const res = await sendMsg({ kind: "getHealth" });
    if (res?.ok) {
      setHealth("ok", "bridge " + (res.result?.bridgeVersion ?? ""));
      offlineBanner.classList.add("hidden");
      currentBridgePreset = presetFromHealth(res.result);
      renderModePanel(res.result);
      // Version mismatch warning
      try {
        const extMM = __EXTENSION_VERSION__.split(".").slice(0, 2).join(".");
        const bridgeMM = (res.result?.bridgeVersion ?? "").split(".").slice(0, 2).join(".");
        if (extMM !== bridgeMM) {
          setHealth("warn", "v" + __EXTENSION_VERSION__ + " ≠ bridge v" + res.result.bridgeVersion);
        }
      } catch { /* skip */ }
    } else {
      setHealth("bad", res?.error?.code ?? "offline");
      offlineBanner.classList.remove("hidden");
      currentBridgePreset = null;
      renderModePanel();
    }
  }

  async function onModeChange(): Promise<void> {
    preferredPreset = modeSelect.value as BridgePreset;
    renderModePanel();
    const res = await sendMsg({ kind: "setModePreference", preset: preferredPreset });
    if (!res?.ok) {
      renderError(res?.error?.code ?? "INTERNAL", res?.error?.message ?? "failed to save mode");
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
    } catch {
      modeCopyBtn.textContent = "Copy failed";
    }
    setTimeout(() => {
      modeCopyBtn.textContent = "Copy start command";
    }, 1500);
  }

  // Tracks the origin we're currently waiting for the user to authorize
  // in a separate permission tab. When chrome.runtime broadcasts
  // "permissionGranted" for a matching origin, we re-run capture.
  let pendingPermissionOrigin: string | null = null;

  async function runCapture(): Promise<void> {
    const res = await sendMsg({ kind: "captureActiveTab" });
    if (!res?.ok) {
      const detail = res?.error?.detail as
        | { permissionRequired?: boolean; origin?: string; label?: string }
        | undefined;
      if (detail?.permissionRequired && detail.origin) {
        renderPermissionRequired(detail.origin, detail.label ?? detail.origin);
        return;
      }
      renderError(res?.error?.code ?? "INTERNAL", res?.error?.message ?? "capture failed");
      return;
    }
    capturedData = res.result;
    renderCaptured(res.result);
  }

  function renderPermissionRequired(origin: string, label: string): void {
    pendingPermissionOrigin = origin;
    errorCodeEl.textContent = "AUTHORIZE";
    while (errorMessageEl.firstChild) errorMessageEl.removeChild(errorMessageEl.firstChild);
    const p = document.createElement("div");
    p.textContent =
      `First time using career-ops on ${label}. Chrome needs your permission before the extension can read this page.`;
    errorMessageEl.appendChild(p);
    const btn = document.createElement("button");
    btn.textContent = `Authorize ${label}`;
    btn.style.cssText =
      "margin-top:10px;padding:6px 12px;border-radius:6px;border:1px solid #7ec5ff;background:#7ec5ff;color:#001628;font-weight:600;cursor:pointer;";
    btn.addEventListener("click", () => {
      void sendMsg({ kind: "openPermissionTab", origin, label });
    });
    errorMessageEl.appendChild(btn);
    show("error");
  }

  // Listen for grant broadcast from permission.html. On match, auto-retry.
  chrome.runtime.onMessage.addListener((msg) => {
    if (
      msg?.kind === "permissionGranted" &&
      typeof msg.origin === "string" &&
      pendingPermissionOrigin &&
      msg.origin === pendingPermissionOrigin
    ) {
      pendingPermissionOrigin = null;
      void runCapture();
    }
  });

  function renderCaptured(cap: any): void {
    captureUrlEl.textContent = cap.url;
    captureTitleEl.textContent = cap.title || "(no title)";
    const label = cap.detection?.label === "job_posting"
      ? "detected job posting (" + pct(cap.detection.confidence) + ")"
      : cap.detection?.label === "likely_job_posting"
        ? "likely job posting (" + pct(cap.detection.confidence) + ")"
        : "not a job posting (heuristic)";
    captureDetectionEl.textContent = label;
    if (cap.detection?.label === "not_job_posting") { show("notDetected"); return; }
    show("captured");
  }

  async function onEvaluateClick(): Promise<void> {
    if (!capturedData) return;
    evaluateBtn.disabled = true;

    // Liveness pre-check — skip silently on network error
    evaluateBtn.textContent = "Checking liveness…";
    const livenessRes = await sendMsg({ kind: "checkLiveness", url: capturedData.url });
    if (livenessRes?.ok && livenessRes.result?.status === "expired") {
      evaluateBtn.disabled = false;
      evaluateBtn.textContent = "Evaluate this job";
      captureDetectionEl.textContent = "⚠ This posting appears to be expired.";
      captureDetectionEl.style.color = "#ef5f5f";
      const proceed = confirm(
        "This posting appears to be expired.\n\n" +
        "Reason: " + (livenessRes.result?.reason ?? "unknown") + "\n\n" +
        "Evaluate anyway?"
      );
      if (!proceed) return;
    }

    evaluateBtn.textContent = "Starting evaluation…";
    const res = await sendMsg({
      kind: "startEvaluation",
      input: {
        url: capturedData.url,
        title: capturedData.title,
        pageText: capturedData.pageText,
        detection: capturedData.detection,
      },
    });
    evaluateBtn.disabled = false;
    evaluateBtn.textContent = "Evaluate this job";
    if (!res?.ok) { renderError(res?.error?.code ?? "INTERNAL", res?.error?.message ?? "failed"); return; }
    currentJobId = res.result.jobId;
    jobIdEl.textContent = "job " + currentJobId;
    renderPhases(res.result.initialSnapshot);
    show("running");
    subscribeToJob(currentJobId!);
    startJobPolling(currentJobId!);
  }

  function subscribeToJob(jobId: string): void {
    activePort?.disconnect();
    const port = chrome.runtime.connect({ name: "career-ops.job" });
    activePort = port;
    port.postMessage({ jobId });
    port.onMessage.addListener((raw: any) => {
      if (raw?.channel !== "job") return;
      handleJobEvent(raw.event);
    });
  }

  function handleJobEvent(event: any): void {
    if (event.kind === "snapshot") { applyJobSnapshot(event.snapshot); return; }
    if (event.kind === "phase") { appendPhase(event.phase); return; }
    if (event.kind === "done") { stopJobPolling(); currentResult = event.result; renderDone(event.result); return; }
    if (event.kind === "failed") { stopJobPolling(); renderError(event.error.code, event.error.message); return; }
  }

  function applyJobSnapshot(snap: any): void {
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

  async function pollJobSnapshot(jobId: string): Promise<void> {
    if (currentJobId !== jobId) {
      stopJobPolling();
      return;
    }
    const res = await sendMsg({ kind: "getJob", jobId });
    if (!res?.ok) return;
    applyJobSnapshot(res.result);
  }

  function renderPhases(snap: any): void {
    while (phaseListEl.firstChild) phaseListEl.removeChild(phaseListEl.firstChild);
    const done = new Set((snap.progress?.phases ?? []).map((p: any) => p.phase));
    for (const phase of PHASE_ORDER) {
      const li = document.createElement("li");
      li.textContent = PHASE_LABEL[phase] ?? phase;
      if (phase === snap.phase) li.className = "active";
      else if (done.has(phase)) li.className = "completed";
      phaseListEl.appendChild(li);
    }
  }

  function appendPhase(phase: string): void {
    const items = Array.from(phaseListEl.children) as HTMLLIElement[];
    const idx = PHASE_ORDER.indexOf(phase as JobPhase);
    if (idx < 0) return;
    for (let i = 0; i < PHASE_ORDER.length; i++) {
      const li = items[i];
      if (!li) continue;
      if (i === idx) li.className = "active";
      else if (i < idx) li.className = "completed";
    }
  }

  function renderDone(result: any): void {
    stopJobPolling();
    while (resultHeaderEl.firstChild) resultHeaderEl.removeChild(resultHeaderEl.firstChild);
    const b = document.createElement("strong");
    b.textContent = result.company;
    resultHeaderEl.appendChild(b);
    resultHeaderEl.appendChild(document.createTextNode(" — " + result.role));
    resultHeaderEl.appendChild(document.createElement("br"));
    const s = document.createElement("span");
    s.className = "score";
    s.textContent = result.score.toFixed(1) + "/5";
    s.style.color = scoreColor(result.score);
    resultHeaderEl.appendChild(s);
    resultHeaderEl.appendChild(document.createTextNode(" · " + result.archetype));
    resultTldrEl.textContent = result.tldr;
    show("done");
  }

  function renderError(code: string, message: string): void {
    stopJobPolling();
    errorCodeEl.textContent = code;
    errorMessageEl.textContent = message;
    show("error");
  }

  async function loadRecentJobs(): Promise<void> {
    try {
      const res = await sendMsg({ kind: "getRecentJobs", limit: 8 });
      if (!res?.ok || !res.result?.rows?.length) return;
      while (recentListEl.firstChild) recentListEl.removeChild(recentListEl.firstChild);
      for (const row of res.result.rows) {
        const item = document.createElement("div");
        item.className = "recent-item";
        const left = document.createElement("span");
        const c = document.createElement("span"); c.className = "company"; c.textContent = row.company;
        const r = document.createElement("span"); r.className = "role"; r.textContent = row.role;
        left.appendChild(c); left.appendChild(r);
        const sc = document.createElement("span"); sc.className = "score"; sc.textContent = row.score;
        const numSc = parseFloat(row.score); if (!isNaN(numSc)) sc.style.color = scoreColor(numSc);
        item.appendChild(left); item.appendChild(sc);
        item.addEventListener("click", () => {
          void sendMsg({ kind: "readReport", reportNum: row.num }).then((res: any) => {
            if (res?.ok) void sendMsg({ kind: "openPath", absolutePath: res.result.path });
          });
        });
        recentListEl.appendChild(item);
      }
    } catch { /* silent */ }
  }

  // --- Newgrad scan logic ---
  let storedPromotedRows: any[] = [];

  async function onScanClick(): Promise<void> {
    ngScanBtn.disabled = true;
    ngScanBtn.textContent = "Scanning...";
    ngResultsEl.classList.add("hidden");
    ngEnrichResultsEl.classList.add("hidden");
    ngEnrichProgressEl.classList.add("hidden");

    // Step 1: Extract listing rows from the page
    const extractRes = await sendMsg({ kind: "newgradExtractList" });
    if (!extractRes?.ok) {
      renderError(extractRes?.error?.code ?? "INTERNAL", extractRes?.error?.message ?? "extract failed");
      ngScanBtn.disabled = false;
      ngScanBtn.textContent = "Scan & Score";
      return;
    }
    const rows = extractRes.result.rows;
    ngStatusEl.textContent = "Found " + rows.length + " Software Engineering listings from the last 24h";

    // Step 2: Score the rows
    const scoreRes = await sendMsg({ kind: "newgradScore", rows });
    if (!scoreRes?.ok) {
      renderError(scoreRes?.error?.code ?? "INTERNAL", scoreRes?.error?.message ?? "scoring failed");
      ngScanBtn.disabled = false;
      ngScanBtn.textContent = "Scan & Score";
      return;
    }

    const promoted = scoreRes.result.promoted ?? [];
    const filtered = (scoreRes.result.filtered ?? []).filter(
      (r: any) => r.reason !== "already_tracked",
    );
    const deduped = (scoreRes.result.filtered ?? []).filter(
      (r: any) => r.reason === "already_tracked",
    );

    ngPromotedEl.textContent = "\u2713 " + promoted.length + " passed filter (score \u2265 threshold)";
    ngFilteredEl.textContent = "\u2717 " + filtered.length + " filtered out";
    ngDedupedEl.textContent = "\u2717 " + deduped.length + " already in tracker";
    ngResultsEl.classList.remove("hidden");

    storedPromotedRows = promoted;

    if (promoted.length === 0) {
      ngEnrichBtn.classList.add("hidden");
    } else {
      ngEnrichBtn.classList.remove("hidden");
    }

    ngScanBtn.disabled = false;
    ngScanBtn.textContent = "Scan & Score";
  }

  // Listen for scoped enrich progress broadcasts from background
  let activeEnrichSessionId: string | null = null;
  chrome.runtime.onMessage.addListener((msg: { kind?: string; sessionId?: string; current?: number; total?: number; row?: { company?: string; title?: string } }) => {
    if (msg?.kind === "enrichProgress"
      && msg.sessionId === activeEnrichSessionId
      && typeof msg.current === "number"
      && typeof msg.total === "number") {
      ngEnrichProgressEl.textContent = "Enriching (" + msg.current + "/" + msg.total + "): " +
        (msg.row?.company ?? "") + " — " + (msg.row?.title ?? "");
    }
  });

  async function onEnrichClick(): Promise<void> {
    ngEnrichBtn.disabled = true;
    ngEnrichBtn.textContent = "Enriching...";
    ngEnrichProgressEl.textContent = "Processing rows (0/" + storedPromotedRows.length + ")...";
    ngEnrichProgressEl.classList.remove("hidden");
    ngEnrichResultsEl.classList.add("hidden");

    // Generate a unique session ID for this enrich run
    activeEnrichSessionId = "enrich-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);

    // Step 1: Enrich detail pages
    const detailRes = await sendMsg({
      kind: "newgradEnrichDetails",
      promotedRows: storedPromotedRows,
      config: { concurrent: 3, delayMinMs: 2000, delayMaxMs: 5000 },
    });
    if (!detailRes?.ok) {
      renderError(detailRes?.error?.code ?? "INTERNAL", detailRes?.error?.message ?? "enrich details failed");
      ngEnrichBtn.disabled = false;
      ngEnrichBtn.textContent = "Enrich detail pages";
      ngEnrichProgressEl.classList.add("hidden");
      activeEnrichSessionId = null;
      return;
    }

    // Step 2: Write enriched rows to pipeline (with scoped session ID)
    const enrichRes = await sendMsg({ kind: "newgradEnrich", rows: detailRes.result.enrichedRows, sessionId: activeEnrichSessionId });
    activeEnrichSessionId = null;
    if (!enrichRes?.ok) {
      renderError(enrichRes?.error?.code ?? "INTERNAL", enrichRes?.error?.message ?? "enrich failed");
      ngEnrichBtn.disabled = false;
      ngEnrichBtn.textContent = "Enrich detail pages";
      ngEnrichProgressEl.classList.add("hidden");
      return;
    }

    const added = enrichRes.result.added ?? 0;
    const skipped = enrichRes.result.skipped ?? 0;
    ngAddedEl.textContent = "\u2713 " + added + " added to pipeline.md";
    ngSkippedEl.textContent = "\u2717 " + skipped + " skipped (below threshold or duplicate)";
    ngEnrichResultsEl.classList.remove("hidden");
    ngEnrichProgressEl.classList.add("hidden");
    ngEnrichBtn.classList.add("hidden");
  }

  async function onCopySummaryClick(): Promise<void> {
    if (!currentResult) return;
    const text = currentResult.company + " — " + currentResult.role +
      "\nScore: " + currentResult.score.toFixed(1) + "/5 · " + currentResult.archetype +
      "\n" + currentResult.tldr;
    try {
      await navigator.clipboard.writeText(text);
      copySummaryBtn.textContent = "Copied";
    } catch {
      copySummaryBtn.textContent = "Copy failed";
    }
    setTimeout(() => { copySummaryBtn.textContent = "Copy summary"; }, 1500);
  }

  // Wire events
  ngScanBtn.addEventListener("click", () => void onScanClick());
  ngEnrichBtn.addEventListener("click", () => void onEnrichClick());
  evaluateBtn.addEventListener("click", () => void onEvaluateClick());
  evaluateAnywayBtn.addEventListener("click", () => {
    if (capturedData) { show("captured"); void onEvaluateClick(); }
  });
  copySummaryBtn.addEventListener("click", () => void onCopySummaryClick());
  openReportBtn.addEventListener("click", () => {
    if (currentResult) void sendMsg({ kind: "openPath", absolutePath: currentResult.reportPath });
  });
  retryBtn.addEventListener("click", () => { currentJobId = null; currentResult = null; void runCapture(); });
  setupSaveBtn.addEventListener("click", async () => {
    const token = setupTokenInput.value.trim();
    setupSaveBtn.disabled = true;
    const res = await sendMsg({ kind: "setToken", token });
    setupSaveBtn.disabled = false;
    if (!res?.ok) { renderError(res?.error?.code ?? "BAD_REQUEST", res?.error?.message ?? "failed"); return; }
    setupTokenInput.value = "";
    void refreshHealth();
    await runCapture();
  });
  modeSelect.addEventListener("change", () => { void onModeChange(); });
  modeCopyBtn.addEventListener("click", () => { void onCopyModeCommand(); });
  mergeTrackerBtn.addEventListener("click", async () => {
    mergeTrackerBtn.disabled = true;
    mergeTrackerBtn.textContent = "Merging…";
    const res = await sendMsg({ kind: "mergeTracker", dryRun: false });
    mergeTrackerBtn.disabled = false;
    mergeTrackerBtn.textContent = res?.ok ? "✓ Merged (" + res.result.added + " added)" : "Merge failed";
    if (res?.ok) void loadRecentJobs();
  });

  // Init
  void (async () => {
    const preferenceRes = await sendMsg({ kind: "getModePreference" });
    if (preferenceRes?.ok) {
      preferredPreset = preferenceRes.result.preset;
    }
    renderModePanel();

    const tokenRes = await sendMsg({ kind: "hasToken" });
    if (!tokenRes?.ok || !tokenRes.result?.present) {
      show("setup");
      setupTokenInput.focus();
      return;
    }
    void refreshHealth();
    await runCapture();

    // Detect newgrad-jobs.com and show scan UI instead of single-JD flow
    try {
      const capturedUrl = (capturedData as { url?: string } | null)?.url;
      if (capturedUrl) {
        const currentHost = new URL(capturedUrl).hostname;
        if (currentHost.includes("newgrad-jobs.com")) {
          show("newgradScan");
          void loadRecentJobs();
          return;
        }
      }
    } catch { /* invalid URL, proceed normally */ }

    void loadRecentJobs();
  })();
}

/* -------------------------------------------------------------------------- */
/*  Bootstrap                                                                  */
/* -------------------------------------------------------------------------- */

function togglePanel(): void {
  const { root, shadow, existed } = getOrCreatePanel();

  if (existed) {
    // Toggle visibility
    root.style.display = root.style.display === "none" ? "block" : "none";
    return;
  }

  // First creation — build the UI
  const style = document.createElement("style");
  style.textContent = buildStyles();
  shadow.appendChild(style);

  const wrapper = document.createElement("div");
  wrapper.insertAdjacentHTML("afterbegin", buildHTML());
  shadow.appendChild(wrapper);

  initPanel(shadow, root);
}

// Listen for toggle messages from the background worker
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.kind === "togglePanel") {
    togglePanel();
  }
});
