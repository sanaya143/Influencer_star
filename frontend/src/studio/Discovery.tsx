import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { fmt, type Influencer, type Paged } from '../api'
import { useApi } from '../shared/hooks'
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Modal, Skeleton, inputCls, selectCls } from '../shared/ui'

type Row = Omit<Influencer, 'collaboration_history'>

function Bars({ data }: { data: Record<string, number> }) {
  return (
    <ul className="space-y-1.5">{Object.entries(data).sort((a, b) => b[1] - a[1]).map(([k, v], i) => (
      <li key={k} className="grid grid-cols-[72px_1fr_40px] items-center gap-2 text-xs">
        <span className="text-muted">{k}</span>
        <span className="h-2 overflow-hidden rounded-full bg-ice"><motion.span initial={{ width: 0 }} animate={{ width: `${Math.min(100, v)}%` }} transition={{ duration: 0.5, delay: i * 0.04 }} className="block h-full rounded-full bg-brand" /></span>
        <span className="tabular text-right">{v.toFixed(0)}%</span>
      </li>))}</ul>
  )
}

export default function Discovery() {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState('')
  const [category, setCategory] = useState('')
  const [minF, setMinF] = useState(0)
  const [sort, setSort] = useState('followers')
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState<Row | null>(null)
  useEffect(() => { const t = setTimeout(() => { setQuery(q); setPage(1) }, 250); return () => clearTimeout(t) }, [q])
  const path = `/mock/influencers?page=${page}&page_size=20&sort=${sort}&min_followers=${minF}${query ? `&q=${encodeURIComponent(query)}` : ''}${platform ? `&platform=${platform}` : ''}${category ? `&category=${category}` : ''}`
  const { data, error, loading, reload } = useApi<Paged<Row>>(path)
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1) }
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header><h1 className="text-2xl font-bold md:text-3xl">Influencer discovery</h1><p className="text-sm text-muted">Browse the synthetic creator dataset served by the mock social-data API. Eligibility and ranking happen per campaign.</p></header>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <label className="relative"><span className="sr-only">Search creators</span><Search size={15} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input placeholder="Name, handle or tag" value={q} onChange={e => setQ(e.target.value)} className={`${inputCls} w-56 pl-9`} /></label>
        <select aria-label="Platform" value={platform} onChange={e => reset(setPlatform)(e.target.value)} className={selectCls}><option value="">All platforms</option><option>Instagram</option><option>TikTok</option><option>YouTube</option></select>
        <select aria-label="Category" value={category} onChange={e => reset(setCategory)(e.target.value)} className={selectCls}><option value="">All categories</option>{['women', 'men', 'unisex', 'kids', 'family', 'couple', 'accessories'].map(c => <option key={c}>{c}</option>)}</select>
        <label className="flex items-center gap-1.5 text-sm">Min followers<input type="number" min={0} step={1000} value={minF} onChange={e => reset(setMinF)(Number(e.target.value))} className={`${selectCls} w-28`} /></label>
        <select aria-label="Sort" value={sort} onChange={e => reset(setSort)(e.target.value)} className={selectCls}><option value="followers">Followers</option><option value="promo_views">Promo views</option><option value="engagement">Engagement</option><option value="id">ID</option></select>
        {data && <span className="ml-auto text-sm text-muted"><b className="text-ink">{fmt.n(data.total)}</b> creators</span>}
      </Card>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-96" /> : !data?.items.length ? <EmptyState title="No creators match" hint="Clear a filter to see more." /> : (
        <Card className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <table className="dense w-full min-w-[860px]"><caption className="sr-only">Influencer dataset</caption>
            <thead><tr><th scope="col">Creator</th><th scope="col">Platform</th><th scope="col" className="num">Followers</th><th scope="col" className="num">Promo views</th><th scope="col" className="num">Engagement</th><th scope="col">Style</th><th scope="col">Flags</th></tr></thead>
            <tbody>{data.items.map((i, idx) => (
              <motion.tr key={i.influencer_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.015 }} className="cursor-pointer transition-colors hover:bg-ice" onClick={() => setSel(i)}>
                <td><div className="flex items-center gap-2.5"><Avatar name={i.display_name} size={30} /><div><button type="button" className="text-left font-semibold hover:text-brand-ink" onClick={e => { e.stopPropagation(); setSel(i) }}>{i.display_name}</button><div className="text-xs text-muted">{i.username}</div></div></div></td>
                <td>{i.platform ?? <Badge tone="warn">missing</Badge>}</td><td className="num">{i.follower_count == null ? <Badge tone="warn">missing</Badge> : fmt.n(i.follower_count)}</td>
                <td className="num">{i.median_promotional_views == null ? <Badge tone="warn">missing</Badge> : fmt.n(i.median_promotional_views)}</td><td className="num">{i.engagement_rate == null ? <Badge tone="warn">missing</Badge> : fmt.pct(i.engagement_rate)}</td>
                <td className="text-xs text-muted">{i.creator_content_style}</td>
                <td className="space-x-1">{i.brand_safety_status !== 'clear' && <Badge tone="warn">safety: {i.brand_safety_status}</Badge>}{i.data_quality_status !== 'verified' && <Badge tone="warn">{i.data_quality_status}</Badge>}</td></motion.tr>))}</tbody></table>
        </Card>
      )}
      {data && data.pages > 1 && <div className="flex items-center justify-end gap-2 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><span className="tabular">Page {page} of {data.pages}</span><Button size="sm" variant="outline" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>Next</Button></div>}
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.display_name ?? 'Creator'}>
        {sel && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3"><Avatar name={sel.display_name} size={48} /><div><p className="text-muted">{sel.username} · {sel.platform ?? 'platform unknown'}</p><p>{sel.bio}</p></div></div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[['Followers', fmt.k(sel.follower_count)], ['Promo views', fmt.k(sel.median_promotional_views)], ['Engagement', fmt.pct(sel.engagement_rate)]].map(([l, v]) => <div key={l} className="rounded-xl bg-ice p-2"><p className="text-[11px] text-muted">{l}</p><p className="font-semibold">{v}</p></div>)}
            </div>
            <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Audience age</h3><Bars data={sel.audience_age_distribution} /></div>
            <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Tags</h3><div className="flex flex-wrap gap-1.5">{[...sel.content_tags, ...sel.interests].map((t, i) => <Badge key={`${t}${i}`}>{t}</Badge>)}</div></div>
            <p className="text-xs text-muted">Synthetic data. Run a campaign to see how this creator scores for a product.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
