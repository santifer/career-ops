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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// Paths
const PIPELINE_PATH = join(ROOT, "data", "pipeline.md");
const JDS_DIR = join(ROOT, "jds", "batch");
const TRACKER_ADDITIONS_DIR = join(ROOT, "batch", "tracker-additions");

// Parse CLI
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const withPdf = args.includes("--with-pdf");
const minScoreFlag = args.findIndex((a) => a === "--min-score");
const minScore =
  minScoreFlag >= 0 ? parseFloat(args[minScoreFlag + 1]) || 0 : 0;

// Ensure dirs exist
mkdirSync(JDS_DIR, { recursive: true });
mkdirSync(TRACKER_ADDITIONS_DIR, { recursive: true });

function parsePendingUrls() {
  if (!existsSync(PIPELINE_PATH)) {
    console.log("❌ No data/pipeline.md found. Run 'node scan.mjs' first.");
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

async function fetchJd(url) {
  try {
    const resp = await fetch(url, { redirect: "follow" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    // Very naive HTML→text extraction for job boards
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
    console.error(`    ❌ Failed to fetch ${url}: ${err.message}`);
    return null;
  }
}

import { spawn } from "child_process";

function runKimiEval(jdFile) {
  return new Promise((resolve) => {
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

    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function extractScore(stdout) {
  const m = stdout.match(/Score:\s*([\d.]+)\/5/);
  return m ? parseFloat(m[1]) : 0;
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
  console.log(`With PDF: ${withPdf}`);
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
    const { code, stdout, stderr } = await runKimiEval(jdFile);

    if (code !== 0) {
      console.error(`    ❌ Evaluation failed (exit ${code})`);
      console.error(stderr.slice(0, 300));
      failed++;
      continue;
    }

    const score = extractScore(stdout);
    console.log(`    ✅ Score: ${score}/5`);

    // Min-score gate
    if (minScore > 0 && score < minScore) {
      console.log(
        `    ⏭️  Below min-score (${minScore}), skipping tracker/PDF`,
      );
      skipped++;
      continue;
    }

    // Re-run WITH save to generate report + tracker TSV
    console.log("    💾 Saving report + tracker addition...");
    const { code: saveCode } = await new Promise((resolve) => {
      const child = spawn(
        "node",
        [join(ROOT, "kimi-eval.mjs"), "--file", jdFile],
        {
          stdio: "inherit",
          cwd: ROOT,
        },
      );
      child.on("close", (code) => resolve({ code }));
    });

    if (saveCode !== 0) {
      console.error(`    ❌ Save failed (exit ${saveCode})`);
      failed++;
      continue;
    }

    completed++;
    results.push({ url, score, meta });

    // Optional: generate PDF
    if (withPdf && score >= 4.0) {
      console.log(
        "    📄 PDF generation skipped in this version (requires tailored HTML generation).",
      );
      console.log(
        "       Run career-ops-pdf skill manually for high-scoring roles.",
      );
    }

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
  const merge = spawn("node", [join(ROOT, "merge-tracker.mjs")], {
    stdio: "inherit",
    cwd: ROOT,
  });
  merge.on("close", (code) => {
    if (code === 0) {
      console.log(
        "\n✅ Batch complete. Review data/applications.md for results.",
      );
    } else {
      console.log("\n⚠️  Merge completed with warnings. Check output above.");
    }
  });
}

main().catch((err) => {
  console.error("Batch runner error:", err);
  process.exit(1);
});
