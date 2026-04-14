import type { ScoreBucket } from "@/lib/db/queries/analytics";

const BUCKET_COLORS: Record<string, string> = {
  "0-2": "bg-red-400",
  "2-3": "bg-amber-400",
  "3-4": "bg-amber-300",
  "4-5": "bg-emerald-400",
};

const BUCKET_ORDER = ["0-2", "2-3", "3-4", "4-5"];

export function ScoreDistribution({ buckets }: { buckets: ScoreBucket[] }) {
  const bucketMap = new Map(buckets.map((b) => [b.bucket, b.count]));
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div className="card-surface p-5 space-y-4">
      <h3 className="text-sm font-semibold text-neutral-800">
        Score Distribution
      </h3>

      {buckets.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-4">
          No scored applications yet.
        </p>
      ) : (
        <div className="space-y-2.5">
          {BUCKET_ORDER.map((bucket) => {
            const count = bucketMap.get(bucket) || 0;
            return (
              <div key={bucket} className="flex items-center gap-3">
                <span className="text-xs text-neutral-500 w-10 text-right shrink-0">
                  {bucket}
                </span>
                <div className="flex-1 h-5 bg-neutral-50 rounded overflow-hidden">
                  <div
                    className={`h-full rounded transition-all ${BUCKET_COLORS[bucket]}`}
                    style={{
                      width: count > 0
                        ? `${Math.max((count / maxCount) * 100, 4)}%`
                        : "0%",
                    }}
                  />
                </div>
                <span className="text-xs font-medium text-neutral-800 w-8">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
