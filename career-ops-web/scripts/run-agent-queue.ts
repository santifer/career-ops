import "dotenv/config";
import { runFakeAgentAdapter } from "../lib/career-ops/runner/fake-adapter";
import { runNextQueuedAgentRun } from "../lib/career-ops/runner/service";

const pollMs = Number(process.env.CAREER_OPS_RUNNER_POLL_MS ?? 2000);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  process.stdout.write("career-ops fake runner polling for queued runs\n");

  while (true) {
    const result = await runNextQueuedAgentRun({
      run: runFakeAgentAdapter,
    });

    if (result.kind === "idle") {
      await sleep(pollMs);
      continue;
    }

    process.stdout.write(`processed ${result.runId} -> ${result.finalStatus}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
