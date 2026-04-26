import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyButton,
  shouldFillField,
  shouldUploadPDF,
  shouldSubmitFinal,
  detectLoginGate,
} from "./worker-core.mjs";

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
