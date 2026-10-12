import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { CRITERIA_LABELS, fmt, type Exclusion, type Influencer, type Match, type Weights } from '../api'
import { useApi } from '../shared/hooks'
import { Badge, Card, ErrorState, Skeleton } from '../shared/ui'

interface Detail { influencer: Influencer; match: Match | null; exclusion: Exclusion | null; target_age_segments: string[]; weights: Weights }

function Dist({ title, data, highlight = [] }: { title: string; data: Record<string, number>; highlight?: string[] }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="space-y-1.5">{entries.map(([k, v]) => (
        <li key={k} className="grid grid-cols-[88px_1fr_44px] items-center gap-2 text-xs">
          <span className={highlight.includes(k) ? 'font-bold' : 'text-muted'}>{k}</span>
          <div className="h-2 rounded-full bg-line" role="img" aria-label={`${k}: ${v}%`}><div className={`h-full rounded-full ${highlight.includes(k) ? 'bg-brand' : 'bg-[#b8c6cd]'}`} style={{ width: `${Math.min(100, v)}%` }} /></div>
          <span className="text-right">{v.toFixed(0)}%</span>
        </li>))}</ul>
    </div>
  )
}

export default function Profile() {
  const { campaignId = '', influencerId = '' } = useParams()
  const { data, error, reload } = useApi<Detail>(`/campaigns/${campaignId}/results/${influencerId}`)
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <Skeleton className="h-96" />
  const { influencer: i, match: m, exclusion: ex } = data
  const w = data.weights
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1
  return (
    <div className="space-y-5">
      <Link to={`/admin/campaigns/${campaignId}`} className="inline-flex items-center gap-1 text-sm font-medium text-[#066a87]"><ArrowLeft size={15} aria-hidden="true" />Back to results</Link>
      <Card className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <h2 className="text-2xl font-bold">{i.display_name}</h2>
          <p className="text-sm text-muted">{i.username} · {i.platform ?? 'Platform unknown'} · {i.creator_content_style}</p>
          <p className="mt-1 max-w-xl text-sm">{i.bio}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m?.is_micro && <Badge tone="brand">Micro-influencer</Badge>}
            <Badge tone={i.brand_safety_status === 'clear' ? 'ok' : 'warn'}>Brand safety: {i.brand_safety_status}</Badge>
            <Badge tone={i.data_quality_status === 'verified' ? 'ok' : 'warn'}>Data: {i.data_quality_status}</Badge>
            {m && <Badge tone={m.data_confidence === 'high' ? 'ok' : m.data_confidence === 'medium' ? 'warn' : 'bad'}>{m.data_confidence} confidence</Badge>}
          </div>
        </div>
        {m ? <div className="text-right"><p className="text-xs text-muted">Overall match score</p><p className="text-4xl font-bold">{m.overall_score.toFixed(0)}<span className="text-lg text-muted">/100</span></p><p className="text-sm font-semibold">Rank #{m.rank}</p></div>
          : <Badge tone="bad">{ex?.status === 'needs_review' ? 'Needs review' : 'Not ranked'}</Badge>}
      </Card>

      {ex && (
        <Card className="border-amber-200 bg-amber-50 p-5"><h3 className="font-semibold">Why this creator was {ex.status === 'needs_review' ? 'flagged for review' : 'excluded'} (Level {ex.level})</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">{ex.reasons.map(r => <li key={r}>{r}</li>)}</ul><p className="mt-1 text-xs text-muted">Codes: {ex.reason_codes.join(', ')}</p></Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {([['Followers', fmt.n(i.follower_count)], ['Median promo views', fmt.n(i.median_promotional_views)], ['Median recent views', fmt.n(i.median_recent_views)], ['Engagement rate', fmt.pct(i.engagement_rate)]] as const).map(([l, v]) => (
          <Card key={l} className="p-4"><p className="text-xs text-muted">{l}</p><p className="text-xl font-bold">{v}</p></Card>))}
      </div>

      {m && (
        <Card className="p-5">
          <h3 className="mb-1 text-lg font-semibold">Why this rank</h3>
          <p className="mb-3 text-sm text-muted">{m.insight ?? m.rationale}</p>
          <div className="overflow-x-auto"><table className="dense w-full"><thead><tr><th scope="col">Criterion</th><th scope="col">Sub-score</th><th scope="col">Weight</th><th scope="col">Points</th></tr></thead>
            <tbody>{Object.keys(CRITERIA_LABELS).map(k => (
              <tr key={k}><th scope="row" className="font-medium">{CRITERIA_LABELS[k]}</th>
                <td><div className="flex items-center gap-2"><div className="h-1.5 w-24 rounded-full bg-line"><div className="h-full rounded-full bg-brand" style={{ width: `${m.scores[k]}%` }} /></div>{m.scores[k].toFixed(0)}</div></td>
                <td>{((w[k as keyof Weights] / total) * 100).toFixed(0)}%</td><td className="font-semibold">+{m.contributions[k].toFixed(1)}</td></tr>))}
              <tr><th scope="row">Total</th><td /><td>100%</td><td className="font-bold">{m.overall_score.toFixed(1)}</td></tr></tbody></table></div>
          <h4 className="mb-1 mt-4 text-sm font-semibold">Matching criteria</h4>
          <ul className="space-y-1 text-sm">{m.criteria.map(c => (
            <li key={c.name} className="flex flex-wrap items-center gap-2"><Badge tone={c.status === 'satisfied' ? 'ok' : c.status === 'partial' ? 'warn' : 'bad'}>{c.status.replace('_', ' ')}</Badge><b>{c.name}</b><span className="text-muted">{c.detail}</span></li>))}</ul>
          {m.concerns.length > 0 && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm"><b>Potential concerns</b><ul className="list-disc pl-5">{m.concerns.map(c => <li key={c}>{c}</li>)}</ul></div>}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5"><Dist title="Audience age (target highlighted)" data={i.audience_age_distribution} highlight={data.target_age_segments} /></Card>
        <Card className="p-5"><Dist title="Audience gender" data={i.audience_gender_distribution} /></Card>
        <Card className="p-5"><Dist title="Audience location" data={i.audience_location_distribution} /></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5"><h3 className="mb-2 text-sm font-semibold">Content & interests</h3>
          <div className="flex flex-wrap gap-1.5">{[...i.content_tags, ...i.interests, ...i.fashion_categories].map((t, idx) => <Badge key={`${t}${idx}`}>{t}</Badge>)}</div>
          <p className="mt-3 text-xs text-muted">Brand affinity score: <b className="text-ink">{i.brand_affinity_score ?? 'n/a'}</b> (synthetic)</p></Card>
        <Card className="p-5"><h3 className="mb-2 text-sm font-semibold">Previous collaborations</h3>
          {!i.collaboration_history.length ? <p className="text-sm text-muted">No collaboration history recorded.</p> : (
            <ul className="space-y-1 text-sm">{i.collaboration_history.map(c => <li key={c.collaboration_id} className="flex flex-wrap items-center gap-2"><Badge tone={c.campaign_outcome === 'strong' ? 'ok' : c.campaign_outcome === 'weak' ? 'bad' : 'neutral'}>{c.campaign_outcome}</Badge>{c.product_id} · {c.campaign_type} · {fmt.n(c.promotional_views)} views <span className="text-xs text-muted">{c.recorded_at}</span></li>)}</ul>)}
          <p className="mt-2 text-xs text-muted">Simulated demonstration metrics.</p></Card>
      </div>
    </div>
  )
}
