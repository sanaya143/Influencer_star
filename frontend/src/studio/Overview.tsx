import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, Boxes, Coins, Cpu, Network, Package, PackagePlus, Plus, Receipt, TriangleAlert, Users } from 'lucide-react'
import { useApi } from '../shared/hooks'
import { Badge, Button, Card, ErrorState, ProductImage, Skeleton, Stat, StatusPill } from '../shared/ui'
import { CountUp, Reveal, rise, stagger } from '../shared/motion'
import { fmt, type LeaderGroup, type Product, type Stats, type Usage } from '../api'
import { LeaderBoard, Podium } from './Leaders'

interface OverviewData {
  total_influencers: number; total_products: number; campaigns: number; mode: string
  latest_run: { run_id: string; campaign_id: string; campaign_name: string | null; status: string; stats: Stats | null; usage: Usage | null; created_at: string; leaders: LeaderGroup[] } | null
  recent_campaigns: { campaign_id: string; name: string; created_at: string; status: string; ranked: number | null }[]
  inventory: {
    counts: { active: number; draft: number; archived: number }; units_in_stock: number; stock_value_gbp: number; low_stock_sizes: number
    sold_out_sizes: number; orders_30d: number; revenue_30d: number; bestsellers: Product[]
    low_stock: { product_id: string; product_name: string; product_image: string; size: string; stock: number }[]
  }
}

function Funnel({ s }: { s: Stats }) {
  const steps = [['Evaluated', s.retrieved], ['Eligible', s.eligible], ['Audience match', s.passed_l2], ['Ranked', s.ranked]] as const
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Matching funnel">
      {steps.map(([l, v], i) => (
        <li key={l} className="flex items-center gap-2">
          <span><b className="tabular text-base"><CountUp value={v} /></b> <span className="text-muted">{l.toLowerCase()}</span></span>
          {i < steps.length - 1 && <ArrowRight size={14} aria-hidden="true" className="text-muted" />}
        </li>
      ))}
    </ol>
  )
}

export default function Overview() {
  const { data, error, loading, reload } = useApi<OverviewData>('/overview')
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !data) return <div className="mx-auto max-w-7xl space-y-4"><Skeleton className="h-64" /><div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}</div></div>
  const run = data.latest_run
  const s = run?.stats
  const inv = data.inventory
  const overall = run?.leaders.find(g => g.key === 'overall')?.items ?? []
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Hero: latest campaign with its top 3 */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
        className="shadow-card relative overflow-hidden rounded-3xl border border-line bg-surface">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-brand/10 blur-3xl" />
        <div className="relative grid items-center gap-8 p-6 md:p-8 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <Badge tone="brand">{run ? 'Latest campaign' : 'Welcome'}</Badge>
            <h1 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">{run ? (run.campaign_name ?? 'Campaign') : 'Find creators who actually fit the product'}</h1>
            {run ? (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted"><StatusPill status={run.status} /><span>Run {fmt.ago(run.created_at)}</span></div>
                {s && <Funnel s={s} />}
              </div>
            ) : (
              <p className="mt-3 max-w-lg text-muted">Pick a product, describe the campaign, and the agents shortlist creators with deterministic Python filters and transparent scores.</p>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              {run && <Link to={`/admin/campaigns/${run.campaign_id}`}><Button>Open results<ArrowRight size={16} aria-hidden="true" /></Button></Link>}
              {run && <Link to={`/admin/campaigns/${run.campaign_id}/agents`}><Button variant="outline"><Network size={16} aria-hidden="true" />Agent graph</Button></Link>}
              <Link to="/admin/campaigns/new"><Button variant={run ? 'ghost' : 'primary'}><Plus size={16} aria-hidden="true" />New campaign</Button></Link>
            </div>
          </div>
          <div className="min-h-[200px]">
            {run && overall.length ? (
              <>
                <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.14em] text-muted">Top 3 creators</p>
                <Podium items={overall} campaignId={run.campaign_id} />
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
                <Users aria-hidden="true" />Launch a campaign to see the top creators here.
              </div>
            )}
          </div>
        </div>
      </motion.section>

      {run && run.leaders.length > 0 && (
        <section aria-labelledby="leaders-h">
          <div className="mb-3 flex items-end justify-between gap-2">
            <h2 id="leaders-h" className="text-lg font-semibold">Top 3 in each field</h2>
            <Link to={`/admin/campaigns/${run.campaign_id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:underline">Full ranked list<ArrowUpRight size={14} aria-hidden="true" /></Link>
          </div>
          <LeaderBoard groups={run.leaders} campaignId={run.campaign_id} keys={['audience_fit', 'promo_views', 'engagement', 'micro']} />
        </section>
      )}

      <motion.section aria-label="Key metrics" variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Creators in dataset', value: <CountUp value={data.total_influencers} />, sub: 'Synthetic mock social data', icon: <Users size={15} /> },
          { label: 'Campaigns', value: <CountUp value={data.campaigns} />, sub: s ? `${fmt.n(s.ranked)} ranked in the latest run` : 'No runs yet', icon: <Network size={15} /> },
          { label: 'Revenue, last 30 days', value: <CountUp value={inv.revenue_30d} format={v => fmt.money(v)} />, sub: `${fmt.n(inv.orders_30d)} orders`, icon: <Coins size={15} /> },
          { label: 'Tokens, latest run', value: run?.usage ? <CountUp value={run.usage.total_tokens} /> : '—', sub: run?.usage ? (run.usage.mode === 'offline' ? 'Offline mode: no LLM used' : run.usage.token_source === 'actual' ? 'Provider-reported' : 'Estimated') : '—', icon: <Cpu size={15} /> },
        ].map(k => <motion.div key={k.label} variants={rise}><Stat label={k.label} value={k.value} sub={k.sub} icon={k.icon} /></motion.div>)}
      </motion.section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Reveal className="lg:col-span-2">
          <Card className="h-full p-5">
            <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Recent campaigns</h2><Link to="/admin/agents" className="text-sm font-medium text-brand-ink hover:underline">Agent runs</Link></div>
            {!data.recent_campaigns.length ? (
              <p className="mt-3 text-sm text-muted">No campaigns yet. Create one here, or open a product in the storefront and choose “Promote this product”.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {data.recent_campaigns.map(c => (
                  <li key={c.campaign_id}>
                    <Link to={`/admin/campaigns/${c.campaign_id}`} className="group flex items-center justify-between gap-3 py-3 text-sm">
                      <span className="min-w-0"><span className="block truncate font-medium group-hover:text-brand-ink">{c.name}</span><span className="text-xs text-muted">{fmt.ago(c.created_at)}{c.ranked != null ? ` · ${c.ranked} ranked` : ''}</span></span>
                      <span className="flex items-center gap-2"><StatusPill status={c.status} /><ArrowRight size={15} aria-hidden="true" className="text-muted transition-transform group-hover:translate-x-1" /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>
        <Reveal delay={0.08}>
          <Card className="h-full p-5">
            <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Inventory</h2><Link to="/admin/inventory/new" aria-label="Add product" className="rounded-lg p-1.5 text-brand-ink hover:bg-ice"><PackagePlus size={18} aria-hidden="true" /></Link></div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-ice p-3"><dt className="text-xs text-muted">Live products</dt><dd className="text-xl font-semibold"><CountUp value={inv.counts.active} /></dd></div>
              <div className="rounded-xl bg-ice p-3"><dt className="text-xs text-muted">Units in stock</dt><dd className="text-xl font-semibold"><CountUp value={inv.units_in_stock} /></dd></div>
            </dl>
            <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Bestsellers, 30 days</h3>
            <ul className="space-y-2">
              {inv.bestsellers.map((p, i) => (
                <li key={p.product_id}>
                  <Link to={`/admin/inventory/${p.product_id}`} className="group flex items-center gap-3 text-sm">
                    <span className="w-4 text-xs font-bold text-muted">{i + 1}</span>
                    <ProductImage src={p.product_image} alt="" name={p.product_name} category={p.category} colour={p.colour} width={96} className="h-12 w-9 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1 truncate font-medium group-hover:text-brand-ink">{p.product_name}</span>
                    <span className="tabular text-xs text-muted">{p.units_sold_30d} sold</span>
                  </Link>
                </li>
              ))}
            </ul>
            {(inv.low_stock_sizes > 0 || inv.sold_out_sizes > 0) && (
              <Link to="/admin/inventory?stock=attention" className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900 transition-colors hover:border-amber-300 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                <TriangleAlert size={15} aria-hidden="true" />{inv.low_stock_sizes} low and {inv.sold_out_sizes} sold-out sizes need attention
              </Link>
            )}
            <div className="mt-4 flex gap-2">
              <Link to="/admin/inventory" className="flex-1"><Button variant="outline" size="sm" className="w-full"><Boxes size={15} aria-hidden="true" />Inventory</Button></Link>
              <Link to="/admin/orders" className="flex-1"><Button variant="outline" size="sm" className="w-full"><Receipt size={15} aria-hidden="true" />Orders</Button></Link>
            </div>
          </Card>
        </Reveal>
      </section>

      <Reveal>
        <Card className="p-5">
          <h2 className="text-lg font-semibold">How a campaign runs</h2>
          <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {[['Brief (rules)', 'Product or collection, reviewed by you'], ['Creators', 'Zylo data + outside provider over MCP'], ['Level 1 (Python)', 'Eligibility thresholds'], ['Level 2 (Python)', 'Audience, style & collection themes'], ['Ranking & ROI', 'Weighted score, budget plan'], ['Insights agent', 'Explains the shortlist']].map(([t, d], i) => (
              <motion.li key={t} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07 }}
                className="relative rounded-xl border border-line bg-ice p-3">
                <span className="text-xs font-bold text-brand-ink">0{i + 1}</span>
                <p className="font-semibold">{t}</p><p className="text-xs text-muted">{d}</p>
              </motion.li>
            ))}
          </ol>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted"><Package size={14} aria-hidden="true" />Products come from the same inventory database the storefront sells from. Filtering and ranking decisions are deterministic Python.</p>
        </Card>
      </Reveal>
    </div>
  )
}
