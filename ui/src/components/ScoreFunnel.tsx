export function ScoreFunnel({ high, mid, low }: { high: number; mid: number; low: number }) {
  const total = high + mid + low || 1
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <div className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-3">Score distribution</div>
      <div className="space-y-2">
        {[
          { label: '≥ 4.0', count: high, color: 'bg-emerald-500' },
          { label: '3.5–3.9', count: mid, color: 'bg-amber-400' },
          { label: '< 3.5', count: low, color: 'bg-stone-300' },
        ].map(({ label, count, color }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-16 text-xs text-stone-500 text-right">{label}</div>
            <div className="flex-1 h-3 bg-stone-100 rounded-full overflow-hidden">
              <div className={`h-full ${color} rounded-full`} style={{ width: `${(count / total) * 100}%` }} />
            </div>
            <div className="w-6 text-xs text-stone-500">{count}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
