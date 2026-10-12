import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Coins, Receipt, Search, ShoppingBag, Store } from 'lucide-react'
import { fmt, type InventorySummary, type Order, type Paged } from '../api'
import { useApi } from '../shared/hooks'
import { Badge, Button, Card, EmptyState, ErrorState, ProductImage, Skeleton, Stat, inputCls, selectCls } from '../shared/ui'
import { CountUp, Reveal, rise, stagger } from '../shared/motion'
import { CategoryBars, ChartFrame, RevenueChart, revenueTable } from '../charts/charts'

export default function Orders() {
  const [page, setPage] = useState(1)
  const [channel, setChannel] = useState('')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => { const t = setTimeout(() => { setQuery(q); setPage(1) }, 300); return () => clearTimeout(t) }, [q])
  const summary = useApi<InventorySummary>('/inventory/summary')
  const orders = useApi<Paged<Order>>(`/orders?page=${page}&page_size=15${channel ? `&channel=${channel}` : ''}${query ? `&q=${encodeURIComponent(query)}` : ''}`)
  useEffect(() => { const t = setInterval(() => { orders.reload(); summary.reload() }, 10000); return () => clearInterval(t) }, [orders.reload, summary.reload])
  // Highlight orders that arrived since the previous poll (page 1 only).
  const newest = useRef<string | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!orders.data || page !== 1) return
    const prev = newest.current
    if (prev) setFresh(new Set(orders.data.items.filter(o => o.created_at > prev).map(o => o.order_id)))
    const top = orders.data.items[0]?.created_at
    if (top && (!prev || top > prev)) newest.current = top
  }, [orders.data, page])
  const s = summary.data
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Orders</h1>
        <p className="text-sm text-muted">Every storefront checkout lands here and reduces stock in Inventory. Historical orders are synthetic demo data.</p>
      </header>
      {s ? (
        <motion.section variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Order metrics">
          <motion.div variants={rise}><Stat label="Orders, 30 days" value={<CountUp value={s.orders_30d} />} icon={<Receipt size={15} />} /></motion.div>
          <motion.div variants={rise}><Stat label="Revenue, 30 days" value={<CountUp value={s.revenue_30d} format={v => fmt.money(v)} />} icon={<Coins size={15} />} /></motion.div>
          <motion.div variants={rise}><Stat label="Average order value" value={<CountUp value={s.aov_30d} format={v => fmt.gbp(Math.round(v * 100) / 100)} />} sub={`${fmt.n(s.units_30d)} units sold`} icon={<ShoppingBag size={15} />} /></motion.div>
          <motion.div variants={rise}><Stat label="Storefront checkouts" value={<CountUp value={s.storefront_orders_30d} />} sub="Placed through this demo store" icon={<Store size={15} />} accent /></motion.div>
        </motion.section>
      ) : <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}</div>}

      {s && (
        <div className="grid gap-5 lg:grid-cols-5">
          <Reveal className="lg:col-span-3"><ChartFrame title="Revenue per day" subtitle="Last 30 days. The peak day is labelled." table={revenueTable(s.daily)}><RevenueChart daily={s.daily} /></ChartFrame></Reveal>
          <Reveal className="lg:col-span-2" delay={0.06}><ChartFrame title="Units sold by category" subtitle="Last 30 days"><CategoryBars data={s.by_category} /></ChartFrame></Reveal>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="relative"><span className="sr-only">Search orders</span><Search size={15} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Order, customer or product" className={`${inputCls} w-64 pl-9`} /></label>
          <select aria-label="Channel" value={channel} onChange={e => { setChannel(e.target.value); setPage(1) }} className={selectCls}><option value="">All channels</option><option value="storefront">Storefront</option><option value="seed">Historical (synthetic)</option></select>
          {orders.data && <span className="ml-auto text-muted">{fmt.n(orders.data.total)} orders</span>}
        </div>
        {orders.error ? <ErrorState message={orders.error} onRetry={orders.reload} /> : !orders.data ? <Skeleton className="h-96" /> : !orders.data.items.length ? (
          <EmptyState title="No orders found" hint="Place an order in the storefront and it will appear here." action={<a href="/shop" target="_blank" rel="noreferrer"><Button variant="outline" size="sm">Open the storefront</Button></a>} />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="dense w-full min-w-[820px]">
                <caption className="sr-only">Orders</caption>
                <thead><tr><th scope="col">Order</th><th scope="col">Placed</th><th scope="col">Customer</th><th scope="col">Items</th><th scope="col" className="num">Units</th><th scope="col" className="num">Total</th><th scope="col">Channel</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {orders.data.items.map(o => (
                      <motion.tr key={o.order_id} layout initial={{ opacity: 0, backgroundColor: 'rgba(1,171,221,0.22)' }} animate={{ opacity: 1, backgroundColor: fresh.has(o.order_id) ? 'rgba(1,171,221,0.12)' : 'rgba(1,171,221,0)' }}
                        transition={{ duration: 0.4, backgroundColor: { duration: 2 } }} className="hover:bg-ice">
                        <td className="font-mono text-xs font-semibold">{o.order_id}</td>
                        <td className="whitespace-nowrap text-xs">{fmt.ago(o.created_at)}<div className="text-muted">{new Date(o.created_at).toLocaleDateString('en-GB')}</div></td>
                        <td>{o.customer_name}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="flex -space-x-2">{o.lines.slice(0, 3).map(l => <ProductImage key={l.product_id + l.size} src={l.product_image ?? ''} alt="" name={l.product_name} category="" width={64} className="h-9 w-7 rounded-md ring-2 ring-surface" />)}</div>
                            <span className="min-w-0 text-xs">{o.lines.map(l => <Link key={l.product_id + l.size} to={`/admin/inventory/${l.product_id}`} className="block truncate hover:text-brand-ink">{l.qty} × {l.product_name} <span className="text-muted">({l.size})</span></Link>)}</span>
                          </div>
                        </td>
                        <td className="num">{o.units}</td>
                        <td className="num font-semibold">{fmt.gbp(o.total_gbp)}</td>
                        <td><Badge tone={o.channel === 'storefront' ? 'brand' : 'neutral'}>{o.channel === 'storefront' ? 'Storefront' : 'Historical'}</Badge></td>
                        <td><Badge tone={o.status === 'paid' ? 'warn' : 'ok'}>{o.status === 'paid' ? 'Paid · to ship' : 'Fulfilled'}</Badge></td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
            {orders.data.pages > 1 && (
              <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm">
                <span className="text-muted">Page {page} of {fmt.n(orders.data.pages)}</span>
                <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= orders.data.pages} onClick={() => setPage(p => p + 1)}>Next</Button></div>
              </div>
            )}
          </Card>
        )}
      </section>
    </div>
  )
}
