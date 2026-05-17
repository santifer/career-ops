import { getApplications, ALL_STATUSES, STATUS_LABELS, STATUS_COLORS, scoreVariant, type CanonicalStatus } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = { title: "Tracker — career-ops" }

export default async function TrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>
}) {
  const { tab, q } = await searchParams
  const activeTab = (tab as CanonicalStatus) || "evaluated"
  const query = q?.toLowerCase().trim() ?? ""
  const apps = await getApplications()

  const countByStatus = (s: CanonicalStatus) => apps.filter(a => a.status === s).length
  const tabApps = apps.filter(a => a.status === activeTab)
  const filtered = query
    ? tabApps.filter(a =>
        a.company.toLowerCase().includes(query) ||
        a.role.toLowerCase().includes(query) ||
        a.notes.toLowerCase().includes(query)
      )
    : tabApps

  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Applications Tracker</h1>
          <p className="text-muted-foreground text-sm mt-1">{apps.length} total application{apps.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 overflow-x-auto border-b pb-px">
        {ALL_STATUSES.map(s => {
          const count = countByStatus(s)
          const isActive = s === activeTab
          return (
            <Link
              key={s}
              href={`/dashboard/tracker?tab=${s}`}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {STATUS_LABELS[s]}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${isActive ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
                {count}
              </span>
            </Link>
          )
        })}
      </div>

      {/* Search within tab */}
      {tabApps.length > 3 && (
        <form method="GET" className="flex gap-2">
          <input type="hidden" name="tab" value={activeTab} />
          <input
            name="q"
            defaultValue={q}
            placeholder={`Search ${STATUS_LABELS[activeTab].toLowerCase()} applications…`}
            className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {query && (
            <a href={`/dashboard/tracker?tab=${activeTab}`} className="h-9 px-3 py-1 text-sm rounded-md border flex items-center text-muted-foreground hover:bg-muted">
              Clear
            </a>
          )}
        </form>
      )}

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <p className="text-2xl">📭</p>
          <p className="font-medium">
            {query ? `No results for "${q}"` : `No ${STATUS_LABELS[activeTab].toLowerCase()} applications`}
          </p>
          {!query && <p className="text-sm">Evaluate a job with career-ops to see it here.</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(app => (
            <Card key={app.number} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold uppercase">
                    {app.company.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold text-sm leading-tight">{app.role}</p>
                      <Badge className={`${scoreVariant(app.score)} font-mono`} variant="secondary">{app.score.toFixed(1)}/5</Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-sm font-medium">{app.company}</span>
                      <span className="text-xs text-muted-foreground font-mono">{app.date}</span>
                      <Badge className={STATUS_COLORS[app.status]} variant="secondary">{STATUS_LABELS[app.status]}</Badge>
                      {app.hasPDF && <span className="text-xs text-green-700">✅ PDF</span>}
                      {app.remote && <span className="text-xs text-muted-foreground">📍 {app.remote}</span>}
                    </div>
                    {app.tldr && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{app.tldr}</p>}
                    {!app.tldr && app.notes && <p className="text-xs text-muted-foreground truncate mb-2">{app.notes}</p>}
                    <div className="flex items-center gap-3 flex-wrap">
                      {app.jobURL && (
                        <a href={app.jobURL} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline font-mono">
                          ↗ View job
                        </a>
                      )}
                      {app.reportNumber && (
                        <span className="text-xs text-muted-foreground font-mono">Report #{app.reportNumber}</span>
                      )}
                      {app.compEstimate && (
                        <span className="text-xs text-muted-foreground">💰 {app.compEstimate}</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
