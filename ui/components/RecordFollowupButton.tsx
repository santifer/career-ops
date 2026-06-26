'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  appNumber: number;
  company: string;
  role: string;
  onClose: () => void;
}

export function RecordFollowupButton({ appNumber, company, role, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [channel, setChannel] = useState<'Email' | 'LinkedIn' | 'Other'>('Email');
  const [contact, setContact] = useState('');
  const [notes, setNotes] = useState('First follow-up');
  const [saved, setSaved] = useState(false);

  async function submit() {
    setError(null);
    setSaved(false);
    const res = await fetch('/api/follow-ups/record', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appNumber, date, company, role, channel, contact, notes }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Unknown error' }));
      setError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    setSaved(true);
    startTransition(() => router.refresh());
    setTimeout(() => {
      setOpen(false);
      onClose();
    }, 800);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs bg-emerald-700/40 hover:bg-emerald-700/60 text-emerald-200 border border-emerald-700/60 rounded px-3 py-1.5"
      >
        ✓ Record follow-up
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-700/60 bg-emerald-950/20 p-4 space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-slate-500">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-ink-900 border border-ink-800 rounded px-2 py-1 text-slate-200"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-slate-500">Channel</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as 'Email' | 'LinkedIn' | 'Other')}
            className="bg-ink-900 border border-ink-800 rounded px-2 py-1 text-slate-200"
          >
            <option>Email</option>
            <option>LinkedIn</option>
            <option>Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-xs uppercase tracking-wider text-slate-500">Contact</span>
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="recruiter name, hiring manager, link…"
            className="bg-ink-900 border border-ink-800 rounded px-2 py-1 text-slate-200"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs uppercase tracking-wider text-slate-500">Notes</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="brief description"
          className="bg-ink-900 border border-ink-800 rounded px-2 py-1 text-slate-200"
        />
      </label>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {saved && <p className="text-xs text-emerald-300">Saved to data/follow-ups.md</p>}
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="bg-emerald-600 hover:bg-emerald-500 text-white rounded px-3 py-1.5 disabled:opacity-50"
        >
          {pending ? 'saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); onClose(); }}
          className="text-slate-400 hover:text-slate-200 rounded px-3 py-1.5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
