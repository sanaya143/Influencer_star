import { useState } from 'react'
import { fmt, type Influencer, type Paged } from '../api'
import { useApi } from '../shared/hooks'
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '../shared/ui'

type Row = Omit<Influencer, 'collaboration_history'>

export default function Discovery() {
  const [q, setQ] = useState('')
  const [platform, setPlatform] = useState('')
  const [category, setCategory] = useState('')
  const [minF, setMinF] = useState(0)
  const [sort, setSort] = useState('followers')
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState<Row | null>(null)
  const path = `/mock/influencers?page=${page}&page_size=20&sort=${sort}&min_followers=${minF}${q ? `&q=${encodeURIComponent(q)}` : ''}${platform ? `&platform=${platform}` : ''}${category ? `&category=${category}` : ''}`
  const { data, error, loading, reload } = useApi<Paged<Row>>(path)
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1) }
  const sc = 'rounded-lg border border-line bg-white px-2 py-1.5 text-sm'
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header><h1 className="text-2xl font-bold md:text-3xl">Influencer discovery</h1><p className="text-sm text-muted">Browse the synthetic influencer dataset served by the mock API. Eligibility and ranking happen per campaign.</p></header>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <input aria-label="Search creators" placeholder="Search name, handle or tag" value={q} onChange={e => reset(setQ)(e.target.value)} className={`${sc} w-56`} />
        <select aria-label="Platform" value={platform} onChange={e => reset(setPlatform)(e.target.value)} className={sc}><option value="">All platforms</option><option>Instagram</option><option>TikTok</option><option>YouTube</option></select>
        <select aria-label="Category" value={category} onChange={e => reset(setCategory)(e.target.value)} className={sc}><option value="">All categories</option>{['women', 'men', 'unisex', 'kids', 'family', 'couple', 'accessories'].map(c => <option key={c}>{c}</option>)}</select>
        <label className="flex items-center gap-1.5 text-sm">Min followers<input type="number" min={0} step={1000} value={minF} onChange={e => reset(setMinF)(Number(e.target.value))} className={`${sc} w-28`} /></label>
        <select aria-label="Sort" value={sort} onChange={e => reset(setSort)(e.target.value)} className={sc}><option value="followers">Followers</option><option value="promo_views">Promo views</option><option value="engagement">Engagement</option><option value="id">ID</option></select>
        {data && <span className="ml-auto text-sm text-muted">{fmt.n(data.total)} creators</span>}
      </Card>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-96" /> : !data?.items.length ? <EmptyState title="No creators match" hint="Clear a filter to see more." /> : (
        <Card className="overflow-x-auto">
          <table className="dense w-full min-w-[820px]"><caption className="sr-only">Influencer dataset</caption>
            <thead><tr><th scope="col">Creator</th><th scope="col">Platform</th><th scope="col">Followers</th><th scope="col">Promo views</th><th scope="col">Engagement</th><th scope="col">Style</th><th scope="col">Flags</th></tr></thead>
            <tbody>{data.items.map(i => (
              <tr key={i.influencer_id} className="cursor-pointer hover:bg-ice" onClick={() => setSel(i)}>
                <td><button className="text-left font-semibold hover:text-[#066a87]" onClick={() => setSel(i)}>{i.display_name}</button><div className="text-xs text-muted">{i.username}</div></td>
                <td>{i.platform ?? <Badge tone="warn">missing</Badge>}</td><td>{i.follower_count == null ? <Badge tone="warn">missing</Badge> : fmt.n(i.follower_count)}</td>
                <td>{i.median_promotional_views == null ? <Badge tone="warn">missing</Badge> : fmt.n(i.median_promotional_views)}</td><td>{i.engagement_rate == null ? <Badge tone="warn">missing</Badge> : fmt.pct(i.engagement_rate)}</td>
                <td className="text-xs text-muted">{i.creator_content_style}</td>
                <td className="space-x-1">{i.brand_safety_status !== 'clear' && <Badge tone="warn">safety: {i.brand_safety_status}</Badge>}{i.data_quality_status !== 'verified' && <Badge tone="warn">{i.data_quality_status}</Badge>}</td></tr>))}</tbody></table>
        </Card>
      )}
      {data && data.pages > 1 && <div className="flex items-center justify-end gap-2 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><span>Page {page} of {data.pages}</span><Button size="sm" variant="outline" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>Next</Button></div>}
      {sel && (
        <div role="dialog" aria-modal="true" aria-label={sel.display_name} className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-6" onClick={() => setSel(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between"><div><h2 className="text-xl font-bold">{sel.display_name}</h2><p className="text-sm text-muted">{sel.username} · {sel.platform}</p></div><Button size="sm" variant="outline" onClick={() => setSel(null)} autoFocus>Close</Button></div>
            <p className="mt-2 text-sm">{sel.bio}</p>
            <h3 className="mt-3 text-sm font-semibold">Audience age</h3>
            <p className="text-xs text-muted">{Object.entries(sel.audience_age_distribution).map(([k, v]) => `${k}: ${v}%`).join(' · ')}</p>
            <h3 className="mt-3 text-sm font-semibold">Tags</h3>
            <div className="mt-1 flex flex-wrap gap-1.5">{[...sel.content_tags, ...sel.interests].map((t, i) => <Badge key={`${t}${i}`}>{t}</Badge>)}</div>
            <p className="mt-3 text-xs text-muted">Synthetic data. Run a campaign to see how this creator scores for a product.</p>
          </div>
        </div>
      )}
    </div>
  )
}
