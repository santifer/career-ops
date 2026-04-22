export function getRunnerConfig() {
  const pollRaw = process.env.CAREER_OPS_RUNNER_POLL_MS?.trim();

  return {
    mode: process.env.CAREER_OPS_RUNNER_MODE?.trim() || "fake",
    pollMs: pollRaw ? Number(pollRaw) : 2000,
    repoRevision: process.env.CAREER_OPS_REPO_REVISION?.trim() || "dev",
  };
}
