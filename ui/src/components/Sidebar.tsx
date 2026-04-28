import { NavLink } from 'react-router-dom'
import { LayoutDashboard, List, Kanban, FileText, Terminal, BarChart2 } from 'lucide-react'
import { clsx } from 'clsx'

const NAV = [
  { to: '/',         label: 'Overview', icon: LayoutDashboard },
  { to: '/pipeline', label: 'Pipeline', icon: List },
  { to: '/tracker',  label: 'Tracker',  icon: Kanban },
  { to: '/reports',  label: 'Reports',  icon: FileText },
  { to: '/actions',  label: 'Actions',  icon: Terminal },
  { to: '/patterns', label: 'Patterns', icon: BarChart2 },
]

export function Sidebar() {
  return (
    <aside className="w-44 shrink-0 border-r border-stone-200 bg-white flex flex-col py-4 gap-1 px-2">
      <div className="px-2 mb-4">
        <span className="text-sm font-bold tracking-tight text-stone-900">career-ops</span>
      </div>
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'}
          className={({ isActive }) => clsx(
            'flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium transition-colors',
            isActive ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900',
          )}>
          <Icon size={14} />{label}
        </NavLink>
      ))}
    </aside>
  )
}
