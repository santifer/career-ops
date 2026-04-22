import { describe, expect, it } from "vitest";
import {
  assertValidAgentRunTransition,
  isActiveAgentRunStatus,
  isTerminalAgentRunStatus,
  type AgentRunStatus,
} from "@/lib/career-ops/runner/status-machine";

describe("agent run status machine", () => {
  it("allows queued work to move into provisioning and running", () => {
    expect(assertValidAgentRunTransition("queued", "provisioning")).toBe(true);
    expect(assertValidAgentRunTransition("provisioning", "running")).toBe(true);
  });

  it("treats waiting_for_user as non-terminal and succeeded as terminal", () => {
    expect(isActiveAgentRunStatus("waiting_for_user")).toBe(false);
    expect(isTerminalAgentRunStatus("waiting_for_user")).toBe(false);
    expect(isTerminalAgentRunStatus("succeeded")).toBe(true);
  });

  it("rejects invalid backward transitions", () => {
    expect(() =>
      assertValidAgentRunTransition(
        "succeeded" satisfies AgentRunStatus,
        "running" satisfies AgentRunStatus,
      ),
    ).toThrow("Invalid agent run transition");
  });
});
