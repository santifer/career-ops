import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { parseReport } from '@/lib/parsers/report'
import { ScoreBadge } from '@/components/ScoreBadge'

interface ReportSummary { id: string; company: string; role: string; score: number | null; date: string }

export function Reports() {
  const [reports, setReports] = useState<ReportSummary[]>([])

  useEffect(() => {
    api.reports().then(async ({ files }) => {
      const parsed = await Promise.all(files.map(async filename => {
        const id = filename.split('-')[0]
        const { content } = await api.report(id)
        const r = parseReport(id, content)
        return { id, company: r.company, role: r.role, score: r.score, date: r.date }
      }))
      setReports(parsed)
    })
  }, [])

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Reports</h1>
        <p className="text-sm text-stone-400">{reports.length} evaluation reports</p>
      </div>
      <div className="bg-white border border-stone-200 rounded-lg divide-y divide-stone-50">
        {reports.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-stone-400">No reports yet.</div>
        )}
        {reports.map(r => (
          <Link key={r.id} to={`/reports/${r.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors">
            <span className="text-xs text-stone-300 w-8">#{r.id}</span>
            <div className="flex-1 min-w-0">
              <span className="font-medium text-stone-800">{r.company}</span>
              <span className="text-stone-400 ml-2 text-sm truncate">{r.role}</span>
            </div>
            <ScoreBadge score={r.score} />
            <span className="text-xs text-stone-300">{r.date}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
