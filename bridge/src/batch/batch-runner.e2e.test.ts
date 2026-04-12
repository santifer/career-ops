import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { afterEach, expect, test } from "vitest";

import { writeJdFile } from "../lib/write-jd-file.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const BATCH_RUNNER = join(REPO_ROOT, "batch", "batch-runner.sh");
const BATCH_PROMPT = join(REPO_ROOT, "batch", "batch-prompt.md");
const WORKER_RESULT = join(REPO_ROOT, "batch", "worker-result.mjs");

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeTempRepo(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "career-ops-batch-e2e-"));
  tempRoots.push(repoRoot);

  mkdirSync(join(repoRoot, "batch"), { recursive: true });
  mkdirSync(join(repoRoot, "jds"), { recursive: true });
  mkdirSync(join(repoRoot, "bin"), { recursive: true });

  copyFileSync(BATCH_RUNNER, join(repoRoot, "batch", "batch-runner.sh"));
  copyFileSync(BATCH_PROMPT, join(repoRoot, "batch", "batch-prompt.md"));
  copyFileSync(WORKER_RESULT, join(repoRoot, "batch", "worker-result.mjs"));
  chmodSync(join(repoRoot, "batch", "batch-runner.sh"), 0o755);

  writeFileSync(
    join(repoRoot, "merge-tracker.mjs"),
    'console.log("merge stub");\n',
    "utf-8",
  );
  writeFileSync(
    join(repoRoot, "verify-pipeline.mjs"),
    'console.log("verify stub");\n',
    "utf-8",
  );

  writeFileSync(
    join(repoRoot, "bin", "claude"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'prompt="${@: -1}"',
      'jd_file=""',
      'report_num="000"',
      'if [[ "$prompt" =~ JD\\ file:\\ ([^[:space:]]+) ]]; then jd_file="${BASH_REMATCH[1]}"; fi',
      'if [[ "$prompt" =~ Report\\ number:\\ ([^[:space:]]+) ]]; then report_num="${BASH_REMATCH[1]}"; fi',
      'if [[ -n "$jd_file" && -f "$jd_file" ]]; then',
      '  jd_source="cache"',
      '  used_cached_jd=true',
      '  used_frontmatter=false',
      '  if grep -q "^---$" "$jd_file"; then used_frontmatter=true; fi',
      '  webfetch_count=0',
      '  websearch_count=0',
      "else",
      '  jd_source="webfetch"',
      '  used_cached_jd=false',
      '  used_frontmatter=false',
      '  webfetch_count=1',
      '  websearch_count=0',
      "fi",
      'printf \'{"status":"completed","id":"test-id","report_num":"%s","company":"Test Co","role":"Test Role","score":4.2,"legitimacy":"Proceed with Caution","pdf":null,"report":"reports/%s-test-role-2026-04-11.md","error":null,"metrics":{"jd_source":"%s","used_cached_jd":%s,"used_frontmatter":%s,"webfetch_count":%s,"websearch_count":%s}}\\n\' "$report_num" "$report_num" "$jd_source" "$used_cached_jd" "$used_frontmatter" "$webfetch_count" "$websearch_count"',
      "",
    ].join("\n"),
    "utf-8",
  );
  chmodSync(join(repoRoot, "bin", "claude"), 0o755);

  return repoRoot;
}

function writeBatchInput(repoRoot: string, notes: string): void {
  writeFileSync(
    join(repoRoot, "batch", "batch-input.tsv"),
    ["id\turl\tsource\tnotes", `1\thttps://example.com/jobs/1\tnewgrad\t${notes}`].join(
      "\n",
    ) + "\n",
    "utf-8",
  );
}

function runBatch(repoRoot: string): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync("./batch-runner.sh", [], {
    cwd: join(repoRoot, "batch"),
    env: {
      ...process.env,
      PATH: `${join(repoRoot, "bin")}:${process.env.PATH ?? ""}`,
    },
    encoding: "utf-8",
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
  };
}

test("batch runner records cache-hit metrics for pre-extracted JD inputs", () => {
  const repoRoot = makeTempRepo();
  const jdFilename = writeJdFile({
    jdsDir: join(repoRoot, "jds"),
    company: "ICF",
    role: "Junior SWE",
    url: "https://example.com/jobs/1?utm_source=test",
    description: "A".repeat(500),
    location: "Reston, VA",
    salary: "$100k-$120k",
    h1b: "unknown",
  });
  expect(jdFilename).not.toBeNull();

  writeBatchInput(repoRoot, `[local:jds/${jdFilename}]`);

  const result = runBatch(repoRoot);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain("JD cache hits: 1/1");
  expect(result.stdout).toContain("Worker-reported external lookups: WebFetch 0 | WebSearch 0");

  const metricsPath = join(repoRoot, "batch", "run-metrics.jsonl");
  const metricsLine = readFileSync(metricsPath, "utf-8").trim();
  expect(metricsLine).not.toBe("");

  const metrics = JSON.parse(metricsLine) as {
    jd_cache_hit: boolean;
    jd_fallback_required: boolean;
    metrics: {
      jd_source: string;
      used_cached_jd: boolean;
      used_frontmatter: boolean;
      webfetch_count: number;
      websearch_count: number;
    };
  };

  expect(metrics.jd_cache_hit).toBe(true);
  expect(metrics.jd_fallback_required).toBe(false);
  expect(metrics.metrics.jd_source).toBe("cache");
  expect(metrics.metrics.used_cached_jd).toBe(true);
  expect(metrics.metrics.used_frontmatter).toBe(true);
  expect(metrics.metrics.webfetch_count).toBe(0);
  expect(metrics.metrics.websearch_count).toBe(0);
});

test("batch runner records fallback and external lookup metrics when cached JD is absent", () => {
  const repoRoot = makeTempRepo();
  writeBatchInput(repoRoot, "");

  const result = runBatch(repoRoot);

  expect(result.status).toBe(0);
  expect(result.stdout).toContain("JD cache hits: 0/1");
  expect(result.stdout).toContain("Fallback-required: 1");
  expect(result.stdout).toContain("Worker-reported external lookups: WebFetch 1 | WebSearch 0");

  const metricsPath = join(repoRoot, "batch", "run-metrics.jsonl");
  const metricsLine = readFileSync(metricsPath, "utf-8").trim();
  const metrics = JSON.parse(metricsLine) as {
    jd_cache_hit: boolean;
    jd_fallback_required: boolean;
    metrics: {
      jd_source: string;
      used_cached_jd: boolean;
      webfetch_count: number;
      websearch_count: number;
    };
  };

  expect(metrics.jd_cache_hit).toBe(false);
  expect(metrics.jd_fallback_required).toBe(true);
  expect(metrics.metrics.jd_source).toBe("webfetch");
  expect(metrics.metrics.used_cached_jd).toBe(false);
  expect(metrics.metrics.webfetch_count).toBe(1);
  expect(metrics.metrics.websearch_count).toBe(0);
});
