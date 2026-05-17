"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { STATUS_LABELS, STATUS_COLORS, scoreVariant, type Application } from "@/lib/api"
import { marked } from "marked"

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3099"

interface ReportContent {
  content: string
}

function AppSelect({
  apps,
  value,
  onChange,
  exclude,
  label,
}: {
  apps: Application[]
  value: string
  onChange: (v: string) => void
  exclude: string
  label: string
}) {
  const options = apps.filter(a => a.reportNumber !== null && String(a.number) !== exclude)
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">Select an application…</option>
        {options.map(a => (
          <option key={a.number} value={String(a.number)}>
            {a.company} — {a.role} ({a.score > 0 ? `${a.score.toFixed(1)}/5` : "—"})
          </option>
        ))}
      </select>
    </div>
  )
}

function OfferCard({
  app,
  report,
  loading,
  highlight,
}: {
  app: Application
  report: string | null
  loading: boolean
  highlight: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`rounded-xl border-2 transition-colors ${
        highlight ? "border-green-400 bg-green-50/20" : "border-border"
      }`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="font-semibold text-base">{app.company}</p>
            <p className="text-sm text-muted-foreground">{app.role}</p>
          </div>
          <span className={`text-sm font-mono font-bold px-2 py-0.5 rounded-full ${scoreVariant(app.score)}`}>
            {app.score > 0 ? `${app.score.toFixed(1)}/5` : "—"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <Badge className={STATUS_COLORS[app.status]} variant="secondary">{STATUS_LABELS[app.status]}</Badge>
          {app.remote && <span className="text-xs text-muted-foreground">📍 {app.remote}</span>}
          {app.compEstimate && <span className="text-xs text-muted-foreground">💰 {app.compEstimate}</span>}
          {app.hasPDF && <span className="text-xs text-green-700">✅ PDF</span>}
        </div>

        {app.tldr && (
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">{app.tldr}</p>
        )}

        {app.jobURL && (
          <a href={app.jobURL} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
            ↗ View job posting
          </a>
        )}
      </div>

      {app.reportNumber && (
        <div className="border-t px-4 py-2">
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? "▲ Hide report" : "▼ Show full report"}
          </button>
          {expanded && (
            <div className="mt-2 max-h-80 overflow-y-auto">
              {loading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : report ? (
                <div
                  className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:text-xs"
                  dangerouslySetInnerHTML={{ __html: marked(report) as string }}
                />
              ) : (
                <p className="text-xs text-red-500">Could not load report.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ComparePage() {
  const [apps, setApps] = useState<Application[]>([])
  const [leftId, setLeftId] = useState("")
  const [rightId, setRightId] = useState("")
  const [reports, setReports] = useState<Record<string, string | null>>({})
  const [loadingReports, setLoadingReports] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch(`${BASE}/api/applications`)
      .then(r => r.ok ? r.json() : [])
      .then((data: Application[]) => setApps(data.filter(a => a.reportNumber !== null)))
      .catch(() => {})
  }, [])

  async function loadReport(appNum: string, reportNum: string) {
    if (reports[appNum] !== undefined) return
    setLoadingReports(prev => ({ ...prev, [appNum]: true }))
    try {
      const r = await fetch(`${BASE}/api/report/${reportNum}`)
      const d: ReportContent = r.ok ? await r.json() : { content: "" }
      setReports(prev => ({ ...prev, [appNum]: d.content || null }))
    } catch {
      setReports(prev => ({ ...prev, [appNum]: null }))
    } finally {
      setLoadingReports(prev => ({ ...prev, [appNum]: false }))
    }
  }

  const leftApp = apps.find(a => String(a.number) === leftId)
  const rightApp = apps.find(a => String(a.number) === rightId)

  useEffect(() => {
    if (leftApp?.reportNumber) loadReport(String(leftApp.number), leftApp.reportNumber)
  }, [leftId])

  useEffect(() => {
    if (rightApp?.reportNumber) loadReport(String(rightApp.number), rightApp.reportNumber)
  }, [rightId])

  const leftScore = leftApp?.score ?? 0
  const rightScore = rightApp?.score ?? 0
  const leftHighlight = leftApp && rightApp ? leftScore >= rightScore : false
  const rightHighlight = leftApp && rightApp ? rightScore > leftScore : false

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compare Offers</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Side-by-side comparison of two evaluated applications.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-4xl">
        <AppSelect
          apps={apps}
          value={leftId}
          onChange={setLeftId}
          exclude={rightId}
          label="Application A"
        />
        <AppSelect
          apps={apps}
          value={rightId}
          onChange={setRightId}
          exclude={leftId}
          label="Application B"
        />
      </div>

      {!leftApp && !rightApp && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2 max-w-4xl">
          <p className="text-3xl">⚖️</p>
          <p className="font-medium">Select two applications to compare</p>
          <p className="text-sm">Only applications with evaluation reports appear in the dropdowns</p>
        </div>
      )}

      {(leftApp || rightApp) && (
        <div className="grid grid-cols-2 gap-4 max-w-4xl">
          {leftApp ? (
            <OfferCard
              app={leftApp}
              report={reports[String(leftApp.number)] ?? null}
              loading={loadingReports[String(leftApp.number)] ?? false}
              highlight={leftHighlight}
            />
          ) : (
            <div className="rounded-xl border-2 border-dashed border-border flex items-center justify-center h-48 text-muted-foreground text-sm">
              Select application A
            </div>
          )}
          {rightApp ? (
            <OfferCard
              app={rightApp}
              report={reports[String(rightApp.number)] ?? null}
              loading={loadingReports[String(rightApp.number)] ?? false}
              highlight={rightHighlight}
            />
          ) : (
            <div className="rounded-xl border-2 border-dashed border-border flex items-center justify-center h-48 text-muted-foreground text-sm">
              Select application B
            </div>
          )}
        </div>
      )}

      {leftApp && rightApp && (
        <Card className="max-w-4xl">
          <CardHeader><CardTitle className="text-base">Quick Comparison</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center text-muted-foreground">
                <div className="font-semibold text-foreground text-lg">{leftApp.score.toFixed(1)}</div>
                <div>{leftApp.company}</div>
              </div>
              <div className="text-center flex flex-col items-center justify-center gap-1">
                <span className="text-xs text-muted-foreground">vs</span>
                {leftScore !== rightScore && (
                  <span className="text-xs font-medium text-green-700">
                    {leftScore > rightScore ? leftApp.company : rightApp.company} scores higher
                  </span>
                )}
                {leftScore === rightScore && (
                  <span className="text-xs text-muted-foreground">Equal scores</span>
                )}
              </div>
              <div className="text-center text-muted-foreground">
                <div className="font-semibold text-foreground text-lg">{rightApp.score.toFixed(1)}</div>
                <div>{rightApp.company}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
