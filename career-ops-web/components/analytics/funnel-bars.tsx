import type { StatusCount } from "@/lib/db/queries/analytics";

const STATUS_ORDER = [
  "Evaluated",
  "Applied",
  "Responded",
  "Interview",
  "Offer",
  "Rejected",
  "Discarded",
  "SKIP",
];

const STATUS_COLORS: Record<string, string> = {
  Evaluated: "bg-neutral-400",
  Applied: "bg-violet-400",
  Responded: "bg-violet-500",
  Interview: "bg-blue-500",
  Offer: "bg-emerald-500",
  Rejected: "bg-red-400",
  Discarded: "bg-neutral-300",
  SKIP: "bg-neutral-200",
};

export function FunnelBars({
  byStatus,
  total,
  avgScore,
}: {
  byStatus: StatusCount[];
  total: number;
  avgScore: number | null;
}) {
  const statusMap = new Map(byStatus.map((s) => [s.status, s.count]));
  const maxCount = Math.max(...byStatus.map((s) => s.count), 1);

  const sorted = STATUS_ORDER.filter((s) => statusMap.has(s)).map((s) => ({
    status: s,
    count: statusMap.get(s) || 0,
  }));

  return (
    <div className="card-surface p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800">
          Application Funnel
        </h3>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <span>
            <span className="font-medium text-neutral-800">{total}</span> total
          </span>
          {avgScore !== null && (
            <span>
              <span className="font-medium text-neutral-800">{avgScore}</span>{" "}
              avg score
            </span>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-4">
          No applications yet.
        </p>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((item) => (
            <div key={item.status} className="flex items-center gap-3">
              <span className="text-xs text-neutral-500 w-20 text-right shrink-0">
                {item.status}
              </span>
              <div className="flex-1 h-5 bg-neutral-50 rounded overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${STATUS_COLORS[item.status] || "bg-neutral-300"}`}
                  style={{
                    width: `${Math.max((item.count / maxCount) * 100, 4)}%`,
                  }}
                />
              </div>
              <span className="text-xs font-medium text-neutral-800 w-8">
                {item.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
