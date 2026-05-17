"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { STATUS_LABELS, STATUS_COLORS, ALL_STATUSES, scoreVariant, type Application, type CanonicalStatus } from "@/lib/api"
import { marked } from "marked"

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3099"

function StatusSelect({ app }: { app: Application }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const status = e.target.value as CanonicalStatus
    setSaving(true)
    try {
      await fetch(`${BASE}/api/applications/${app.number}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <select
      value={app.status}
      onChange={onChange}
      disabled={saving}
      className="text-xs border rounded px-1.5 py-1 bg-background cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
    >
      {ALL_STATUSES.map(s => (
        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
      ))}
    </select>
  )
}

function ReportDrawer({ app, open, onClose }: { app: Application; open: boolean; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    if (!open || !app.reportNumber) return
    setLoading(true)
    setFetchError(false)
    fetch(`${BASE}/api/report/${app.reportNumber}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setContent(d.content))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false))
  }, [open, app.reportNumber])

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-2xl bg-background shadow-2xl flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <p className="font-semibold text-base">{app.company} — {app.role}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={scoreVariant(app.score)} variant="secondary">{app.score.toFixed(1)}/5</Badge>
              <Badge className={STATUS_COLORS[app.status]} variant="secondary">{STATUS_LABELS[app.status]}</Badge>
              {app.date && <span className="text-xs text-muted-foreground font-mono">{app.date}</span>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        {/* Quick facts strip */}
        <div className="flex gap-4 px-5 py-3 border-b bg-muted/30 text-xs text-muted-foreground flex-wrap">
          {app.remote && <span>📍 {app.remote}</span>}
          {app.compEstimate && <span>💰 {app.compEstimate}</span>}
          {app.jobURL && <a href={app.jobURL} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">↗ Job posting</a>}
          {app.hasPDF && <span className="text-green-700">✅ PDF ready</span>}
        </div>

        {app.tldr && (
          <div className="px-5 py-3 border-b bg-blue-50/30">
            <p className="text-sm font-medium text-foreground">TL;DR</p>
            <p className="text-sm text-muted-foreground mt-0.5">{app.tldr}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading report…</p>
          ) : fetchError ? (
            <p className="text-sm text-red-500">Could not load report.</p>
          ) : content ? (
            <div
              className="prose prose-sm max-w-none
                prose-headings:font-semibold prose-headings:text-foreground
                prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                prose-p:text-muted-foreground prose-p:leading-relaxed
                prose-li:text-muted-foreground prose-strong:text-foreground
                prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:text-xs"
              dangerouslySetInnerHTML={{ __html: marked(content) as string }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No report found.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export function TrackerCard({ app }: { app: Application }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <div className="rounded-xl border bg-card hover:shadow-sm transition-shadow">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold uppercase">
              {app.company.slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="font-semibold text-sm leading-tight">{app.role}</p>
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${scoreVariant(app.score)}`}>
                  {app.score > 0 ? `${app.score.toFixed(1)}/5` : "—"}
                </span>
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
                  <button
                    onClick={() => setDrawerOpen(true)}
                    className="text-xs text-muted-foreground hover:text-foreground font-mono underline-offset-2 hover:underline"
                  >
                    📄 Report #{app.reportNumber}
                  </button>
                )}
                {app.compEstimate && (
                  <span className="text-xs text-muted-foreground">💰 {app.compEstimate}</span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Change status:</span>
            <StatusSelect app={app} />
          </div>
        </div>
      </div>

      {drawerOpen && <ReportDrawer app={app} open={drawerOpen} onClose={() => setDrawerOpen(false)} />}
    </>
  )
}
