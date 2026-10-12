import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, Compass, LayoutDashboard, Menu, Package, PlusCircle, Receipt, Settings as Cog, Store, X } from 'lucide-react'
import { Logo } from '../shared/ui'
import { ThemeToggle } from '../shared/theme'
import { AnimatedOutlet } from '../shared/motion'
import ModelChip from './ModelChip'

const groups = [
  { title: 'Marketing', links: [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/campaigns/new', label: 'Create campaign', icon: PlusCircle },
    { to: '/admin/discovery', label: 'Influencer discovery', icon: Compass },
    { to: '/admin/agents', label: 'Agent execution', icon: Activity },
  ] },
  { title: 'Commerce', links: [
    { to: '/admin/inventory', label: 'Inventory', icon: Package },
    { to: '/admin/orders', label: 'Orders', icon: Receipt },
  ] },
  { title: 'System', links: [{ to: '/admin/settings', label: 'Settings', icon: Cog }] },
]

function titleFor(path: string): string {
  if (path === '/admin' || path === '/admin/') return 'Overview'
  if (path.startsWith('/admin/campaigns/new')) return 'Create campaign'
  if (path.startsWith('/admin/campaigns/')) return 'Campaign'
  if (path.startsWith('/admin/inventory/new')) return 'New product'
  if (path.startsWith('/admin/inventory/')) return 'Edit product'
  const m: Record<string, string> = { discovery: 'Influencer discovery', agents: 'Agent execution', inventory: 'Inventory', orders: 'Orders', settings: 'Settings' }
  return m[path.split('/')[2]] ?? 'Back office'
}

// Campaign sub-tabs animate inside CampaignLayout, so the shell treats a whole campaign as one page.
const shellKey = (p: string) => (p.match(/^\/admin\/campaigns\/(?!new)[^/]+/)?.[0] ?? p)

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Back office" className="space-y-5 px-3">
      {groups.map(g => (
        <div key={g.title}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{g.title}</p>
          <ul className="space-y-0.5">
            {g.links.map(l => (
              <li key={l.to}>
                <NavLink to={l.to} end={l.end} onClick={onNavigate}
                  className={({ isActive }) => `group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'text-on-brand' : 'text-ink hover:bg-ice'}`}>
                  {({ isActive }) => (
                    <>
                      {isActive && <motion.span layoutId={onNavigate ? 'nav-pill-m' : 'nav-pill'} className="absolute inset-0 rounded-xl bg-brand" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                      <l.icon size={17} aria-hidden="true" className="relative transition-transform group-hover:scale-110" />
                      <span className="relative">{l.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export default function StudioLayout() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [pathname])
  return (
    <div className="min-h-screen bg-ice md:flex">
      <a href="#main" className="sr-only-focusable z-50 rounded bg-brand px-3 py-2 font-semibold text-on-brand">Skip to content</a>
      <aside className="hidden border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col">
        <div className="px-6 py-5"><Link to="/admin" aria-label="Back office home"><Logo size={26} tagline="Back office" /></Link></div>
        <div className="scrollbar-thin flex-1 overflow-y-auto pb-4"><Nav /></div>
        <div className="border-t border-line px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-ink transition-colors hover:text-brand-ink"><Store size={16} aria-hidden="true" />View storefront</Link>
        </div>
      </aside>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <motion.aside initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface shadow-pop" aria-label="Menu">
              <div className="flex items-center justify-between px-5 py-4">
                <Logo size={24} tagline="Back office" />
                <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-full p-1.5 hover:bg-ice"><X size={18} aria-hidden="true" /></button>
              </div>
              <div className="flex-1 overflow-y-auto pb-4"><Nav onNavigate={() => setOpen(false)} /></div>
              <Link to="/" className="flex items-center gap-2 border-t border-line px-6 py-4 text-sm font-medium"><Store size={16} aria-hidden="true" />View storefront</Link>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/85 px-4 py-2.5 backdrop-blur-md md:px-8">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 hover:bg-ice md:hidden"><Menu size={20} aria-hidden="true" /></button>
          <div className="min-w-0 flex-1">
            <p className="hidden text-[11px] font-medium uppercase tracking-[0.14em] text-muted sm:block">Back office</p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p key={titleFor(pathname)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
                className="truncate font-display text-base font-semibold">{titleFor(pathname)}</motion.p>
            </AnimatePresence>
          </div>
          <ModelChip />
          <ThemeToggle />
          <Link to="/" aria-label="View storefront" className="hidden h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold transition-colors hover:border-brand hover:bg-ice lg:inline-flex"><Store size={15} aria-hidden="true" />Store</Link>
        </header>
        <main id="main" className="min-w-0 flex-1 p-4 md:p-8">
          <AnimatedOutlet keyOf={shellKey} />
        </main>
      </div>
    </div>
  )
}
