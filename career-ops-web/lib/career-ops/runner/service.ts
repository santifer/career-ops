import { createAgentRunArtifact } from "@/lib/db/queries/agent-run-artifacts";
import { appendAgentRunEvent } from "@/lib/db/queries/agent-run-events";
import {
  claimNextQueuedAgentRun,
  updateAgentRunStatus,
} from "@/lib/db/queries/agent-runs";
import type { AgentRunnerAdapter } from "./types";

export async function runNextQueuedAgentRun(adapter: AgentRunnerAdapter) {
  const claimed = await claimNextQueuedAgentRun();
  if (!claimed) return { kind: "idle" as const };

  await updateAgentRunStatus({
    runId: claimed.id,
    status: "running",
  });

  try {
    const result = await adapter.run({
      id: claimed.id,
      mode: claimed.mode,
      promptBundle: claimed.promptBundle,
      userNotes: claimed.userNotes,
    });

    for (const event of result.events) {
      await appendAgentRunEvent({
        runId: claimed.id,
        type: event.type === "completed" ? "completed" : event.type,
        message: event.message,
        metadata: event.metadata ?? null,
      });
    }

    for (const artifact of result.artifacts) {
      await createAgentRunArtifact({
        runId: claimed.id,
        kind: artifact.kind,
        label: artifact.label,
        previewText: artifact.previewText ?? null,
      });
    }

    await updateAgentRunStatus({
      runId: claimed.id,
      status: result.finalStatus,
      errorMessage: result.errorMessage ?? null,
    });

    return {
      kind: "processed" as const,
      runId: claimed.id,
      finalStatus: result.finalStatus,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await updateAgentRunStatus({
      runId: claimed.id,
      status: "failed",
      errorMessage: message,
    });

    return {
      kind: "processed" as const,
      runId: claimed.id,
      finalStatus: "failed" as const,
    };
  }
}
