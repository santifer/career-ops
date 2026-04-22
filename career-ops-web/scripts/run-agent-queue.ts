import "dotenv/config";
import { getRunnerConfig } from "../lib/career-ops/runner/config";
import { runFakeAgentAdapter } from "../lib/career-ops/runner/fake-adapter";
import { runNextQueuedAgentRun } from "../lib/career-ops/runner/service";

const config = getRunnerConfig();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  process.stdout.write(
    `career-ops ${config.mode} runner polling every ${config.pollMs}ms\n`,
  );

  while (true) {
    const result = await runNextQueuedAgentRun({
      run: runFakeAgentAdapter,
    });

    if (result.kind === "idle") {
      await sleep(config.pollMs);
      continue;
    }

    process.stdout.write(`processed ${result.runId} -> ${result.finalStatus}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
