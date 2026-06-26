export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'timeout';

export type JobKind = 'script' | 'ai';

export interface ScriptJobSpec {
  kind: 'script';
  script: string;
  args: string[];
}

export interface AIJobSpec {
  kind: 'ai';
  mode: string;
  context?: Record<string, string>;
  args?: string[];
}

export type JobSpec = ScriptJobSpec | AIJobSpec;

export interface JobLogLine {
  ts: number;
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
}

export interface Job {
  id: string;
  kind: JobKind;
  label: string;
  status: JobStatus;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  cwd: string;
  spec: JobSpec;
  logs: JobLogLine[];
  truncated: boolean;
  errorMessage?: string;
}
