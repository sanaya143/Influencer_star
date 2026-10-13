import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { CRITERIA_LABELS, fmt, type CreatorEconomics, type Exclusion, type Influencer, type Match, type Weights } from '../api'
import { useApi } from '../shared/hooks'
import { Avatar, Badge, Card, ErrorState, Skeleton } from '../shared/ui'

interface Detail { influencer: Influencer; match: Match | null; exclusion: Exclusion | null; target_age_segments: string[]; weights: Weights; economics: CreatorEconomics | null }
const DELIVERABLE: Record<string, string> = { post: 'Feed post', story: 'Story', short_video: 'Short video', long_video: 'YouTube video' }
const FLAG_TONE = { 'good value': 'ok', fair: 'neutral', 'above market': 'warn' } as const

function Dist({ title, data, highlight = [] }: { title: string; data: Record<string, number>; highlight?: string[] }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="space-y-1.5">{entries.map(([k, v]) => (
        <li key={k} className="grid grid-cols-[88px_1fr_44px] items-center gap-2 text-xs">
          <span className={highlight.includes(k) ? 'font-bold' : 'text-muted'}>{k}</span>
          <div className="h-2 rounded-full bg-line" role="img" aria-label={`${k}: ${v}%`}><div className={`h-full rounded-full ${highlight.includes(k) ? 'bg-brand' : 'bg-muted/40'}`} style={{ width: `${Math.min(100, v)}%` }} /></div>
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
      <Link to={`/admin/campaigns/${campaignId}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink"><ArrowLeft size={15} aria-hidden="true" />Back to results</Link>
      <Card className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <div className="flex items-center gap-3"><Avatar name={i.display_name} size={52} /><h2 className="text-2xl font-bold">{i.display_name}</h2></div>
          <p className="text-sm text-muted">{i.username} · {i.platform ?? 'Platform unknown'} · {i.creator_content_style}</p>
          <p className="mt-1 max-w-xl text-sm">{i.bio}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m?.is_micro && <Badge tone="brand">Micro-influencer</Badge>}
            <Badge tone={i.brand_safety_status === 'clear' ? 'ok' : 'warn'}>Brand safety: {i.brand_safety_status}</Badge>
            <Badge tone={i.data_quality_status === 'verified' ? 'ok' : 'warn'}>Data: {i.data_quality_status}</Badge>
            {m && <Badge tone={m.data_confidence === 'high' ? 'ok' : m.data_confidence === 'medium' ? 'warn' : 'bad'}>{m.data_confidence} confidence</Badge>}
            {i.source && i.source !== 'zylo' && <Badge tone="brand">From {i.source}</Badge>}
          </div>
        </div>
        {m ? <div className="text-right"><p className="text-xs text-muted">Overall match score</p><p className="text-4xl font-bold">{m.overall_score.toFixed(0)}<span className="text-lg text-muted">/100</span></p><p className="text-sm font-semibold">Rank #{m.rank}</p></div>
          : <Badge tone="bad">{ex?.status === 'needs_review' ? 'Needs review' : 'Not ranked'}</Badge>}
      </Card>

      {ex && (
        <Card className="border-amber-200 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-400/10 p-5"><h3 className="font-semibold">Why this creator was {ex.status === 'needs_review' ? 'flagged for review' : 'excluded'} (Level {ex.level})</h3>
          <ul className="mt-1 list-disc pl-5 text-sm">{ex.reasons.map(r => <li key={r}>{r}</li>)}</ul><p className="mt-1 text-xs text-muted">Codes: {ex.reason_codes.join(', ')}</p></Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {([['Followers', fmt.n(i.follower_count)], ['Median promo views', fmt.n(i.median_promotional_views)], ['Median recent views', fmt.n(i.median_recent_views)], ['Engagement rate', fmt.pct(i.engagement_rate)]] as const).map(([l, v]) => (
          <Card key={l} className="p-4"><p className="text-xs text-muted">{l}</p><p className="text-xl font-bold">{v}</p></Card>))}
      </div>

      {data.economics && (() => {
        const e = data.economics
        return (
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-lg font-semibold">What they charge, and what it buys</h3>
                <p className="text-sm text-muted">Asking price compared with creators of the same size and platform for the same number of views. Estimates from synthetic data.</p></div>
              {e.value_flag ? <Badge tone={FLAG_TONE[e.value_flag]}>{e.value_flag}</Badge> : <Badge>{e.fee_estimated ? 'no rate card: market rate used' : 'no benchmark'}</Badge>}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-ice p-3"><p className="text-xs text-muted">Asks per {e.deliverable ? (DELIVERABLE[e.deliverable] ?? e.deliverable).toLowerCase() : 'post'}</p><p className="text-xl font-bold">{fmt.money(e.fee_gbp)}</p>{e.fee_estimated && <p className="text-[11px] text-muted">estimated</p>}</div>
              <div className="rounded-xl bg-ice p-3"><p className="text-xs text-muted">Market rate for {fmt.n(e.views)} views</p><p className="text-xl font-bold">{e.fair_fee_gbp != null ? fmt.money(e.fair_fee_gbp) : '—'}</p>{e.suggested_offer_gbp != null && e.suggested_offer_gbp < e.fee_gbp && <p className="text-[11px] text-muted">suggested offer {fmt.money(e.suggested_offer_gbp)}</p>}</div>
              <div className="rounded-xl bg-ice p-3"><p className="text-xs text-muted">Cost per 1,000 views</p><p className="text-xl font-bold">£{e.cpm_gbp.toFixed(2)}</p><p className="text-[11px] text-muted">{e.cost_per_1k_relevant_gbp != null ? `£${e.cost_per_1k_relevant_gbp.toFixed(2)} per 1k target-audience views` : ''}</p></div>
              <div className="rounded-xl bg-ice p-3"><p className="text-xs text-muted">Expected from one post</p><p className="text-xl font-bold">{e.expected_orders.toFixed(1)} orders</p><p className="text-[11px] text-muted">{fmt.money(e.expected_revenue_gbp)} revenue · ROAS £{e.roas.toFixed(2)}</p></div>
            </div>
            {Object.keys(e.rate_card).length > 0 && (
              <p className="mt-3 flex flex-wrap gap-1.5 text-xs"><span className="text-muted">Rate card:</span>{Object.entries(e.rate_card).map(([k, v]) => <span key={k} className="rounded-full bg-ice px-2 py-0.5">{DELIVERABLE[k] ?? k} {fmt.money(v)}</span>)}</p>
            )}
          </Card>
        )
      })()}

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
          {m.concerns.length > 0 && <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-400/10 p-3 text-sm"><b>Potential concerns</b><ul className="list-disc pl-5">{m.concerns.map(c => <li key={c}>{c}</li>)}</ul></div>}
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
          {!!i.content_themes?.length && <>
            <h4 className="mb-1.5 mt-3 text-xs font-semibold text-muted">Posts about</h4>
            <div className="flex flex-wrap gap-1.5">{i.content_themes.map(t => <span key={t} className={`rounded-full px-2 py-0.5 text-xs ${m?.matched_themes?.includes(t) ? 'bg-brand text-on-brand' : 'bg-ice'}`}>#{t}</span>)}</div>
            {!!m?.matched_themes?.length && <p className="mt-1 text-[11px] text-muted">Highlighted: themes this campaign's collection asks for.</p>}
          </>}
          <p className="mt-3 text-xs text-muted">Brand affinity score: <b className="text-ink">{i.brand_affinity_score ?? 'n/a'}</b> (synthetic)</p></Card>
        <Card className="p-5"><h3 className="mb-2 text-sm font-semibold">Previous collaborations</h3>
          {!i.collaboration_history.length ? <p className="text-sm text-muted">No collaboration history recorded.</p> : (
            <ul className="space-y-1 text-sm">{i.collaboration_history.map(c => <li key={c.collaboration_id} className="flex flex-wrap items-center gap-2"><Badge tone={c.campaign_outcome === 'strong' ? 'ok' : c.campaign_outcome === 'weak' ? 'bad' : 'neutral'}>{c.campaign_outcome}</Badge>{c.product_id} · {c.campaign_type} · {fmt.n(c.promotional_views)} views <span className="text-xs text-muted">{c.recorded_at}</span></li>)}</ul>)}
          <p className="mt-2 text-xs text-muted">Simulated demonstration metrics.</p></Card>
      </div>
    </div>
  )
}
