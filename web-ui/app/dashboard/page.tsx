import { SectionCards } from "@/components/section-cards"
import { getApplications, getProfile, STATUS_LABELS, STATUS_COLORS, scoreVariant } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { Metadata } from "next"

export const metadata: Metadata = { title: "Dashboard — career-ops" }

function daysSince(dateStr: string): number {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

export default async function Page() {
  const [apps, profile] = await Promise.all([getApplications(), getProfile()])

  const name = profile?.candidate?.full_name?.split(" ")[0] ?? "there"
  const roles = profile?.target_roles?.primary?.slice(0, 2).join(" · ") ?? ""

  const recent = [...apps].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
  const toActOn = apps
    .filter(a => ["evaluated", "applied", "responded", "interview"].includes(a.status))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  // Momentum stats
  const oldest = apps.length ? [...apps].sort((a, b) => a.date.localeCompare(b.date))[0].date : null
  const daysSearching = oldest ? daysSince(oldest) : 0
  const lastWeek = apps.filter(a => daysSince(a.date) <= 7).length
  const awaitingResponse = apps.filter(a => ["applied", "responded"].includes(a.status)).length
  const overdueFollowups = apps.filter(a => a.status === "applied" && daysSince(a.date) > 7).length

  // Next actions — derived, priority-ordered
  type NextAction = { priority: "high" | "med"; text: string; href: string; urgent?: boolean }
  const nextActions: NextAction[] = []

  const highScoreEvaluated = apps.filter(a => a.status === "evaluated" && a.score >= 4.0)
  if (highScoreEvaluated.length > 0) {
    nextActions.push({
      priority: "high",
      text: `${highScoreEvaluated.length} high-score job${highScoreEvaluated.length > 1 ? "s" : ""} evaluated — ready to apply`,
      href: "/dashboard/tracker?tab=evaluated",
      urgent: true,
    })
  }

  if (overdueFollowups > 0) {
    nextActions.push({
      priority: "high",
      text: `${overdueFollowups} applied job${overdueFollowups > 1 ? "s" : ""} with no response in 7+ days`,
      href: "/dashboard/followups",
      urgent: true,
    })
  }

  const respondedApps = apps.filter(a => a.status === "responded")
  if (respondedApps.length > 0) {
    nextActions.push({
      priority: "high",
      text: `${respondedApps.length} company${respondedApps.length > 1 ? " has" : " has"} responded — follow up`,
      href: "/dashboard/tracker?tab=responded",
    })
  }

  const interviewApps = apps.filter(a => a.status === "interview")
  if (interviewApps.length > 0) {
    nextActions.push({
      priority: "high",
      text: `${interviewApps.length} active interview${interviewApps.length > 1 ? "s" : ""} in progress — prep now`,
      href: "/dashboard/interview",
    })
  }

  if (nextActions.length === 0) {
    nextActions.push({
      priority: "med",
      text: "Evaluate a new job to get started",
      href: "/dashboard/evaluate",
    })
  }

  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome, {name}</h1>
          {roles && <p className="text-muted-foreground text-sm mt-1">Targeting: {roles}</p>}
          {daysSearching > 0 && (
            <p className="text-muted-foreground text-xs mt-0.5">
              Day {daysSearching} of your search · {lastWeek} application{lastWeek !== 1 ? "s" : ""} this week
              {awaitingResponse > 0 ? ` · ${awaitingResponse} awaiting response` : ""}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/dashboard/tracker" className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium">View Tracker</Link>
          <Link href="/dashboard/pipeline" className="text-sm px-3 py-1.5 rounded-md border font-medium">Pipeline Inbox</Link>
        </div>
      </div>

      {/* Evaluate quick-entry */}
      <Link
        href="/dashboard/evaluate"
        className="flex items-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 px-4 py-3 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
      >
        <span className="text-lg">🔍</span>
        <span>Paste a job URL to evaluate it →&nbsp;<span className="font-medium text-foreground">Evaluate a Job</span></span>
      </Link>

      <SectionCards />

      {/* Next actions */}
      {nextActions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your next actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {nextActions.map((a, i) => (
              <Link
                key={i}
                href={a.href}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted transition-colors ${a.urgent ? "border-orange-300 bg-orange-50/50" : ""}`}
              >
                <span className={`size-2 rounded-full shrink-0 ${a.priority === "high" ? (a.urgent ? "bg-orange-500" : "bg-blue-500") : "bg-muted-foreground"}`} />
                <span className="flex-1">{a.text}</span>
                <span className="text-muted-foreground text-xs shrink-0">→</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Best to act on</CardTitle></CardHeader>
          <CardContent>
            {toActOn.length === 0 ? (
              <p className="text-muted-foreground text-sm py-6 text-center">No applications yet. Start evaluating jobs!</p>
            ) : (
              <div className="flex flex-col gap-3">
                {toActOn.map(app => (
                  <div key={app.number} className={`flex items-center gap-3 rounded-lg border p-3 ${app.status === "evaluated" && app.score >= 4.0 ? "border-orange-200 bg-orange-50/30" : ""}`}>
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold uppercase">
                      {app.company.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{app.role}</p>
                      <p className="text-xs text-muted-foreground">{app.company} · {daysSince(app.date)}d ago</p>
                      {app.recommendation && (
                        <p className="text-xs text-muted-foreground italic mt-0.5 truncate">{app.recommendation}</p>
                      )}
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
                {recent.map((app, idx) => (
                  <div key={app.number} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm truncate flex-1">{app.company}</span>
                      <Badge className={`${STATUS_COLORS[app.status]} text-[10px] px-1.5`} variant="secondary">{STATUS_LABELS[app.status]}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{app.role}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{daysSince(app.date) === 0 ? "Today" : `${daysSince(app.date)}d ago`}</p>
                    {idx !== recent.length - 1 && <div className="border-t mt-1" />}
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
