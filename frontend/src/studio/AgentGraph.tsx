import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, motion, useReducedMotionConfig } from 'framer-motion'
import { Bot, BrainCircuit, CircleCheck, CircleX, FileText, Flag, LocateFixed, Maximize2, Minimize2, Minus, PanelRight, Pause, Play, Plus, RotateCcw, Scan, Wrench, X } from 'lucide-react'
import { fmt, type AgentRun, type ToolCall, type Trace } from '../api'
import { Badge, Button, StatusPill } from '../shared/ui'

// ------------------------------------------------------------------ layout (SVG user units)
const BRIEF = 'CampaignBriefAgent', COORD = 'MatchingCoordinatorAgent', INSIGHTS = 'CampaignInsightsAgent'
// Graph space. Compact enough that "fit" shows the whole workflow at a readable zoom on a laptop screen.
const W = 1300, H = 690
const COL = { brief: 320, coord: 660, insights: 990 }  // runs recorded with the (retired) Brief agent
const COL2 = { coord: 560, insights: 950, gather: 290, decide: 590 }  // current workflow: Matching Coordinator, then Insights
const GATHER = 3  // coordinator tools 0-2 gather creators; 3-6 filter, rank and plan
type Kind = 'io' | 'agent' | 'tool' | 'llm'
interface GNode { id: string; kind: Kind; label: string; sub?: string; x: number; y: number; w: number; h: number; agent?: string; tool?: string }
interface GEdge { id: string; from: string; to: string; kind: 'flow' | 'tool' | 'llm'; label?: string }

const TOOL_LABELS: Record<string, string> = {
  search_products: 'Search products', submit_brief: 'Submit brief', retrieve_data: 'Retrieve creators',
  level1_eligibility_filter: 'Level 1 · eligibility', level2_audience_matcher: 'Level 2 · audience match', ranking_engine: 'Ranking engine',
  template_insights: 'Template insights', resolve_target: 'Product or collection', fetch_external_creators: 'Outside creators (MCP)',
  roi_planner: 'ROI & budget plan',
}
const BRIEF_TOOLS = ['search_products', 'submit_brief']
const COORD_TOOLS_V1 = ['retrieve_data', 'level1_eligibility_filter', 'level2_audience_matcher', 'ranking_engine']
const COORD_TOOLS = ['resolve_target', 'retrieve_data', 'fetch_external_creators', 'level1_eligibility_filter', 'level2_audience_matcher', 'ranking_engine', 'roi_planner']
interface LaneDef { x: number; w: number; label: string }
const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
let measureCtx: CanvasRenderingContext2D | null | undefined
/** Trim text with an ellipsis so it fits `max` px at the given font: measured, not guessed by character count. */
function fit(text: string, max: number, size: number, weight = 400, family = SANS): string {
  if (measureCtx === undefined) { try { measureCtx = document.createElement('canvas').getContext('2d') } catch { measureCtx = null } }
  const ctx = measureCtx
  const width = (t: string) => { if (!ctx) return t.length * size * (family === MONO ? 0.6 : 0.56); ctx.font = `${weight} ${size}px ${family}`; return ctx.measureText(t).width }
  if (width(text) <= max) return text
  let lo = 0, hi = text.length
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (width(`${text.slice(0, mid).trimEnd()}…`) <= max) lo = mid; else hi = mid - 1 }
  return `${text.slice(0, lo).trimEnd()}…`
}
const dur = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms < 10 ? ms.toFixed(1) : Math.round(ms)}ms`)

function buildGraph(trace: Trace) {
  const insightTools = [...new Set(trace.agents.find(a => a.id === INSIGHTS)?.tools.map(t => t.name) ?? [])]
  const llm = trace.mode === 'llm'
  const legacy = trace.agents.some(a => a.id === BRIEF)
  const agentRow = 170, toolRow = 352
  const out = (agent: string, tool: string) => trace.agents.find(a => a.id === agent)?.tools.find(t => t.name === tool)?.output as Record<string, number> | undefined
  const n = (v: unknown) => (typeof v === 'number' ? fmt.n(v) : null)
  const retrieved = n(out(COORD, 'retrieve_data')?.influencers_retrieved)
  const eligible = n(out(COORD, 'level1_eligibility_filter')?.eligible)
  const matched = n(out(COORD, 'level2_audience_matcher')?.passed)
  const ranked = n(out(COORD, 'ranking_engine')?.ranked)
  const insightLane = trace.agents.find(a => a.id === INSIGHTS)?.tools.length ? 'INSIGHT TOOLS' : 'LLM OUTPUT'
  const llmNode = (cx: number): GNode => ({ id: 'llm', kind: 'llm', label: llm ? (trace.model ?? 'LLM') : 'No LLM call', sub: llm ? trace.provider : 'Offline deterministic mode', x: cx - 160, y: 24, w: 320, h: 72 })
  const io = (id: string, label: string, sub: string, x: number): GNode => ({ id, kind: 'io', label, sub, x, y: agentRow + 17, w: 172, h: 70 })

  if (legacy) {  // a run from before the Brief agent was merged into the Matching Coordinator
    const nodes: GNode[] = [
      io('in', 'Campaign brief', 'Marketer input', 24), llmNode(COL.coord),
      { id: BRIEF, kind: 'agent', label: 'Brief Agent', x: COL.brief - 120, y: agentRow, w: 240, h: 104, agent: BRIEF },
      { id: COORD, kind: 'agent', label: 'Matching Coordinator', x: COL.coord - 132, y: agentRow, w: 264, h: 104, agent: COORD },
      { id: INSIGHTS, kind: 'agent', label: 'Insights Agent', x: COL.insights - 120, y: agentRow, w: 240, h: 104, agent: INSIGHTS },
      io('out', 'Ranked shortlist', 'Results & insights', W - 188),
    ]
    BRIEF_TOOLS.forEach((t, i) => nodes.push({ id: `${BRIEF}:${t}`, kind: 'tool', label: TOOL_LABELS[t], sub: t, x: COL.brief - 110, y: toolRow + i * 80, w: 220, h: 56, agent: BRIEF, tool: t }))
    COORD_TOOLS_V1.forEach((t, i) => nodes.push({ id: `${COORD}:${t}`, kind: 'tool', label: TOOL_LABELS[t], sub: t, x: COL.coord - 125, y: toolRow - 12 + i * 84, w: 250, h: 56, agent: COORD, tool: t }))
    insightTools.forEach((t, i) => nodes.push({ id: `${INSIGHTS}:${t}`, kind: 'tool', label: TOOL_LABELS[t] ?? t, sub: t, x: COL.insights - 110, y: toolRow + i * 80, w: 220, h: 56, agent: INSIGHTS, tool: t }))
    const edges: GEdge[] = [
      { id: 'e-in', from: 'in', to: BRIEF, kind: 'flow' },
      { id: 'e-b-c', from: BRIEF, to: COORD, kind: 'flow', label: 'validated brief' },
      { id: 'e-c-i', from: COORD, to: INSIGHTS, kind: 'flow', label: ranked ? `${ranked} ranked` : undefined },
      { id: 'e-out', from: INSIGHTS, to: 'out', kind: 'flow' },
      { id: 'e-llm-b', from: 'llm', to: BRIEF, kind: 'llm' },
      { id: 'e-llm-i', from: 'llm', to: INSIGHTS, kind: 'llm' },
      { id: `e-${BRIEF}-t0`, from: BRIEF, to: `${BRIEF}:${BRIEF_TOOLS[0]}`, kind: 'tool' },
      { id: `e-${BRIEF}-t1`, from: `${BRIEF}:${BRIEF_TOOLS[0]}`, to: `${BRIEF}:${BRIEF_TOOLS[1]}`, kind: 'tool' },
      { id: `e-${COORD}-t0`, from: COORD, to: `${COORD}:${COORD_TOOLS_V1[0]}`, kind: 'tool' },
      { id: `e-${COORD}-t1`, from: `${COORD}:${COORD_TOOLS_V1[0]}`, to: `${COORD}:${COORD_TOOLS_V1[1]}`, kind: 'tool', label: retrieved ? `${retrieved} creators` : undefined },
      { id: `e-${COORD}-t2`, from: `${COORD}:${COORD_TOOLS_V1[1]}`, to: `${COORD}:${COORD_TOOLS_V1[2]}`, kind: 'tool', label: eligible ? `${eligible} eligible` : undefined },
      { id: `e-${COORD}-t3`, from: `${COORD}:${COORD_TOOLS_V1[2]}`, to: `${COORD}:${COORD_TOOLS_V1[3]}`, kind: 'tool', label: matched ? `${matched} matched` : undefined },
      ...insightTools.map((t, i) => ({ id: `e-${INSIGHTS}-t${i}`, from: i ? `${INSIGHTS}:${insightTools[i - 1]}` : INSIGHTS, to: `${INSIGHTS}:${t}`, kind: 'tool' as const })),
    ]
    const lanes: LaneDef[] = [{ x: COL.brief - 140, w: 280, label: 'BRIEF TOOLS' }, { x: COL.coord - 145, w: 290, label: 'DETERMINISTIC PYTHON' }, { x: COL.insights - 140, w: 280, label: insightLane }]
    return { nodes, edges, lanes, coordTools: COORD_TOOLS_V1 }
  }

  const ext = out(COORD, 'fetch_external_creators') as Record<string, unknown> | undefined
  const added = typeof ext?.new_creators === 'number' ? ext.new_creators : null
  const nodes: GNode[] = [
    io('in', 'Campaign brief', 'Product or collection', 16), llmNode(COL2.insights),
    { id: COORD, kind: 'agent', label: 'Matching Coordinator', x: COL2.coord - 140, y: agentRow, w: 280, h: 104, agent: COORD },
    { id: INSIGHTS, kind: 'agent', label: 'Insights Agent', x: COL2.insights - 120, y: agentRow, w: 240, h: 104, agent: INSIGHTS },
    io('out', 'Shortlist & plan', 'Results and ROI', W - 188),
  ]
  // Two stages side by side instead of one tall column: 1 gather creators, 2 filter, rank and plan.
  const ty = (row: number) => 340 + row * 80
  COORD_TOOLS.forEach((t, i) => {
    const stage = i < GATHER ? COL2.gather : COL2.decide, row = i < GATHER ? i : i - GATHER
    nodes.push({ id: `${COORD}:${t}`, kind: 'tool', label: TOOL_LABELS[t], sub: t, x: stage, y: ty(row), w: 240, h: 52, agent: COORD, tool: t })
  })
  nodes.push({ id: 'ext', kind: 'io', label: 'Outside provider', sub: ext?.skipped ? 'Off in Settings' : 'MCP server', x: 12, y: ty(2) - 9, w: 188, h: 70 })
  insightTools.forEach((t, i) => nodes.push({ id: `${INSIGHTS}:${t}`, kind: 'tool', label: TOOL_LABELS[t] ?? t, sub: t, x: COL2.insights - 110, y: ty(i), w: 220, h: 52, agent: INSIGHTS, tool: t }))
  const chain = (i: number, label?: string | null): GEdge => ({ id: `e-${COORD}-t${i}`, from: i ? `${COORD}:${COORD_TOOLS[i - 1]}` : COORD, to: `${COORD}:${COORD_TOOLS[i]}`,
    kind: i === GATHER ? 'flow' : 'tool', label: label ?? undefined })
  const edges: GEdge[] = [
    { id: 'e-in', from: 'in', to: COORD, kind: 'flow' },
    { id: 'e-c-i', from: COORD, to: INSIGHTS, kind: 'flow', label: ranked ? `${ranked} ranked` : undefined },
    { id: 'e-out', from: INSIGHTS, to: 'out', kind: 'flow' },
    { id: 'e-llm-i', from: 'llm', to: INSIGHTS, kind: 'llm' },
    { id: 'e-ext', from: 'ext', to: `${COORD}:fetch_external_creators`, kind: 'flow', label: added != null ? `+${fmt.n(added)}` : undefined },
    chain(0), chain(1), chain(2, retrieved ? `${retrieved} own` : null), chain(3), chain(4, eligible ? `${eligible} eligible` : null),
    chain(5, matched ? `${matched} matched` : null), chain(6, ranked ? `${ranked} ranked` : null),
    ...insightTools.map((t, i) => ({ id: `e-${INSIGHTS}-t${i}`, from: i ? `${INSIGHTS}:${insightTools[i - 1]}` : INSIGHTS, to: `${INSIGHTS}:${t}`, kind: 'tool' as const })),
  ]
  const lanes: LaneDef[] = [{ x: COL2.gather - 14, w: 268, label: '1 · GATHER CREATORS' }, { x: COL2.decide - 14, w: 268, label: '2 · FILTER, RANK, PLAN' },
    { x: COL2.insights - 130, w: 260, label: insightLane }]
  return { nodes, edges, lanes, coordTools: COORD_TOOLS }
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
  if ('skipped' in o) return 'skipped: outside data is off'
  if ('new_creators' in o) return `+${fmt.n(o.new_creators as number)} creators from ${o.server ?? 'the outside provider'}`
  if ('plan_creators' in o) return `plan: ${fmt.n(o.plan_creators as number)} creators for £${fmt.n(o.spend_gbp as number)}`
  if ('kind' in o && 'name' in o) return `${o.kind}: ${o.name}`
  return ''
}

type Status = 'Pending' | 'Running' | 'Completed' | 'Needs Review' | 'Failed' | 'Skipped'
const STROKE: Record<Status, string> = {
  Pending: 'var(--line)', Running: 'var(--brand)', Completed: 'var(--brand)', 'Needs Review': '#d99a06', Failed: '#d03b3b', Skipped: 'var(--line)',
}

// ------------------------------------------------------------------ pan & zoom
interface View { s: number; x: number; y: number }
const MIN_S = 0.3, MAX_S = 2.5
const READABLE_S = 0.5  // below this the labels are unreadable, so the first view anchors left at this zoom instead of fitting

function usePanZoom(reduce: boolean | null) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View>({ s: 0.6, x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const touched = useRef(false) // true once the viewer zooms/pans; until then the graph keeps fitting the frame
  const viewRef = useRef(view)
  viewRef.current = view
  const anim = useRef<{ stop: () => void } | null>(null)

  const go = useCallback((target: View, smooth = true) => {
    anim.current?.stop()
    if (!smooth || reduce) { setView(target); return }
    const from = viewRef.current
    anim.current = animate(0, 1, { duration: 0.28, ease: [0.22, 1, 0.36, 1], onUpdate: p => setView({
      s: from.s + (target.s - from.s) * p, x: from.x + (target.x - from.x) * p, y: from.y + (target.y - from.y) * p,
    }) })
  }, [reduce])

  const fitView = useCallback((w: number, h: number, readable: boolean): View => {
    const sFit = Math.max(MIN_S, Math.min(1.1, Math.min(w / W, h / H) * 0.94))
    if (!readable || sFit >= READABLE_S) return { s: sFit, x: (w - W * sFit) / 2, y: (h - H * sFit) / 2 }
    const s = READABLE_S  // too small to read when squeezed in: open at a readable zoom, anchored left
    return { s, x: 16, y: Math.max(16, (h - H * s) / 2) }
  }, [])
  const fit = useCallback(() => { touched.current = true; go(fitView(size.w, size.h, false)) }, [go, fitView, size])
  const reset = useCallback(() => { touched.current = false; go(fitView(size.w, size.h, true)) }, [go, fitView, size])
  /** Keep a node in view (camera follow during live runs and replays) unless the viewer has taken control. */
  const follow = useCallback((n?: GNode) => {
    if (!n || touched.current || !size.w) return
    const v = viewRef.current, pad = 40
    const left = v.x + n.x * v.s, right = v.x + (n.x + n.w) * v.s, top = v.y + n.y * v.s, bottom = v.y + (n.y + n.h) * v.s
    if (left >= pad && right <= size.w - pad && top >= pad && bottom <= size.h - pad) return
    const clampX = (x: number) => Math.min(16, Math.max(size.w - W * v.s - 16, x))
    const clampY = (y: number) => (H * v.s <= size.h ? v.y : Math.min(16, Math.max(size.h - H * v.s - 16, y)))
    go({ s: v.s, x: clampX(size.w / 2 - (n.x + n.w / 2) * v.s), y: clampY(size.h / 2 - (n.y + n.h / 2) * v.s) })
  }, [go, size])
  const centerOn = useCallback((gx: number, gy: number) => {
    touched.current = true
    const v = viewRef.current
    go({ s: v.s, x: size.w / 2 - gx * v.s, y: size.h / 2 - gy * v.s })
  }, [go, size])

  const zoomAt = useCallback((factor: number, px?: number, py?: number, smooth = true) => {
    touched.current = true
    const v = viewRef.current
    const s = Math.max(MIN_S, Math.min(MAX_S, v.s * factor))
    const cx = px ?? size.w / 2, cy = py ?? size.h / 2
    go({ s, x: cx - (cx - v.x) * (s / v.s), y: cy - (cy - v.y) * (s / v.s) }, smooth)
  }, [go, size])
  const actual = useCallback(() => {
    touched.current = true
    const v = viewRef.current, cx = size.w / 2, cy = size.h / 2
    go({ s: 1, x: cx - (cx - v.x) / v.s, y: cy - (cy - v.y) / v.s })
  }, [go, size])
  const panBy = useCallback((dx: number, dy: number) => { touched.current = true; go({ ...viewRef.current, x: viewRef.current.x + dx, y: viewRef.current.y + dy }) }, [go])

  // measure before first paint so the graph never flashes at the wrong zoom
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setSize({ w: r.width, h: r.height })
    setView(fitView(r.width, r.height, true))
  }, [fitView])

  // keep the frame size; refit on resize until the viewer takes control
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect
      setSize({ w: width, h: height })
      if (!touched.current) setView(fitView(width, height, true))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fitView])

  // Ctrl/⌘ + wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms at the pointer; plain wheel scrolls the page
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top, false)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // drag to pan: pointer capture only starts once the pointer has moved, so plain clicks still reach the nodes
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; id: number; on: boolean } | null>(null)
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    anim.current?.stop()
    drag.current = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y, id: e.pointerId, on: false }
  }
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.on && Math.hypot(dx, dy) > 4) { d.on = true; setDragging(true); e.currentTarget.setPointerCapture(d.id) }
    if (d.on) { touched.current = true; setView(v => ({ ...v, x: d.vx + dx, y: d.vy + dy })) }
  }
  const onPointerUp = () => { drag.current = null; setDragging(false) }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, () => void> = {
      '+': () => zoomAt(1.2), '=': () => zoomAt(1.2), '-': () => zoomAt(1 / 1.2), '_': () => zoomAt(1 / 1.2), '0': fit, r: reset,
      ArrowLeft: () => panBy(60, 0), ArrowRight: () => panBy(-60, 0), ArrowUp: () => panBy(0, 60), ArrowDown: () => panBy(0, -60),
    }
    if (e.target === e.currentTarget && map[e.key]) { e.preventDefault(); map[e.key]() }
  }

  return { box, size, view, dragging, fit, reset, follow, centerOn, zoomAt, actual, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown } }
}

// ------------------------------------------------------------------ component
export default function AgentGraph({ trace }: { trace: Trace }) {
  const reduce = useReducedMotionConfig()
  const { nodes, edges, lanes, coordTools } = useMemo(() => buildGraph(trace), [trace])
  const byId = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes])
  const agent = (id?: string) => trace.agents.find(a => a.id === id)
  const terminal = ['Completed', 'Failed', 'Needs Review'].includes(trace.status)
  const events = useMemo(() => timeline(trace), [trace])
  const [expanded, setExpanded] = useState(false)

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
    const t = setTimeout(() => setK(k + 1), events[k].type === 'tool' ? 650 : 500)
    return () => clearTimeout(t)
  }, [playing, k, events])
  useEffect(() => { if (k !== null && playing) setSelected(events[k].node) }, [k, playing, events])
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [expanded])

  const replaying = k !== null
  const idx = (pred: (e: Ev) => boolean) => events.findIndex(pred)

  function status(n: GNode): Status {
    if (n.id === 'ext') {
      const fetch = byId[`${COORD}:fetch_external_creators`]
      const call = agent(COORD)?.tools.find(t => t.name === 'fetch_external_creators')
      if ((call?.output as { skipped?: boolean } | null)?.skipped) return 'Skipped'
      return fetch ? status(fetch) : 'Skipped'
    }
    if (n.kind === 'io') {
      if (n.id === 'in') return 'Completed'
      if (replaying) return k! >= events.length - 1 ? (trace.status as Status) : 'Pending'
      return terminal ? (trace.status === 'Failed' ? 'Failed' : 'Completed') : 'Pending'
    }
    if (n.kind === 'llm') {
      if (trace.mode !== 'llm') return 'Skipped'
      if (replaying) {
        const cur = events[k!]
        if (cur.agent && (cur.agent === BRIEF || cur.agent === INSIGHTS) && cur.type !== 'end') return 'Running'
        return events.slice(0, k! + 1).some(e => e.type === 'end' && (e.agent === BRIEF || e.agent === INSIGHTS)) ? 'Completed' : 'Pending'
      }
      return trace.agents.some(a => (a.id === BRIEF || a.id === INSIGHTS) && a.status === 'Running') ? 'Running' : trace.agents.some(a => a.llm_calls > 0) ? 'Completed' : 'Pending'
    }
    const a = agent(n.agent)
    if (!a) return 'Pending'
    if (n.kind === 'agent') {
      if (!replaying) return a.status as Status
      const s = idx(e => e.node === a.id && e.type === 'start'), e = idx(ev => ev.node === a.id && ev.type === 'end')
      if (s === -1 && e === -1) return a.status === 'Completed' && idx(ev => ev.agent === COORD) <= k! ? 'Completed' : 'Pending'
      if (e !== -1 && e <= k!) return a.status as Status
      if (s !== -1 && s <= k!) return 'Running'
      return 'Pending'
    }
    const call = a.tools.find(t => t.name === n.tool)
    const skipped = (call?.output as { skipped?: boolean } | null)?.skipped
    if (!replaying) {
      if (call) return call.error ? (n.tool === 'fetch_external_creators' ? 'Needs Review' : 'Failed') : skipped ? 'Skipped' : 'Completed'
      if (a.status === 'Running') return a.tools.length === (n.agent === COORD ? coordTools.indexOf(n.tool!) : 0) ? 'Running' : 'Pending'
      return a.status === 'Pending' ? 'Pending' : 'Skipped'
    }
    const ti = idx(e => e.node === n.id)
    if (ti === -1) return 'Skipped'
    return ti < k! ? (call?.error ? 'Failed' : skipped ? 'Skipped' : 'Completed') : ti === k ? 'Running' : 'Pending'
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
  const [picks, setPicks] = useState(0)
  const select = (id: string) => { setSelected(id); setPlaying(false); setPicks(n => n + 1) }
  const jump = (i: number) => { setK(i); setPlaying(false); setSelected(events[i].node) }

  const workspace = (
    <Workspace expanded={expanded} onToggle={() => setExpanded(e => !e)} trace={trace} terminal={terminal} nodes={nodes} statuses={st}
      focus={replaying ? byId[events[k!].node] : nodes.find(n => st[n.id] === 'Running' && n.kind !== 'llm')}
      replay={{ k, playing, events, setPlaying, restart: () => { setK(0); setPlaying(true) }, jump }} picks={picks}
      details={<Details node={sel} status={st[sel.id]} trace={trace} run={agent(sel.agent)} />}>
      {edges.map(e => <Edge key={e.id} e={e} a={byId[e.from]} b={byId[e.to]} state={edgeState(e)} reduce={!!reduce} />)}
      {nodes.map((n, i) => <Node key={n.id} n={n} status={st[n.id]} selected={sel.id === n.id} delay={i * 0.035} run={agent(n.agent)} onSelect={() => select(n.id)} />)}
    </Workspace>
  )

  return (
    <>
      {expanded ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-ice text-sm text-muted">
          The call graph is open in full screen.
          <Button size="sm" variant="outline" onClick={() => setExpanded(false)}><Minimize2 size={14} aria-hidden="true" />Back to page view</Button>
        </div>
      ) : workspace}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {expanded && (
            <motion.div key="graph-full" role="dialog" aria-modal="true" aria-label="Agent call graph, full screen"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[70] flex flex-col bg-page/95 p-3 backdrop-blur-md md:p-5">
              <motion.div initial={{ scale: 0.98, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }} className="flex min-h-0 flex-1 flex-col">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Agent call graph</p>
                    <p className="truncate font-semibold">Run <span className="font-mono text-sm">{trace.run_id}</span> · {trace.mode === 'llm' ? trace.model : 'Offline deterministic'}</p></div>
                  <Button size="sm" variant="outline" onClick={() => setExpanded(false)} aria-label="Close full screen"><X size={15} aria-hidden="true" />Close</Button>
                </div>
                {workspace}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

// ------------------------------------------------------------------ workspace: toolbar, canvas, timeline, legend, details
interface ReplayCtl { k: number | null; playing: boolean; events: Ev[]; setPlaying: (p: boolean | ((p: boolean) => boolean)) => void; restart: () => void; jump: (i: number) => void }

function useWide() {
  const q = '(min-width: 1280px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(q)
    if (!mq) return
    const on = (e: MediaQueryListEvent) => setWide(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

function Workspace({ expanded, onToggle, trace, terminal, replay, details, children, nodes, statuses, focus, picks }: {
  expanded: boolean; onToggle: () => void; trace: Trace; terminal: boolean; replay: ReplayCtl; details: ReactNode; children: ReactNode
  nodes: GNode[]; statuses: Record<string, Status>; focus?: GNode; picks: number
}) {
  const wide = useWide()
  const drawer = expanded && !wide  // full screen on a narrower screen: details slide over the canvas
  const [detailsOpen, setDetailsOpen] = useState(!drawer)
  useEffect(() => { setDetailsOpen(!drawer) }, [drawer])
  useEffect(() => { if (picks && drawer) setDetailsOpen(true) }, [picks, drawer])
  const sideColumn = !expanded || (wide && detailsOpen)
  const reduce = useReducedMotionConfig()
  const { box, size, view, dragging, fit, reset, follow, centerOn, zoomAt, actual, handlers } = usePanZoom(reduce)
  useEffect(() => { follow(focus) }, [focus?.id, follow])
  const lanes = useMemo(() => buildGraph(trace).lanes, [trace])
  const clipped = size.w > 0 && (view.x < -2 || view.y < -2 || view.x + W * view.s > size.w + 2 || view.y + H * view.s > size.h + 2)
  const { k, playing, events } = replay
  const replaying = k !== null
  const tool = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-ink transition-colors hover:bg-ice disabled:opacity-40'
  return (
    <div className={expanded ? 'flex min-h-0 flex-1 flex-col' : '@container'}>
      <div className={expanded ? `grid min-h-0 flex-1 gap-4 ${sideColumn ? 'grid-cols-[minmax(0,1fr)_360px]' : ''}` : 'grid gap-4 @min-[1440px]:grid-cols-[minmax(0,1fr)_340px]'}>
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {/* toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              {!terminal ? <Badge tone="brand"><span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />Live</Badge>
                : replaying ? <Badge tone="brand">Replay {k! + 1}/{events.length}</Badge> : <Badge tone="ok">Final state</Badge>}
            </div>
            {terminal && events.length > 0 && (
              <div className="flex items-center gap-1">
                <button type="button" className={tool} onClick={() => (replaying ? replay.setPlaying(p => !p) : replay.restart())} aria-label={replaying && playing ? 'Pause replay' : 'Play replay'} title={replaying && playing ? 'Pause' : 'Play'}>
                  {replaying && playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
                </button>
                <button type="button" className={tool} onClick={replay.restart} aria-label="Replay from the start" title="Replay from the start"><RotateCcw size={15} aria-hidden="true" /></button>
              </div>
            )}
            <div className="ml-auto flex items-center gap-0.5 rounded-xl border border-line bg-surface p-0.5" role="group" aria-label="Zoom">
              <button type="button" className={tool} onClick={() => zoomAt(1 / 1.25)} disabled={view.s <= MIN_S + 0.001} aria-label="Zoom out" title="Zoom out (−)"><Minus size={15} aria-hidden="true" /></button>
              <button type="button" className={`${tool} tabular w-14 text-xs font-semibold`} onClick={actual} aria-label={`Zoom ${Math.round(view.s * 100)}%. Reset to 100%`} title="Reset to 100%">{Math.round(view.s * 100)}%</button>
              <button type="button" className={tool} onClick={() => zoomAt(1.25)} disabled={view.s >= MAX_S - 0.001} aria-label="Zoom in" title="Zoom in (+)"><Plus size={15} aria-hidden="true" /></button>
              <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
              <button type="button" className={tool} onClick={fit} aria-label="Fit whole graph to view" title="Fit whole graph (0)"><Scan size={15} aria-hidden="true" /></button>
              <button type="button" className={tool} onClick={reset} aria-label="Reset to readable view" title="Reset view (R)"><LocateFixed size={15} aria-hidden="true" /></button>
              {expanded && (
                <button type="button" className={`${tool} ${detailsOpen ? 'bg-brand/15 text-brand-ink' : ''}`} onClick={() => setDetailsOpen(o => !o)} aria-pressed={detailsOpen}
                  aria-label={detailsOpen ? 'Hide details panel' : 'Show details panel'} title="Details panel"><PanelRight size={15} aria-hidden="true" /></button>
              )}
              <button type="button" className={tool} onClick={onToggle} aria-label={expanded ? 'Exit full screen' : 'Open full screen'} title={expanded ? 'Exit full screen (Esc)' : 'Full screen'}>
                {expanded ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
              </button>
            </div>
          </div>

          {/* canvas */}
          <div ref={box} tabIndex={0} {...handlers} role="group" aria-roledescription="zoomable canvas" aria-label="Agent call graph. Drag to pan, plus and minus keys to zoom, 0 to fit, arrow keys to move."
            className={`relative touch-pan-y select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-brand ${dragging ? 'cursor-grabbing' : 'cursor-grab'} ${expanded ? 'min-h-0 flex-1' : 'h-[clamp(360px,58vh,600px)]'}`}
            style={{ backgroundColor: 'var(--ice)', backgroundImage: 'radial-gradient(color-mix(in oklab, var(--muted) 35%, transparent) 1px, transparent 1.2px)',
              backgroundSize: `${22 * view.s}px ${22 * view.s}px`, backgroundPosition: `${view.x}px ${view.y}px` }}>
            <svg className="absolute inset-0 h-full w-full" role="group" aria-label="Agents, tools and data flow">
              <defs>
                <marker id="ag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--muted)' }} /></marker>
                <marker id="ag-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--brand)' }} /></marker>
              </defs>
              <g transform={`translate(${view.x} ${view.y}) scale(${view.s})`}>
                {lanes.map(l => <Lane key={l.label} {...l} />)}
                {children}
              </g>
            </svg>
            <p className="pointer-events-none absolute bottom-2 left-3 hidden rounded-md bg-surface/85 px-2 py-1 text-[11px] text-muted shadow-card sm:block">Drag to pan · Ctrl/⌘ + scroll or pinch to zoom · 0 fit · R reset</p>
            <AnimatePresence>{clipped && !(drawer && detailsOpen) && <Minimap nodes={nodes} statuses={statuses} view={view} size={size} onJump={centerOn} />}</AnimatePresence>
            <AnimatePresence>
              {drawer && detailsOpen && (
                <motion.div key="drawer" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.22 }}
                  onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}
                  className="scrollbar-thin absolute inset-y-2 right-2 z-10 w-[min(360px,calc(100%-1rem))] cursor-auto overflow-y-auto rounded-2xl">
                  {details}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* replay timeline */}
          {terminal && events.length > 0 && (
            <div className="border-t border-line px-3 pt-2.5">
              <div className="flex gap-1" role="group" aria-label="Replay timeline">
                {events.map((e, i) => {
                  const done = !replaying || i <= k!
                  return (
                    <button key={i} type="button" onClick={() => replay.jump(i)} aria-label={`Step ${i + 1}: ${e.text}`} title={e.text}
                      className={`h-3 flex-1 rounded-full transition-colors ${done ? (e.type === 'tool' ? 'bg-brand/70' : 'bg-brand') : 'bg-line hover:bg-brand/40'} ${replaying && i === k ? 'ring-2 ring-brand/40 ring-offset-1 ring-offset-surface' : ''}`} />
                  )
                })}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5">
            <div className="min-w-0 flex-1" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p key={replaying ? k : 'final'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
                  className="truncate font-mono text-xs text-muted">
                  {replaying ? <><span className="text-brand-ink">▶ {k! + 1}.</span> {events[k!].text}</> : trace.summary ?? (terminal ? 'Run finished.' : 'Waiting for the agents…')}
                </motion.p>
              </AnimatePresence>
            </div>
            <Legend />
          </div>
        </div>
        {sideColumn && <div className={expanded ? 'scrollbar-thin min-h-0 overflow-y-auto' : ''}>{details}</div>}
      </div>
    </div>
  )
}

/** Overview of the whole graph with the visible area outlined; click or drag on it to move the view. */
function Minimap({ nodes, statuses, view, size, onJump }: { nodes: GNode[]; statuses: Record<string, Status>; view: View; size: { w: number; h: number }; onJump: (gx: number, gy: number) => void }) {
  const mw = 200, mh = Math.round((mw * H) / W), k = mw / W
  const vx = (-view.x / view.s) * k, vy = (-view.y / view.s) * k, vw = (size.w / view.s) * k, vh = (size.h / view.s) * k
  const jump = (e: RPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onJump(((e.clientX - r.left) / mw) * W, ((e.clientY - r.top) / mh) * H)
  }
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.18 }}
      className="absolute bottom-2 right-2 overflow-hidden rounded-xl border border-line bg-surface/95 shadow-card" onPointerDown={e => e.stopPropagation()}>
      <svg width={mw} height={mh} className="block cursor-pointer" role="img" aria-label="Minimap: click to move the view"
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); jump(e) }} onPointerMove={e => e.buttons === 1 && jump(e)}>
        {nodes.map(n => (
          <rect key={n.id} x={n.x * k} y={n.y * k} width={Math.max(2, n.w * k)} height={Math.max(2, n.h * k)} rx={2}
            style={{ fill: statuses[n.id] === 'Pending' || statuses[n.id] === 'Skipped' ? 'var(--line)' : statuses[n.id] === 'Running' ? 'var(--brand)' : 'color-mix(in oklab, var(--brand) 55%, var(--surface))' }} />
        ))}
        <rect x={Math.max(0, vx)} y={Math.max(0, vy)} width={Math.min(mw, vw)} height={Math.min(mh, vh)} rx={3} fill="none" style={{ stroke: 'var(--ink)', strokeWidth: 1.5 }} />
      </svg>
    </motion.div>
  )
}

function Lane({ x, w, label }: { x: number; w: number; label: string }) {
  return (
    <g aria-hidden="true">
      <rect x={x} y={300} width={w} height={H - 312} rx={22} style={{ fill: 'var(--surface)', opacity: 0.55, stroke: 'var(--line)' }} strokeDasharray="6 6" />
      <text x={x + w / 2} y={H - 26} textAnchor="middle" fontSize={11} fontWeight={700} letterSpacing="0.12em" style={{ fill: 'var(--muted)' }}>{label}</text>
    </g>
  )
}

function Legend() {
  const dot = (bg: string, label: string, ring = false) => (
    <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${ring ? 'border-2 border-dashed border-line' : ''}`} style={{ background: ring ? 'transparent' : bg }} />{label}</span>
  )
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted" aria-label="Legend">
      {dot('var(--brand)', 'Running / done')}{dot('#d99a06', 'Needs review')}{dot('#d03b3b', 'Failed')}{dot('', 'Not used', true)}
      <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-brand" />Data</span>
      <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-brand" />LLM call</span>
    </div>
  )
}

function Edge({ e, a, b, state, reduce }: { e: GEdge; a?: GNode; b?: GNode; state: 'idle' | 'done' | 'active'; reduce: boolean }) {
  if (!a || !b) return null
  const d = edgePath(a, b, e.kind)
  const mid = e.kind === 'tool' ? { x: a.x + a.w / 2 + 14, y: (a.y + a.h + b.y) / 2 } : { x: (a.x + a.w + b.x) / 2, y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 - 16 }
  const lw = (e.label?.length ?? 0) * 7.6 + 20
  return (
    <g>
      <path d={d} fill="none" strokeWidth={e.kind === 'flow' ? 3 : 2.2} strokeLinecap="round" markerEnd={`url(#${state === 'idle' ? 'ag-arrow' : 'ag-arrow-on'})`}
        className={state === 'active' ? 'flow-edge' : ''} strokeDasharray={e.kind === 'llm' && state !== 'active' ? '5 7' : undefined}
        style={{ stroke: state === 'idle' ? 'var(--line)' : 'var(--brand)', opacity: state === 'done' ? 0.8 : 1, transition: 'stroke .4s, opacity .4s' }} />
      {state === 'active' && !reduce && <circle r={5.5} style={{ fill: 'var(--brand)' }}><animateMotion dur={e.kind === 'flow' ? '1.1s' : '0.8s'} repeatCount="indefinite" path={d} /></circle>}
      {e.label && (
        <g transform={`translate(${e.kind === 'tool' ? mid.x : mid.x - lw / 2} ${mid.y - 12})`}>
          <rect width={lw} height={24} rx={12} style={{ fill: 'var(--surface)', stroke: state === 'idle' ? 'var(--line)' : 'var(--brand)', transition: 'stroke .4s' }} />
          <text x={lw / 2} y={16.5} textAnchor="middle" fontSize={13} fontWeight={700} className="tabular" style={{ fill: state === 'idle' ? 'var(--muted)' : 'var(--brand-ink)' }}>{e.label}</text>
        </g>
      )}
    </g>
  )
}

function Node({ n, status, selected, onSelect, delay, run }: { n: GNode; status: Status; selected: boolean; onSelect: () => void; delay: number; run?: AgentRun }) {
  const Icon = n.kind === 'agent' ? Bot : n.kind === 'llm' ? BrainCircuit : n.kind === 'tool' ? Wrench : n.id === 'in' ? FileText : Flag
  const r = n.kind === 'tool' ? 14 : 18
  const dim = status === 'Pending' || status === 'Skipped'
  const call = run?.tools.find(t => t.name === n.tool)
  const cy = n.y + n.h / 2
  return (
    <motion.g initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: dim ? 0.6 : 1, scale: 1 }} transition={{ delay, duration: 0.35 }}
      style={{ transformBox: 'fill-box', transformOrigin: 'center', cursor: 'pointer' }} tabIndex={0} role="button" className="outline-none"
      aria-label={`${n.label}${n.kind === 'tool' && n.sub ? ` (${n.sub})` : ''}: ${status}`} aria-pressed={selected}
      onClick={e => { e.stopPropagation(); onSelect() }}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}>
      {status === 'Running' && <rect className="pulse-ring" x={n.x - 5} y={n.y - 5} width={n.w + 10} height={n.h + 10} rx={r + 5} fill="none" style={{ stroke: 'var(--brand)', strokeWidth: 2.5 }} />}
      {selected && <rect x={n.x - 6} y={n.y - 6} width={n.w + 12} height={n.h + 12} rx={r + 6} fill="none" style={{ stroke: 'var(--ink)', strokeWidth: 1.5, opacity: 0.35 }} strokeDasharray="4 4" />}
      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={r} strokeDasharray={n.kind === 'io' || status === 'Skipped' ? '6 5' : undefined}
        style={{ fill: status === 'Running' ? 'color-mix(in oklab, var(--brand) 10%, var(--surface))' : 'var(--surface)', stroke: selected ? 'var(--ink)' : STROKE[status],
          strokeWidth: selected ? 2.5 : n.kind === 'agent' ? 2.2 : 1.6, transition: 'stroke .35s, fill .35s',
          filter: n.kind === 'agent' || n.kind === 'llm' ? 'drop-shadow(0 8px 18px rgba(0,0,0,.10))' : undefined }} />
      {n.kind === 'agent' && run ? (
        <>
          <circle cx={n.x + 32} cy={cy} r={20} style={{ fill: dim ? 'var(--ice)' : 'color-mix(in oklab, var(--brand) 18%, var(--surface))' }} />
          <Icon x={n.x + 21} y={cy - 11} width={22} height={22} style={{ color: 'var(--brand-ink)' }} aria-hidden="true" />
          <text x={n.x + 62} y={n.y + 33} fontSize={17} fontWeight={700} style={{ fill: 'var(--ink)' }}>{fit(n.label, n.w - 80, 17, 700)}</text>
          <circle cx={n.x + 66} cy={n.y + 55} r={4.5} style={{ fill: STROKE[status] }} />
          <text x={n.x + 77} y={n.y + 60} fontSize={14} fontWeight={600} style={{ fill: 'var(--ink)' }}>{status === 'Skipped' ? 'Not used' : status}</text>
          <text x={n.x + 62} y={n.y + 85} fontSize={13} className="tabular" style={{ fill: 'var(--muted)' }}>
            {[run.duration_ms != null && status !== 'Pending' && status !== 'Running' ? `${(run.duration_ms / 1000).toFixed(2)}s` : null,
              run.total_tokens ? `${fmt.n(run.total_tokens)} tok` : 'no tokens', `${run.tools.length} tool${run.tools.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
          </text>
        </>
      ) : n.kind === 'llm' ? (
        <>
          <circle cx={n.x + 32} cy={cy} r={20} style={{ fill: dim ? 'var(--ice)' : 'color-mix(in oklab, var(--brand) 18%, var(--surface))' }} />
          <Icon x={n.x + 21} y={cy - 11} width={22} height={22} style={{ color: 'var(--brand-ink)' }} aria-hidden="true" />
          <text x={n.x + 62} y={cy - 4} fontSize={15.5} fontWeight={700} style={{ fill: 'var(--ink)' }}>{fit(n.label, n.w - 80, 15.5, 700)}</text>
          <text x={n.x + 62} y={cy + 17} fontSize={13} style={{ fill: 'var(--muted)' }}>{fit(n.sub ?? '', n.w - 80, 13)}</text>
        </>
      ) : (
        <>
          <Icon x={n.x + 14} y={cy - 9} width={18} height={18} style={{ color: dim ? 'var(--muted)' : 'var(--brand-ink)' }} aria-hidden="true" />
          {(() => {
            const time = call && status === 'Completed' ? dur(call.duration_ms) : null
            const timeW = time ? time.length * 6.6 + 10 : 0
            return (
              <>
                <text x={n.x + 40} y={n.sub ? cy - 4 : cy + 5} fontSize={14.5} fontWeight={650} style={{ fill: 'var(--ink)' }}>{fit(n.label, n.w - 40 - 16, 14.5, 650)}</text>
                {n.sub && <text x={n.x + 40} y={cy + 15} fontSize={11.5} style={{ fill: 'var(--muted)', fontFamily: n.kind === 'tool' ? MONO : SANS }}>{fit(n.sub, n.w - 40 - 12 - timeW, 11.5, 400, n.kind === 'tool' ? MONO : SANS)}</text>}
                {time && <text x={n.x + n.w - 12} y={cy + 15} textAnchor="end" fontSize={11} className="tabular" style={{ fill: 'var(--muted)' }}>{time}</text>}
              </>
            )
          })()}
        </>
      )}
      {(status === 'Completed' || status === 'Failed') && (
        <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          <circle cx={n.x + n.w - 2} cy={n.y + 2} r={11} style={{ fill: status === 'Failed' ? '#d03b3b' : 'var(--brand)', stroke: 'var(--surface)', strokeWidth: 2.5 }} />
          {status === 'Failed'
            ? <path d={`M${n.x + n.w - 6},${n.y - 2} l8,8 M${n.x + n.w + 2},${n.y - 2} l-8,8`} stroke="#fff" strokeWidth={2} strokeLinecap="round" />
            : <path d={`M${n.x + n.w - 7},${n.y + 2} l3.5,3.5 l6,-7`} fill="none" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--on-brand)' }} />}
        </motion.g>
      )}
      {status === 'Needs Review' && <circle cx={n.x + n.w - 2} cy={n.y + 2} r={10} style={{ fill: '#d99a06', stroke: 'var(--surface)', strokeWidth: 2.5 }} />}
    </motion.g>
  )
}

function Json({ value }: { value: unknown }) {
  return <pre className="scrollbar-thin mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-ice p-2.5 font-mono text-[11px] leading-relaxed">{JSON.stringify(value, null, 1)}</pre>
}

function Details({ node, status, trace, run }: { node: GNode; status: Status; trace: Trace; run?: AgentRun }) {
  const call = run?.tools.find(t => t.name === node.tool)
  return (
    <AnimatePresence mode="wait">
      <motion.aside key={node.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }}
        className="shadow-card min-w-0 rounded-2xl border border-line bg-surface p-5 text-sm" aria-label={`${node.label} details`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{node.kind === 'agent' ? 'Agent' : node.kind === 'tool' ? 'Tool call' : node.kind === 'llm' ? 'Language model' : 'Data'}</p>
            <h3 className="mt-0.5 break-words text-base font-semibold">{node.kind === 'agent' && run ? run.name : node.label}</h3>
          </div>
          {status !== 'Skipped' ? <StatusPill status={status} /> : <Badge>Not used</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted">Select any node in the graph to inspect it.</p>

        {node.kind === 'agent' && run && (
          <div className="mt-4 space-y-3">
            <p className="text-muted">{run.role}</p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {[['Duration', run.duration_ms != null ? `${(run.duration_ms / 1000).toFixed(2)}s` : '—'], ['LLM calls', String(run.llm_calls)],
                ['Input tokens', fmt.n(run.input_tokens)], ['Output tokens', fmt.n(run.output_tokens)], ['Tool calls', String(run.tools.length)], ['Retries', String(run.retries)]].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-ice p-2.5"><dt className="text-muted">{l}</dt><dd className="tabular text-base font-semibold">{v}</dd></div>
              ))}
            </dl>
            {run.llm_calls > 0 && <Badge tone={run.token_source === 'actual' ? 'ok' : 'warn'}>Tokens {run.token_source}</Badge>}
            {run.output_summary && <p className="rounded-xl border border-line p-3 text-xs leading-relaxed">{run.output_summary}</p>}
            {run.errors.length > 0 && <ul role="alert" className="space-y-1 rounded-xl bg-red-50 p-3 text-xs text-red-900 dark:bg-red-400/10 dark:text-red-200">{run.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          </div>
        )}

        {node.kind === 'tool' && (
          call ? (
            <div className="mt-4 space-y-3 text-xs">
              <p className="font-mono text-muted">{call.name} · {call.duration_ms}ms · {new Date(call.at).toLocaleTimeString('en-GB')}</p>
              {call.error && <p className="flex items-center gap-1 text-red-700 dark:text-red-300"><CircleX size={13} aria-hidden="true" />{call.error}</p>}
              <div><p className="font-semibold">Input</p><Json value={call.input} /></div>
              <div><p className="font-semibold">Output</p><Json value={call.output} /></div>
              {node.agent === COORD && <p className="flex items-center gap-1 text-muted"><CircleCheck size={13} aria-hidden="true" />Pure Python function; no LLM involved.</p>}
            </div>
          ) : <p className="mt-4 text-xs text-muted">{status === 'Skipped' ? 'Not called in this run (for example, the brief came from the structured form).' : 'Not called yet.'}</p>
        )}

        {node.kind === 'llm' && (
          <div className="mt-4 space-y-2 text-xs">
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
          <p className="mt-4 text-xs text-muted">{node.id === 'in' ? 'The marketer’s product choice and natural-language request, reviewed before launch.' : trace.summary ?? 'Ranked shortlist with explanations; open the Results tab for the full list.'}</p>
        )}
      </motion.aside>
    </AnimatePresence>
  )
}
