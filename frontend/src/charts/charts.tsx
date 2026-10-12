import * as d3 from 'd3'
import { useEffect, useRef, useState } from 'react'
import type { Analytics } from '../api'
import { CRITERIA_LABELS, fmt } from '../api'
import { EmptyState } from '../shared/ui'

const BRAND = '#01ABDD'
const INK = '#111111'
const GRID = '#e3eaee'
// Cyan shades + neutrals only (brand palette). Ordered to match CRITERIA keys.
const SEG_COLORS: Record<string, string> = {
  audience_fit: '#01ABDD', content_fit: '#4cc6e8', engagement: '#8fdcf1', promo_views: '#111111',
  collaboration: '#5c6b73', brand_affinity: '#9aa8b0', region: '#d3dde2',
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(300)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(e => setW(Math.max(280, Math.floor(e[0].contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null)
  return { tip, show: (x: number, y: number, html: string) => setTip({ x, y, html }), hide: () => setTip(null) }
}

function Tip({ tip }: { tip: { x: number; y: number; html: string } | null }) {
  if (!tip) return null
  return (
    <div role="tooltip" className="pointer-events-none absolute z-10 max-w-60 rounded-lg bg-ink px-3 py-2 text-xs leading-relaxed text-white shadow-lg"
      style={{ left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - 10px))' }} dangerouslySetInnerHTML={{ __html: tip.html }} />
  )
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

// ------------------------------------------------------------------ Chart 1: matching funnel
export function FunnelChart({ data }: { data: Analytics['funnel'] }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const { tip, show, hide } = useTooltip()
  if (!data.length || data[0].count === 0) return <EmptyState title="No funnel data yet" hint="Run a campaign to see how many influencers pass each stage." />
  const h = 232, m = { l: 8, r: 8, t: 8, b: 8 }
  const iw = w - m.l - m.r, rowH = (h - m.t - m.b) / data.length
  const x = d3.scaleLinear().domain([0, data[0].count]).range([0, iw])
  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
      <svg width={w} height={h} role="img" aria-label={`Matching funnel: ${data.map(d => `${d.stage} ${d.count}`).join(', ')}`}>
        <g transform={`translate(${m.l},${m.t})`}>
          {data.map((d, i) => {
            const bw = Math.max(x(d.count), 4), y = i * rowH
            return (
              <g key={d.stage} tabIndex={0} onMouseEnter={e => show(e.nativeEvent.offsetX, y + m.t, `<b>${esc(d.stage)}</b><br/>${fmt.n(d.count)} influencers (${d.pct}% of retrieved)`)}
                onMouseLeave={hide} onFocus={() => show(m.l + bw / 2, y + m.t, `<b>${esc(d.stage)}</b><br/>${fmt.n(d.count)} (${d.pct}%)`)} onBlur={hide}>
                <rect x={(iw - bw) / 2} y={y + 4} width={bw} height={rowH - 10} rx={8} fill={i === data.length - 1 ? BRAND : '#cfeaf3'} />
                <text x={iw / 2} y={y + rowH / 2 + 1} textAnchor="middle" dominantBaseline="middle" fontSize={13} fontWeight={600} fill={INK}>
                  {d.stage} · {fmt.n(d.count)} <tspan fill="#33444c" fontWeight={500}>({d.pct}%)</tspan>
                </text>
              </g>
            )
          })}
        </g>
      </svg>
      <Tip tip={tip} />
    </div>
  )
}

// ------------------------------------------------------------------ Chart 2: stacked score breakdown
export function BreakdownChart({ data, onSelect }: { data: Analytics['breakdown']; onSelect: (id: string) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const { tip, show, hide } = useTooltip()
  const rows = data.slice(0, 10)
  if (!rows.length) return <EmptyState title="No ranked influencers" hint="Relax the thresholds to see a score breakdown." />
  const keys = Object.keys(SEG_COLORS)
  const rh = 30, m = { l: Math.min(150, w * 0.32), r: 44, t: 6, b: 6 }
  const h = rows.length * rh + m.t + m.b
  const x = d3.scaleLinear().domain([0, 100]).range([0, w - m.l - m.r])
  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
      <svg width={w} height={h} role="img" aria-label="Stacked bar chart of each shortlisted influencer's weighted score contributions">
        <g transform={`translate(${m.l},${m.t})`}>
          {[0, 25, 50, 75, 100].map(t => <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={h - m.t - m.b} stroke={GRID} />)}
          {rows.map((r, i) => {
            let acc = 0
            return (
              <g key={r.influencer_id} transform={`translate(0,${i * rh})`} tabIndex={0} role="button" aria-label={`Open ${r.name}, overall ${r.overall}`}
                style={{ cursor: 'pointer' }} onClick={() => onSelect(r.influencer_id)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect(r.influencer_id)}>
                <text x={-8} y={rh / 2} textAnchor="end" dominantBaseline="middle" fontSize={12} fill={INK}>#{r.rank} {r.name}</text>
                {keys.map(k => {
                  const v = r.contributions[k] ?? 0, x0 = x(acc)
                  acc += v
                  return <rect key={k} x={x0} y={4} width={Math.max(0, x(v))} height={rh - 8} fill={SEG_COLORS[k]} stroke="#fff" strokeWidth={0.5}
                    onMouseEnter={e => show(m.l + x0 + x(v) / 2, i * rh + m.t, `<b>${esc(r.name)}</b><br/>${CRITERIA_LABELS[k]}: +${v.toFixed(1)} pts<br/>Overall ${r.overall.toFixed(1)}`)} onMouseLeave={hide} />
                })}
                <text x={x(acc) + 6} y={rh / 2} dominantBaseline="middle" fontSize={12} fontWeight={600} fill={INK}>{r.overall.toFixed(0)}</text>
              </g>
            )
          })}
        </g>
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {keys.map(k => <span key={k} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-line" style={{ background: SEG_COLORS[k] }} />{CRITERIA_LABELS[k]}</span>)}
      </div>
      <Tip tip={tip} />
    </div>
  )
}

// ------------------------------------------------------------------ Chart 3: audience fit vs promo performance
export function ScatterChart({ data, onSelect }: { data: Analytics['scatter']; onSelect: (id: string) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const { tip, show, hide } = useTooltip()
  if (!data.length) return <EmptyState title="No candidates to plot" hint="Relax the thresholds or change the audience requirements." />
  const h = 340, m = { l: 48, r: 16, t: 12, b: 42 }
  const x = d3.scaleLog().domain([Math.max(100, d3.min(data, d => d.views)! * 0.8), d3.max(data, d => d.views)! * 1.2]).range([0, w - m.l - m.r]).clamp(true)
  const y = d3.scaleLinear().domain([0, 100]).range([h - m.t - m.b, 0])
  const r = d3.scaleSqrt().domain([0, d3.max(data, d => d.followers)!]).range([3, 18])
  const topIds = new Set(data.slice().sort((a, b) => a.rank - b.rank).slice(0, 5).map(d => d.influencer_id))
  const xt = x.ticks(5).filter(t => t >= x.domain()[0] && t <= x.domain()[1])
  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
      <svg width={w} height={h} role="img" aria-label="Bubble chart: median promotional views versus audience and content match, bubble size is follower count">
        <g transform={`translate(${m.l},${m.t})`}>
          {y.ticks(5).map(t => <g key={t}><line x1={0} x2={w - m.l - m.r} y1={y(t)} y2={y(t)} stroke={GRID} /><text x={-8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#5c6b73">{t}</text></g>)}
          {xt.map(t => <text key={t} x={x(t)} y={h - m.t - m.b + 16} textAnchor="middle" fontSize={11} fill="#5c6b73">{fmt.k(t)}</text>)}
          <text x={(w - m.l - m.r) / 2} y={h - m.t - 4} textAnchor="middle" fontSize={12} fill={INK}>Median promotional-post views (log scale)</text>
          <text transform={`translate(${-36},${(h - m.t - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill={INK}>Product/audience match</text>
          {data.slice().sort((a, b) => b.followers - a.followers).map(d => {
            const top = topIds.has(d.influencer_id)
            return (
              <circle key={d.influencer_id} cx={x(d.views)} cy={y(d.match)} r={r(d.followers)} fill={top ? BRAND : '#9aa8b0'} fillOpacity={top ? 0.85 : 0.35}
                stroke={top ? INK : '#fff'} strokeWidth={top ? 1.2 : 0.5} tabIndex={0} role="button" aria-label={`${d.name}, rank ${d.rank}`} style={{ cursor: 'pointer' }}
                onClick={() => onSelect(d.influencer_id)} onKeyDown={e => e.key === 'Enter' && onSelect(d.influencer_id)}
                onMouseEnter={() => show(m.l + x(d.views), m.t + y(d.match) - r(d.followers), `<b>${esc(d.name)}</b> (#${d.rank})<br/>${esc(d.platform)} · ${fmt.k(d.followers)} followers<br/>${fmt.n(d.views)} median promo views<br/>Engagement ${d.engagement}% · Overall ${d.overall.toFixed(0)}`)}
                onFocus={() => show(m.l + x(d.views), m.t + y(d.match) - r(d.followers), `<b>${esc(d.name)}</b> (#${d.rank})<br/>${fmt.n(d.views)} views · overall ${d.overall.toFixed(0)}`)}
                onMouseLeave={hide} onBlur={hide} />
            )
          })}
        </g>
      </svg>
      <p className="mt-1 text-xs text-muted"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: BRAND }} /> Top 5 by overall score · bubble size = followers (not used for ranking)</p>
      <Tip tip={tip} />
    </div>
  )
}

// ------------------------------------------------------------------ Chart 4 (optional): demographic alignment
export function DemographicChart({ data }: { data: Analytics['demographics'] }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const { tip, show, hide } = useTooltip()
  const segs = data.segments
  const h = 240, m = { l: 36, r: 8, t: 8, b: 30 }
  const x0 = d3.scaleBand().domain(segs).range([0, w - m.l - m.r]).padding(0.25)
  const x1 = d3.scaleBand().domain(['target', 'avg']).range([0, x0.bandwidth()]).padding(0.1)
  const max = Math.max(10, d3.max(segs, s => Math.max(data.target[s] ?? 0, data.shortlist_average[s] ?? 0))!)
  const y = d3.scaleLinear().domain([0, max * 1.1]).range([h - m.t - m.b, 0])
  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
      <svg width={w} height={h} role="img" aria-label="Target age distribution versus shortlist average audience">
        <g transform={`translate(${m.l},${m.t})`}>
          {y.ticks(4).map(t => <g key={t}><line x1={0} x2={w - m.l - m.r} y1={y(t)} y2={y(t)} stroke={GRID} /><text x={-6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#5c6b73">{t}%</text></g>)}
          {segs.map(s => (
            <g key={s} transform={`translate(${x0(s)},0)`}>
              {([['target', data.target[s] ?? 0, '#d3dde2', 'Target'], ['avg', data.shortlist_average[s] ?? 0, BRAND, 'Shortlist avg']] as const).map(([k, v, c, label]) => (
                <rect key={k} x={x1(k)} y={y(v)} width={x1.bandwidth()} height={h - m.t - m.b - y(v)} fill={c} rx={3}
                  onMouseEnter={() => show(m.l + (x0(s) ?? 0) + (x1(k) ?? 0) + x1.bandwidth() / 2, m.t + y(v), `<b>${s}</b><br/>${label}: ${v.toFixed(1)}%`)} onMouseLeave={hide} />
              ))}
              <text x={x0.bandwidth() / 2} y={h - m.t - m.b + 16} textAnchor="middle" fontSize={11} fill="#5c6b73">{s}</text>
            </g>
          ))}
        </g>
      </svg>
      <p className="text-xs text-muted"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#d3dde2]" /> Target (even split across chosen segments) · <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: BRAND }} /> Average audience of top-10 shortlist</p>
      <Tip tip={tip} />
    </div>
  )
}
