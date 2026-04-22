import { describe, expect, it, vi } from "vitest";
import { getRunnerConfig } from "@/lib/career-ops/runner/config";

describe("getRunnerConfig", () => {
  it("returns fake mode defaults", () => {
    vi.stubEnv("CAREER_OPS_RUNNER_MODE", "");
    vi.stubEnv("CAREER_OPS_RUNNER_POLL_MS", "");
    vi.stubEnv("CAREER_OPS_REPO_REVISION", "");

    expect(getRunnerConfig()).toEqual({
      mode: "fake",
      pollMs: 2000,
      repoRevision: "dev",
    });
  });
});
