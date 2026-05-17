import { getApplications, ALL_STATUSES, STATUS_LABELS, type CanonicalStatus } from "@/lib/api"
import { Metadata } from "next"
import Link from "next/link"
import { TrackerCard } from "./tracker-client"

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
          {!query && activeTab === "evaluated" && (
            <p className="text-sm">
              Evaluate a job on the{" "}
              <Link href="/dashboard/evaluate" className="text-blue-600 hover:underline">Evaluate page</Link>{" "}
              to see it here.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(app => (
            <TrackerCard key={app.number} app={app} />
          ))}
        </div>
      )}
    </>
  )
}
