/**
 * index.ts — bridge entrypoint.
 *
 * Boot sequence:
 *   1. loadConfig() — resolves repoRoot, token, binaries.
 *   2. Build the adapter (fake by default, real when requested).
 *   3. buildServer() — wires Fastify with the adapter.
 *   4. listen() on loopback.
 */

import type { PipelineAdapter, PipelineConfig } from "./contracts/pipeline.js";
import { loadConfig } from "./runtime/config.js";
import { createFakePipelineAdapter } from "./adapters/fake-pipeline.js";
import { createClaudePipelineAdapter } from "./adapters/claude-pipeline.js";
import { createSdkPipelineAdapter } from "./adapters/sdk-pipeline.js";
import { buildServer } from "./server.js";

function toPipelineConfig(
  cfg: ReturnType<typeof loadConfig>
): PipelineConfig {
  return {
    repoRoot: cfg.repoRoot,
    claudeBin: cfg.claudeBin ?? "claude",
    codexBin: cfg.codexBin,
    nodeBin: cfg.nodeBin,
    realExecutor: cfg.realExecutor,
    evaluationTimeoutSec: cfg.evaluationTimeoutSec,
    livenessTimeoutSec: cfg.livenessTimeoutSec,
    allowDangerousClaudeFlags: true,
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const pipelineCfg = toPipelineConfig(config);

  let adapter: PipelineAdapter;
  switch (config.mode) {
    case "fake":
      adapter = createFakePipelineAdapter(pipelineCfg);
      break;
    case "real":
      adapter = createClaudePipelineAdapter(pipelineCfg);
      break;
    case "sdk":
      adapter = createSdkPipelineAdapter(pipelineCfg);
      break;
  }

  const { fastify } = buildServer({ config, adapter });

  // Security banner — print a short-form token hint (never the full token).
  const tokenPreview = config.token.slice(0, 8) + "…";
  fastify.log.info(
    {
      mode: config.mode,
      realExecutor: config.realExecutor,
      host: config.host,
      port: config.port,
      repoRoot: config.repoRoot,
      bridgeVersion: config.bridgeVersion,
      careerOpsVersion: config.careerOpsVersion,
      tokenPreview,
    },
    "career-ops bridge booting"
  );

  await fastify.listen({ host: config.host, port: config.port });
  fastify.log.info(
    `career-ops bridge listening on http://${config.host}:${config.port} (mode=${config.mode})`
  );
  fastify.log.info(
    `token file: ${config.bridgeDir}/.bridge-token (mode 0600)`
  );
}

main().catch((err) => {
  console.error("bridge failed to start:", err);
  process.exit(1);
});
