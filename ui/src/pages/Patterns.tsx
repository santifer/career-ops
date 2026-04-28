import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { parseApplications, type Application } from '@/lib/parsers/applications'
import { ScoreHistogram } from '@/components/charts/ScoreHistogram'
import { FunnelChart } from '@/components/charts/FunnelChart'

export function Patterns() {
  const [apps, setApps] = useState<Application[]>([])

  useEffect(() => {
    api.patterns().then(({ content }) => setApps(parseApplications(content)))
  }, [])

  const by = (...statuses: string[]) => apps.filter(a => statuses.includes(a.status)).length

  const companies = Object.entries(
    apps.reduce<Record<string, number[]>>((acc, a) => {
      acc[a.company] = [...(acc[a.company] ?? []), ...(a.score !== null ? [a.score] : [])]
      return acc
    }, {})
  ).map(([name, scores]) => ({
    name, count: apps.filter(a => a.company === name).length,
    avg: scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : null,
  })).sort((a, b) => b.count - a.count).slice(0, 15)

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Patterns</h1>
        <p className="text-sm text-stone-400">{apps.length} evaluations</p>
      </div>

      {apps.length === 0
        ? <div className="bg-white border border-stone-200 rounded-lg px-4 py-8 text-center text-sm text-stone-400">No evaluations yet.</div>
        : <>
            <div className="grid grid-cols-2 gap-4">
              <ScoreHistogram apps={apps} />
              <FunnelChart evaluated={apps.length}
                applied={by('Applied','Responded','Interview','Offer')}
                responded={by('Responded','Interview','Offer')}
                interview={by('Interview','Offer')}
                offer={by('Offer')} />
            </div>

            <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100">
                <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Top companies</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs text-stone-500 font-semibold uppercase tracking-wide">Company</th>
                    <th className="px-4 py-2 text-right text-xs text-stone-500 font-semibold uppercase tracking-wide">Evaluations</th>
                    <th className="px-4 py-2 text-right text-xs text-stone-500 font-semibold uppercase tracking-wide">Avg Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {companies.map(c => (
                    <tr key={c.name} className="hover:bg-stone-50">
                      <td className="px-4 py-2 font-medium text-stone-800">{c.name}</td>
                      <td className="px-4 py-2 text-right text-stone-500">{c.count}</td>
                      <td className="px-4 py-2 text-right text-xs font-semibold">
                        {c.avg !== null
                          ? <span className={c.avg >= 4 ? 'text-emerald-600' : c.avg >= 3.5 ? 'text-amber-600' : 'text-stone-400'}>{c.avg.toFixed(1)}</span>
                          : <span className="text-stone-300">—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
      }
    </div>
  )
}
