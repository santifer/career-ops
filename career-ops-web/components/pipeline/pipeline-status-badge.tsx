const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-600 border-red-200",
};

interface PipelineStatusBadgeProps {
  status: string;
}

export function PipelineStatusBadge({ status }: PipelineStatusBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${statusStyles[status] ?? statusStyles.pending}`}>
      {status}
    </span>
  );
}
