const submitPatterns = [
  /\bsubmit\b/i,
  /\bsend application\b/i,
  /\bapply now\b/i,
  /\bfinalizar candidatura\b/i,
  /\benviar candidatura\b/i,
];

const navigationPatterns = [
  /\bnext\b/i,
  /\bcontinue\b/i,
  /\bsave and continue\b/i,
  /\bstart application\b/i,
  /\bprosseguir\b/i,
  /\bcontinuar\b/i,
];

const loginPatterns = [
  /\bsign in\b/i,
  /\blog in\b/i,
  /\blogin\b/i,
  /\btwo-factor\b/i,
  /\bmfa\b/i,
  /\bauthentication required\b/i,
  /\bcaptcha\b/i,
  /\bhuman verification\b/i,
];

export function classifyButton(label = "") {
  const text = String(label).trim();
  if (submitPatterns.some((pattern) => pattern.test(text))) {
    return { kind: "submit", safe: false, reason: "final_submit_gate_required" };
  }
  if (navigationPatterns.some((pattern) => pattern.test(text))) {
    return { kind: "navigation", safe: true };
  }
  return { kind: "unknown", safe: false, reason: "unknown_button_intent" };
}

export function shouldFillField(fillPlan, key) {
  const field = (fillPlan?.fields || []).find((candidate) => candidate.key === key);
  if (!field) return { allowed: false, reason: "field_not_in_fill_plan" };
  if (field.needs_input || !field.value) return { allowed: false, reason: field.reason || "field_needs_input" };
  return { allowed: true, value: field.value, sensitive: Boolean(field.sensitive) };
}

export function shouldUploadPDF(fillPlan) {
  if (!fillPlan?.upload_ready) return { allowed: false, reason: "upload_gate_required" };
  if (!Array.isArray(fillPlan.pdf_artifacts) || fillPlan.pdf_artifacts.length === 0) {
    return { allowed: false, reason: "approved_pdf_missing" };
  }
  return { allowed: true, artifact: fillPlan.pdf_artifacts[0] };
}

export function shouldSubmitFinal(fillPlan, leaseState = {}) {
  if (!fillPlan?.submit_ready) return { allowed: false, reason: "submit_gate_required" };
  if (!leaseState.hasActiveLease) return { allowed: false, reason: "active_worker_lease_required" };
  return { allowed: true };
}

export function detectLoginGate(text = "") {
  const content = String(text);
  if (loginPatterns.some((pattern) => pattern.test(content))) {
    return { blocked: true, reason: "login_or_verification_required" };
  }
  return { blocked: false };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    apiBase: process.env.CAREER_OPS_API_BASE || "http://localhost:8080",
    workerID: process.env.CAREER_OPS_WORKER_ID || "local-worker",
    credential: process.env.CAREER_OPS_WORKER_CREDENTIAL || "",
    profileDir: process.env.CAREER_OPS_BROWSER_PROFILE || ".local/browser-worker-profile",
    headless: process.env.CAREER_OPS_HEADLESS === "true",
    once: false,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--once") options.once = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--api-base") options.apiBase = argv[++index];
    else if (arg === "--worker-id") options.workerID = argv[++index];
    else if (arg === "--credential") options.credential = argv[++index];
    else if (arg === "--profile-dir") options.profileDir = argv[++index];
    else if (arg === "--headless") options.headless = true;
  }
  return options;
}
