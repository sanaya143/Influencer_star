import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GitCompare, RefreshCw } from 'lucide-react'
import { CRITERIA_LABELS, fmt, type Exclusion, type Filters, type Match, type Paged, type Results as ResultsT, type Weights } from '../api'
import { useApi } from '../shared/hooks'
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '../shared/ui'
import { useCampaign } from './CampaignLayout'
import { FunnelChart } from '../charts/charts'

type Sort = 'overall_score' | 'audience_fit' | 'promo_views' | 'engagement'
const CONF = { high: 'ok', medium: 'warn', low: 'bad' } as const

export default function Results() {
  const { campaignId, runId, done, trace, rerun, rerunning } = useCampaign()
  const nav = useNavigate()
  const [sort, setSort] = useState<Sort>('overall_score')
  const [microOnly, setMicroOnly] = useState(false)
  const [platform, setPlatform] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)
  const [tab, setTab] = useState<'ranked' | 'excluded'>('ranked')
  const qs = `sort=${sort}${microOnly ? '&micro_only=true' : ''}${platform ? `&platform=${platform}` : ''}`
  const res = useApi<ResultsT>(done && trace?.status !== 'Failed' ? `/campaigns/${campaignId}/results?${qs}&run=${runId}` : null)

  if (!done) return <RunningState />
  if (trace?.status === 'Failed') return <ErrorState message={`Run failed: ${trace.summary ?? 'unknown error'}. See the Agent execution tab for details.`} />
  if (res.error) return <ErrorState message={res.error} onRetry={res.reload} />
  if (!res.data) return <Skeleton className="h-96" />
  const r = res.data
  const chosen = r.ranked.filter(m => picked.includes(m.influencer_id))
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= 3 ? p : [...p, id]))
  const funnel = [
    { stage: 'Retrieved', count: r.stats.retrieved, pct: 100 },
    { stage: 'Passed Level 1', count: r.stats.eligible, pct: +(r.stats.eligible / (r.stats.retrieved || 1) * 100).toFixed(1) },
    { stage: 'Passed Level 2', count: r.stats.passed_l2, pct: +(r.stats.passed_l2 / (r.stats.retrieved || 1) * 100).toFixed(1) },
    { stage: 'Ranked', count: r.stats.ranked, pct: +(r.stats.ranked / (r.stats.retrieved || 1) * 100).toFixed(1) },
  ]
  return (
    <div className="space-y-5">
      {trace?.status === 'Needs Review' && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">Some steps need review: {trace.agents.filter(a => a.status === 'Needs Review').map(a => a.output_summary).join(' ')}</div>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">Recommendation</h2>
          {r.insights ? (
            <div className="mt-2 space-y-2 text-sm">
              <p>{r.insights.summary}</p>
              <p className="font-medium">{r.insights.recommendation}</p>
              {r.insights.trade_offs.length > 0 && <ul className="list-disc pl-5 text-muted">{r.insights.trade_offs.map(t => <li key={t}>{t}</li>)}</ul>}
              {r.insights.micro_highlights.length > 0 && <p><Badge tone="brand">Micro-influencers</Badge> <span className="text-muted">{r.insights.micro_highlights.join('; ')}</span></p>}
              <details className="text-muted"><summary className="cursor-pointer font-medium text-ink">Suggested next steps</summary><ul className="mt-1 list-disc pl-5">{r.insights.next_steps.map(t => <li key={t}>{t}</li>)}</ul></details>
              <p className="text-xs text-muted">{r.insights.fallback ? 'Template insights (LLM unavailable). ' : ''}{r.label} Any projected reach is an estimate, not a guarantee.</p>
            </div>
          ) : <p className="text-sm text-muted">No insights available.</p>}
        </Card>
        <Card className="p-5"><h2 className="mb-2 text-lg font-semibold">Matching funnel</h2><FunnelChart data={funnel} /></Card>
      </div>

      <Controls filters={r.stats.thresholds} weights={r.brief.weights} busy={rerunning} onApply={(f, w) => rerun(f, w)} />
      {r.stats.warnings.length > 0 && <ul className="space-y-1 text-xs text-muted">{r.stats.warnings.map(w => <li key={w}>⚠ {w}</li>)}</ul>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Result view" className="inline-flex rounded-xl border border-line bg-white p-1 text-sm">
          {(['ranked', 'excluded'] as const).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 font-medium ${tab === t ? 'bg-brand text-ink' : 'text-muted'}`}>
              {t === 'ranked' ? `Ranked (${r.stats.ranked})` : `Excluded / review (${r.stats.excluded_l1 + r.stats.excluded_l2 + r.stats.review_required})`}
            </button>
          ))}
        </div>
        {tab === 'ranked' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5">Sort
              <select value={sort} onChange={e => setSort(e.target.value as Sort)} className="rounded-lg border border-line bg-white px-2 py-1.5">
                <option value="overall_score">Overall score</option><option value="audience_fit">Audience fit</option><option value="promo_views">Promotional views</option><option value="engagement">Engagement rate</option>
              </select></label>
            <label className="flex items-center gap-1.5">Platform
              <select value={platform} onChange={e => setPlatform(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1.5">
                <option value="">All</option><option>Instagram</option><option>TikTok</option><option>YouTube</option>
              </select></label>
            <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[#01ABDD]" checked={microOnly} onChange={e => setMicroOnly(e.target.checked)} />Micro only</label>
            <Button size="sm" variant="outline" disabled={picked.length < 2} onClick={() => setShowCompare(true)}><GitCompare size={15} aria-hidden="true" />Compare ({picked.length})</Button>
          </div>
        )}
      </div>

      {tab === 'ranked' ? (
        r.ranked.length === 0 ? (
          <EmptyState title="No influencers match these criteria" hint="Try lowering the follower or promotional-view thresholds, clearing the filters above, or widening the target age segments." />
        ) : (
          <Card className="overflow-x-auto">
            <table className="dense w-full min-w-[920px]">
              <caption className="sr-only">Ranked influencer recommendations</caption>
              <thead><tr><th scope="col"><span className="sr-only">Compare</span></th><th scope="col">Rank</th><th scope="col">Creator</th><th scope="col">Followers</th><th scope="col">Promo views</th><th scope="col">Engagement</th><th scope="col">Audience fit</th><th scope="col">Overall</th><th scope="col">Why</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {r.ranked.map(m => (
                  <tr key={m.influencer_id} className="hover:bg-ice">
                    <td><input type="checkbox" aria-label={`Compare ${m.display_name}`} className="accent-[#01ABDD]" checked={picked.includes(m.influencer_id)} onChange={() => toggle(m.influencer_id)} disabled={!picked.includes(m.influencer_id) && picked.length >= 3} /></td>
                    <td className="font-bold">{m.rank}</td>
                    <td><Link to={`/admin/campaigns/${campaignId}/influencer/${m.influencer_id}`} className="font-semibold hover:text-[#066a87]">{m.display_name}</Link>
                      <div className="text-xs text-muted">{m.username} · {m.platform}</div>
                      <div className="mt-0.5 flex gap-1">{m.is_micro && <Badge tone="brand">Micro</Badge>}<Badge tone={CONF[m.data_confidence]}>{m.data_confidence} confidence</Badge></div></td>
                    <td>{fmt.n(m.follower_count)}</td><td>{fmt.n(m.median_promotional_views)}</td><td>{fmt.pct(m.engagement_rate)}</td>
                    <td><Bar v={m.scores.audience_fit} /></td><td><Bar v={m.overall_score} strong /></td>
                    <td className="max-w-xs text-xs text-muted">{m.insight ?? m.rationale}{m.concerns[0] && <div className="mt-1 text-amber-800">⚠ {m.concerns[0]}</div>}</td>
                    <td><Button size="sm" variant="outline" onClick={() => nav(`/admin/campaigns/${campaignId}/influencer/${m.influencer_id}`)}>Profile</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : <Excluded campaignId={campaignId} runId={runId} />}
      {showCompare && <Compare items={chosen} onClose={() => setShowCompare(false)} />}
    </div>
  )
}

function RunningState() {
  const { trace } = useCampaign()
  return (
    <Card className="space-y-3 p-6" >
      <div role="status" aria-live="polite" className="text-sm"><b>Workflow running…</b> Results appear as soon as the agents finish.</div>
      <ul className="space-y-1 text-sm">{trace?.agents.map(a => <li key={a.id} className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${a.status === 'Completed' ? 'bg-emerald-500' : a.status === 'Running' ? 'animate-pulse bg-brand' : 'bg-line'}`} />{a.name} — <span className="text-muted">{a.status}</span></li>)}</ul>
      <Skeleton className="h-32" />
    </Card>
  )
}

const Bar = ({ v, strong = false }: { v: number; strong?: boolean }) => (
  <div className="flex items-center gap-2" aria-label={`${v.toFixed(0)} out of 100`}>
    <div className="h-1.5 w-16 rounded-full bg-line"><div className={`h-full rounded-full ${strong ? 'bg-brand' : 'bg-[#8fdcf1]'}`} style={{ width: `${Math.min(100, v)}%` }} /></div>
    <span className={strong ? 'font-bold' : ''}>{v.toFixed(0)}</span>
  </div>
)

function Controls({ filters, weights, busy, onApply }: { filters: Filters; weights: Weights; busy: boolean; onApply: (f: Filters, w: Weights) => void }) {
  const [f, setF] = useState(filters)
  const [w, setW] = useState(weights)
  const dirty = JSON.stringify(f) !== JSON.stringify(filters) || JSON.stringify(w) !== JSON.stringify(weights)
  const num = (label: string, k: keyof Filters, max?: number) => (
    <label className="text-sm"><span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <input type="number" min={0} max={max} value={f[k] as number} onChange={e => setF({ ...f, [k]: Number(e.target.value) })} className="w-32 rounded-lg border border-line bg-white px-2 py-1.5" /></label>
  )
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end gap-4">
        {num('Min followers', 'min_followers')}{num('Min promo views', 'min_promo_views')}{num('Min audience match', 'min_audience_match', 100)}
        <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" className="accent-[#01ABDD]" checked={f.require_brand_safety} onChange={e => setF({ ...f, require_brand_safety: e.target.checked })} />Enforce brand safety</label>
        <Button onClick={() => onApply(f, w)} disabled={busy || !dirty}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} aria-hidden="true" />Re-run matching</Button>
      </div>
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Ranking weights</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(w) as (keyof Weights)[]).map(k => (
            <label key={k} className="text-xs"><span className="mb-1 block">{CRITERIA_LABELS[k]} <b>{w[k]}</b></span>
              <input type="range" min={0} max={50} value={w[k]} className="w-full accent-[#01ABDD]" onChange={e => setW({ ...w, [k]: Number(e.target.value) })} /></label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">Filtering and ranking are recalculated by the Python backend on every re-run.</p>
      </details>
    </Card>
  )
}

function Excluded({ campaignId, runId }: { campaignId: string; runId: string | null }) {
  const [status, setStatus] = useState('')
  const [level, setLevel] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const query = useMemo(() => `page=${page}&page_size=15${status ? `&status=${status}` : ''}${level ? `&level=${level}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}&run=${runId}`, [page, status, level, q, runId])
  const { data, error, loading } = useApi<Paged<Exclusion> & { reason_counts: Record<string, number> }>(`/campaigns/${campaignId}/excluded?${query}`)
  if (error) return <ErrorState message={error} />
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input aria-label="Search excluded creators" placeholder="Search name or handle" value={q} onChange={e => { setQ(e.target.value); setPage(1) }} className="rounded-lg border border-line bg-white px-3 py-1.5" />
        <select aria-label="Status" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className="rounded-lg border border-line bg-white px-2 py-1.5"><option value="">All statuses</option><option value="excluded">Excluded</option><option value="needs_review">Needs review</option></select>
        <select aria-label="Level" value={level} onChange={e => { setLevel(e.target.value); setPage(1) }} className="rounded-lg border border-line bg-white px-2 py-1.5"><option value="">Both levels</option><option value="1">Level 1</option><option value="2">Level 2</option></select>
        {data && Object.entries(data.reason_counts).slice(0, 6).map(([c, n]) => <Badge key={c}>{c} · {n}</Badge>)}
      </div>
      {loading && !data ? <Skeleton className="h-64" /> : !data?.items.length ? <EmptyState title="No excluded creators for this filter" /> : (
        <Card className="overflow-x-auto">
          <table className="dense w-full min-w-[720px]">
            <caption className="sr-only">Excluded influencers and Python-generated reasons</caption>
            <thead><tr><th scope="col">Creator</th><th scope="col">Level</th><th scope="col">Status</th><th scope="col">Reason codes</th><th scope="col">Explanation</th></tr></thead>
            <tbody>{data.items.map(e => (
              <tr key={e.influencer_id}><td><span className="font-semibold">{e.display_name}</span><div className="text-xs text-muted">{e.username}</div></td><td>L{e.level}</td>
                <td><Badge tone={e.status === 'needs_review' ? 'warn' : 'bad'}>{e.status === 'needs_review' ? 'Needs review' : 'Excluded'}</Badge></td>
                <td className="text-xs">{e.reason_codes.join(', ')}</td><td className="text-xs text-muted">{e.reasons.join(' ')}</td></tr>))}</tbody>
          </table>
        </Card>
      )}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span>Page {page} of {data.pages}</span><Button size="sm" variant="outline" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>Next</Button></div>
      )}
    </div>
  )
}

function Compare({ items, onClose }: { items: Match[]; onClose: () => void }) {
  const rows: [string, (m: Match) => string, ((m: Match) => number)?][] = [
    ['Overall score', m => m.overall_score.toFixed(1), m => m.overall_score], ['Platform', m => m.platform], ['Followers', m => fmt.n(m.follower_count), m => m.follower_count],
    ['Median promo views', m => fmt.n(m.median_promotional_views), m => m.median_promotional_views], ['Engagement rate', m => fmt.pct(m.engagement_rate), m => m.engagement_rate],
    ['Audience in target segments', m => fmt.pct(m.audience_fit_pct), m => m.audience_fit_pct], ['Data confidence', m => m.data_confidence],
    ...Object.keys(CRITERIA_LABELS).map(k => [CRITERIA_LABELS[k], (m: Match) => m.scores[k].toFixed(0), (m: Match) => m.scores[k]] as [string, (m: Match) => string, (m: Match) => number]),
  ]
  return (
    <div role="dialog" aria-modal="true" aria-label="Compare influencers" className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Compare creators</h2><Button size="sm" variant="outline" onClick={onClose} autoFocus>Close</Button></div>
        <table className="dense w-full"><thead><tr><th scope="col">Metric</th>{items.map(m => <th key={m.influencer_id} scope="col">#{m.rank} {m.display_name}</th>)}</tr></thead>
          <tbody>{rows.map(([label, f, n]) => { const best = n ? Math.max(...items.map(n)) : null
            return <tr key={label}><th scope="row" className="font-medium">{label}</th>{items.map(m => <td key={m.influencer_id} className={n && n(m) === best ? 'font-bold text-[#066a87]' : ''}>{f(m)}</td>)}</tr> })}</tbody></table>
        <p className="mt-2 text-xs text-muted">Best value in each row is highlighted. Scores are 0–100 sub-scores before weighting.</p>
      </div>
    </div>
  )
}
