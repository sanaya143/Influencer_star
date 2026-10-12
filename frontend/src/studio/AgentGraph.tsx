import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotionConfig } from 'framer-motion'
import { Bot, BrainCircuit, CircleCheck, CircleX, FileText, Flag, Pause, Play, RotateCcw, Wrench } from 'lucide-react'
import { fmt, type AgentRun, type ToolCall, type Trace } from '../api'
import { Badge, Button, StatusPill } from '../shared/ui'

// ------------------------------------------------------------------ layout (SVG user units)
const BRIEF = 'CampaignBriefAgent', COORD = 'MatchingCoordinatorAgent', INSIGHTS = 'CampaignInsightsAgent'
const W = 1080, H = 500
type Kind = 'io' | 'agent' | 'tool' | 'llm'
interface GNode { id: string; kind: Kind; label: string; sub?: string; x: number; y: number; w: number; h: number; agent?: string; tool?: string }
interface GEdge { id: string; from: string; to: string; kind: 'flow' | 'tool' | 'llm'; label?: string }

const TOOL_LABELS: Record<string, string> = {
  search_products: 'Search products', submit_brief: 'Submit brief', retrieve_data: 'Retrieve creators',
  level1_eligibility_filter: 'Level 1 · eligibility', level2_audience_matcher: 'Level 2 · audience match', ranking_engine: 'Ranking engine',
  template_insights: 'Template insights',
}
const BRIEF_TOOLS = ['search_products', 'submit_brief']
const COORD_TOOLS = ['retrieve_data', 'level1_eligibility_filter', 'level2_audience_matcher', 'ranking_engine']

function buildGraph(trace: Trace) {
  const insightTools = [...new Set(trace.agents.find(a => a.id === INSIGHTS)?.tools.map(t => t.name) ?? [])]
  const llm = trace.mode === 'llm'
  const col = { brief: 250, coord: 560, insights: 860 }
  const nodes: GNode[] = [
    { id: 'in', kind: 'io', label: 'Campaign brief', sub: 'Marketer input', x: 14, y: 150, w: 120, h: 60 },
    { id: 'llm', kind: 'llm', label: llm ? (trace.model ?? 'LLM') : 'No LLM call', sub: llm ? trace.provider : 'Offline deterministic mode', x: col.coord - 125, y: 14, w: 250, h: 56 },
    { id: BRIEF, kind: 'agent', label: 'Campaign Brief Agent', x: col.brief - 100, y: 136, w: 200, h: 88, agent: BRIEF },
    { id: COORD, kind: 'agent', label: 'Matching Coordinator', x: col.coord - 105, y: 136, w: 210, h: 88, agent: COORD },
    { id: INSIGHTS, kind: 'agent', label: 'Campaign Insights Agent', x: col.insights - 100, y: 136, w: 200, h: 88, agent: INSIGHTS },
    { id: 'out', kind: 'io', label: 'Ranked shortlist', sub: 'Results & insights', x: W - 134, y: 150, w: 120, h: 60 },
  ]
  BRIEF_TOOLS.forEach((t, i) => nodes.push({ id: `${BRIEF}:${t}`, kind: 'tool', label: TOOL_LABELS[t], sub: t, x: col.brief - 85, y: 268 + i * 60, w: 170, h: 42, agent: BRIEF, tool: t }))
  COORD_TOOLS.forEach((t, i) => nodes.push({ id: `${COORD}:${t}`, kind: 'tool', label: TOOL_LABELS[t], sub: t, x: col.coord - 100, y: 262 + i * 58, w: 200, h: 42, agent: COORD, tool: t }))
  insightTools.forEach((t, i) => nodes.push({ id: `${INSIGHTS}:${t}`, kind: 'tool', label: TOOL_LABELS[t] ?? t, sub: t, x: col.insights - 85, y: 268 + i * 60, w: 170, h: 42, agent: INSIGHTS, tool: t }))

  const out = (agent: string, tool: string) => trace.agents.find(a => a.id === agent)?.tools.find(t => t.name === tool)?.output as Record<string, number> | undefined
  const n = (v: unknown) => (typeof v === 'number' ? fmt.n(v) : null)
  const retrieved = n(out(COORD, 'retrieve_data')?.influencers_retrieved)
  const eligible = n(out(COORD, 'level1_eligibility_filter')?.eligible)
  const matched = n(out(COORD, 'level2_audience_matcher')?.passed)
  const ranked = n(out(COORD, 'ranking_engine')?.ranked)
  const edges: GEdge[] = [
    { id: 'e-in', from: 'in', to: BRIEF, kind: 'flow' },
    { id: 'e-b-c', from: BRIEF, to: COORD, kind: 'flow', label: 'validated brief' },
    { id: 'e-c-i', from: COORD, to: INSIGHTS, kind: 'flow', label: ranked ? `${ranked} ranked` : undefined },
    { id: 'e-out', from: INSIGHTS, to: 'out', kind: 'flow' },
    { id: 'e-llm-b', from: 'llm', to: BRIEF, kind: 'llm' },
    { id: 'e-llm-i', from: 'llm', to: INSIGHTS, kind: 'llm' },
    { id: `e-${BRIEF}-t0`, from: BRIEF, to: `${BRIEF}:${BRIEF_TOOLS[0]}`, kind: 'tool' },
    { id: `e-${BRIEF}-t1`, from: `${BRIEF}:${BRIEF_TOOLS[0]}`, to: `${BRIEF}:${BRIEF_TOOLS[1]}`, kind: 'tool' },
    { id: `e-${COORD}-t0`, from: COORD, to: `${COORD}:${COORD_TOOLS[0]}`, kind: 'tool' },
    { id: `e-${COORD}-t1`, from: `${COORD}:${COORD_TOOLS[0]}`, to: `${COORD}:${COORD_TOOLS[1]}`, kind: 'tool', label: retrieved ? `${retrieved} creators` : undefined },
    { id: `e-${COORD}-t2`, from: `${COORD}:${COORD_TOOLS[1]}`, to: `${COORD}:${COORD_TOOLS[2]}`, kind: 'tool', label: eligible ? `${eligible} eligible` : undefined },
    { id: `e-${COORD}-t3`, from: `${COORD}:${COORD_TOOLS[2]}`, to: `${COORD}:${COORD_TOOLS[3]}`, kind: 'tool', label: matched ? `${matched} matched` : undefined },
    ...insightTools.map((t, i) => ({ id: `e-${INSIGHTS}-t${i}`, from: i ? `${INSIGHTS}:${insightTools[i - 1]}` : INSIGHTS, to: `${INSIGHTS}:${t}`, kind: 'tool' as const })),
  ]
  return { nodes, edges }
}

function edgePath(a: GNode, b: GNode, kind: GEdge['kind']): string {
  if (kind === 'flow') {
    const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, dx = (x2 - x1) / 2
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
  }
  if (kind === 'llm') {
    const x1 = a.x + (b.x + b.w / 2 < a.x + a.w / 2 ? 0 : a.w), y1 = a.y + a.h / 2, x2 = b.x + b.w / 2, y2 = b.y
    return `M${x1},${y1} C${x2},${y1} ${x2},${y1} ${x2},${y2}`
  }
  const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y
  return `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`
}

// ------------------------------------------------------------------ timeline (for replay)
interface Ev { t: number; node: string; type: 'start' | 'tool' | 'end' | 'done'; text: string; agent?: string }
function timeline(trace: Trace): Ev[] {
  const evs: Ev[] = []
  for (const a of trace.agents) {
    if (a.started_at) evs.push({ t: Date.parse(a.started_at), node: a.id, type: 'start', text: `${a.name} started`, agent: a.id })
    a.tools.forEach((tc, i) => evs.push({ t: Date.parse(tc.at) + i * 0.001, node: `${a.id}:${tc.name}`, type: 'tool', agent: a.id,
      text: `${TOOL_LABELS[tc.name] ?? tc.name}${tc.error ? ' failed' : ''} · ${tc.duration_ms}ms${summary(tc) ? ` · ${summary(tc)}` : ''}` }))
    if (a.completed_at) evs.push({ t: Date.parse(a.completed_at) + 0.002, node: a.id, type: 'end', text: `${a.name} ${a.status.toLowerCase()}`, agent: a.id })
  }
  evs.sort((x, y) => x.t - y.t)
  if (trace.completed_at) evs.push({ t: Date.parse(trace.completed_at) + 1, node: 'out', type: 'done', text: `Run ${trace.status.toLowerCase()}` })
  return evs
}
function summary(tc: ToolCall): string {
  const o = tc.output as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return ''
  if ('influencers_retrieved' in o) return `${fmt.n(o.influencers_retrieved as number)} creators`
  if ('eligible' in o) return `${fmt.n(o.eligible as number)} eligible, ${fmt.n(o.excluded as number)} excluded`
  if ('passed' in o) return `${fmt.n(o.passed as number)} matched`
  if ('ranked' in o) return `${fmt.n(o.ranked as number)} ranked`
  if ('ok' in o) return o.ok ? 'brief accepted' : 'needs clarification'
  return ''
}

type Status = 'Pending' | 'Running' | 'Completed' | 'Needs Review' | 'Failed' | 'Skipped'

// ------------------------------------------------------------------ component
export default function AgentGraph({ trace }: { trace: Trace }) {
  const reduce = useReducedMotionConfig()
  const { nodes, edges } = useMemo(() => buildGraph(trace), [trace])
  const byId = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes])
  const agent = (id?: string) => trace.agents.find(a => a.id === id)
  const terminal = ['Completed', 'Failed', 'Needs Review'].includes(trace.status)
  const events = useMemo(() => timeline(trace), [trace])

  // replay: k = index of the event being shown; null = show the final/live state
  const [k, setK] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState<string>(COORD)
  const autoplayed = useRef<string | null>(null)
  useEffect(() => {
    if (terminal && !reduce && autoplayed.current !== trace.run_id && events.length) {
      autoplayed.current = trace.run_id
      setK(0); setPlaying(true)
    }
  }, [terminal, reduce, trace.run_id, events.length])
  useEffect(() => {
    if (!playing || k === null) return
    if (k >= events.length - 1) { const t = setTimeout(() => { setPlaying(false); setK(null) }, 1400); return () => clearTimeout(t) }
    const t = setTimeout(() => setK(k + 1), events[k].type === 'tool' ? 620 : 480)
    return () => clearTimeout(t)
  }, [playing, k, events])
  useEffect(() => { if (k !== null && playing) setSelected(events[k].node === 'out' ? 'out' : events[k].node) }, [k, playing, events])

  const replaying = k !== null
  const idx = (pred: (e: Ev) => boolean) => events.findIndex(pred)

  function status(n: GNode): Status {
    if (n.kind === 'io') {
      if (n.id === 'in') return 'Completed'
      if (replaying) return k! >= events.length - 1 ? (trace.status as Status) : 'Pending'
      return terminal ? (trace.status === 'Failed' ? 'Failed' : 'Completed') : 'Pending'
    }
    if (n.kind === 'llm') {
      if (trace.mode !== 'llm') return 'Skipped'
      const llmAgents = trace.agents.filter(a => a.llm_calls > 0 || a.id === BRIEF || a.id === INSIGHTS)
      if (replaying) {
        const cur = events[k!]
        if (cur.agent && (cur.agent === BRIEF || cur.agent === INSIGHTS) && cur.type !== 'end') return 'Running'
        return events.slice(0, k! + 1).some(e => e.type === 'end' && (e.agent === BRIEF || e.agent === INSIGHTS)) ? 'Completed' : 'Pending'
      }
      return llmAgents.some(a => a.status === 'Running') ? 'Running' : trace.agents.some(a => a.llm_calls > 0) ? 'Completed' : 'Pending'
    }
    const a = agent(n.agent)
    if (!a) return 'Pending'
    if (n.kind === 'agent') {
      if (!replaying) return (a.status as Status)
      const s = idx(e => e.node === a.id && e.type === 'start'), e = idx(ev => ev.node === a.id && ev.type === 'end')
      if (s === -1 && e === -1) return a.status === 'Completed' && k! >= 0 && idx(ev => ev.agent === COORD) <= k! ? 'Completed' : 'Pending'
      if (e !== -1 && e <= k!) return a.status as Status
      if (s !== -1 && s <= k!) return 'Running'
      return 'Pending'
    }
    const call = a.tools.find(t => t.name === n.tool)
    if (!replaying) {
      if (call) return call.error ? 'Failed' : 'Completed'
      if (a.status === 'Running') return a.tools.length === (n.agent === COORD ? COORD_TOOLS.indexOf(n.tool!) : 0) ? 'Running' : 'Pending'
      return a.status === 'Pending' ? 'Pending' : 'Skipped'
    }
    const ti = idx(e => e.node === n.id)
    if (ti === -1) return 'Skipped'
    return ti < k! ? (call?.error ? 'Failed' : 'Completed') : ti === k ? 'Running' : 'Pending'
  }

  const st = Object.fromEntries(nodes.map(n => [n.id, status(n)])) as Record<string, Status>
  const edgeState = (e: GEdge): 'idle' | 'done' | 'active' => {
    const s = st[e.to], f = st[e.from]
    if (e.kind === 'llm') return st.llm === 'Skipped' ? 'idle' : s === 'Running' && st.llm === 'Running' ? 'active' : st.llm === 'Completed' && s !== 'Pending' ? 'done' : 'idle'
    if (s === 'Running') return 'active'
    if (s !== 'Pending' && s !== 'Skipped' && f !== 'Pending' && f !== 'Skipped') return 'done'
    return 'idle'
  }

  const sel = byId[selected] ?? byId[COORD]
  return (
    <div className="@container">
    <div className="grid gap-4 @min-[1180px]:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 rounded-2xl border border-line bg-ice/60">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            {!terminal ? <Badge tone="brand"><span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />Live</Badge>
              : replaying ? <Badge tone="brand">Replay {k! + 1}/{events.length}</Badge> : <Badge tone="ok">Final state</Badge>}
            <span className="hidden text-muted sm:inline">Select any node for its inputs, outputs and timing.</span>
          </div>
          {terminal && events.length > 0 && (
            <div className="flex items-center gap-1.5">
              {replaying && <Button size="sm" variant="outline" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause replay' : 'Resume replay'}>{playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}</Button>}
              <Button size="sm" variant="outline" onClick={() => { setK(0); setPlaying(true) }}><RotateCcw size={14} aria-hidden="true" />Replay run</Button>
            </div>
          )}
        </div>
        <div className="scrollbar-thin overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full min-w-[860px]" role="group" aria-label="Agent call graph">
            <defs>
              <marker id="ag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--muted)' }} /></marker>
              <marker id="ag-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--brand)' }} /></marker>
            </defs>
            {/* swim-lane hints */}
            <text x={250} y={252} textAnchor="middle" fontSize={10} fontWeight={700} letterSpacing="0.12em" style={{ fill: 'var(--muted)' }}>TOOLS</text>
            <text x={560} y={248} textAnchor="middle" fontSize={10} fontWeight={700} letterSpacing="0.12em" style={{ fill: 'var(--muted)' }}>DETERMINISTIC PYTHON</text>
            <text x={860} y={252} textAnchor="middle" fontSize={10} fontWeight={700} letterSpacing="0.12em" style={{ fill: 'var(--muted)' }}>{nodes.some(n => n.agent === INSIGHTS && n.kind === 'tool') ? 'TOOLS' : 'LLM OUTPUT'}</text>

            {edges.map(e => {
              const a = byId[e.from], b = byId[e.to]
              if (!a || !b) return null
              const d = edgePath(a, b, e.kind)
              const s = edgeState(e)
              const mid = e.kind === 'tool' ? { x: a.x + a.w / 2 + 8, y: (a.y + a.h + b.y) / 2 } : { x: (a.x + a.w + b.x) / 2, y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 - 10 }
              return (
                <g key={e.id}>
                  <path d={d} fill="none" strokeWidth={e.kind === 'flow' ? 2.5 : 2} strokeLinecap="round" markerEnd={`url(#${s === 'idle' ? 'ag-arrow' : 'ag-arrow-on'})`}
                    className={s === 'active' ? 'flow-edge' : ''} strokeDasharray={e.kind === 'llm' && s !== 'active' ? '4 6' : undefined}
                    style={{ stroke: s === 'idle' ? 'var(--line)' : 'var(--brand)', opacity: s === 'done' ? 0.75 : 1, transition: 'stroke .4s, opacity .4s' }} />
                  {s === 'active' && !reduce && (
                    <circle r={4.5} style={{ fill: 'var(--brand)' }}><animateMotion dur={e.kind === 'flow' ? '1.1s' : '0.8s'} repeatCount="indefinite" path={d} /></circle>
                  )}
                  {e.label && (
                    <text x={mid.x} y={mid.y} textAnchor={e.kind === 'tool' ? 'start' : 'middle'} fontSize={11} fontWeight={600} className="tabular"
                      style={{ fill: s === 'idle' ? 'var(--muted)' : 'var(--brand-ink)', paintOrder: 'stroke', stroke: 'var(--ice)', strokeWidth: 4, transition: 'fill .4s' }}>{e.label}</text>
                  )}
                </g>
              )
            })}

            {nodes.map((n, i) => <Node key={n.id} n={n} status={st[n.id]} selected={sel.id === n.id} delay={i * 0.04} run={agent(n.agent)}
              onSelect={() => { setSelected(n.id); setPlaying(false) }} />)}
          </svg>
        </div>
        <div className="border-t border-line px-4 py-2.5" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={replaying ? k : 'final'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
              className="truncate font-mono text-xs text-muted">
              {replaying ? <><span className="text-brand-ink">▶</span> {events[k!].text}</> : trace.summary ?? (terminal ? 'Run finished.' : 'Waiting for the agents…')}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
      <Details node={sel} status={st[sel.id]} trace={trace} run={agent(sel.agent)} />
    </div>
    </div>
  )
}

const STROKE: Record<Status, string> = {
  Pending: 'var(--line)', Running: 'var(--brand)', Completed: 'var(--brand)', 'Needs Review': '#d99a06', Failed: '#d03b3b', Skipped: 'var(--line)',
}

function Node({ n, status, selected, onSelect, delay, run }: { n: GNode; status: Status; selected: boolean; onSelect: () => void; delay: number; run?: AgentRun }) {
  const Icon = n.kind === 'agent' ? Bot : n.kind === 'llm' ? BrainCircuit : n.kind === 'tool' ? Wrench : n.id === 'in' ? FileText : Flag
  const r = n.kind === 'tool' ? 12 : 16
  const dim = status === 'Pending' || status === 'Skipped'
  const sub = n.kind === 'agent' && run
    ? `${status}${run.duration_ms != null && status !== 'Running' && status !== 'Pending' ? ` · ${(run.duration_ms / 1000).toFixed(2)}s` : ''}${run.total_tokens ? ` · ${fmt.n(run.total_tokens)} tok` : ''}`
    : n.sub
  return (
    <motion.g initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: dim ? 0.62 : 1, scale: 1 }} transition={{ delay, duration: 0.35 }}
      style={{ transformBox: 'fill-box', transformOrigin: 'center', cursor: 'pointer' }} tabIndex={0} role="button" className="outline-none"
      aria-label={`${n.label}${n.sub && n.kind === 'tool' ? ` (${n.sub})` : ''}: ${status}`} aria-pressed={selected}
      onClick={onSelect} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}>
      {status === 'Running' && <rect className="pulse-ring" x={n.x - 4} y={n.y - 4} width={n.w + 8} height={n.h + 8} rx={r + 4} fill="none" style={{ stroke: 'var(--brand)', strokeWidth: 2 }} />}
      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={r}
        style={{ fill: n.kind === 'agent' && status === 'Running' ? 'color-mix(in oklab, var(--brand) 10%, var(--surface))' : 'var(--surface)', stroke: selected ? 'var(--ink)' : STROKE[status], strokeWidth: selected ? 2.5 : n.kind === 'agent' ? 2 : 1.5, transition: 'stroke .35s, fill .35s', filter: n.kind === 'agent' ? 'drop-shadow(0 6px 14px rgba(0,0,0,.08))' : undefined }} />
      {n.kind === 'agent' || n.kind === 'llm' ? (
        <>
          <circle cx={n.x + 26} cy={n.y + n.h / 2} r={15} style={{ fill: dim ? 'var(--ice)' : 'color-mix(in oklab, var(--brand) 18%, var(--surface))' }} />
          <Icon x={n.x + 17} y={n.y + n.h / 2 - 9} width={18} height={18} style={{ color: 'var(--brand-ink)' }} aria-hidden="true" />
          <text x={n.x + 50} y={n.y + n.h / 2 - 6} fontSize={13} fontWeight={700} style={{ fill: 'var(--ink)' }}>{n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label}</text>
          <text x={n.x + 50} y={n.y + n.h / 2 + 13} fontSize={11} style={{ fill: 'var(--muted)' }}>{sub && sub.length > 30 ? `${sub.slice(0, 29)}…` : sub}</text>
        </>
      ) : (
        <>
          <Icon x={n.x + 11} y={n.y + n.h / 2 - 7} width={14} height={14} style={{ color: dim ? 'var(--muted)' : 'var(--brand-ink)' }} aria-hidden="true" />
          <text x={n.x + 31} y={n.y + (n.sub ? n.h / 2 - 4 : n.h / 2 + 4)} fontSize={12} fontWeight={600} style={{ fill: 'var(--ink)' }}>{n.label}</text>
          {n.sub && <text x={n.x + 31} y={n.y + n.h / 2 + 11} fontSize={10} className="font-mono" style={{ fill: 'var(--muted)' }}>{n.sub}</text>}
        </>
      )}
      {(status === 'Completed' || status === 'Failed') && (
        <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          <circle cx={n.x + n.w - 2} cy={n.y + 2} r={9} style={{ fill: status === 'Failed' ? '#d03b3b' : 'var(--brand)', stroke: 'var(--surface)', strokeWidth: 2 }} />
          {status === 'Failed'
            ? <path d={`M${n.x + n.w - 5},${n.y - 1} l6,6 M${n.x + n.w + 1},${n.y - 1} l-6,6`} stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
            : <path d={`M${n.x + n.w - 6},${n.y + 2} l3,3 l5,-6`} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--on-brand)' }} />}
        </motion.g>
      )}
      {status === 'Needs Review' && <circle cx={n.x + n.w - 2} cy={n.y + 2} r={8} style={{ fill: '#d99a06', stroke: 'var(--surface)', strokeWidth: 2 }} />}
    </motion.g>
  )
}

function Json({ value }: { value: unknown }) {
  return <pre className="scrollbar-thin mt-1 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-ice p-2 font-mono text-[11px] leading-relaxed">{JSON.stringify(value, null, 1)}</pre>
}

function Details({ node, status, trace, run }: { node: GNode; status: Status; trace: Trace; run?: AgentRun }) {
  const call = run?.tools.find(t => t.name === node.tool)
  return (
    <AnimatePresence mode="wait">
      <motion.aside key={node.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}
        className="shadow-card min-w-0 rounded-2xl border border-line bg-surface p-4 text-sm" aria-label={`${node.label} details`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{node.kind === 'agent' ? 'Agent' : node.kind === 'tool' ? 'Tool call' : node.kind === 'llm' ? 'Language model' : 'Data'}</p>
            <h3 className="mt-0.5 break-words font-semibold">{node.kind === 'agent' && run ? run.name : node.label}</h3>
          </div>
          {status !== 'Skipped' ? <StatusPill status={status} /> : <Badge>Not used</Badge>}
        </div>

        {node.kind === 'agent' && run && (
          <div className="mt-3 space-y-3">
            <p className="text-muted">{run.role}</p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {[['Duration', run.duration_ms != null ? `${(run.duration_ms / 1000).toFixed(2)}s` : '—'], ['LLM calls', String(run.llm_calls)],
                ['Input tokens', fmt.n(run.input_tokens)], ['Output tokens', fmt.n(run.output_tokens)], ['Tool calls', String(run.tools.length)], ['Retries', String(run.retries)]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-ice p-2"><dt className="text-muted">{l}</dt><dd className="tabular font-semibold">{v}</dd></div>
              ))}
            </dl>
            {run.llm_calls > 0 && <Badge tone={run.token_source === 'actual' ? 'ok' : 'warn'}>Tokens {run.token_source}</Badge>}
            {run.output_summary && <p className="rounded-lg border border-line p-2 text-xs">{run.output_summary}</p>}
            {run.errors.length > 0 && <ul role="alert" className="space-y-1 rounded-lg bg-red-50 p-2 text-xs text-red-900 dark:bg-red-400/10 dark:text-red-200">{run.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          </div>
        )}

        {node.kind === 'tool' && (
          call ? (
            <div className="mt-3 space-y-2 text-xs">
              <p className="font-mono text-muted">{call.name} · {call.duration_ms}ms · {new Date(call.at).toLocaleTimeString('en-GB')}</p>
              {call.error && <p className="flex items-center gap-1 text-red-700 dark:text-red-300"><CircleX size={13} aria-hidden="true" />{call.error}</p>}
              <div><p className="font-semibold">Input</p><Json value={call.input} /></div>
              <div><p className="font-semibold">Output</p><Json value={call.output} /></div>
              {node.agent === 'MatchingCoordinatorAgent' && <p className="flex items-center gap-1 text-muted"><CircleCheck size={13} aria-hidden="true" />Pure Python function; no LLM involved.</p>}
            </div>
          ) : <p className="mt-3 text-xs text-muted">{status === 'Skipped' ? 'Not called in this run (for example, the brief came from the structured form).' : 'Not called yet.'}</p>
        )}

        {node.kind === 'llm' && (
          <div className="mt-3 space-y-2 text-xs">
            {trace.mode === 'llm' ? (
              <>
                <p><span className="text-muted">Provider</span> <b>{trace.provider}</b></p>
                <p className="break-all"><span className="text-muted">Model</span> <b className="font-mono">{trace.model}</b></p>
                <ul className="space-y-1">{trace.agents.filter(a => a.llm_calls > 0).map(a => <li key={a.id} className="flex justify-between rounded-lg bg-ice p-2"><span>{a.name}</span><span className="tabular font-semibold">{a.llm_calls} call(s) · {fmt.n(a.total_tokens)} tok</span></li>)}</ul>
              </>
            ) : <p className="text-muted">This run used offline deterministic mode: the rule-based brief parser and templated insights. No model was called and no tokens were used.</p>}
          </div>
        )}

        {node.kind === 'io' && (
          <p className="mt-3 text-xs text-muted">{node.id === 'in' ? 'The marketer’s product choice and natural-language request, reviewed before launch.' : trace.summary ?? 'Ranked shortlist with explanations; open the Results tab for the full list.'}</p>
        )}
      </motion.aside>
    </AnimatePresence>
  )
}
