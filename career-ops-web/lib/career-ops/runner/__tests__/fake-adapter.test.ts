import { describe, expect, it } from "vitest";
import { runFakeAgentAdapter } from "@/lib/career-ops/runner/fake-adapter";

describe("runFakeAgentAdapter", () => {
  it("pauses apply runs for human review", async () => {
    const result = await runFakeAgentAdapter({
      id: "run-1",
      mode: "apply",
      promptBundle: "# prompt",
      userNotes: "resume for a job form",
    });

    expect(result.finalStatus).toBe("waiting_for_user");
    expect(result.events.at(-1)?.type).toBe("review_required");
  });

  it("marks scan runs as succeeded with a markdown artifact", async () => {
    const result = await runFakeAgentAdapter({
      id: "run-2",
      mode: "scan",
      promptBundle: "# prompt",
      userNotes: null,
    });

    expect(result.finalStatus).toBe("succeeded");
    expect(result.artifacts[0]?.kind).toBe("report_markdown");
  });
});
