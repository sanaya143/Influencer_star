import { useNavigate } from 'react-router-dom'
import { fmt, type Analytics as A } from '../api'
import { useApi } from '../shared/hooks'
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '../shared/ui'
import { BreakdownChart, DemographicChart, FunnelChart, ScatterChart } from '../charts/charts'
import { useCampaign } from './CampaignLayout'

export default function Analytics() {
  const { campaignId, runId, done, trace } = useCampaign()
  const nav = useNavigate()
  const { data, error, reload } = useApi<A>(done && trace?.status !== 'Failed' ? `/campaigns/${campaignId}/analytics?run=${runId}` : null)
  if (!done) return <Skeleton className="h-80" />
  if (trace?.status === 'Failed') return <ErrorState message="The run failed, so there are no analytics to show." />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <Skeleton className="h-80" />
  const open = (id: string) => nav(`/admin/campaigns/${campaignId}/influencer/${id}`)
  const s = data.summary
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-muted">Avg score, top 10</p><p className="text-2xl font-bold">{s.avg_score_top10}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Micro-influencers in top 10</p><p className="text-2xl font-bold">{s.micro_in_top10}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Platform mix, top 10</p><p className="text-sm font-semibold">{Object.entries(s.platform_mix_top10).map(([p, n]) => `${p} ${n}`).join(' · ') || '—'}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">Estimated views, top 3 <Badge tone="warn">Estimate</Badge></p><p className="text-2xl font-bold">{fmt.n(data.estimate.estimated_views_top3)}</p></Card>
      </div>
      <p className="text-xs text-muted">Estimate assumptions: {data.estimate.assumptions}</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5"><h2 className="mb-2 text-lg font-semibold">Matching funnel</h2><FunnelChart data={data.funnel} /></Card>
        <Card className="p-5"><h2 className="mb-2 text-lg font-semibold">Audience age alignment</h2><DemographicChart data={data.demographics} /></Card>
      </div>
      <Card className="p-5"><h2 className="mb-1 text-lg font-semibold">Score breakdown, top 10</h2><p className="mb-3 text-sm text-muted">Weighted points each criterion adds to the overall score. Select a bar to open the profile.</p><BreakdownChart data={data.breakdown} onSelect={open} /></Card>
      <Card className="p-5"><h2 className="mb-1 text-lg font-semibold">Audience fit vs promotional performance</h2><p className="mb-3 text-sm text-muted">High and to the right is best. Large bubbles are not automatically better.</p><ScatterChart data={data.scatter} onSelect={open} /></Card>
      <Card className="p-5"><h2 className="mb-2 text-lg font-semibold">Exclusion reasons</h2>
        {!Object.keys(s.exclusion_reasons).length ? <EmptyState title="Nothing was excluded" /> : <div className="flex flex-wrap gap-2">{Object.entries(s.exclusion_reasons).sort((a, b) => b[1] - a[1]).map(([c, n]) => <Badge key={c}>{c} · {n}</Badge>)}</div>}</Card>
    </div>
  )
}
