'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  kind: 'script' | 'ai';
  id: string;
  label: string;
  className?: string;
  size?: 'sm' | 'md';
  variant?: 'primary' | 'secondary' | 'danger';
  fields?: Array<{ name: string; label: string; placeholder?: string; default?: string; required?: boolean; type?: 'text' | 'number'; rows?: number }>;
  defaultArgs?: Record<string, string>;
  onComplete?: (jobId: string) => void;
}

export function RunJobButton({ kind, id, label, className = '', size = 'sm', variant = 'primary', fields = [], defaultArgs, onComplete }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [args, setArgs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.name] = f.default ?? '';
    if (defaultArgs) Object.assign(init, defaultArgs);
    return init;
  });

  async function run() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, id, args }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const job = await res.json();
      setShowForm(false);
      if (onComplete) {
        onComplete(job.id);
      } else {
        startTransition(() => router.push(`/jobs/${job.id}`));
      }
    } finally {
      setBusy(false);
    }
  }

  const sizeCls = size === 'sm' ? 'text-xs px-2.5 py-1' : 'text-sm px-3 py-1.5';
  const variantCls = variant === 'primary'
    ? 'bg-accent-500 hover:bg-accent-400 text-white'
    : variant === 'danger'
      ? 'bg-rose-700/40 hover:bg-rose-700/60 text-rose-200 border border-rose-700/60'
      : 'bg-ink-800 hover:bg-ink-700 text-slate-200 border border-ink-700';
  const state = busy || pending;

  if (!showForm) {
    return (
      <button
        type="button"
        onClick={() => fields.length > 0 ? setShowForm(true) : run()}
        disabled={state}
        className={`${sizeCls} ${variantCls} rounded font-medium disabled:opacity-50 ${className}`}
      >
        {state ? 'starting…' : label}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-accent-500/40 bg-ink-900/80 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-200">{label}</span>
        <button type="button" onClick={() => setShowForm(false)} className="text-xs text-slate-500 hover:text-slate-300">× cancel</button>
      </div>
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase tracking-wider text-slate-500">{f.label}{f.required ? ' *' : ''}</span>
          {f.rows && f.rows > 1 ? (
            <textarea
              rows={f.rows}
              value={args[f.name] ?? ''}
              onChange={(e) => setArgs((a) => ({ ...a, [f.name]: e.target.value }))}
              placeholder={f.placeholder}
              className="bg-ink-950 border border-ink-800 rounded px-2 py-1 text-slate-200 text-sm"
            />
          ) : (
            <input
              type={f.type ?? 'text'}
              value={args[f.name] ?? ''}
              onChange={(e) => setArgs((a) => ({ ...a, [f.name]: e.target.value }))}
              placeholder={f.placeholder}
              className="bg-ink-950 border border-ink-800 rounded px-2 py-1 text-slate-200 text-sm"
            />
          )}
        </label>
      ))}
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={run}
          disabled={state}
          className={`${sizeCls} ${variantCls} rounded font-medium disabled:opacity-50`}
        >
          {state ? 'starting…' : 'Run'}
        </button>
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
