import { NavLink, Outlet, Link } from 'react-router-dom'
import { Activity, Compass, LayoutDashboard, PlusCircle, Settings as Cog, Store } from 'lucide-react'
import { useEffect } from 'react'
import { Logo } from '../shared/ui'
import { useApi } from '../shared/hooks'

const links = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/campaigns/new', label: 'Create Campaign', icon: PlusCircle },
  { to: '/admin/discovery', label: 'Influencer Discovery', icon: Compass },
  { to: '/admin/agents', label: 'Agent Execution', icon: Activity },
  { to: '/admin/settings', label: 'Settings', icon: Cog },
]

export default function StudioLayout() {
  const health = useApi<{ mode: string; model: string | null; provider: string }>('/health')
  useEffect(() => { window.addEventListener('threadora:settings', health.reload); return () => window.removeEventListener('threadora:settings', health.reload) }, [health.reload])
  return (
    <div className="min-h-screen bg-ice md:flex">
      <a href="#main" className="sr-only-focusable rounded bg-brand px-3 py-2 font-semibold text-ink">Skip to content</a>
      <aside className="border-b border-line bg-white md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-3 md:block md:px-5 md:py-5">
          <Link to="/admin" aria-label="Campaign Studio home"><Logo size={26} /></Link>
          <p className="hidden text-xs font-medium text-muted md:mt-1 md:block">Campaign Studio</p>
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink md:hidden"><Store size={16} aria-hidden="true" />Storefront</Link>
        </div>
        <nav aria-label="Studio" className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-1 md:px-3 md:pb-0">
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.end}
              className={({ isActive }) => `flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand text-ink' : 'text-ink hover:bg-ice'}`}>
              <l.icon size={17} aria-hidden="true" />{l.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 hidden space-y-2 px-5 text-xs text-muted md:block">
          <Link to="/" className="inline-flex items-center gap-1.5 font-medium text-ink hover:text-[#066a87]"><Store size={15} aria-hidden="true" />Back to storefront</Link>
          <p>Data: <b className="text-ink">synthetic</b></p>
          <p>AI mode: <b className="text-ink">{health.data ? (health.data.mode === 'llm' ? `${health.data.provider} · ${health.data.model}` : 'Offline deterministic') : '…'}</b></p>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 p-4 md:p-8"><Outlet /></main>
    </div>
  )
}
