import Link from 'next/link';
import { parsePipelineInbox, getInboxSummary } from '@/lib/inbox';
import { CopyButton } from '@/components/CopyButton';
import { RunJobButton } from '@/components/RunJobButton';

export const dynamic = 'force-dynamic';

interface SearchParams {
  q?: string;
  company?: string;
}

export default function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  const items = parsePipelineInbox();
  const summary = getInboxSummary();

  const pending = items.filter((i) => i.section === 'pending');
  const processed = items.filter((i) => i.section === 'processed');

  const q = searchParams.q?.toLowerCase() ?? '';
  const companyFilter = searchParams.company?.toLowerCase() ?? '';

  const filteredPending = pending.filter((i) => {
    if (companyFilter && !i.company.toLowerCase().includes(companyFilter)) return false;
    if (!q) return true;
    const haystack = `${i.url} ${i.company} ${i.role}`.toLowerCase();
    return haystack.includes(q);
  });

  const byCompany = new Map<string, typeof filteredPending>();
  for (const item of filteredPending) {
    if (!byCompany.has(item.company)) byCompany.set(item.company, []);
    byCompany.get(item.company)!.push(item);
  }
  const companyList = Array.from(byCompany.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 30);

  const recentProcessed = processed.slice(0, 20);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Inbox</h1>
          <p className="text-slate-400 text-sm mt-1">
            Pending URLs from <code className="mono">data/pipeline.md</code>. Paste a URL into the CLI agent to evaluate it.
          </p>
          <p className="text-slate-500 text-xs mt-1 mono">
            {summary.pending} pending · {summary.processed} processed · {summary.companies} unique companies
          </p>
        </div>
        <RunJobButton kind="script" id="scan" label="Scan portals now" variant="primary" />
      </div>

      <form className="flex flex-wrap gap-3 items-end" method="get">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-slate-500">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="keyword, company, role…"
            className="bg-ink-900 border border-ink-800 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent-500"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-slate-500">Company</span>
          <input
            type="search"
            name="company"
            defaultValue={searchParams.company ?? ''}
            placeholder="filter…"
            className="bg-ink-900 border border-ink-800 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent-500"
          />
        </label>
        <button type="submit" className="bg-accent-500 hover:bg-accent-400 text-white rounded px-4 py-1.5 text-sm font-medium">Apply</button>
        <Link href="/inbox" className="text-slate-400 text-sm hover:underline ml-2">Reset</Link>
      </form>

      <section>
        <h2 className="font-semibold text-slate-200 mb-3">
          Pending · {filteredPending.length}
          {q || companyFilter ? <span className="text-slate-500 text-sm font-normal"> (filtered from {pending.length})</span> : null}
        </h2>
        {companyList.length === 0 && (
          <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/30 p-6 text-center text-emerald-200">
            {pending.length === 0
              ? 'No pending URLs. Run /career-ops scan to find new offers.'
              : 'No matches for your filter.'}
          </div>
        )}
        <div className="space-y-4">
          {companyList.map(([company, items]) => (
            <article key={company} className="rounded-lg border border-ink-800 bg-ink-900/60 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-accent-300">{company}</h3>
                <span className="text-xs text-slate-500 mono">{items.length} role{items.length === 1 ? '' : 's'}</span>
              </div>
              <ul className="space-y-1.5">
                {items.map((i) => (
                  <li key={i.url} className="flex flex-wrap items-center gap-2 text-sm">
                    <a
                      href={i.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-200 hover:text-accent-300 truncate flex-1 min-w-0"
                      title={i.url}
                    >
                      {i.role}
                    </a>
                    <CopyButton text={i.url} />
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-slate-200 mb-3">
          Recently processed · {processed.length} total
        </h2>
        <div className="rounded-lg border border-ink-800 bg-ink-900/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 border-b border-ink-800 bg-ink-950/40">
                <th className="py-2 px-3 text-left">Company</th>
                <th className="px-3 text-left">Role</th>
                <th className="px-3 text-left">Outcome</th>
                <th className="px-3 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentProcessed.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">No processed URLs yet.</td></tr>
              )}
              {recentProcessed.map((i) => (
                <tr key={i.url} className="border-b border-ink-800/50 hover:bg-ink-800/30">
                  <td className="px-3 py-1.5 text-slate-200">{i.company}</td>
                  <td className="px-3 text-slate-300 truncate max-w-md">{i.role}</td>
                  <td className="px-3">
                    <span className="text-xs mono text-slate-400">{i.outcome ?? '—'}</span>
                    {i.score && <span className="text-xs mono text-accent-300 ml-2">{i.score}</span>}
                  </td>
                  <td className="px-3 text-slate-400 mono">{i.processedAt ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
