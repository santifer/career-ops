import type {
  AgentRunExecutionResult,
  AgentRunWorkItem,
} from "./types";

export async function runFakeAgentAdapter(
  input: AgentRunWorkItem,
): Promise<AgentRunExecutionResult> {
  if (input.mode === "apply") {
    return {
      finalStatus: "waiting_for_user",
      events: [
        { type: "log", message: "Loaded fake apply workflow" },
        {
          type: "review_required",
          message: "Human review required before continuing apply flow",
        },
      ],
      artifacts: [
        {
          kind: "json",
          label: "apply-review-summary.json",
          previewText: JSON.stringify(
            {
              fieldsPrepared: 3,
              filesPrepared: ["resume.pdf"],
              finalSubmitBlocked: true,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  return {
    finalStatus: "succeeded",
    events: [
      { type: "log", message: `Executed fake ${input.mode} run` },
      { type: "completed", message: `Fake ${input.mode} run completed` },
    ],
    artifacts: [
      {
        kind: "report_markdown",
        label: `${input.mode}-summary.md`,
        previewText: `# Fake ${input.mode} output\n\nThis is a fake runner artifact.`,
      },
    ],
  };
}
