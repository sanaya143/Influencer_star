import { useState } from 'react'
import { ArrowRight, Cpu, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fmt, type AgentRun, type Trace, type Usage } from '../api'
import { useApi } from '../shared/hooks'
import { Badge, Card, EmptyState, ErrorState, Skeleton, StatusPill } from '../shared/ui'
import { useCampaign } from './CampaignLayout'

export function AgentPanel({ trace, runId }: { trace: Trace | null; runId: string | null }) {
  const done = !!trace && ['Completed', 'Failed', 'Needs Review'].includes(trace.status)
  const usage = useApi<Usage>(done && runId ? `/runs/${runId}/usage` : null)
  if (!trace) return <Skeleton className="h-64" />
  const stages = [...trace.agents.map(a => ({ label: a.name, status: a.status })), { label: 'Python filters + ranking', status: trace.agents.find(a => a.id === 'MatchingCoordinatorAgent')?.status ?? 'Pending' }]
  const ordered = [stages[0], { label: 'Level 1 filter (Python)', status: stages[1].status }, { label: 'Level 2 matcher (Python)', status: stages[1].status }, { label: 'Ranking engine (Python)', status: stages[1].status }, stages[2]]
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Workflow trace</h2><div className="flex items-center gap-2"><StatusPill status={trace.status} /><Badge>{trace.mode === 'llm' ? `LLM · ${trace.model}` : 'Offline deterministic'}</Badge></div></div>
        <ol aria-label="Workflow stages" className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {ordered.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className={`rounded-lg border px-2.5 py-1.5 font-medium ${s.status === 'Completed' ? 'border-brand bg-brand/10' : s.status === 'Running' ? 'animate-pulse border-brand' : s.status === 'Needs Review' ? 'border-amber-300 bg-amber-50' : s.status === 'Failed' ? 'border-red-300 bg-red-50' : 'border-line text-muted'}`}>{s.label}</span>
              {i < ordered.length - 1 && <ArrowRight size={14} className="text-muted" aria-hidden="true" />}
            </li>))}
        </ol>
        {trace.summary && <p className="mt-3 text-sm text-muted">{trace.summary}</p>}
        <p className="mt-1 text-xs text-muted">Run {trace.run_id} · started {new Date(trace.started_at).toLocaleString('en-GB')}</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">{trace.agents.map(a => <AgentCard key={a.id} a={a} />)}</div>
      <Card className="p-5">
        <h2 className="mb-3 text-lg font-semibold">Token usage</h2>
        {!done ? <p className="text-sm text-muted">Available when the run finishes.</p> : usage.error ? <ErrorState message={usage.error} /> : !usage.data ? <Skeleton className="h-24" /> : <UsageTable u={usage.data} />}
      </Card>
      <Card className="p-5">
        <h2 className="mb-2 text-lg font-semibold">Event log</h2>
        <ol className="max-h-72 space-y-1 overflow-auto font-mono text-xs">{trace.steps.map((s, i) => <li key={i}><span className="text-muted">{new Date(s.ts).toLocaleTimeString('en-GB')}</span> <b>{s.agent}</b> · {s.kind} · {s.detail}</li>)}</ol>
      </Card>
    </div>
  )
}

function AgentCard({ a }: { a: AgentRun }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold">{a.name}</h3><p className="text-xs text-muted">{a.role}</p></div><StatusPill status={a.status} /></div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">Duration</dt><dd className="text-right font-medium">{a.duration_ms != null ? `${(a.duration_ms / 1000).toFixed(2)}s` : '—'}</dd>
        <dt className="text-muted">Input tokens</dt><dd className="text-right font-medium">{fmt.n(a.input_tokens)}</dd>
        <dt className="text-muted">Output tokens</dt><dd className="text-right font-medium">{fmt.n(a.output_tokens)}</dd>
        <dt className="text-muted">Total tokens</dt><dd className="text-right font-bold">{fmt.n(a.total_tokens)} {a.llm_calls > 0 && <Badge tone={a.token_source === 'actual' ? 'ok' : 'warn'}>{a.token_source}</Badge>}</dd>
        {a.retries > 0 && <><dt className="text-muted">Retries</dt><dd className="text-right font-medium">{a.retries}</dd></>}
      </dl>
      {a.llm_calls === 0 && <p className="text-xs text-muted"><Cpu size={12} className="mr-1 inline" aria-hidden="true" />No LLM call by this agent (deterministic).</p>}
      {a.output_summary && <p className="rounded-lg bg-ice p-2 text-xs">{a.output_summary}</p>}
      {a.errors.length > 0 && <ul role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-900">{a.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      <div>
        <button className="inline-flex items-center gap-1 text-xs font-medium text-[#066a87]" aria-expanded={open} onClick={() => setOpen(o => !o)}><Wrench size={13} aria-hidden="true" />Tools called ({a.tools.length})</button>
        {open && <ul className="mt-2 space-y-2">{a.tools.map((t, i) => (
          <li key={i} className="rounded-lg border border-line p-2 text-xs"><div className="flex justify-between"><b>{t.name}</b><span className="text-muted">{t.duration_ms}ms</span></div>
            {t.error && <p className="text-red-700">{t.error}</p>}
            <details><summary className="cursor-pointer text-muted">input / output</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify({ input: t.input, output: t.output }, null, 1)}</pre></details></li>))}
        </ul>}
      </div>
    </Card>
  )
}

function UsageTable({ u }: { u: Usage }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-4">
        {([['Prompt / input', u.input_tokens], ['Response / output', u.output_tokens], ['Total', u.total_tokens]] as const).map(([l, v]) => <div key={l} className="rounded-xl bg-ice p-3"><p className="text-xs text-muted">{l}</p><p className="text-xl font-bold">{fmt.n(v)}</p></div>)}
        <div className="rounded-xl bg-ice p-3"><p className="text-xs text-muted">Source</p><p className="text-xl font-bold capitalize">{u.token_source === 'none' ? 'n/a' : u.token_source}</p></div>
      </div>
      <p>Model: <b>{u.model ?? 'none (no LLM called)'}</b> · Provider: <b>{u.provider}</b> · Executed {new Date(u.executed_at).toLocaleString('en-GB')}</p>
      <p>Estimated cost: <b>{u.estimated_cost_usd != null ? `$${u.estimated_cost_usd}` : 'not shown'}</b> <span className="text-xs text-muted">{u.cost_note}</span></p>
      {u.note && <p className="text-xs text-muted">{u.note}</p>}
      <table className="dense w-full"><thead><tr><th scope="col">Agent</th><th scope="col">Input</th><th scope="col">Output</th><th scope="col">Total</th><th scope="col">Source</th></tr></thead>
        <tbody>{u.per_agent.map(p => <tr key={p.agent}><th scope="row" className="font-medium">{p.agent}</th><td>{fmt.n(p.input_tokens)}</td><td>{fmt.n(p.output_tokens)}</td><td>{fmt.n(p.total_tokens)}</td><td>{p.token_source}</td></tr>)}</tbody></table>
    </div>
  )
}

export default function Agents() {
  const { trace, runId } = useCampaign()
  return <AgentPanel trace={trace} runId={runId} />
}

export function AgentsLanding() {
  const { data, loading } = useApi<{ latest_run: { campaign_id: string } | null }>('/overview')
  if (loading) return <Skeleton className="h-40" />
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold md:text-3xl">Agent execution</h1>
      {data?.latest_run ? <p className="text-sm">Open the latest run: <Link className="font-semibold text-[#066a87] underline" to={`/admin/campaigns/${data.latest_run.campaign_id}/agents`}>view agent cards and token usage</Link></p>
        : <EmptyState title="No runs yet" hint="Launch a campaign to see agent cards, tool calls and token usage here." action={<Link to="/admin/campaigns/new" className="text-sm font-semibold text-[#066a87] underline">Create a campaign</Link>} />}
    </div>
  )
}
