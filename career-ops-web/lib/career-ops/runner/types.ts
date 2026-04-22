import type { AgentRunStatus } from "./status-machine";

export interface AgentRunWorkItem {
  id: string;
  mode: string;
  promptBundle: string;
  userNotes: string | null;
}

export interface AgentRunExecutionEvent {
  type: "log" | "artifact" | "review_required" | "completed";
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRunExecutionArtifact {
  kind: "log" | "report_markdown" | "screenshot" | "pdf" | "json";
  label: string;
  previewText?: string;
}

export interface AgentRunExecutionResult {
  finalStatus: Extract<
    AgentRunStatus,
    "running" | "waiting_for_user" | "succeeded" | "failed"
  >;
  events: AgentRunExecutionEvent[];
  artifacts: AgentRunExecutionArtifact[];
  errorMessage?: string;
}

export interface AgentRunnerAdapter {
  run(input: AgentRunWorkItem): Promise<AgentRunExecutionResult>;
}
