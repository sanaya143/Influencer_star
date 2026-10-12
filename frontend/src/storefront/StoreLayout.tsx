import { FormEvent, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Grid2x2, Heart, Home, Search, ShoppingBag } from 'lucide-react'
import { Logo } from '../shared/ui'
import { useStore } from './store'

const CATS = ['Women', 'Men', 'Kids', 'Unisex', 'Couple Looks', 'Accessories']

export default function StoreLayout() {
  const { bag, wishlist } = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const [q, setQ] = useState('')
  const count = bag.reduce((n, i) => n + i.qty, 0)
  const submit = (e: FormEvent) => { e.preventDefault(); nav(`/shop?q=${encodeURIComponent(q)}`) }
  const mobile = [
    { to: '/', icon: Home, label: 'Home', end: true }, { to: '/shop?focus=search', icon: Search, label: 'Search' },
    { to: '/categories', icon: Grid2x2, label: 'Categories' }, { to: '/wishlist', icon: Heart, label: 'Wishlist', badge: wishlist.length }, { to: '/bag', icon: ShoppingBag, label: 'Bag', badge: count },
  ]
  return (
    <div className="min-h-screen bg-white pb-16 md:pb-0">
      <a href="#main" className="sr-only-focusable rounded bg-brand px-3 py-2 font-semibold text-ink">Skip to content</a>
      <div className="bg-ink px-4 py-1.5 text-center text-xs text-white">Free UK delivery over £40 · Demo store with synthetic products</div>
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link to="/" aria-label="THREADORA home"><Logo /></Link>
          <form onSubmit={submit} role="search" className="relative ml-auto flex-1 md:max-w-md">
            <label htmlFor="site-search" className="sr-only">Search products</label>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input id="site-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search hoodies, denim, couple looks…" className="w-full rounded-full border border-line bg-ice py-2 pl-9 pr-3 text-sm focus:border-brand" />
          </form>
          <nav aria-label="Account" className="hidden items-center gap-1 md:flex">
            <Link to="/wishlist" aria-label={`Wishlist, ${wishlist.length} items`} className="relative rounded-full p-2 hover:bg-ice"><Heart size={20} aria-hidden="true" />{wishlist.length > 0 && <Dot n={wishlist.length} />}</Link>
            <Link to="/bag" aria-label={`Bag, ${count} items`} className="relative rounded-full p-2 hover:bg-ice"><ShoppingBag size={20} aria-hidden="true" />{count > 0 && <Dot n={count} />}</Link>
            <Link to="/admin" className="ml-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-brand hover:bg-ice">Campaign Studio</Link>
          </nav>
        </div>
        <nav aria-label="Categories" className="hidden border-t border-line md:block">
          <ul className="mx-auto flex max-w-7xl gap-6 px-4 text-sm font-medium">
            {CATS.map(c => <li key={c}><NavLink to={`/shop?category=${encodeURIComponent(c)}`} className={() => `block border-b-2 py-2.5 ${loc.search.includes(encodeURIComponent(c)) ? 'border-brand' : 'border-transparent hover:border-line'}`}>{c}</NavLink></li>)}
            <li><NavLink to="/shop" end className="block border-b-2 border-transparent py-2.5 text-muted hover:border-line">All</NavLink></li>
          </ul>
        </nav>
      </header>
      <main id="main"><Outlet /></main>
      <footer className="mt-16 border-t border-line bg-ice px-4 py-8 text-center text-xs text-muted">
        <Logo size={22} /><p className="mt-2">Fashion for every you. THREADORA is a placeholder brand for a hackathon demo; all products and creators are synthetic.</p>
      </footer>
      <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-white md:hidden">
        {mobile.map(m => (
          <NavLink key={m.label} to={m.to} end={m.end} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-ink' : 'text-muted'}`}>
            {({ isActive }) => <><span className={`rounded-full px-3 py-0.5 ${isActive ? 'bg-brand' : ''}`}><m.icon size={20} aria-hidden="true" /></span>{m.label}{!!m.badge && <Dot n={m.badge} mobile />}</>}
          </NavLink>))}
      </nav>
    </div>
  )
}
const Dot = ({ n, mobile = false }: { n: number; mobile?: boolean }) => <span aria-hidden="true" className={`absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-ink ${mobile ? 'right-5 top-1' : '-right-0.5 -top-0.5'}`}>{n}</span>
