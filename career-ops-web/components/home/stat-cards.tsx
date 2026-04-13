import {
  BriefcaseIcon,
  ChatBubbleLeftRightIcon,
  ChartBarIcon,
  InboxStackIcon,
} from "@heroicons/react/24/outline";

interface StatCardsProps {
  total: number;
  interviews: number;
  avgScore: string | null;
  pipeline: number;
}

const cards = [
  { key: "total" as const, label: "Applications", icon: BriefcaseIcon },
  {
    key: "interviews" as const,
    label: "Interviews",
    icon: ChatBubbleLeftRightIcon,
  },
  { key: "avgScore" as const, label: "Avg Score", icon: ChartBarIcon },
  { key: "pipeline" as const, label: "Pipeline", icon: InboxStackIcon },
];

export function StatCards({
  total,
  interviews,
  avgScore,
  pipeline,
}: StatCardsProps) {
  const values: Record<string, string | number> = {
    total,
    interviews,
    avgScore: avgScore ?? "\u2014",
    pipeline,
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.key} className="card-surface p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              {card.label}
            </span>
            <card.icon className="h-4 w-4 text-neutral-400" />
          </div>
          <p className="text-2xl font-semibold text-neutral-800">
            {values[card.key]}
          </p>
        </div>
      ))}
    </div>
  );
}
