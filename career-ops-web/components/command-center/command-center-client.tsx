"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BoltIcon,
  ClipboardDocumentIcon,
  CommandLineIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CAREER_OPS_MODES,
  type CareerOpsModeDefinition,
} from "@/lib/career-ops/modes";
import { AgentRunStatusBadge } from "./agent-run-status-badge";
import { AgentRunTimeline } from "./agent-run-timeline";

type AgentRunEvent = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
};

type AgentRunArtifact = {
  id: string;
  kind: string;
  label: string;
  previewText: string | null;
};

type AgentRunRow = {
  id: string;
  mode: string;
  status: string;
  cliLine: string;
  promptBundle: string;
  subagentInstruction: string | null;
  userNotes: string | null;
  errorMessage: string | null;
  createdAt: string;
  events: AgentRunEvent[];
  artifacts: AgentRunArtifact[];
};

interface CommandCenterClientProps {
  initialRuns: AgentRunRow[];
}

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.alert(`Could not copy ${label}. Select and copy manually.`);
  }
}

export function CommandCenterClient({
  initialRuns,
}: CommandCenterClientProps) {
  const [runs, setRuns] = useState<AgentRunRow[]>(initialRuns);
  const [active, setActive] = useState<AgentRunRow | null>(
    initialRuns[0] ?? null,
  );
  const [picking, setPicking] = useState<CareerOpsModeDefinition | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeId = active?.id;
  const activeStatus = active?.status;

  const modes = useMemo(() => {
    const priority = new Set([
      "scan",
      "apply",
      "batch",
      "pipeline",
      "auto-pipeline",
    ]);

    return [...CAREER_OPS_MODES].sort((left, right) => {
      const leftPriority = priority.has(left.id) ? 0 : 1;
      const rightPriority = priority.has(right.id) ? 0 : 1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.label.localeCompare(right.label);
    });
  }, []);

  useEffect(() => {
    if (!activeId) return;
    if (!["queued", "provisioning", "running"].includes(activeStatus ?? "")) {
      return;
    }

    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/career-ops/runs/${activeId}`);
      if (!response.ok) return;

      const detail = (await response.json()) as AgentRunRow;
      setActive(detail);
      setRuns((previous) => [
        detail,
        ...previous.filter((row) => row.id !== detail.id),
      ]);
    }, 2000);

    return () => window.clearInterval(interval);
  }, [activeId, activeStatus]);

  async function prepareRun(mode: CareerOpsModeDefinition) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/career-ops/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: mode.id,
          userNotes: notes.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof data.error === "string"
            ? data.error
            : `Request failed (${response.status})`;
        const hint =
          typeof data.hint === "string" ? `\n\n${data.hint}` : "";
        setError(message + hint);
        return;
      }

      const row = data as AgentRunRow;
      setRuns((previous) => [row, ...previous.filter((r) => r.id !== row.id)]);
      setActive(row);
      setPicking(null);
      setNotes("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-neutral-800">
          <BoltIcon className="h-5 w-5" />
          Command center
        </h1>
        <p className="mt-0.5 max-w-2xl text-sm text-neutral-500">
          Queue the same prompts as{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">
            /career-ops …
          </code>{" "}
          in Claude Code. The web app still composes the exact bundle from{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">
            modes/_shared.md
          </code>{" "}
          and the selected mode file, but now it also persists run state,
          timeline events, and artifacts while the queue worker executes it.
        </p>
      </div>

      {error ? (
        <div className="whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => {
              setPicking(mode);
              setError(null);
            }}
            className={cn(
              "rounded-xl border border-neutral-200 bg-white p-4 text-left transition-shadow hover:border-neutral-300 hover:shadow-sm",
              mode.prefersSubagent && "ring-1 ring-neutral-100",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-neutral-800">
                  {mode.label}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
                  {mode.description}
                </p>
              </div>
              {mode.prefersSubagent ? (
                <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700">
                  Agent
                </span>
              ) : null}
            </div>
            <p className="mt-2 truncate font-mono text-[11px] text-neutral-400">
              {mode.cli}
            </p>
          </button>
        ))}
      </div>

      {picking ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={() => {
            setPicking(null);
            setNotes("");
          }}
        >
          <div
            className="card-surface w-full max-w-lg space-y-4 rounded-t-xl p-5 sm:rounded-xl"
            role="dialog"
            aria-modal
            aria-labelledby="cc-mode-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <h2
                id="cc-mode-title"
                className="text-sm font-semibold text-neutral-800"
              >
                Prepare: {picking.label}
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                {picking.description}
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-600">
                Optional context (JD text, URLs, notes for the agent)
              </label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={5}
                placeholder="e.g. paste a job description, list of pipeline URLs, or instructions…"
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-300"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setPicking(null);
                  setNotes("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={loading}
                onClick={() => prepareRun(picking)}
              >
                {loading ? "Queueing…" : "Compose and run"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card-surface space-y-3 p-5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
            <DocumentTextIcon className="h-4 w-4" />
            Active run
          </h2>
          {!active ? (
            <p className="text-sm text-neutral-500">
              Choose a mode above to queue a run. Its prompt bundle, lifecycle,
              and artifacts will appear here.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono">
                  {active.mode}
                </span>
                <AgentRunStatusBadge status={active.status} />
                <span>{new Date(active.createdAt).toLocaleString()}</span>
              </div>
              {active.errorMessage ? (
                <p className="text-xs text-red-600">{active.errorMessage}</p>
              ) : null}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-xs font-medium text-neutral-600">
                    <CommandLineIcon className="h-3.5 w-3.5" />
                    Terminal
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-7"
                    onClick={() => void copyText("CLI", active.cliLine)}
                  >
                    <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-neutral-100 bg-neutral-50 p-3 font-mono text-xs">
                  {active.cliLine}
                </pre>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-neutral-600">
                    Full prompt bundle
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-7"
                    onClick={() => void copyText("prompt", active.promptBundle)}
                  >
                    <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
                <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-neutral-100 bg-neutral-50 p-3 font-mono text-xs">
                  {active.promptBundle}
                </pre>
              </div>
              {active.subagentInstruction ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-neutral-600">
                      Subagent hint
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="h-7"
                      onClick={() =>
                        void copyText(
                          "subagent",
                          active.subagentInstruction ?? "",
                        )
                      }
                    >
                      <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                  <pre className="whitespace-pre-wrap rounded-lg border border-neutral-100 bg-neutral-50 p-3 text-xs text-neutral-600">
                    {active.subagentInstruction}
                  </pre>
                </div>
              ) : null}
              <AgentRunTimeline
                events={active.events}
                artifacts={active.artifacts}
              />
            </>
          )}
        </div>

        <div className="card-surface space-y-3 p-5">
          <h2 className="text-sm font-semibold text-neutral-800">
            Recent runs
          </h2>
          {runs.length === 0 ? (
            <p className="text-sm text-neutral-500">No runs yet.</p>
          ) : (
            <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {runs.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => setActive(run)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                      active?.id === run.id
                        ? "border-neutral-400 bg-neutral-50"
                        : "border-neutral-100 hover:border-neutral-200",
                    )}
                  >
                    <div className="font-mono text-neutral-800">{run.mode}</div>
                    <div className="mt-0.5 text-neutral-400">
                      {new Date(run.createdAt).toLocaleString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
