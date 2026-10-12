import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Table2 } from 'lucide-react'
import type { Analytics, InventorySummary } from '../api'
import { CRITERIA_LABELS, fmt } from '../api'
import { EmptyState } from '../shared/ui'

// Colours come from CSS variables (index.css) so every chart switches with the theme. The categorical order
// below was validated for colour-vision-deficiency separation in both themes; colour follows the criterion,
// never its rank.
const SERIES: Record<string, string> = {
  audience_fit: 'var(--series-1)', content_fit: 'var(--series-2)', engagement: 'var(--series-3)', promo_views: 'var(--series-4)',
  collaboration: 'var(--series-5)', brand_affinity: 'var(--series-6)', region: 'var(--series-7)',
}
const CRITERIA = Object.keys(SERIES)
const ORD = ['var(--ord-1)', 'var(--ord-2)', 'var(--ord-3)', 'var(--ord-4)']
const ease = [0.22, 1, 0.36, 1] as const

function useWidth<T extends HTMLElement>(min = 260) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(560)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(e => setW(Math.max(min, Math.floor(e[0].contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [min])
  return [ref, w] as const
}

/** Bar path with a 4px rounded data end and a square baseline. */
function barPath(x: number, y: number, w: number, h: number, dir: 'right' | 'up', r = 4): string {
  if (w <= 0 || h <= 0) return ''
  if (dir === 'right') {
    const rr = Math.min(r, w, h / 2)
    return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`
  }
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

// ------------------------------------------------------------------ tooltip (React nodes, never innerHTML)
interface Tip { x: number; y: number; content: ReactNode }
function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null
  const left = Math.min(Math.max(tip.x, 90), width - 90)
  return (
    <div role="tooltip" className="shadow-pop pointer-events-none absolute z-20 min-w-36 max-w-64 rounded-xl border border-line bg-raised px-3 py-2 text-xs leading-relaxed text-ink"
      style={{ left, top: tip.y, transform: 'translate(-50%, calc(-100% - 10px))' }}>{tip.content}</div>
  )
}
const TipRow = ({ color, label, value, strong = false }: { color?: string; label: string; value: string; strong?: boolean }) => (
  <div className="flex items-center gap-2">
    {color && <span className="h-0.5 w-3 shrink-0 rounded" style={{ background: color }} />}
    <span className={`tabular ${strong ? 'font-bold' : 'font-semibold'}`}>{value}</span>
    <span className="text-muted">{label}</span>
  </div>
)

// ------------------------------------------------------------------ frame with chart/table toggle
export interface TableSpec { columns: string[]; rows: (string | number)[][]; caption: string }
export function ChartFrame({ title, subtitle, legend, table, children, action }: {
  title: string; subtitle?: string; legend?: ReactNode; table?: TableSpec; children: ReactNode; action?: ReactNode
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <section className="shadow-card min-w-0 rounded-2xl border border-line bg-surface p-5" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="text-base font-semibold">{title}</h2>{subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}</div>
        <div className="flex items-center gap-2">
          {action}
          {table && (
            <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label={`${title} view`}>
              {(['chart', 'table'] as const).map(v => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} aria-label={v === 'chart' ? 'Show chart' : 'Show table'}
                  className={`rounded-md p-1.5 transition-colors ${view === v ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'}`}>
                  {v === 'chart' ? <BarChart3 size={14} aria-hidden="true" /> : <Table2 size={14} aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {legend && view === 'chart' && <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">{legend}</div>}
      {view === 'chart' || !table ? children : (
        <div className="scrollbar-thin max-h-96 overflow-auto rounded-xl border border-line">
          <table className="dense w-full">
            <caption className="sr-only">{table.caption}</caption>
            <thead className="sticky top-0 bg-surface"><tr>{table.columns.map((c, i) => <th key={c} scope="col" className={i ? 'num' : ''}>{c}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0 ? <th key={j} scope="row" className="font-medium">{c}</th> : <td key={j} className="num">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export const Swatch = ({ color, label, shape = 'rect' }: { color: string; label: string; shape?: 'rect' | 'dot' | 'tick' }) => (
  <span className="inline-flex items-center gap-1.5">
    <span aria-hidden="true" className={shape === 'dot' ? 'h-2.5 w-2.5 rounded-full' : shape === 'tick' ? 'h-3 w-[3px] rounded-sm' : 'h-2.5 w-2.5 rounded-[3px]'} style={{ background: color }} />
    {label}
  </span>
)

// ------------------------------------------------------------------ 1. matching funnel (ordinal ramp)
export function FunnelChart({ data, compact: compactProp = false }: { data: Analytics['funnel']; compact?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  if (!data.length || data[0].count === 0) return <EmptyState title="No funnel data yet" hint="Run a campaign to see how many creators pass each stage." />
  const compact = compactProp || w < 460  // labels move above the bars when there is no room beside them
  const labelW = compact ? 0 : Math.min(150, w * 0.3)
  const valueW = 92, rowH = compact ? 50 : 54, barH = 22
  const plotW = Math.max(40, w - labelW - valueW)
  const x = d3.scaleLinear().domain([0, data[0].count]).range([0, plotW])
  const h = data.length * rowH
  return (
    <div ref={ref} className="relative w-full min-w-0" onMouseLeave={() => setTip(null)}>
      <svg width={w} height={h} role="img" aria-label={`Matching funnel: ${data.map(d => `${d.stage} ${d.count}`).join(', ')}`}>
        {data.map((d, i) => {
          const y = i * rowH + (compact ? 18 : 8)
          const bw = Math.max(3, x(d.count))
          const drop = i > 0 ? data[i - 1].count - d.count : 0
          const show = () => setTip({ x: labelW + bw / 2, y, content: <><TipRow value={fmt.n(d.count)} label={d.stage} strong /><TipRow value={`${d.pct}%`} label="of evaluated creators" />{i > 0 && <TipRow value={fmt.n(drop)} label="removed at this stage" />}</> })
          return (
            <g key={d.stage} tabIndex={0} onMouseEnter={show} onFocus={show} onBlur={() => setTip(null)} className="outline-none">
              {compact
                ? <text x={0} y={y - 6} fontSize={12} fontWeight={600} style={{ fill: 'var(--ink)' }}>{d.stage}</text>
                : <text x={labelW - 12} y={y + barH / 2} textAnchor="end" dominantBaseline="middle" fontSize={13} fontWeight={600} style={{ fill: 'var(--ink)' }}>{d.stage}</text>}
              <rect x={labelW} y={y} width={plotW} height={barH} rx={4} style={{ fill: 'var(--ice)' }} />
              <motion.g initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.7, delay: i * 0.12, ease }} style={{ originX: 0, transformBox: 'fill-box' }}>
                <path d={barPath(labelW, y, bw, barH, 'right')} style={{ fill: ORD[Math.min(i, ORD.length - 1)] }} />
              </motion.g>
              <text x={labelW + plotW + 10} y={y + barH / 2} dominantBaseline="middle" fontSize={13} className="tabular">
                <tspan fontWeight={700} style={{ fill: 'var(--ink)' }}>{fmt.n(d.count)}</tspan>
                <tspan dx={5} fontSize={11} style={{ fill: 'var(--muted)' }}>{d.pct}%</tspan>
              </text>
              {i > 0 && drop > 0 && !compact && <text x={labelW} y={y + barH + 13} fontSize={11} style={{ fill: 'var(--muted)' }}>−{fmt.n(drop)} at this stage</text>}
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} width={w} />
    </div>
  )
}
export const funnelTable = (data: Analytics['funnel']): TableSpec => ({
  caption: 'Matching funnel', columns: ['Stage', 'Creators', '% of evaluated', 'Removed'],
  rows: data.map((d, i) => [d.stage, fmt.n(d.count), `${d.pct}%`, i ? fmt.n(data[i - 1].count - d.count) : '—']),
})

// ------------------------------------------------------------------ 2. audience age alignment (bullet rows)
export function AlignmentChart({ data }: { data: Analytics['demographics'] }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  const segs = data.segments
  const labelW = 74, valueW = 52, rowH = 40, barH = 16
  const plotW = Math.max(60, w - labelW - valueW)
  const max = Math.max(10, d3.max(segs, s => Math.max(data.target[s] ?? 0, data.shortlist_average[s] ?? 0))!)
  const x = d3.scaleLinear().domain([0, Math.ceil(max / 10) * 10]).range([0, plotW])
  const h = segs.length * rowH + 22
  return (
    <div ref={ref} className="relative w-full min-w-0" onMouseLeave={() => setTip(null)}>
      <svg width={w} height={h} role="img" aria-label="Audience age alignment: shortlist average audience share versus target share for each age segment">
        {x.ticks(4).map(t => (
          <g key={t}>
            <line x1={labelW + x(t)} x2={labelW + x(t)} y1={0} y2={h - 22} style={{ stroke: 'var(--chart-grid)' }} />
            <text x={labelW + x(t)} y={h - 6} textAnchor="middle" fontSize={11} className="tabular" style={{ fill: 'var(--muted)' }}>{t}%</text>
          </g>
        ))}
        {segs.map((s, i) => {
          const tv = data.target[s] ?? 0, av = data.shortlist_average[s] ?? 0
          const y = i * rowH + (rowH - barH) / 2
          const isTarget = tv > 0
          const show = () => setTip({ x: labelW + x(Math.max(av, tv)) / 2, y, content: <><p className="mb-1 font-semibold">Age {s}</p><TipRow color="var(--series-1)" value={`${av.toFixed(1)}%`} label="shortlist audience" strong /><TipRow color="var(--series-2)" value={`${tv.toFixed(1)}%`} label="target share" /></> })
          return (
            <g key={s} tabIndex={0} onMouseEnter={show} onFocus={show} onBlur={() => setTip(null)} className="outline-none">
              <rect x={0} y={i * rowH} width={w} height={rowH} fill="transparent" />
              <text x={labelW - 10} y={y + barH / 2} textAnchor="end" dominantBaseline="middle" fontSize={12} fontWeight={isTarget ? 700 : 500} style={{ fill: isTarget ? 'var(--ink)' : 'var(--muted)' }}>{s}</text>
              <motion.g initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, delay: i * 0.07, ease }} style={{ originX: 0, transformBox: 'fill-box' }}>
                <path d={barPath(labelW, y, Math.max(av > 0 ? 3 : 0, x(av)), barH, 'right')} style={{ fill: 'var(--series-1)', opacity: isTarget ? 1 : 0.55 }} />
              </motion.g>
              {tv > 0 && <motion.rect initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + i * 0.07 }} x={labelW + x(tv) - 1.5} y={y - 5} width={3} height={barH + 10} rx={1.5} style={{ fill: 'var(--series-2)' }} />}
              <text x={labelW + plotW + 8} y={y + barH / 2} dominantBaseline="middle" fontSize={12} fontWeight={isTarget ? 700 : 500} className="tabular" style={{ fill: isTarget ? 'var(--ink)' : 'var(--muted)' }}>{av.toFixed(0)}%</text>
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} width={w} />
    </div>
  )
}
export const alignmentLegend = <><Swatch color="var(--series-1)" label="Shortlist (top 10) average audience" /><Swatch color="var(--series-2)" shape="tick" label="Target share (even split over chosen segments)" /></>
export const alignmentTable = (d: Analytics['demographics']): TableSpec => ({
  caption: 'Audience age alignment', columns: ['Age segment', 'Target %', 'Shortlist %', 'Gap (pts)'],
  rows: d.segments.map(s => [s, (d.target[s] ?? 0).toFixed(1), (d.shortlist_average[s] ?? 0).toFixed(1), ((d.shortlist_average[s] ?? 0) - (d.target[s] ?? 0)).toFixed(1)]),
})

// ------------------------------------------------------------------ 3. score breakdown, top 10 (stacked, 2px gaps)
export function BreakdownChart({ data, onSelect }: { data: Analytics['breakdown']; onSelect: (id: string) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  const [hover, setHover] = useState<{ row: string; key: string | null } | null>(null)
  const rows = data.slice(0, 10)
  if (!rows.length) return <EmptyState title="No ranked creators" hint="Relax the thresholds to see a score breakdown." />
  const labelW = Math.min(170, Math.max(110, w * 0.3)), valueW = 40, rowH = 34, barH = 20, gap = 2
  const plotW = Math.max(80, w - labelW - valueW)
  const xmax = Math.max(60, Math.ceil(d3.max(rows, r => r.overall)! / 10) * 10)
  const x = d3.scaleLinear().domain([0, xmax]).range([0, plotW])
  const h = rows.length * rowH + 22
  const clip = (s: string) => (s.length * 7 > labelW - 34 ? `${s.slice(0, Math.max(6, Math.floor((labelW - 40) / 7)))}…` : s)
  const rowTip = (r: (typeof rows)[number], focus: string | null, tx: number, ty: number) => setTip({
    x: tx, y: ty, content: (
      <>
        <p className="mb-1 font-semibold">#{r.rank} {r.name} · <span className="tabular">{r.overall.toFixed(1)}</span></p>
        {CRITERIA.map(k => <div key={k} className={focus && focus !== k ? 'opacity-55' : ''}><TipRow color={SERIES[k]} value={`+${(r.contributions[k] ?? 0).toFixed(1)}`} label={CRITERIA_LABELS[k]} strong={focus === k} /></div>)}
      </>
    ),
  })
  return (
    <div ref={ref} className="relative w-full min-w-0" onMouseLeave={() => { setTip(null); setHover(null) }}>
      <svg width={w} height={h} role="img" aria-label="Stacked bars of each shortlisted creator's weighted score contributions">
        {x.ticks(5).map(t => (
          <g key={t}>
            <line x1={labelW + x(t)} x2={labelW + x(t)} y1={0} y2={h - 22} style={{ stroke: 'var(--chart-grid)' }} />
            <text x={labelW + x(t)} y={h - 6} textAnchor="middle" fontSize={11} className="tabular" style={{ fill: 'var(--muted)' }}>{t}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          let acc = 0
          const y = i * rowH + (rowH - barH) / 2
          const dim = hover && hover.row !== r.influencer_id
          return (
            <g key={r.influencer_id} tabIndex={0} role="button" aria-label={`#${r.rank} ${r.name}, overall ${r.overall.toFixed(1)}. Open profile`}
              style={{ cursor: 'pointer', opacity: dim ? 0.45 : 1, transition: 'opacity .2s' }} className="outline-none"
              onClick={() => onSelect(r.influencer_id)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(r.influencer_id))}
              onFocus={() => { setHover({ row: r.influencer_id, key: null }); rowTip(r, null, labelW + x(r.overall) / 2, y) }} onBlur={() => { setTip(null); setHover(null) }}>
              <rect x={0} y={i * rowH} width={w} height={rowH} fill="transparent"
                onMouseEnter={() => { setHover({ row: r.influencer_id, key: null }); rowTip(r, null, labelW + x(r.overall) / 2, y) }} />
              <text x={labelW - 10} y={y + barH / 2} textAnchor="end" dominantBaseline="middle" fontSize={12} style={{ fill: 'var(--ink)' }}>
                <tspan fontWeight={700} style={{ fill: 'var(--muted)' }}>#{r.rank} </tspan>{clip(r.name)}
              </text>
              <motion.g initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.7, delay: 0.05 + i * 0.05, ease }} style={{ originX: 0, transformBox: 'fill-box' }}>
                {CRITERIA.map((k, j) => {
                  const v = r.contributions[k] ?? 0
                  const x0 = labelW + x(acc)
                  acc += v
                  const width = Math.max(0, x(v) - (j < CRITERIA.length - 1 ? gap : 0))
                  const last = CRITERIA.slice(j + 1).every(n => (r.contributions[n] ?? 0) === 0)
                  return width > 0 && (
                    <path key={k} d={last ? barPath(x0, y, width, barH, 'right') : `M${x0},${y}h${width}v${barH}h${-width}Z`}
                      style={{ fill: SERIES[k], opacity: hover?.row === r.influencer_id && hover.key && hover.key !== k ? 0.4 : 1, transition: 'opacity .15s' }}
                      onMouseEnter={() => { setHover({ row: r.influencer_id, key: k }); rowTip(r, k, x0 + width / 2, y) }} />
                  )
                })}
              </motion.g>
              <text x={labelW + x(r.overall) + 8} y={y + barH / 2} dominantBaseline="middle" fontSize={12} fontWeight={700} className="tabular" style={{ fill: 'var(--ink)' }}>{r.overall.toFixed(0)}</text>
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} width={w} />
    </div>
  )
}
export const breakdownLegend = <>{CRITERIA.map(k => <Swatch key={k} color={SERIES[k]} label={CRITERIA_LABELS[k]} />)}</>
export const breakdownTable = (data: Analytics['breakdown']): TableSpec => ({
  caption: 'Weighted score contributions, top 10', columns: ['Creator', ...CRITERIA.map(k => CRITERIA_LABELS[k]), 'Overall'],
  rows: data.slice(0, 10).map(r => [`#${r.rank} ${r.name}`, ...CRITERIA.map(k => (r.contributions[k] ?? 0).toFixed(1)), r.overall.toFixed(1)]),
})

// ------------------------------------------------------------------ 4. audience fit vs promotional performance
export function ScatterChart({ data, onSelect }: { data: Analytics['scatter']; onSelect: (id: string) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const h = 380, m = { l: 52, r: 18, t: 16, b: 46 }
  const iw = w - m.l - m.r, ih = h - m.t - m.b
  const geo = useMemo(() => {
    if (!data.length) return null
    const x = d3.scaleLog().domain([Math.max(100, d3.min(data, d => d.views)! * 0.8), d3.max(data, d => d.views)! * 1.25]).range([0, iw]).clamp(true)
    const y = d3.scaleLinear().domain([Math.max(0, Math.floor((d3.min(data, d => d.match)! - 5) / 10) * 10), 100]).range([ih, 0])
    const r = d3.scaleSqrt().domain([0, d3.max(data, d => d.followers)!]).range([3, 11])
    const top = new Set(data.slice().sort((a, b) => a.rank - b.rank).slice(0, 5).map(d => d.influencer_id))
    const pts = data.map(d => ({ d, px: x(d.views), py: y(d.match), r: r(d.followers), top: top.has(d.influencer_id) }))
    const medianViews = d3.median(data, d => d.views)!
    return { x, y, pts, top, medianViews, delaunay: d3.Delaunay.from(pts, p => p.px, p => p.py) }
  }, [data, iw, ih])
  if (!geo) return <EmptyState title="No candidates to plot" hint="Relax the thresholds or change the audience requirements." />
  const { x, y, pts, medianViews, delaunay } = geo
  const show = (p: (typeof pts)[number]) => {
    setActive(p.d.influencer_id)
    setTip({ x: m.l + p.px, y: m.t + p.py - p.r, content: (
      <>
        <p className="mb-1 font-semibold">#{p.d.rank} {p.d.name}</p>
        <TipRow value={fmt.n(p.d.views)} label="median promo views" strong />
        <TipRow value={p.d.match.toFixed(0)} label="audience & product match" />
        <TipRow value={`${fmt.k(p.d.followers)}`} label={`followers · ${p.d.platform}`} />
        <TipRow value={p.d.overall.toFixed(0)} label="overall score" />
      </>
    ) })
  }
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - box.left, my = e.clientY - box.top
    const i = delaunay.find(mx, my)
    const p = pts[i]
    if (p && Math.hypot(p.px - mx, p.py - my) < 32) show(p)
    else { setTip(null); setActive(null) }
  }
  const zoneX = x(Math.max(medianViews, x.domain()[0])), zoneY = y(70)
  const labelled = pts.filter(p => p.top).sort((a, b) => a.d.rank - b.d.rank).slice(0, 3)
  const ordered = [...pts].sort((a, b) => Number(a.top) - Number(b.top) || b.r - a.r)
  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg width={w} height={h} role="img" aria-label="Scatter plot: median promotional views (log scale) against audience and product match; top 5 creators highlighted">
        <g transform={`translate(${m.l},${m.t})`}>
          <rect x={zoneX} y={0} width={Math.max(0, iw - zoneX)} height={Math.max(0, zoneY)} style={{ fill: 'var(--chart-zone)' }} rx={6} />
          {y.ticks(5).map(t => <g key={t}><line x1={0} x2={iw} y1={y(t)} y2={y(t)} style={{ stroke: 'var(--chart-grid)' }} /><text x={-8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} className="tabular" style={{ fill: 'var(--muted)' }}>{t}</text></g>)}
          {x.ticks(6).filter(t => t >= x.domain()[0] && t <= x.domain()[1] && [1, 2, 5].includes(+String(t)[0])).map(t => (
            <g key={t}><line x1={x(t)} x2={x(t)} y1={ih} y2={ih + 4} style={{ stroke: 'var(--chart-axis)' }} /><text x={x(t)} y={ih + 17} textAnchor="middle" fontSize={11} className="tabular" style={{ fill: 'var(--muted)' }}>{fmt.k(t)}</text></g>
          ))}
          <line x1={0} x2={iw} y1={ih} y2={ih} style={{ stroke: 'var(--chart-axis)' }} />
          <text x={iw / 2} y={ih + 38} textAnchor="middle" fontSize={12} style={{ fill: 'var(--muted)' }}>Median promotional-post views (log scale) →</text>
          <text transform={`translate(${-40},${ih / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} style={{ fill: 'var(--muted)' }}>Audience & product match →</text>
          {ordered.map((p, i) => (
            <motion.circle key={p.d.influencer_id} initial={{ opacity: 0, r: 0 }} animate={{ opacity: 1, r: p.top ? p.r + 1.5 : p.r }} transition={{ duration: 0.4, delay: Math.min(0.6, i * 0.002) }}
              cx={p.px} cy={p.py} style={{ fill: p.top ? 'var(--series-1)' : 'var(--chart-deemph)', fillOpacity: p.top ? 1 : 0.5, stroke: 'var(--surface)', strokeWidth: p.top ? 2 : 1 }} />
          ))}
          {active && (() => { const p = pts.find(q => q.d.influencer_id === active)!; return <circle cx={p.px} cy={p.py} r={p.r + 5} fill="none" style={{ stroke: 'var(--ink)', strokeWidth: 1.5 }} /> })()}
          {labelled.map(p => (
            <text key={p.d.influencer_id} x={p.px + p.r + 6} y={p.py} dominantBaseline="middle" fontSize={11} fontWeight={600} style={{ fill: 'var(--ink)', paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 3 }}>#{p.d.rank} {p.d.name.split(' ')[0]}</text>
          ))}
          <rect x={0} y={0} width={iw} height={ih} fill="transparent" style={{ cursor: active ? 'pointer' : 'default' }} onPointerMove={onMove}
            onPointerLeave={() => { setTip(null); setActive(null) }} onClick={() => active && onSelect(active)} />
          {pts.filter(p => p.top).map(p => (
            <circle key={`f-${p.d.influencer_id}`} cx={p.px} cy={p.py} r={12} fill="transparent" tabIndex={0} role="button" aria-label={`#${p.d.rank} ${p.d.name}: ${fmt.n(p.d.views)} views, match ${p.d.match.toFixed(0)}. Open profile`}
              className="outline-none" onFocus={() => show(p)} onBlur={() => { setTip(null); setActive(null) }} onKeyDown={e => e.key === 'Enter' && onSelect(p.d.influencer_id)}
              onClick={() => onSelect(p.d.influencer_id)} onPointerMove={() => show(p)} />
          ))}
        </g>
      </svg>
      <Tooltip tip={tip} width={w} />
    </div>
  )
}
export const scatterLegend = <><Swatch color="var(--series-1)" shape="dot" label="Top 5 by overall score" /><Swatch color="var(--chart-deemph)" shape="dot" label="Other ranked creators" /><Swatch color="var(--chart-zone)" label="Sweet spot: match ≥ 70 and above-median views" /><span>Bubble size = followers (not used for ranking)</span></>
export const scatterTable = (data: Analytics['scatter']): TableSpec => ({
  caption: 'Ranked creators: views and match', columns: ['Creator', 'Rank', 'Median promo views', 'Match', 'Followers', 'Overall'],
  rows: data.slice().sort((a, b) => a.rank - b.rank).slice(0, 40).map(d => [d.name, d.rank, fmt.n(d.views), d.match.toFixed(0), fmt.n(d.followers), d.overall.toFixed(1)]),
})

// ------------------------------------------------------------------ 5. revenue by day (single series columns)
export function RevenueChart({ daily }: { daily: InventorySummary['daily'] }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  const h = 230, m = { l: 48, r: 8, t: 22, b: 26 }
  const iw = w - m.l - m.r, ih = h - m.t - m.b
  const x = d3.scaleBand().domain(daily.map(d => d.date)).range([0, iw]).padding(0.28)
  const ymax = Math.max(50, d3.max(daily, d => d.revenue)!)
  const y = d3.scaleLinear().domain([0, ymax]).nice(4).range([ih, 0])
  const bw = Math.min(24, x.bandwidth())
  const peak = daily.reduce((a, b) => (b.revenue > a.revenue ? b : a), daily[0])
  const day = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return (
    <div ref={ref} className="relative w-full min-w-0" onMouseLeave={() => setTip(null)}>
      <svg width={w} height={h} role="img" aria-label="Revenue per day over the last 30 days">
        <g transform={`translate(${m.l},${m.t})`}>
          {y.ticks(4).map(t => <g key={t}><line x1={0} x2={iw} y1={y(t)} y2={y(t)} style={{ stroke: 'var(--chart-grid)' }} /><text x={-8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} className="tabular" style={{ fill: 'var(--muted)' }}>£{fmt.k(t)}</text></g>)}
          {daily.map((d, i) => {
            const bx = (x(d.date) ?? 0) + (x.bandwidth() - bw) / 2
            const show = () => setTip({ x: m.l + bx + bw / 2, y: m.t + y(d.revenue), content: <><p className="mb-1 font-semibold">{day(d.date)}</p><TipRow value={fmt.money(d.revenue)} label="revenue" strong /><TipRow value={String(d.orders)} label="orders" /></> })
            return (
              <g key={d.date} tabIndex={0} onMouseEnter={show} onFocus={show} onBlur={() => setTip(null)} className="outline-none">
                <rect x={x(d.date)} y={0} width={x.bandwidth()} height={ih} fill="transparent" />
                <motion.g initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.5, delay: i * 0.015, ease }} style={{ originY: 1, transformBox: 'fill-box' }}>
                  <path d={barPath(bx, y(d.revenue), bw, ih - y(d.revenue), 'up')} style={{ fill: 'var(--series-1)', opacity: d === peak ? 1 : 0.78 }} />
                </motion.g>
                {(i % 5 === 4 || i === daily.length - 1) && <text x={i === daily.length - 1 ? bx + bw : bx + bw / 2} y={ih + 17} textAnchor={i === daily.length - 1 ? 'end' : 'middle'} fontSize={11} style={{ fill: 'var(--muted)' }}>{day(d.date)}</text>}
              </g>
            )
          })}
          {peak.revenue > 0 && <text x={(x(peak.date) ?? 0) + x.bandwidth() / 2} y={y(peak.revenue) - 7} textAnchor="middle" fontSize={11} fontWeight={700} className="tabular" style={{ fill: 'var(--ink)' }}>{fmt.money(peak.revenue)}</text>}
          <line x1={0} x2={iw} y1={ih} y2={ih} style={{ stroke: 'var(--chart-axis)' }} />
        </g>
      </svg>
      <Tooltip tip={tip} width={w} />
    </div>
  )
}
export const revenueTable = (daily: InventorySummary['daily']): TableSpec => ({
  caption: 'Revenue per day', columns: ['Date', 'Revenue', 'Orders'], rows: [...daily].reverse().map(d => [d.date, fmt.money(d.revenue), d.orders]),
})

// ------------------------------------------------------------------ 6. units sold by category (single series bars)
export function CategoryBars({ data }: { data: InventorySummary['by_category'] }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const labelW = 104, valueW = 48, rowH = 34, barH = 18
  const plotW = Math.max(60, w - labelW - valueW)
  const x = d3.scaleLinear().domain([0, Math.max(1, d3.max(data, d => d.units_sold_30d)!)]).range([0, plotW])
  return (
    <div ref={ref} className="w-full min-w-0">
      <svg width={w} height={data.length * rowH} role="img" aria-label={`Units sold in the last 30 days by category: ${data.map(d => `${d.category} ${d.units_sold_30d}`).join(', ')}`}>
        {data.map((d, i) => {
          const y = i * rowH + (rowH - barH) / 2
          return (
            <g key={d.category}>
              <text x={labelW - 10} y={y + barH / 2} textAnchor="end" dominantBaseline="middle" fontSize={12} fontWeight={600} style={{ fill: 'var(--ink)' }}>{d.category}</text>
              <motion.g initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, delay: i * 0.07, ease }} style={{ originX: 0, transformBox: 'fill-box' }}>
                <path d={barPath(labelW, y, Math.max(3, x(d.units_sold_30d)), barH, 'right')} style={{ fill: 'var(--series-1)' }} />
              </motion.g>
              <text x={labelW + x(d.units_sold_30d) + 8} y={y + barH / 2} dominantBaseline="middle" fontSize={12} fontWeight={700} className="tabular" style={{ fill: 'var(--ink)' }}>{fmt.n(d.units_sold_30d)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
