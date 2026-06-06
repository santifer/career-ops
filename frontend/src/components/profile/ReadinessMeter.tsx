import type { ReadinessResult } from '../../lib/readiness';

type Props = {
  readiness: ReadinessResult;
};

export function ReadinessMeter({ readiness }: Props) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-semibold">Profile readiness</span>
        <span className="text-2xl font-bold">{readiness.score}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-all duration-200"
          style={{ width: `${readiness.score}%` }}
        />
      </div>

      {/* Missing fields */}
      {readiness.missing.length > 0 && (
        <div className="mt-2">
          <span className="text-sm text-muted">Missing: </span>
          <span className="text-sm text-muted">
            {readiness.missing.slice(0, 4).join(', ')}
            {readiness.missing.length > 4 && ` +${readiness.missing.length - 4} more`}
          </span>
        </div>
      )}
    </div>
  );
}
