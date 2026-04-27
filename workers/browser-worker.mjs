#!/usr/bin/env node
import { chromium } from "playwright";
import {
  parseArgs,
  buildFillAnswerSummary,
  buildObservedFieldSummary,
  detectLoginGate,
  fillPlanSafetyGate,
  heartbeatPayload,
  shouldFillObservedField,
  shouldParkForManualInput,
} from "./worker-core.mjs";

const pollIntervalMs = 5000;

async function main() {
  const options = parseArgs();
  if (options.dryRun) {
    console.log(JSON.stringify({
      status: "dry-run-ok",
      headed: !options.headless,
      profileDir: options.profileDir,
      once: options.once,
    }));
    return;
  }
  if (!options.credential) {
    throw new Error("CAREER_OPS_WORKER_CREDENTIAL or --credential is required");
  }

  let browserContext;
  let keepBrowserOpen = false;
  try {
    browserContext = await chromium.launchPersistentContext(options.profileDir, {
      headless: options.headless,
      viewport: { width: 1365, height: 900 },
    });
    do {
      const run = await nextRun(options);
      if (!run) {
        if (options.once) break;
        await delay(pollIntervalMs);
        continue;
      }
      const outcome = await processRun(options, browserContext, run);
      if (outcome?.parked) {
        keepBrowserOpen = true;
        await waitForShutdown();
        outcome.stopHeartbeat?.();
        break;
      }
      if (options.once) break;
    } while (true);
  } finally {
    // Keep the profile directory intact. Closing the context is normal process
    // cleanup; deleting the profile would force the user to log in again.
    if (browserContext && !keepBrowserOpen) await browserContext.close();
  }
}

async function nextRun(options) {
  const response = await workerFetch(options, "/api/worker/runs/next", { method: "GET" });
  if (response.status === 404 || response.status === 204) return null;
  if (!response.ok) throw new Error(`next run failed: HTTP ${response.status}`);
  return response.json();
}

async function processRun(options, context, run) {
  const claimed = await claimRun(options, run.id);
  const stopHeartbeat = startHeartbeat(options, claimed.id);
  let parked = false;
  try {
    const fillPlan = await getFillPlan(options, claimed.id);
    const safetyGate = fillPlanSafetyGate(fillPlan);
    if (safetyGate.blocked) {
      await needsInput(options, claimed.id, safetyGate.reason);
      await log(options, claimed.id, "Paused before opening the job page because the run requires a user override.", fillPlan.target_url);
      return { parked: false };
    }
    const page = context.pages()[0] || await context.newPage();
    await heartbeat(options, claimed.id);
    await log(options, claimed.id, "Opening visible application page.", fillPlan.target_url);
    await page.goto(fillPlan.target_url, { waitUntil: "domcontentloaded" });
    await heartbeat(options, claimed.id);
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const loginGate = detectLoginGate(bodyText);
    if (loginGate.blocked) {
      await needsInput(options, claimed.id, loginGate.reason);
      if (shouldParkForManualInput(options, loginGate)) {
        parked = true;
        await log(options, claimed.id, "Paused for manual login or verification; keeping the visible browser open.", page.url());
        return { parked: true, stopHeartbeat };
      }
      return { parked: false };
    }
    const fieldResult = await observeAndFillSafeFields(options, claimed.id, page, fillPlan);
    await log(options, claimed.id, `Visible browser inspected ${fieldResult.observed} fields and filled ${fieldResult.filled} safe fields.`, page.url());
    await readyForReview(options, claimed.id, "worker_inspected_visible_form");
    return { parked: false };
  } finally {
    if (!parked) {
      stopHeartbeat();
    }
  }
}

async function observeAndFillSafeFields(options, runID, page, fillPlan) {
  const fields = await page.locator("input, textarea, select").all();
  const observations = [];
  let filled = 0;

  for (const field of fields) {
    const descriptor = await describeField(field).catch(() => null);
    if (!descriptor) continue;

    const summary = buildObservedFieldSummary(descriptor);
    const decision = shouldFillObservedField(fillPlan, summary);
    const visible = Boolean(summary.visible);
    const observation = {
      label: summary.label || summary.name || summary.id || summary.placeholder || "Unlabeled field",
      type: summary.type || summary.tagName || "unknown",
      required: Boolean(summary.required),
      visible,
      sensitive: Boolean(summary.sensitive || decision.sensitive),
    };

    if (decision.allowed && visible) {
      await field.fill(String(decision.value));
      filled += 1;
      observation.source_used = "profile_fill_plan";
      observation.answer_summary = buildFillAnswerSummary(decision);
    } else if (!decision.allowed) {
      observation.unresolved_reason = decision.reason;
    }

    observations.push(observation);
  }

  if (observations.length > 0) {
    const reason = observations.find((field) => field.required && field.visible && field.unresolved_reason)?.unresolved_reason || "";
    await fieldObservation(options, runID, observations, reason);
  }

  return { observed: observations.length, filled };
}

async function describeField(locator) {
  const visible = await locator.isVisible().catch(() => false);
  return locator.evaluate((element, visibleValue) => {
    const labelFromElement = () => {
      if (element.labels && element.labels.length > 0) {
        return Array.from(element.labels).map((label) => label.innerText || label.textContent || "").join(" ").trim();
      }
      const id = element.getAttribute("id");
      if (id) {
        const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (explicit) return (explicit.innerText || explicit.textContent || "").trim();
      }
      const wrapper = element.closest("label");
      if (wrapper) return (wrapper.innerText || wrapper.textContent || "").trim();
      return "";
    };

    return {
      tagName: element.tagName,
      type: element.getAttribute("type") || (element.tagName.toLowerCase() === "select" ? "select-one" : "text"),
      label: labelFromElement(),
      name: element.getAttribute("name") || "",
      id: element.getAttribute("id") || "",
      placeholder: element.getAttribute("placeholder") || "",
      autocomplete: element.getAttribute("autocomplete") || "",
      required: Boolean(element.required),
      visible: visibleValue,
      checked: Boolean(element.checked),
      value: element.value || "",
    };
  }, visible);
}

async function claimRun(options, runID) {
  const response = await workerFetch(options, `/api/worker/runs/${encodeURIComponent(runID)}/claim`, {
    method: "POST",
    body: JSON.stringify({ lease_ttl_seconds: 60 }),
  });
  if (!response.ok) throw new Error(`claim failed: HTTP ${response.status}`);
  return response.json();
}

async function getFillPlan(options, runID) {
  const response = await workerFetch(options, `/api/worker/runs/${encodeURIComponent(runID)}/fill-plan`, { method: "GET" });
  if (!response.ok) throw new Error(`fill plan failed: HTTP ${response.status}`);
  return response.json();
}

function startHeartbeat(options, runID) {
  const timer = setInterval(() => {
    heartbeat(options, runID).catch(() => {});
  }, 25000);
  return () => clearInterval(timer);
}

async function heartbeat(options, runID) {
  const response = await workerFetch(options, `/api/worker/runs/${encodeURIComponent(runID)}/heartbeat`, {
    method: "POST",
    body: JSON.stringify(heartbeatPayload()),
  });
  if (!response.ok) throw new Error(`heartbeat failed: HTTP ${response.status}`);
  return response.json();
}

async function log(options, runID, message, url = "") {
  await workerFetch(options, `/api/worker/runs/${encodeURIComponent(runID)}/log`, {
    method: "POST",
    body: JSON.stringify({ message, url, status: "browser-active" }),
  }).catch(() => {});
}

async function needsInput(options, runID, reason) {
  await workerFetch(options, `/api/worker/runs/${encodeURIComponent(runID)}/needs-input`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  }).catch(() => {});
}

async function fieldObservation(options, runID, fields, reason = "") {
  await workerFetch(options, `/api/worker/runs/${encodeURIComponent(runID)}/field-observation`, {
    method: "POST",
    body: JSON.stringify({ fields, reason }),
  }).catch(() => {});
}

async function readyForReview(options, runID, reason = "") {
  await workerFetch(options, `/api/worker/runs/${encodeURIComponent(runID)}/ready-for-review`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  }).catch(() => {});
}

async function workerFetch(options, path, init = {}) {
  return fetch(new URL(path, options.apiBase), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${options.credential}`,
      "X-Career-Ops-Worker-ID": options.workerID,
      ...(init.headers || {}),
    },
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForShutdown() {
  return new Promise((resolve) => {
    const done = () => resolve();
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
  });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
