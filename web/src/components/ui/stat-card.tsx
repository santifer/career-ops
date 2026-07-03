import Link from "next/link";
import { instrumentSerif } from "@/lib/fonts";
import { cn } from "@/lib/cn";
import { CORNERS } from "@/lib/ui-corners";

export function StatCard({
  href,
  icon: Icon,
  value,
  label,
  hint,
  featured = false,
  corner = "br",
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  value: number | string;
  label: string;
  hint: string;
  featured?: boolean;
  corner?: keyof typeof CORNERS;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-surface/50 bg-origin-border p-5 shadow-lg transition-colors",
        CORNERS[corner],
        "from-brand/10 via-transparent to-transparent",
        "hover:border-brand/40 hover:bg-surface-hover group-hover:from-brand/20",
      )}
    >
      <Icon className="size-5 text-brand" />
      <div
        className={cn(
          "mt-3 text-4xl leading-none tabular-nums",
          featured ? instrumentSerif.className : "font-semibold",
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-sm text-foreground">{label}</div>
      <div className="text-xs text-faint">{hint}</div>
    </Link>
  );
}
