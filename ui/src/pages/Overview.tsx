import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { parsePipeline } from '@/lib/parsers/pipeline'
import { parseApplications, type Application } from '@/lib/parsers/applications'
import { KpiCard } from '@/components/KpiCard'
import { ScoreFunnel } from '@/components/ScoreFunnel'
import { ScoreBadge } from '@/components/ScoreBadge'

export function Overview() {
  const [apps, setApps] = useState<Application[]>([])
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    api.applications().then(({ content }) => setApps(parseApplications(content)))
    api.pipeline().then(({ content }) => {
      const entries = parsePipeline(content)
      setPendingCount(entries.filter(e => !e.done && !e.skipped).length)
    })
  }, [])

  const applied = apps.filter(a => ['Applied','Interview','Offer','Responded'].includes(a.status)).length
  const interviews = apps.filter(a => ['Interview','Offer'].includes(a.status)).length
  const high = apps.filter(a => a.score !== null && a.score >= 4.0).length
  const mid = apps.filter(a => a.score !== null && a.score >= 3.5 && a.score < 4.0).length
  const low = apps.filter(a => a.score !== null && (a.score ?? 0) < 3.5).length
  const recent = [...apps].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Overview</h1>
        <p className="text-sm text-stone-400 mt-0.5">Job search at a glance</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KpiCard label="Pipeline" value={pendingCount} sub="pending evaluation" />
        <KpiCard label="Evaluated" value={apps.length} sub="reports written" />
        <KpiCard label="Applied" value={applied} sub="applications sent" />
        <KpiCard label="Interviews" value={interviews} sub="active processes" />
      </div>

      {apps.length > 0 && <ScoreFunnel high={high} mid={mid} low={low} />}

      <div className="bg-white border border-stone-200 rounded-lg">
        <div className="px-4 py-3 border-b border-stone-100">
          <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Recent evaluations</span>
        </div>
        {recent.length === 0
          ? <div className="px-4 py-8 text-center text-sm text-stone-400">No evaluations yet.</div>
          : <div className="divide-y divide-stone-50">
              {recent.map(app => (
                <div key={app.number} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xs text-stone-300 w-8">{String(app.number).padStart(3,'0')}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-stone-800">{app.company}</span>
                    <span className="text-xs text-stone-400 ml-2 truncate">{app.role}</span>
                  </div>
                  <ScoreBadge score={app.score} />
                  <span className="text-xs text-stone-300">{app.date}</span>
                  {app.reportNumber && (
                    <Link to={`/reports/${app.reportNumber}`} className="text-xs text-stone-400 hover:text-stone-700 underline underline-offset-2">
                      report
                    </Link>
                  )}
                </div>
              ))}
            </div>
        }
      </div>

      <div className="flex gap-2">
        <Link to="/actions" className="px-3 py-1.5 bg-stone-900 text-white text-xs font-medium rounded hover:bg-stone-700">Run Scan</Link>
        <Link to="/actions" className="px-3 py-1.5 border border-stone-200 text-stone-700 text-xs font-medium rounded hover:bg-stone-50">Start Batch</Link>
        <Link to="/pipeline" className="px-3 py-1.5 border border-stone-200 text-stone-700 text-xs font-medium rounded hover:bg-stone-50">View Pipeline</Link>
      </div>
    </div>
  )
}
