import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Cpu, Plus, Wrench } from 'lucide-react'
import { fmt, type AgentRun, type RunSummary, type Trace, type Usage } from '../api'
import { useApi, usePolling } from '../shared/hooks'
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, StatusPill } from '../shared/ui'
import { rise, stagger } from '../shared/motion'
import { TERMINAL, useCampaign } from './CampaignLayout'
import AgentGraph from './AgentGraph'

export function AgentPanel({ trace, runId }: { trace: Trace | null; runId: string | null }) {
  const done = !!trace && TERMINAL.includes(trace.status)
  const usage = useApi<Usage>(done && runId ? `/runs/${runId}/usage` : null)
  if (!trace) return <div className="space-y-4"><Skeleton className="h-96" /><Skeleton className="h-40" /></div>
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">How the agents called each other</h2>
            <p className="text-sm text-muted">Run <span className="font-mono">{trace.run_id}</span> · started {new Date(trace.started_at).toLocaleString('en-GB')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2"><StatusPill status={trace.status} /><Badge tone={trace.mode === 'llm' ? 'brand' : 'neutral'}>{trace.mode === 'llm' ? `LLM · ${trace.model}` : 'Offline deterministic'}</Badge></div>
        </div>
        <AgentGraph trace={trace} />
      </Card>

      <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-3">
        {trace.agents.map(a => <motion.div key={a.id} variants={rise}><AgentCard a={a} /></motion.div>)}
      </motion.div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <h2 className="mb-3 text-lg font-semibold">Token usage</h2>
          {!done ? <p className="text-sm text-muted">Available when the run finishes.</p> : usage.error ? <ErrorState message={usage.error} /> : !usage.data ? <Skeleton className="h-24" /> : <UsageTable u={usage.data} />}
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-2 text-lg font-semibold">Event log</h2>
          <ol className="scrollbar-thin max-h-80 space-y-1.5 overflow-auto font-mono text-xs">
            <AnimatePresence initial={false}>
              {trace.steps.map((s, i) => (
                <motion.li key={`${s.ts}-${i}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 20) * 0.02 }} className="flex gap-2">
                  <span className="shrink-0 text-muted">{new Date(s.ts).toLocaleTimeString('en-GB')}</span>
                  <span className={`h-1.5 w-1.5 shrink-0 translate-y-1.5 rounded-full ${s.kind === 'error' ? 'bg-red-500' : s.kind === 'tool_call' ? 'bg-brand' : 'bg-muted/50'}`} />
                  <span className="min-w-0 break-words"><b>{s.agent.replace(/Agent$/, '')}</b> · {s.detail}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </Card>
      </div>
    </div>
  )
}

function AgentCard({ a }: { a: AgentRun }) {
  const [open, setOpen] = useState(false)
  return (
    <Card hover className="flex h-full flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold">{a.name}</h3><p className="text-xs text-muted">{a.role}</p></div><StatusPill status={a.status} /></div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">Duration</dt><dd className="tabular text-right font-medium">{a.duration_ms != null ? `${(a.duration_ms / 1000).toFixed(2)}s` : '—'}</dd>
        <dt className="text-muted">Input tokens</dt><dd className="tabular text-right font-medium">{fmt.n(a.input_tokens)}</dd>
        <dt className="text-muted">Output tokens</dt><dd className="tabular text-right font-medium">{fmt.n(a.output_tokens)}</dd>
        <dt className="text-muted">Total tokens</dt><dd className="tabular text-right font-bold">{fmt.n(a.total_tokens)} {a.llm_calls > 0 && <Badge tone={a.token_source === 'actual' ? 'ok' : 'warn'}>{a.token_source}</Badge>}</dd>
        {a.retries > 0 && <><dt className="text-muted">Retries</dt><dd className="text-right font-medium">{a.retries}</dd></>}
      </dl>
      {a.llm_calls === 0 && <p className="flex items-center gap-1.5 text-xs text-muted"><Cpu size={12} aria-hidden="true" />No LLM call by this agent (deterministic).</p>}
      {a.output_summary && <p className="rounded-lg bg-ice p-2 text-xs">{a.output_summary}</p>}
      {a.errors.length > 0 && <ul role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-900 dark:bg-red-400/10 dark:text-red-200">{a.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      <div className="mt-auto">
        <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <Wrench size={13} aria-hidden="true" />Tools called ({a.tools.length})<ChevronDown size={13} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 space-y-2 overflow-hidden">
              {a.tools.map((t, i) => (
                <li key={i} className="rounded-lg border border-line p-2 text-xs"><div className="flex justify-between gap-2"><b className="font-mono">{t.name}</b><span className="tabular text-muted">{t.duration_ms}ms</span></div>
                  {t.error && <p className="text-red-700 dark:text-red-300">{t.error}</p>}
                  <details><summary className="cursor-pointer text-muted">input / output</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-ice p-1.5">{JSON.stringify({ input: t.input, output: t.output }, null, 1)}</pre></details></li>))}
              {!a.tools.length && <li className="text-xs text-muted">No tools were called.</li>}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </Card>
  )
}

function UsageTable({ u }: { u: Usage }) {
  const max = Math.max(1, ...u.per_agent.map(p => p.total_tokens))
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([['Prompt / input', fmt.n(u.input_tokens)], ['Response / output', fmt.n(u.output_tokens)], ['Total', fmt.n(u.total_tokens)], ['Source', u.token_source === 'none' ? 'n/a' : u.token_source]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl bg-ice p-3"><p className="text-xs text-muted">{l}</p><p className="text-xl font-semibold capitalize">{v}</p></div>
        ))}
      </div>
      <ul className="space-y-2">
        {u.per_agent.map(p => (
          <li key={p.agent} className="grid grid-cols-[minmax(0,170px)_1fr_auto] items-center gap-3 text-xs">
            <span className="truncate font-medium">{p.agent}</span>
            <span className="h-2 overflow-hidden rounded-full bg-ice"><motion.span initial={{ width: 0 }} animate={{ width: `${(p.total_tokens / max) * 100}%` }} transition={{ duration: 0.6 }} className="block h-full rounded-full bg-brand" /></span>
            <span className="tabular w-28 text-right"><b>{fmt.n(p.total_tokens)}</b> <span className="text-muted">({fmt.n(p.input_tokens)} in / {fmt.n(p.output_tokens)} out)</span></span>
          </li>
        ))}
      </ul>
      <p>Model: <b>{u.model ?? 'none (no LLM called)'}</b> · Provider: <b>{u.provider}</b> · Executed {new Date(u.executed_at).toLocaleString('en-GB')}</p>
      <p>Estimated cost: <b>{u.estimated_cost_usd != null ? `$${u.estimated_cost_usd}` : 'not shown'}</b> <span className="text-xs text-muted">{u.cost_note}</span></p>
      {u.note && <p className="text-xs text-muted">{u.note}</p>}
    </div>
  )
}

export default function Agents() {
  const { trace, runId } = useCampaign()
  return <AgentPanel trace={trace} runId={runId} />
}

/** Sidebar "Agent execution": pick any recent run and inspect it right here (no navigation away). */
export function AgentsLanding() {
  const [sp, setSp] = useSearchParams()
  const runs = useApi<{ items: RunSummary[] }>('/runs?kind=match&limit=20')
  const items = runs.data?.items ?? []
  const selected = sp.get('run') ?? items[0]?.run_id ?? null
  const { data: trace, error } = usePolling<Trace>(selected ? `/runs/${selected}/trace` : null, t => TERMINAL.includes(t.status), 700)
  const anyRunning = items.some(r => !TERMINAL.includes(r.status))
  useEffect(() => {
    if (!anyRunning) return
    const t = setInterval(runs.reload, 2500)
    return () => clearInterval(t)
  }, [anyRunning, runs.reload])
  const current = items.find(r => r.run_id === selected)

  if (runs.error) return <ErrorState message={runs.error} onRetry={runs.reload} />
  if (runs.loading && !runs.data) return <div className="mx-auto max-w-7xl space-y-4"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Agent execution</h1>
          <p className="text-sm text-muted">Live call graph, tool calls and token usage for every matching run. Pick a run below.</p>
        </div>
        <Link to="/admin/campaigns/new"><Button variant="outline"><Plus size={16} aria-hidden="true" />New campaign</Button></Link>
      </header>
      {!items.length ? (
        <EmptyState title="No runs yet" hint="Launch a campaign and its agents will appear here as a live graph." />
      ) : (
        <>
          <div role="listbox" aria-label="Recent runs" className="scrollbar-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
            {items.map(r => {
              const on = r.run_id === selected
              return (
                <button key={r.run_id} type="button" role="option" aria-selected={on} onClick={() => setSp({ run: r.run_id }, { replace: true })}
                  className={`relative w-60 shrink-0 rounded-2xl border p-3 text-left transition-all ${on ? 'border-brand bg-surface shadow-card' : 'border-line bg-surface/60 hover:border-brand/50 hover:bg-surface'}`}>
                  {on && <motion.span layoutId="run-pick" className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand" />}
                  <p className="truncate text-sm font-semibold">{r.campaign_name ?? r.campaign_id ?? r.run_id}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2"><StatusPill status={r.status} /><span className="text-xs text-muted">{fmt.ago(r.created_at)}</span></div>
                  <p className="mt-1.5 truncate text-[11px] text-muted">{r.mode === 'llm' ? r.model : 'Offline deterministic'}{r.total_tokens ? ` · ${fmt.n(r.total_tokens)} tokens` : ''}</p>
                </button>
              )
            })}
          </div>
          {error ? <ErrorState message={error} /> : (
            <AnimatePresence mode="wait">
              <motion.div key={selected} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
                {current && <p className="mb-3 text-sm">Showing <b>{current.campaign_name ?? 'campaign'}</b> run <span className="font-mono text-xs">{current.run_id}</span></p>}
                <AgentPanel trace={trace && trace.run_id === selected ? trace : null} runId={selected} />
              </motion.div>
            </AnimatePresence>
          )}
        </>
      )}
    </div>
  )
}
