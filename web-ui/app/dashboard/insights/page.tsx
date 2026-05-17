"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3099"

interface PatternsData {
  totalApplications?: number
  conversionRates?: Record<string, number>
  topBlockers?: { reason: string; count: number }[]
  techGaps?: string[]
  recommendations?: string[]
  avgScoreByStatus?: Record<string, number>
  blockerAnalysis?: { reason: string; count: number }[]
  [key: string]: unknown
}

function FunnelRow({ label, count, total, rate }: { label: string; count: number; total: number; rate?: number | null }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <a
        href={`/dashboard/tracker?tab=${label.toLowerCase()}`}
        className="text-xs text-muted-foreground w-24 shrink-0 hover:text-foreground hover:underline"
      >
        {label}
      </a>
      <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs font-semibold w-8 text-right shrink-0">{count}</span>
      {rate != null && (
        <span className="text-[10px] text-muted-foreground w-14 shrink-0">{rate.toFixed(0)}% conv.</span>
      )}
    </div>
  )
}

export default function InsightsPage() {
  const [data, setData] = useState<PatternsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${BASE}/api/patterns`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`Server error ${r.status}`)))
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const total = data?.totalApplications ?? 0
  const blockers = data?.blockerAnalysis ?? data?.topBlockers ?? []
  const techGaps = data?.techGaps ?? []
  const recommendations = data?.recommendations ?? []
  const avgScores = data?.avgScoreByStatus ?? {}

  // Build funnel from conversionRates or avgScoreByStatus keys
  const funnelOrder = ["Evaluated", "Applied", "Responded", "Interview", "Offer"]
  const rates = data?.conversionRates ?? {}

  if (loading) {
    return (
      <>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
          <p className="text-muted-foreground text-sm mt-1">AI-powered pattern analysis of your applications</p>
        </div>
        <div className="flex flex-col gap-4 max-w-3xl">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50/50 px-4 py-3 text-sm text-red-800">
          Could not load insights: {error}
        </div>
      </>
    )
  }

  if (total < 5) {
    return (
      <>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
          <p className="text-muted-foreground text-sm mt-1">AI-powered pattern analysis of your applications</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <p className="text-3xl">📊</p>
          <p className="font-medium">Not enough data yet</p>
          <p className="text-sm">Need at least 5 applications beyond Evaluated to generate insights</p>
          <p className="text-sm">Currently: {total} application{total !== 1 ? "s" : ""}</p>
        </div>
      </>
    )
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
        <p className="text-muted-foreground text-sm mt-1">
          AI-powered pattern analysis · {total} application{total !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Conversion funnel */}
      <Card>
        <CardHeader><CardTitle className="text-base">Conversion Funnel</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {funnelOrder.map((label, i) => {
            const count = (rates[label] as number | undefined) ?? 0
            const prevCount = i > 0 ? ((rates[funnelOrder[i - 1]] as number | undefined) ?? 0) : total
            const rate = i > 0 && prevCount > 0 ? (count / prevCount) * 100 : null
            return (
              <FunnelRow key={label} label={label} count={count} total={total} rate={rate} />
            )
          })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
        {/* Score comparison */}
        {Object.keys(avgScores).length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Avg Score by Stage</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {Object.entries(avgScores).map(([status, avg]) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground capitalize">{status}</span>
                  <span className="font-mono font-semibold">{(avg as number).toFixed(1)}/5</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Top blockers */}
        {blockers.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Top Rejection Reasons</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {blockers.slice(0, 6).map((b, i) => (
                <div key={i} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-muted-foreground truncate">{b.reason}</span>
                  <span className="font-mono text-xs shrink-0 bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{b.count}×</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tech gaps */}
      {techGaps.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Tech Stack Gaps</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {techGaps.map((gap, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-medium">{gap}</span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recommendations</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-blue-500 mt-0.5 shrink-0">→</span>
                  <span className="text-muted-foreground">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}
