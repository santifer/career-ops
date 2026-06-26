'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  current: string;
  options: string[];
  number: number;
}

export function StatusEditor({ current, options, number }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(current);

  async function submit(newStatus: string) {
    setError(null);
    setValue(newStatus);
    const res = await fetch(`/api/applications/${number}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Unknown error' }));
      setError(body.error ?? `HTTP ${res.status}`);
      setValue(current);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2 items-center">
        <span className="text-xs uppercase tracking-wider text-slate-500">Status</span>
        <select
          value={value}
          disabled={pending}
          onChange={(e) => submit(e.target.value)}
          className="bg-ink-800 border border-ink-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent-500 disabled:opacity-50"
        >
          {options.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {pending && <span className="text-xs text-slate-500">saving…</span>}
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
