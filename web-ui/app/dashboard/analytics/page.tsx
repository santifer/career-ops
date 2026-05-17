import { getApplications, ALL_STATUSES, STATUS_LABELS } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Metadata } from "next"

export const metadata: Metadata = { title: "Analytics — career-ops" }

export default async function AnalyticsPage() {
  const apps = await getApplications()

  const byStatus = ALL_STATUSES.map(s => ({
    status: STATUS_LABELS[s],
    count: apps.filter(a => a.status === s).length,
  })).filter(s => s.count > 0)

  const byCompany = Object.entries(
    apps.reduce((acc, a) => { acc[a.company] = (acc[a.company] || 0) + 1; return acc }, {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1]).slice(0, 10)

  const scoreGroups = [
    { label: "Excellent (4.5+)", count: apps.filter(a => a.score >= 4.5).length },
    { label: "Strong (4.0–4.4)", count: apps.filter(a => a.score >= 4.0 && a.score < 4.5).length },
    { label: "Good (3.5–3.9)",   count: apps.filter(a => a.score >= 3.5 && a.score < 4.0).length },
    { label: "Fair (3.0–3.4)",   count: apps.filter(a => a.score >= 3.0 && a.score < 3.5).length },
    { label: "Low (<3.0)",        count: apps.filter(a => a.score > 0 && a.score < 3.0).length },
  ].filter(g => g.count > 0)

  const maxCount = Math.max(...byCompany.map(([, c]) => c), 1)

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">Patterns across {apps.length} applications</p>
      </div>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">By Status</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {byStatus.map(s => (
              <div key={s.status} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{s.status}</span>
                <span className="font-mono font-semibold">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">By Score Range</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {scoreGroups.map(g => (
              <div key={g.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{g.label}</span>
                <span className="font-mono font-semibold">{g.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="@xl/main:col-span-1">
          <CardHeader><CardTitle className="text-base">Top Companies</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {byCompany.map(([company, count]) => (
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
