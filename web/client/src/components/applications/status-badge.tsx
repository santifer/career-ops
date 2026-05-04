import { cn } from "@/lib/utils";
import { STATUS_COLORS } from "@/lib/constants";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-xs font-medium", STATUS_COLORS[status] || "bg-gray-100 text-gray-700")}>
      {status}
    </span>
  );
}
