export function scoreColor(score: number | string | null): string {
  const n = typeof score === "string" ? parseFloat(score) : score;
  if (n === null || n === undefined || isNaN(n)) return "text-neutral-400";
  if (n >= 4.5) return "text-emerald-600";
  if (n >= 4.0) return "text-emerald-500";
  if (n >= 3.5) return "text-amber-500";
  return "text-red-500";
}

export function scoreBgColor(score: number | string | null): string {
  const n = typeof score === "string" ? parseFloat(score) : score;
  if (n === null || n === undefined || isNaN(n)) return "bg-neutral-100";
  if (n >= 4.5) return "bg-emerald-50";
  if (n >= 4.0) return "bg-emerald-50";
  if (n >= 3.5) return "bg-amber-50";
  return "bg-red-50";
}

export function scoreLabel(score: number | string | null): string {
  const n = typeof score === "string" ? parseFloat(score) : score;
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (n >= 4.5) return "Strong match";
  if (n >= 4.0) return "Good match";
  if (n >= 3.5) return "Decent";
  return "Weak fit";
}

export function statusColor(status: string): string {
  switch (status) {
    case "Offer":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Interview":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "Applied":
    case "Responded":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "Evaluated":
      return "bg-neutral-100 text-neutral-700 border-neutral-200";
    case "Rejected":
      return "bg-red-50 text-red-600 border-red-200";
    case "Discarded":
    case "SKIP":
      return "bg-neutral-50 text-neutral-400 border-neutral-200";
    default:
      return "bg-neutral-100 text-neutral-600 border-neutral-200";
  }
}
