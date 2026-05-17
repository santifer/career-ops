import { getApplications, ALL_STATUSES, STATUS_LABELS } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Metadata } from "next"

export const metadata: Metadata = { title: "Analytics — career-ops" }

function weekNumber(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return "unknown"
  const start = new Date(d)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  return start.toISOString().slice(0, 10)
}

export default async function AnalyticsPage() {
  const apps = await getApplications()

  const byStatus = ALL_STATUSES.map(s => ({
    status: STATUS_LABELS[s],
    slug: s,
    count: apps.filter(a => a.status === s).length,
  })).filter(s => s.count > 0)

  const byCompany = Object.entries(
    apps.reduce((acc, a) => { acc[a.company] = (acc[a.company] || 0) + 1; return acc }, {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1]).slice(0, 10)

  const scoreGroups = [
    { label: "Excellent (4.5+)", count: apps.filter(a => a.score >= 4.5).length, color: "bg-green-500" },
    { label: "Strong (4.0–4.4)", count: apps.filter(a => a.score >= 4.0 && a.score < 4.5).length, color: "bg-lime-500" },
    { label: "Good (3.5–3.9)",   count: apps.filter(a => a.score >= 3.5 && a.score < 4.0).length, color: "bg-yellow-500" },
    { label: "Fair (3.0–3.4)",   count: apps.filter(a => a.score >= 3.0 && a.score < 3.5).length, color: "bg-orange-500" },
    { label: "Low (<3.0)",        count: apps.filter(a => a.score > 0 && a.score < 3.0).length, color: "bg-red-500" },
  ].filter(g => g.count > 0)

  const maxCount = Math.max(...byCompany.map(([, c]) => c), 1)
  const totalScored = scoreGroups.reduce((s, g) => s + g.count, 0)

  // Conversion funnel — pipeline stages ordered by depth
  const funnelStages = [
    { label: "Evaluated", count: apps.filter(a => ["evaluated","applied","responded","interview","offer"].includes(a.status)).length },
    { label: "Applied", count: apps.filter(a => ["applied","responded","interview","offer"].includes(a.status)).length },
    { label: "Responded", count: apps.filter(a => ["responded","interview","offer"].includes(a.status)).length },
    { label: "Interview", count: apps.filter(a => ["interview","offer"].includes(a.status)).length },
    { label: "Offer", count: apps.filter(a => a.status === "offer").length },
  ]
  const funnelMax = funnelStages[0]?.count || 1

  // Weekly cadence (last 8 weeks)
  const weeklyMap: Record<string, number> = {}
  for (const app of apps) {
    const wk = weekNumber(app.date)
    weeklyMap[wk] = (weeklyMap[wk] || 0) + 1
  }
  const last8Weeks = [...Array(8)].map((_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay() - i * 7)
    const wk = d.toISOString().slice(0, 10)
    return { wk, count: weeklyMap[wk] || 0 }
  }).reverse()
  const sparkMax = Math.max(...last8Weeks.map(w => w.count), 1)

  // Actionable insight
  let insight = ""
  const applied = apps.filter(a => a.status === "applied").length
  const responded = apps.filter(a => a.status === "responded").length
  const interviews = apps.filter(a => a.status === "interview").length
  const highScoreEval = apps.filter(a => a.status === "evaluated" && a.score >= 4.0).length

  if (highScoreEval > 0) {
    insight = `${highScoreEval} high-score job${highScoreEval > 1 ? "s are" : " is"} evaluated but not yet applied. Apply now to keep momentum.`
  } else if (applied > 0 && responded === 0) {
    insight = `${applied} application${applied > 1 ? "s" : ""} sent with no responses yet. Consider following up on any sent 7+ days ago.`
  } else if (responded > 0 && interviews === 0) {
    insight = `${responded} compan${responded > 1 ? "ies have" : "y has"} responded. Move quickly — schedule interviews while interest is hot.`
  } else if (interviews > 0) {
    insight = `${interviews} active interview${interviews > 1 ? "s" : ""} in progress. Check Interview Prep to sharpen your stories.`
  } else if (apps.length === 0) {
    insight = "No applications yet. Start by evaluating a job posting."
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">Patterns across {apps.length} application{apps.length !== 1 ? "s" : ""}</p>
      </div>

      {insight && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3 text-sm">
          <span className="font-semibold text-blue-900">Insight: </span>
          <span className="text-blue-800">{insight}</span>
        </div>
      )}

      {/* Conversion funnel */}
      <Card>
        <CardHeader><CardTitle className="text-base">Conversion Funnel</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {funnelStages.map((stage, i) => {
            const pct = funnelMax > 0 ? Math.round((stage.count / funnelStages[0].count) * 100) : 0
            const convPct = i > 0 && funnelStages[i - 1].count > 0
              ? Math.round((stage.count / funnelStages[i - 1].count) * 100)
              : null
            return (
              <div key={stage.label} className="flex items-center gap-3">
                <a
                  href={`/dashboard/tracker?tab=${stage.label.toLowerCase()}`}
                  className="text-xs text-muted-foreground w-20 shrink-0 hover:text-foreground hover:underline"
                >
                  {stage.label}
                </a>
                <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(stage.count / funnelMax) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-xs font-semibold w-6 text-right shrink-0">{stage.count}</span>
                {convPct !== null && (
                  <span className="text-[10px] text-muted-foreground w-12 shrink-0">
                    {convPct}% conv.
                  </span>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-3">
        {/* Weekly cadence sparkline */}
        <Card>
          <CardHeader><CardTitle className="text-base">Weekly Applications</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-16">
              {last8Weeks.map((w, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className="w-full rounded-t bg-primary/70 transition-all"
                    style={{ height: `${sparkMax > 0 ? Math.max((w.count / sparkMax) * 52, w.count > 0 ? 4 : 0) : 0}px` }}
                    title={`${w.wk}: ${w.count}`}
                  />
                  {i === last8Weeks.length - 1 && (
                    <span className="text-[9px] text-muted-foreground">now</span>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Last 8 weeks</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">By Score Range</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {scoreGroups.map(g => (
              <div key={g.label} className="flex items-center gap-2">
                <div className="flex-1 flex flex-col gap-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{g.label}</span>
                    <span className="font-mono font-semibold">{g.count}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${g.color} rounded-full`} style={{ width: `${totalScored > 0 ? (g.count / totalScored) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top Companies</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {byCompany.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : byCompany.map(([company, count]) => (
              <div key={company} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{company}</span>
                  <span className="font-mono text-xs text-muted-foreground">{count}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
