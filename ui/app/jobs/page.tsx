import Link from 'next/link';
import { getRegistry } from '@/lib/jobs/registry';
import { SCRIPTS, AI_SCRIPTS } from '@/lib/jobs/scripts';
import { RunJobButton } from '@/components/RunJobButton';

export const dynamic = 'force-dynamic';

function formatRelative(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(ts).toLocaleString();
}

export default function JobsPage() {
  const registry = getRegistry();
  const recent = registry.list();
  const busy = registry.isBusy();

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Jobs</h1>
          <p className="text-slate-400 text-sm mt-1">
            Trigger CLI scripts and AI modes from the UI. {busy ? <span className="text-amber-300">A job is running.</span> : 'Idle.'}
          </p>
        </div>
      </div>

      <section>
        <h2 className="font-semibold text-slate-200 mb-3">Scripts · {SCRIPTS.length}</h2>
        <p className="text-xs text-slate-500 mb-3">Spawn <code className="mono">node &lt;script&gt;</code> against <code className="mono">CAREER_OPS_ROOT</code>. Live log streams back to this page.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SCRIPTS.map((s) => (
            <article key={s.id} className="rounded-lg border border-ink-800 bg-ink-900/60 p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-200">{s.label}</h3>
                  <p className="text-xs text-slate-400 mt-1">{s.description}</p>
                  <p className="text-xs text-slate-500 mono mt-1">{s.script}{s.paramFields.length > 0 ? ` · ${s.paramFields.length} param${s.paramFields.length === 1 ? '' : 's'}` : ''}</p>
                </div>
                <RunJobButton
                  kind="script"
                  id={s.id}
                  label="Run"
                  fields={s.paramFields.map((p) => ({
                    name: p.name,
                    label: p.label,
                    placeholder: 'default',
                    type: p.kind === 'number' ? 'number' : 'text',
                  }))}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-slate-200 mb-3">AI modes · {AI_SCRIPTS.length}</h2>
        <p className="text-xs text-slate-500 mb-3">
          Spawn a headless CLI agent with the matching <code className="mono">modes/&lt;mode&gt;.md</code> loaded as system prompt. CLI order: opencode → claude → codex.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {AI_SCRIPTS.map((s) => (
            <article key={s.id} className="rounded-lg border border-ink-800 bg-ink-900/60 p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-200">{s.label}</h3>
                  <p className="text-xs text-slate-400 mt-1">{s.description}</p>
                  <p className="text-xs text-slate-500 mono mt-1">mode: {s.mode} · {s.contextFields.length} field{s.contextFields.length === 1 ? '' : 's'}</p>
                </div>
                <RunJobButton
                  kind="ai"
                  id={s.id}
                  label="Run"
                  fields={s.contextFields.map((f) => ({
                    name: f.name,
                    label: f.label,
                    placeholder: f.placeholder,
                    required: 'required' in f ? f.required : undefined,
                    rows: 'rows' in f ? f.rows : undefined,
                    type: f.kind === 'number' ? 'number' : 'text',
                  }))}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-slate-200 mb-3">Recent jobs · {recent.length}</h2>
        {recent.length === 0 ? (
          <p className="text-slate-500 text-sm">No jobs have run yet.</p>
        ) : (
          <div className="rounded-lg border border-ink-800 bg-ink-900/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 border-b border-ink-800 bg-ink-950/40">
                  <th className="px-3 py-2 text-left">Label</th>
                  <th className="px-3 text-left">Kind</th>
                  <th className="px-3 text-left">Status</th>
                  <th className="px-3 text-left">Started</th>
                  <th className="px-3 text-left">Duration</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((j) => {
                  const dur = j.finishedAt
                    ? `${Math.round((j.finishedAt - j.startedAt) / 1000)}s`
                    : j.status === 'running'
                      ? `${Math.round((Date.now() - j.startedAt) / 1000)}s (live)`
                      : '—';
                  return (
                    <tr key={j.id} className="border-b border-ink-800/50 hover:bg-ink-800/30">
                      <td className="px-3 py-2">
                        <Link href={`/jobs/${j.id}`} className="hover:underline text-slate-200">
                          {j.label}
                        </Link>
                      </td>
                      <td className="px-3 text-slate-400 mono text-xs">{j.kind}</td>
                      <td className="px-3">
                        <JobStatusPill status={j.status} exitCode={j.exitCode} />
                      </td>
                      <td className="px-3 text-slate-400 mono text-xs">{formatRelative(j.startedAt)}</td>
                      <td className="px-3 text-slate-400 mono text-xs">{dur}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function JobStatusPill({ status, exitCode }: { status: string; exitCode: number | null }) {
  const colors: Record<string, string> = {
    queued: 'bg-slate-700/60 text-slate-200',
    running: 'bg-blue-700/40 text-blue-200',
    done: 'bg-emerald-700/40 text-emerald-200',
    failed: 'bg-rose-700/40 text-rose-200',
    cancelled: 'bg-amber-700/40 text-amber-200',
    timeout: 'bg-amber-700/40 text-amber-200',
  };
  const label = exitCode !== null && status === 'done' ? `${status} (${exitCode})` : status;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${colors[status] ?? ''}`}>
      {label}
    </span>
  );
}
