import { useCallback, useEffect, useState } from 'react'
import { NavLink, useOutletContext, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BadgePoundSterling, BarChart3, Download, ListOrdered, Network } from 'lucide-react'
import { api, type Filters, type Trace, type Weights } from '../api'
import { useApi, usePolling } from '../shared/hooks'
import { Badge, Button, ErrorState, Skeleton, StatusPill } from '../shared/ui'
import { AnimatedOutlet } from '../shared/motion'

interface Campaign { campaign_id: string; name: string; latest_run_id: string | null; status: string; brief: { product_id: string } }
export interface CampaignCtx {
  campaignId: string; runId: string | null; done: boolean; trace: Trace | null
  rerun: (filters?: Filters, weights?: Weights) => Promise<void>; rerunning: boolean
}
export const useCampaign = () => useOutletContext<CampaignCtx>()

export const TERMINAL = ['Completed', 'Failed', 'Needs Review']

export default function CampaignLayout() {
  const { campaignId = '' } = useParams()
  const camp = useApi<Campaign>(`/campaigns/${campaignId}`)
  const [runId, setRunId] = useState<string | null>(null)
  const [rerunning, setRerunning] = useState(false)
  useEffect(() => { if (camp.data?.latest_run_id) setRunId(camp.data.latest_run_id) }, [camp.data?.latest_run_id])
  const { data: trace } = usePolling<Trace>(runId ? `/runs/${runId}/trace` : null, t => TERMINAL.includes(t.status), 700)
  const done = !!trace && TERMINAL.includes(trace.status) && trace.run_id === runId

  const rerun = useCallback(async (filters?: Filters, weights?: Weights) => {
    setRerunning(true)
    try {
      const r = await api<{ run_id: string }>(`/campaigns/${campaignId}/match`, { method: 'POST', json: { filters, weights } })
      setRunId(r.run_id)
    } finally { setRerunning(false) }
  }, [campaignId])

  if (camp.error) return <ErrorState message={camp.error} onRetry={camp.reload} />
  if (!camp.data) return <Skeleton className="h-40" />
  const tabs = [
    { to: `/admin/campaigns/${campaignId}`, label: 'Results', icon: ListOrdered, end: true },
    { to: `/admin/campaigns/${campaignId}/analytics`, label: 'Analytics', icon: BarChart3 },
    { to: `/admin/campaigns/${campaignId}/roi`, label: 'ROI & budget', icon: BadgePoundSterling },
    { to: `/admin/campaigns/${campaignId}/agents`, label: 'Agent execution', icon: Network },
  ]
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Campaign</p>
          <h1 className="text-2xl font-bold md:text-3xl">{camp.data.name}</h1>
          <div className="mt-1.5 flex items-center gap-2"><StatusPill status={trace?.status ?? camp.data.status} /><Badge>Synthetic data</Badge></div>
        </div>
        {done && trace?.status !== 'Failed' && (
          <div className="flex gap-2">
            <a href={`/api/campaigns/${campaignId}/export?format=csv`}><Button variant="outline" size="sm"><Download size={15} aria-hidden="true" />CSV</Button></a>
            <a href={`/api/campaigns/${campaignId}/export?format=json`}><Button variant="outline" size="sm"><Download size={15} aria-hidden="true" />JSON</Button></a>
          </div>
        )}
      </header>
      <nav aria-label="Campaign sections" className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`}>
            {({ isActive }) => (
              <>
                <t.icon size={16} aria-hidden="true" />{t.label}
                {isActive && <motion.span layoutId="campaign-tab" className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-brand" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <AnimatedOutlet context={{ campaignId, runId, done, trace, rerun, rerunning } satisfies CampaignCtx} />
    </div>
  )
}
