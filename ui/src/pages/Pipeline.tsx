import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { parsePipeline, type PipelineEntry } from '@/lib/parsers/pipeline'

export function Pipeline() {
  const [entries, setEntries] = useState<PipelineEntry[]>([])
  const [filter, setFilter] = useState('')
  const [source, setSource] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.pipeline().then(({ content }) => setEntries(parsePipeline(content)))
  }, [])

  const sources = ['all', ...Array.from(new Set(entries.map(e => e.source))).sort()]

  const visible = entries.filter(e => {
    if (hidden.has(e.url)) return false
    if (e.done || e.skipped) return false
    if (filter && !`${e.company} ${e.role}`.toLowerCase().includes(filter.toLowerCase())) return false
    if (source !== 'all' && e.source !== source) return false
    return true
  })

  async function mark(url: string, action: 'done' | 'skip') {
    setHidden(h => new Set([...h, url]))
    await api.markPipeline(url, action)
  }

  async function bulkSkip() {
    const urls = Array.from(selected)
    setSelected(new Set())
    await Promise.all(urls.map(url => mark(url, 'skip')))
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(visible.map(e => e.url)) : new Set())
  }

  const pending = entries.filter(e => !e.done && !e.skipped && !hidden.has(e.url)).length

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Pipeline</h1>
        <p className="text-sm text-stone-400 mt-0.5">{pending} pending evaluations</p>
      </div>

      <div className="flex gap-2">
        <input type="text" placeholder="Filter by company or role…" value={filter}
          onChange={e => setFilter(e.target.value)}
          className="border border-stone-200 rounded px-2 py-1.5 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-stone-400" />
        <select value={source} onChange={e => setSource(e.target.value)}
          className="border border-stone-200 rounded px-2 py-1.5 text-sm focus:outline-none">
          {sources.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-stone-900 text-white rounded text-xs">
          <span>{selected.size} selected</span>
          <button onClick={bulkSkip} className="ml-auto px-2 py-1 bg-white/10 rounded hover:bg-white/20">Skip selected</button>
          <button onClick={() => setSelected(new Set())} className="px-2 py-1 bg-white/10 rounded hover:bg-white/20">Clear</button>
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="w-8 px-3 py-2 text-left">
                <input type="checkbox" onChange={e => toggleAll(e.target.checked)} />
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Company</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Role</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Source</th>
              <th className="w-16 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {visible.map(e => (
              <tr key={e.url} className="hover:bg-stone-50/50">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.has(e.url)} onChange={() => {
                    setSelected(s => { const n = new Set(s); n.has(e.url) ? n.delete(e.url) : n.add(e.url); return n })
                  }} />
                </td>
                <td className="px-3 py-2 font-medium text-stone-800">{e.company}</td>
                <td className="px-3 py-2 text-stone-600">
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{e.role}</a>
                </td>
                <td className="px-3 py-2 text-xs text-stone-400">{e.source}</td>
                <td className="px-3 py-2">
                  <button onClick={() => mark(e.url, 'skip')}
                    className="px-2 py-1 text-xs border border-stone-200 rounded hover:bg-stone-50">
                    Skip
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-stone-400">No pending jobs match your filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
