import { scoreColor, scoreBgColor, scoreLabel } from "@/lib/utils/scoring";
import { BlockRenderer } from "./block-renderer";
import type { ReportRow } from "@/lib/db/queries/reports";

const BLOCKS = [
  { key: "blockA", label: "Role Analysis" },
  { key: "blockB", label: "Company Assessment" },
  { key: "blockC", label: "CV Match & Keywords" },
  { key: "blockD", label: "Compensation Analysis" },
  { key: "blockE", label: "Red Flags & Deal Breakers" },
  { key: "blockF", label: "Interview Preparation" },
  { key: "blockG", label: "Posting Legitimacy" },
] as const;

interface ReportReaderProps {
  report: ReportRow;
}

export function ReportReader({ report }: ReportReaderProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card-surface">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-800">
              Report #{report.number} — {report.companySlug}
            </h2>
            <p className="text-sm text-neutral-500 mt-0.5">{report.date}</p>
            {report.jdUrl && (
              <a
                href={report.jdUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline mt-1 inline-block"
              >
                View original posting
              </a>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {report.overallScore && (
              <span
                className={`text-xl font-bold px-3 py-1 rounded-lg ${scoreColor(report.overallScore)} ${scoreBgColor(report.overallScore)}`}
              >
                {report.overallScore}/5
              </span>
            )}
            {report.overallScore && (
              <span className="text-xs text-neutral-500">
                {scoreLabel(report.overallScore)}
              </span>
            )}
            {report.legitimacyTier && (
              <span className="text-xs text-neutral-400">
                Legitimacy: {report.legitimacyTier}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Blocks */}
      <div className="card-surface space-y-6">
        {BLOCKS.map(({ key, label }) => {
          const data = report[key as keyof ReportRow];
          return (
            <BlockRenderer
              key={key}
              blockKey={key}
              label={label}
              data={data}
            />
          );
        })}
      </div>

      {/* Full markdown fallback */}
      {report.fullMarkdown && !report.blockA && (
        <div className="card-surface">
          <h3 className="text-sm font-semibold text-neutral-800 mb-3">
            Full Report
          </h3>
          <div className="prose prose-sm prose-neutral max-w-none">
            <pre className="whitespace-pre-wrap text-xs text-neutral-600">
              {report.fullMarkdown}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
