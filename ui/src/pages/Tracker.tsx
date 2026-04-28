import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { parseApplications, type Application } from '@/lib/parsers/applications'
import { ScoreBadge } from '@/components/ScoreBadge'

const STATUSES = ['Evaluated','Applied','Responded','Interview','Offer','Rejected','Discarded','SKIP']

type SortKey = 'date' | 'score' | 'company'

export function Tracker() {
  const [apps, setApps] = useState<Application[]>([])
  const [localStatus, setLocalStatus] = useState<Record<number, string>>({})
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    api.applications().then(({ content }) => setApps(parseApplications(content)))
  }, [])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...apps].sort((a, b) => {
    const cmp =
      sortKey === 'date' ? a.date.localeCompare(b.date) :
      sortKey === 'score' ? (a.score ?? 0) - (b.score ?? 0) :
      a.company.localeCompare(b.company)
    return sortDir === 'asc' ? cmp : -cmp
  })

  async function handleStatus(app: Application, status: string) {
    setLocalStatus(s => ({ ...s, [app.number]: status }))
    await api.updateStatus(app.number, status)
  }

  const Th = ({ label, k }: { label: string; k?: SortKey }) => (
    <th onClick={() => k && toggleSort(k)}
        className={`px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide ${k ? 'cursor-pointer hover:text-stone-800 select-none' : ''}`}>
      {label}{k && sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  )

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Tracker</h1>
        <p className="text-sm text-stone-400 mt-0.5">{apps.length} applications</p>
      </div>

      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <Th label="#" />
              <Th label="Date" k="date" />
              <Th label="Company" k="company" />
              <Th label="Role" />
              <Th label="Score" k="score" />
              <Th label="Status" />
              <Th label="Report" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {sorted.map(app => {
              const status = localStatus[app.number] ?? app.status
              return (
                <tr key={app.number} className="hover:bg-stone-50/50">
                  <td className="px-3 py-2 text-xs text-stone-300">{String(app.number).padStart(3,'0')}</td>
                  <td className="px-3 py-2 text-xs text-stone-400">{app.date}</td>
                  <td className="px-3 py-2 font-medium text-stone-800">{app.company}</td>
                  <td className="px-3 py-2 text-stone-600 max-w-xs truncate">{app.role}</td>
                  <td className="px-3 py-2"><ScoreBadge score={app.score} /></td>
                  <td className="px-3 py-2">
                    <select value={status} onChange={e => handleStatus(app, e.target.value)}
                            className="text-xs border border-stone-200 rounded px-1.5 py-0.5 focus:outline-none">
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {app.reportNumber
                      ? <Link to={`/reports/${app.reportNumber}`} className="text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2">#{app.reportNumber}</Link>
                      : <span className="text-xs text-stone-300">—</span>
                    }
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-stone-400">No applications yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
