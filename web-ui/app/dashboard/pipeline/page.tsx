import { getPipeline } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Metadata } from "next"
import { PipelineActions } from "./pipeline-actions"

export const metadata: Metadata = { title: "Pipeline — career-ops" }

const PAGE_SIZE = 50

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const { q, page: pageParam } = await searchParams
  const query = q?.toLowerCase().trim() ?? ""
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1)

  const items = await getPipeline()
  const pending = items.filter(i => !i.done)
  const done = items.filter(i => i.done)

  const filtered = query
    ? pending.filter(i =>
        i.company.toLowerCase().includes(query) ||
        i.role.toLowerCase().includes(query) ||
        i.url.toLowerCase().includes(query)
      )
    : pending

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageEnd = pageStart + PAGE_SIZE
  const paginated = filtered.slice(pageStart, pageEnd)

  const sections = [...new Set(paginated.map(i => i.section))]

  function pageHref(p: number) {
    const params = new URLSearchParams()
    if (query) params.set("q", q!)
    if (p > 1) params.set("page", String(p))
    const qs = params.toString()
    return `/dashboard/pipeline${qs ? `?${qs}` : ""}`
  }

  function platformBadge(url: string) {
    if (url.includes("greenhouse.io")) return "Greenhouse"
    if (url.includes("ashbyhq.com")) return "Ashby"
    if (url.includes("lever.co")) return "Lever"
    if (url.includes("linkedin.com")) return "LinkedIn"
    if (url.includes("workday.com")) return "Workday"
    return "Job Board"
  }

  function platformColor(platform: string) {
    const map: Record<string, string> = {
      Greenhouse: "bg-green-100 text-green-800",
      Ashby: "bg-blue-100 text-blue-800",
      Lever: "bg-purple-100 text-purple-800",
      LinkedIn: "bg-sky-100 text-sky-800",
      Workday: "bg-orange-100 text-orange-800",
    }
    return map[platform] ?? "bg-gray-100 text-gray-600"
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline Inbox</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {pending.length} pending · {done.length} done
            {query
              ? ` · ${filtered.length} matching "${q}"`
              : totalPages > 1
              ? ` · showing ${pageStart + 1}–${Math.min(pageEnd, filtered.length)}`
              : ""}
          </p>
        </div>
      </div>

      {/* Search */}
      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by company, role, or URL…"
          className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {query && (
          <a href="/dashboard/pipeline" className="h-9 px-3 py-1 text-sm rounded-md border flex items-center text-muted-foreground hover:bg-muted">
            Clear
          </a>
        )}
      </form>

      {paginated.length === 0 && pending.length > 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <p className="text-2xl">🔍</p>
          <p className="font-medium">No results for &ldquo;{q}&rdquo;</p>
        </div>
      ) : pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <p className="text-2xl">📬</p>
          <p className="font-medium">Pipeline is empty</p>
          <p className="text-sm">Add job URLs to <code className="bg-muted px-1 rounded">data/pipeline.md</code></p>
        </div>
      ) : (
        <>
          {sections.map(section => (
            <div key={section} className="flex flex-col gap-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-mono">
                {section === "Pendientes" || section === "PENDIENTES" ? "Pending" : section}
              </p>
              {paginated.filter(i => i.section === section).map((item, idx) => {
                const platform = platformBadge(item.url)
                return (
                  <Card key={idx} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="size-2 rounded-full bg-orange-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            {item.company && <span className="font-semibold text-sm">{item.company}</span>}
                            {item.role && <span className="text-sm text-muted-foreground truncate">{item.role}</span>}
                            <Badge className={`text-[10px] shrink-0 ${platformColor(platform)}`} variant="secondary">{platform}</Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground font-mono truncate">{item.url}</p>
                        </div>
                        <PipelineActions url={item.url} />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Page {currentPage} of {totalPages} · {filtered.length} total
              </span>
              <div className="flex gap-1">
                {currentPage > 1 && (
                  <a
                    href={pageHref(currentPage - 1)}
                    className="h-8 px-3 text-sm rounded-md border flex items-center hover:bg-muted"
                  >
                    ← Prev
                  </a>
                )}
                {currentPage < totalPages && (
                  <a
                    href={pageHref(currentPage + 1)}
                    className="h-8 px-3 text-sm rounded-md border flex items-center hover:bg-muted"
                  >
                    Next →
                  </a>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {done.length > 0 && (
        <div className="flex flex-col gap-2 mt-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground font-mono">Done ({done.length})</p>
          {done.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3 rounded-lg border px-3 py-2 opacity-50">
              <span className="text-green-700 text-sm">✓</span>
              <span className="text-sm truncate flex-1">{item.company && item.role ? `${item.company} — ${item.role}` : item.url}</span>
              <PipelineActions url={item.url} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
