import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";

import { __internal, createSdkPipelineAdapter } from "./sdk-pipeline.js";
import type { PipelineConfig } from "../contracts/pipeline.js";

function makeRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "career-ops-sdk-test-"));
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "data"), { recursive: true });
  mkdirSync(join(root, "modes"), { recursive: true });
  mkdirSync(join(root, "reports"), { recursive: true });
  mkdirSync(join(root, "batch", "tracker-additions"), { recursive: true });

  writeFileSync(join(root, "cv.md"), "# CV\n", "utf-8");
  writeFileSync(join(root, "config", "profile.yml"), "name: Test User\n", "utf-8");
  writeFileSync(join(root, "data", "applications.md"), "# Applications\n", "utf-8");
  writeFileSync(join(root, "modes", "_shared.md"), "shared prompt", "utf-8");
  writeFileSync(join(root, "modes", "oferta.md"), "offer prompt", "utf-8");
  writeFileSync(join(root, "modes", "_profile.md"), "profile prompt", "utf-8");
  writeFileSync(join(root, "VERSION"), "1.2.0-test\n", "utf-8");

  return root;
}

function makeConfig(repoRoot: string): PipelineConfig {
  return {
    repoRoot,
    claudeBin: "claude",
    nodeBin: process.execPath,
    evaluationTimeoutSec: 60,
    livenessTimeoutSec: 10,
    allowDangerousClaudeFlags: false,
  };
}

test("extractJsonFromText returns fenced JSON payload", () => {
  const text = [
    "prelude",
    "```json",
    '{"company":"Anthropic","role":"Forward Deployed Engineer","archetype":"fde","score":4.7,"tldr":"Strong fit.","blockA":"A","blockB":"B","blockC":"C","blockD":"D","blockE":"E","blockF":"F","keywords":["agents","python","llms"]}',
    "```",
    "epilogue",
  ].join("\n");

  const parsed = __internal.extractJsonFromText(text) as {
    company: string;
    score: number;
    keywords: string[];
  };

  expect(parsed.company).toBe("Anthropic");
  expect(parsed.score).toBe(4.7);
  expect(parsed.keywords).toEqual(["agents", "python", "llms"]);
});

test("doctor reports sdk availability from api key presence", async () => {
  const repoRoot = makeRepoRoot();
  try {
    const config = makeConfig(repoRoot);

    const missingKeyAdapter = createSdkPipelineAdapter(config, {
      apiKey: "",
      model: "claude-opus-4-6",
    });
    const missingKeyDoctor = await missingKeyAdapter.doctor();
    expect(missingKeyDoctor.ok).toBe(false);
    expect(missingKeyDoctor.claudeCli.ok).toBe(false);
    expect(missingKeyDoctor.claudeCli.error).toBe("ANTHROPIC_API_KEY not set");

    const configuredAdapter = createSdkPipelineAdapter(config, {
      apiKey: "test-key",
      model: "claude-opus-4-6",
    });
    const configuredDoctor = await configuredAdapter.doctor();
    expect(configuredDoctor.ok).toBe(true);
    expect(configuredDoctor.claudeCli.ok).toBe(true);
    expect(configuredDoctor.claudeCli.version).toBe("sdk (claude-opus-4-6)");
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
