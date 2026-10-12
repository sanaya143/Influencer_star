import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, Check, Heart, Megaphone, Minus, PackageCheck, Plus, Trash2, Truck } from 'lucide-react'
import { api, ApiError, fmt, imgSrc, type Paged, type Product } from '../api'
import { useApi } from '../shared/hooks'
import { Badge, Button, EmptyState, ErrorState, ProductImage, Skeleton } from '../shared/ui'
import { Reveal, ease } from '../shared/motion'
import { useToast } from '../shared/toast'
import { CATS } from './StoreLayout'
import { useStore } from './store'

// Editorial photography (Unsplash License).
const photo = (id: string, w: number, h: number) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=75`
const HERO = { main: '1634921276069-c24ba5d6b35c', a: '1596993100471-c3905dafa78e', b: '1489987707025-afc232f7ea0f' }
const TILES: [string, string, string][] = [
  ['Women', 'Street Edit & occasion', '1571513722275-4b41940f54b8'], ['Men', 'Denim, tech & tailoring', '1617114919297-3c8ddb01f599'],
  ['Kids', 'Little Threads', '1519238263530-99bdd11df2ea'], ['Couple Looks', 'Twinning sets', '1629888401525-0d11ff26881f'],
  ['Unisex', 'Everyday staples', '1594262254144-8a0e068f4215'], ['Accessories', 'Finish the look', '1511556820780-d912e42b4980'],
]

function stockNote(p: Product): { text: string; tone: 'bad' | 'warn' } | null {
  if (p.stock_state === 'out') return { text: 'Sold out', tone: 'bad' }
  if (p.low_sizes.length && p.low_sizes.length === p.sizes.length - p.sold_out_sizes.length) return { text: 'Last few left', tone: 'warn' }
  if (p.stock_state === 'low') return { text: 'Low stock', tone: 'warn' }
  return null
}

export function ProductCard({ p, i = 0 }: { p: Product; i?: number }) {
  const { wishlist, toggleWish } = useStore()
  const liked = wishlist.includes(p.product_id)
  const note = stockNote(p)
  return (
    <motion.li layout initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-30px' }}
      exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.45, delay: Math.min(i % 8, 7) * 0.04, ease }} className="group relative">
      <Link to={`/product/${p.product_id}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-ice">
          <ProductImage src={p.product_image} alt={`${p.product_name} in ${p.colour.toLowerCase() || 'colour shown'}, ${p.category.toLowerCase()}`} name={p.product_name} category={p.category} colour={p.colour} width={480}
            className={`h-full w-full transition-transform duration-700 ease-out group-hover:scale-[1.06] ${p.stock_state === 'out' ? 'opacity-60 grayscale' : ''}`} />
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">{p.badges.map(b => <span key={b} className="rounded-full bg-surface/90 px-2 py-0.5 text-[11px] font-semibold text-ink backdrop-blur">{b}</span>)}</div>
          {note && <span className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${note.tone === 'bad' ? 'bg-[#0b1115] text-white' : 'bg-amber-400 text-[#2b1d00]'}`}>{note.text}</span>}
          <span className="absolute inset-x-2 bottom-2 translate-y-3 rounded-full bg-surface/95 py-1.5 text-center text-xs font-semibold text-ink opacity-0 shadow-card transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">View product</span>
        </div>
        <h3 className="mt-2.5 text-sm font-semibold leading-tight transition-colors group-hover:text-brand-ink">{p.product_name}</h3>
        <p className="text-sm">{fmt.gbp(p.price_gbp)} <span className="text-xs text-muted">· {p.colour || p.category}</span></p>
        <p className="text-xs text-muted">Sizes {p.sizes[0]}{p.sizes.length > 1 ? `–${p.sizes[p.sizes.length - 1]}` : ''}</p>
      </Link>
      <motion.button whileTap={{ scale: 0.8 }} onClick={() => toggleWish(p.product_id)} aria-pressed={liked} aria-label={`${liked ? 'Remove' : 'Add'} ${p.product_name} ${liked ? 'from' : 'to'} wishlist`}
        className="absolute right-2 top-2 rounded-full bg-surface/90 p-2 text-ink shadow-card backdrop-blur transition-colors hover:bg-surface">
        <motion.span key={String(liked)} initial={{ scale: liked ? 0.4 : 1 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 12 }} className="block">
          <Heart size={16} className={liked ? 'fill-brand text-brand' : ''} aria-hidden="true" />
        </motion.span>
      </motion.button>
    </motion.li>
  )
}

function Grid({ items }: { items: Product[] }) {
  return (
    <motion.ul layout className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
      <AnimatePresence mode="popLayout">{items.map((p, i) => <ProductCard key={p.product_id} p={p} i={i} />)}</AnimatePresence>
    </motion.ul>
  )
}
const GridSkeleton = () => <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4] w-full" />)}</div>

export function HomePage() {
  const newest = useApi<Paged<Product>>('/products?page_size=8&sort=featured')
  const best = useApi<Paged<Product>>('/products?page_size=4&sort=bestsellers')
  const heroRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const lift = useTransform(scrollYProgress, [0, 1], [0, -60])
  return (
    <div>
      <section ref={heroRef} className="relative overflow-hidden bg-ice">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 md:grid-cols-[1.05fr_1fr] md:py-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }}>
            <Badge tone="brand">New season · Autumn edit</Badge>
            <h1 className="mt-4 text-5xl font-bold leading-[1.05] md:text-7xl">Fashion for{' '}
              <span className="relative inline-block px-2">
                <motion.span aria-hidden="true" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.45, duration: 0.7, ease }} style={{ originX: 0 }} className="absolute inset-0 rounded-lg bg-brand" />
                <span className="relative text-on-brand">every you.</span>
              </span></h1>
            <p className="mt-5 max-w-md text-lg text-muted">Affordable, trend-led British-inspired style for every age, gender and occasion, from streetwear to family looks.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/shop"><Button>Shop all <ArrowRight size={16} aria-hidden="true" /></Button></Link>
              <Link to="/shop?category=Couple%20Looks"><Button variant="outline">Couple looks</Button></Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              <li className="flex items-center gap-2"><Truck size={16} aria-hidden="true" className="text-brand-ink" />Free delivery over £40</li>
              <li className="flex items-center gap-2"><PackageCheck size={16} aria-hidden="true" className="text-brand-ink" />Live stock on every size</li>
            </ul>
          </motion.div>
          <motion.div style={{ y: lift }} className="grid grid-cols-[1.3fr_1fr] gap-3" aria-hidden="true">
            <motion.img initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease }} src={photo(HERO.main, 640, 880)} alt=""
              className="row-span-2 h-full max-h-[520px] w-full rounded-3xl object-cover shadow-pop" />
            <motion.img initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.8, ease }} src={photo(HERO.a, 420, 420)} alt="" className="aspect-square w-full rounded-3xl object-cover" />
            <motion.img initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.8, ease }} src={photo(HERO.b, 420, 420)} alt="" className="aspect-square w-full rounded-3xl object-cover" />
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14" aria-labelledby="shop-by">
        <Reveal><h2 id="shop-by" className="mb-5 text-2xl font-bold md:text-3xl">Shop by category</h2></Reveal>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {TILES.map(([c, s, id], i) => (
            <motion.li key={c} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.5, ease }}>
              <Link to={`/shop?category=${encodeURIComponent(c)}`} className="group relative block aspect-[3/4] overflow-hidden rounded-2xl">
                <img src={imgSrc(photo(id, 360, 480), 360)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                <span className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
                <span className="absolute inset-x-3 bottom-3 text-white"><span className="block font-display text-lg font-semibold">{c}</span><span className="flex items-center gap-1 text-xs opacity-90">{s}<ArrowRight size={12} aria-hidden="true" className="transition-transform group-hover:translate-x-1" /></span></span>
              </Link>
            </motion.li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-7xl px-4" aria-labelledby="new-in">
        <Reveal className="mb-5 flex items-end justify-between"><h2 id="new-in" className="text-2xl font-bold md:text-3xl">New in</h2><Link to="/shop?sort=newest" className="text-sm font-semibold text-brand-ink hover:underline">See all</Link></Reveal>
        {newest.error ? <ErrorState message={newest.error} onRetry={newest.reload} /> : newest.loading ? <GridSkeleton /> : <Grid items={newest.data!.items} />}
      </section>

      <section className="mx-auto mt-16 max-w-7xl px-4" aria-labelledby="best">
        <Reveal className="mb-5 flex items-end justify-between"><h2 id="best" className="text-2xl font-bold md:text-3xl">Bestsellers this month</h2><Link to="/shop?sort=bestsellers" className="text-sm font-semibold text-brand-ink hover:underline">See all</Link></Reveal>
        {best.loading ? <GridSkeleton /> : best.data && <Grid items={best.data.items} />}
      </section>
    </div>
  )
}

export function CategoriesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8"><h1 className="mb-4 text-2xl font-bold">Categories</h1>
      <ul className="grid gap-3 sm:grid-cols-2">{TILES.map(([c, s, id], i) => (
        <motion.li key={c} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
          <Link to={`/shop?category=${encodeURIComponent(c)}`} className="group flex items-center gap-4 overflow-hidden rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-brand">
            <img src={photo(id, 160, 200)} alt="" loading="lazy" className="h-20 w-16 rounded-xl object-cover transition-transform group-hover:scale-105" />
            <span><span className="block text-lg font-semibold">{c}</span><span className="text-sm text-muted">{s}</span></span>
            <ArrowRight size={18} aria-hidden="true" className="ml-auto text-muted transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.li>))}</ul></div>
  )
}

export function ShopPage() {
  const [sp, setSp] = useSearchParams()
  const q = sp.get('q') ?? '', category = sp.get('category') ?? '', sort = sp.get('sort') ?? 'featured'
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (sp.get('focus') === 'search') input.current?.focus() }, [sp])
  const { data, error, loading, reload } = useApi<Paged<Product>>(`/products?page_size=100&sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ''}${category ? `&category=${encodeURIComponent(category)}` : ''}`)
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); n.delete('focus'); setSp(n) }
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <AnimatePresence mode="wait"><motion.h1 key={category + q} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="text-2xl font-bold md:text-3xl">{category || (q ? `Results for “${q}”` : 'All products')}</motion.h1></AnimatePresence>
          {data && <p className="text-sm text-muted">{data.total} items</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="sr-only" htmlFor="shop-q">Search</label>
          <input id="shop-q" ref={input} defaultValue={q} key={q} onKeyDown={e => e.key === 'Enter' && set('q', e.currentTarget.value)} placeholder="Search" className="rounded-full border border-line bg-ice px-3 py-1.5 md:hidden" />
          <label className="flex items-center gap-1.5">Sort<select value={sort} onChange={e => set('sort', e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1.5">
            <option value="featured">Featured</option><option value="newest">Newest</option><option value="bestsellers">Bestsellers</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="name">Name</option></select></label>
        </div>
      </div>
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        {['', ...CATS].map(c => (
          <button key={c || 'all'} aria-pressed={category === c} onClick={() => set('category', c)}
            className={`relative rounded-full border px-3.5 py-1.5 text-sm transition-colors ${category === c ? 'border-brand font-semibold text-on-brand' : 'border-line hover:border-brand/60 hover:bg-ice'}`}>
            {category === c && <motion.span layoutId="shop-chip" className="absolute inset-0 rounded-full bg-brand" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative">{c || 'All'}</span>
          </button>
        ))}
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <GridSkeleton /> : !data?.items.length ? <EmptyState title="Nothing found" hint="Try a different search or clear the category filter." action={<Button variant="outline" onClick={() => setSp({})}>Clear filters</Button>} /> : (
        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}><Grid items={data.items} /></div>
      )}
    </div>
  )
}

export function ProductPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: p, error, loading } = useApi<Product>(`/products/${id}`)
  const { addToBag, wishlist, toggleWish, bag } = useStore()
  const toast = useToast()
  const [size, setSize] = useState('')
  const [added, setAdded] = useState(false)
  const [sizeError, setSizeError] = useState(false)
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => { setSize(''); setAdded(false) }, [id])
  if (error) return <div className="mx-auto max-w-3xl p-8"><ErrorState message={error} /></div>
  if (loading || !p) return <div className="mx-auto grid max-w-6xl gap-8 p-8 md:grid-cols-2"><Skeleton className="aspect-[3/4]" /><Skeleton className="h-64" /></div>
  const liked = wishlist.includes(p.product_id)
  const left = size ? (p.stock[size] ?? 0) - (bag.find(b => b.product_id === p.product_id && b.size === size)?.qty ?? 0) : null
  const add = () => {
    if (!size) { setSizeError(true); return }
    if (left !== null && left <= 0) { toast({ tone: 'bad', title: 'No more stock in this size', body: 'You already have every unit in your bag.' }); return }
    addToBag(p.product_id, size); setAdded(true); setTimeout(() => setAdded(false), 2200)
    toast({ tone: 'ok', title: 'Added to bag', body: `${p.product_name} · size ${size}` })
  }
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-8 md:grid-cols-2">
      <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease }}
        className="relative cursor-zoom-in overflow-hidden rounded-3xl bg-ice" onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }) }} onMouseLeave={() => setZoom(null)}>
        <div className="transition-transform duration-300 ease-out" style={{ transform: zoom ? 'scale(1.6)' : 'scale(1)', transformOrigin: zoom ? `${zoom.x}% ${zoom.y}%` : 'center' }}>
          <ProductImage src={p.product_image} alt={`${p.product_name} in ${p.colour.toLowerCase()} from the ${p.seasonal_collection} collection`} name={p.product_name} category={p.category} colour={p.colour} width={900} priority className="aspect-[3/4] w-full" />
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1, ease }}>
        <nav aria-label="Breadcrumb" className="text-xs text-muted"><Link to="/shop" className="hover:underline">Shop</Link> / <Link to={`/shop?category=${encodeURIComponent(p.category)}`} className="hover:underline">{p.category}</Link></nav>
        <h1 className="mt-2 text-3xl font-bold md:text-4xl">{p.product_name}</h1>
        <p className="mt-1 text-2xl">{fmt.gbp(p.price_gbp)}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">{p.badges.map(b => <Badge key={b} tone="brand">{b}</Badge>)}<Badge>{p.seasonal_collection}</Badge>{p.colour && <Badge>{p.colour}</Badge>}</div>
        <p className="mt-4 text-sm text-muted">{p.description}</p>
        <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-1 text-sm">
          <dt className="text-muted">Designed for</dt><dd className="capitalize">{p.target_gender_or_collection} · ages {p.target_age_segments.join(', ')}</dd>
          <dt className="text-muted">Style</dt><dd>{p.style_tags.join(', ') || '—'}</dd><dt className="text-muted">Category</dt><dd>{p.category}</dd>
        </dl>
        <fieldset className="mt-6"><legend className="mb-2 text-sm font-semibold">Select size</legend>
          <div className="flex flex-wrap gap-2">{p.sizes.map(s => {
            const out = (p.stock[s] ?? 0) === 0
            return (
              <label key={s} className={`relative rounded-xl border px-4 py-2 text-sm transition-all ${out ? 'cursor-not-allowed border-line text-muted line-through opacity-60' : size === s ? 'cursor-pointer border-brand bg-brand font-semibold text-on-brand' : 'cursor-pointer border-line hover:border-brand/60 hover:bg-ice'}`}>
                <input type="radio" name="size" className="sr-only" value={s} disabled={out} checked={size === s} onChange={() => { setSize(s); setSizeError(false) }} />{s}
                {out && <span className="sr-only"> (sold out)</span>}
              </label>
            )
          })}</div>
          <AnimatePresence mode="wait">
            {sizeError ? <motion.p key="err" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">Please choose a size.</motion.p>
              : size && left !== null && left <= 5 ? <motion.p key="left" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-300">{left <= 0 ? 'All remaining units are in your bag.' : `Only ${left} left in ${size}.`}</motion.p>
              : p.stock_state === 'out' ? <p key="out" className="mt-2 text-sm font-medium">Sold out in every size. Check back soon.</p> : null}
          </AnimatePresence>
        </fieldset>
        <div className="mt-6 flex gap-2">
          <Button onClick={add} className="flex-1" disabled={p.stock_state === 'out'}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={String(added)} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} className="inline-flex items-center gap-2">
                {added ? <><Check size={16} aria-hidden="true" />Added to bag</> : p.stock_state === 'out' ? 'Sold out' : 'Add to bag'}
              </motion.span>
            </AnimatePresence>
          </Button>
          <Button variant="outline" onClick={() => toggleWish(p.product_id)} aria-pressed={liked} aria-label={liked ? 'Remove from wishlist' : 'Add to wishlist'}><Heart size={16} className={liked ? 'fill-brand text-brand' : ''} aria-hidden="true" /></Button>
        </div>
        <div aria-live="polite" className="sr-only">{added ? `${p.product_name} added to bag` : ''}</div>
        <div className="mt-8 rounded-2xl border border-brand/40 bg-ice p-4">
          <p className="text-sm font-semibold">For the marketing team</p>
          <p className="mb-3 text-xs text-muted">Find influencers whose audiences fit this product.</p>
          <Button onClick={() => nav(`/admin/campaigns/new?product=${p.product_id}`)}><Megaphone size={16} aria-hidden="true" />Promote this product</Button>
        </div>
      </motion.div>
    </div>
  )
}

export function WishlistPage() {
  const { wishlist } = useStore()
  const { data, loading } = useApi<Paged<Product>>('/products?page_size=100')
  const items = data?.items.filter(p => wishlist.includes(p.product_id)) ?? []
  return (
    <div className="mx-auto max-w-7xl px-4 py-8"><h1 className="mb-4 text-2xl font-bold">Wishlist</h1>
      {loading ? <GridSkeleton /> : !items.length ? <EmptyState title="Your wishlist is empty" hint="Tap the heart on any product to save it." action={<Link to="/shop"><Button variant="outline">Browse products</Button></Link>} /> : <Grid items={items} />}</div>
  )
}

interface Short { product_id: string; size: string; requested: number; available: number; product_name: string; reason: string }

export function BagPage() {
  const { bag, setQty, clearBag } = useStore()
  const { data, reload } = useApi<Paged<Product>>('/products?page_size=100')
  const [done, setDone] = useState<{ order_id: string; total: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [short, setShort] = useState<Short[]>([])
  const lines = bag.map(b => ({ ...b, p: data?.items.find(p => p.product_id === b.product_id) })).filter(l => l.p) as (typeof bag[number] & { p: Product })[]
  const total = lines.reduce((s, l) => s + l.p.price_gbp * l.qty, 0)
  async function checkout() {
    setBusy(true); setShort([])
    try {
      const o = await api<{ order_id: string; total_gbp: number }>('/orders', { method: 'POST', json: { lines: lines.map(l => ({ product_id: l.product_id, size: l.size, qty: l.qty })) } })
      clearBag(); setDone({ order_id: o.order_id, total: o.total_gbp })
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { setShort(((e.body as { items?: Short[] })?.items) ?? []); reload() }
      else setShort([{ product_id: '', size: '', requested: 0, available: 0, product_name: (e as Error).message, reason: 'error' }])
    } finally { setBusy(false) }
  }
  if (done) return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <motion.div role="status" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl bg-ice p-10">
        <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }} className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-on-brand"><Check size={28} aria-hidden="true" /></motion.span>
        <h1 className="text-2xl font-bold">Thanks for your (demo) order</h1>
        <p className="mt-1 text-sm text-muted">Order <b className="font-mono text-ink">{done.order_id}</b> · {fmt.gbp(done.total)}. No payment was taken; stock was reserved in the back office.</p>
        <Link to="/shop"><Button className="mt-5">Keep shopping</Button></Link>
      </motion.div>
    </div>
  )
  return (
    <div className="mx-auto max-w-3xl px-4 py-8"><h1 className="mb-4 text-2xl font-bold">Your bag</h1>
      {!lines.length ? <EmptyState title="Your bag is empty" action={<Link to="/shop"><Button variant="outline">Start shopping</Button></Link>} /> : <>
        <AnimatePresence>{short.length > 0 && (
          <motion.div role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-400/30 dark:bg-amber-400/10">
            <p className="font-semibold">Some items just sold out or are running low</p>
            <ul className="mt-1 list-disc pl-5">{short.map(s => <li key={s.product_id + s.size}>{s.reason === 'error' ? s.product_name : `${s.product_name} (${s.size}): ${s.available} available, you asked for ${s.requested}.`}</li>)}</ul>
            <p className="mt-1 text-xs text-muted">Adjust the quantities below and try again. Nothing was charged.</p>
          </motion.div>)}</AnimatePresence>
        <ul className="divide-y divide-line">
          <AnimatePresence initial={false}>{lines.map(l => {
            const stock = l.p.stock[l.size] ?? 0
            return (
              <motion.li key={l.product_id + l.size} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40, height: 0 }} transition={{ duration: 0.25 }} className="flex gap-4 py-4">
                <Link to={`/product/${l.product_id}`}><ProductImage src={l.p.product_image} alt={l.p.product_name} name={l.p.product_name} category={l.p.category} colour={l.p.colour} width={160} className="h-24 w-20 rounded-xl" /></Link>
                <div className="flex-1"><p className="font-semibold">{l.p.product_name}</p><p className="text-sm text-muted">Size {l.size} · {fmt.gbp(l.p.price_gbp)}{stock <= 5 && <span className="text-amber-700 dark:text-amber-300"> · {stock} left</span>}</p>
                  <div className="mt-2 flex items-center gap-2"><Button size="sm" variant="outline" aria-label="Decrease quantity" onClick={() => setQty(l.product_id, l.size, l.qty - 1)}><Minus size={14} aria-hidden="true" /></Button><span aria-live="polite" className="tabular w-6 text-center text-sm">{l.qty}</span><Button size="sm" variant="outline" aria-label="Increase quantity" disabled={l.qty >= stock} onClick={() => setQty(l.product_id, l.size, l.qty + 1)}><Plus size={14} aria-hidden="true" /></Button>
                    <Button size="sm" variant="ghost" aria-label={`Remove ${l.p.product_name}`} onClick={() => setQty(l.product_id, l.size, 0)}><Trash2 size={14} aria-hidden="true" /></Button></div></div>
                <p className="tabular font-semibold">{fmt.gbp(l.p.price_gbp * l.qty)}</p></motion.li>)
          })}</AnimatePresence></ul>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-4"><p className="text-lg font-bold">Total <span className="tabular">{fmt.gbp(total)}</span></p>
          <Button onClick={checkout} disabled={busy}>{busy ? 'Placing order…' : 'Checkout (demo)'}</Button></div></>}
    </div>
  )
}
