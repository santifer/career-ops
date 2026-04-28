import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FileText, ExternalLink, PenLine, Check } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '@/lib/api'
import { parseReport } from '@/lib/parsers/report'
import { ScoreBadge } from '@/components/ScoreBadge'

interface ReportSummary {
  id: string
  filename: string
  company: string
  role: string
  score: number | null
  date: string
  archetype: string
  legitimacy: string
  jobUrl: string | null
  pdfPath: string | null
}

function scoreBorder(score: number | null) {
  if (score === null) return 'border-l-stone-200'
  if (score >= 4.0) return 'border-l-emerald-400'
  if (score >= 3.5) return 'border-l-amber-400'
  return 'border-l-stone-300'
}

function LegitimacyChip({ text }: { text: string }) {
  if (!text) return null
  if (text.includes('High Confidence'))
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">⚡ High Confidence</span>
  if (text.includes('Caution'))
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">⚠ Caution</span>
  if (text.includes('Suspicious'))
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">🚩 Suspicious</span>
  return null
}

function CoverLetterBtn({ report }: { report: ReportSummary }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const prompt = [
      `/career-ops pdf`,
      ``,
      `Generate a one-page tailored cover letter for ${report.company} — ${report.role}.`,
      `Report: reports/${report.filename}`,
      report.jobUrl ? `Job URL: ${report.jobUrl}` : null,
      ``,
      `Requirements: same visual design as the CV. JD quotes mapped to proof points. Lead with the company problem, not "I am applying." No clichés. 1 page max.`,
    ].filter(l => l !== null).join('\n')

    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    })
  }, [report])

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-stone-200 rounded-md hover:bg-stone-50 transition-colors text-stone-600"
    >
      {copied
        ? <Check size={12} className="text-emerald-600" />
        : <PenLine size={12} />}
      {copied ? 'Copied!' : 'Cover Letter'}
    </button>
  )
}

export function Reports() {
  const [reports, setReports] = useState<ReportSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.reports().then(async ({ files }) => {
      const summaries = await Promise.all(
        files.map(async filename => {
          const id = filename.split('-')[0]
          const { content } = await api.report(id)
          const r = parseReport(id, content)
          return {
            id,
            filename,
            company: r.company,
            role: r.role,
            score: r.score,
            date: r.date,
            archetype: r.archetype,
            legitimacy: r.legitimacy,
            jobUrl: r.jobUrl,
            pdfPath: r.pdfPath,
          }
        })
      )
      setReports(summaries)
      setLoading(false)
    })
  }, [])

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Reports</h1>
          <p className="text-sm text-stone-400 mt-0.5">
            {loading ? 'Loading…' : `${reports.length} evaluation${reports.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {reports.map(r => {
          const hasPdf = typeof r.pdfPath === 'string' &&
            r.pdfPath.endsWith('.pdf') &&
            r.pdfPath.startsWith('output/')

          return (
            <div
              key={r.id}
              className={clsx(
                'bg-white border border-stone-200 border-l-4 rounded-lg overflow-hidden',
                scoreBorder(r.score)
              )}
            >
              <div className="px-5 py-4">
                <div className="flex items-start gap-4">
                  {/* Score column */}
                  <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5 w-10">
                    <ScoreBadge score={r.score} />
                    <span className="text-xs text-stone-300 font-mono">#{r.id}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="font-semibold text-stone-900 leading-tight truncate">{r.company}</h2>
                        <p className="text-sm text-stone-500 mt-0.5 truncate">{r.role}</p>
                      </div>
                      <span className="text-xs text-stone-300 shrink-0 mt-0.5">{r.date}</span>
                    </div>

                    {/* Tags */}
                    {(r.archetype || r.legitimacy) && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {r.archetype && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {r.archetype.split(' (')[0]}
                          </span>
                        )}
                        <LegitimacyChip text={r.legitimacy} />
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Link
                        to={`/reports/${r.id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-stone-900 text-white rounded-md hover:bg-stone-700 transition-colors"
                      >
                        <FileText size={12} />
                        View Report
                      </Link>
                      {hasPdf && (
                        <a
                          href={`/api/file?path=${encodeURIComponent(r.pdfPath!)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-stone-200 rounded-md hover:bg-stone-50 transition-colors text-stone-600"
                        >
                          <ExternalLink size={12} />
                          View CV
                        </a>
                      )}
                      <CoverLetterBtn report={r} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {!loading && reports.length === 0 && (
          <div className="py-12 text-center text-sm text-stone-400 bg-white border border-stone-200 rounded-lg">
            No reports yet. Run <code className="text-stone-600 bg-stone-100 px-1 py-0.5 rounded">/career-ops</code> with a job URL to evaluate your first offer.
          </div>
        )}
      </div>
    </div>
  )
}
