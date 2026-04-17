#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const repoRoot = process.cwd();
const base = "http://127.0.0.1:47319";
const token = readFileSync(`${repoRoot}/bridge/.bridge-token`, "utf-8").trim();
const headers = {
  "content-type": "application/json",
  "x-career-ops-token": token,
};

const requestedLimit = Number(process.argv[2] ?? 100);
const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
  ? requestedLimit
  : 100;

const envelope = (payload) => ({
  protocol: "1.0.0",
  requestId: `warm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  clientTimestamp: new Date().toISOString(),
  payload,
});

async function post(path, payload) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(envelope(payload)),
  });
  const body = await res.json();
  return { status: res.status, body };
}

function normalizeText(text) {
  return text
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function capturePageText(page, entry) {
  await page.goto(entry.url, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  for (const delayMs of [2_000, 5_000]) {
    await page.waitForTimeout(delayMs);
    const pageText = await page.evaluate(() => {
      const main =
        document.querySelector("[data-automation-id='jobPostingPage']") ??
        document.querySelector("[data-automation-id='jobPostingDescription']") ??
        document.querySelector("main") ??
        document.querySelector("article") ??
        document.body;
      const bodyText =
        (main instanceof HTMLElement ? main.innerText : "") ||
        main?.textContent ||
        document.body?.innerText ||
        "";
      const scriptText = Array.from(
        document.querySelectorAll(
          "script[type='application/ld+json'], script[type='application/json'], script#__NEXT_DATA__"
        )
      )
        .map((script) => script.textContent ?? "")
        .join("\n");
      return `${bodyText}\n${scriptText}`;
    });

    const normalized = normalizeText(pageText).slice(0, 10_000);
    if (normalized.length >= 1_200) {
      return normalized;
    }
  }

  return "";
}

async function main() {
  const pending = await post("/v1/newgrad-scan/pending", { limit });
  if (!pending.body.ok) {
    console.error(JSON.stringify({
      step: "pending",
      status: pending.status,
      error: pending.body.error,
    }, null, 2));
    process.exit(1);
  }

  const targets = pending.body.result.entries.filter((entry) => !entry.localJdPath);
  console.log(`pending_total=${pending.body.result.total}`);
  console.log(`legacy_without_local_cache=${targets.length}`);

  if (targets.length === 0) {
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const backfillEntries = [];
  let skipped = 0;

  try {
    for (const [index, entry] of targets.entries()) {
      console.log(`capture ${index + 1}/${targets.length} ${entry.company} | ${entry.role}`);
      try {
        const pageText = await capturePageText(page, entry);
        if (pageText.length < 1_200) {
          skipped += 1;
          console.log(`  skipped insufficient_text ${pageText.length}`);
          continue;
        }
        backfillEntries.push({
          url: entry.url,
          company: entry.company,
          role: entry.role,
          lineNumber: entry.lineNumber,
          pageText,
        });
        console.log(`  captured ${pageText.length} chars`);
      } catch (error) {
        skipped += 1;
        console.log(`  skipped navigation_error ${(error instanceof Error ? error.message : String(error)).split("\n")[0]}`);
      }
    }
  } finally {
    await browser.close();
  }

  if (backfillEntries.length === 0) {
    console.log(`backfill_updated=0 skipped=${skipped}`);
    return;
  }

  const backfill = await post("/v1/newgrad-scan/pending/backfill", {
    entries: backfillEntries,
  });
  if (!backfill.body.ok) {
    console.error(JSON.stringify({
      step: "backfill",
      status: backfill.status,
      error: backfill.body.error,
    }, null, 2));
    process.exit(1);
  }

  console.log(`backfill_updated=${backfill.body.result.updated}`);
  console.log(`backfill_skipped=${backfill.body.result.skipped + skipped}`);
  for (const outcome of backfill.body.result.outcomes) {
    console.log(JSON.stringify(outcome));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
