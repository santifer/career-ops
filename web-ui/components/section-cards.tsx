import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"
import { Card, CardContent } from "@/components/ui/card"
import { getApplications } from "@/lib/api"

export async function SectionCards() {
  const apps = await getApplications()

  const total = apps.length
  const inProgress = apps.filter(a => ["applied","responded","interview"].includes(a.status)).length
  const offers = apps.filter(a => a.status === "offer").length
  const scoredApps = apps.filter(a => a.score > 0)
  const avgScore = scoredApps.length > 0 ? (scoredApps.reduce((s, a) => s + a.score, 0) / scoredApps.length).toFixed(1) : "—"
  const evaluated = apps.filter(a => a.status === "evaluated").length

  const stats = [
    {
      label: "Total Applications",
      value: total,
      sub: `${evaluated} evaluated`,
      trend: "up" as const,
      note: "across all companies",
    },
    {
      label: "In Progress",
      value: inProgress,
      sub: "Applied + Responded + Interview",
      trend: (inProgress > 0 ? "up" : "down") as "up" | "down",
      note: "awaiting response",
    },
    {
      label: "Offers Received",
      value: offers,
      sub: offers > 0 ? "Congratulations!" : "None yet",
      trend: (offers > 0 ? "up" : "down") as "up" | "down",
      note: `from ${scoredApps.length} scored roles`,
    },
    {
      label: "Avg Score",
      value: avgScore,
      suffix: "/5",
      sub: "Targeting fit score",
      trend: "up" as const,
      note: "across all evaluated roles",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {stats.map(stat => (
        <Card key={stat.label}>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
            <p className="text-3xl font-bold tabular-nums tracking-tight">
              {stat.value}
              {stat.suffix && <span className="text-lg font-normal text-muted-foreground">{stat.suffix}</span>}
            </p>
            <div className="mt-3 flex items-center gap-1 text-sm font-medium">
              {stat.trend === "up"
                ? <IconTrendingUp className="size-4 text-green-600 shrink-0" />
                : <IconTrendingDown className="size-4 text-red-500 shrink-0" />}
              <span className="truncate">{stat.sub}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{stat.note}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
