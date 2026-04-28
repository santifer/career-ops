import { useState } from 'react'
import { ActionConsole } from '@/components/ActionConsole'

export function Actions() {
  const [parallel, setParallel] = useState('2')
  const [startFrom, setStartFrom] = useState('0')
  const [minScore, setMinScore] = useState('0')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Actions</h1>
        <p className="text-sm text-stone-400 mt-0.5">Trigger CLI operations and watch live output</p>
      </div>

      <ActionConsole title="Run Scan" description="Scan all configured portals for new job listings" endpoint="/api/stream/scan" />

      <ActionConsole title="Batch Evaluation" description="Evaluate pending jobs with AI workers"
        endpoint="/api/stream/batch" params={{ parallel, startFrom, minScore }}>
        <div className="flex gap-4 text-xs">
          {([
            { label: 'Workers', val: parallel, set: setParallel, type: 'select', opts: ['1','2','3','4','5'] },
            { label: 'Start from', val: startFrom, set: setStartFrom, type: 'number' },
            { label: 'Min score', val: minScore, set: setMinScore, type: 'number', step: '0.1' },
          ] as const).map((field) => (
            <label key={field.label} className="flex items-center gap-1.5 text-stone-600">
              {field.label}
              {field.type === 'select'
                ? <select value={field.val} onChange={e => field.set(e.target.value)} className="border border-stone-200 rounded px-1.5 py-0.5">
                    {field.opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                : <input type="number" step={'step' in field ? field.step : undefined} value={field.val} onChange={e => field.set(e.target.value)}
                         className="border border-stone-200 rounded px-1.5 py-0.5 w-16" />
              }
            </label>
          ))}
        </div>
      </ActionConsole>

      <ActionConsole title="Merge Tracker" description="Merge batch additions into applications.md, then verify" endpoint="/api/stream/merge" />
    </div>
  )
}
