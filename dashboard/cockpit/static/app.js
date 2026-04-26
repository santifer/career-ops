const state = {
  overview: null,
  applications: [],
  profile: null,
  missingFields: [],
  selectedId: null,
  selectedDetail: null,
  activeRun: null,
  pollTimer: null,
  autoWindow: null,
  pairing: null,
};

const authConfig = {
  tokenKey: "careerOpsSessionToken",
};

const statusFallback = [
  "Evaluated",
  "Applied",
  "Responded",
  "Interview",
  "Offer",
  "Rejected",
  "Discarded",
  "SKIP",
];

const $ = (selector) => document.querySelector(selector);

function isAuthenticated() {
  return Boolean(sessionStorage.getItem(authConfig.tokenKey));
}

function authToken() {
  return sessionStorage.getItem(authConfig.tokenKey) || "";
}

function renderAuthState() {
  const authenticated = isAuthenticated();
  const shell = $(".mission-shell");
  const auth = $("#auth-screen");
  if (shell) shell.hidden = !authenticated;
  if (auth) auth.hidden = authenticated;
}

async function handleLogin(event) {
  event.preventDefault();
  const email = ($("#auth-email")?.value || "").trim().toLowerCase();
  const password = $("#auth-password")?.value || "";
  const error = $("#auth-error");

  try {
    const session = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });
    sessionStorage.setItem(authConfig.tokenKey, session.token);
    if (error) error.hidden = true;
    renderAuthState();
    await bootDashboard();
    return;
  } catch (err) {
    sessionStorage.removeItem(authConfig.tokenKey);
    if (error) {
      error.textContent = err.message || "Invalid credentials.";
      error.hidden = false;
    }
  }
}

function logout() {
  sessionStorage.removeItem(authConfig.tokenKey);
  state.overview = null;
  state.applications = [];
  state.profile = null;
  state.selectedId = null;
  state.selectedDetail = null;
  state.activeRun = null;
  if (state.pollTimer) window.clearInterval(state.pollTimer);
  state.pollTimer = null;
  renderAuthState();
}

function setText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = value;
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

function actionLabel(action) {
  return {
    verify: "Verify",
    scan: "Scan",
    pdf: "Prepare PDF",
  }[action] || action || "Action";
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = authToken();
  if (token && !options.skipAuth && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  const { skipAuth, headers: ignoredHeaders, ...fetchOptions } = options;
  const response = await fetch(path, {
    ...fetchOptions,
    headers,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload?.error?.message || `HTTP ${response.status}`;
    if (response.status === 401 && !options.skipAuth) {
      sessionStorage.removeItem(authConfig.tokenKey);
      renderAuthState();
    }
    throw new Error(message);
  }
  return payload;
}

function formatNumber(value, digits = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : "--";
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function option(value, label = value) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = label;
  return node;
}

function uniqueStatuses() {
  const observed = state.applications.map((app) => app.status).filter(Boolean);
  return Array.from(new Set([...observed, ...statusFallback]));
}

function loadStatusControls() {
  const filter = $("#status-filter");
  const editor = $("#status-select");
  const statuses = uniqueStatuses();

  if (filter) {
    const current = filter.value;
    filter.replaceChildren(option("", "All statuses"), ...statuses.map((status) => option(status)));
    filter.value = statuses.includes(current) ? current : "";
  }

  if (editor) {
    const current = editor.value;
    editor.replaceChildren(...statuses.map((status) => option(status)));
    if (current && statuses.includes(current)) editor.value = current;
  }
}

async function loadHealth() {
  const dot = $("#health-dot");
  try {
    const health = await api("/api/health");
    dot?.classList.remove("fail");
    dot?.classList.add("ok");
    setText("#health-status", `Status: ${health.status}`);
    setText("#health-root", `Root: ${health.root}`);
  } catch (error) {
    dot?.classList.remove("ok");
    dot?.classList.add("fail");
    setText("#health-status", `Health check failed: ${error.message}`);
    setText("#health-root", "Service unavailable.");
  }
}

async function initialLoad() {
  try {
    const [overview, applications, profileResponse] = await Promise.all([
      api("/api/overview"),
      api("/api/applications"),
      api("/api/profile"),
    ]);
    state.overview = overview;
    state.applications = Array.isArray(applications) ? applications : [];
    state.profile = profileResponse?.profile || {};
    state.missingFields = profileResponse?.missing_fields || [];
    renderOverview();
    loadStatusControls();
    renderApplications();
    renderProfile();
    renderMissingFields();
    renderAutoMissingFields();
  } catch (error) {
    showToast(`Initial load failed: ${error.message}`);
    const body = $("#applications-body");
    if (body) body.innerHTML = `<tr><td colspan="6" class="empty-cell">Initial load failed. ${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderOverview() {
  const summary = state.overview?.summary || {};
  setText("#metric-total", summary.total ?? "--");
  setText("#metric-actionable", summary.actionable ?? "--");
  setText("#metric-average", formatNumber(summary.avg_score));
  setText("#metric-top", `Top score: ${formatNumber(summary.top_score)}`);
  setText("#metric-pdf", summary.with_pdf == null ? "--" : `${summary.with_pdf}/${summary.total ?? "--"}`);
  setText("#metric-generated", state.overview?.generated_at ? `Updated ${formatDate(state.overview.generated_at)}` : "Waiting for overview.");
  renderStatusStrip(summary.by_status || {});
}

function renderStatusStrip(byStatus) {
  const strip = $("#status-strip");
  if (!strip) return;
  const entries = Object.entries(byStatus);
  if (!entries.length) {
    strip.replaceChildren();
    return;
  }
  strip.replaceChildren(...entries.map(([status, count]) => {
    const chip = document.createElement("span");
    chip.className = "status-chip";
    chip.textContent = `${status}: ${count}`;
    return chip;
  }));
}

function filteredApplications() {
  const query = ($("#search-input")?.value || "").trim().toLowerCase();
  const status = $("#status-filter")?.value || "";
  return state.applications.filter((app) => {
    const matchesStatus = !status || app.status === status;
    const haystack = [app.company, app.role, app.notes, app.archetype, app.tl_dr, app.remote]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return matchesStatus && (!query || haystack.includes(query));
  });
}

function renderApplications() {
  const body = $("#applications-body");
  if (!body) return;
  const rows = filteredApplications();
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty-cell">No applications match the current filters.</td></tr>`;
    return;
  }

  body.replaceChildren(...rows.map((app) => {
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
    tr.dataset.id = app.number;
    if (state.selectedId === app.number) tr.classList.add("selected");
    tr.addEventListener("click", () => selectApplication(app.number));
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectApplication(app.number);
      }
    });

    tr.append(
      cell(`#${app.number}`),
      richCell(app.company || "Unknown", app.notes || app.tl_dr || "No notes captured."),
      richCell(app.role || "Untitled role", [app.remote, app.comp_estimate].filter(Boolean).join(" / ") || app.archetype || "No role metadata."),
      badgeCell(app.score_raw || formatNumber(app.score)),
      cell(app.status || "--"),
      pdfCell(app.has_pdf),
    );
    return tr;
  }));
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text;
  return td;
}

function richCell(title, note) {
  const td = document.createElement("td");
  const strong = document.createElement("div");
  strong.className = "row-company";
  strong.textContent = title;
  const small = document.createElement("div");
  small.className = "row-note";
  small.textContent = note;
  td.append(strong, small);
  return td;
}

function badgeCell(text) {
  const td = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = "score-badge";
  badge.textContent = text || "--";
  td.append(badge);
  return td;
}

function pdfCell(hasPDF) {
  const td = document.createElement("td");
  const flag = document.createElement("span");
  flag.className = `pdf-flag ${hasPDF ? "yes" : "no"}`;
  flag.textContent = hasPDF ? "Ready" : "Missing";
  td.append(flag);
  return td;
}

async function selectApplication(id) {
  state.selectedId = id;
  renderApplications();
  setText("#selected-title", `Loading #${id}...`);
  try {
    const detail = await api(`/api/applications/${id}`);
    state.selectedDetail = detail;
    renderSelectedApplication();
  } catch (error) {
    showToast(`Application detail failed: ${error.message}`);
  }
}

function renderSelectedApplication() {
  const app = state.selectedDetail?.application || state.applications.find((item) => item.number === state.selectedId);
  if (!app) return;
  setText("#selected-title", `${app.company || "Unknown"} #${app.number}`);
  setText("#selected-summary", app.tl_dr || app.notes || app.role || "Application detail loaded.");

  const list = $("#selected-details");
  if (list) {
    list.replaceChildren(
      detailTerm("Role", app.role),
      detailValue(app.role),
      detailTerm("Status", app.status),
      detailValue(app.status),
      detailTerm("Score", app.score_raw || formatNumber(app.score)),
      detailValue(app.score_raw || formatNumber(app.score)),
      detailTerm("Remote", app.remote || "--"),
      detailValue(app.remote || "--"),
      detailTerm("Comp", app.comp_estimate || "--"),
      detailValue(app.comp_estimate || "--"),
    );
  }

  const links = $("#selected-links");
  if (links) {
    const linkNodes = [];
    if (app.job_url) linkNodes.push(anchor(app.job_url, "Job URL"));
    if (app.report_path) linkNodes.push(anchor(internalAssetURL(app.report_path), "Report"));
    links.replaceChildren(...linkNodes);
  }

  const statusSelect = $("#status-select");
  if (statusSelect) {
    statusSelect.disabled = false;
    statusSelect.value = app.status || statusSelect.value;
  }
  const save = $("#status-save");
  if (save) save.disabled = false;
  const autoSelected = $("#auto-selected");
  if (autoSelected) autoSelected.disabled = false;
}

function detailTerm(label) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  return dt;
}

function detailValue(value) {
  const dd = document.createElement("dd");
  dd.textContent = value || "--";
  return dd;
}

function anchor(href, label) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noreferrer";
  a.textContent = label;
  return a;
}

async function saveStatus() {
  if (!state.selectedId) return;
  const status = $("#status-select")?.value;
  if (!status) return;
  try {
    const updated = await api(`/api/applications/${state.selectedId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
    const app = updated?.application || updated;
    state.applications = state.applications.map((item) => item.number === app.number ? app : item);
    state.selectedDetail = app.application ? updated : { application: app };
    renderApplications();
    renderSelectedApplication();
    showToast("Status change sent and accepted.");
  } catch (error) {
    showToast(`Status update failed: ${error.message}`);
  }
}

function renderProfile() {
  if (!state.profile) return;
  fillField("identity.full_name", state.profile.identity?.full_name);
  fillField("identity.email", state.profile.identity?.email);
  fillField("identity.phone.country_code", state.profile.identity?.phone?.country_code);
  fillField("identity.phone.number", state.profile.identity?.phone?.number);
  fillField("identity.linkedin", state.profile.identity?.linkedin);
  fillField("documents.portfolio_url", state.profile.documents?.portfolio_url);
  fillField("documents.default_cv", state.profile.documents?.default_cv);
  fillField("form_answers.salary_expectation", state.profile.form_answers?.salary_expectation);
}

function fillField(name, value) {
  const node = document.querySelector(`[name="${name}"]`);
  if (node) node.value = value || "";
}

function readField(name) {
  return document.querySelector(`[name="${name}"]`)?.value || "";
}

async function saveProfile() {
  const profile = structuredClone(state.profile || {});
  profile.identity ||= {};
  profile.identity.phone ||= {};
  profile.documents ||= {};
  profile.form_answers ||= {};
  profile.identity.full_name = readField("identity.full_name");
  profile.identity.email = readField("identity.email");
  profile.identity.phone.country_code = readField("identity.phone.country_code");
  profile.identity.phone.number = readField("identity.phone.number");
  profile.identity.linkedin = readField("identity.linkedin");
  profile.documents.portfolio_url = readField("documents.portfolio_url");
  profile.documents.default_cv = readField("documents.default_cv");
  profile.form_answers.salary_expectation = readField("form_answers.salary_expectation");

  try {
    const response = await api("/api/profile", { method: "POST", body: JSON.stringify(profile) });
    state.profile = response?.profile || profile;
    state.missingFields = response?.missing_fields || [];
    renderProfile();
    renderMissingFields();
    renderAutoMissingFields();
    showToast("Profile summary saved.");
  } catch (error) {
    showToast(`Profile save failed: ${error.message}`);
  }
}

function renderMissingFields() {
  const list = $("#missing-fields");
  if (!list) return;
  list.replaceChildren(...missingFieldNodes(state.missingFields));
}

function renderAutoMissingFields() {
  const list = $("#auto-missing");
  if (!list) return;
  list.replaceChildren(...missingFieldNodes(state.missingFields));
}

function missingFieldNodes(fields) {
  if (!fields?.length) {
    const li = document.createElement("li");
    li.textContent = "No required profile gaps reported by the API.";
    return [li];
  }
  return fields.map((field) => {
    const li = document.createElement("li");
    const markers = [field.required ? "required" : "", field.sensitive ? "sensitive" : "", field.review_required ? "review" : ""].filter(Boolean).join(" / ");
    li.textContent = `${field.label || field.path}: ${field.reason || "needs review"}${markers ? ` (${markers})` : ""}`;
    return li;
  });
}

async function startAction(action) {
  const endpoints = {
    verify: "/api/actions/verify",
    scan: "/api/actions/scan",
    pdf: "/api/actions/pdf",
  };
  const options = { method: "POST" };
  if (action === "pdf") {
    const app = state.selectedDetail?.application || state.applications.find((item) => item.number === state.selectedId);
    if (!app?.number) {
      showToast("Select an application before preparing a PDF.");
      location.hash = "#applications";
      return;
    }
    options.body = JSON.stringify({ application_id: app.number });
  }
  try {
    const run = await api(endpoints[action], options);
    setActiveRun(run);
    const label = actionLabel(action);
    if (run?.state === "Needs Input") {
      showToast(`${label} needs input: ${run.review_gate?.needs_input_reason || run.current_step || "review the run details."}`);
    } else if (action === "pdf") {
      showToast("PDF context is ready for review.");
    } else {
      showToast(`${label} run started.`);
    }
  } catch (error) {
    showToast(`${actionLabel(action)} failed to start: ${error.message}`);
  }
}

async function startAutoMode(useSelected = true) {
  const url = ($("#auto-url")?.value || "").trim();
  const body = {};
  if (useSelected && state.selectedId) body.application_id = state.selectedId;
  if (url) body.url = url;

  if (!body.application_id && !body.url) {
    showToast("Auto Mode needs a selected application or a direct URL.");
    $("#auto-url")?.focus();
    return;
  }

  if (body.application_id && !url && !selectedApplicationURL()) {
    showToast("This selected application has no job URL. Paste the application link before starting Auto Mode.");
    $("#auto-url")?.focus();
    return;
  }

  try {
    const run = await api("/api/actions/auto-mode/start", { method: "POST", body: JSON.stringify(body) });
    const visibleRun = run;
    setActiveRun(visibleRun);
    renderReviewGate(visibleRun);
    const targetURL = normalizeExternalURL(run?.browser_session?.target_url || run?.url);
    if (targetURL) {
      showToast("Auto Mode run started. Start the paired local worker to open and drive the visible browser.");
    } else {
      showToast("Auto Mode started, but no job URL was resolved. Paste the application link and start again.");
    }
  } catch (error) {
    showToast(`Auto Mode failed to start: ${error.message}`);
  }
}

async function openBrowserFromBackend(run) {
  if (!run?.id) return run;
  if (!isLocalCockpit()) {
    showToast("Hosted mode cannot open a browser from the server. Use the Open window button or the target link in this browser.");
    return run;
  }
  try {
    const opened = await api(`/api/runs/${run.id}/open-browser`, { method: "POST" });
    showToast("Browser popup was blocked, so Career Ops opened the target with the local system browser.");
    return opened;
  } catch (error) {
    showToast(`Browser popup was blocked and system browser fallback failed: ${error.message}`);
    return run;
  }
}

function selectedApplicationURL() {
  const app = state.selectedDetail?.application || state.applications.find((item) => item.number === state.selectedId);
  return app?.job_url || "";
}

function reserveVisibleAutoWindow(url) {
  const targetURL = normalizeExternalURL(url);
  try {
    const opened = window.open(targetURL || "about:blank", "_blank");
    if (!opened) return null;
    if (!targetURL) {
      opened.document.title = "Career Ops Auto Mode";
      opened.document.body.innerHTML = `
        <main style="font-family: system-ui, sans-serif; max-width: 720px; margin: 48px auto; line-height: 1.5;">
          <h1>Career Ops Auto Mode</h1>
          <p>This visible browser window is reserved for the application workflow.</p>
          <p>The paired local worker will navigate the visible browser and report observable actions back to the cockpit.</p>
          <p><strong>Safety gate:</strong> final submit stays blocked until explicit user approval.</p>
        </main>`;
    }
    return opened;
  } catch {
    return null;
  }
}

function attachVisibleAutoWindow(run, pendingWindow = null) {
  const targetURL = normalizeExternalURL(run?.browser_session?.target_url || run?.url);
  if (pendingWindow && !pendingWindow.closed) {
    state.autoWindow = pendingWindow;
    if (targetURL) {
      pendingWindow.location.href = targetURL;
    }
    return;
  }
  if (targetURL) {
    state.autoWindow = reserveVisibleAutoWindow(targetURL);
  }
}

function normalizeExternalURL(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function internalAssetURL(path) {
  const value = String(path || "").trim().replace(/^\/+/, "");
  if (!value) return "#";
  return `/${value.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

function isLocalCockpit() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function setActiveRun(run) {
  state.activeRun = run;
  renderRun(run);
  if (state.pollTimer) window.clearInterval(state.pollTimer);
  state.pollTimer = window.setInterval(pollRun, 2200);
}

async function pollRun() {
  if (!state.activeRun?.id) return;
  try {
    const run = await api(`/api/runs/${state.activeRun.id}`);
    state.activeRun = run;
    renderRun(run);
    renderReviewGate(run);
    if (["Ready for Review", "Needs Input", "Failed", "Cancelled", "Submitted"].includes(run.state)) {
      window.clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  } catch (error) {
    showToast(`Run polling failed: ${error.message}`);
    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function renderRun(run) {
  if (!run) return;
  setText("#run-title", `${run.action || "Run"} / ${run.id}`);
  setText("#run-state", `${run.state || "Unknown"}${run.current_step ? ` at ${run.current_step}` : ""}`);
  const cancel = $("#cancel-run");
  if (cancel) cancel.disabled = !["Queued", "Running"].includes(run.state);
  const autoState = $("#auto-state");
  if (autoState && run.action === "auto-mode") autoState.textContent = run.state || "Running";
  renderBrowserSession(run);
  renderWorkerPanel(run);
  renderActionLog(run);

  const timeline = $("#run-timeline");
  if (timeline) {
    const events = run.timeline?.length ? run.timeline : run.steps?.map((step) => ({ step: step.name, message: step.state, at: run.started_at })) || [];
    timeline.replaceChildren(...events.map((event) => {
      const item = document.createElement("div");
      item.className = "timeline-item";
      const dot = document.createElement("span");
      dot.className = "timeline-dot";
      const text = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = event.step || run.action || "Run event";
      const detail = document.createElement("small");
      detail.textContent = `${event.message || "state update"} / ${formatDate(event.at)}`;
      text.append(title, detail);
      item.append(dot, text);
      return item;
    }));
  }

  const log = $("#run-log");
  if (log) {
    const content = [run.error_message, run.stdout_tail, run.stderr_tail].filter(Boolean).join("\n\n");
    log.hidden = !content;
    log.textContent = content;
  }
}

function workerStatus(run) {
  if (!run || run.action !== "auto-mode") {
    return { label: "Offline", text: "No Auto Mode run is active.", stale: true };
  }
  const claim = run.worker_claim;
  if (!claim) {
    return { label: "Waiting", text: "Waiting for a paired local worker to claim this run.", stale: true };
  }
  const expiry = Date.parse(claim.lease_expires_at || "");
  const heartbeat = claim.heartbeat_at ? formatDate(claim.heartbeat_at) : "no heartbeat yet";
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    return { label: "Stale", text: `${claim.worker_id || "Worker"} lease expired. Last heartbeat: ${heartbeat}.`, stale: true };
  }
  return { label: "Online", text: `${claim.worker_id || "Worker"} owns this run. Last heartbeat: ${heartbeat}.`, stale: false };
}

function renderWorkerPanel(run = state.activeRun) {
  const stateNode = $("#worker-state");
  const statusNode = $("#worker-status");
  if (!stateNode || !statusNode) return;
  const status = workerStatus(run);
  stateNode.textContent = status.label;
  stateNode.dataset.state = status.label.toLowerCase();
  statusNode.textContent = status.text;
  renderPairingOutput();
}

async function generatePairingToken() {
  const workerID = ($("#worker-id")?.value || "").trim() || "local-worker";
  try {
    const pairing = await api("/api/worker/pairing-token", {
      method: "POST",
      body: JSON.stringify({ worker_id: workerID }),
    });
    state.pairing = pairing;
    renderPairingOutput();
    showToast("Pairing token generated. Use it once from this machine to register the local worker.");
  } catch (error) {
    showToast(`Worker pairing token failed: ${error.message}`);
  }
}

function renderPairingOutput() {
  const box = $("#pairing-output");
  if (!box) return;
  const pairing = state.pairing;
  const token = pairingTokenValue(pairing);
  box.hidden = !token;
  if (!token) return;
  setText("#pairing-token", token);
  setText("#pairing-expiry", `Expires ${formatDate(pairingExpiresAt(pairing))}. Single use; do not paste it into frontend code.`);
  setText("#worker-register-command", workerRegisterCommand(pairing));
  setText("#worker-run-command", workerRunCommand(pairingWorkerID(pairing)));
}

function pairingTokenValue(pairing) {
  return pairing?.token || pairing?.Token || "";
}

function pairingWorkerID(pairing) {
  return pairing?.worker_id || pairing?.WorkerID || "local-worker";
}

function pairingExpiresAt(pairing) {
  return pairing?.expires_at || pairing?.ExpiresAt || "";
}

function apiBaseURL() {
  return `${window.location.protocol}//${window.location.host}`;
}

function psEscape(value) {
  return String(value || "").replaceAll("'", "''");
}

function workerRegisterCommand(pairing) {
  const apiBase = psEscape(apiBaseURL());
  const workerID = psEscape(pairingWorkerID(pairing));
  const token = psEscape(pairingTokenValue(pairing));
  return [
    `$body = @{ worker_id = '${workerID}'; pairing_token = '${token}' } | ConvertTo-Json -Compress`,
    `$credential = (Invoke-RestMethod -Uri '${apiBase}/api/worker/register' -Method Post -ContentType 'application/json' -Body $body).credential`,
    `$env:CAREER_OPS_WORKER_CREDENTIAL = $credential`,
  ].join("\n");
}

function workerRunCommand(workerID) {
  const apiBase = psEscape(apiBaseURL());
  const worker = psEscape(workerID || "local-worker");
  return `node workers/browser-worker.mjs --api-base '${apiBase}' --worker-id '${worker}' --credential $env:CAREER_OPS_WORKER_CREDENTIAL`;
}

async function copyTextFrom(selector, label) {
  const text = $(selector)?.textContent || "";
  if (!text.trim()) {
    showToast(`${label} is not ready yet.`);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${label} copied.`);
  } catch {
    showToast(`Copy failed. Select the command manually.`);
  }
}

function renderBrowserSession(run) {
  const session = run?.browser_session;
  const status = $("#browser-session-status");
  const target = $("#browser-target");
  const safety = $("#browser-safety");
  const open = $("#browser-open");
  if (!status || !target || !open) return;

  if (!run || run.action !== "auto-mode" || !session) {
    status.textContent = "No browser session started.";
    target.hidden = true;
    open.disabled = true;
    if (safety) safety.textContent = "Every browser action is logged here; final submit stays gated.";
    return;
  }

  const targetURL = normalizeExternalURL(session.target_url || run.url);
  status.textContent = `${session.status || "active"} - ${session.last_action || "Waiting for browser activity."}`;
  target.hidden = !targetURL;
  target.href = targetURL || "#";
  target.textContent = targetURL || "No target URL yet.";
  open.disabled = !targetURL;
  if (safety) safety.textContent = session.safety_gate || "Final submit stays gated until explicit user approval.";
}

function renderActionLog(run) {
  const log = $("#action-log");
  if (!log) return;
  if (!run || run.action !== "auto-mode") {
    log.textContent = "No Auto Mode actions recorded yet.";
    return;
  }
  const entries = Array.isArray(run.action_log) ? run.action_log : [];
  if (!entries.length) {
    log.textContent = "Auto Mode is waiting for the first observable browser action.";
    return;
  }
  log.replaceChildren(...entries.map((entry) => {
    const item = document.createElement("div");
    item.className = `action-log-item ${entry.type || "browser"}`;
    const head = document.createElement("strong");
    head.textContent = `${entry.step || "Auto Mode"} / ${entry.type || "event"}`;
    const body = document.createElement("p");
    body.textContent = entry.message || "State update.";
    const meta = document.createElement("small");
    meta.textContent = [formatDate(entry.at), entry.url].filter(Boolean).join(" / ");
    item.append(head, body, meta);
    return item;
  }));
}

function renderReviewGate(run) {
  const gate = $("#review-gate");
  if (!gate) return;
  if (!run || run.action !== "auto-mode") {
    gate.textContent = "No Auto Mode review payload yet.";
    return;
  }

  const nodes = [];
  const summary = document.createElement("div");
  summary.className = "review-item";
  summary.innerHTML = `<strong>${escapeHtml(run.state || "Run")}</strong>${escapeHtml(run.review_gate?.needs_input_reason || run.current_step || "Awaiting observed fields.")}`;
  nodes.push(summary);

  if (run.artifacts?.length) {
    const artifacts = document.createElement("div");
    artifacts.className = "review-item";
    artifacts.innerHTML = `<strong>Artifacts / CV files</strong>${escapeHtml(run.artifacts.join(", "))}`;
    nodes.push(artifacts);
  }

  if (run.observed_fields?.length) {
    run.observed_fields.forEach((field) => {
      const item = document.createElement("div");
      item.className = "review-item";
      const answer = field.answer_summary || field.unresolved_reason || "No answer summary recorded.";
      const source = field.source_used || "No source recorded.";
      item.innerHTML = `<strong>${escapeHtml(field.label || "Observed field")}</strong>${escapeHtml(answer)}<br><small>Type: ${escapeHtml(field.type || "unknown")} / Source: ${escapeHtml(source)}${field.required ? " / Required" : ""}${field.sensitive ? " / Sensitive" : ""}</small>`;
      nodes.push(item);
    });
  } else {
    const empty = document.createElement("div");
    empty.className = "review-item";
    empty.innerHTML = "<strong>Observed fields</strong>No live form fields have been recorded yet.";
    nodes.push(empty);
  }

  gate.replaceChildren(...nodes);
}

async function cancelRun() {
  if (!state.activeRun?.id) return;
  try {
    const run = await api(`/api/runs/${state.activeRun.id}/cancel`, { method: "POST" });
    setActiveRun(run);
    showToast("Run cancellation requested.");
  } catch (error) {
    showToast(`Cancel failed: ${error.message}`);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function wireEvents() {
  $("#search-input")?.addEventListener("input", renderApplications);
  $("#status-filter")?.addEventListener("change", renderApplications);
  $("#status-save")?.addEventListener("click", saveStatus);
  $("#profile-save")?.addEventListener("click", saveProfile);
  $("#auto-start")?.addEventListener("click", () => startAutoMode(false));
  $("#auto-selected")?.addEventListener("click", () => startAutoMode(true));
  $("#worker-pair")?.addEventListener("click", generatePairingToken);
  $("#copy-register")?.addEventListener("click", () => copyTextFrom("#worker-register-command", "Register command"));
  $("#copy-run-worker")?.addEventListener("click", () => copyTextFrom("#worker-run-command", "Worker run command"));
  $("#browser-open")?.addEventListener("click", async () => {
    const opened = reserveVisibleAutoWindow(state.activeRun?.browser_session?.target_url || state.activeRun?.url);
    if (opened && state.activeRun?.id) {
      try {
        const run = await api(`/api/runs/${state.activeRun.id}/browser-log`, {
          method: "POST",
          body: JSON.stringify({
            status: "opened",
            last_action: "Opened target in a visible browser tab.",
            message: "User opened the target URL from the cockpit.",
          }),
        });
        setActiveRun(run);
      } catch (error) {
        showToast(`Browser opened, but observability log failed: ${error.message}`);
      }
    } else if (!opened && state.activeRun?.id) {
      if (isLocalCockpit()) {
        setActiveRun(await openBrowserFromBackend(state.activeRun));
      } else {
        showToast("Popup was blocked. Allow popups for this site or open the target link shown above.");
      }
    }
  });
  $("#cancel-run")?.addEventListener("click", cancelRun);
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => startAction(button.dataset.action));
  });
}

async function bootDashboard() {
  await loadHealth();
  await initialLoad();
}

wireEvents();
$("#auth-form")?.addEventListener("submit", handleLogin);
$("#auth-logout")?.addEventListener("click", logout);
renderAuthState();
if (isAuthenticated()) {
  bootDashboard();
}
