import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ExternalLink, FileText, PenLine, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { parseReport, type Report as ReportType } from '@/lib/parsers/report'
import { ScoreBadge } from '@/components/ScoreBadge'

const BLOCK_LABELS: Record<string, string> = {
  A: 'Role Summary',
  B: 'CV Match',
  C: 'Level & Strategy',
  D: 'Comp & Demand',
  E: 'CV Personalization',
  F: 'Interview Prep',
  G: 'Legitimacy',
}

function LegitimacyBadge({ text }: { text: string }) {
  if (!text) return null
  if (text.includes('High Confidence'))
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">⚡ High Confidence</span>
  if (text.includes('Caution'))
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">⚠ Caution</span>
  if (text.includes('Suspicious'))
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">🚩 Suspicious</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 border border-stone-200">{text}</span>
}

export function Report() {
  const { id } = useParams<{ id: string }>()
  const [report, setReport] = useState<ReportType | null>(null)
  const [filename, setFilename] = useState<string>('')
  const [allIds, setAllIds] = useState<string[]>([])
  const [coverCopied, setCoverCopied] = useState(false)

  useEffect(() => {
    if (!id) return
    api.report(id).then(({ content, filename: f }) => {
      setReport(parseReport(id, content))
      setFilename(f)
    })
    api.reports().then(({ files }) =>
      setAllIds(files.map(f => f.split('-')[0]).reverse())
    )
  }, [id])

  const copyCoverLetter = useCallback(() => {
    if (!report) return
    const lines = [
      `/career-ops pdf`,
      ``,
      `Generate a one-page tailored cover letter for ${report.company} — ${report.role}.`,
      filename ? `Report: reports/${filename}` : null,
      report.jobUrl ? `Job URL: ${report.jobUrl}` : null,
      ``,
      `Requirements: same visual design as the CV. JD quotes mapped to proof points. Lead with the company problem, not "I am applying." No clichés. 1 page max.`,
    ].filter((l): l is string => l !== null)

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCoverCopied(true)
      setTimeout(() => setCoverCopied(false), 2500)
    })
  }, [report, filename])

  if (!report) return <div className="text-stone-400 text-sm py-8">Loading…</div>

  const idx = allIds.indexOf(id!)
  const prevId = allIds[idx + 1]
  const nextId = allIds[idx - 1]
  const hasPdf = typeof report.pdfPath === 'string' &&
    report.pdfPath.endsWith('.pdf') &&
    report.pdfPath.startsWith('output/')

  return (
    <div className="max-w-5xl flex gap-8">

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0">

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-stone-900 leading-tight">{report.company}</h1>
              <p className="text-stone-500 mt-1 text-sm">{report.role}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-xs text-stone-400">{report.date}</span>
                {report.archetype && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {report.archetype}
                  </span>
                )}
                <LegitimacyBadge text={report.legitimacy} />
              </div>
            </div>
            <div className="shrink-0">
              <ScoreBadge score={report.score} />
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap gap-2 mb-5 pb-5 border-b border-stone-100">
          {report.jobUrl && (
            <a
              href={report.jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-stone-200 rounded-md hover:bg-stone-50 transition-colors text-stone-600"
            >
              <ExternalLink size={12} />
              Job Posting ↗
            </a>
          )}
          {hasPdf && (
            <a
              href={`/api/file?path=${encodeURIComponent(report.pdfPath!)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-stone-900 text-white rounded-md hover:bg-stone-700 transition-colors"
            >
              <FileText size={12} />
              View CV
            </a>
          )}
          <button
            onClick={copyCoverLetter}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-stone-200 rounded-md hover:bg-stone-50 transition-colors text-stone-600"
            title="Copy prompt — paste in Claude Code to generate a cover letter"
          >
            {coverCopied
              ? <Check size={12} className="text-emerald-600" />
              : <PenLine size={12} />}
            {coverCopied ? 'Prompt copied!' : 'Cover Letter'}
          </button>
        </div>

        {/* Prev / Next navigation */}
        <div className="flex justify-between text-xs text-stone-400 mb-6">
          {prevId
            ? <Link to={`/reports/${prevId}`} className="flex items-center gap-0.5 hover:text-stone-700 transition-colors"><ChevronLeft size={13} />#{prevId}</Link>
            : <span />}
          {nextId
            ? <Link to={`/reports/${nextId}`} className="flex items-center gap-0.5 hover:text-stone-700 transition-colors">#{nextId}<ChevronRight size={13} /></Link>
            : <span />}
        </div>

        {/* Markdown body */}
        <div className="prose prose-stone prose-sm max-w-none
          prose-headings:font-semibold
          prose-h2:text-base prose-h2:mt-6 prose-h2:mb-3
          prose-h3:text-sm prose-h3:mt-4
          prose-table:text-xs
          prose-td:py-1.5 prose-th:py-1.5
          prose-code:text-xs prose-code:bg-stone-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.rawContent}</ReactMarkdown>
        </div>
      </div>

      {/* ── Sidebar ── */}
      <div className="w-44 shrink-0">
        <div className="sticky top-6">
          <div className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Sections</div>
          <div className="space-y-1.5">
            {Object.entries(BLOCK_LABELS).map(([key, label]) =>
              report.sections[key] ? (
                <div
                  key={key}
                  className="bg-white border border-stone-200 rounded-md p-2.5 hover:border-stone-300 hover:shadow-xs transition-all cursor-default"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-stone-400 w-4 shrink-0">{key}</span>
                    <span className="text-xs text-stone-600 leading-tight">{label}</span>
                  </div>
                </div>
              ) : null
            )}
          </div>

          {/* Quick actions repeated in sidebar for convenience */}
          <div className="mt-6 space-y-1.5">
            <div className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Actions</div>
            {hasPdf && (
              <a
                href={`/api/file?path=${encodeURIComponent(report.pdfPath!)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 w-full px-2.5 py-2 text-xs border border-stone-200 rounded-md hover:bg-stone-50 transition-colors text-stone-600"
              >
                <FileText size={11} />
                View CV
              </a>
            )}
            <button
              onClick={copyCoverLetter}
              className="flex items-center gap-1.5 w-full px-2.5 py-2 text-xs border border-stone-200 rounded-md hover:bg-stone-50 transition-colors text-stone-600"
            >
              {coverCopied
                ? <Check size={11} className="text-emerald-600" />
                : <PenLine size={11} />}
              {coverCopied ? 'Copied!' : 'Cover Letter'}
            </button>
            {report.jobUrl && (
              <a
                href={report.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 w-full px-2.5 py-2 text-xs border border-stone-200 rounded-md hover:bg-stone-50 transition-colors text-stone-600"
              >
                <ExternalLink size={11} />
                Job Posting
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
