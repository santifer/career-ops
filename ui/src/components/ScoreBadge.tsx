import { clsx } from 'clsx'

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null)
    return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-stone-100 text-stone-400">—</span>
  return (
    <span className={clsx('inline-block px-1.5 py-0.5 rounded text-xs font-semibold',
      score >= 4.0 ? 'bg-emerald-100 text-emerald-800' :
      score >= 3.5 ? 'bg-amber-100 text-amber-800' :
                     'bg-stone-100 text-stone-600')}>
      {score.toFixed(1)}
    </span>
  )
}
