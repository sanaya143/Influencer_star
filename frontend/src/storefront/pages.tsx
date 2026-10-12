import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Heart, Megaphone, Minus, Plus, Trash2 } from 'lucide-react'
import { api, fmt, type Paged, type Product } from '../api'
import { useApi } from '../shared/hooks'
import { Badge, Button, EmptyState, ErrorState, ProductImage, Skeleton } from '../shared/ui'
import { useStore } from './store'

const CATS = ['Women', 'Men', 'Kids', 'Unisex', 'Couple Looks', 'Accessories']

export function ProductCard({ p, i = 0 }: { p: Product; i?: number }) {
  const { wishlist, toggleWish } = useStore()
  const liked = wishlist.includes(p.product_id)
  return (
    <motion.li initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(i, 8) * 0.03 }} className="group relative">
      <Link to={`/product/${p.product_id}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-ice">
          <ProductImage src={p.product_image} alt={`${p.product_name}, ${p.category.toLowerCase()} from THREADORA`} category={p.category} className="h-full w-full transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">{p.badges.map(b => <span key={b} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold">{b}</span>)}</div>
        </div>
        <h3 className="mt-2 text-sm font-semibold leading-tight">{p.product_name}</h3>
        <p className="text-sm">{fmt.gbp(p.price_gbp)} <span className="text-xs text-muted">· {p.category}</span></p>
        <p className="text-xs text-muted">Sizes {p.sizes[0]}–{p.sizes[p.sizes.length - 1]}</p>
      </Link>
      <button onClick={() => toggleWish(p.product_id)} aria-pressed={liked} aria-label={`${liked ? 'Remove' : 'Add'} ${p.product_name} ${liked ? 'from' : 'to'} wishlist`}
        className="absolute right-2 top-2 rounded-full bg-white p-2 shadow hover:bg-ice"><Heart size={16} className={liked ? 'fill-brand text-brand' : ''} aria-hidden="true" /></button>
    </motion.li>
  )
}

function Grid({ items }: { items: Product[] }) {
  return <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">{items.map((p, i) => <ProductCard key={p.product_id} p={p} i={i} />)}</ul>
}

export function HomePage() {
  const { data, error, loading, reload } = useApi<Paged<Product>>('/products?page_size=8')
  const tiles = [['Women', 'Street Edit & occasion'], ['Men', 'Denim, tech & tailoring'], ['Kids', 'Little Threads'], ['Couple Looks', 'Twinning sets'], ['Unisex', 'Everyday staples'], ['Accessories', 'Finish the look']]
  return (
    <div>
      <section className="bg-ice">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-14 md:grid-cols-2 md:py-20">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <Badge tone="brand">New season</Badge>
            <h1 className="mt-4 text-4xl font-bold leading-tight md:text-6xl">Fashion for <span className="rounded-lg bg-brand px-2">every you.</span></h1>
            <p className="mt-4 max-w-md text-muted">Affordable, trend-led British-inspired style for every age, gender and occasion, from streetwear to family looks.</p>
            <div className="mt-6 flex gap-3"><Link to="/shop"><Button>Shop all</Button></Link><Link to="/shop?category=Couple%20Looks"><Button variant="outline">Couple looks</Button></Link></div>
          </motion.div>
          <div className="grid grid-cols-3 gap-3" aria-hidden="true">{(data?.items.slice(0, 3) ?? []).map(p => <div key={p.product_id} className="aspect-[3/4] overflow-hidden rounded-2xl"><ProductImage src={p.product_image} alt="" category={p.category} className="h-full w-full" /></div>)}</div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-12" aria-labelledby="shop-by">
        <h2 id="shop-by" className="mb-4 text-2xl font-bold">Shop by category</h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{tiles.map(([c, s]) => (
          <li key={c}><Link to={`/shop?category=${encodeURIComponent(c)}`} className="block rounded-2xl border border-line p-4 hover:border-brand hover:bg-ice"><p className="font-semibold">{c}</p><p className="text-xs text-muted">{s}</p></Link></li>))}</ul>
      </section>
      <section className="mx-auto max-w-7xl px-4" aria-labelledby="trending">
        <h2 id="trending" className="mb-4 text-2xl font-bold">Trending now</h2>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <GridSkeleton /> : <Grid items={data!.items} />}
      </section>
    </div>
  )
}

const GridSkeleton = () => <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4] w-full" />)}</div>

export function CategoriesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8"><h1 className="mb-4 text-2xl font-bold">Categories</h1>
      <ul className="grid gap-3 sm:grid-cols-2">{CATS.map(c => <li key={c}><Link to={`/shop?category=${encodeURIComponent(c)}`} className="block rounded-2xl border border-line p-5 text-lg font-semibold hover:border-brand hover:bg-ice">{c}</Link></li>)}</ul></div>
  )
}

export function ShopPage() {
  const [sp, setSp] = useSearchParams()
  const q = sp.get('q') ?? '', category = sp.get('category') ?? '', sort = sp.get('sort') ?? 'featured'
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (sp.get('focus') === 'search') input.current?.focus() }, [sp])
  const { data, error, loading, reload } = useApi<Paged<Product>>(`/products?page_size=60&sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ''}${category ? `&category=${encodeURIComponent(category)}` : ''}`)
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); n.delete('focus'); setSp(n) }
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold md:text-3xl">{category || (q ? `Results for “${q}”` : 'All products')}</h1>{data && <p className="text-sm text-muted">{data.total} items</p>}</div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="sr-only" htmlFor="shop-q">Search</label>
          <input id="shop-q" ref={input} defaultValue={q} key={q} onKeyDown={e => e.key === 'Enter' && set('q', e.currentTarget.value)} placeholder="Search" className="rounded-full border border-line bg-ice px-3 py-1.5 md:hidden" />
          <label className="flex items-center gap-1.5">Sort<select value={sort} onChange={e => set('sort', e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1.5"><option value="featured">Featured</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="name">Name</option></select></label>
        </div>
      </div>
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        {['', ...CATS].map(c => <button key={c || 'all'} aria-pressed={category === c} onClick={() => set('category', c)} className={`rounded-full border px-3 py-1.5 text-sm ${category === c ? 'border-brand bg-brand font-semibold' : 'border-line hover:bg-ice'}`}>{c || 'All'}</button>)}
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <GridSkeleton /> : !data?.items.length ? <EmptyState title="Nothing found" hint="Try a different search or clear the category filter." action={<Button variant="outline" onClick={() => setSp({})}>Clear filters</Button>} /> : <Grid items={data.items} />}
    </div>
  )
}

export function ProductPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: p, error, loading } = useApi<Product>(`/products/${id}`)
  const { addToBag, wishlist, toggleWish } = useStore()
  const [size, setSize] = useState('')
  const [added, setAdded] = useState(false)
  const [sizeError, setSizeError] = useState(false)
  if (error) return <div className="mx-auto max-w-3xl p-8"><ErrorState message={error} /></div>
  if (loading || !p) return <div className="mx-auto grid max-w-6xl gap-8 p-8 md:grid-cols-2"><Skeleton className="aspect-[3/4]" /><Skeleton className="h-64" /></div>
  const liked = wishlist.includes(p.product_id)
  const add = () => { if (!size) { setSizeError(true); return } addToBag(p.product_id, size); setAdded(true); setTimeout(() => setAdded(false), 2200) }
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-2">
      <div className="overflow-hidden rounded-2xl bg-ice"><ProductImage src={p.product_image} alt={`${p.product_name} from the ${p.seasonal_collection} collection`} category={p.category} className="aspect-[3/4] w-full" /></div>
      <div>
        <nav aria-label="Breadcrumb" className="text-xs text-muted"><Link to="/shop" className="hover:underline">Shop</Link> / <Link to={`/shop?category=${encodeURIComponent(p.category)}`} className="hover:underline">{p.category}</Link></nav>
        <h1 className="mt-2 text-3xl font-bold">{p.product_name}</h1>
        <p className="mt-1 text-2xl">{fmt.gbp(p.price_gbp)}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{p.badges.map(b => <Badge key={b} tone="brand">{b}</Badge>)}<Badge>{p.seasonal_collection}</Badge></div>
        <p className="mt-4 text-sm text-muted">{p.description}</p>
        <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-1 text-sm">
          <dt className="text-muted">Designed for</dt><dd className="capitalize">{p.target_gender_or_collection} · ages {p.target_age_segments.join(', ')}</dd>
          <dt className="text-muted">Style</dt><dd>{p.style_tags.join(', ')}</dd><dt className="text-muted">Category</dt><dd>{p.category}</dd>
        </dl>
        <fieldset className="mt-5"><legend className="mb-2 text-sm font-semibold">Select size</legend>
          <div className="flex flex-wrap gap-2">{p.sizes.map(s => <label key={s} className={`cursor-pointer rounded-xl border px-4 py-2 text-sm ${size === s ? 'border-brand bg-brand font-semibold' : 'border-line hover:bg-ice'}`}><input type="radio" name="size" className="sr-only" value={s} checked={size === s} onChange={() => { setSize(s); setSizeError(false) }} />{s}</label>)}</div>
          {sizeError && <p role="alert" className="mt-2 text-sm text-red-700">Please choose a size.</p>}</fieldset>
        <div className="mt-5 flex gap-2">
          <Button onClick={add} className="flex-1">{added ? <><Check size={16} aria-hidden="true" />Added to bag</> : 'Add to bag'}</Button>
          <Button variant="outline" onClick={() => toggleWish(p.product_id)} aria-pressed={liked} aria-label={liked ? 'Remove from wishlist' : 'Add to wishlist'}><Heart size={16} className={liked ? 'fill-brand text-brand' : ''} aria-hidden="true" /></Button>
        </div>
        <div aria-live="polite" className="sr-only">{added ? `${p.product_name} added to bag` : ''}</div>
        <div className="mt-8 rounded-2xl border border-brand/40 bg-ice p-4">
          <p className="text-sm font-semibold">For the marketing team</p>
          <p className="mb-3 text-xs text-muted">Find influencers whose audiences fit this product.</p>
          <Button onClick={() => nav(`/admin/campaigns/new?product=${p.product_id}`)}><Megaphone size={16} aria-hidden="true" />Promote this product</Button>
        </div>
      </div>
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

export function BagPage() {
  const { bag, setQty, clearBag } = useStore()
  const { data } = useApi<Paged<Product>>('/products?page_size=100')
  const [done, setDone] = useState(false)
  const lines = bag.map(b => ({ ...b, p: data?.items.find(p => p.product_id === b.product_id) })).filter(l => l.p) as (typeof bag[number] & { p: Product })[]
  const total = lines.reduce((s, l) => s + l.p.price_gbp * l.qty, 0)
  if (done) return <div className="mx-auto max-w-xl px-4 py-16 text-center"><div role="status" className="rounded-2xl bg-ice p-8"><Check className="mx-auto mb-2 text-brand" aria-hidden="true" /><h1 className="text-2xl font-bold">Thanks for your (demo) order</h1><p className="mt-1 text-sm text-muted">No payment was taken. This is a demonstration store.</p><Link to="/shop"><Button className="mt-4">Keep shopping</Button></Link></div></div>
  return (
    <div className="mx-auto max-w-3xl px-4 py-8"><h1 className="mb-4 text-2xl font-bold">Your bag</h1>
      {!lines.length ? <EmptyState title="Your bag is empty" action={<Link to="/shop"><Button variant="outline">Start shopping</Button></Link>} /> : <>
        <ul className="divide-y divide-line">{lines.map(l => (
          <li key={l.product_id + l.size} className="flex gap-4 py-4">
            <ProductImage src={l.p.product_image} alt={l.p.product_name} category={l.p.category} className="h-24 w-20 rounded-xl" />
            <div className="flex-1"><p className="font-semibold">{l.p.product_name}</p><p className="text-sm text-muted">Size {l.size} · {fmt.gbp(l.p.price_gbp)}</p>
              <div className="mt-2 flex items-center gap-2"><Button size="sm" variant="outline" aria-label="Decrease quantity" onClick={() => setQty(l.product_id, l.size, l.qty - 1)}><Minus size={14} aria-hidden="true" /></Button><span aria-live="polite" className="w-6 text-center text-sm">{l.qty}</span><Button size="sm" variant="outline" aria-label="Increase quantity" onClick={() => setQty(l.product_id, l.size, l.qty + 1)}><Plus size={14} aria-hidden="true" /></Button>
                <Button size="sm" variant="ghost" aria-label={`Remove ${l.p.product_name}`} onClick={() => setQty(l.product_id, l.size, 0)}><Trash2 size={14} aria-hidden="true" /></Button></div></div>
            <p className="font-semibold">{fmt.gbp(l.p.price_gbp * l.qty)}</p></li>))}</ul>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-4"><p className="text-lg font-bold">Total {fmt.gbp(total)}</p>
          <Button onClick={async () => { await api('/health'); clearBag(); setDone(true) }}>Checkout (demo)</Button></div></>}
    </div>
  )
}
