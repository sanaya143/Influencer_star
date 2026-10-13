import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, GitCompare, Lightbulb, RefreshCw, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import { CRITERIA_LABELS, fmt, type Exclusion, type Filters, type Match, type Paged, type Results as ResultsT, type Weights } from '../api'
import { useApi } from '../shared/hooks'
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Modal, Segmented, Skeleton, inputCls, selectCls } from '../shared/ui'
import { Reveal } from '../shared/motion'
import { useCampaign } from './CampaignLayout'
import { LeaderBoard } from './Leaders'
import { FunnelChart } from '../charts/charts'

type Sort = 'overall_score' | 'audience_fit' | 'promo_views' | 'engagement'
const CONF = { high: 'ok', medium: 'warn', low: 'bad' } as const
const PAGE = 20

export default function Results() {
  const { campaignId, runId, done, trace, rerun, rerunning } = useCampaign()
  const nav = useNavigate()
  const [sort, setSort] = useState<Sort>('overall_score')
  const [microOnly, setMicroOnly] = useState(false)
  const [platform, setPlatform] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)
  const [tab, setTab] = useState<'ranked' | 'excluded'>('ranked')
  const [page, setPage] = useState(1)
  const qs = `sort=${sort}&limit=2000${microOnly ? '&micro_only=true' : ''}${platform ? `&platform=${platform}` : ''}`
  const res = useApi<ResultsT>(done && trace?.status !== 'Failed' ? `/campaigns/${campaignId}/results?${qs}&run=${runId}` : null)
  useEffect(() => setPage(1), [sort, microOnly, platform, runId])

  if (!done) return <RunningState />
  if (trace?.status === 'Failed') return <ErrorState message={`Run failed: ${trace.summary ?? 'unknown error'}. See the Agent execution tab for details.`} />
  if (res.error) return <ErrorState message={res.error} onRetry={res.reload} />
  if (!res.data) return <div className="space-y-4"><div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-44" />)}</div><Skeleton className="h-96" /></div>
  const r = res.data
  const chosen = r.ranked.filter(m => picked.includes(m.influencer_id))
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= 3 ? p : [...p, id]))
  const base = r.stats.retrieved || 1
  const funnel = [
    { stage: 'Evaluated', count: r.stats.retrieved, pct: 100 },
    { stage: 'Passed Level 1', count: r.stats.eligible, pct: +(r.stats.eligible / base * 100).toFixed(1) },
    { stage: 'Passed Level 2', count: r.stats.passed_l2, pct: +(r.stats.passed_l2 / base * 100).toFixed(1) },
    { stage: 'Ranked', count: r.stats.ranked, pct: +(r.stats.ranked / base * 100).toFixed(1) },
  ]
  const pages = Math.max(1, Math.ceil(r.ranked.length / PAGE))
  const rows = r.ranked.slice((page - 1) * PAGE, page * PAGE)
  const excludedTotal = r.stats.excluded_l1 + r.stats.excluded_l2 + r.stats.review_required
  return (
    <div className="space-y-6">
      {trace?.status === 'Needs Review' && <div role="status" className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-400/30 dark:bg-amber-400/10"><TriangleAlert size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" />Some steps need review: {trace.agents.filter(a => a.status === 'Needs Review').map(a => a.output_summary).join(' ')}</div>}

      {r.ranked.length > 0 && (
        <section aria-labelledby="top3-h">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div><h2 id="top3-h" className="text-lg font-semibold">Top 3 in each field</h2><p className="text-sm text-muted">Across all {fmt.n(r.stats.ranked)} ranked creators. Select a name for the full score breakdown.</p></div>
          </div>
          <LeaderBoard groups={r.leaders} campaignId={campaignId} />
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <Reveal className="lg:col-span-3">
          <Card className="h-full p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Lightbulb size={18} aria-hidden="true" className="text-brand-ink" />Recommendation</h2>
            {r.insights ? (
              <div className="mt-2 space-y-2.5 text-sm">
                <p>{r.insights.summary}</p>
                <p className="rounded-xl bg-brand/10 p-3 font-medium">{r.insights.recommendation}</p>
                {r.insights.trade_offs.length > 0 && <ul className="list-disc space-y-1 pl-5 text-muted">{r.insights.trade_offs.map(t => <li key={t}>{t}</li>)}</ul>}
                {r.insights.micro_highlights.length > 0 && <p><Badge tone="brand">Micro-influencers</Badge> <span className="text-muted">{r.insights.micro_highlights.join('; ')}</span></p>}
                <details className="group text-muted"><summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-ink"><ChevronDown size={15} aria-hidden="true" className="transition-transform group-open:rotate-180" />Suggested next steps</summary><ul className="mt-1 list-disc pl-5">{r.insights.next_steps.map(t => <li key={t}>{t}</li>)}</ul></details>
                <p className="text-xs text-muted">{r.insights.fallback ? 'Template insights (LLM unavailable). ' : ''}{r.label} Any projected reach is an estimate, not a guarantee.</p>
              </div>
            ) : <p className="text-sm text-muted">No insights available.</p>}
          </Card>
        </Reveal>
        <Reveal delay={0.06} className="lg:col-span-2">
          <Card className="h-full p-5"><h2 className="mb-1 text-lg font-semibold">Matching funnel</h2><FunnelChart data={funnel} compact /></Card>
        </Reveal>
      </div>

      <Controls filters={r.stats.thresholds} weights={r.brief.weights} busy={rerunning} onApply={(f, w) => rerun(f, w)} />
      {!!r.sources?.outside && <p className="text-xs text-muted">{fmt.n(r.sources.outside)} of the {fmt.n(r.stats.retrieved)} creators evaluated came from the outside data provider over MCP.</p>}
      {r.stats.warnings.length > 0 && <ul className="space-y-1 text-xs text-muted">{r.stats.warnings.map(w => <li key={w} className="flex items-center gap-1.5"><TriangleAlert size={13} aria-hidden="true" />{w}</li>)}</ul>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Result view" value={tab} onChange={setTab} options={[{ value: 'ranked', label: `Ranked (${fmt.n(r.stats.ranked)})` }, { value: 'excluded', label: `Excluded / review (${fmt.n(excludedTotal)})` }]} />
        {tab === 'ranked' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5">Sort
              <select value={sort} onChange={e => setSort(e.target.value as Sort)} className={selectCls}>
                <option value="overall_score">Overall score</option><option value="audience_fit">Audience fit</option><option value="promo_views">Promotional views</option><option value="engagement">Engagement rate</option>
              </select></label>
            <label className="flex items-center gap-1.5">Platform
              <select value={platform} onChange={e => setPlatform(e.target.value)} className={selectCls}><option value="">All</option><option>Instagram</option><option>TikTok</option><option>YouTube</option></select></label>
            <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[#01ABDD]" checked={microOnly} onChange={e => setMicroOnly(e.target.checked)} />Micro only</label>
            <Button size="sm" variant="outline" disabled={picked.length < 2} onClick={() => setShowCompare(true)}><GitCompare size={15} aria-hidden="true" />Compare ({picked.length})</Button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {tab === 'ranked' ? (
            r.ranked.length === 0 ? (
              <EmptyState title="No influencers match these criteria" hint="Try lowering the follower or promotional-view thresholds, clearing the filters above, or widening the target age segments." />
            ) : (
              <Card className="overflow-hidden">
                <div className="scrollbar-thin overflow-x-auto">
                  <table className="dense w-full min-w-[1100px] table-fixed">
                    <caption className="sr-only">Ranked influencer recommendations, page {page} of {pages}</caption>
                    {/* Fixed layout: every column gets a deliberate width and "Why" takes the rest, so long explanations
                        wrap inside their cell instead of stretching the table. */}
                    <colgroup><col className="w-10" /><col className="w-14" /><col className="w-[13.75rem]" /><col className="w-[5.75rem]" /><col className="w-[5.75rem]" /><col className="w-[5.5rem]" /><col className="w-[6.5rem]" /><col className="w-[6.5rem]" /><col /></colgroup>
                    <thead><tr><th scope="col"><span className="sr-only">Compare</span></th><th scope="col">Rank</th><th scope="col">Creator</th><th scope="col" className="num">Followers</th><th scope="col" className="num">Promo views</th><th scope="col" className="num">Engagement</th><th scope="col">Audience fit</th><th scope="col">Overall</th><th scope="col">Why</th></tr></thead>
                    <tbody>
                      {rows.map((m, i) => (
                        <motion.tr key={m.influencer_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 12) * 0.015 }}
                          className={`align-top transition-colors hover:bg-ice ${picked.includes(m.influencer_id) ? 'bg-brand/5' : ''}`}>
                          <td><input type="checkbox" aria-label={`Compare ${m.display_name}`} className="mt-1.5 accent-[#01ABDD]" checked={picked.includes(m.influencer_id)} onChange={() => toggle(m.influencer_id)} disabled={!picked.includes(m.influencer_id) && picked.length >= 3} /></td>
                          <td><span className={`tabular mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-bold ${m.rank <= 3 ? 'bg-brand text-on-brand' : 'bg-ice'}`}>{m.rank}</span></td>
                          <td>
                            <div className="flex min-w-0 items-start gap-2.5">
                              <Avatar name={m.display_name} size={32} />
                              <div className="min-w-0">
                                <Link to={`/admin/campaigns/${campaignId}/influencer/${m.influencer_id}`} className="block truncate font-semibold hover:text-brand-ink">{m.display_name}</Link>
                                <div className="truncate text-xs text-muted" title={`${m.username} · ${m.platform}`}>{m.username} · {m.platform}</div>
                                <div className="mt-1 flex flex-wrap gap-1">{m.is_micro && <Badge tone="brand">Micro</Badge>}<Badge tone={CONF[m.data_confidence]}>{m.data_confidence} confidence</Badge>
                                  {m.source && m.source !== 'zylo' && <Badge tone="neutral">via MCP</Badge>}</div>
                                {!!m.matched_themes?.length && <div className="mt-1 truncate text-[11px] text-muted" title={m.matched_themes.join(', ')}>#{m.matched_themes.slice(0, 3).join(' #')}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="num">{fmt.n(m.follower_count)}</td><td className="num">{fmt.n(m.median_promotional_views)}</td><td className="num">{fmt.pct(m.engagement_rate)}</td>
                          <td><Bar v={m.scores.audience_fit} /></td><td><Bar v={m.overall_score} strong /></td>
                          <td><WhyCell m={m} onOpen={() => nav(`/admin/campaigns/${campaignId}/influencer/${m.influencer_id}`)} /></td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager page={page} pages={pages} total={r.ranked.length} onPage={setPage} />
              </Card>
            )
          ) : <Excluded campaignId={campaignId} runId={runId} />}
        </motion.div>
      </AnimatePresence>
      <Modal open={showCompare} onClose={() => setShowCompare(false)} title="Compare creators" wide><Compare items={chosen} /></Modal>
    </div>
  )
}

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm">
      <span className="text-muted">{fmt.n((page - 1) * PAGE + 1)}–{fmt.n(Math.min(total, page * PAGE))} of {fmt.n(total)}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span className="tabular">Page {page} of {pages}</span>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  )
}

function RunningState() {
  const { trace } = useCampaign()
  return (
    <Card className="space-y-4 p-6">
      <div role="status" aria-live="polite" className="flex items-center gap-3 text-sm"><span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" /><span className="relative h-3 w-3 rounded-full bg-brand" /></span><b>Workflow running…</b> Results appear as soon as the agents finish.</div>
      <ol className="grid gap-2 sm:grid-cols-3">{trace?.agents.map((a, i) => (
        <motion.li key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className={`rounded-xl border p-3 text-sm ${a.status === 'Running' ? 'border-brand bg-brand/5' : 'border-line'}`}>
          <p className="font-medium">{a.name}</p><p className="text-xs text-muted">{a.status}</p>
        </motion.li>))}</ol>
      <Skeleton className="h-32" />
    </Card>
  )
}

/** The "Why" explanation: a three-line preview that expands in place, so nothing is cut off silently. */
export function WhyCell({ m, onOpen }: { m: Pick<Match, 'insight' | 'rationale' | 'concerns' | 'display_name'>; onOpen?: () => void }) {
  const [open, setOpen] = useState(false)
  const text = (m.insight ?? m.rationale ?? '').trim()
  const long = text.length > 150 || m.concerns.length > 1
  return (
    <div className="min-w-0 text-[13px] leading-5 text-muted">
      {text ? <p className={`break-words [overflow-wrap:anywhere] ${!open && long ? 'line-clamp-3' : ''}`}>{text}</p> : <p className="italic">No explanation recorded.</p>}
      {m.concerns.length > 0 && (
        <ul className="mt-1.5 space-y-1 text-amber-800 dark:text-amber-300">
          {(open ? m.concerns : m.concerns.slice(0, 1)).map(c => (
            <li key={c} className="flex gap-1.5 break-words [overflow-wrap:anywhere]"><TriangleAlert size={12} aria-hidden="true" className="mt-1 shrink-0" /><span><span className="sr-only">Concern: </span>{c}</span></li>
          ))}
        </ul>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {long && <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="font-semibold text-ink underline-offset-2 hover:underline">
          {open ? 'Show less' : `Show more${m.concerns.length > 1 ? ` (+${m.concerns.length - 1} concern${m.concerns.length > 2 ? 's' : ''})` : ''}`}<span className="sr-only"> about {m.display_name}</span></button>}
        {onOpen && <button type="button" onClick={onOpen} className="font-semibold text-brand-ink underline-offset-2 hover:underline">Score breakdown<span className="sr-only"> for {m.display_name}</span> →</button>}
      </div>
    </div>
  )
}

const Bar = ({ v, strong = false }: { v: number; strong?: boolean }) => (
  <div className="flex items-center gap-2" aria-label={`${v.toFixed(0)} out of 100`}>
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, v)}%` }} transition={{ duration: 0.6 }} className={`h-full rounded-full ${strong ? 'bg-brand' : 'bg-brand/50'}`} /></div>
    <span className={`tabular ${strong ? 'font-bold' : ''}`}>{v.toFixed(0)}</span>
  </div>
)

function Controls({ filters, weights, busy, onApply }: { filters: Filters; weights: Weights; busy: boolean; onApply: (f: Filters, w: Weights) => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState(filters)
  const [w, setW] = useState(weights)
  useEffect(() => { setF(filters); setW(weights) }, [filters, weights])
  const dirty = JSON.stringify(f) !== JSON.stringify(filters) || JSON.stringify(w) !== JSON.stringify(weights)
  const num = (label: string, k: keyof Filters, max?: number) => (
    <label className="text-sm"><span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <input type="number" min={0} max={max} value={f[k] as number} onChange={e => setF({ ...f, [k]: Number(e.target.value) })} className={`${inputCls} w-36`} /></label>
  )
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span className="flex items-center gap-2 font-semibold"><SlidersHorizontal size={17} aria-hidden="true" className="text-brand-ink" />Tune thresholds & weights
          <span className="hidden text-xs font-normal text-muted sm:inline">≥{fmt.n(filters.min_followers)} followers · ≥{fmt.n(filters.min_promo_views)} promo views · match ≥{filters.min_audience_match}</span></span>
        <ChevronDown size={18} aria-hidden="true" className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
            <div className="border-t border-line p-5">
              <div className="flex flex-wrap items-end gap-4">
                {num('Min followers', 'min_followers')}{num('Min promo views', 'min_promo_views')}{num('Min audience match', 'min_audience_match', 100)}
                <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" className="accent-[#01ABDD]" checked={f.require_brand_safety} onChange={e => setF({ ...f, require_brand_safety: e.target.checked })} />Enforce brand safety</label>
              </div>
              <h3 className="mb-2 mt-5 text-sm font-semibold">Ranking weights</h3>
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                {(Object.keys(w) as (keyof Weights)[]).map(k => (
                  <label key={k} className="text-xs"><span className="mb-1 flex justify-between"><span>{CRITERIA_LABELS[k]}</span><b className="tabular">{w[k]}</b></span>
                    <input type="range" min={0} max={50} value={w[k]} className="w-full accent-[#01ABDD]" onChange={e => setW({ ...w, [k]: Number(e.target.value) })} /></label>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted">Filtering and ranking are recalculated by the Python backend on every re-run.</p>
                <Button onClick={() => onApply(f, w)} disabled={busy || !dirty}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} aria-hidden="true" />Re-run matching</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
        <input aria-label="Search excluded creators" placeholder="Search name or handle" value={q} onChange={e => { setQ(e.target.value); setPage(1) }} className={`${inputCls} w-56`} />
        <select aria-label="Status" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className={selectCls}><option value="">All statuses</option><option value="excluded">Excluded</option><option value="needs_review">Needs review</option></select>
        <select aria-label="Level" value={level} onChange={e => { setLevel(e.target.value); setPage(1) }} className={selectCls}><option value="">Both levels</option><option value="1">Level 1</option><option value="2">Level 2</option></select>
        {data && Object.entries(data.reason_counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, n]) => <Badge key={c}>{c} · {n}</Badge>)}
      </div>
      {loading && !data ? <Skeleton className="h-64" /> : !data?.items.length ? <EmptyState title="No excluded creators for this filter" /> : (
        <Card className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <table className="dense w-full min-w-[760px] table-fixed">
            <caption className="sr-only">Excluded influencers and Python-generated reasons</caption>
            <colgroup><col className="w-[13rem]" /><col className="w-16" /><col className="w-32" /><col className="w-[12rem]" /><col /></colgroup>
            <thead><tr><th scope="col">Creator</th><th scope="col">Level</th><th scope="col">Status</th><th scope="col">Reason codes</th><th scope="col">Explanation</th></tr></thead>
            <tbody>{data.items.map(e => (
              <tr key={e.influencer_id} className="align-top"><td><span className="block truncate font-semibold">{e.display_name}</span><div className="truncate text-xs text-muted">{e.username}</div></td><td>L{e.level}</td>
                <td><Badge tone={e.status === 'needs_review' ? 'warn' : 'bad'}>{e.status === 'needs_review' ? 'Needs review' : 'Excluded'}</Badge></td>
                <td className="break-words font-mono text-xs [overflow-wrap:anywhere]">{e.reason_codes.join(', ')}</td><td className="break-words text-[13px] leading-5 text-muted [overflow-wrap:anywhere]">{e.reasons.join(' ')}</td></tr>))}</tbody>
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

function Compare({ items }: { items: Match[] }) {
  const rows: [string, (m: Match) => string, ((m: Match) => number)?][] = [
    ['Overall score', m => m.overall_score.toFixed(1), m => m.overall_score], ['Platform', m => m.platform], ['Followers', m => fmt.n(m.follower_count), m => m.follower_count],
    ['Median promo views', m => fmt.n(m.median_promotional_views), m => m.median_promotional_views], ['Engagement rate', m => fmt.pct(m.engagement_rate), m => m.engagement_rate],
    ['Audience in target segments', m => fmt.pct(m.audience_fit_pct), m => m.audience_fit_pct], ['Data confidence', m => m.data_confidence],
    ...Object.keys(CRITERIA_LABELS).map(k => [CRITERIA_LABELS[k], (m: Match) => m.scores[k].toFixed(0), (m: Match) => m.scores[k]] as [string, (m: Match) => string, (m: Match) => number]),
  ]
  return (
    <>
      <div className="overflow-x-auto">
        <table className="dense w-full"><thead><tr><th scope="col">Metric</th>{items.map(m => <th key={m.influencer_id} scope="col"><span className="flex items-center gap-2 normal-case tracking-normal text-ink"><Avatar name={m.display_name} size={24} />#{m.rank} {m.display_name}</span></th>)}</tr></thead>
          <tbody>{rows.map(([label, f, n]) => { const best = n ? Math.max(...items.map(n)) : null
            return <tr key={label}><th scope="row" className="font-medium normal-case tracking-normal text-ink">{label}</th>{items.map(m => <td key={m.influencer_id} className={n && n(m) === best ? 'font-bold text-brand-ink' : ''}>{f(m)}</td>)}</tr> })}</tbody></table>
      </div>
      <p className="mt-2 text-xs text-muted">Best value in each row is highlighted. Scores are 0–100 sub-scores before weighting.</p>
    </>
  )
}
