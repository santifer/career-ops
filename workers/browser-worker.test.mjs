import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyButton,
  shouldFillField,
  shouldUploadPDF,
  shouldSubmitFinal,
  detectLoginGate,
  heartbeatPayload,
  shouldParkForManualInput,
} from "./worker-core.mjs";
import * as workerCore from "./worker-core.mjs";

function requireCoreExport(name) {
  assert.equal(typeof workerCore[name], "function", `${name} must be exported from worker-core.mjs`);
  return workerCore[name];
}

test("classifyButton treats final submit labels as blocked", () => {
  assert.equal(classifyButton("Submit application").kind, "submit");
  assert.equal(classifyButton("Enviar candidatura").kind, "submit");
  assert.equal(classifyButton("Next").kind, "navigation");
});

test("shouldFillField only fills authorized non-missing fill-plan fields", () => {
  const plan = {
    fields: [
      { key: "identity.email", value: "me@example.com", needs_input: false },
      { key: "identity.phone", value: "", needs_input: true },
    ],
  };

  assert.equal(shouldFillField(plan, "identity.email").allowed, true);
  assert.equal(shouldFillField(plan, "identity.phone").allowed, false);
  assert.equal(shouldFillField(plan, "custom.unknown").allowed, false);
});

test("upload and submit remain blocked without explicit gates", () => {
  assert.equal(shouldUploadPDF({ upload_ready: false }).allowed, false);
  assert.equal(shouldSubmitFinal({ submit_ready: false }, { hasActiveLease: true }).allowed, false);
  assert.equal(shouldSubmitFinal({ submit_ready: true }, { hasActiveLease: false }).allowed, false);
  assert.equal(shouldSubmitFinal({ submit_ready: true }, { hasActiveLease: true }).allowed, true);
});

test("detectLoginGate flags common login and verification pages", () => {
  assert.equal(detectLoginGate("Sign in to continue").blocked, true);
  assert.equal(detectLoginGate("Two-factor authentication required").blocked, true);
  assert.equal(detectLoginGate("Application form").blocked, false);
});

test("manual input gates park a headed once worker", () => {
  const gate = { blocked: true, reason: "login_or_verification_required" };
  assert.equal(shouldParkForManualInput({ once: true, headless: false }, gate), true);
  assert.equal(shouldParkForManualInput({ once: true, headless: true }, gate), false);
  assert.equal(shouldParkForManualInput({ once: false, headless: false }, gate), false);
  assert.equal(shouldParkForManualInput({ once: true, headless: false }, { blocked: false }), false);
});

test("heartbeat payload keeps the lease contract explicit", () => {
  assert.deepEqual(heartbeatPayload(), { lease_ttl_seconds: 60 });
  assert.deepEqual(heartbeatPayload(120), { lease_ttl_seconds: 120 });
});

test("browser field mapper infers common input descriptors to fill-plan keys", () => {
  const inferFillPlanKey = requireCoreExport("inferFillPlanKey");

  const cases = [
    [{ label: "Full name" }, "identity.full_name"],
    [{ name: "candidate[email]" }, "identity.email"],
    [{ id: "phone-input" }, "identity.phone"],
    [{ placeholder: "LinkedIn profile URL" }, "identity.linkedin"],
    [{ label: "Current location" }, "identity.location"],
  ];

  for (const [descriptor, expected] of cases) {
    assert.equal(inferFillPlanKey(descriptor), expected);
  }

  for (const descriptor of [
    { label: "Company name" },
    { label: "Referral name" },
    { label: "Hiring manager name" },
    { label: "Current employer" },
  ]) {
    assert.equal(inferFillPlanKey(descriptor), "");
  }
});

test("browser field mapper only fills safe text-like fields from the fill plan", () => {
  const shouldFillObservedField = requireCoreExport("shouldFillObservedField");
  const fillPlan = {
    fields: [
      { key: "identity.full_name", value: "Candidate Name", needs_input: false },
      { key: "identity.email", value: "candidate@example.com", needs_input: false },
      { key: "identity.phone", value: "+1 555 0100", needs_input: false },
      { key: "identity.linkedin", value: "https://linkedin.com/in/candidate", needs_input: false },
    ],
  };

  const allowed = shouldFillObservedField(fillPlan, { type: "email", name: "email" });
  assert.deepEqual(allowed, {
    allowed: true,
    key: "identity.email",
    value: "candidate@example.com",
    sensitive: false,
  });

  for (const type of ["file", "password", "hidden", "checkbox", "radio", "button", "submit"]) {
    const decision = shouldFillObservedField(fillPlan, {
      type,
      label: "Email",
      name: `blocked-${type}`,
    });
    assert.equal(decision.allowed, false, `${type} fields must not be auto-filled`);
    assert.equal(decision.reason, "unsafe_field_type");
  }
});

test("browser field mapper does not auto-fill sensitive fields", () => {
  const shouldFillObservedField = requireCoreExport("shouldFillObservedField");
  const fillPlan = {
    fields: [
      { key: "identity.ssn", value: "123-45-6789", needs_input: false, sensitive: true },
      { key: "identity.email", value: "candidate@example.com", needs_input: false, sensitive: true },
    ],
  };

  for (const descriptor of [
    { type: "text", label: "Social Security Number", name: "ssn" },
    { type: "text", label: "Date of birth", name: "date_of_birth" },
    { type: "text", label: "Expected salary", name: "salary_expectation" },
    { type: "email", label: "Email", name: "email" },
  ]) {
    const decision = shouldFillObservedField(fillPlan, descriptor);
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /sensitive/);
  }
});

test("browser field mapper does not proceed when low-fit gate is blocked", () => {
  const shouldFillObservedField = requireCoreExport("shouldFillObservedField");
  const fillPlanSafetyGate = requireCoreExport("fillPlanSafetyGate");
  const fillPlan = {
    low_fit: { blocked: true, score: 3.2, reason: "Score below ethical cutoff" },
    fields: [
      { key: "identity.full_name", value: "Candidate Name", needs_input: false },
    ],
  };

  assert.deepEqual(
    shouldFillObservedField(fillPlan, { type: "text", label: "Full name" }),
    { allowed: false, reason: "low_fit_blocked" },
  );
  assert.deepEqual(fillPlanSafetyGate(fillPlan), {
    blocked: true,
    reason: "low_fit_override_required",
  });
  assert.deepEqual(fillPlanSafetyGate({ fields: [] }), { blocked: false });
});

test("observed field summaries redact raw sensitive values", () => {
  const buildObservedFieldSummary = requireCoreExport("buildObservedFieldSummary");
  const buildFillAnswerSummary = requireCoreExport("buildFillAnswerSummary");
  const summary = buildObservedFieldSummary({
    tagName: "input",
    type: "password",
    label: "Create password",
    name: "user_password",
    id: "password",
    placeholder: "Password",
    value: "correct-horse-battery-staple",
    checked: false,
  });

  assert.equal(summary.tagName, "input");
  assert.equal(summary.type, "password");
  assert.equal(summary.hasValue, true);
  assert.equal("value" in summary, false);
  assert.doesNotMatch(JSON.stringify(summary), /correct-horse-battery-staple/);

  const answerSummary = buildFillAnswerSummary({
    key: "identity.email",
    value: "candidate@example.com",
  });
  assert.equal(answerSummary, "filled_from_profile:identity.email");
  assert.doesNotMatch(answerSummary, /candidate@example.com/);
});
