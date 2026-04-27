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

const unsafeFieldTypes = new Set(["file", "password", "hidden", "checkbox", "radio", "button", "submit", "reset", "image"]);

const fillPlanKeyPatterns = [
  { key: "identity.full_name", patterns: [/\bfull\s*name\b/i, /\bcandidate.*name\b/i, /\byour\s+name\b/i, /\blegal\s+name\b/i, /\bnome completo\b/i] },
  { key: "identity.email", patterns: [/\bemail\b/i, /\be-mail\b/i, /\bcandidate\[email\]/i] },
  { key: "identity.phone", patterns: [/\bphone\b/i, /\btelephone\b/i, /\bmobile\b/i, /\bcelular\b/i, /\btelefone\b/i] },
  { key: "identity.linkedin", patterns: [/\blinkedin\b/i, /\blinked\s*in\b/i] },
  { key: "identity.github", patterns: [/\bgithub\b/i] },
  { key: "address.city", patterns: [/\bcity\b/i, /\bcidade\b/i] },
  { key: "address.country", patterns: [/\bcountry\b/i, /\bpais\b/i] },
  { key: "identity.location", patterns: [/\bcurrent\s+location\b/i, /\blocation\b/i, /\blocaliza/i] },
  { key: "availability.notice_period", patterns: [/\bnotice\s+period\b/i, /\bavailability\b/i, /\bavailable\s+from\b/i] },
  { key: "personal.work_authorization", patterns: [/\bwork\s+authorization\b/i, /\bwork\s+authorisation\b/i, /\bvisa\b/i] },
  { key: "form.salary_expectation", patterns: [/\bsalary\b/i, /\bcompensation\b/i, /\bpay\b/i, /\bremuneration\b/i] },
];

const sensitiveDescriptorPatterns = [
  /\bpassword\b/i,
  /\bsocial security\b/i,
  /\bssn\b/i,
  /\bnational\s+id\b/i,
  /\bpassport\b/i,
  /\bdate\s+of\s+birth\b/i,
  /\bdob\b/i,
  /\bbirth\s*date\b/i,
  /\bsalary\b/i,
  /\bcompensation\b/i,
  /\bpay\b/i,
  /\bexpected\s+salary\b/i,
];

const nonCandidateNamePatterns = [
  /\bcompany\s+name\b/i,
  /\breferral\s+name\b/i,
  /\bhiring\s+manager\s+name\b/i,
  /\bemployer\b/i,
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

export function inferFillPlanKey(descriptor = {}) {
  const haystack = descriptorText(descriptor);
  if (!haystack) return "";
  if (nonCandidateNamePatterns.some((pattern) => pattern.test(haystack))) return "";
  const match = fillPlanKeyPatterns.find(({ patterns }) => patterns.some((pattern) => pattern.test(haystack)));
  return match?.key || "";
}

export function shouldFillObservedField(fillPlan, descriptor = {}) {
  if (fillPlan?.low_fit?.blocked) return { allowed: false, reason: "low_fit_blocked" };
  const type = String(descriptor.type || "text").trim().toLowerCase() || "text";
  if (unsafeFieldTypes.has(type)) return { allowed: false, reason: "unsafe_field_type" };
  if (!isSafeTextLikeField(type, descriptor)) return { allowed: false, reason: "unsafe_field_type" };
  if (isSensitiveDescriptor(descriptor)) return { allowed: false, reason: "sensitive_observed_field" };

  const key = inferFillPlanKey(descriptor);
  if (!key) return { allowed: false, reason: "field_not_mapped" };
  const decision = shouldFillField(fillPlan, key);
  if (!decision.allowed) return { ...decision, key };
  if (decision.sensitive) return { allowed: false, key, reason: "sensitive_fill_plan_field" };
  return { allowed: true, key, value: decision.value, sensitive: false };
}

export function fillPlanSafetyGate(fillPlan = {}) {
  if (fillPlan?.low_fit?.blocked) {
    return { blocked: true, reason: "low_fit_override_required" };
  }
  return { blocked: false };
}

export function buildFillAnswerSummary(decision = {}) {
  return `filled_from_profile:${cleanText(decision.key) || "unknown"}`;
}

export function buildObservedFieldSummary(descriptor = {}) {
  const value = descriptor.value;
  const hasValue = value !== undefined && value !== null && String(value) !== "";
  return stripEmpty({
    tagName: descriptor.tagName ? String(descriptor.tagName).toLowerCase() : undefined,
    type: descriptor.type ? String(descriptor.type).toLowerCase() : undefined,
    label: cleanText(descriptor.label),
    name: cleanText(descriptor.name),
    id: cleanText(descriptor.id),
    placeholder: cleanText(descriptor.placeholder),
    required: Boolean(descriptor.required),
    visible: descriptor.visible === undefined ? undefined : Boolean(descriptor.visible),
    checked: descriptor.checked === undefined ? undefined : Boolean(descriptor.checked),
    hasValue,
    sensitive: isSensitiveDescriptor(descriptor),
  });
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

export function heartbeatPayload(leaseTTLSeconds = 60) {
  return { lease_ttl_seconds: leaseTTLSeconds };
}

export function shouldParkForManualInput(options = {}, gate = {}) {
  return Boolean(gate.blocked && options.once && !options.headless);
}

export function detectLoginGate(text = "") {
  const content = String(text);
  if (loginPatterns.some((pattern) => pattern.test(content))) {
    return { blocked: true, reason: "login_or_verification_required" };
  }
  return { blocked: false };
}

function isSafeTextLikeField(type, descriptor) {
  if (String(descriptor.tagName || "").toLowerCase() === "textarea") return true;
  return ["", "text", "email", "tel", "url", "search"].includes(type);
}

function isSensitiveDescriptor(descriptor = {}) {
  return sensitiveDescriptorPatterns.some((pattern) => pattern.test(descriptorText(descriptor)));
}

function descriptorText(descriptor = {}) {
  return [
    descriptor.label,
    descriptor.name,
    descriptor.id,
    descriptor.placeholder,
    descriptor.type,
    descriptor.autocomplete,
  ].map(cleanText).filter(Boolean).join(" ");
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function stripEmpty(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== ""));
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
