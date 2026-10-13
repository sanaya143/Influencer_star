// Table views for the analytics charts: sortable, keyboard-accessible, with inline bars so the numbers stay
// scannable. These are the default views for the score breakdown and the fit-vs-performance comparison.
import * as d3 from 'd3'
import { useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { Analytics } from '../api'
import { CRITERIA_LABELS, fmt } from '../api'
import { Avatar, Badge, Button, EmptyState } from '../shared/ui'
import { CRITERIA, SERIES } from './charts'

type Dir = 1 | -1
interface Sort { key: string; dir: Dir }

function SortTh({ label, k, sort, onSort, numeric = true, swatch, firstDir = -1, className = '' }: {
  label: ReactNode; k: string; sort: Sort; onSort: (s: Sort) => void; numeric?: boolean; swatch?: string; firstDir?: Dir; className?: string
}) {
  const on = sort.key === k
  const Icon = !on ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown
  return (
    <th scope="col" aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={`${numeric ? 'num' : ''} ${className}`}>
      <button type="button" onClick={() => onSort({ key: k, dir: on ? (-sort.dir as Dir) : firstDir })}
        className={`inline-flex items-center gap-1.5 uppercase tracking-[0.04em] transition-colors hover:text-ink ${on ? 'text-ink' : ''} ${numeric ? 'flex-row-reverse' : ''}`}>
        <Icon size={12} aria-hidden="true" className={on ? 'text-brand-ink' : 'opacity-50'} />
        <span className="inline-flex items-center gap-1.5">{swatch && <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: swatch }} />}{label}</span>
      </button>
    </th>
  )
}

const MiniBar = ({ pct, color = 'var(--series-1)', width = 'w-14' }: { pct: number; color?: string; width?: string }) => (
  <span className={`block h-1.5 overflow-hidden rounded-full bg-ice ${width}`} aria-hidden="true">
    <motion.span initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }} transition={{ duration: 0.5 }} className="block h-full rounded-full" style={{ background: color }} />
  </span>
)

function sortRows<T>(rows: T[], sort: Sort, value: (r: T, k: string) => number | string): T[] {
  return [...rows].sort((a, b) => {
    const va = value(a, sort.key), vb = value(b, sort.key)
    return (typeof va === 'string' ? va.localeCompare(String(vb)) : va - (vb as number)) * sort.dir
  })
}

// ------------------------------------------------------------------ score breakdown, top 10
export function BreakdownTable({ data, onSelect }: { data: Analytics['breakdown']; onSelect: (id: string) => void }) {
  const rows = data.slice(0, 10)
  const [sort, setSort] = useState<Sort>({ key: 'rank', dir: 1 })
  const colMax = useMemo(() => Object.fromEntries(CRITERIA.map(k => [k, d3.max(rows, r => r.contributions[k] ?? 0) || 1])), [rows])
  if (!rows.length) return <EmptyState title="No ranked creators" hint="Relax the thresholds to see a score breakdown." />
  const value = (r: (typeof rows)[number], k: string) => k === 'rank' ? r.rank : k === 'name' ? r.name : k === 'overall' ? r.overall : r.contributions[k] ?? 0
  const sorted = sortRows(rows, sort, value)
  return (
    <div className="scrollbar-thin overflow-x-auto rounded-xl border border-line">
      <table className="dense w-full min-w-[920px]">
        <caption className="sr-only">Weighted points each criterion adds to the overall score for the top 10 creators. Select a creator to open the profile.</caption>
        <thead className="bg-ice">
          <tr>
            <SortTh label="Rank" k="rank" sort={sort} onSort={setSort} numeric={false} firstDir={1} />
            <SortTh label="Creator" k="name" sort={sort} onSort={setSort} numeric={false} firstDir={1} className="sticky left-0 z-[1] bg-ice" />
            {CRITERIA.map(k => <SortTh key={k} label={CRITERIA_LABELS[k]} k={k} sort={sort} onSort={setSort} swatch={SERIES[k]} />)}
            <SortTh label="Overall" k="overall" sort={sort} onSort={setSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <motion.tr key={r.influencer_id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
              className="group cursor-pointer transition-colors hover:bg-ice" onClick={() => onSelect(r.influencer_id)}>
              <td><span className={`tabular inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-bold ${r.rank <= 3 ? 'bg-brand text-on-brand' : 'bg-ice'}`}>{r.rank}</span></td>
              <th scope="row" className="sticky left-0 z-[1] bg-surface text-left font-medium normal-case tracking-normal text-ink transition-colors group-hover:bg-ice">
                <button type="button" onClick={e => { e.stopPropagation(); onSelect(r.influencer_id) }} className="flex items-center gap-2 text-left hover:text-brand-ink">
                  <Avatar name={r.name} size={26} /><span className="whitespace-nowrap">{r.name}</span>
                </button>
              </th>
              {CRITERIA.map(k => {
                const v = r.contributions[k] ?? 0
                const best = v === colMax[k]
                return (
                  <td key={k} className="num">
                    <span className="flex flex-col items-end gap-1">
                      <span className={best ? 'font-bold' : ''}>{v.toFixed(1)}</span>
                      <MiniBar pct={(v / colMax[k]) * 100} color={SERIES[k]} width="w-12" />
                    </span>
                  </td>
                )
              })}
              <td className="num">
                <span className="flex flex-col items-end gap-1">
                  <span className="text-base font-bold">{r.overall.toFixed(1)}</span>
                  <span className="flex h-2 w-28 gap-px overflow-hidden rounded-full bg-ice" aria-hidden="true">
                    {CRITERIA.map(k => <span key={k} className="h-full" style={{ width: `${(r.contributions[k] ?? 0)}%`, background: SERIES[k] }} />)}
                  </span>
                </span>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-3 py-2 text-xs text-muted">Points are each sub-score multiplied by its weight, so a row adds up to the overall score. The highest value in each column is bold. Select a creator to open the full profile.</p>
    </div>
  )
}

// ------------------------------------------------------------------ audience fit vs promotional performance
const QUADRANTS = {
  sweet: { label: 'Sweet spot', hint: 'match ≥ 70 and above-median views', tone: 'ok' as const },
  fit: { label: 'Strong fit, smaller reach', hint: 'match ≥ 70, below-median views', tone: 'brand' as const },
  reach: { label: 'Big reach, weaker fit', hint: 'match < 70, above-median views', tone: 'neutral' as const },
  low: { label: 'Below both', hint: 'match < 70, below-median views', tone: 'neutral' as const },
}
type Quadrant = keyof typeof QUADRANTS
const PAGE = 12

export function ScatterTable({ data, onSelect }: { data: Analytics['scatter']; onSelect: (id: string) => void }) {
  const [sort, setSort] = useState<Sort>({ key: 'rank', dir: 1 })
  const [quad, setQuad] = useState<Quadrant | ''>('')
  const [page, setPage] = useState(1)
  const meta = useMemo(() => {
    const median = d3.median(data, d => d.views) ?? 0
    const lo = Math.log10(Math.max(1, d3.min(data, d => d.views) ?? 1)), hi = Math.log10(Math.max(10, d3.max(data, d => d.views) ?? 10))
    const top5 = new Set([...data].sort((a, b) => a.rank - b.rank).slice(0, 5).map(d => d.influencer_id))
    const quadOf = (d: (typeof data)[number]): Quadrant => d.match >= 70 ? (d.views >= median ? 'sweet' : 'fit') : (d.views >= median ? 'reach' : 'low')
    const counts = data.reduce((acc, d) => { acc[quadOf(d)]++; return acc }, { sweet: 0, fit: 0, reach: 0, low: 0 } as Record<Quadrant, number>)
    return { median, lo, hi, top5, quadOf, counts }
  }, [data])
  if (!data.length) return <EmptyState title="No candidates" hint="Relax the thresholds or change the audience requirements." />
  const value = (d: (typeof data)[number], k: string): number | string => (k === 'name' ? d.name : (d as unknown as Record<string, number>)[k])
  const filtered = quad ? data.filter(d => meta.quadOf(d) === quad) : data
  const sorted = sortRows(filtered, sort, value)
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE))
  const cur = Math.min(page, pages)
  const rows = sorted.slice((cur - 1) * PAGE, cur * PAGE)
  const setSortAndReset = (s: Sort) => { setSort(s); setPage(1) }
  const logPct = (v: number) => ((Math.log10(Math.max(1, v)) - meta.lo) / Math.max(0.001, meta.hi - meta.lo)) * 100
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by quadrant">
        {([['', `All (${fmt.n(data.length)})`], ...(Object.keys(QUADRANTS) as Quadrant[]).map(q => [q, `${QUADRANTS[q].label} (${fmt.n(meta.counts[q])})`])] as [Quadrant | '', string][]).map(([q, label]) => (
          <button key={q || 'all'} type="button" aria-pressed={quad === q} onClick={() => { setQuad(q); setPage(1) }} title={q ? QUADRANTS[q].hint : undefined}
            className={`relative rounded-full border px-3 py-1 text-xs font-medium transition-colors ${quad === q ? 'border-brand text-on-brand' : 'border-line hover:border-brand/60'}`}>
            {quad === q && <motion.span layoutId="quad-chip" className="absolute inset-0 rounded-full bg-brand" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>
      <div className="scrollbar-thin overflow-x-auto rounded-xl border border-line">
        <table className="dense w-full min-w-[880px]">
          <caption className="sr-only">Ranked creators: median promotional views against audience and product match. Median views across ranked creators: {fmt.n(meta.median)}.</caption>
          <thead className="bg-ice">
            <tr>
              <SortTh label="Rank" k="rank" sort={sort} onSort={setSortAndReset} numeric={false} firstDir={1} />
              <SortTh label="Creator" k="name" sort={sort} onSort={setSortAndReset} numeric={false} firstDir={1} className="sticky left-0 z-[1] bg-ice" />
              <SortTh label="Median promo views" k="views" sort={sort} onSort={setSortAndReset} />
              <SortTh label="Audience & product match" k="match" sort={sort} onSort={setSortAndReset} />
              <SortTh label="Followers" k="followers" sort={sort} onSort={setSortAndReset} />
              <SortTh label="Engagement" k="engagement" sort={sort} onSort={setSortAndReset} />
              <SortTh label="Overall" k="overall" sort={sort} onSort={setSortAndReset} />
              <th scope="col">Position</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d, i) => {
              const q = meta.quadOf(d)
              return (
                <motion.tr key={d.influencer_id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                  className="group cursor-pointer transition-colors hover:bg-ice" onClick={() => onSelect(d.influencer_id)}>
                  <td><span className={`tabular inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-bold ${meta.top5.has(d.influencer_id) ? 'bg-brand text-on-brand' : 'bg-ice'}`}>{d.rank}</span></td>
                  <th scope="row" className="sticky left-0 z-[1] bg-surface text-left font-medium normal-case tracking-normal text-ink transition-colors group-hover:bg-ice">
                    <button type="button" onClick={e => { e.stopPropagation(); onSelect(d.influencer_id) }} className="flex items-center gap-2 text-left hover:text-brand-ink">
                      <Avatar name={d.name} size={26} />
                      <span><span className="block whitespace-nowrap">{d.name}</span><span className="block text-[11px] font-normal text-muted">{d.platform}{d.is_micro ? ' · micro' : ''}</span></span>
                    </button>
                  </th>
                  <td className="num"><span className="flex flex-col items-end gap-1"><span>{fmt.n(d.views)}</span><MiniBar pct={logPct(d.views)} width="w-16" /></span></td>
                  <td className="num"><span className="flex flex-col items-end gap-1"><span className={d.match >= 70 ? 'font-semibold' : ''}>{d.match.toFixed(0)}</span><MiniBar pct={d.match} width="w-16" /></span></td>
                  <td className="num">{fmt.k(d.followers)}</td>
                  <td className="num">{fmt.pct(d.engagement)}</td>
                  <td className="num text-base font-bold">{d.overall.toFixed(1)}</td>
                  <td><Badge tone={QUADRANTS[q].tone}>{QUADRANTS[q].label}</Badge></td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-muted">
          <span>Median promo views across ranked creators: <b className="text-ink">{fmt.n(meta.median)}</b>. View bars use a log scale. Follower count is not part of the ranking.</span>
          {pages > 1 && (
            <span className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>Previous</Button>
              <span className="tabular">Page {cur} of {pages}</span>
              <Button size="sm" variant="outline" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>Next</Button>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
