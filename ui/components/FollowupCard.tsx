'use client';

import { useState } from 'react';
import Link from 'next/link';
import { StatusPill } from './StatusPill';
import { RecordFollowupButton } from './RecordFollowupButton';
import type { FollowupCardData } from './followup-shared';
export type { FollowupCardData } from './followup-shared';
export { normalizeStatus, sortFollowups } from './followup-shared';

export function FollowupCard({ entry }: { entry: FollowupCardData }) {
  const [recordOpen, setRecordOpen] = useState(false);

  return (
    <article className={`rounded-lg border p-4 ${cardStyle(entry.urgency)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/applications/${entry.num}`} className="text-lg font-semibold hover:underline">
              <span className="text-accent-300">{entry.company}</span>
            </Link>
            <span className="text-slate-300 truncate">— {entry.role}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 text-sm text-slate-400">
            <span className="mono">#{entry.num}</span>
            <span>·</span>
            <span className="mono">{entry.date}</span>
            <span>·</span>
            <StatusPill status={entry.statusDisplay} />
            {entry.score && (
              <>
                <span>·</span>
                <span className="mono">{entry.score}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <UrgencyBadge urgency={entry.urgency} />
          {entry.daysUntilNext !== null && entry.daysUntilNext < 0 && (
            <p className="text-xs text-slate-400 mono mt-1">
              {Math.abs(entry.daysUntilNext)}d overdue
            </p>
          )}
          {entry.daysUntilNext !== null && entry.daysUntilNext >= 0 && (
            <p className="text-xs text-slate-400 mono mt-1">
              due in {entry.daysUntilNext}d
            </p>
          )}
        </div>
      </div>

      {entry.notes && (
        <p className="text-sm text-slate-300 mt-3 border-l-2 border-ink-700 pl-3 line-clamp-2">
          {entry.notes}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-3 text-xs text-slate-400 items-center">
        <span className="mono">applied {entry.appliedDate ?? '—'}</span>
        {entry.daysSinceApplication !== null && (
          <>
            <span>·</span>
            <span>{entry.daysSinceApplication}d ago</span>
          </>
        )}
        <span>·</span>
        <span>
          {entry.followupCount === 0
            ? 'no follow-ups yet'
            : `${entry.followupCount} follow-up${entry.followupCount === 1 ? '' : 's'}`}
        </span>
        {entry.contacts.length > 0 && (
          <>
            <span>·</span>
            <span>contacts: {entry.contacts.join(', ')}</span>
          </>
        )}
        <button
          type="button"
          onClick={() => setRecordOpen((v) => !v)}
          className="ml-auto text-xs text-slate-500 hover:text-accent-300 border border-ink-800 hover:border-accent-500 rounded px-2 py-0.5"
        >
          {recordOpen ? '× close' : '+ record'}
        </button>
      </div>

      {recordOpen && (
        <RecordFollowupButton
          appNumber={entry.num}
          company={entry.company}
          role={entry.role}
          onClose={() => setRecordOpen(false)}
        />
      )}
    </article>
  );
}

function cardStyle(u: string): string {
  switch (u) {
    case 'urgent': return 'border-amber-700/50 bg-amber-950/20';
    case 'overdue': return 'border-rose-700/50 bg-rose-950/20';
    case 'waiting': return 'border-emerald-700/40 bg-emerald-950/10';
    case 'cold': return 'border-slate-700/40 bg-slate-900/40';
    default: return 'border-ink-800 bg-ink-900/60';
  }
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  const colors: Record<string, string> = {
    urgent: 'bg-amber-700/40 text-amber-200 border-amber-700/60',
    overdue: 'bg-rose-700/40 text-rose-200 border-rose-700/60',
    waiting: 'bg-emerald-700/40 text-emerald-200 border-emerald-700/60',
    cold: 'bg-slate-700/60 text-slate-300 border-slate-700/60',
  };
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs uppercase tracking-wider ${colors[urgency] ?? ''}`}>
      {urgency}
    </span>
  );
}
