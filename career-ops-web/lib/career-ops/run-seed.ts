import { createHash } from "node:crypto";

export function buildQueuedRunSeed(input: {
  mode: string;
  promptBundle: string;
  repoRevision?: string | null;
}) {
  return {
    mode: input.mode,
    repoRevision: input.repoRevision?.trim() || "dev",
    workspaceBundleHash: createHash("sha256")
      .update(input.promptBundle)
      .digest("hex"),
  };
}
