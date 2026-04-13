import Link from "next/link";

interface AttentionItem {
  type: "urgent" | "warning" | "info";
  message: string;
  link: string;
}

interface NeedsAttentionProps {
  overdueFollowUps: number;
  pipeline: number;
}

export function NeedsAttention({
  overdueFollowUps,
  pipeline,
}: NeedsAttentionProps) {
  const items: AttentionItem[] = [];

  if (overdueFollowUps > 0) {
    items.push({
      type: "urgent",
      message: `${overdueFollowUps} follow-up${overdueFollowUps > 1 ? "s" : ""} overdue`,
      link: "/follow-ups",
    });
  }

  if (pipeline > 0) {
    items.push({
      type: "warning",
      message: `${pipeline} offer${pipeline > 1 ? "s" : ""} in pipeline, ready to evaluate`,
      link: "/pipeline",
    });
  }

  if (items.length === 0) {
    items.push({
      type: "info",
      message: "All caught up. Paste a job URL in Chat to evaluate it.",
      link: "/chat",
    });
  }

  const dotColor = {
    urgent: "bg-red-500",
    warning: "bg-amber-400",
    info: "bg-blue-400",
  };

  return (
    <div className="card-surface p-5">
      <h3 className="text-sm font-medium text-neutral-800 mb-4">
        Needs Attention
      </h3>
      <div className="space-y-3">
        {items.map((item, i) => (
          <Link
            key={i}
            href={item.link}
            className="flex items-start gap-3 group"
          >
            <div
              className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${dotColor[item.type]}`}
            />
            <span className="text-sm text-neutral-600 group-hover:text-neutral-800 transition-colors">
              {item.message}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
