import { SectionCards } from "@/components/section-cards"
import { getApplications, getProfile, STATUS_LABELS, STATUS_COLORS, scoreVariant } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { Metadata } from "next"

export const metadata: Metadata = { title: "Dashboard — career-ops" }

export default async function Page() {
  const [apps, profile] = await Promise.all([getApplications(), getProfile()])

  const name = profile?.candidate?.full_name?.split(" ")[0] ?? "there"
  const roles = profile?.target_roles?.primary?.slice(0, 2).join(" · ") ?? ""

  const recent = [...apps].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
  const toActOn = apps
    .filter(a => ["evaluated", "applied", "responded", "interview"].includes(a.status))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome, {name}</h1>
          {roles && <p className="text-muted-foreground text-sm mt-1">Targeting: {roles}</p>}
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/tracker" className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium">View Tracker</Link>
          <Link href="/dashboard/pipeline" className="text-sm px-3 py-1.5 rounded-md border font-medium">Pipeline Inbox</Link>
        </div>
      </div>

      <SectionCards />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Best to act on</CardTitle></CardHeader>
          <CardContent>
            {toActOn.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center">No applications yet. Start evaluating jobs!</p>
            ) : (
              <div className="flex flex-col gap-3">
                {toActOn.map(app => (
                  <div key={app.number} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold uppercase">
                      {app.company.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{app.role}</p>
                      <p className="text-xs text-muted-foreground">{app.company} · {app.date}</p>
                    </div>
                    <Badge className={scoreVariant(app.score)} variant="secondary">{app.score.toFixed(1)}</Badge>
                    <Badge className={STATUS_COLORS[app.status]} variant="secondary">{STATUS_LABELS[app.status]}</Badge>
                    {app.jobURL && <a href={app.jobURL} target="_blank" rel="noreferrer" className="text-xs text-blue-600 shrink-0">↗</a>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-muted-foreground text-sm">No applications yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {recent.map(app => (
                  <div key={app.number} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm truncate flex-1">{app.company}</span>
                      <Badge className={`${STATUS_COLORS[app.status]} text-[10px] px-1.5`} variant="secondary">{STATUS_LABELS[app.status]}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{app.role}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{app.date}</p>
                    {app !== recent[recent.length - 1] && <div className="border-t mt-1" />}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
