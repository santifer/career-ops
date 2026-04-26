#!/usr/bin/env node
import { chromium } from "playwright";
import { parseArgs, detectLoginGate, heartbeatPayload, shouldParkForManualInput } from "./worker-core.mjs";

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
  const fillPlan = await getFillPlan(options, claimed.id);
  const page = context.pages()[0] || await context.newPage();
  try {
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
    await log(options, claimed.id, "Visible browser opened; fill automation is waiting for field mapper batch.", page.url());
    return { parked: false };
  } finally {
    if (!parked) {
      stopHeartbeat();
    }
  }
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
