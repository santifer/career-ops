export function FunnelChart({ evaluated, applied, responded, interview, offer }: {
  evaluated: number; applied: number; responded: number; interview: number; offer: number
}) {
  const max = evaluated || 1
  const stages = [
    { label: 'Evaluated', count: evaluated, color: 'bg-stone-200' },
    { label: 'Applied',   count: applied,   color: 'bg-stone-400' },
    { label: 'Responded', count: responded,  color: 'bg-amber-400' },
    { label: 'Interview', count: interview,  color: 'bg-emerald-400' },
    { label: 'Offer',     count: offer,      color: 'bg-emerald-600' },
  ]
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <div className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Application funnel</div>
      <div className="space-y-2">
        {stages.map(s => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="w-20 text-xs text-stone-500 text-right">{s.label}</div>
            <div className="flex-1 h-4 bg-stone-100 rounded overflow-hidden">
              <div className={`h-full ${s.color} rounded`} style={{ width: `${(s.count / max) * 100}%` }} />
            </div>
            <div className="w-6 text-xs text-stone-500">{s.count}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
