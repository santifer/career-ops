import Link from 'next/link';
import { getPipeline } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export default function Home() {
  const { rows, stats } = getPipeline({ limit: 0 });
  const total = rows.length;
  const applied = stats.byStatus['Applied'] ?? 0;
  const interview = (stats.byStatus['Interview'] ?? 0) + (stats.byStatus['Responded'] ?? 0);
  const offer = stats.byStatus['Offer'] ?? 0;
  const avgScore = rows
    .map((r) => r.score)
    .filter((s): s is number => s != null)
    .reduce((acc, n, _, arr) => acc + n / arr.length, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Visual layer over your <code className="mono">data/applications.md</code>. Source of truth stays in markdown — this UI only reads and writes via the same scripts the CLI agent uses.
        </p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Total evaluated" value={total} />
        <Kpi label="Applied" value={applied} accent />
        <Kpi label="Interview / Responded" value={interview} accent />
        <Kpi label="Offers" value={offer} accent />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
          <h2 className="font-semibold text-slate-200 mb-3">Average score</h2>
          <p className="text-4xl font-bold text-accent-300">
            {avgScore ? avgScore.toFixed(2) : '—'}
            <span className="text-base text-slate-500 ml-1">/ 5</span>
          </p>
        </div>
        <div className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
          <h2 className="font-semibold text-slate-200 mb-3">Status funnel</h2>
          <ul className="space-y-1 text-sm">
            {Object.entries(stats.byStatus).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <li key={k} className="flex justify-between text-slate-300">
                <span>{k}</span>
                <span className="text-accent-300 mono">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-200">Recent activity</h2>
          <Link href="/pipeline" className="text-accent-300 text-sm hover:underline">View all →</Link>
        </div>
        <Pipeline limit={5} />
      </section>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-3xl font-bold mt-2 ${accent ? 'text-accent-300' : 'text-slate-100'}`}>{value}</p>
    </div>
  );
}

function Pipeline({ limit }: { limit: number }) {
  const { rows } = getPipeline({ limit, sort: 'date', order: 'desc' });
  if (rows.length === 0) return <p className="text-slate-500 text-sm">No applications yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-slate-500 border-b border-ink-800">
          <th className="py-2">#</th>
          <th>Company</th>
          <th>Role</th>
          <th>Score</th>
          <th>Status</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.number} className="border-b border-ink-800/50 hover:bg-ink-800/30">
            <td className="mono text-slate-400">{a.number}</td>
            <td><Link href={`/applications/${a.number}`} className="hover:underline">{a.company}</Link></td>
            <td className="text-slate-300 truncate max-w-md">{a.role}</td>
            <td className="mono">{a.score != null ? a.score.toFixed(1) : '—'}</td>
            <td><StatusPill status={a.status} /></td>
            <td className="text-slate-400 mono">{a.date}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatusPill({ status }: { status: string }) {
  const color = {
    Evaluated: 'bg-slate-700/60 text-slate-200',
    Applied: 'bg-blue-700/40 text-blue-200',
    Responded: 'bg-amber-700/40 text-amber-200',
    Interview: 'bg-violet-700/40 text-violet-200',
    Offer: 'bg-emerald-700/40 text-emerald-200',
    Rejected: 'bg-rose-700/40 text-rose-200',
    Discarded: 'bg-zinc-700/40 text-zinc-300',
    SKIP: 'bg-zinc-800/40 text-zinc-400',
  }[status] ?? 'bg-slate-700/60 text-slate-200';
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${color}`}>{status}</span>;
}
