import { useState } from 'react';
import type { ReadinessResult } from '../../lib/readiness';

type Props = {
  readiness: ReadinessResult;
};

export function ReadinessMeter({ readiness }: Props) {
  const [showAllMissing, setShowAllMissing] = useState(false);
  const sortedMissing = [...readiness.missingItems].sort((a, b) => {
    if (a.priority === b.priority) return 0;
    return a.priority === 'critical' ? -1 : 1;
  });
  const visibleMissing = showAllMissing ? sortedMissing : sortedMissing.slice(0, 5);
  const hiddenCount = sortedMissing.length - visibleMissing.length;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-semibold">Profile readiness</span>
        <span className="text-2xl font-bold tabular-nums">{readiness.score}%</span>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-label="Profile readiness"
        aria-valuenow={readiness.score}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-200"
          style={{ width: `${readiness.score}%` }}
        />
      </div>

      <div className="mt-2 text-sm text-muted">
        {readiness.filled} of {readiness.total} knowledge areas are ready for evaluation.
      </div>

      {sortedMissing.length > 0 ? (
        <div className="mt-3 rounded-lg border border-border bg-bg/70 p-3">
          <div className="mb-2 text-sm font-semibold">Next details to teach the agent</div>
          <ul className="space-y-2">
            {visibleMissing.map(item => (
              <li key={item.label} className="text-sm leading-relaxed">
                <span className={item.priority === 'critical' ? 'font-medium text-ink' : 'font-medium'}>
                  {item.label}:
                </span>{' '}
                <span className="text-muted">{item.missing.join(', ')}</span>
              </li>
            ))}
          </ul>
          {(hiddenCount > 0 || showAllMissing) && (
            <button
              type="button"
              aria-expanded={showAllMissing}
              onClick={() => setShowAllMissing(value => !value)}
              className="mt-2 rounded text-sm font-medium text-primary transition-colors duration-150 hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {showAllMissing ? 'Show less' : `+${hiddenCount} more`}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-success/30 bg-success-subtle p-3 text-sm text-success">
          Ready to evaluate job URLs with the full career-ops pipeline.
        </div>
      )}
    </div>
  );
}
