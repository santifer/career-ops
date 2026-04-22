export type AgentRunStatus =
  | "queued"
  | "provisioning"
  | "running"
  | "waiting_for_user"
  | "succeeded"
  | "failed"
  | "canceled"
  | "timed_out";

const allowedTransitions: Record<AgentRunStatus, AgentRunStatus[]> = {
  queued: ["provisioning", "failed", "canceled", "timed_out"],
  provisioning: ["running", "failed", "canceled", "timed_out"],
  running: ["waiting_for_user", "succeeded", "failed", "canceled", "timed_out"],
  waiting_for_user: ["running", "canceled", "timed_out"],
  succeeded: [],
  failed: [],
  canceled: [],
  timed_out: [],
};

export function assertValidAgentRunTransition(
  from: AgentRunStatus,
  to: AgentRunStatus,
) {
  if (!allowedTransitions[from].includes(to)) {
    throw new Error(`Invalid agent run transition: ${from} -> ${to}`);
  }

  return true;
}

export function isTerminalAgentRunStatus(status: AgentRunStatus) {
  return ["succeeded", "failed", "canceled", "timed_out"].includes(status);
}

export function isActiveAgentRunStatus(status: AgentRunStatus) {
  return ["queued", "provisioning", "running"].includes(status);
}
