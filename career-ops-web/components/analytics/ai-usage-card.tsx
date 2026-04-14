import type { AiUsageStats } from "@/lib/db/queries/analytics";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function AiUsageCard({ usage }: { usage: AiUsageStats }) {
  const totalTokens = usage.totalInputTokens + usage.totalOutputTokens;

  return (
    <div className="card-surface p-5 space-y-4">
      <h3 className="text-sm font-semibold text-neutral-800">AI Usage</h3>

      {totalTokens === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-4">
          No AI usage yet.
        </p>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-neutral-500">Total Tokens</p>
              <p className="text-lg font-semibold text-neutral-800">
                {formatNumber(totalTokens)}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Total Cost</p>
              <p className="text-lg font-semibold text-neutral-800">
                ${usage.totalCost.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Actions</p>
              <p className="text-lg font-semibold text-neutral-800">
                {usage.byActionType.reduce((sum, a) => sum + a.count, 0)}
              </p>
            </div>
          </div>

          {/* By action type */}
          {usage.byActionType.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-neutral-100">
              <p className="text-xs text-neutral-500 font-medium">
                By Action Type
              </p>
              {usage.byActionType.map((a) => (
                <div
                  key={a.actionType}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-neutral-700">{a.actionType}</span>
                  <span className="text-neutral-500">
                    {a.count}× · {formatNumber(a.totalTokens)} tokens ·
                    ${Number(a.totalCost).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
