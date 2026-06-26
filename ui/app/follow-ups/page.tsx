import Link from 'next/link';
import { getFollowups } from '@/lib/followups';
import { getFollowupHistory } from '@/lib/followups-history';
import { FollowupCard, type FollowupCardData } from '@/components/FollowupCard';
import { sortFollowups, normalizeStatus } from '@/components/followup-shared';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function FollowUpsPage() {
  const data = getFollowups();
  const { metadata, entries, cadenceConfig } = data;

  const history = getFollowupHistory();
  const historyByApp = new Map<number, number>();
  for (const h of history) {
    historyByApp.set(h.appNumber, (historyByApp.get(h.appNumber) ?? 0) + 1);
  }

  const cards: FollowupCardData[] = entries.map((e) => ({
    num: e.num,
    date: e.date,
    company: e.company,
    role: e.role,
    status: e.status,
    statusDisplay: normalizeStatus(e.status),
    score: e.score,
    notes: e.notes,
    appliedDate: e.appliedDate,
    daysSinceApplication: e.daysSinceApplication,
    daysUntilNext: e.daysUntilNext,
    followupCount: historyByApp.get(e.num) ?? e.followupCount,
    urgency: e.urgency,
    contacts: e.contacts,
  }));

  const ordered = sortFollowups(cards);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Follow-ups</h1>
        <p className="text-slate-400 text-sm mt-1">
          Cadence checked {metadata.analysisDate} · {metadata.totalTracked} tracked ·{' '}
          <span className="text-rose-300">{metadata.overdue} overdue</span>
          {metadata.urgent > 0 && <> · <span className="text-amber-300">{metadata.urgent} urgent</span></>}
          {metadata.cold > 0 && <> · <span className="text-slate-400">{metadata.cold} cold</span></>}
          {metadata.waiting > 0 && <> · <span className="text-emerald-300">{metadata.waiting} waiting</span></>}
        </p>
        {cadenceConfig && (
          <p className="text-slate-500 text-xs mt-1 mono">
            cadence: applied_first {cadenceConfig.applied_first ?? 7}d · applied_subsequent {cadenceConfig.applied_subsequent ?? 7}d · responded_subsequent {cadenceConfig.responded_subsequent ?? 3}d · interview_thankyou {cadenceConfig.interview_thankyou ?? 1}d
          </p>
        )}
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Overdue" value={metadata.overdue} accent="rose" />
        <Stat label="Urgent" value={metadata.urgent} accent="amber" />
        <Stat label="Waiting" value={metadata.waiting} accent="emerald" />
        <Stat label="Cold" value={metadata.cold} accent="slate" />
      </section>

      {history.length > 0 && (
        <section className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
          <h2 className="font-semibold text-slate-200 mb-3">
            Recorded follow-ups · {history.length}
          </h2>
          <div className="rounded border border-ink-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 border-b border-ink-800 bg-ink-950/40">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 text-left">App</th>
                  <th className="px-3 text-left">Date</th>
                  <th className="px-3 text-left">Company</th>
                  <th className="px-3 text-left">Channel</th>
                  <th className="px-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {history.slice().reverse().slice(0, 10).map((h) => (
                  <tr key={h.number} className="border-b border-ink-800/50">
                    <td className="px-3 py-1.5 mono text-slate-400">{h.number}</td>
                    <td className="px-3">
                      <Link href={`/applications/${h.appNumber}`} className="mono text-accent-300 hover:underline">#{h.appNumber}</Link>
                    </td>
                    <td className="px-3 mono text-slate-400">{h.date}</td>
                    <td className="px-3 text-slate-200">{h.company}</td>
                    <td className="px-3"><span className="text-xs text-slate-400">{h.channel}</span></td>
                    <td className="px-3 text-slate-300 truncate max-w-xs">{h.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {ordered.length === 0 && (
        <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/30 p-6 text-center text-emerald-200">
          No follow-ups needed.
        </div>
      )}

      {ordered.length > 0 && (
        <section className="space-y-3">
          {ordered.map((e) => (
            <FollowupCard key={e.num} entry={e} />
          ))}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: 'rose' | 'amber' | 'emerald' | 'slate' }) {
  const colors: Record<string, string> = {
    rose: 'text-rose-300',
    amber: 'text-amber-300',
    emerald: 'text-emerald-300',
    slate: 'text-slate-300',
  };
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-3xl font-bold mt-2 ${colors[accent]}`}>{value}</p>
    </div>
  );
}
