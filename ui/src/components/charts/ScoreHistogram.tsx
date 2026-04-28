import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { Application } from '@/lib/parsers/applications'

const BUCKETS = [
  { range: '1.0–1.9', min: 1.0, max: 2.0, color: '#a8a29e' },
  { range: '2.0–2.9', min: 2.0, max: 3.0, color: '#a8a29e' },
  { range: '3.0–3.4', min: 3.0, max: 3.5, color: '#a8a29e' },
  { range: '3.5–3.9', min: 3.5, max: 4.0, color: '#f59e0b' },
  { range: '4.0–4.4', min: 4.0, max: 4.5, color: '#10b981' },
  { range: '4.5–5.0', min: 4.5, max: 5.01, color: '#059669' },
]

export function ScoreHistogram({ apps }: { apps: Application[] }) {
  const data = BUCKETS.map(b => ({
    range: b.range, color: b.color,
    count: apps.filter(a => a.score !== null && a.score >= b.min && a.score < b.max).length,
  }))

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <div className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Score distribution</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
          <XAxis dataKey="range" tick={{ fontSize: 9 }} />
          <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
          <Tooltip formatter={(v) => [v, 'Jobs']} />
          <Bar dataKey="count" radius={[2, 2, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
