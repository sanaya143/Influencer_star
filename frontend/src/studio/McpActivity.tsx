import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, CircleCheck, CircleX, Copy, Pause, Pencil, Play, Plug } from 'lucide-react'
import { fmt, type McpCall, type McpCalls } from '../api'
import { useApi } from '../shared/hooks'
import { Badge, Card, EmptyState, ErrorState, Segmented, Skeleton } from '../shared/ui'
import { CountUp, rise, stagger } from '../shared/motion'
import { useToast } from '../shared/toast'

type Filter = 'all' | 'changes' | 'errors'
const POLL_MS = 3000

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  const toast = useToast()
  return (
    <button type="button" aria-label={label} title={label} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }
      catch { toast({ tone: 'bad', title: 'Could not copy', body: 'Select the text and copy it manually.' }) }
    }} className="rounded-lg p-1.5 text-muted transition-colors hover:bg-ice hover:text-ink">
      {done ? <Check size={15} aria-hidden="true" className="text-brand-ink" /> : <Copy size={15} aria-hidden="true" />}
    </button>
  )
}

const ms = (v: number) => (v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1)} s`)

function Row({ c, fresh }: { c: McpCall; fresh: boolean }) {
  const [open, setOpen] = useState(false)
  const Icon = c.status === 'error' ? CircleX : c.changes_data ? Pencil : CircleCheck
  const tone = c.status === 'error' ? 'text-red-600 dark:text-red-400' : c.changes_data ? 'text-amber-600 dark:text-amber-300' : 'text-brand-ink'
  return (
    <motion.li layout initial={{ opacity: 0, y: -10, backgroundColor: 'rgba(1,171,221,0.18)' }} animate={{ opacity: 1, y: 0, backgroundColor: fresh ? 'rgba(1,171,221,0.10)' : 'rgba(1,171,221,0)' }}
      exit={{ opacity: 0 }} transition={{ duration: 0.35, backgroundColor: { duration: 2.2 } }} className="rounded-xl">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-ice">
        <Icon size={18} aria-hidden="true" className={`mt-0.5 ${tone}`} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-semibold">{c.name}</span>
            {c.transport.startsWith('outbound') ? <Badge tone="brand">outbound · Zylo is the client</Badge> : null}
            {c.kind !== 'tool' && <Badge>{c.kind}</Badge>}
            {c.changes_data && <Badge tone="warn">changed data</Badge>}
            {c.status === 'error' && <Badge tone="bad">error</Badge>}
            {c.result_hint && c.status === 'ok' && <span className="text-xs text-muted">→ {c.result_hint}</span>}
          </span>
          <span className="mt-0.5 block truncate font-mono text-xs text-muted" title={c.args}>{c.args === '{}' ? 'no inputs' : c.args}</span>
          {c.status === 'error' && c.error && <span className="mt-1 block text-xs text-red-700 dark:text-red-300">{c.error}</span>}
        </span>
        <span className="flex flex-col items-end gap-1 text-right text-xs text-muted">
          <span title={new Date(c.at).toLocaleString('en-GB')}>{fmt.ago(c.at)}</span>
          <span className="tabular">{ms(c.duration_ms)}</span>
          <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.dl initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-1.5 overflow-hidden px-3 pb-3 pl-11 text-xs">
            <dt className="text-muted">Client</dt><dd>{c.client} <span className="text-muted">via {c.transport}</span></dd>
            <dt className="text-muted">Time</dt><dd>{new Date(c.at).toLocaleString('en-GB')}</dd>
            <dt className="text-muted">Inputs</dt><dd><pre className="scrollbar-thin max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-ice p-2 font-mono text-[11px]">{c.args}</pre></dd>
            {c.error && <><dt className="text-muted">Error</dt><dd className="text-red-700 dark:text-red-300">{c.error}</dd></>}
            <dt className="text-muted">Call id</dt><dd className="font-mono">#{c.id}</dd>
          </motion.dl>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

/** What outside agents (Claude, IDE agents, scripts) did through the MCP server, newest first, updating live. */
export default function McpActivity() {
  const [filter, setFilter] = useState<Filter>('all')
  const [live, setLive] = useState(true)
  const qs = `limit=60${filter === 'errors' ? '&status=error' : filter === 'changes' ? '&changes_only=true' : ''}`
  const { data, error, reload } = useApi<McpCalls>(`/mcp/calls?${qs}`)
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload() }, POLL_MS)
    return () => clearInterval(t)
  }, [live, reload])

  // highlight rows that arrived since the previous poll
  const newest = useRef(0)
  const [fresh, setFresh] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (!data?.items.length) return
    const top = data.items[0].id
    if (newest.current && top > newest.current) setFresh(new Set(data.items.filter(c => c.id > newest.current).map(c => c.id)))
    newest.current = Math.max(newest.current, top)
  }, [data])

  if (error && !data) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-80" /></div>
  const { summary: s, server } = data
  const connect = `claude mcp add --transport http zylo http://localhost:8000${server.endpoint}`
  const stats: [string, ReactNode, string][] = [
    ['Calls, all time', <CountUp value={s.total} key="t" />, `${s.last_hour} in the last hour`],
    ['Errors', <CountUp value={s.errors} key="e" />, s.total ? `${((s.errors / s.total) * 100).toFixed(1)}% of calls` : 'none yet'],
    ['Data changes', <CountUp value={s.changes} key="c" />, server.writes ? 'write tools enabled' : 'write tools disabled'],
    ['Average time', <span key="a">{ms(s.avg_ms)}</span>, `${server.tools} tools exposed`],
  ]
  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3"><span className={`absolute inline-flex h-full w-full rounded-full ${server.running ? 'animate-ping bg-emerald-400 opacity-60' : ''}`} /><span className={`relative h-3 w-3 rounded-full ${server.running ? 'bg-emerald-500' : 'bg-muted/60'}`} /></span>
          <div><p className="text-sm font-semibold">{server.running ? 'MCP server running' : 'MCP server not running'}</p>
            <p className="text-xs text-muted">{server.token_required ? 'Bearer token required' : 'Open (local use)'} · {server.writes ? 'can change data' : 'read-only'}</p></div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl bg-ice px-3 py-1.5 text-xs">
          <Plug size={14} aria-hidden="true" className="shrink-0 text-brand-ink" />
          <code className="scrollbar-thin min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono">{connect}</code>
          <CopyButton text={connect} label="Copy the connect command" />
        </div>
      </Card>

      <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([label, value, sub]) => (
          <motion.div key={label} variants={rise}><Card className="p-4"><p className="text-xs font-medium text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted">{sub}</p></Card></motion.div>
        ))}
      </motion.div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="MCP activity filter" value={filter} onChange={setFilter} size="sm"
            options={[{ value: 'all', label: 'All calls' }, { value: 'changes', label: `Changed data (${s.changes})` }, { value: 'errors', label: `Errors (${s.errors})` }]} />
          {s.clients.length > 0 && <p className="hidden text-xs text-muted md:block">Clients: {s.clients.map(c => `${c.name} (${c.count})`).join(' · ')}</p>}
        </div>
        <button type="button" onClick={() => setLive(l => !l)} aria-pressed={live} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold transition-colors hover:border-brand hover:bg-ice">
          {live ? <><Pause size={13} aria-hidden="true" />Live · pause</> : <><Play size={13} aria-hidden="true" />Paused · resume</>}
        </button>
      </div>

      {!data.items.length ? (
        <EmptyState title={filter === 'all' ? 'No MCP calls yet' : 'Nothing matches this filter'}
          hint={filter === 'all' ? 'Connect an AI client with the command above. Every tool call it makes (inputs, result, time, errors) appears here within seconds.' : 'Switch to “All calls” to see everything.'} />
      ) : (
        <Card className="p-1.5">
          <ul className="divide-y divide-line" aria-live="polite" aria-label="MCP calls, newest first">
            <AnimatePresence initial={false}>{data.items.map(c => <Row key={c.id} c={c} fresh={fresh.has(c.id)} />)}</AnimatePresence>
          </ul>
        </Card>
      )}
      <p className="text-xs text-muted">Shows a trimmed summary of each call (secrets are masked; results are not stored). The last 5,000 calls are kept. Calls from the read-only stdio server appear here too, and so do Zylo's own outbound calls to the outside creator-data provider (marked outbound).</p>
    </div>
  )
}
