'use client';

import { useEffect, useRef, useState } from 'react';

interface LogLine {
  ts: number;
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
}

interface Props {
  jobId: string;
  initialLogs: LogLine[];
  initialStatus: string;
}

export function JobLogStream({ jobId, initialLogs, initialStatus }: Props) {
  const [lines, setLines] = useState<LogLine[]>(initialLogs);
  const [status, setStatus] = useState(initialStatus);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottom = useRef(true);

  useEffect(() => {
    const es = new EventSource(`/api/jobs/${jobId}/logs`);
    es.addEventListener('hello', () => setConnected(true));
    es.addEventListener('log', (ev) => {
      try {
        const line = JSON.parse(ev.data) as LogLine;
        setLines((prev) => {
          const next = [...prev, line];
          if (next.length > 8000) next.splice(0, next.length - 8000);
          return next;
        });
      } catch { /* */ }
    });
    es.addEventListener('state', (ev) => {
      try {
        const s = JSON.parse(ev.data) as { status: string; exitCode: number | null };
        setStatus(s.status);
        setExitCode(s.exitCode);
      } catch { /* */ }
    });
    es.addEventListener('done', (ev) => {
      try {
        const s = JSON.parse(ev.data) as { status: string; exitCode: number | null };
        setStatus(s.status);
        setExitCode(s.exitCode);
      } catch { /* */ }
      es.close();
    });
    es.addEventListener('error', () => setConnected(false));
    return () => es.close();
  }, [jobId]);

  useEffect(() => {
    if (logRef.current && shouldStickToBottom.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  function onScroll() {
    if (!logRef.current) return;
    const el = logRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    shouldStickToBottom.current = atBottom;
  }

  async function cancel() {
    await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <StatusBadge status={status} exitCode={exitCode} />
        <span className="text-xs text-slate-500 mono">
          {connected ? '● live' : '○ disconnected'} · {lines.length} lines
        </span>
        {(status === 'running' || status === 'queued') && (
          <button
            type="button"
            onClick={cancel}
            className="ml-auto text-xs bg-rose-700/40 hover:bg-rose-700/60 text-rose-200 border border-rose-700/60 rounded px-3 py-1"
          >
            Cancel
          </button>
        )}
        {(status === 'done' || status === 'failed' || status === 'cancelled' || status === 'timeout') && (
          <a href="/jobs" className="ml-auto text-xs text-accent-300 hover:underline">
            ← All jobs
          </a>
        )}
      </div>
      <div
        ref={logRef}
        onScroll={onScroll}
        className="rounded-lg border border-ink-800 bg-ink-950/80 font-mono text-xs leading-relaxed overflow-auto p-3"
        style={{ height: '60vh' }}
      >
        {lines.length === 0 && (
          <div className="text-slate-500 italic">Waiting for output…</div>
        )}
        {lines.map((line, i) => (
          <div key={i} className={streamColor(line.stream)}>
            <span className="text-slate-600 mr-2 select-none">{formatTs(line.ts)}</span>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status, exitCode }: { status: string; exitCode: number | null }) {
  const colors: Record<string, string> = {
    queued: 'bg-slate-700/40 text-slate-300 border-slate-700/60',
    running: 'bg-blue-700/40 text-blue-200 border-blue-700/60',
    done: 'bg-emerald-700/40 text-emerald-200 border-emerald-700/60',
    failed: 'bg-rose-700/40 text-rose-200 border-rose-700/60',
    cancelled: 'bg-amber-700/40 text-amber-200 border-amber-700/60',
    timeout: 'bg-amber-700/40 text-amber-200 border-amber-700/60',
  };
  const label = exitCode !== null && status === 'done' ? `${status} (exit ${exitCode})` : status;
  return (
    <span className={`text-xs uppercase tracking-wider border rounded-full px-2.5 py-0.5 ${colors[status] ?? ''}`}>
      {label}
    </span>
  );
}

function streamColor(stream: string): string {
  if (stream === 'stderr') return 'text-rose-200';
  if (stream === 'system') return 'text-slate-400 italic';
  return 'text-slate-200';
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}
