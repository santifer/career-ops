#!/usr/bin/env node

import { appendFileSync, existsSync, readFileSync } from "node:fs";

const JD_SOURCES = new Set(["cache", "webfetch", "websearch", "inline", "unknown"]);

function usage() {
  console.error(
    "Usage:\n" +
      "  node batch/worker-result.mjs extract <log-file>\n" +
      "  node batch/worker-result.mjs record <log-file> <metrics-file> <id> <url> <source> <report-num> <jd-file> <jd-cache-hit> <jd-fallback-required> <exit-code>\n" +
      "  node batch/worker-result.mjs summary <metrics-file> [--human]",
  );
  process.exit(1);
}

function normalizeMetrics(rawMetrics) {
  const metrics = rawMetrics && typeof rawMetrics === "object" ? rawMetrics : {};
  const jdSource =
    typeof metrics.jd_source === "string" && JD_SOURCES.has(metrics.jd_source)
      ? metrics.jd_source
      : "unknown";

  return {
    jd_source: jdSource,
    used_cached_jd: metrics.used_cached_jd === true,
    used_frontmatter: metrics.used_frontmatter === true,
    webfetch_count: toNonNegativeInt(metrics.webfetch_count),
    websearch_count: toNonNegativeInt(metrics.websearch_count),
  };
}

function toNonNegativeInt(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return Number(value);
  }
  return 0;
}

function normalizeResult(raw) {
  const result = raw && typeof raw === "object" ? raw : {};
  return {
    status: result.status === "completed" || result.status === "failed" ? result.status : null,
    id: typeof result.id === "string" ? result.id : null,
    report_num: typeof result.report_num === "string" ? result.report_num : null,
    company: typeof result.company === "string" ? result.company : null,
    role: typeof result.role === "string" ? result.role : null,
    score:
      typeof result.score === "number" && Number.isFinite(result.score)
        ? result.score
        : null,
    legitimacy:
      typeof result.legitimacy === "string" ? result.legitimacy : null,
    pdf: typeof result.pdf === "string" ? result.pdf : null,
    report: typeof result.report === "string" ? result.report : null,
    error: typeof result.error === "string" ? result.error : null,
    metrics: normalizeMetrics(result.metrics),
  };
}

function sliceBalancedJson(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return undefined;
}

function extractFinalJsonObject(text) {
  const marker = text.lastIndexOf('"status"');
  if (marker === -1) {
    throw new Error("worker output did not include a terminal JSON block");
  }

  for (
    let start = text.lastIndexOf("{", marker);
    start >= 0;
    start = text.lastIndexOf("{", start - 1)
  ) {
    const jsonText = sliceBalancedJson(text, start);
    if (!jsonText) continue;
    try {
      return normalizeResult(JSON.parse(jsonText));
    } catch {
      continue;
    }
  }

  throw new Error("unable to parse terminal JSON from worker output");
}

function extractResultFromLog(logFile) {
  const text = readFileSync(logFile, "utf-8");
  return extractFinalJsonObject(text);
}

function toBoolean(value) {
  return value === "true";
}

function recordResult(logFile, metricsFile, id, url, source, reportNum, jdFile, jdCacheHit, jdFallbackRequired, exitCode) {
  let result;
  try {
    result = extractResultFromLog(logFile);
  } catch {
    result = normalizeResult({});
  }
  const record = {
    id,
    url,
    source,
    report_num: reportNum,
    jd_file: jdFile,
    jd_cache_hit: toBoolean(jdCacheHit),
    jd_fallback_required: toBoolean(jdFallbackRequired),
    exit_code: Number(exitCode),
    worker_status: result.status,
    score: result.score,
    legitimacy: result.legitimacy,
    metrics: result.metrics,
  };
  appendFileSync(metricsFile, `${JSON.stringify(record)}\n`, "utf-8");
  return record;
}

function summarize(metricsFile) {
  const summary = {
    total_records: 0,
    jd_cache_hits: 0,
    jd_fallback_required: 0,
    jd_source_counts: {
      cache: 0,
      webfetch: 0,
      websearch: 0,
      inline: 0,
      unknown: 0,
    },
    webfetch_total: 0,
    websearch_total: 0,
  };

  if (!existsSync(metricsFile)) {
    return summary;
  }

  const lines = readFileSync(metricsFile, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    summary.total_records += 1;
    if (record.jd_cache_hit === true) summary.jd_cache_hits += 1;
    if (record.jd_fallback_required === true) summary.jd_fallback_required += 1;

    const metrics = normalizeMetrics(record.metrics);
    summary.jd_source_counts[metrics.jd_source] += 1;
    summary.webfetch_total += metrics.webfetch_count;
    summary.websearch_total += metrics.websearch_count;
  }

  return summary;
}

function printHumanSummary(summary) {
  console.log(
    `JD cache hits: ${summary.jd_cache_hits}/${summary.total_records} | Fallback-required: ${summary.jd_fallback_required}`,
  );
  console.log(
    "Worker-reported JD source: " +
      `cache=${summary.jd_source_counts.cache}, ` +
      `webfetch=${summary.jd_source_counts.webfetch}, ` +
      `websearch=${summary.jd_source_counts.websearch}, ` +
      `inline=${summary.jd_source_counts.inline}, ` +
      `unknown=${summary.jd_source_counts.unknown}`,
  );
  console.log(
    `Worker-reported external lookups: WebFetch ${summary.webfetch_total} | WebSearch ${summary.websearch_total}`,
  );
}

const [, , command, ...args] = process.argv;

if (!command) usage();

if (command === "extract") {
  if (args.length !== 1) usage();
  console.log(JSON.stringify(extractResultFromLog(args[0])));
  process.exit(0);
}

if (command === "record") {
  if (args.length !== 10) usage();
  console.log(JSON.stringify(recordResult(...args)));
  process.exit(0);
}

if (command === "summary") {
  if (args.length < 1 || args.length > 2) usage();
  const summary = summarize(args[0]);
  if (args[1] === "--human") {
    printHumanSummary(summary);
  } else {
    console.log(JSON.stringify(summary));
  }
  process.exit(0);
}

usage();
