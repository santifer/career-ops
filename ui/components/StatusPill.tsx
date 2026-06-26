'use client';

interface Props {
  status: string;
}

const COLORS: Record<string, string> = {
  Evaluated: 'bg-slate-700/60 text-slate-200',
  Applied: 'bg-blue-700/40 text-blue-200',
  Responded: 'bg-amber-700/40 text-amber-200',
  Interview: 'bg-violet-700/40 text-violet-200',
  Offer: 'bg-emerald-700/40 text-emerald-200',
  Rejected: 'bg-rose-700/40 text-rose-200',
  Discarded: 'bg-zinc-700/40 text-zinc-300',
  SKIP: 'bg-zinc-800/40 text-zinc-400',
};

export function StatusPill({ status }: Props) {
  const color = COLORS[status] ?? 'bg-slate-700/60 text-slate-200';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${color}`}>{status}</span>
  );
}
