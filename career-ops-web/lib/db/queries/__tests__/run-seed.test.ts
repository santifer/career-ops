import { describe, expect, it } from "vitest";
import { buildQueuedRunSeed } from "@/lib/career-ops/run-seed";

describe("buildQueuedRunSeed", () => {
  it("generates a deterministic workspace bundle hash", () => {
    const first = buildQueuedRunSeed({
      mode: "scan",
      promptBundle: "# bundle",
      repoRevision: "3792333",
    });
    const second = buildQueuedRunSeed({
      mode: "scan",
      promptBundle: "# bundle",
      repoRevision: "3792333",
    });

    expect(first.workspaceBundleHash).toBe(second.workspaceBundleHash);
    expect(first.workspaceBundleHash).toHaveLength(64);
  });

  it("falls back to a dev revision when no repo revision is provided", () => {
    const seed = buildQueuedRunSeed({
      mode: "apply",
      promptBundle: "# another bundle",
    });

    expect(seed.repoRevision).toBe("dev");
  });
});
