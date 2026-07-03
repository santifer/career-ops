import { cn } from "@/lib/cn";

import { CORNERS } from "@/lib/ui-corners";

export function Card({
  className,
  corner,
  elevated,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  corner?: keyof typeof CORNERS;
  elevated?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-surface/50 p-5",
        corner && `${CORNERS[corner]} from-brand/10 via-transparent to-transparent bg-origin-border`,
        elevated && "shadow-lg",
        className,
      )}
      {...props}
    />
  );
}
