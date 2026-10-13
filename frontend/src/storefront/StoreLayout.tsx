import { FormEvent, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Briefcase, Grid2x2, Heart, Home, Search, ShoppingBag } from 'lucide-react'
import { Logo } from '../shared/ui'
import { ThemeToggle } from '../shared/theme'
import { AnimatedOutlet } from '../shared/motion'
import { useStore } from './store'

export const CATS = ['Women', 'Men', 'Kids', 'Unisex', 'Couple Looks', 'Accessories']

function Count({ n, mobile = false }: { n: number; mobile?: boolean }) {
  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.span key={n} aria-hidden="true" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 600, damping: 18 }}
          className={`absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-on-brand ${mobile ? 'right-4 top-1' : '-right-0.5 -top-0.5'}`}>{n}</motion.span>
      )}
    </AnimatePresence>
  )
}

export default function StoreLayout() {
  const { bag, wishlist } = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const [q, setQ] = useState('')
  const count = bag.reduce((n, i) => n + i.qty, 0)
  const activeCat = new URLSearchParams(loc.search).get('category')
  const submit = (e: FormEvent) => { e.preventDefault(); nav(`/shop?q=${encodeURIComponent(q)}`) }
  const mobile = [
    { to: '/', icon: Home, label: 'Home', end: true }, { to: '/shop?focus=search', icon: Search, label: 'Search' },
    { to: '/categories', icon: Grid2x2, label: 'Categories' }, { to: '/wishlist', icon: Heart, label: 'Wishlist', badge: wishlist.length }, { to: '/bag', icon: ShoppingBag, label: 'Bag', badge: count },
  ]
  return (
    <div className="min-h-screen bg-page pb-16 md:pb-0">
      <a href="#main" className="sr-only-focusable z-50 rounded bg-brand px-3 py-2 font-semibold text-on-brand">Skip to content</a>
      <div className="overflow-hidden bg-[#0b1115] py-1.5 text-center text-xs text-white">
        <motion.p initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>Free UK delivery over £40 · Demo store with synthetic products</motion.p>
      </div>
      <header className="sticky top-0 z-30 border-b border-line bg-page/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:gap-4">
          <Link to="/" aria-label="Zylo home"><Logo /></Link>
          <form onSubmit={submit} role="search" className="relative ml-auto flex-1 md:max-w-md">
            <label htmlFor="site-search" className="sr-only">Search products</label>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input id="site-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search hoodies, denim, couple looks…"
              className="w-full rounded-full border border-line bg-ice py-2 pl-9 pr-3 text-sm text-ink transition-colors placeholder:text-muted focus:border-brand focus:bg-surface focus:outline-none" />
          </form>
          <ThemeToggle />
          <nav aria-label="Account" className="hidden items-center gap-1 md:flex">
            <Link to="/wishlist" aria-label={`Wishlist, ${wishlist.length} items`} className="relative rounded-full p-2 transition-colors hover:bg-ice"><Heart size={20} aria-hidden="true" /><Count n={wishlist.length} /></Link>
            <Link to="/bag" aria-label={`Bag, ${count} items`} className="relative rounded-full p-2 transition-colors hover:bg-ice"><ShoppingBag size={20} aria-hidden="true" /><Count n={count} /></Link>
            <Link to="/admin" className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold transition-colors hover:border-brand hover:bg-ice"><Briefcase size={14} aria-hidden="true" />Back office</Link>
          </nav>
        </div>
        <nav aria-label="Categories" className="hidden border-t border-line md:block">
          <ul className="mx-auto flex max-w-7xl gap-6 px-4 text-sm font-medium">
            {[...CATS, 'All'].map(c => {
              const on = c === 'All' ? loc.pathname === '/shop' && !activeCat : activeCat === c
              return (
                <li key={c} className="relative">
                  <NavLink to={c === 'All' ? '/shop' : `/shop?category=${encodeURIComponent(c)}`} className={`block py-2.5 transition-colors ${on ? 'text-ink' : 'text-muted hover:text-ink'}`}>{c}</NavLink>
                  {on && <motion.span layoutId="cat-underline" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />}
                </li>
              )
            })}
          </ul>
        </nav>
      </header>
      <main id="main"><AnimatedOutlet /></main>
      <footer className="mt-20 border-t border-line bg-ice px-4 py-10 text-center text-xs text-muted">
        <Logo size={22} />
        <p className="mx-auto mt-3 max-w-xl">Fashion for every you. Zylo is a demo brand for a hackathon; products and creators are synthetic. Photography from Unsplash.</p>
      </footer>
      <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-page/95 backdrop-blur md:hidden">
        {mobile.map(m => (
          <NavLink key={m.label} to={m.to} end={m.end} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-ink' : 'text-muted'}`}>
            {({ isActive }) => <>
              <span className="relative rounded-full px-3 py-0.5">
                {isActive && <motion.span layoutId="mobile-pill" className="absolute inset-0 rounded-full bg-brand" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                <m.icon size={20} aria-hidden="true" className={`relative ${isActive ? 'text-on-brand' : ''}`} />
              </span>{m.label}{!!m.badge && <Count n={m.badge} mobile />}</>}
          </NavLink>))}
      </nav>
    </div>
  )
}
