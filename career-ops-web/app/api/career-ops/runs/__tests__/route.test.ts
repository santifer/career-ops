import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSession,
  composeCareerOpsPrompt,
  createQueuedAgentRun,
  getAgentRunDetail,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  composeCareerOpsPrompt: vi.fn(),
  createQueuedAgentRun: vi.fn(),
  getAgentRunDetail: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession,
}));

vi.mock("@/lib/career-ops/compose-prompt", () => ({
  composeCareerOpsPrompt,
  CareerOpsRepoError: class CareerOpsRepoError extends Error {},
}));

vi.mock("@/lib/career-ops/modes", () => ({
  isCareerOpsModeId: (id: string) => id === "scan",
  getModeDefinition: () => ({
    id: "scan",
    label: "Scan",
    description: "Scan portals",
    usesSharedContext: true,
    prefersSubagent: true,
    cli: "/career-ops scan",
  }),
}));

vi.mock("@/lib/db/queries/agent-runs", () => ({
  createQueuedAgentRun,
  listAgentRuns: vi.fn(),
  getAgentRunDetail,
}));

import { POST } from "@/app/api/career-ops/runs/route";

describe("POST /api/career-ops/runs", () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ userId: "user-1" });
    composeCareerOpsPrompt.mockResolvedValue({
      cliLine: "/career-ops scan",
      promptBundle: "# prompt",
      subagentInstruction: "description: career-ops scan",
      root: "/tmp/career-ops",
    });
    createQueuedAgentRun.mockResolvedValue({
      id: "run-1",
      mode: "scan",
      status: "queued",
      promptBundle: "# prompt",
      cliLine: "/career-ops scan",
      subagentInstruction: "description: career-ops scan",
      userNotes: null,
    });
    getAgentRunDetail.mockResolvedValue({
      id: "run-1",
      mode: "scan",
      status: "queued",
      events: [],
      artifacts: [],
    });
  });

  it("queues the run and returns 202 Accepted", async () => {
    const request = new Request("http://localhost:3000/api/career-ops/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "scan" }),
    });

    const response = await POST(request as never);
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json.status).toBe("queued");
    expect(createQueuedAgentRun).toHaveBeenCalled();
  });
});
