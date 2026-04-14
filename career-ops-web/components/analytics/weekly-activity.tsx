import type { WeeklyPoint } from "@/lib/db/queries/analytics";

export function WeeklyActivity({ weeks }: { weeks: WeeklyPoint[] }) {
  const maxCount = Math.max(...weeks.map((w) => w.count), 1);

  return (
    <div className="card-surface p-5 space-y-4">
      <h3 className="text-sm font-semibold text-neutral-800">
        Weekly Activity
      </h3>

      {weeks.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-4">
          No weekly data yet.
        </p>
      ) : (
        <div className="flex items-end gap-2 h-32">
          {weeks.map((week) => (
            <div
              key={week.week}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className="text-xs font-medium text-neutral-800">
                {week.count}
              </span>
              <div className="w-full bg-neutral-50 rounded-t overflow-hidden relative" style={{ height: "100px" }}>
                <div
                  className="absolute bottom-0 w-full bg-neutral-400 rounded-t transition-all"
                  style={{
                    height: `${Math.max((week.count / maxCount) * 100, 4)}%`,
                  }}
                />
              </div>
              <span className="text-[10px] text-neutral-400 truncate max-w-full">
                {new Date(week.week).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
