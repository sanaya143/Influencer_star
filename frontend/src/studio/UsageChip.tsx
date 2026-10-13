import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Coins, Settings as Cog, TriangleAlert } from 'lucide-react'
import { api, fmt, type ModelPrice, type UsageSummary } from '../api'
import { Segmented, Skeleton } from '../shared/ui'
import { SETTINGS_EVENT } from './ModelChip'

type Period = '1' | '7' | '30'
const PERIOD_LABEL: Record<Period, string> = { '1': 'today', '7': 'the last 7 days', '30': 'the last 30 days' }
const priceText = (p: ModelPrice | null) => (p == null ? 'no price set' : p.input === 0 && p.output === 0 ? `free (${p.source})` : `$${p.input} in / $${p.output} out per 1M`)
const cost = (v: number, unpriced: number) => (unpriced && !v ? 'unpriced' : fmt.usd(v) + (unpriced ? '+' : ''))

/** Header dropdown: tokens used by the agents and the chat, and what they cost. */
export default function UsageChip() {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState<Period>('30')
  const [data, setData] = useState<UsageSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const nav = useNavigate()

  useEffect(() => {
    let live = true
    const load = () => api<UsageSummary>(`/usage/summary?days=${period}`).then(d => { if (live) { setData(d); setError(null) } }).catch(e => live && setError((e as Error).message))
    load()
    const t = setInterval(load, open ? 8000 : 30000)
    window.addEventListener(SETTINGS_EVENT, load)
    return () => { live = false; clearInterval(t); window.removeEventListener(SETTINGS_EVENT, load) }
  }, [period, open])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const t = data?.totals
  const maxAgent = Math.max(1, ...(data?.by_agent.map(a => a.total_tokens) ?? [1]))
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={t ? `Token usage, ${PERIOD_LABEL[period]}: ${t.total_tokens.toLocaleString('en-GB')} tokens, ${cost(t.cost_usd, t.unpriced_calls)}` : 'Token usage'}
        className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-xs font-medium transition-colors hover:border-brand">
        <Coins size={15} aria-hidden="true" className="text-brand-ink" />
        {t ? <><span className="tabular">{fmt.k(t.total_tokens)}</span><span className="hidden text-muted sm:inline">tokens ·</span><span className="tabular hidden sm:inline">{cost(t.cost_usd, t.unpriced_calls)}</span></> : <span className="text-muted">…</span>}
        <ChevronDown size={14} aria-hidden="true" className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-label="Token usage and cost" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.16 }}
            className="shadow-pop scrollbar-thin absolute right-0 top-11 z-40 max-h-[min(78vh,640px)] w-[min(26rem,92vw)] origin-top-right overflow-y-auto rounded-2xl border border-line bg-raised p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Token usage & cost</p>
              <Segmented size="sm" label="Period" value={period} onChange={setPeriod} options={[{ value: '1', label: 'Today' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }]} />
            </div>
            {error && <p className="mt-3 text-xs text-red-700 dark:text-red-300">{error}</p>}
            {!data || !t ? <Skeleton className="mt-3 h-40" /> : (
              <>
                <dl className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-ice p-3"><dt className="text-[11px] text-muted">Tokens</dt><dd className="tabular text-xl font-semibold">{fmt.n(t.total_tokens)}</dd>
                    <dd className="tabular text-[11px] text-muted">{fmt.n(t.input_tokens)} in · {fmt.n(t.output_tokens)} out</dd></div>
                  <div className="rounded-xl bg-ice p-3"><dt className="text-[11px] text-muted">Cost (USD)</dt><dd className="tabular text-xl font-semibold">{fmt.usd(t.cost_usd)}</dd>
                    <dd className="text-[11px] text-muted">{t.calls} model call{t.calls === 1 ? '' : 's'}{t.unpriced_calls ? ` · ${t.unpriced_calls} unpriced` : ''}</dd></div>
                </dl>
                {t.estimated_tokens && <p className="mt-2 text-[11px] text-muted">Some counts are estimates (~4 characters per token) because the provider did not report usage.</p>}
                {data.unpriced_models.length > 0 && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-400/30 dark:bg-amber-400/10">
                    <TriangleAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" />
                    <span>No price for {data.unpriced_models.join(', ')}, so its cost is not counted. <Link to="/admin/settings#prices" onClick={() => setOpen(false)} className="font-semibold text-brand-ink hover:underline">Add a price</Link></span></p>
                )}

                <h3 className="mt-4 text-xs font-semibold text-muted">By source</h3>
                {data.by_source.length ? <ul className="mt-1 divide-y divide-line">{data.by_source.map(s => (
                  <li key={s.source} className="flex items-center justify-between gap-2 py-1.5 text-xs"><span>{s.source} <span className="text-muted">· {s.calls}</span></span>
                    <span className="tabular text-right">{fmt.n(s.total_tokens)} · <b>{cost(s.cost_usd, s.unpriced_calls)}</b></span></li>))}</ul>
                  : <p className="mt-1 text-xs text-muted">No model calls in {PERIOD_LABEL[period]}. Offline (rule-based) runs use no tokens.</p>}

                {data.by_model.length > 0 && <>
                  <h3 className="mt-4 text-xs font-semibold text-muted">By model</h3>
                  <ul className="mt-1 space-y-1.5">{data.by_model.map(m => (
                    <li key={m.model} className="rounded-lg border border-line px-2.5 py-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2"><span className="truncate font-mono font-semibold">{m.model}</span><span className="tabular shrink-0">{fmt.n(m.total_tokens)} · <b>{cost(m.cost_usd, m.unpriced_calls)}</b></span></div>
                      <p className="text-[11px] text-muted">{priceText(m.price)}</p></li>))}</ul>
                </>}

                {data.by_agent.length > 0 && <>
                  <h3 className="mt-4 text-xs font-semibold text-muted">By agent</h3>
                  <ul className="mt-1 space-y-1">{data.by_agent.map(a => (
                    <li key={a.agent} className="text-xs"><div className="flex justify-between gap-2"><span>{a.agent}</span><span className="tabular text-muted">{fmt.n(a.total_tokens)}</span></div>
                      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-ice"><div className="h-full rounded-full bg-brand" style={{ width: `${(a.total_tokens / maxAgent) * 100}%` }} /></div></li>))}</ul>
                </>}

                {data.recent.length > 0 && <>
                  <h3 className="mt-4 text-xs font-semibold text-muted">Latest calls</h3>
                  <ul className="mt-1 divide-y divide-line">{data.recent.map(r => (
                    <li key={r.id}><Link to={r.link} onClick={() => setOpen(false)} className="flex items-center justify-between gap-2 py-1.5 text-xs hover:text-brand-ink">
                      <span className="min-w-0"><span className="block truncate">{r.label}</span><span className="text-[11px] text-muted">{r.kind} · {fmt.ago(r.at)}</span></span>
                      <span className="tabular shrink-0 text-right">{fmt.n(r.in + r.out)}<span className="block text-[11px] text-muted">{r.cost_usd == null ? 'unpriced' : fmt.usd(r.cost_usd)}</span></span></Link></li>))}</ul>
                </>}

                <p className="mt-3 text-[11px] text-muted">Current model: <span className="font-mono">{data.current_model ?? 'none (offline)'}</span>{data.current_model ? ` · ${priceText(data.current_price)}` : ''}. {data.note}</p>
                <button type="button" onClick={() => { setOpen(false); nav('/admin/settings#prices') }}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-xs font-semibold transition-colors hover:border-brand hover:bg-ice">
                  <Cog size={14} aria-hidden="true" />Model prices
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
