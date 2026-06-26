import { notFound } from 'next/navigation';
import Link from 'next/link';
import path from 'node:path';
import fs from 'node:fs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getApplication } from '@/lib/pipeline';
import { parseReport } from '@/lib/parser';
import { getCanonicalStatuses } from '@/lib/states';
import { getCareerOpsRoot } from '@/lib/pipeline';
import { StatusEditor } from './StatusEditor';
import { StatusPill } from '@/components/StatusPill';
import { RunJobButton } from '@/components/RunJobButton';

export const dynamic = 'force-dynamic';

export default function ApplicationDetail({ params }: { params: { num: string } }) {
  const num = Number.parseInt(params.num, 10);
  if (!Number.isFinite(num)) notFound();

  const app = getApplication(num);
  if (!app) notFound();

  const root = getCareerOpsRoot();
  const statuses = getCanonicalStatuses(root);
  const report = app.reportPath ? parseReport(root, app.reportPath) : null;

  const pdfPath = path.join(root, 'output', `cv-candidate-${slugify(app.company)}-${app.date}.pdf`);
  const pdfExists = fs.existsSync(pdfPath);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/pipeline" className="text-sm text-accent-300 hover:underline">← Pipeline</Link>
        <h1 className="text-2xl font-bold mt-2">
          <span className="text-accent-300">{app.company}</span> — {app.role}
        </h1>
        <div className="flex flex-wrap gap-2 mt-3 text-sm text-slate-400">
          <span className="mono">#{app.number}</span>
          <span>·</span>
          <span className="mono">{app.date}</span>
          <span>·</span>
          <StatusPill status={app.status} />
          {app.score != null && (
            <>
              <span>·</span>
              <span className="mono">{app.score.toFixed(2)} / 5</span>
            </>
          )}
        </div>
      </div>

      <section className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
        <h2 className="font-semibold text-slate-200 mb-3">Quick actions</h2>
        <div className="flex flex-wrap gap-3 items-center">
          <StatusEditor current={app.status} options={statuses} number={app.number} />
          {pdfExists && (
            <Link href={`/output/${path.basename(pdfPath)}`} className="text-sm bg-ink-800 hover:bg-ink-700 rounded px-3 py-1.5">
              View PDF
            </Link>
          )}
          {report && (
            <Link href={`#report`} className="text-sm bg-ink-800 hover:bg-ink-700 rounded px-3 py-1.5">
              Jump to report
            </Link>
          )}
          <RunJobButton
            kind="script"
            id="generate-pdf"
            label={pdfExists ? 'Regenerate PDF' : 'Generate PDF'}
            variant="secondary"
            defaultArgs={{ number: String(app.number) }}
            size="md"
          />
        </div>
        {app.notes && (
          <p className="mt-4 text-sm text-slate-300 border-l-2 border-accent-500/40 pl-3">
            {app.notes}
          </p>
        )}
      </section>

      {report && (
        <section id="report" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Meta label="Archetype" value={report.archetype} />
            <Meta label="TL;DR" value={report.tldr} mono={false} />
            <Meta label="Remote" value={report.remote} />
            <Meta label="Comp" value={report.comp} mono={false} />
          </div>
          {report.legitimacy && (
            <div className="rounded-lg border border-ink-800 bg-ink-900/60 px-4 py-2 text-sm text-slate-300">
              <span className="text-slate-500 mr-2">Legitimacy:</span>
              <span className="text-accent-300">{report.legitimacy}</span>
            </div>
          )}

          <article className="report rounded-lg border border-ink-800 bg-ink-900/60 p-6 text-slate-200">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.body}</ReactMarkdown>
          </article>
        </section>
      )}
    </div>
  );
}

function Meta({ label, value, mono = true }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/60 p-3">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 ${mono ? 'mono text-sm text-accent-300' : 'text-sm text-slate-200'}`}>
        {value ?? '—'}
      </p>
    </div>
  );
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
