import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BadgePoundSterling, Info, PiggyBank, Scale } from 'lucide-react'
import { fmt, type CreatorEconomics, type PlanSummary, type RoiAnalysis } from '../api'
import { useApi } from '../shared/hooks'
import { Avatar, Badge, Card, EmptyState, ErrorState, Segmented, Skeleton, inputCls } from '../shared/ui'
import { useCampaign } from './CampaignLayout'
import { CountUp } from '../shared/motion'

const PRESETS = [1000, 2500, 5000, 10000, 25000]
const FLAG_TONE = { 'good value': 'ok', fair: 'neutral', 'above market': 'warn' } as const
const TIER = { nano: 'Nano (<10k)', micro: 'Micro (10k–100k)', mid: 'Mid (100k–500k)', macro: 'Macro (500k+)' } as Record<string, string>
const DELIVERABLE: Record<string, string> = { post: 'feed post', story: 'story', short_video: 'short video', long_video: 'YouTube video' }

function useDebounced<T>(v: T, ms = 350) {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}

const ROWS: { key: keyof PlanSummary; label: string; f: (v: number) => string; better: 'high' | 'low' }[] = [
  { key: 'creators', label: 'Creators booked', f: v => String(v), better: 'high' },
  { key: 'spend_gbp', label: 'Spend', f: fmt.money, better: 'low' },
  { key: 'views', label: 'Expected views', f: fmt.n, better: 'high' },
  { key: 'relevant_views', label: 'Views from the target audience', f: fmt.n, better: 'high' },
  { key: 'cpm_gbp', label: 'Cost per 1,000 views', f: v => `£${v.toFixed(2)}`, better: 'low' },
  { key: 'expected_orders', label: 'Expected orders', f: v => v.toFixed(0), better: 'high' },
  { key: 'expected_revenue_gbp', label: 'Expected revenue', f: fmt.money, better: 'high' },
  { key: 'cost_per_order_gbp', label: 'Cost per order', f: v => `£${v.toFixed(2)}`, better: 'low' },
  { key: 'roas', label: 'Revenue per £1 spent (ROAS)', f: v => `£${v.toFixed(2)}`, better: 'high' },
]

/** Relative change from the follower-led plan to Zylo's, phrased so "better" always reads as better. */
function delta(r: (typeof ROWS)[number], x: number | null, y: number | null): { text: string; good: boolean } | null {
  if (x == null || y == null || !y || r.key === 'spend_gbp' || r.key === 'creators') return null
  const ratio = x / y
  if (r.better === 'low') { const pct = Math.round((1 - ratio) * 100); return pct ? { text: `${Math.abs(pct)}% ${pct > 0 ? 'lower' : 'higher'}`, good: pct > 0 } : null }
  return Math.abs(ratio - 1) < 0.005 ? null : { text: ratio >= 2 ? `${ratio.toFixed(1)}×` : `${ratio > 1 ? '+' : '−'}${Math.abs(Math.round((ratio - 1) * 100))}%`, good: ratio > 1 }
}

/** The comparison that sells the product: same budget, fit-and-price picks vs biggest accounts. One frame, no scrolling. */
function HowZyloHelps({ a }: { a: RoiAnalysis }) {
  const ours = a.plan.summary, theirs = a.baseline.summary, cmp = a.comparison
  const lead = a.optimised_for === 'revenue' && cmp.orders_multiple
    ? { value: `${cmp.orders_multiple}×`, what: 'the expected orders' }
    : cmp.relevant_views_multiple ? { value: `${cmp.relevant_views_multiple}×`, what: 'the views from your target audience' } : null
  const supporting = [
    cmp.cpm_saving_pct != null && cmp.cpm_saving_pct > 0 ? { value: `${cmp.cpm_saving_pct}%`, what: 'lower cost per 1,000 views' } : null,
    cmp.orders_multiple && a.optimised_for !== 'revenue' ? { value: `${cmp.orders_multiple}×`, what: 'the expected orders' } : null,
    cmp.cost_per_order_saving_pct != null && cmp.cost_per_order_saving_pct > 0 ? { value: `${cmp.cost_per_order_saving_pct}%`, what: 'lower cost per order' } : null,
  ].filter(Boolean) as { value: string; what: string }[]
  return (
    <section aria-labelledby="zylo-helps-h" className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid gap-6 border-b border-line p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-center">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted"><Scale size={14} aria-hidden="true" />How Zylo helps</p>
          <h2 id="zylo-helps-h" className="mt-2 text-[22px] font-semibold leading-tight tracking-tight">Same {fmt.money(a.budget_gbp)} budget, better creators</h2>
          <p className="mt-2 text-sm text-muted">Picking by audience fit and price, instead of by follower count, changes what the money buys.</p>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          {lead && (
            <div className="rounded-lg bg-brand/10 p-4">
              <p className="tabular font-display text-[40px] font-semibold leading-none tracking-tight text-brand-ink"><CountUp value={parseFloat(lead.value)} format={v => `${v.toFixed(2)}×`} /></p>
              <p className="mt-2 text-sm font-medium">{lead.what}</p>
            </div>
          )}
          <ul className="grid content-center gap-2">
            {supporting.map(x => (
              <li key={x.what} className="flex items-baseline gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
                <span className="tabular w-16 shrink-0 text-lg font-semibold text-ink">{x.value}</span><span className="text-sm text-muted">{x.what}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div role="table" aria-label={`Zylo plan compared with booking the biggest accounts, same ${fmt.money(a.budget_gbp)} budget`} className="px-5 pb-2 pt-1 md:px-6">
        <div role="row" className="hidden grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] gap-4 border-b border-line py-2.5 text-xs font-medium text-muted sm:grid">
          <span role="columnheader">Metric</span><span role="columnheader" className="text-right text-ink">Zylo plan</span>
          <span role="columnheader" className="text-right" title={a.baseline.label}>Biggest accounts</span><span role="columnheader" className="text-right">Difference</span>
        </div>
        {ROWS.map(r => {
          const x = ours[r.key], y = theirs[r.key], d = delta(r, x, y)
          return (
            <div role="row" key={r.key} className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-line py-2.5 text-sm last:border-0 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] sm:items-center">
              <span role="rowheader" className="col-span-2 text-muted sm:col-span-1">{r.label}</span>
              <span role="cell" className="tabular font-semibold sm:text-right"><span className="mr-1 text-[11px] font-normal text-muted sm:hidden">Zylo</span>{x == null ? '—' : r.f(x)}</span>
              <span role="cell" className="tabular text-right text-muted"><span className="mr-1 text-[11px] sm:hidden">Biggest</span>{y == null ? '—' : r.f(y)}</span>
              <span role="cell" className="hidden text-right sm:block">{d ? <span className={`tabular inline-block rounded-md px-1.5 py-0.5 text-xs font-semibold ${d.good ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300'}`}>{d.text}</span> : <span className="text-muted">–</span>}</span>
            </div>
          )
        })}
      </div>
      <p className="border-t border-line bg-ice/60 px-5 py-3 text-xs text-muted md:px-6">“Biggest accounts” books the largest creators in the right fashion category that pass the same eligibility rules until the budget runs out, the way creators are often picked without a tool like this. Estimates from synthetic data.</p>
    </section>
  )
}

function CreatorRow({ c, campaignId }: { c: CreatorEconomics; campaignId: string }) {
  return (
    <tr>
      <td><div className="flex items-center gap-2"><Avatar name={c.display_name} size={26} />
        <span className="min-w-0"><Link to={`/admin/campaigns/${campaignId}/influencer/${c.influencer_id}`} className="font-medium hover:text-brand-ink">{c.display_name}</Link>
          <span className="block text-[11px] text-muted">{c.platform} · {fmt.k(c.followers)}{c.source !== 'zylo' ? ' · outside provider' : ''}{c.rank ? ` · #${c.rank}` : ''}</span></span></div></td>
      <td className="num"><b>{fmt.money(c.fee_gbp)}</b>{c.fee_estimated && <span className="block text-[10px] text-muted">estimated</span>}<span className="block text-[10px] text-muted">{c.deliverable ? DELIVERABLE[c.deliverable] ?? c.deliverable : ''}</span></td>
      <td className="num">{c.fair_fee_gbp != null ? fmt.money(c.fair_fee_gbp) : '—'}</td>
      <td>{c.value_flag ? <Badge tone={FLAG_TONE[c.value_flag]}>{c.value_flag}</Badge> : <span className="text-xs text-muted">no rate card</span>}</td>
      <td className="num">{fmt.n(c.views)}</td>
      <td className="num">£{c.cpm_gbp.toFixed(2)}</td>
      <td className="num">{c.expected_orders.toFixed(1)}</td>
      <td className="num">{fmt.money(c.expected_revenue_gbp)}</td>
      <td className="num font-semibold">£{c.roas.toFixed(2)}</td>
    </tr>
  )
}

function CreatorTable({ rows, campaignId, caption }: { rows: CreatorEconomics[]; campaignId: string; caption: string }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="dense w-full min-w-[860px]">
        <caption className="sr-only">{caption}</caption>
        <thead><tr><th scope="col">Creator</th><th scope="col" className="num">Asks</th><th scope="col" className="num">Market rate</th><th scope="col">Value</th>
          <th scope="col" className="num">Views</th><th scope="col" className="num">Cost / 1k views</th><th scope="col" className="num">Exp. orders</th><th scope="col" className="num">Exp. revenue</th><th scope="col" className="num">ROAS</th></tr></thead>
        <tbody>{rows.map(c => <CreatorRow key={c.influencer_id} c={c} campaignId={campaignId} />)}</tbody>
      </table>
    </div>
  )
}

export default function Roi() {
  const { campaignId, done, runId } = useCampaign()
  const [budget, setBudget] = useState<number | null>(null)
  const [flag, setFlag] = useState<'all' | 'good value' | 'fair' | 'above market'>('all')
  const b = useDebounced(budget)
  const res = useApi<RoiAnalysis>(done ? `/campaigns/${campaignId}/roi${b ? `?budget=${b}` : ''}${b ? '&' : '?'}r=${runId}` : null)
  const a = res.data
  useEffect(() => { if (a && budget == null) setBudget(a.budget_gbp) }, [a, budget])
  const rates = useMemo(() => (a?.rates ?? []).filter(r => flag === 'all' || r.value_flag === flag), [a, flag])

  if (!done) return <Card className="p-6"><p className="text-sm text-muted">The ROI plan appears when the run finishes.</p><Skeleton className="mt-3 h-40" /></Card>
  if (res.error) return <ErrorState message={res.error} onRetry={res.reload} />
  if (!a) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-72" /></div>

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><BadgePoundSterling size={19} aria-hidden="true" className="text-brand-ink" />Budget plan for {a.product_name}</h2>
          <p className="text-sm text-muted">Books the creators that give the most {a.optimised_for === 'revenue' ? 'expected revenue' : 'target-audience views'} per pound, within the budget. Change the objective to “sales” on a new campaign to plan for orders.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm"><span className="mb-1 block font-medium">Budget (£)</span>
            <input type="number" min={100} step={100} value={budget ?? ''} onChange={e => setBudget(e.target.value ? Number(e.target.value) : null)} className={`${inputCls} w-32`} /></label>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Budget presets">
            {PRESETS.map(p => <button key={p} type="button" onClick={() => setBudget(p)} aria-pressed={budget === p}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${budget === p ? 'border-brand bg-brand text-on-brand' : 'border-line hover:border-brand'}`}>£{fmt.k(p)}</button>)}
          </div>
        </div>
      </Card>

      {res.loading && <p className="text-xs text-muted" role="status">Recalculating…</p>}
      {!a.plan.creators.length ? <EmptyState title="No creator fits this budget" hint="Raise the budget: every shortlisted creator asks more than this." /> : (
        <>
          <motion.div className="min-w-0" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><HowZyloHelps a={a} /></motion.div>

          <section aria-labelledby="charge-h" className="rounded-xl border border-line bg-surface p-5 md:p-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-center">
              <div className="min-w-0">
                <h2 id="charge-h" className="flex items-center gap-2 text-[15px] font-semibold"><PiggyBank size={16} aria-hidden="true" className="text-muted" />What creators charge</h2>
                <p className="mt-1 text-sm text-muted">Each shortlisted creator's asking price against what creators of the same size and platform charge for the same number of views.</p>
                {a.negotiation_saving_gbp > 0 && <p className="mt-3 text-sm">Negotiating above-market creators down to the market rate would save about <b className="tabular">{fmt.money(a.negotiation_saving_gbp)}</b> across the top {a.rates.length}.</p>}
                <p className="mt-2 text-xs text-muted">Revenue uses a unit price of {fmt.gbp(a.unit_price_gbp)}.</p>
              </div>
              <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line text-center">
                {(['good value', 'fair', 'above market'] as const).map(k => (
                  <div key={k} className="bg-surface px-3 py-4"><dt className="text-xs capitalize text-muted">{k}</dt><dd className="tabular mt-1 text-2xl font-semibold"><CountUp value={a.value_flags[k] ?? 0} /></dd></div>
                ))}
              </dl>
            </div>
          </section>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <h3 className="font-semibold">The plan: {a.plan.creators.length} creators for {fmt.money(a.plan.summary.spend_gbp)}</h3>
              <span className="text-xs text-muted">{fmt.money(a.budget_gbp - a.plan.summary.spend_gbp)} of the budget left</span>
            </div>
            <CreatorTable rows={a.plan.creators} campaignId={campaignId} caption="Creators in the budget plan" />
          </Card>
        </>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <div><h3 className="font-semibold">Rate check: top {a.rates.length} ranked creators</h3><p className="text-xs text-muted">Use it to negotiate: offer around the market rate to creators marked above market.</p></div>
          <Segmented size="sm" label="Filter by value" value={flag} onChange={setFlag}
            options={[{ value: 'all', label: 'All' }, { value: 'good value', label: 'Good value' }, { value: 'fair', label: 'Fair' }, { value: 'above market', label: 'Above market' }]} />
        </div>
        {rates.length ? <CreatorTable rows={rates} campaignId={campaignId} caption="Asking price against market rate for the top ranked creators" /> : <p className="p-5 text-sm text-muted">No creators in this group.</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-2 font-semibold">Market rates</h3>
          <div className="scrollbar-thin max-h-80 overflow-auto">
            <table className="dense w-full">
              <caption className="sr-only">Median creator rates by size and platform</caption>
              <thead><tr><th scope="col">Size</th><th scope="col">Platform</th><th scope="col" className="num">Median cost / 1k views</th><th scope="col" className="num">Per 1k followers</th><th scope="col" className="num">Creators</th></tr></thead>
              <tbody>{a.benchmarks.map(r => <tr key={`${r.tier}-${r.platform}`}><td>{TIER[r.tier] ?? r.tier}</td><td>{r.platform}</td><td className="num">£{r.median_cpm.toFixed(2)}</td><td className="num">£{(r.median_fee_per_follower * 1000).toFixed(2)}</td><td className="num">{r.creators}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="mb-2 flex items-center gap-2 font-semibold"><Info size={16} aria-hidden="true" className="text-brand-ink" />How these numbers are worked out</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">{a.assumptions.map(s => <li key={s}>{s}</li>)}</ul>
          <Badge className="mt-3" tone="warn">{a.label}</Badge>
        </Card>
      </div>
    </div>
  )
}
