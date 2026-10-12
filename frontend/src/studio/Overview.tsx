import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useApi } from '../shared/hooks'
import { Badge, Button, Card, ErrorState, Skeleton, StatusPill } from '../shared/ui'
import { fmt, type Stats, type Usage } from '../api'

interface Overview {
  total_influencers: number; total_products: number; campaigns: number; mode: string
  latest_run: { run_id: string; campaign_id: string; status: string; stats: Stats | null; usage: Usage | null } | null
  recent_campaigns: { campaign_id: string; name: string; created_at: string }[]
}

export default function Overview() {
  const { data, error, loading, reload } = useApi<Overview>('/overview')
  if (error) return <ErrorState message={error} onRetry={reload} />
  const run = data?.latest_run
  const s = run?.stats
  const cards: [string, string, string?][] = data ? [
    ['Total influencers (mock dataset)', fmt.n(data.total_influencers)],
    ['Influencers evaluated', s ? fmt.n(s.retrieved) : '—', run ? 'Latest run' : 'No runs yet'],
    ['Eligible after Level 1', s ? fmt.n(s.eligible) : '—', s ? `${s.excluded_l1} excluded · ${s.review_required} need review` : undefined],
    ['Audience matches after Level 2', s ? fmt.n(s.passed_l2) : '—'],
    ['Ranked recommendations', s ? fmt.n(s.ranked) : '—'],
    ['Campaign execution', run?.status ?? 'Not run'],
    ['Tokens (latest run)', run?.usage ? fmt.n(run.usage.total_tokens) : '—', run?.usage ? (run.usage.mode === 'offline' ? 'Offline mode: no LLM used' : run.usage.token_source === 'actual' ? 'Actual (provider-reported)' : 'Estimated') : undefined],
  ] : []
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Overview</h1>
          <p className="text-sm text-muted">Live values from the backend. All influencer data is synthetic demonstration data.</p>
        </div>
        <Link to="/admin/campaigns/new"><Button>New campaign</Button></Link>
      </header>
      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading ? Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-24" />) : cards.map(([label, value, sub], i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <Card className="h-full p-4">
              <p className="text-xs font-medium text-muted">{label}</p>
              <p className="mt-1 text-2xl font-bold">{label === 'Campaign execution' && run ? <StatusPill status={value} /> : value}</p>
              {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
            </Card>
          </motion.div>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">Recent campaigns</h2>
          {!data?.recent_campaigns.length ? (
            <p className="mt-3 text-sm text-muted">No campaigns yet. Create one from the Campaign Studio, or pick a product in the storefront and choose “Promote this product”.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {data.recent_campaigns.map(c => (
                <li key={c.campaign_id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link className="font-medium hover:text-[#066a87]" to={`/admin/campaigns/${c.campaign_id}`}>{c.name}</Link>
                  <span className="text-muted">{new Date(c.created_at).toLocaleString('en-GB')}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="text-lg font-semibold">How it works</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted">
            <li><b className="text-ink">Brief Agent</b> structures the request.</li>
            <li><b className="text-ink">Python Level 1</b> eligibility filters.</li>
            <li><b className="text-ink">Python Level 2</b> audience match.</li>
            <li><b className="text-ink">Ranking engine</b> scores with set weights.</li>
            <li><b className="text-ink">Insights Agent</b> explains the result.</li>
          </ol>
          <div className="mt-3"><Badge tone="brand">Decisions are deterministic Python</Badge></div>
        </Card>
      </section>
    </div>
  )
}
