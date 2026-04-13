interface FunnelChartProps {
  funnel: {
    evaluated: number;
    applied: number;
    responded: number;
    interview: number;
    offer: number;
  };
}

const stages = [
  { key: "evaluated" as const, label: "Evaluated", color: "bg-neutral-400" },
  { key: "applied" as const, label: "Applied", color: "bg-violet-400" },
  { key: "responded" as const, label: "Responded", color: "bg-blue-400" },
  { key: "interview" as const, label: "Interview", color: "bg-blue-500" },
  { key: "offer" as const, label: "Offer", color: "bg-emerald-500" },
];

export function FunnelChart({ funnel }: FunnelChartProps) {
  const max = Math.max(...Object.values(funnel), 1);

  return (
    <div className="card-surface p-5">
      <h3 className="text-sm font-medium text-neutral-800 mb-4">Funnel</h3>
      <div className="space-y-3">
        {stages.map((stage) => {
          const value = funnel[stage.key];
          const width = max > 0 ? (value / max) * 100 : 0;

          return (
            <div key={stage.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-neutral-500">{stage.label}</span>
                <span className="text-xs font-medium text-neutral-700">
                  {value}
                </span>
              </div>
              <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${stage.color} transition-all duration-500`}
                  style={{
                    width: `${Math.max(width, value > 0 ? 4 : 0)}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
