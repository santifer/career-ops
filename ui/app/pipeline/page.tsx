import Link from 'next/link';
import { getPipeline } from '@/lib/pipeline';
import { StatusPill } from '../page';
import { getCanonicalStatuses } from '@/lib/states';
import { getCareerOpsRoot } from '@/lib/pipeline';
import { LiveIndicator } from '@/components/LiveIndicator';

export const dynamic = 'force-dynamic';

interface SearchParams {
  status?: string;
  q?: string;
  minScore?: string;
  sort?: 'date' | 'score' | 'company' | 'status';
  order?: 'asc' | 'desc';
}

export default function PipelinePage({ searchParams }: { searchParams: SearchParams }) {
  const root = getCareerOpsRoot();
  const statuses = getCanonicalStatuses(root);
  const filters = {
    status: searchParams.status ?? null,
    search: searchParams.q ?? null,
    minScore: searchParams.minScore ? Number(searchParams.minScore) : null,
    sort: searchParams.sort ?? 'date',
    order: searchParams.order ?? 'desc',
  } as const;

  const { total, rows } = getPipeline({ ...filters, limit: 500 });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="text-slate-400 text-sm mt-1">{total} application{total === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-3">
          <LiveIndicator />
          <Link href="/api/applications.csv" className="text-sm text-accent-300 hover:underline">Export CSV</Link>
        </div>
      </div>

      <form className="flex flex-wrap gap-3 items-end" method="get">
        <Field label="Search">
          <input
            type="search"
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="company, role, notes…"
            className="bg-ink-900 border border-ink-800 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent-500"
          />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={searchParams.status ?? ''} className="bg-ink-900 border border-ink-800 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent-500">
            <option value="">All</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Min score">
          <input
            type="number"
            step="0.1"
            min="0"
            max="5"
            name="minScore"
            defaultValue={searchParams.minScore ?? ''}
            className="w-20 bg-ink-900 border border-ink-800 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent-500"
          />
        </Field>
        <Field label="Sort">
          <select name="sort" defaultValue={searchParams.sort ?? 'date'} className="bg-ink-900 border border-ink-800 rounded px-3 py-1.5 text-sm text-slate-200">
            <option value="date">Date</option>
            <option value="score">Score</option>
            <option value="company">Company</option>
            <option value="status">Status</option>
          </select>
        </Field>
        <Field label="Order">
          <select name="order" defaultValue={searchParams.order ?? 'desc'} className="bg-ink-900 border border-ink-800 rounded px-3 py-1.5 text-sm text-slate-200">
            <option value="desc">↓</option>
            <option value="asc">↑</option>
          </select>
        </Field>
        <button type="submit" className="bg-accent-500 hover:bg-accent-400 text-white rounded px-4 py-1.5 text-sm font-medium">Apply</button>
        <Link href="/pipeline" className="text-slate-400 text-sm hover:underline ml-2">Reset</Link>
      </form>

      <div className="rounded-lg border border-ink-800 bg-ink-900/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 border-b border-ink-800 bg-ink-950/40">
              <th className="py-2 px-3">#</th>
              <th className="px-3">Company</th>
              <th className="px-3">Role</th>
              <th className="px-3">Score</th>
              <th className="px-3">Status</th>
              <th className="px-3">PDF</th>
              <th className="px-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No matches.</td></tr>
            )}
            {rows.map((a) => (
              <tr key={a.number} className="border-b border-ink-800/50 hover:bg-ink-800/30">
                <td className="mono px-3 text-slate-400">{a.number}</td>
                <td className="px-3"><Link href={`/applications/${a.number}`} className="hover:underline">{a.company}</Link></td>
                <td className="px-3 text-slate-300 truncate max-w-md">{a.role}</td>
                <td className="mono px-3">{a.score != null ? a.score.toFixed(1) : '—'}</td>
                <td className="px-3"><StatusPill status={a.status} /></td>
                <td className="px-3">{a.hasPdf ? '✅' : '—'}</td>
                <td className="mono px-3 text-slate-400">{a.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}
