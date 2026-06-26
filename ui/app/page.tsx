import Link from 'next/link';
import fs from 'node:fs';
import path from 'node:path';
import { getPipeline, getCareerOpsRoot } from '@/lib/pipeline';
import { StatusFunnel } from '@/components/StatusFunnel';
import { ScoreHistogram } from '@/components/ScoreHistogram';
import { ApplicationsTimeline } from '@/components/ApplicationsTimeline';
import { StatusPill } from '@/components/StatusPill';
import { RunJobButton } from '@/components/RunJobButton';
import { getFollowups } from '@/lib/followups';

export const dynamic = 'force-dynamic';

function loadProfileScoreThreshold(root: string): number {
  try {
    const profilePath = path.join(root, 'config', 'profile.yml');
    if (!fs.existsSync(profilePath)) return 3.7;
    const raw = fs.readFileSync(profilePath, 'utf-8');
    const match = /auto_pdf_score_threshold:\s*([\d.]+)/.exec(raw);
    return match ? Number.parseFloat(match[1]) : 3.7;
  } catch {
    return 3.7;
  }
}

function lastEightWeeks(rows: Array<{ date: string }>): Array<{ week: string; count: number }> {
  const buckets = new Map<string, number>();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = 7; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i * 7);
    const key = isoWeekKey(d);
    buckets.set(key, 0);
  }
  for (const r of rows) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.date);
    if (!m) continue;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if ((today.getTime() - d.getTime()) / 86400000 > 7 * 8) continue;
    const key = isoWeekKey(d);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([week, count]) => ({ week, count }));
}

function isoWeekKey(d: Date): string {
  const year = d.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.floor((d.getTime() - startOfYear.getTime()) / 86400000);
  const week = Math.floor(dayOfYear / 7) + 1;
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

export default function Home() {
  const root = getCareerOpsRoot();
  const minScore = loadProfileScoreThreshold(root);
  const { rows, stats } = getPipeline({ limit: 10000 });
  const followups = getFollowups();

  const total = rows.length;
  const applied = stats.byStatus['Applied'] ?? 0;
  const interview = (stats.byStatus['Interview'] ?? 0) + (stats.byStatus['Responded'] ?? 0);
  const offer = stats.byStatus['Offer'] ?? 0;
  const avgScore = rows
    .map((r) => r.score)
    .filter((s): s is number => s != null);
  const avg = avgScore.length ? avgScore.reduce((a, b) => a + b, 0) / avgScore.length : 0;

  const timeline = lastEightWeeks(rows);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Visual layer over your <code className="mono">data/applications.md</code>. Source of truth stays in markdown — this UI only reads and writes via the same scripts the CLI agent uses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {followups.metadata.overdue > 0 && (
            <Link
              href="/follow-ups"
              className="text-sm bg-rose-700/30 hover:bg-rose-700/50 text-rose-200 border border-rose-700/60 rounded px-3 py-1.5"
            >
              {followups.metadata.overdue} follow-up{followups.metadata.overdue === 1 ? '' : 's'} overdue →
            </Link>
          )}
        </div>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Kpi label="Total" value={total} />
        <Kpi label="Applied" value={applied} accent="blue" />
        <Kpi label="Resp. / Int." value={interview} accent="violet" />
        <Kpi label="Offers" value={offer} accent="emerald" />
        <Kpi label="Avg score" value={avg ? avg.toFixed(2) : '—'} accent="amber" suffix={avg ? '/5' : ''} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-200">Status funnel</h2>
            <span className="text-xs text-slate-500">all-time</span>
          </div>
          <StatusFunnel data={stats.byStatus} />
        </div>
        <div className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-200">Score distribution</h2>
            <span className="text-xs text-slate-500">{rows.filter((r) => r.score != null).length} scored</span>
          </div>
          <ScoreHistogram data={stats.byScoreBucket} minScore={minScore} />
        </div>
      </section>

      <section className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-200">Applications per week</h2>
          <span className="text-xs text-slate-500">last 8 weeks</span>
        </div>
        <ApplicationsTimeline data={timeline} />
      </section>

      <section className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-200">Recent activity</h2>
          <Link href="/pipeline" className="text-accent-300 text-sm hover:underline">View all →</Link>
        </div>
        <RecentTable limit={5} />
      </section>

      <section className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-200">Quick actions</h2>
          <Link href="/jobs" className="text-accent-300 text-sm hover:underline">All jobs →</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <QuickAction
            title="Scan portals"
            desc="Pull fresh job postings from portals.yml"
            kind="script" id="scan"
            label="Scan now"
          />
          <QuickAction
            title="Check liveness"
            desc="Confirm each tracked posting is still live"
            kind="script" id="liveness"
            label="Check"
          />
          <QuickAction
            title="Analyze patterns"
            desc="Funnel conversion, archetype effectiveness"
            kind="script" id="analyze-patterns"
            label="Analyze"
          />
        </div>
      </section>
    </div>
  );
}

function QuickAction({ title, desc, kind, id, label }: { title: string; desc: string; kind: 'script' | 'ai'; id: string; label: string }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-200 text-sm">{title}</h3>
          <p className="text-xs text-slate-400 mt-1">{desc}</p>
        </div>
        <RunJobButton kind={kind} id={id} label={label} variant="secondary" />
      </div>
    </div>
  );
}

function Kpi({ label, value, accent, suffix }: { label: string; value: number | string; accent?: 'blue' | 'violet' | 'emerald' | 'amber'; suffix?: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-300',
    violet: 'text-violet-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
  };
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/60 p-5">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-3xl font-bold mt-2 ${accent ? colors[accent] : 'text-slate-100'}`}>
        {value}
        {suffix && <span className="text-base text-slate-500 ml-1">{suffix}</span>}
      </p>
    </div>
  );
}

function RecentTable({ limit }: { limit: number }) {
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
