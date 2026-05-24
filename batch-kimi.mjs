#!/usr/bin/env node
/**
 * batch-kimi.mjs — Batch evaluate pending job URLs using Kimi (Moonshot AI)
 *
 * Reads pending URLs from data/pipeline.md, fetches each JD,
 * runs kimi-eval.mjs for evaluation + tracker staging, then merges.
 *
 * Usage:
 *   node batch-kimi.mjs              # evaluate all pending URLs
 *   node batch-kimi.mjs --dry-run    # list pending URLs without evaluating
 *   node batch-kimi.mjs --min-score 4.0  # only keep evaluations scoring >= 4.0
 *   node batch-kimi.mjs --with-pdf   # also generate tailored CV PDFs (requires Playwright)
 *
 * Workflow:
 *   1. node scan.mjs                 # populate data/pipeline.md
 *   2. node batch-kimi.mjs           # batch evaluate + stage tracker additions
 *   3. node merge-tracker.mjs        # merge additions into data/applications.md
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dns from "dns";
import { promisify } from "util";

const dnsLookup = promisify(dns.lookup);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// Paths
const PIPELINE_PATH = join(ROOT, "data", "pipeline.md");
const JDS_DIR = join(ROOT, "jds", "batch");
const TRACKER_ADDITIONS_DIR = join(ROOT, "batch", "tracker-additions");

// Parse CLI
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

// Explicitly reject --with-pdf flag as batch PDF generation requires tailored HTML CV generation
if (args.includes("--with-pdf")) {
  console.error("❌ Error: --with-pdf is not supported yet in the batch evaluator. Run the career-ops-pdf skill manually for high-scoring roles.");
  process.exit(1);
}

// Parse and validate --min-score
const minScoreFlag = args.findIndex((a) => a === "--min-score");
let minScore = 0;
if (minScoreFlag >= 0) {
  const rawVal = args[minScoreFlag + 1];
  if (rawVal === undefined) {
    console.error("❌ Error: Missing value for --min-score.");
    process.exit(1);
  }
  const val = parseFloat(rawVal);
  if (isNaN(val) || !isFinite(val)) {
    console.error(`❌ Error: Invalid --min-score: expected a numeric value (got "${rawVal}").`);
    process.exit(1);
  }
  minScore = val;
}

// Ensure dirs exist
mkdirSync(JDS_DIR, { recursive: true });
mkdirSync(TRACKER_ADDITIONS_DIR, { recursive: true });

function parsePendingUrls() {
  if (!existsSync(join(ROOT, "data"))) {
    console.error("❌ Error: The 'data/' directory is missing.");
    return [];
  }
  if (!existsSync(PIPELINE_PATH)) {
    console.error("❌ Error: pipeline.md is missing. Run 'node scan.mjs' first.");
    return [];
  }

  const text = readFileSync(PIPELINE_PATH, "utf-8");
  const urls = [];

  // Match markdown checkbox lines: - [ ] https://...
  for (const match of text.matchAll(
    /^- \[ \]\s+(https?:\/\/\S+)(?:\s*\|\s*(.+?))?\s*$/gim,
  )) {
    urls.push({
      url: match[1].trim(),
      meta: match[2] ? match[2].trim() : "",
    });
  }

  return urls;
}

// SSRF Protection Helper Functions
function isPrivateIp(ip) {
  // Check IPv4
  const ipv4Pattern = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;
  const match = ip.match(ipv4Pattern);
  if (match) {
    const [, o1, o2, o3, o4] = match.map(Number);
    // Loopback
    if (o1 === 127) return true;
    // Private ranges (RFC1918)
    if (o1 === 10) return true;
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    if (o1 === 192 && o2 === 168) return true;
    // Link-local
    if (o1 === 169 && o2 === 254) return true;
    // Multicast
    if (o1 >= 224 && o1 <= 239) return true;
    // Broadcast
    if (o1 === 255) return true;
    // Zero autoconfiguration
    if (o1 === 0) return true;
    return false;
  }
  // Check IPv6
  if (ip.includes(":")) {
    const cleanIp = ip.toLowerCase().trim();
    if (cleanIp === "::1" || cleanIp === "::") return true;
    if (cleanIp.startsWith("fe8") || cleanIp.startsWith("fe9") || cleanIp.startsWith("fea") || cleanIp.startsWith("feb")) return true; // fe80::/10
    if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) return true; // unique local addresses
    if (cleanIp.startsWith("ff")) return true; // multicast
  }
  return false;
}

async function validateUrl(urlStr) {
  const parsed = new URL(urlStr);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http: and https: protocols are allowed.");
  }
  const host = parsed.hostname;
  const { address } = await dnsLookup(host);
  if (isPrivateIp(address)) {
    throw new Error(`SSRF Prevention: Resolved IP ${address} is private/reserved.`);
  }
  return parsed;
}

async function fetchJd(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    let currentUrl = url;
    let html = "";
    const maxRedirects = 5;
    for (let i = 0; i < maxRedirects; i++) {
      await validateUrl(currentUrl);
      const resp = await fetch(currentUrl, { redirect: "manual", signal: controller.signal });
      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get("location");
        if (!location) {
          throw new Error(`Redirect with no location header at ${currentUrl}`);
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      html = await resp.text();
      break;
    }

    clearTimeout(timeoutId);

    // Naive HTML→text extraction for job boards
    // Remove script/style tags
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "");

    // Extract text from common JD containers
    const jdMatch = text.match(
      /<div[^>]*class="[^"]*(?:job-description|description|posting|jd)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    );
    if (jdMatch) text = jdMatch[1];

    // Strip remaining HTML tags
    text = text
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // If text is too short, the fetch probably failed to extract meaningful content
    if (text.length < 200) {
      console.warn(
        `    ⚠️  Extracted text is very short (${text.length} chars). JD may be behind JS rendering.`,
      );
    }

    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      console.error(`    ❌ Fetch timeout for ${url}`);
    } else {
      console.error(`    ❌ Failed to fetch ${url}: ${err.message}`);
    }
    return null;
  }
}

import { spawn } from "child_process";

function runKimiEval(jdFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "node",
      [join(ROOT, "kimi-eval.mjs"), "--no-save", "--file", jdFile],
      {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: ROOT,
      },
    );

    let stdout = "";
    let stderr = "";

    const timeoutId = setTimeout(() => {
      child.kill();
      reject(new Error("Evaluation process timed out after 90 seconds."));
    }, 90000);

    const onStdout = (d) => { stdout += d; };
    const onStderr = (d) => { stderr += d; };
    const onError = (err) => {
      clearTimeout(timeoutId);
      cleanup();
      reject(err);
    };
    const onClose = (code) => {
      clearTimeout(timeoutId);
      cleanup();
      resolve({ code, stdout, stderr });
    };

    function cleanup() {
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("error", onError);
      child.off("close", onClose);
      child.off("exit", onClose);
    }

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.on("error", onError);
    child.on("close", onClose);
    child.on("exit", onClose);
  });
}

function extractScore(stdout) {
  const m = stdout.match(/Score:\s*([\d.]+)\/5/);
  return m ? parseFloat(m[1]) : null;
}

async function main() {
  const pending = parsePendingUrls();
  if (pending.length === 0) {
    console.log("No pending URLs to process.");
    return;
  }

  console.log(`=== Kimi Batch Evaluator ===`);
  console.log(`Pending URLs: ${pending.length}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Min score gate: ${minScore > 0 ? minScore : "off"}`);
  console.log("");

  if (dryRun) {
    for (let i = 0; i < pending.length; i++) {
      console.log(
        `  #${i + 1}: ${pending[i].url}${pending[i].meta ? " | " + pending[i].meta : ""}`,
      );
    }
    console.log("\n(dry run — no evaluations performed)");
    return;
  }

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  const results = [];

  for (let i = 0; i < pending.length; i++) {
    const { url, meta } = pending[i];
    console.log(`--- [#${i + 1}/${pending.length}] ${url}`);

    // Fetch JD
    const jdText = await fetchJd(url);
    if (!jdText) {
      failed++;
      continue;
    }

    // Save to temp file
    const safeName = url.replace(/[^a-z0-9]/gi, "_").slice(0, 60);
    const jdFile = join(JDS_DIR, `${safeName}.txt`);
    writeFileSync(jdFile, `${url}\n\n${jdText}`, "utf-8");

    // Run evaluation
    console.log("    🤖 Evaluating with Kimi...");
    let runResult;
    try {
      runResult = await runKimiEval(jdFile);
    } catch (err) {
      console.error(`    ❌ Evaluation error: ${err.message}`);
      failed++;
      continue;
    }

    const { code, stdout, stderr } = runResult;
    if (code !== 0) {
      console.error(`    ❌ Evaluation failed (exit ${code})`);
      console.error(stderr.slice(0, 300));
      failed++;
      continue;
    }

    const score = extractScore(stdout);
    if (score === null) {
      console.error("    ❌ Score not found in evaluation output.");
      failed++;
      continue;
    }
    console.log(`    ✅ Score: ${score}/5`);

    // Min-score gate
    if (minScore > 0 && score < minScore) {
      console.log(
        `    ⏭️  Below min-score (${minScore}), skipping tracker`,
      );
      skipped++;
      continue;
    }

    // Re-run WITH save to generate report + tracker TSV
    console.log("    💾 Saving report + tracker addition...");
    let saveCode = -1;
    try {
      const saveResult = await new Promise((resolve, reject) => {
        const child = spawn(
          "node",
          [join(ROOT, "kimi-eval.mjs"), "--file", jdFile],
          {
            stdio: "inherit",
            cwd: ROOT,
          },
        );
        const timeoutId = setTimeout(() => {
          child.kill();
          reject(new Error("Save process timed out after 90 seconds."));
        }, 90000);

        const onError = (err) => {
          clearTimeout(timeoutId);
          cleanup();
          reject(err);
        };
        const onClose = (code) => {
          clearTimeout(timeoutId);
          cleanup();
          resolve({ code });
        };

        function cleanup() {
          child.off("error", onError);
          child.off("close", onClose);
          child.off("exit", onClose);
        }

        child.on("error", onError);
        child.on("close", onClose);
        child.on("exit", onClose);
      });
      saveCode = saveResult.code;
    } catch (err) {
      console.error(`    ❌ Save execution error: ${err.message}`);
      failed++;
      continue;
    }

    if (saveCode !== 0) {
      console.error(`    ❌ Save failed (exit ${saveCode})`);
      failed++;
      continue;
    }

    completed++;
    results.push({ url, score, meta });

    // Small delay to avoid rate limits
    if (i < pending.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log("\n=== Summary ===");
  console.log(
    `Completed: ${completed} | Failed: ${failed} | Skipped (score): ${skipped}`,
  );

  if (results.length > 0) {
    const avg = (
      results.reduce((s, r) => s + r.score, 0) / results.length
    ).toFixed(2);
    console.log(`Average score: ${avg}/5`);
    console.log("\nTop scores:");
    results
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .forEach((r, i) => console.log(`  ${i + 1}. ${r.score}/5 — ${r.url}`));
  }

  // Merge tracker
  console.log("\n=== Merging tracker additions ===");
  try {
    await new Promise((resolve, reject) => {
      const merge = spawn("node", [join(ROOT, "merge-tracker.mjs")], {
        stdio: "inherit",
        cwd: ROOT,
      });
      const timeoutId = setTimeout(() => {
        merge.kill();
        reject(new Error("merge-tracker.mjs timed out after 60 seconds."));
      }, 60000);

      const onError = (err) => {
        clearTimeout(timeoutId);
        cleanup();
        reject(err);
      };
      const onClose = (code) => {
        clearTimeout(timeoutId);
        cleanup();
        if (code === 0) {
          resolve(code);
        } else {
          reject(new Error(`merge-tracker.mjs failed with exit code ${code}`));
        }
      };

      function cleanup() {
        merge.off("error", onError);
        merge.off("close", onClose);
        merge.off("exit", onClose);
      }

      merge.on("error", onError);
      merge.on("close", onClose);
      merge.on("exit", onClose);
    });
    console.log("\n✅ Batch complete. Review data/applications.md for results.");
  } catch (err) {
    console.error(`\n❌ Tracker merge failed: ${err.message}`);
    throw err;
  }
}

main().catch((err) => {
  console.error("Batch runner error:", err);
  process.exit(1);
});
