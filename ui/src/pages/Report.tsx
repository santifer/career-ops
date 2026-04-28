import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '@/lib/api'
import { parseReport, type Report as ReportType } from '@/lib/parsers/report'
import { ScoreBadge } from '@/components/ScoreBadge'

const BLOCK_LABELS: Record<string, string> = {
  A: 'Role Summary', B: 'CV Match', C: 'Proof Points',
  D: 'Questions', E: 'Flags', F: 'Recommendation', G: 'Legitimacy',
}

export function Report() {
  const { id } = useParams<{ id: string }>()
  const [report, setReport] = useState<ReportType | null>(null)
  const [allIds, setAllIds] = useState<string[]>([])

  useEffect(() => {
    if (!id) return
    api.report(id).then(({ content }) => setReport(parseReport(id, content)))
    api.reports().then(({ files }) => setAllIds(files.map(f => f.split('-')[0]).reverse()))
  }, [id])

  if (!report) return <div className="text-stone-400 text-sm">Loading…</div>

  const idx = allIds.indexOf(id!)
  const prevId = allIds[idx + 1]
  const nextId = allIds[idx - 1]

  return (
    <div className="max-w-5xl flex gap-6">
      <div className="flex-1 min-w-0">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">{report.company}</h1>
            <p className="text-stone-500 mt-0.5">{report.role}</p>
            <div className="flex gap-3 mt-2 text-xs text-stone-400">
              <span>{report.date}</span>
              {report.archetype && <span>{report.archetype}</span>}
              {report.legitimacy && <span>{report.legitimacy}</span>}
            </div>
          </div>
          <ScoreBadge score={report.score} />
        </div>

        <div className="flex gap-2 mb-4">
          {report.jobUrl && (
            <a href={report.jobUrl} target="_blank" rel="noopener noreferrer"
               className="px-3 py-1.5 text-xs border border-stone-200 rounded hover:bg-stone-50">
              Open Job URL ↗
            </a>
          )}
        </div>

        <div className="flex justify-between text-xs text-stone-400 mb-6">
          {prevId ? <Link to={`/reports/${prevId}`} className="hover:text-stone-700">← #{prevId}</Link> : <span />}
          {nextId ? <Link to={`/reports/${nextId}`} className="hover:text-stone-700">#{nextId} →</Link> : <span />}
        </div>

        <div className="prose prose-stone prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.rawContent}</ReactMarkdown>
        </div>
      </div>

      <div className="w-40 shrink-0">
        <div className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Sections</div>
        <div className="space-y-1.5">
          {Object.entries(BLOCK_LABELS).map(([key, label]) =>
            report.sections[key] ? (
              <div key={key} className="bg-white border border-stone-200 rounded p-2">
                <div className="text-xs font-semibold text-stone-700">{key}</div>
                <div className="text-xs text-stone-400 mt-0.5">{label}</div>
              </div>
            ) : null
          )}
        </div>
      </div>
    </div>
  )
}
