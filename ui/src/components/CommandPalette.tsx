import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'

const COMMANDS = [
  { id: 'nav-overview',  label: 'Go to Overview',    group: 'Navigate', to: '/' },
  { id: 'nav-pipeline',  label: 'Go to Pipeline',    group: 'Navigate', to: '/pipeline' },
  { id: 'nav-tracker',   label: 'Go to Tracker',     group: 'Navigate', to: '/tracker' },
  { id: 'nav-reports',   label: 'Go to Reports',     group: 'Navigate', to: '/reports' },
  { id: 'nav-actions',   label: 'Go to Actions',     group: 'Navigate', to: '/actions' },
  { id: 'nav-patterns',  label: 'Go to Patterns',    group: 'Navigate', to: '/patterns' },
  { id: 'run-scan',      label: 'Run Scan',           group: 'Actions',  to: '/actions' },
  { id: 'run-batch',     label: 'Start Batch Eval',  group: 'Actions',  to: '/actions' },
  { id: 'run-merge',     label: 'Merge Tracker',     group: 'Actions',  to: '/actions' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/20" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-white border border-stone-200 rounded-xl shadow-2xl overflow-hidden">
        <Command>
          <Command.Input placeholder="Search or run a command…"
            className="w-full px-4 py-3 text-sm border-b border-stone-100 focus:outline-none" autoFocus />
          <Command.List className="max-h-72 overflow-y-auto py-2">
            <Command.Empty className="px-4 py-6 text-center text-sm text-stone-400">No results.</Command.Empty>
            {['Navigate', 'Actions'].map(group => (
              <Command.Group key={group}>
                <div className="px-3 py-1 text-xs font-semibold text-stone-400 uppercase tracking-wide">{group}</div>
                {COMMANDS.filter(c => c.group === group).map(cmd => (
                  <Command.Item key={cmd.id} value={cmd.label}
                    onSelect={() => { setOpen(false); navigate(cmd.to) }}
                    className="flex items-center px-3 py-2 text-sm text-stone-700 cursor-pointer rounded mx-1 data-[selected=true]:bg-stone-100">
                    {cmd.label}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
