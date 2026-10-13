import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, Compass, LayoutDashboard, Menu, Package, PlusCircle, Receipt, Settings as Cog, Store, X } from 'lucide-react'
import { ThemeToggle } from '../shared/theme'
import { AnimatedOutlet } from '../shared/motion'
import ModelChip from './ModelChip'
import UsageChip from './UsageChip'
import AssistantWidget from './AssistantWidget'
import { PRODUCT, ReachLogo, useReachDocument } from './Brand'

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
  const m: Record<string, string> = { assistant: 'Assistant', discovery: 'Influencer discovery', agents: 'Agent execution', inventory: 'Inventory', orders: 'Orders', settings: 'Settings' }
  return m[path.split('/')[2]] ?? PRODUCT
}

// Campaign sub-tabs animate inside CampaignLayout, so the shell treats a whole campaign as one page.
const shellKey = (p: string) => (p.match(/^\/admin\/campaigns\/(?!new)[^/]+/)?.[0] ?? p)

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label={PRODUCT} className="space-y-6 px-3">
      {groups.map(g => (
        <div key={g.title}>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{g.title}</p>
          <ul className="space-y-0.5">
            {g.links.map(l => (
              <li key={l.to}>
                <NavLink to={l.to} end={l.end} onClick={onNavigate}
                  className={({ isActive }) => `group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${isActive ? 'bg-brand/10 font-semibold text-ink' : 'font-medium text-muted hover:bg-ice hover:text-ink'}`}>
                  {({ isActive }) => (
                    <>
                      {isActive && <motion.span layoutId={onNavigate ? 'nav-bar-m' : 'nav-bar'} className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                      <l.icon size={16} aria-hidden="true" className={`shrink-0 ${isActive ? 'text-brand-ink' : ''}`} />
                      <span className="truncate">{l.label}</span>
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

const StoreLink = ({ onClick }: { onClick?: () => void }) => (
  <Link to="/" onClick={onClick} className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-ice hover:text-ink"><Store size={16} aria-hidden="true" />View storefront</Link>
)

export default function StudioLayout() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  useReachDocument()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <div className="studio min-h-screen bg-ice lg:flex">
      <a href="#main" className="sr-only-focusable z-50 rounded bg-brand px-3 py-2 font-semibold text-on-brand">Skip to content</a>
      <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col">
        <div className="flex h-16 items-center px-5"><Link to="/admin" aria-label={`${PRODUCT} home`}><ReachLogo /></Link></div>
        <div className="scrollbar-thin flex-1 overflow-y-auto py-4"><Nav /></div>
        <div className="border-t border-line p-3"><StoreLink /></div>
      </aside>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', stiffness: 420, damping: 40 }}
              className="absolute inset-y-0 left-0 flex w-[min(17rem,85vw)] flex-col bg-surface shadow-pop" aria-label="Menu" role="dialog" aria-modal="true">
              <div className="flex h-14 items-center justify-between px-4">
                <ReachLogo compact />
                <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 hover:bg-ice"><X size={18} aria-hidden="true" /></button>
              </div>
              <div className="flex-1 overflow-y-auto py-3"><Nav onNavigate={() => setOpen(false)} /></div>
              <div className="border-t border-line p-3"><StoreLink onClick={() => setOpen(false)} /></div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur-md sm:gap-3 sm:px-6 lg:h-16 lg:px-8">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="-ml-1 shrink-0 rounded-lg p-2 hover:bg-ice lg:hidden"><Menu size={20} aria-hidden="true" /></button>
          <div className="min-w-0 flex-1">
            <p className="hidden text-[11px] font-medium text-muted sm:block">{PRODUCT}</p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p key={titleFor(pathname)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
                className="truncate font-display text-[15px] font-semibold leading-tight">{titleFor(pathname)}</motion.p>
            </AnimatePresence>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <UsageChip />
            <ModelChip />
            <ThemeToggle />
            <Link to="/" aria-label="View storefront" className="hidden h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold transition-colors hover:border-brand hover:bg-ice xl:inline-flex"><Store size={15} aria-hidden="true" />Store</Link>
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <AnimatedOutlet keyOf={shellKey} />
        </main>
        <AssistantWidget />
      </div>
    </div>
  )
}
