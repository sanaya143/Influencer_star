import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, Gauge, UserRound, Users } from 'lucide-react'
import { fmt, type Analytics as A } from '../api'
import { useApi } from '../shared/hooks'
import { Badge, ErrorState, Skeleton, Stat } from '../shared/ui'
import { CountUp, Reveal, rise, stagger } from '../shared/motion'
import {
  AlignmentChart, BreakdownChart, ChartFrame, FunnelChart, ScatterChart, alignmentLegend, alignmentTable, breakdownLegend,
  funnelTable, scatterLegend,
} from '../charts/charts'
import { BreakdownTable, ScatterTable } from '../charts/tables'
import { useCampaign } from './CampaignLayout'

export default function Analytics() {
  const { campaignId, runId, done, trace } = useCampaign()
  const nav = useNavigate()
  const { data, error, reload } = useApi<A>(done && trace?.status !== 'Failed' ? `/campaigns/${campaignId}/analytics?run=${runId}` : null)
  if (!done) return <Skeleton className="h-80" />
  if (trace?.status === 'Failed') return <ErrorState message="The run failed, so there are no analytics to show." />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
  const open = (id: string) => nav(`/admin/campaigns/${campaignId}/influencer/${id}`)
  const s = data.summary
  const mix = Object.entries(s.platform_mix_top10)
  return (
    <div className="space-y-5">
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div variants={rise}><Stat label="Average score, top 10" value={<CountUp value={s.avg_score_top10} format={v => v.toFixed(1)} />} sub="out of 100" icon={<Gauge size={15} />} /></motion.div>
        <motion.div variants={rise}><Stat label="Micro-influencers in top 10" value={<CountUp value={s.micro_in_top10} />} sub="10k–100k followers" icon={<UserRound size={15} />} /></motion.div>
        <motion.div variants={rise}><Stat label="Platform mix, top 10" value={<span className="text-base">{mix.map(([p, n]) => `${p} ${n}`).join(' · ') || '—'}</span>} icon={<Users size={15} />} /></motion.div>
        <motion.div variants={rise}><Stat label="Estimated views, top 3" value={<CountUp value={data.estimate.estimated_views_top3} />} sub={<Badge tone="warn">Estimate, not a forecast</Badge>} icon={<Eye size={15} />} /></motion.div>
      </motion.div>
      <p className="text-xs text-muted">Estimate assumptions: {data.estimate.assumptions}</p>

      <div className="grid gap-5 lg:grid-cols-2">
        <Reveal><ChartFrame title="Matching funnel" subtitle="How many creators survive each deterministic stage." table={funnelTable(data.funnel)}><FunnelChart data={data.funnel} /></ChartFrame></Reveal>
        <Reveal delay={0.06}><ChartFrame title="Audience age alignment" subtitle="Does the shortlist reach the ages this product targets? Bold rows are target segments." legend={alignmentLegend} table={alignmentTable(data.demographics)}><AlignmentChart data={data.demographics} /></ChartFrame></Reveal>
      </div>
      <Reveal>
        <ChartFrame title="Score breakdown, top 10" subtitle="Weighted points each criterion adds to the overall score. Sort any column; select a creator to open the profile."
          legend={breakdownLegend} defaultView="table" tableView={<BreakdownTable data={data.breakdown} onSelect={open} />}>
          <BreakdownChart data={data.breakdown} onSelect={open} />
        </ChartFrame>
      </Reveal>
      <Reveal>
        <ChartFrame title="Audience fit vs promotional performance" subtitle="Strong audience match and proven promotional views together are best. Filter by position, sort any column, or switch to the chart."
          legend={scatterLegend} defaultView="table" tableView={<ScatterTable data={data.scatter} onSelect={open} />}>
          <ScatterChart data={data.scatter} onSelect={open} />
        </ChartFrame>
      </Reveal>
      <Reveal>
        <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-1 text-base font-semibold">Why creators were excluded</h2>
          <p className="mb-3 text-sm text-muted">Python reason codes from Level 1 and Level 2, most common first.</p>
          {!Object.keys(s.exclusion_reasons).length ? <p className="text-sm text-muted">Nothing was excluded.</p> : (
            <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(s.exclusion_reasons).sort((a, b) => b[1] - a[1]).map(([c, n], i, all) => (
                <li key={c} className="min-w-0 text-sm">
                  <div className="flex items-baseline justify-between gap-2"><span className="truncate font-mono text-xs" title={c}>{c}</span><span className="tabular font-semibold">{fmt.n(n)}</span></div>
                  <span className="mt-1 block h-2 overflow-hidden rounded-full bg-ice"><motion.span initial={{ width: 0 }} animate={{ width: `${(n / all[0][1]) * 100}%` }} transition={{ duration: 0.6, delay: i * 0.04 }} className="block h-full rounded-full bg-brand" /></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Reveal>
    </div>
  )
}
