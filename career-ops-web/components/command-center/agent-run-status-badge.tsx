const toneByStatus: Record<string, string> = {
  queued: "bg-neutral-100 text-neutral-700",
  provisioning: "bg-sky-50 text-sky-700",
  running: "bg-amber-50 text-amber-700",
  waiting_for_user: "bg-violet-50 text-violet-700",
  succeeded: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  canceled: "bg-neutral-200 text-neutral-700",
  timed_out: "bg-orange-50 text-orange-700",
};

export function AgentRunStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${toneByStatus[status] ?? toneByStatus.queued}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
