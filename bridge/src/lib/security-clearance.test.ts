import { expect, test } from "vitest";

import {
  detectActiveSecurityClearanceRequirement,
  matchActiveSecurityClearanceRequirement,
} from "./security-clearance.js";

test("detectActiveSecurityClearanceRequirement matches active or current clearance requirements", () => {
  expect(
    detectActiveSecurityClearanceRequirement(
      "Applicants must possess an active secret security clearance before start date.",
    ),
  ).toBe(true);
  expect(
    detectActiveSecurityClearanceRequirement(
      "Current TS/SCI clearance required for this role.",
    ),
  ).toBe(true);
  expect(
    detectActiveSecurityClearanceRequirement(
      "This role requires an active security clearance.",
    ),
  ).toBe(true);
});

test("detectActiveSecurityClearanceRequirement ignores obtain-or-preferred language", () => {
  expect(
    detectActiveSecurityClearanceRequirement(
      "Ability to obtain a security clearance is preferred.",
    ),
  ).toBe(false);
  expect(
    detectActiveSecurityClearanceRequirement(
      "Eligible to obtain Secret clearance after hire.",
    ),
  ).toBe(false);
  expect(
    detectActiveSecurityClearanceRequirement(
      "Public trust clearance preferred.",
    ),
  ).toBe(false);
  expect(
    detectActiveSecurityClearanceRequirement(
      "General security clearance experience is helpful.",
    ),
  ).toBe(false);
});

test("custom clearance phrases only honor strong signals", () => {
  expect(
    detectActiveSecurityClearanceRequirement(
      "Junior Full Stack Developer / Top Secret",
      ["top secret", "security clearance"],
    ),
  ).toBe(true);
  expect(
    detectActiveSecurityClearanceRequirement(
      "Ability to obtain a security clearance is preferred.",
      ["top secret", "security clearance"],
    ),
  ).toBe(false);
});

test("matchActiveSecurityClearanceRequirement returns the matched strong signal", () => {
  expect(
    matchActiveSecurityClearanceRequirement(
      "Current TS/SCI clearance required.",
    ),
  ).toBe("ts/sci clearance");
  expect(
    matchActiveSecurityClearanceRequirement(
      "Junior Full Stack Developer / Top Secret",
      ["top secret", "security clearance"],
    ),
  ).toBe("top secret");
});
