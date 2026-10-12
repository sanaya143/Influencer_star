import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, Boxes, Coins, ExternalLink, PackagePlus, Pencil, PlusCircle, Search, TriangleAlert, Warehouse } from 'lucide-react'
import { api, fmt, type InventorySummary, type Movement, type Paged, type Product } from '../api'
import { useApi } from '../shared/hooks'
import { Badge, Button, Card, EmptyState, ErrorState, Modal, ProductImage, Skeleton, Stat, inputCls, selectCls } from '../shared/ui'
import { CountUp, rise, stagger } from '../shared/motion'
import { useToast } from '../shared/toast'

const STATE_TONE = { in_stock: 'ok', low: 'warn', out: 'bad' } as const
const STATE_LABEL = { in_stock: 'In stock', low: 'Low stock', out: 'Sold out' } as const
const STATUS_TONE = { active: 'ok', draft: 'neutral', archived: 'bad' } as const

export function SizeChips({ p, low = 5 }: { p: Pick<Product, 'sizes' | 'stock'>; low?: number }) {
  return (
    <div className="flex flex-wrap gap-1">
      {p.sizes.map(s => {
        const v = p.stock[s] ?? 0
        const cls = v === 0 ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300'
          : v <= low ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200' : 'border-line bg-ice text-ink'
        return <span key={s} title={`${s}: ${v} in stock`} className={`tabular rounded-md border px-1.5 py-0.5 text-[11px] ${cls}`}><b>{s}</b> {v}</span>
      })}
    </div>
  )
}

export default function Inventory() {
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const q = sp.get('q') ?? '', category = sp.get('category') ?? '', status = sp.get('status') ?? '', stock = sp.get('stock') ?? '', sort = sp.get('sort') ?? 'updated'
  const page = Number(sp.get('page') ?? 1)
  const [search, setSearch] = useState(q)
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }) }
  useEffect(() => { const t = setTimeout(() => search !== q && set('q', search), 300); return () => clearTimeout(t) }, [search])
  const summary = useApi<InventorySummary>('/inventory/summary')
  const list = useApi<Paged<Product>>(`/inventory/products?page=${page}&page_size=15&sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ''}${category ? `&category=${encodeURIComponent(category)}` : ''}${status ? `&status=${status}` : ''}${stock ? `&stock=${stock}` : ''}`)
  const moves = useApi<{ items: Movement[] }>('/inventory/movements?limit=12')
  const [restock, setRestock] = useState<Product | null>(null)
  useEffect(() => { const t = setInterval(() => { moves.reload(); summary.reload() }, 8000); return () => clearInterval(t) }, [moves.reload, summary.reload])
  const refresh = () => { list.reload(); summary.reload(); moves.reload() }
  const s = summary.data

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Inventory</h1>
          <p className="text-sm text-muted">One product database for the storefront, orders and influencer campaigns. Saving here updates the shop instantly.</p>
        </div>
        <Link to="/admin/inventory/new"><Button><PackagePlus size={16} aria-hidden="true" />Add product</Button></Link>
      </header>

      {s ? (
        <motion.section variants={stagger} initial="hidden" animate="show" aria-label="Inventory metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <motion.div variants={rise}><Stat label="Live products" value={<CountUp value={s.counts.active} />} sub={`${s.counts.draft} draft · ${s.counts.archived} archived`} icon={<Boxes size={15} />} /></motion.div>
          <motion.div variants={rise}><Stat label="Units in stock" value={<CountUp value={s.units_in_stock} />} sub={`${fmt.money(s.stock_value_gbp)} at retail`} icon={<Warehouse size={15} />} /></motion.div>
          <motion.div variants={rise}><Stat label="Sizes needing attention" value={<CountUp value={s.low_stock_sizes + s.sold_out_sizes} />} sub={`${s.low_stock_sizes} low (≤${s.thresholds.low_stock_per_size}) · ${s.sold_out_sizes} sold out`} icon={<TriangleAlert size={15} />} accent={s.sold_out_sizes > 0} /></motion.div>
          <motion.div variants={rise}><Stat label="Revenue, 30 days" value={<CountUp value={s.revenue_30d} format={v => fmt.money(v)} />} sub={`${fmt.n(s.orders_30d)} orders · ${fmt.n(s.units_30d)} units`} icon={<Coins size={15} />} /></motion.div>
        </motion.section>
      ) : <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="relative">
              <span className="sr-only">Search products</span>
              <Search size={15} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, ID, colour, tag" className={`${inputCls} w-60 pl-9`} />
            </label>
            <select aria-label="Category" value={category} onChange={e => set('category', e.target.value)} className={selectCls}>
              <option value="">All categories</option>{['Women', 'Men', 'Kids', 'Unisex', 'Couple Looks', 'Accessories'].map(c => <option key={c}>{c}</option>)}</select>
            <select aria-label="Status" value={status} onChange={e => set('status', e.target.value)} className={selectCls}>
              <option value="">Active & draft</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
            <select aria-label="Stock" value={stock} onChange={e => set('stock', e.target.value)} className={selectCls}>
              <option value="">Any stock</option><option value="attention">Needs attention</option><option value="low">Low stock</option><option value="out">Sold out</option><option value="in_stock">In stock</option></select>
            <select aria-label="Sort" value={sort} onChange={e => set('sort', e.target.value)} className={selectCls}>
              <option value="updated">Recently updated</option><option value="newest">Newest</option><option value="bestsellers">Bestsellers (30 days)</option><option value="stock_asc">Stock: low to high</option><option value="price_desc">Price: high to low</option><option value="name">Name</option></select>
            {list.data && <span className="ml-auto text-muted">{fmt.n(list.data.total)} products</span>}
          </div>

          {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.data ? <Skeleton className="h-96" /> : !list.data.items.length ? (
            <EmptyState title="No products match" hint="Clear a filter, or add a new product." action={<Link to="/admin/inventory/new"><Button variant="outline" size="sm">Add product</Button></Link>} />
          ) : (
            <Card className={`overflow-hidden transition-opacity ${list.loading ? 'opacity-60' : ''}`}>
              <div className="overflow-x-auto">
                <table className="dense w-full min-w-[860px]">
                  <caption className="sr-only">Products</caption>
                  <thead><tr><th scope="col">Product</th><th scope="col">Category</th><th scope="col" className="num">Price</th><th scope="col">Stock by size</th><th scope="col">Status</th><th scope="col" className="num">Sold 30d</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {list.data.items.map((p, i) => (
                      <motion.tr key={p.product_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className="group transition-colors hover:bg-ice">
                        <td>
                          <button type="button" onClick={() => nav(`/admin/inventory/${p.product_id}`)} className="flex items-center gap-3 text-left">
                            <ProductImage src={p.product_image} alt="" name={p.product_name} category={p.category} colour={p.colour} width={96} className="h-14 w-11 shrink-0 rounded-lg" />
                            <span className="min-w-0">
                              <span className="block font-semibold group-hover:text-brand-ink">{p.product_name}</span>
                              <span className="block text-xs text-muted"><span className="font-mono">{p.product_id}</span> · {p.colour || '—'}{p.seasonal_collection ? ` · ${p.seasonal_collection}` : ''}</span>
                            </span>
                          </button>
                        </td>
                        <td className="text-xs">{p.category}{p.target_gender_or_collection !== p.category.toLowerCase() && <div className="capitalize text-muted">for {p.target_gender_or_collection}</div>}</td>
                        <td className="num font-semibold">{fmt.gbp(p.price_gbp)}</td>
                        <td><div className="mb-1 flex items-center gap-2"><Badge tone={STATE_TONE[p.stock_state]}>{STATE_LABEL[p.stock_state]}</Badge><span className="tabular text-xs text-muted">{fmt.n(p.total_stock)} units</span></div><SizeChips p={p} /></td>
                        <td><Badge tone={STATUS_TONE[p.status]} className="capitalize">{p.status}</Badge></td>
                        <td className="num">{fmt.n(p.units_sold_30d)}</td>
                        <td>
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" aria-label={`Restock ${p.product_name}`} title="Restock" onClick={() => setRestock(p)}><PlusCircle size={15} aria-hidden="true" /></Button>
                            <Button size="sm" variant="ghost" aria-label={`Edit ${p.product_name}`} title="Edit" onClick={() => nav(`/admin/inventory/${p.product_id}`)}><Pencil size={15} aria-hidden="true" /></Button>
                            {p.status === 'active' && <a href={`/product/${p.product_id}`} target="_blank" rel="noreferrer" aria-label={`View ${p.product_name} in the storefront (new tab)`} title="View in store" className="inline-flex items-center rounded-xl px-3 py-1.5 text-ink hover:bg-ice"><ExternalLink size={15} aria-hidden="true" /></a>}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {list.data.pages > 1 && (
                <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm">
                  <span className="text-muted">Page {page} of {list.data.pages}</span>
                  <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>Previous</Button><Button size="sm" variant="outline" disabled={page >= list.data.pages} onClick={() => set('page', String(page + 1))}>Next</Button></div>
                </div>
              )}
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-brand opacity-60" /><span className="relative h-2 w-2 rounded-full bg-brand" /></span>Live stock movements</h2>
            <p className="mb-3 text-xs text-muted">Back-office edits and storefront orders, newest first.</p>
            {!moves.data ? <Skeleton className="h-48" /> : !moves.data.items.length ? <p className="text-xs text-muted">No movements yet.</p> : (
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {moves.data.items.map(m => (
                    <motion.li key={m.id} layout initial={{ opacity: 0, x: 16, backgroundColor: 'rgba(1,171,221,0.18)' }} animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(1,171,221,0)' }}
                      transition={{ duration: 0.5, backgroundColor: { duration: 1.6 } }} className="flex items-start gap-2 rounded-lg p-1 text-xs">
                      <span className={`mt-0.5 rounded-md p-1 ${m.delta < 0 ? 'bg-ice text-ink' : 'bg-brand/15 text-brand-ink'}`}>{m.delta < 0 ? <ArrowDownRight size={13} aria-hidden="true" /> : <ArrowUpRight size={13} aria-hidden="true" />}</span>
                      <span className="min-w-0 flex-1">
                        <Link to={`/admin/inventory/${m.product_id}`} className="block truncate font-medium hover:text-brand-ink">{m.product_name}</Link>
                        <span className="text-muted">{m.reason} · size {m.size} · {fmt.ago(m.created_at)}</span>
                      </span>
                      <span className="tabular text-right"><b>{m.delta > 0 ? '+' : ''}{m.delta}</b><span className="block text-muted">→ {m.balance}</span></span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Card>
          {s && s.low_stock.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Restock first</h2>
              <ul className="space-y-2">
                {s.low_stock.slice(0, 5).map(l => (
                  <li key={`${l.product_id}-${l.size}`} className="flex items-center gap-2 text-xs">
                    <ProductImage src={l.product_image} alt="" name={l.product_name} category="" width={64} className="h-9 w-7 shrink-0 rounded-md" />
                    <Link to={`/admin/inventory/${l.product_id}`} className="min-w-0 flex-1 truncate font-medium hover:text-brand-ink">{l.product_name}</Link>
                    <Badge tone={l.stock === 0 ? 'bad' : 'warn'}>{l.size}: {l.stock}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
      <RestockModal product={restock} onClose={() => setRestock(null)} onDone={refresh} />
    </div>
  )
}

export function RestockModal({ product, onClose, onDone }: { product: Product | null; onClose: () => void; onDone: () => void }) {
  const [size, setSize] = useState('')
  const [qty, setQty] = useState(10)
  const [reason, setReason] = useState('Restock delivery')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => { if (product) setSize(product.sizes.find(s => (product.stock[s] ?? 0) <= 5) ?? product.sizes[0]) }, [product])
  async function save() {
    if (!product) return
    setBusy(true)
    try {
      await api(`/inventory/products/${product.product_id}/stock`, { method: 'POST', json: { size, delta: qty, reason } })
      toast({ tone: 'ok', title: 'Stock updated', body: `${product.product_name} · size ${size} ${qty > 0 ? '+' : ''}${qty}. The storefront shows it immediately.` })
      onDone(); onClose()
    } catch (e) { toast({ tone: 'bad', title: 'Could not update stock', body: (e as Error).message }) } finally { setBusy(false) }
  }
  return (
    <Modal open={!!product} onClose={onClose} title={product ? `Adjust stock · ${product.product_name}` : 'Adjust stock'}>
      {product && (
        <div className="space-y-4 text-sm">
          <SizeChips p={product} />
          <div className="grid grid-cols-2 gap-3">
            <label><span className="mb-1 block text-xs font-medium text-muted">Size</span><select value={size} onChange={e => setSize(e.target.value)} className={`${selectCls} w-full`}>{product.sizes.map(s => <option key={s} value={s}>{s} ({product.stock[s] ?? 0} in stock)</option>)}</select></label>
            <label><span className="mb-1 block text-xs font-medium text-muted">Change (use − to remove)</span><input type="number" value={qty} onChange={e => setQty(Number(e.target.value))} className={inputCls} /></label>
          </div>
          <label className="block"><span className="mb-1 block text-xs font-medium text-muted">Reason (audit trail)</span><input value={reason} maxLength={80} onChange={e => setReason(e.target.value)} className={inputCls} /></label>
          <p className="text-xs text-muted">New balance for {size}: <b className="text-ink">{Math.max(0, (product.stock[size] ?? 0) + qty)}</b></p>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy || !qty || (product.stock[size] ?? 0) + qty < 0}>Save change</Button></div>
        </div>
      )}
    </Modal>
  )
}
